import { Manifest } from "./plugins";
export declare const checkDirectoryIsPluginWorkingDirectory: (cwd: string) => Promise<boolean>;
export declare const isCreationDistDirectoryValid: (cwd: string) => Promise<boolean>;
export declare const canExportPlugin: (cwd: string) => Promise<boolean>;
export declare const exportPluginToDev: (cwd: string) => Promise<boolean>;
export declare const tarCreationPlugin: (cwd: string) => Promise<boolean>;
export interface DepFetch {
    status: "ok" | "error";
    reason?: string;
    deps?: Array<Manifest>;
}
export declare const getDependenciesForManifest: (manifest: Manifest, seen?: {}) => Promise<DepFetch>;
interface VerifyDepsResult {
    isValid: boolean;
    status: "ok" | "error";
    reason?: string;
    pluginName?: string;
    pluginVersion?: string;
    lastVersion?: string;
    nextVersion?: string;
}
export declare const verifyPluginDependencyCompatability: (deps: Array<Manifest>) => Promise<VerifyDepsResult>;
export {};
