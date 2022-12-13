import { Manager, Socket } from "socket.io-client";
export const createSocket = (client: 'web'|'desktop'|'cli') => {
    const manager = new Manager('ws://localhost:63403', {
      reconnectionDelayMax: 10000,
      query: {
        client
      }
    });
    return manager.socket("/");
};


export const waitForEvent = <T,>(socket: Socket, event: string): Promise<T> => {
    return new Promise((resolve) => {
        socket.on(event, (payload: T) => {
            resolve(payload);
            socket.off(event)
        });
    });
}