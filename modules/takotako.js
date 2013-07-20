var express     = require('express'),
    http        = require('http'),
    events      = require('events'),
    coreUtil    = require('util'),
    timers      = require('timers'),
    utils       = require('./utils'),
    memcachedModule = require('memcached');

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
 * - monitoring     -> {serverId: "", serverStatus: {}, date: ""}
 * - healthy        -> {serverId: "", date: ""}
 * - unhealthy      -> {serverId: "", error : {}, date: ""}
 * - recovery       -> {serverId: "", date: ""}
 * - healthcheck    -> {serverId: "", status: "", error: {}, date: ""}
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
    // monitoring port
    monitoringPort : 80,
    // memcache server
    memcached : null,

    /**
     * Initalization
     */
    init : function() {
        // create server
        this.serverHandler = express();
        // start monitoring
        if (this.monitoring) {
            // turn on memcached client
            // TODO error handling in case of memcache server error
            this.memcached = new memcachedModule('127.0.0.1:11211');
            this.memcached.on('failure', function( details ){
                throw new Error( "Server " + details.server + "went down due to: " + details.messages.join( '' ) );
            });
            this.memcached.on('reconnecting', function( details ){
                throw new Error( "Total downtime caused by server " + details.server + " :" + details.totalDownTime + "ms");
            });
            this.startMonitoring();
        }
    },

    /**
     * Initalization
     */
    set : function(params) {
        for (param in params)
            this[param] = params[param];
        return this;
    },

    /************************************* monitoring *************************************/

    /**
     * Starting monitoring
     *
     * @listen healthcheck
     */
    startMonitoring : function() {
        var self = this;

        // add 'healthcheck' event listener
        this.on('healthcheck', function(data){
            self.updateServerStatus(data.serverId, data.status, data.error);
        });

        var serverIds = [];
        for (var serverId in self.servers) {
            serverIds.push(serverId);
        }

        // check all servers' status
        timers.setInterval(function(){
            // random monitoring guarantees that in case of failover, first random healthy server will be chosen
            var rand = utils.random(0, serverIds.length - 1);
            self.checkServer(serverIds[rand]);
        }, self.monitoringInterval);
    },

    /**
     * Checking server
     *
     * @param {string} serverId
     */
    checkServer : function(serverId) {
        var self = this;

        self.getServerStatus(serverId, function (err, result) {
            // if status is not set, initialize
            if (!result) {
                self.resetServerStatus(serverId, function(){
                    self.healthcheckRequest(serverId);
                });
            } else {
                self.healthcheckRequest(serverId);
            }
        });
    },

    /**
     * Sending health check request to given server
     *
     * @param {string} serverId
     * @emits healthcheck | error
     */
    healthcheckRequest : function(serverId) {
        var self = this,
            server = self.servers[serverId],
            reqOptions = {
                host   : server.ip,
                path   : self.monitoringPath,
                port   : '80',
                method : 'HEAD'
            };

        try {
            // connection successfull - server healthy (or recovered)
            var req = http.request(reqOptions, function(res) {
                self.emit('healthcheck', {
                    serverId : serverId,
                    status   : 'healthy',
                    error    : null,
                    date     : utils.getTimestamp()
                });
            });

            // connection error - server unhealthy
            req.on('error', function(e) {
                self.emit('healthcheck', {
                    serverId : serverId,
                    status   : 'unhealthy',
                    error    : e,
                    date     : utils.getTimestamp()
                });
            });

            // finish request
            req.end();
        } catch(e) {
             // error handling
             self.emit('error', {
                error : e,
                date  : utils.getTimestamp()
            });
        }
    },

    /**
     * Updating monitoring status of given server
     *
     * @param {string} serverId
     * @param {string} status - healthy | unhealthy
     * @param {string} error - only in case of 'unhealthy' status
     * @emits healthy | recovery | unhealthy | monitoring
     */
    updateServerStatus: function(serverId, status, error) {
        var self = this;

        // get previous status
        self.getServerStatus(serverId, function(err, result){
            // if status changing from unhealthy to healthy, change status name to recovery
            if (status == 'healthy' && result.current == 'unhealthy') status = 'recovery';

            var serverStatus = {
                previous: result.current,
                current: status
            };

            // save current server status
            self.setServerStatus(serverId, serverStatus, function(err, result){});

            var timestamp = utils.getTimestamp();

            // emit status event
            self.emit(status, {
                serverId: serverId,
                error   : error,
                date    : timestamp
            });

            // emit monitoring event with results
            self.emit('monitoring', {
                serverId: serverId,
                status  : serverStatus,
                date    : timestamp
            });
        });
    },

    /**
     * Server status initialization
     *
     * @param {string} serverId - server id
     * @param {callable} callback - callback function
     */
    resetServerStatus: function(serverId, callback) {
        var serverStatus = {
            previous: null,
            current: null
        };
        this.setServerStatus(serverId, serverStatus, function(e,r){
            callback();
        });
    },

    /**
     * Get last status of given server
     *
     * @param {string} serverId - server id
     * @param {callable} callback - callback function
     */
    getServerStatus: function(serverId, callback) {
        this.memcached.get('serverStatus_' + serverId, callback);
    },

    /**
     * Set last status of given server
     * Status is saved in memcache server, lifetime is set to infinity
     *
     * @param {string} serverId - server id
     * @param {callable} callback - callback function
     */
    setServerStatus: function(serverId, status, callback) {
        this.memcached.set('serverStatus_' + serverId, status, 0, callback);
    },

    /************************************* balancer *************************************/

    /**
     * Starting balancer
     *
     * @param {int} port
     * @throw Error
     * @listen healthy
     */
    listen : function(port) {
        var self = this;
        // check servers list
        if (this.servers.length === 0) {
            throw new Error('Configuration error: server list undefined');
            return null;
        }

        // check probability sum
        var sum = 0;
        Object.keys(this.servers).forEach(function(serverId){
            sum += self.servers[serverId].probability;
        });
        if (sum != 100)
            throw new Error('Configuration error: servers\' probability must sum up to 100');

        // initialize express server
        if (!this.serverHandler)
            this.init();

        // listen on port
        this.serverHandler.listen(port);

        // proxy for all HTTP requests
        // in case monitoring is turned on, wait for first healthy server
        if (this.monitoring)
            this.once('healthy', this.proxy);
        else
            this.proxy();
    },

    /**
     * Proxy action
     *
     * @emits started | request | selectingServer | response | error
     * @listen
     * TODO: refactorization
     */
    proxy : function() {
        var self = this;

        // emit started event
        self.emit('started', { date: utils.getTimestamp() });

        // listen to all HTTP requests
        self.serverHandler.all('*', function(req, res) {
            console.time('request');
            // emit request event
            self.emit('request', req);

            // choose server and send request
            self.getRandomServer(function(server) {

                // emit server select event
                self.emit('selectingServer', {
                    server : server,
                    date   : utils.getTimestamp()
                });

                // split host into ip and port
                var hostArr = server.host.split(':');

                // prepare http request
                var options = {
                    host    : hostArr[0],
                    path    : req.url,
                    port    : (hostArr[1]) ? hostArr[1] : 80,
                    headers : req.headers,
                    method  : req.method
                };

                try {
                    // transfer user request to chosen server and send back response
                    var proxyReq = http.request(options, function(proxyRes, resObject) {
                        var data = '';
                        proxyRes.setEncoding('binary');

                        // collecting data
                        proxyRes.on('data', function(chunk) {
                            data += chunk;
                        });

                        // sending result to user
                        proxyRes.on('end', function() {
                            // set response headers and send result to client
                            res.set(proxyRes.headers);
                            res.send(new Buffer(data, 'binary'));
                            console.timeEnd('request');
                            // emit response event
                            self.emit('response', {
                                server   : server,
                                response : res,
                                content  : data,
                                date     : utils.getTimestamp()
                            });
                        });
                    });

                    // in case of fatal error, emit error event
                    proxyReq.on('error', function(e) {
                        self.emit('error', {
                            error : e,
                            date  : utils.getTimestamp()
                        });
                    });

                    // finish request
                    proxyReq.end();
                } catch(e) {
                    // error handling
                    self.emit('error', {
                        error : e,
                        date  : utils.getTimestamp()
                    });
                }
            });
        });
    },

    /**
     * Get random healthy server
     * Choice is based on the probability,
     * if chosen server is not working, get first healthy server
     *
     * TODO
     * - failover should choose random server, not the next one
     * - unhelthy servers should be removed temporarly from available erver list
     *
     * @param {callable} callback - callback function
     */
    getRandomServer : function(callback) {
        var rand = utils.random(0, 99),
            sum = 0,
            serverId = server = null,
            self = this;

        // find server according to probability settings
        for (serverId in this.servers) {
            server = this.servers[serverId];
            if ((sum += server.probability) > rand)
                break;
        }

        // if monitoring is turned on, check server status
        if (this.monitoring) {
            this.getServerStatus(serverId, function(err, result) {
                if (result.current === 'healthy') {
                    // if serwer is working correctly, execute callback
                    callback(server);
                } else {
                    // wait for first healthy server
                    self.once('healthy', function(data) {
                        callback(self.servers[data.serverId]);
                    });
                }
            });
        } else {
            // if monitoring is not used, execute callback function
            callback(server);
        }
    }
});

/*************************************************************************/
module.exports = new Takotako();