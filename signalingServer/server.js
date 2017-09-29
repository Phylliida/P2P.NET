"use strict";
var config = require("./config.json");
var http = require('http');
var https = require('https');
var ws = require('ws');
var fs = require('fs');
var wns = require('./WebsocketNetworkServer');
var port = process.env.PORT || 5000;
//setup
var httpServer = null;
var httpsServer = null;
if (config.httpConfig) {
    httpServer = http.createServer();
    httpServer.listen(port, function () { console.log('Listening on ' + httpServer.address().port); });
}
if (config.httpsConfig) {
    httpsServer = https.createServer({
        key: fs.readFileSync(config.httpsConfig.ssl_key_file),
        cert: fs.readFileSync(config.httpsConfig.ssl_cert_file)
    });
    httpsServer.listen(config.httpsConfig.port, function () { console.log('Listening on ' + httpsServer.address().port); });
}
var websocketSignalingServer = new wns.WebsocketNetworkServer();
for (var _i = 0, _a = config.apps; _i < _a.length; _i++) {
    var app = _a[_i];
    if (httpServer) {
        //perMessageDeflate: false needs to be set to faflse turning off the compression. if set to true
        //the websocket library crashes if big messages are received (eg.128mb) no matter which payload is set!!!
        var webSocket = new ws.Server({ server: httpServer, path: app.path, maxPayload: config.maxPayload, perMessageDeflate: false });
        websocketSignalingServer.addSocketServer(webSocket, app);
    }
    if (httpsServer) {
        var webSocketSecure = new ws.Server({ server: httpsServer, path: app.path, maxPayload: config.maxPayload, perMessageDeflate: false }); //problem in the typings -> setup to only accept http not https so cast to any to turn off typechecks
        websocketSignalingServer.addSocketServer(webSocketSecure, app);
    }
}
//# sourceMappingURL=server.js.map