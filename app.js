/**
 * TakoTako load balancer sample app
 *
 * @author Lukasz Krawczyk <contact@lukaszkrawczyk.eu>
 * @copyright Lukasz Krawczyk
 */
var balancer = require('./modules/takotako');

balancer.set({
    monitoring : true,
    monitoringInterval : 1000,
    servers : {
        'app1' : { host: '127.0.0.1', probability: 25 },
        'app2' : { host: '127.0.0.1', probability: 25 },
        'app3' : { host: '127.0.0.1', probability: 25 },
        'app4' : { host: '127.0.0.1', probability: 25 }
    }
});

balancer.on('unhealthy', function(data){
    console.log('unhealthy');
    console.log(data);
});

balancer.on('recovery', function(data){
    console.log('recovery');
    console.log(data);
});

balancer.on('error', function(data){
    console.log('error');
    console.log(data);
});

balancer.listen(3000);