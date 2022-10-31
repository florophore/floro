import { string, z } from 'zod';


export const User = z.object({
    username: z.string(),
    firstName: z.string(),
    lastName: z.string()
});

export const Session = z.object({
    id: z.string(),
    expiresAt: z.string(),
    createdAt: z.string()
});

export const CreateLoginRequest = z.object({
    user: User.nullish(),
    emailVerificationCode: z.string().nullish()
});

export const CreateLoginResponse = z.object({
    action: z.string(),
    targetClient: z.enum(["web", "cli", "desktop"])
})

export const Cat = z.object({
    id: z.number(),
    name: z.string(),
});
export const Cats = z.array(Cat);


export type CatType = z.infer<typeof Cat>;
export type CatsType = z.infer<typeof Cats>;

export type User = z.infer<typeof User>;
export type CreateLoginResponse = z.infer<typeof CreateLoginResponse>;