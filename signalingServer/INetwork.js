"use strict";
var NetEventType;
(function (NetEventType) {
    NetEventType[NetEventType["Invalid"] = 0] = "Invalid";
    NetEventType[NetEventType["UnreliableMessageReceived"] = 1] = "UnreliableMessageReceived";
    NetEventType[NetEventType["ReliableMessageReceived"] = 2] = "ReliableMessageReceived";
    NetEventType[NetEventType["ServerInitialized"] = 3] = "ServerInitialized";
    NetEventType[NetEventType["ServerInitFailed"] = 4] = "ServerInitFailed";
    NetEventType[NetEventType["ServerClosed"] = 5] = "ServerClosed";
    NetEventType[NetEventType["NewConnection"] = 6] = "NewConnection";
    NetEventType[NetEventType["ConnectionFailed"] = 7] = "ConnectionFailed";
    NetEventType[NetEventType["Disconnected"] = 8] = "Disconnected";
    NetEventType[NetEventType["FatalError"] = 100] = "FatalError";
    NetEventType[NetEventType["Warning"] = 101] = "Warning";
    NetEventType[NetEventType["Log"] = 102] = "Log"; //not yet used
})(NetEventType || (NetEventType = {}));
exports.NetEventType = NetEventType;
var NetEventDataType;
(function (NetEventDataType) {
    NetEventDataType[NetEventDataType["Null"] = 0] = "Null";
    NetEventDataType[NetEventDataType["ByteArray"] = 1] = "ByteArray";
    NetEventDataType[NetEventDataType["UTF16String"] = 2] = "UTF16String";
})(NetEventDataType || (NetEventDataType = {}));
var NetworkEvent = (function () {
    function NetworkEvent(t, conId, data) {
        this.type = t;
        this.connectionId = conId;
        this.data = data;
    }
    Object.defineProperty(NetworkEvent.prototype, "RawData", {
        get: function () {
            return this.data;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NetworkEvent.prototype, "MessageData", {
        get: function () {
            if (typeof this.data != "string")
                return this.data;
            return null;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NetworkEvent.prototype, "Info", {
        get: function () {
            if (typeof this.data == "string")
                return this.data;
            return null;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NetworkEvent.prototype, "Type", {
        get: function () {
            return this.type;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(NetworkEvent.prototype, "ConnectionId", {
        get: function () {
            return this.connectionId;
        },
        enumerable: true,
        configurable: true
    });
    //for debugging only
    NetworkEvent.prototype.toString = function () {
        var output = "NetworkEvent[";
        output += "NetEventType: (";
        output += NetEventType[this.type];
        output += "), id: (";
        output += this.connectionId.id;
        output += "), Data: (";
        output += this.data;
        output += ")]";
        return output;
    };
    NetworkEvent.parseFromString = function (str) {
        var values = JSON.parse(str);
        var data;
        if (values.data == null) {
            data = null;
        }
        else if (typeof values.data == "string") {
            data = values.data;
        }
        else if (typeof values.data == "object") {
            //json represents the array as an object containing each index and the
            //value as string number ... improve that later
            var arrayAsObject = values.data;
            var length = 0;
            for (var prop in arrayAsObject) {
                //if (arrayAsObject.hasOwnProperty(prop)) { //shouldnt be needed
                length++;
            }
            var buffer = new Uint8Array(Object.keys(arrayAsObject).length);
            for (var i = 0; i < buffer.length; i++)
                buffer[i] = arrayAsObject[i];
            data = buffer;
        }
        else {
            console.error("data can't be parsed");
        }
        var evt = new NetworkEvent(values.type, values.connectionId, data);
        return evt;
    };
    NetworkEvent.toString = function (evt) {
        return JSON.stringify(evt);
    };
    NetworkEvent.fromByteArray = function (arr) {
        var type = arr[0]; //byte
        var dataType = arr[1]; //byte
        var id = new Int16Array(arr.buffer, arr.byteOffset + 2, 1)[0]; //short
        var data = null;
        if (dataType == NetEventDataType.ByteArray) {
            var length_1 = new Uint32Array(arr.buffer, arr.byteOffset + 4, 1)[0]; //uint
            var byteArray = new Uint8Array(arr.buffer, arr.byteOffset + 8, length_1);
            data = byteArray;
        }
        else if (dataType == NetEventDataType.UTF16String) {
            var length_2 = new Uint32Array(arr.buffer, arr.byteOffset + 4, 1)[0]; //uint
            var uint16Arr = new Uint16Array(arr.buffer, arr.byteOffset + 8, length_2);
            var str = "";
            for (var i = 0; i < uint16Arr.length; i++) {
                str += String.fromCharCode(uint16Arr[i]);
            }
            data = str;
        }
        var conId = new ConnectionId(id);
        var result = new NetworkEvent(type, conId, data);
        return result;
    };
    NetworkEvent.toByteArray = function (evt) {
        var dataType;
        var length = 4; //4 bytes are always needed
        //getting type and length
        if (evt.data == null) {
            dataType = NetEventDataType.Null;
        }
        else if (typeof evt.data == "string") {
            dataType = NetEventDataType.UTF16String;
            var str = evt.data;
            length += str.length * 2 + 4;
        }
        else {
            dataType = NetEventDataType.ByteArray;
            var byteArray = evt.data;
            length += 4 + byteArray.length;
        }
        //creating the byte array
        var result = new Uint8Array(length);
        result[0] = evt.type;
        ;
        result[1] = dataType;
        var conIdField = new Int16Array(result.buffer, result.byteOffset + 2, 1);
        conIdField[0] = evt.connectionId.id;
        if (dataType == NetEventDataType.ByteArray) {
            var byteArray = evt.data;
            var lengthField = new Uint32Array(result.buffer, result.byteOffset + 4, 1);
            lengthField[0] = byteArray.length;
            for (var i = 0; i < byteArray.length; i++) {
                result[8 + i] = byteArray[i];
            }
        }
        else if (dataType == NetEventDataType.UTF16String) {
            var str = evt.data;
            var lengthField = new Uint32Array(result.buffer, result.byteOffset + 4, 1);
            lengthField[0] = str.length;
            var dataField = new Uint16Array(result.buffer, result.byteOffset + 8, str.length);
            for (var i = 0; i < dataField.length; i++) {
                dataField[i] = str.charCodeAt(i);
            }
        }
        return result;
    };
    return NetworkEvent;
}());
exports.NetworkEvent = NetworkEvent;
var ConnectionId = (function () {
    function ConnectionId(nid) {
        this.id = nid;
    }
    ConnectionId.INVALID = new ConnectionId(-1);
    return ConnectionId;
}());
exports.ConnectionId = ConnectionId;
//# sourceMappingURL=INetwork.js.map