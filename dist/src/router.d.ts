import * as trpc from '@trpc/server';
declare const trpcRouter: import("@trpc/server/dist/declarations/src/router").Router<unknown, unknown, {}, Record<"get", import("@trpc/server/dist/declarations/src/internals/procedure").Procedure<unknown, unknown, {}, number, number, {
    id?: number;
    name?: string;
}, {
    id?: number;
    name?: string;
}, {
    id?: number;
    name?: string;
}>> & Record<"list", import("@trpc/server/dist/declarations/src/internals/procedure").Procedure<unknown, unknown, {}, undefined, undefined, {
    id?: number;
    name?: string;
}[], {
    id?: number;
    name?: string;
}[], {
    id?: number;
    name?: string;
}[]>>, {}, {}, trpc.DefaultErrorShape>;
export declare type TRPCRouter = typeof trpcRouter;
export default trpcRouter;
