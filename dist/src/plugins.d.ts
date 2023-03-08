import { DiffElement } from "./versioncontrol";
import { DataSource } from "./datasource";
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
export declare const pluginManifestsAreCompatibleForUpdate: (datasource: DataSource, oldManifest: Manifest, newManifest: Manifest) => Promise<boolean | null>;
export declare const schemaMapsAreCompatible: (datasource: DataSource, oldSchemaMap: {
    [key: string]: Manifest;
}, newSchemaMap: {
    [key: string]: Manifest;
}) => Promise<boolean | null>;
export declare const topSortManifests: (manifests: Array<Manifest>) => Manifest[];
export declare const getPluginManifests: (datasource: DataSource, pluginList: Array<PluginElement>) => Promise<Array<Manifest>>;
export declare const getManifestMapFromManifestList: (manifests: Array<Manifest>) => {};
export declare const pluginListToMap: (pluginList: Array<PluginElement>) => {
    [pluginName: string]: string;
};
export declare const pluginMapToList: (pluginMap: {
    [pluginName: string]: string;
}) => Array<PluginElement>;
export declare const manifestListToSchemaMap: (manifestList: Array<Manifest>) => {
    [pluginName: string]: Manifest;
};
export declare const manifestListToPluginList: (manifestList: Array<Manifest>) => Array<PluginElement>;
export declare const hasPlugin: (pluginName: string, plugins: Array<PluginElement>) => boolean;
export declare const hasPluginManifest: (manifest: Manifest, manifests: Array<Manifest>) => boolean;
export interface DepFetch {
    status: "ok" | "error";
    reason?: string;
    deps?: Array<Manifest>;
}
export declare const getDependenciesForManifest: (datasource: DataSource, manifest: Manifest, seen?: {}) => Promise<DepFetch>;
export declare const getUpstreamDependencyManifests: (datasource: DataSource, manifest: Manifest, memo?: {
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
export declare const verifyPluginDependencyCompatability: (datasource: DataSource, deps: Array<Manifest>) => Promise<VerifyDepsResult>;
export declare const getSchemaMapForManifest: (datasource: DataSource, manifest: Manifest) => Promise<{
    [key: string]: Manifest;
}>;
export declare const schemaManifestHasInvalidSyntax: (schema: Manifest) => SyntaxValidation;
export interface SyntaxValidation {
    isInvalid: boolean;
    error?: string;
}
export declare const schemaHasInvalidTypeSytax: (schema: Manifest, struct: TypeStruct, visited?: {}) => SyntaxValidation;
export declare const containsCyclicTypes: (schema: Manifest, struct: TypeStruct, visited?: {}) => boolean;
export declare const validatePluginManifest: (datasource: DataSource, manifest: Manifest) => Promise<SchemaValidationResponse | {
    status: string;
    message: any;
}>;
export declare const defaultVoidedState: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}) => Promise<{}>;
export declare const writePathString: (pathParts: Array<DiffElement | string>) => string;
export declare const writePathStringWithArrays: (pathParts: Array<DiffElement | string | number>) => string;
export declare const decodeSchemaPath: (pathString: string) => Array<DiffElement | string>;
export declare const decodeSchemaPathWithArrays: (pathString: string) => Array<DiffElement | string | number>;
export declare const getStateId: (schema: TypeStruct, state: object) => string;
export declare const flattenStateToSchemaPathKV: (schemaRoot: Manifest, state: object, traversalPath: Array<string | DiffElement>) => {
    key: string | Array<string | DiffElement>;
    value: unknown;
}[];
export declare const indexArrayDuplicates: (kvs: Array<DiffElement>) => Array<DiffElement>;
export declare const buildObjectsAtPath: (rootSchema: Manifest, path: string, properties: {
    [key: string]: string | number | boolean;
}, visitedLists?: {}, out?: {}) => object;
export declare const getStateFromKVForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, kv: Array<DiffElement>, pluginName: string) => object;
export declare const getExpandedTypesForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, pluginName: string) => TypeStruct;
export declare const getRootSchemaForPlugin: (schemaMap: {
    [key: string]: Manifest;
}, pluginName: string) => TypeStruct;
export declare const getRootSchemaMap: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}) => Promise<{
    [key: string]: TypeStruct;
}>;
export declare const getKVStateForPlugin: (datasource: DataSource, schema: {
    [key: string]: Manifest;
}, pluginName: string, stateMap: {
    [key: string]: object;
}) => Promise<Array<DiffElement>>;
export declare const getUpstreamDepsInSchemaMap: (schemaMap: {
    [key: string]: Manifest;
}, pluginName: string) => Array<string>;
export declare const getDownstreamDepsInSchemaMap: (schemaMap: {
    [key: string]: Manifest;
}, pluginName: string, memo?: {
    [pluginName: string]: boolean;
}) => Array<string>;
interface StaticStateMapChild {
    parent: Array<{
        [key: string]: object;
    }>;
    object: StaticStateMapObject;
    instance: unknown;
    keyProp: string;
    keyPropIsRef: boolean;
}
interface StaticStateMapObject {
    values: Array<StaticStateMapChild>;
    parent: Array<{
        [key: string]: object;
    }>;
}
interface StaticPointer {
    staticPath: Array<string>;
    relativePath: Array<string>;
    refType: string;
    onDelete: "delete" | "nullify";
}
interface StateMapPointer {
    parentSetPath: Array<string | {
        key: string;
        value: string;
    }>;
    setPath: Array<string | {
        key: string;
        value: string;
    }>;
    refPath: Array<string | {
        key: string;
        value: string;
    }>;
    ownerObject: unknown;
    refKey: string;
    ref: string;
    onDelete: "delete" | "nullify";
    refType: string;
}
export declare const compileStatePointers: (staticPointers: Array<StaticPointer>, stateMap: {
    [key: string]: object;
}) => Array<StateMapPointer>;
export declare const recursivelyCheckIfReferenceExists: (ref: string, refPath: Array<string | {
    key: string;
    value: string;
}>, referenceMap: {
    [key: string]: StaticStateMapObject;
}, visited?: {}) => boolean;
/**
 *
 * This is a really ugly function but it gets called frequently
 * and must not depend upon serialization/deserialization to and
 * from KV. It also has to be able to work in place to stay performant.
 * It get called on every update call.
 */
