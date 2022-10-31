"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastToClient = exports.broadcastAllDevices = void 0;
const multiplexer = {
    cli: [],
    desktop: [],
    web: [],
};
const broadcastAllDevices = (event, payload) => {
    const clients = [...multiplexer.cli, ...multiplexer.desktop, ...multiplexer.web];
    clients.forEach((socket) => {
        socket.emit(event, payload);
    });
};
exports.broadcastAllDevices = broadcastAllDevices;
const broadcastToClient = (client, event, payload) => {
    const clients = multiplexer[client];
    clients.forEach((socket) => {
        socket.emit(event, payload);
    });
};
exports.broadcastToClient = broadcastToClient;
exports.default = multiplexer;
//# sourceMappingURL=multiplexer.js.map