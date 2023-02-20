import { Manifest } from "./plugins";
export declare const PLUGIN_REGEX: RegExp;
export declare const checkDirectoryIsPluginWorkingDirectory: (cwd: string) => Promise<boolean>;
export declare const buildFloroTemplate: (cwd: string, name: string) => Promise<void>;
export declare const isCreationDistDirectoryValid: (cwd: string) => Promise<boolean>;
export declare const canExportPlugin: (cwd: string) => Promise<boolean>;
export declare const exportPluginToDev: (cwd: string) => Promise<boolean>;
export declare const tarCreationPlugin: (cwd: string) => Promise<null | string>;
export declare const uploadPluginTar: (tarPath: string) => Promise<void>;
export interface DepFetch {
    status: "ok" | "error";
    reason?: string;
    deps?: Array<Manifest>;
}
export declare const getSchemaMapForCreationManifest: (manifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<{
    [key: string]: Manifest;
}>;
export declare const generateTypeScriptAPI: (manifest: Manifest, useReact: boolean, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<string>;
