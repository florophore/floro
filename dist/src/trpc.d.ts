import { z } from 'zod';
export declare const Cat: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name?: string;
    id?: number;
}, {
    name?: string;
    id?: number;
}>;
export declare const Cats: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name?: string;
    id?: number;
}, {
    name?: string;
    id?: number;
}>, "many">;
export declare type CatType = z.infer<typeof Cat>;
export declare type CatsType = z.infer<typeof Cats>;
