declare const multiplexer: {
    cli: any[];
    desktop: any[];
    web: any[];
};
export declare const broadcastAllDevices: (event: any, payload: any) => void;
export declare const broadcastToClient: (client: 'cli' | 'desktop' | 'web', event: any, payload: any) => void;
export default multiplexer;
