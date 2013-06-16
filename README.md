# TakoTako - Lightweight load balancer in NodeJS #

## Features ##
- low latency (non blocking, event architecture)
- 9ms average request routing speed
- load balancing based on probability
- basic monitoring with events 'healthy', 'unhealthy', and 'recovery'
- various events for logging purposes
- automatic fallback to another server in case of error

## Requirements ##
- standard (built-in) node modules (http, events, util, timers, etc.)
- express server module

## Usage ##
```js
var balancer = require('./modules/takotako');

// define servers
balancer.set({
    servers : {
        'app1' : {ip: '127.0.0.1', probability: 25},
        'app2' : {ip: '127.0.0.1', probability: 25},
        'app3' : {ip: '127.0.0.1', probability: 25},
        'app4' : {ip: '127.0.0.1', probability: 25}
    }
});

// listen on port
balancer.listen(3000);
```

## Events ##

### Connection events ###
- request: contains [HTTPRequestObject](http://expressjs.com/api.html#request) with current date
- response: contains [HTTPResponseObject](http://expressjs.com/api.html#response) with current date
- selectingServer: contains information about selected server

### Monitoring events ###
- monitoring: contains statuses of all servers (healthy / unhealthy) with current date
- healthy: contains server details and current date
- unhealthy: contains server details, error details and current date
- recovery: contains server details and current date

### Control events ###
- start: event emited when balancer starts
- error: in case of other balancer errors

Date in all events is always formatted in ISO: "2013-06-16T07:06:59.969Z".

```js
var balancer = require('./modules/takotako');

balancer.set({...});

balancer.on('unhealthy', function(data){
    console.log('SOS!');
    console.log(data);
});

balancer.on('recovery', function(data){
    console.log('Repaired!');
    console.log(data);
});

balancer.on('request', function(data){
    console.log('Incomming request!');
    console.log(data);
});

balancer.listen(3000);
```

## Monitoring ##
```js
var balancer = require('./modules/takotako');

balancer.set({
    monitoring : true, // default to true
    monitoringInterval : 2000, // time in miliseconds
    monitoringPath : '/index.html', // path
    servers : {
        ...
    }
});

balancer.listen(3000);
```

## Further releases ##
- Speed up request routing within balancer (goal: 4ms)
- Improve balancer function (choose by probability / request per second)
- Monitoring and fallback improvement
- Server statistics and reporting
- Automatic attack detection