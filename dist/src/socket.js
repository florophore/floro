"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForEvent = exports.createSocket = void 0;
const socket_io_client_1 = require("socket.io-client");
const createSocket = (client) => {
    const manager = new socket_io_client_1.Manager('ws://localhost:63403', {
        reconnectionDelayMax: 10000,
        query: {
            client
        }
    });
    return manager.socket("/");
};
exports.createSocket = createSocket;
const waitForEvent = (socket, event) => {
    return new Promise((resolve) => {
        socket.on(event, (payload) => {
            resolve(payload);
            socket.off(event);
        });
    });
};
exports.waitForEvent = waitForEvent;
//# sourceMappingURL=socket.js.map