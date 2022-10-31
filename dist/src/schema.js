"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cats = exports.Cat = exports.CreateLoginResponse = exports.CreateLoginRequest = exports.Session = exports.User = void 0;
const zod_1 = require("zod");
exports.User = zod_1.z.object({
    username: zod_1.z.string(),
    firstName: zod_1.z.string(),
    lastName: zod_1.z.string()
});
exports.Session = zod_1.z.object({
    id: zod_1.z.string(),
    expiresAt: zod_1.z.string(),
    createdAt: zod_1.z.string()
});
exports.CreateLoginRequest = zod_1.z.object({
    user: exports.User.nullish(),
    emailVerificationCode: zod_1.z.string().nullish()
});
exports.CreateLoginResponse = zod_1.z.object({
    action: zod_1.z.string(),
    targetClient: zod_1.z.enum(["web", "cli", "desktop"])
});
exports.Cat = zod_1.z.object({
    id: zod_1.z.number(),
    name: zod_1.z.string(),
});
exports.Cats = zod_1.z.array(exports.Cat);
//# sourceMappingURL=schema.js.map