import { DiffElement } from "./versioncontrol";
export interface PluginElement {
    key: string;
    value: string;
}
export interface ManifestNode {
    type: string;
    isKey?: boolean;
    values?: string;
    path?: string;
}
export interface TypeStruct {
    [key: string]: ManifestNode | TypeStruct;
}
export interface Manifest {
    imports: {
        [name: string]: string;
    };
    types: TypeStruct;
    store: TypeStruct;
}
export declare const readDevPluginManifest: (pluginName: string) => Promise<any>;
export declare const getPluginManifest: (pluginName: string, plugins: Array<PluginElement>) => Promise<Manifest | null>;
export declare const hasPlugin: (pluginName: string, plugins: Array<PluginElement>) => boolean;
export declare const getUpstreamDependencyList: (pluginName: string, manifest: Manifest, plugins: Array<PluginElement>) => Promise<Array<PluginElement> | null>;
export declare const primitives: Set<string>;
export declare const containsCyclicTypes: (schema: Manifest, struct: TypeStruct, visited?: {}) => boolean;
export declare const constructRootSchema: (schema: Manifest, struct: TypeStruct, pluginName: string) => TypeStruct;
export declare const writePathString: (pathParts: Array<DiffElement | string>) => string;
export declare const decodeSchemaPath: (pathString: string) => Array<DiffElement | string>;
export declare const flattenStateToSchemaPathKV: (schemaRoot: Manifest, state: unknown, traversalPath: Array<string>) => Array<DiffElement>;
export declare const buildObjectsAtPath: (rootSchema: Manifest, path: string, properties: {
    [key: string]: string | number | boolean;
}, out?: {}) => unknown;
export declare const generateKVFromState: (schema: Manifest, state: unknown, pluginName: string) => Array<DiffElement>;
export declare const generateStateFromKV: (schema: Manifest, kv: Array<DiffElement>, pluginName: string) => unknown;
export declare const iterateSchemaTypes: (types: Manifest["types"], pluginName: string) => unknown;
export declare const drawSchemaTypesFromImports: (schema: {
    [key: string]: Manifest;
}, pluginName: string) => TypeStruct;
export declare const constructDependencySchema: (plugins: Array<PluginElement>) => Promise<{
    [key: string]: Manifest;
}>;
export declare const getRootSchemaForPlugin: (schema: {
    [key: string]: Manifest;
}, manifest: Manifest, pluginName: string) => TypeStruct;
export declare const getKVStateForPlugin: (schema: {
    [key: string]: Manifest;
}, manifest: Manifest, pluginName: string, state: unknown) => Array<DiffElement>;
