"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cats = exports.Cat = void 0;
const zod_1 = require("zod");
exports.Cat = zod_1.z.object({
    id: zod_1.z.number(),
    name: zod_1.z.string(),
});
exports.Cats = zod_1.z.array(exports.Cat);
//# sourceMappingURL=trpc.js.map