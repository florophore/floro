import { Manifest, TypeStruct } from "./plugins";
import { DataSource } from "./datasource";
export declare const PLUGIN_REGEX: RegExp;
export declare const checkDirectoryIsPluginWorkingDirectory: (cwd: string) => Promise<boolean>;
export declare const buildFloroTemplate: (cwd: string, name: string) => Promise<void>;
export declare const isCreationDistDirectoryValid: (cwd: string) => Promise<boolean>;
export declare const canExportPlugin: (cwd: string) => Promise<boolean>;
export declare const validateLocalManifest: (cwd: string) => Promise<boolean>;
export declare const getLocalManifestReadFunction: (cwd: string) => Promise<(pluginName: any, pluginVersion: any) => Promise<any>>;
export declare const inspectLocalManifest: (cwd: string, expand?: boolean) => Promise<TypeStruct | {
    [key: string]: Manifest;
}>;
export declare const pullLocalDeps: (cwd: string, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<boolean>;
export declare const exportPluginToDev: (cwd: string) => Promise<boolean>;
export declare const installDependency: (cwd: string, depname: string) => Promise<Manifest | null>;
export declare const tarCreationPlugin: (cwd: string) => Promise<null | string>;
export declare const uploadPluginTar: (tarPath: string) => Promise<boolean>;
export interface DepFetch {
    status: "ok" | "error";
    reason?: string;
    deps?: Array<Manifest>;
}
export declare const getSchemaMapForCreationManifest: (datasource: DataSource, manifest: Manifest) => Promise<{
    [key: string]: Manifest;
}>;
export declare const generateLocalTypescriptAPI: (cwd: string, useReact?: boolean) => Promise<boolean>;
export declare const generateTypeScriptAPI: (datasource: DataSource, manifest: Manifest, useReact?: boolean) => Promise<string>;
