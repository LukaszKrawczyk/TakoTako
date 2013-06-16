var express     = require('express'),
    http        = require('http'),
    events      = require('events'),
    coreUtil    = require('util'),
    timers      = require('timers'),
    utils       = require('./utils');

function Takotako() { events.EventEmitter.call(this); }
coreUtil.inherits(Takotako, events.EventEmitter);
/*************************************************************************/

/**
 * Takotako module
 *
 * Connection events:
 * - request            -> {req: {}}
 * - response           -> {res: {}}
 * - selectingServer    -> {server: {}}
 *
 * Monitoring events:
 * - monitoring     -> {serverStatus: [], date: ""}
 * - healthy        -> {server: {}, date: ""}
 * - unhealthy      -> {server: {}, error : {}, date: ""}
 * - recovery       -> {server: {}, date: ""}
 *
 * Control events:
 * - start          -> {date: ""}
 * - error          -> {}
 *
 * @author Lukasz Krawczyk <contact@lukaszkrawczyk.eu>
 * @copyright Lukasz Krawczyk
 */

Takotako.prototype = utils.extend(Takotako.prototype, {
    // express server instance handler
    serverHandler : null,
    // array of servers with probabilities
    servers : {},
    // monitoring
    monitoring : true,
    // monitoring interval
    monitoringInterval : 1000,
    // monitoring path / url
    monitoringPath : '/',
    // server statuses
    serverStatus : {},

    /**
     * Initalization
     */
    init : function() {
        // create server
        this.serverHandler = express();
        // start monitoring
        if (this.monitoring)
            this.startMonitoring();
    },

    /**
     * Initalization
     */
    set : function(params) {
        for (param in params)
            this[param] = params[param];
        return this;
    },

    /**
     * Starting monitoring
     */
    startMonitoring : function() {
        var self = this;

        timers.setInterval(function(){
            // check all servers status
            for (var serverId in self.servers) {
                self.checkServer(serverId);
            }
            // emit monitoring event with results
            self.emit('monitoring', {
                serverStatus: self.serverStatus,
                date: utils.getTimestamp()
            });
        }, self.monitoringInterval);
    },

    /**
     * Checking server
     *
     * @param {string} serverId
     */
    checkServer : function(serverId) {
        var self = this,
            server = this.servers[serverId],
            reqOptions = {
                host    : server.ip,
                path    : self.monitoringPath,
                port    : '80',
                method  : 'HEAD'
            };

        // server status initialization
        if (utils.isNull(self.serverStatus[serverId])) {
            self.serverStatus[serverId] = {
                previous : null,
                current  : null
            };
        }

        // connection successfull - server healthy (or recovered)
        var req = http.request(reqOptions, function(res) {
            var status = (self.serverStatus[serverId]['current'] === 'unhealthy')
                    ? 'recovery'
                    : 'healthy';
            self.updateServerStatus(serverId, status);
            self.emit(status, {
                serverId: serverId,
                server  : server,
                date    : utils.getTimestamp()
            });
        });

        // connection error - server unhealthy
        req.on('error', function(e) {
            var status = 'unhealthy';
            self.updateServerStatus(serverId, status);
            self.emit(status, {
                serverId: serverId,
                server  : server,
                error   : e,
                date    : utils.getTimestamp()
            });
        });
        req.end();
    },

    /**
     * Updating monitoring status
     *
     * @param {string} serverId
     * @param {string} status
     */
    updateServerStatus: function(serverId, status) {
        this.serverStatus[serverId]['previous'] = this.serverStatus[serverId]['current'];
        this.serverStatus[serverId]['current'] = status;
    },

    /**
     * Starting balancer
     *
     * @param {int} port
     */
    listen : function(port) {
        if (!this.serverHandler)
            this.init();

        // listen on port
        this.serverHandler.listen(port);

        // proxy for all HTTP requests
        // in case monitoring is turned on, wait for first check
        if (this.monitoring) {
            this.once('monitoring', this.proxy);
        } else {
            this.proxy();
        }
    },

    /**
     * Proxy action
     *
     * TODO: refactorization
     */
    proxy : function() {
        var self = this;

        // emit started event
        self.emit('started', {date: utils.getTimestamp()});

        // listen to all HTTP requests
        self.serverHandler.all('*', function(req, res){
            console.time('request');
            // emit request event
            self.emit('request', req);

            // choose server and send request
            self.getRandomServer(function(server){

                // prepare http request options
                var options = {
                    host    : server.ip,
                    path    : req.url,
                    port    : '80',
                    headers : req.headers,
                    method  : req.method
                };

                // emit server select event
                self.emit('selectingServer', {
                    server  : server,
                    date    : utils.getTimestamp()
                });

                // send request to chosen server
                var proxyReq = http.request(options, function(proxyRes, resObject) {
                    var data = '';
                    proxyRes.setEncoding('binary');

                    // collecting data
                    proxyRes.on('data', function(chunk) {
                        data += chunk;
                    });

                    // sending data
                    proxyRes.on('end', function() {
                        // set response headers and send result to client
                        res.set(proxyRes.headers);
                        res.send(new Buffer(data, 'binary'));
                        console.timeEnd('request');
                        // emit response event
                        self.emit('response', {
                            server  : server,
                            response: res,
                            content : data,
                            date    : utils.getTimestamp()});
                        });
                });
                proxyReq.end();

                // in case of fatal error, emit error event
                proxyReq.on('error', function(e) {
                    self.emit('error', {
                        error: e,
                        date : utils.getTimestamp()
                    });
                });
            });

        });
    },

    /**
     * Get random server (based on probability)
     * TODO: refactorization
     * @return {mixed}
     */
    getRandomServer : function(callback) {
        var rand = utils.random(0, 99),
            sum = 0,
            serverId = null,
            server = null;

        if (this.servers.length === 0) return null;

        // find server according to probability settings
        for (serverId in this.servers) {
            server = this.servers[serverId];
            sum += server.probability;
            if (sum > rand)
                break;
        }

        // if chosen server is not available, try to find another
        if (!this.isHealthy(serverId)) {
            for (serverId in this.servers) {
                if (this.isHealthy(serverId)) {
                    callback(this.servers[serverId]);
                    return;
                }
            }
        } else {
            callback(server);
            return;
        }

        // if all servers are not available, wait until healthy server appear
        this.once('healthy', function(data){
            callback(data.server);
            return;
        });
    },

    /**
     * Check is server healthy
     *
     * @return {bool}
     */
    isHealthy : function(serverId) {
        return (!utils.isNull(this.serverStatus[serverId])
                && this.serverStatus[serverId]['current'] === 'healthy');
    }
});

/*************************************************************************/
module.exports = new Takotako();