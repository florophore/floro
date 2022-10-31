import * as trpc from '@trpc/server';
import { CreateLoginResponse } from "./schema";
import { z } from "zod";
import multiplexer from './multiplexer';

const protectedRouter = trpc
  .router()
  .mutation("login", {
    input: z.number(),
    output: CreateLoginResponse,
    async resolve(req) {
        return { action: "OK"}
    },
  });

export type ProtectedTRPCRouter = typeof protectedRouter;
export default protectedRouter;