"use strict";
var inet = require('./INetwork');
var WebsocketNetworkServer = (function () {
    function WebsocketNetworkServer() {
        this.sockets = {};
        this.curId = 0;
    }
    WebsocketNetworkServer.prototype.onConnection = function (socket) {
        this.sockets[this.curId] = socket;
        var thisSocketId = this.curId;
        this.curId += 1;
        var _this = this;
        
        console.log("connected");
        
        socket.on('message', function (message, flags) {
            console.log("got message " + message);
            for (var otherSocket in _this.sockets)
            {
              if (_this.sockets.hasOwnProperty(otherSocket))
              {
                try
                {
                  _this.sockets[otherSocket].send(message);
                }
                catch (err) {
                  console.warn("Error in sending message " + message + ":\n" + err);
                }
              }
            }
        });
        socket.on('error', function (error) {
            console.error(error);
        });
        socket.on('close', function (code, message) { 
          delete _this.sockets[thisSocketId];
          console.log("close");
        });
    };
    //
    WebsocketNetworkServer.prototype.addSocketServer = function (websocketServer, appConfig) {
        var _this = this;
        websocketServer.on('connection', function (socket) { _this.onConnection(socket); });
    };
    return WebsocketNetworkServer;
}());
exports.WebsocketNetworkServer = WebsocketNetworkServer;
