"use strict";
var inet = require('./INetwork');
var WebsocketNetworkServer = (function () {
    function WebsocketNetworkServer() {
        this.mPool = {};
    }
    WebsocketNetworkServer.prototype.onConnection = function (socket, appname) {
        //it would be possible to enforce the client to send a certain introduction first
        //to determine to which pool we add it -> for now only one pool is supported
        this.mPool[appname].add(socket);
    };
    //
    WebsocketNetworkServer.prototype.addSocketServer = function (websocketServer, appConfig) {
        var _this = this;
        if (this.mPool[appConfig.name] == null) {
            this.mPool[appConfig.name] = new PeerPool(appConfig);
        }
        var name = appConfig.name;
        websocketServer.on('connection', function (socket) { _this.onConnection(socket, name); });
    };
    return WebsocketNetworkServer;
}());
exports.WebsocketNetworkServer = WebsocketNetworkServer;
;
//Pool of client connects that are allowed to communicate to each other
var PeerPool = (function () {
    function PeerPool(config) {
        this.mConnections = new Array();
        this.mServers = {};
        this.mAddressSharing = false;
        this.maxAddressLength = 256;
        this.mAppConfig = config;
        if (this.mAppConfig.address_sharing) {
            this.mAddressSharing = this.mAppConfig.address_sharing;
        }
    }
    PeerPool.prototype.hasAddressSharing = function () {
        return this.mAddressSharing;
    };
    //add a new connection based on this websocket
    PeerPool.prototype.add = function (socket) {
        this.mConnections.push(new SignalingPeer(this, socket));
    };
    //Returns the SignalingClientConnection that opened a server using the given address
    //or null if address not in use
    PeerPool.prototype.getServerConnection = function (address) {
        return this.mServers[address];
    };
    //Tests if the address is available for use. 
    //returns true in the following cases
    //the address is longer than the maxAddressLength and the server the address is not yet in use or address sharing is active
    PeerPool.prototype.isAddressAvailable = function (address) {
        if (address.length <= this.maxAddressLength // only allow addresses shorter than maxAddressLength
            && (this.mServers[address] == null || this.mAddressSharing)) {
            return true;
        }
        return false;
    };
    //Adds the server. No checking is performed here! logic should be solely in the connection class
    PeerPool.prototype.addServer = function (client, address) {
        if (this.mServers[address] == null) {
            this.mServers[address] = new Array();
        }
        this.mServers[address].push(client);
    };
    //Removes an address from the server. No checks performed
    PeerPool.prototype.removeServer = function (client, address) {
        //supports address sharing. remove the client from the server list that share the address
        var index = this.mServers[address].indexOf(client);
        if (index != -1) {
            this.mServers[address].splice(index, 1);
        }
        //delete the whole list if the last one left
        if (this.mServers[address].length == 0) {
            delete this.mServers[address];
        }
    };
    //Removes a given connection from the pool
    PeerPool.prototype.removeConnection = function (client) {
        var index = this.mConnections.indexOf(client);
        if (index != -1) {
            this.mConnections.splice(index, 1);
        }
        else {
            console.warn("Tried to remove unknown SignalingClientConnection. Bug?" + client);
        }
    };
    PeerPool.prototype.count = function () {
        return this.mConnections.length;
    };
    return PeerPool;
}());
var SignalingConnectionState;
(function (SignalingConnectionState) {
    SignalingConnectionState[SignalingConnectionState["Uninitialized"] = 0] = "Uninitialized";
    SignalingConnectionState[SignalingConnectionState["Connecting"] = 1] = "Connecting";
    SignalingConnectionState[SignalingConnectionState["Connected"] = 2] = "Connected";
    SignalingConnectionState[SignalingConnectionState["Disconnecting"] = 3] = "Disconnecting";
    SignalingConnectionState[SignalingConnectionState["Disconnected"] = 4] = "Disconnected"; //means the instance is destroyed and unusable
})(SignalingConnectionState || (SignalingConnectionState = {}));
;
///note: all methods starting with "internal" might leave the system in an inconsistent state
///e.g. peerA is connected to peerB means peerB is connected to peerA but internalRemoveConnection
///could cause peerA being disconnected from peerB but peerB still thinking to be connected to peerA!!!
var SignalingPeer = (function () {
    function SignalingPeer(pool, socket) {
        var _this = this;
        this.mState = SignalingConnectionState.Uninitialized;
        this.mConnections = {};
        //C# version uses short so 16384 is 50% of the positive numbers (maybe might make sense to change to ushort or int)
        this.mNextIncomingConnectionId = new inet.ConnectionId(16384);
        this.mConnectionPool = pool;
        this.mSocket = socket;
        //(this.mSocket as any).maxPayload = 16;
        this.mState = SignalingConnectionState.Connecting;
        console.log("connected " + this.mSocket.upgradeReq.connection.remoteAddress + ":" + this.mSocket.upgradeReq.connection.remotePort);
        socket.on('message', function (message, flags) {
            _this.onMessage(message, flags);
        });
        socket.on('error', function (error) {
            console.error(error);
        });
        socket.on('close', function (code, message) { _this.onClose(code, message); });
        this.mState = SignalingConnectionState.Connected;
    }
    SignalingPeer.prototype.onMessage = function (message, flags) {
        try {
            //unlike browsers ws will give a Uint8Array
            var evt = inet.NetworkEvent.fromByteArray(message);
            console.log("Inc:" + message.length + " " + evt.toString());
            this.handleIncomingEvent(evt);
        }
        catch (err) {
            console.warn("Invalid message received: " + message + "  \n Error: " + err);
        }
    };
    SignalingPeer.prototype.sendToClient = function (evt) {
        //this method is also called during cleanup after a disconnect
        //check first if we are still connected
        //bugfix: apprently 2 sockets can be closed at exactly the same time without
        //onclosed being called immediately -> socket has to be checked if open
        if (this.mState == SignalingConnectionState.Connected
            && this.mSocket.readyState == this.mSocket.OPEN) {
            console.log("Out:" + evt.toString());
            var msg = inet.NetworkEvent.toByteArray(evt);
            this.mSocket.send(msg);
        }
    };
    SignalingPeer.prototype.onClose = function (code, error) {
        this.mState = SignalingConnectionState.Disconnecting;
        this.Cleanup();
    };
    //so far only used if the socket was disconnected
    SignalingPeer.prototype.Cleanup = function () {
        this.mConnectionPool.removeConnection(this);
        console.log("disconnected "
            + this.mSocket.upgradeReq.connection.remoteAddress
            + ":" + this.mSocket.upgradeReq.connection.remotePort
            + " " + this.mConnectionPool.count()
            + " connections left.");
        //disconnect all connections
        var test = this.mConnections; //workaround for not having a proper dictionary yet...
        for (var v in this.mConnections) {
            if (this.mConnections.hasOwnProperty(v))
                this.disconnect(new inet.ConnectionId(+v));
        }
        //make sure the server address is freed 
        if (this.mServerAddress != null) {
            this.stopServer();
        }
        this.mState = SignalingConnectionState.Disconnected;
    };
    SignalingPeer.prototype.handleIncomingEvent = function (evt) {
        //update internal state based on the event
        if (evt.Type == inet.NetEventType.NewConnection) {
            //client wants to connect to another client
            var address = evt.Info;
            //the id this connection should be addressed with
            var newConnectionId = evt.ConnectionId;
            this.connect(address, newConnectionId);
        }
        else if (evt.Type == inet.NetEventType.ConnectionFailed) {
        }
        else if (evt.Type == inet.NetEventType.Disconnected) {
            //peer tries to disconnect from another peer
            var otherPeerId = evt.ConnectionId;
            this.disconnect(otherPeerId);
        }
        else if (evt.Type == inet.NetEventType.ServerInitialized) {
            this.startServer(evt.Info);
        }
        else if (evt.Type == inet.NetEventType.ServerInitFailed) {
        }
        else if (evt.Type == inet.NetEventType.ServerClosed) {
            //stop server request
            this.stopServer();
        }
        else if (evt.Type == inet.NetEventType.ReliableMessageReceived) {
            this.sendData(evt.ConnectionId, evt.MessageData, true);
        }
        else if (evt.Type == inet.NetEventType.UnreliableMessageReceived) {
            this.sendData(evt.ConnectionId, evt.MessageData, false);
        }
    };
    SignalingPeer.prototype.internalAddIncomingPeer = function (peer) {
        //another peer connected to this (while allowing incoming connections)
        //store the reference
        var id = this.nextConnectionId();
        this.mConnections[id.id] = peer;
        //event to this (the other peer gets the event via addOutgoing
        this.sendToClient(new inet.NetworkEvent(inet.NetEventType.NewConnection, id, null));
    };
    SignalingPeer.prototype.internalAddOutgoingPeer = function (peer, id) {
        //this peer successfully connected to another peer. id was generated on the 
        //client side
        this.mConnections[id.id] = peer;
        //event to this (the other peer gets the event via addOutgoing
        this.sendToClient(new inet.NetworkEvent(inet.NetEventType.NewConnection, id, null));
    };
    SignalingPeer.prototype.internalRemovePeer = function (id) {
        delete this.mConnections[id.id];
        this.sendToClient(new inet.NetworkEvent(inet.NetEventType.Disconnected, id, null));
    };
    //test this. might cause problems
    //the number is converted to string trough java script but we need get back the number
    //for creating the connection id
    SignalingPeer.prototype.findPeerConnectionId = function (otherPeer) {
        for (var peer in this.mConnections) {
            if (this.mConnections[peer] === otherPeer) {
                return new inet.ConnectionId(+peer);
            }
        }
    };
    SignalingPeer.prototype.nextConnectionId = function () {
        var result = this.mNextIncomingConnectionId;
        this.mNextIncomingConnectionId = new inet.ConnectionId(this.mNextIncomingConnectionId.id + 1);
        return result;
    };
    //public methods (not really needed but can be used for testing or server side deubgging)
    //this peer initializes a connection to a certain address. The connection id is set by the client
    //to allow tracking of the connection attempt
    SignalingPeer.prototype.connect = function (address, newConnectionId) {
        var serverConnections = this.mConnectionPool.getServerConnection(address);
        //
        if (serverConnections != null && serverConnections.length == 1) {
            //inform the server connection about the new peer
            //events will be send by these methods
            //shared addresses -> connect to everyone listening
            serverConnections[0].internalAddIncomingPeer(this);
            this.internalAddOutgoingPeer(serverConnections[0], newConnectionId);
        }
        else {
            //if address is not in use or it is in multi join mode -> connection fails
            this.sendToClient(new inet.NetworkEvent(inet.NetEventType.ConnectionFailed, newConnectionId, null));
        }
    };
    //join connection happens if another user joins a multi address. it will connect to every address
    //listening to that room
    SignalingPeer.prototype.connectJoin = function (address) {
        var serverConnections = this.mConnectionPool.getServerConnection(address);
        //in join mode every connection is incoming as everyone listens together
        if (serverConnections != null) {
            for (var _i = 0, serverConnections_1 = serverConnections; _i < serverConnections_1.length; _i++) {
                var v = serverConnections_1[_i];
                if (v != this) {
                    v.internalAddIncomingPeer(this);
                    this.internalAddIncomingPeer(v);
                }
            }
        }
    };
    SignalingPeer.prototype.disconnect = function (connectionId) {
        var otherPeer = this.mConnections[connectionId.id];
        if (otherPeer != null) {
            var idOfOther = otherPeer.findPeerConnectionId(this);
            //find the connection id the other peer uses to talk to this one
            this.internalRemovePeer(connectionId);
            otherPeer.internalRemovePeer(idOfOther);
        }
        else {
        }
    };
    SignalingPeer.prototype.startServer = function (address) {
        //what to do if it is already a server?
        if (this.mServerAddress != null)
            this.stopServer();
        if (this.mConnectionPool.isAddressAvailable(address)) {
            this.mServerAddress = address;
            this.mConnectionPool.addServer(this, address);
            this.sendToClient(new inet.NetworkEvent(inet.NetEventType.ServerInitialized, inet.ConnectionId.INVALID, address));
            if (this.mConnectionPool.hasAddressSharing()) {
                //address sharing is active. connect to every endpoint already listening on this address
                this.connectJoin(address);
            }
        }
        else {
            this.sendToClient(new inet.NetworkEvent(inet.NetEventType.ServerInitFailed, inet.ConnectionId.INVALID, address));
        }
    };
    SignalingPeer.prototype.stopServer = function () {
        if (this.mServerAddress != null) {
            this.mConnectionPool.removeServer(this, this.mServerAddress);
            this.sendToClient(new inet.NetworkEvent(inet.NetEventType.ServerClosed, inet.ConnectionId.INVALID, null));
            this.mServerAddress = null;
        }
        //do nothing if it wasnt a server
    };
    //delivers the message to the local peer
    SignalingPeer.prototype.forwardMessage = function (senderPeer, msg, reliable) {
        var id = this.findPeerConnectionId(senderPeer);
        if (reliable)
            this.sendToClient(new inet.NetworkEvent(inet.NetEventType.ReliableMessageReceived, id, msg));
        else
            this.sendToClient(new inet.NetworkEvent(inet.NetEventType.UnreliableMessageReceived, id, msg));
    };
    SignalingPeer.prototype.sendData = function (id, msg, reliable) {
        var peer = this.mConnections[id.id];
        if (peer != null)
            peer.forwardMessage(this, msg, reliable);
    };
    return SignalingPeer;
}());
//# sourceMappingURL=WebsocketNetworkServer.js.map