import { Socket } from "socket.io-client";
export declare const createSocket: (client: 'web' | 'desktop' | 'cli') => Socket<import("@socket.io/component-emitter").DefaultEventsMap, import("@socket.io/component-emitter").DefaultEventsMap>;
export declare const waitForEvent: <T>(socket: Socket, event: string) => Promise<T>;
