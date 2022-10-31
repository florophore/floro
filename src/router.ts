import * as trpc from '@trpc/server';
import { Cat, Cats } from "./schema";
import { z } from "zod";

const trpcRouter = trpc
  .router()
  .query("get", {
    input: z.number(),
    output: Cat,
    async resolve(req) {
      console.log("TEST 1");
      return null;
    },
  })
  .query("list", {
    output: Cats,
    async resolve() {
      console.log("TEST 2");
      return [];
    },
  });

export type TRPCRouter = typeof trpcRouter;
export default trpcRouter;
