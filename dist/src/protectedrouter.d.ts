import * as trpc from '@trpc/server';
declare const protectedRouter: import("@trpc/server/dist/declarations/src/router").Router<unknown, unknown, {}, {}, Record<"login", import("@trpc/server/dist/declarations/src/internals/procedure").Procedure<unknown, unknown, {}, number, number, {
    action?: string;
    targetClient?: "web" | "desktop" | "cli";
}, {
    action?: string;
    targetClient?: "web" | "desktop" | "cli";
}, {
    action?: string;
    targetClient?: "web" | "desktop" | "cli";
}>>, {}, trpc.DefaultErrorShape>;
export declare type ProtectedTRPCRouter = typeof protectedRouter;
export default protectedRouter;
