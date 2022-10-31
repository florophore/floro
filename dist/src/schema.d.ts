import { z } from 'zod';
export declare const User: z.ZodObject<{
    username: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username?: string;
    firstName?: string;
    lastName?: string;
}, {
    username?: string;
    firstName?: string;
    lastName?: string;
}>;
export declare const Session: z.ZodObject<{
    id: z.ZodString;
    expiresAt: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: string;
    expiresAt?: string;
    createdAt?: string;
}, {
    id?: string;
    expiresAt?: string;
    createdAt?: string;
}>;
export declare const CreateLoginRequest: z.ZodObject<{
    user: z.ZodNullable<z.ZodOptional<z.ZodObject<{
        username: z.ZodString;
        firstName: z.ZodString;
        lastName: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        username?: string;
        firstName?: string;
        lastName?: string;
    }, {
        username?: string;
        firstName?: string;
        lastName?: string;
    }>>>;
    emailVerificationCode: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    user?: {
        username?: string;
        firstName?: string;
        lastName?: string;
    };
    emailVerificationCode?: string;
}, {
    user?: {
        username?: string;
        firstName?: string;
        lastName?: string;
    };
    emailVerificationCode?: string;
}>;
export declare const CreateLoginResponse: z.ZodObject<{
    action: z.ZodString;
    targetClient: z.ZodEnum<["web", "cli", "desktop"]>;
}, "strip", z.ZodTypeAny, {
    action?: string;
    targetClient?: "web" | "cli" | "desktop";
}, {
    action?: string;
    targetClient?: "web" | "cli" | "desktop";
}>;
export declare const Cat: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: number;
    name?: string;
}, {
    id?: number;
    name?: string;
}>;
export declare const Cats: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id?: number;
    name?: string;
}, {
    id?: number;
    name?: string;
}>, "many">;
export declare type CatType = z.infer<typeof Cat>;
export declare type CatsType = z.infer<typeof Cats>;
export declare type User = z.infer<typeof User>;
export declare type CreateLoginResponse = z.infer<typeof CreateLoginResponse>;
