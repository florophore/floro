import { DiffElement } from "./versioncontrol";
export interface PluginElement {
    key: string;
    value: string;
}
export interface ManifestNode {
    type: string;
    isKey?: boolean;
    values?: string | TypeStruct;
    ref?: string;
    refKeyType?: string;
    refType?: string;
    nullable?: boolean;
    emptyable?: boolean;
    onDelete?: "delete" | "nullify";
}
export interface TypeStruct {
    [key: string]: ManifestNode | TypeStruct;
}
export interface Manifest {
    version: string;
    name: string;
    displayName: string;
    publisher: string;
    copyable?: boolean;
    icon: string | {
        light: string;
        dark: string;
    };
    imports: {
        [name: string]: string;
    };
    types: TypeStruct;
    store: TypeStruct;
}
export declare const readDevPluginManifest: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const getPluginManifest: (pluginName: string, plugins: Array<PluginElement>) => Promise<Manifest | null>;
export declare const pluginManifestsAreCompatibleForUpdate: (oldPluginList: Array<PluginElement>, newPluginList: Array<PluginElement>) => Promise<boolean>;
export declare const getPluginManifests: (pluginList: Array<PluginElement>) => Promise<Array<Manifest>>;
export declare const pluginListToMap: (pluginList: Array<PluginElement>) => {
    [pluginName: string]: string;
};
export declare const pluginMapToList: (pluginMap: {
    [pluginName: string]: string;
}) => Array<PluginElement>;
export declare const manifestListToSchemaMap: (manifestList: Array<Manifest>) => {
    [pluginName: string]: Manifest;
};
export declare const hasPlugin: (pluginName: string, plugins: Array<PluginElement>) => boolean;
export declare const getUpstreamDependencyList: (pluginName: string, manifest: Manifest, plugins: Array<PluginElement>) => Promise<Array<PluginElement> | null>;
export declare const defaultVoidedState: (schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}) => any[];
export declare const writePathString: (pathParts: Array<DiffElement | string>) => string;
export declare const decodeSchemaPath: (pathString: string) => Array<DiffElement | string>;
export declare const getStateId: (schema: TypeStruct, state: object) => any;
export declare const flattenStateToSchemaPathKV: (schemaRoot: Manifest, state: object, traversalPath: Array<string>) => Array<DiffElement>;
export declare const indexArrayDuplicates: (kvs: Array<DiffElement>) => Array<DiffElement>;
export declare const buildObjectsAtPath: (rootSchema: Manifest, path: string, properties: {
    [key: string]: string | number | boolean;
}, out?: {}) => object;
export declare const constructDependencySchema: (plugins: Array<PluginElement>) => Promise<{
    [key: string]: Manifest;
}>;
export declare const getStateFromKVForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, kv: Array<DiffElement>, pluginName: string) => object;
export declare const getRootSchemaForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, pluginName: string) => TypeStruct;
export declare const getRootSchemaMap: (schemaMap: {
    [key: string]: Manifest;
}) => {
    [key: string]: TypeStruct;
};
export declare const getKVStateForPlugin: (schema: {
    [key: string]: Manifest;
}, pluginName: string, stateMap: {
    [key: string]: object;
}) => Array<DiffElement>;
/***
 * cascading is heavy but infrequent. It only needs to be
 * called when updating state. Not called when applying diffs
 */
export declare const cascadePluginState: (schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}, pluginName: string, rootSchemaMap?: {
    [key: string]: TypeStruct;
}, memo?: {
    [key: string]: {
        [key: string]: object;
    };
}) => {
    [key: string]: object;
};
export declare const validatePluginState: (schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}, pluginName: string) => boolean;
export declare const pluginManifestIsSubsetOfManifest: (currentSchemaMap: {
    [key: string]: Manifest;
}, nextSchemaMap: {
    [key: string]: Manifest;
}, pluginName: string) => boolean;
export declare const isTopologicalSubset: (oldSchemaMap: {
    [key: string]: Manifest;
}, oldStateMap: {
    [key: string]: object;
}, newSchemaMap: {
    [key: string]: Manifest;
}, newStateMap: {
    [key: string]: object;
}, pluginName: string) => boolean;
export declare const isTopologicalSubsetValid: (oldSchemaMap: {
    [key: string]: Manifest;
}, oldStateMap: {
    [key: string]: object;
}, newSchemaMap: {
    [key: string]: Manifest;
}, newStateMap: {
    [key: string]: object;
}, pluginName: string) => boolean;
