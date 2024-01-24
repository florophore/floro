import { Socket } from 'socket.io';

const multiplexer = {
  cli: [],
  desktop: [],
  web: [],
  extension: [],
  external: [],
};

export const broadcastAllDevices = (event, payload) => {
  const clients = [...multiplexer.cli, ...multiplexer.desktop, ...multiplexer.web];
  clients.forEach((socket: Socket) => {
    socket.emit(event, payload);
  });
}

export const broadcastToClient = (client: 'cli'|'desktop'|'web'|'extension'|'external', event, payload) => {
  const clients = multiplexer[client];
  clients.forEach((socket: Socket) => {
    socket.emit(event, payload);
  });
}

export default multiplexer;
