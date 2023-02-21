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
    description?: string;
    codeDocsUrl?: string;
    codeRepoUrl?: string;
    icon: string | {
        light: string;
        dark: string;
        selected?: string | {
            dark?: string;
            light?: string;
        };
    };
    imports: {
        [name: string]: string;
    };
    types: TypeStruct;
    store: TypeStruct;
}
export declare const readDevPluginManifest: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const downloadPlugin: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const readPluginManifest: (pluginName: string, pluginValue: string) => Promise<Manifest | null>;
export declare const getPluginManifest: (pluginName: string, plugins: Array<PluginElement>, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<Manifest | null>;
export declare const pluginManifestsAreCompatibleForUpdate: (oldManifest: Manifest, newManifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<boolean | null>;
export declare const getPluginManifests: (pluginList: Array<PluginElement>, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<Array<Manifest>>;
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
export declare const hasPluginManifest: (manifest: Manifest, manifests: Array<Manifest>) => boolean;
export interface DepFetch {
    status: "ok" | "error";
    reason?: string;
    deps?: Array<Manifest>;
}
export declare const getDependenciesForManifest: (manifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>, seen?: {}) => Promise<DepFetch>;
export declare const getUpstreamDependencyManifests: (manifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>, memo?: {
    [key: string]: Manifest[];
}) => Promise<Array<Manifest> | null>;
export declare const coalesceDependencyVersions: (deps: Array<Manifest>) => {
    [pluginName: string]: string[];
};
export interface VerifyDepsResult {
    isValid: boolean;
    status: "ok" | "error";
    reason?: string;
    pluginName?: string;
    pluginVersion?: string;
    lastVersion?: string;
    nextVersion?: string;
}
export declare const verifyPluginDependencyCompatability: (deps: Array<Manifest>, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<VerifyDepsResult>;
export declare const getSchemaMapForManifest: (manifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<{
    [key: string]: Manifest;
}>;
export declare const schemaManifestHasInvalidSyntax: (schema: Manifest) => SyntaxValidation;
export interface SyntaxValidation {
    isInvalid: boolean;
    error?: string;
}
export declare const schemaHasInvalidTypeSytax: (schema: Manifest, struct: TypeStruct, visited?: {}) => SyntaxValidation;
export declare const containsCyclicTypes: (schema: Manifest, struct: TypeStruct, visited?: {}) => boolean;
export declare const validatePluginManifest: (manifest: Manifest, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<SchemaValidationResponse | {
    status: string;
    message: any;
}>;
export declare const defaultVoidedState: (schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}) => any[];
export declare const writePathString: (pathParts: Array<DiffElement | string>) => string;
export declare const decodeSchemaPath: (pathString: string) => Array<DiffElement | string>;
export declare const getStateId: (schema: TypeStruct, state: object) => string;
export declare const flattenStateToSchemaPathKV: (schemaRoot: Manifest, state: object, traversalPath: Array<string | DiffElement>) => {
    key: string | Array<string | DiffElement>;
    value: unknown;
}[];
export declare const indexArrayDuplicates: (kvs: Array<DiffElement>) => Array<DiffElement>;
export declare const buildObjectsAtPath: (rootSchema: Manifest, path: string, properties: {
    [key: string]: string | number | boolean;
}, out?: {}) => object;
export declare const getStateFromKVForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, kv: Array<DiffElement>, pluginName: string) => object;
export declare const getExpandedTypesForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, pluginName: string) => TypeStruct;
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
export interface SchemaValidationResponse {
    status: "ok" | "error";
    message?: string;
}
export declare const isSchemaValid: (typeStruct: TypeStruct, schemaMap: {
    [key: string]: Manifest;
}, rootSchemaMap: {
    [key: string]: TypeStruct;
}, expandedTypes: TypeStruct, isDirectParentSet?: boolean, isDirectParentArray?: boolean, isArrayDescendent?: boolean, path?: Array<string>) => SchemaValidationResponse;
export declare const invalidSchemaPropsCheck: (typeStruct: TypeStruct, rootSchema: TypeStruct | object, path?: Array<string>) => SchemaValidationResponse;
export declare const collectKeyRefs: (typeStruct: TypeStruct, path?: Array<string | {
    key: string;
    value: string;
}>) => Array<string>;
export declare const replaceRefVarsWithWildcards: (pathString: string) => string;
export declare const replaceRawRefsInExpandedType: (typeStruct: TypeStruct, expandedTypes: TypeStruct, rootSchemaMap: {
    [key: string]: TypeStruct;
}) => TypeStruct;
export declare const typestructsAreEquivalent: (typestructA: TypeStruct | object, typestructB: TypeStruct | object) => boolean;
export declare const buildPointerReturnTypeMap: (rootSchemaMap: {
    [key: string]: TypeStruct;
}, expandedTypes: TypeStruct, referenceKeys: Array<string>) => {
    [key: string]: string[];
};
export declare const buildPointerArgsMap: (referenceReturnTypeMap: {
    [key: string]: string[];
}) => {
    [key: string]: string[][];
};
export declare const drawMakeQueryRef: (argMap: {
    [key: string]: string[][];
}, useReact?: boolean) => string;
export declare const drawSchemaRoot: (rootSchemaMap: TypeStruct, referenceReturnTypeMap: {
    [key: string]: string[];
}) => string;
export declare const drawRefReturnTypes: (rootSchemaMap: TypeStruct, referenceReturnTypeMap: {
    [key: string]: string[];
}) => string;
export declare const drawGetReferencedObject: (argMap: {
    [key: string]: string[][];
}, useReact?: boolean) => string;
export declare const drawGetPluginStore: (rootSchemaMap: {
    [key: string]: TypeStruct;
}, useReact?: boolean) => string;
