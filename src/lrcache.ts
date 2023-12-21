import structuredClone from "@ungap/structured-clone";
import process from "process";

class CacheValue<T> {
    public value: T;
    public key: string;
    public fnName: string;
    constructor(key: string, fnName: string, value: T) {
        this.key = key;
        this.fnName = fnName;
        this.value = value;
    }

    debug(): void {
      console.log(this.fnName, this.key)
    }

    unwrap(): T {
     return this.value;
    }

    unwrapCopy(): T|null {
        if (this.value === undefined || this.value == null) {
            return null;
        }
        const clone = structuredClone(this.value);
        return clone;
    }
}

export default class LRCache {
    static names: {[key: string] : string} = {};
    cache: {[key: string] : unknown} = {};
    timeouts: {[key: string]: NodeJS.Timeout} = {};

    public defaultTTL: number;


    constructor(ttl = 30_000) {
        this.defaultTTL = ttl;
    }

    public static getCacheKey(args: Array<unknown>): string|null {
        try {
            for (let arg of args) {
                if (arg === undefined) {
                    return null;
                }
            }
            // no need to hash, stringify is fastest way to do this
            const key = JSON.stringify(args);;
            this.names[key] = args[0] as string;
            const stringify = JSON.stringify(args);
            return stringify;
        } catch(e) {
            return null;
        }
    }

    public set(key: string, value: unknown, ttl?: number) {
        if (!key) {
            return;
        }
        if (value === undefined) {
            return;
        }
        if (this.timeouts[key]) {
            clearTimeout(this.timeouts[key]);
        }
        this.cache[key] = structuredClone(value);
        this.timeouts[key] = setTimeout(() => {
            delete this.cache[key];
            delete this.timeouts[key];
            delete LRCache.names[key];
        }, process.env.NODE_ENV == "test" ? 0 : ttl ?? this.defaultTTL);
    }

    public get<T>(key: string, ttl?: number): CacheValue<T>|null {
        if (!key) {
            return null;
        }
        if (this.cache.hasOwnProperty(key)) {
            if (this.timeouts[key]) {
                clearTimeout(this.timeouts[key]);
            }
            const value = new CacheValue(key, LRCache.names[key], this.cache[key] as T);
            this.timeouts[key] = setTimeout(() => {
                delete this.cache[key];
                delete this.timeouts[key];
                delete LRCache.names[key];
            }, process.env.NODE_ENV == "test" ? 0 : ttl ?? this.defaultTTL);
            return value;
        }
        return null;
    }


}