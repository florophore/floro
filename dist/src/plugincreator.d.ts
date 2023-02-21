import { Manifest } from "./plugins";
export declare const PLUGIN_REGEX: RegExp;
export declare const checkDirectoryIsPluginWorkingDirectory: (cwd: string) => Promise<boolean>;
export declare const buildFloroTemplate: (cwd: string, name: string) => Promise<void>;
export declare const isCreationDistDirectoryValid: (cwd: string) => Promise<boolean>;
export declare const canExportPlugin: (cwd: string) => Promise<boolean>;
export declare const validateLocalManifest: (cwd: string) => Promise<boolean>;
export declare const getLocalManifestReadFunction: (cwd: string) => Promise<(pluginName: any, pluginVersion: any) => Promise<any>>;
export declare const inspectLocalManifest: (cwd: string, expand: boolean, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<string | null>;
export declare const pullLocalDeps: (cwd: string, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<boolean>;
export declare const exportPluginToDev: (cwd: string) => Promise<boolean>;
export declare const installDependency: (cwd: string, depname: string, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<Manifest | null>;
export declare const tarCreationPlugin: (cwd: string) => Promise<null | string>;
export declare const uploadPluginTar: (tarPath: string) => Promise<boolean>;
export interface DepFetch {
    status: "ok" | "error";
    reason?: string;
    deps?: Array<Manifest>;
}
export declare const getSchemaMapForCreationManifest: (manifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<{
    [key: string]: Manifest;
}>;
export declare const generateLocalTypescriptAPI: (cwd: string, useReact: boolean, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<boolean>;
export declare const generateTypeScriptAPI: (manifest: Manifest, useReact: boolean, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<string>;
