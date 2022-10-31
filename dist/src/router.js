"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const trpc = __importStar(require("@trpc/server"));
const schema_1 = require("./schema");
const zod_1 = require("zod");
const trpcRouter = trpc
    .router()
    .query("get", {
    input: zod_1.z.number(),
    output: schema_1.Cat,
    async resolve(req) {
        console.log("TEST 1");
        return null;
    },
})
    .query("list", {
    output: schema_1.Cats,
    async resolve() {
        console.log("TEST 2");
        return [];
    },
});
exports.default = trpcRouter;
//# sourceMappingURL=router.js.map