export declare const cascadePluginState: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}) => Promise<{
    [key: string]: object;
}>;
/***
 * cascading is heavy but infrequent. It only needs to be
 * called when updating state. Not called when applying diffs
 * @deprecated because it is not scalable at all and couples
 * kv state to plugin transformations
 */
export declare const cascadePluginStateDeprecated: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}, pluginName: string, rootSchemaMap?: {
    [key: string]: TypeStruct;
}, memo?: {
    [key: string]: {
        [key: string]: object;
    };
}) => Promise<{
    [key: string]: object;
}>;
export declare const reIndexSchemaArrays: (kvs: Array<DiffElement>) => Array<string>;
export declare const nullifyMissingFileRefs: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}) => Promise<void>;
export declare const validatePluginState: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}, stateMap: {
    [key: string]: object;
}, pluginName: string) => Promise<boolean>;
export declare const getPluginInvalidStateIndices: (datasource: DataSource, schemaMap: {
    [key: string]: Manifest;
}, kvs: Array<DiffElement>, pluginName: string) => Promise<Array<number>>;
export declare const pluginManifestIsSubsetOfManifest: (datasource: DataSource, currentSchemaMap: {
    [key: string]: Manifest;
}, nextSchemaMap: {
    [key: string]: Manifest;
}) => Promise<boolean>;
export declare const isTopologicalSubset: (datasource: DataSource, oldSchemaMap: {
    [key: string]: Manifest;
}, oldStateMap: {
    [key: string]: object;
}, newSchemaMap: {
    [key: string]: Manifest;
}, newStateMap: {
    [key: string]: object;
}, pluginName: string) => Promise<boolean>;
export declare const isTopologicalSubsetValid: (datasource: DataSource, oldSchemaMap: {
    [key: string]: Manifest;
}, oldStateMap: {
    [key: string]: object;
}, newSchemaMap: {
    [key: string]: Manifest;
}, newStateMap: {
    [key: string]: object;
}, pluginName: string) => Promise<boolean>;
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
export {};
