"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTopologicalSubsetValid = exports.isTopologicalSubset = exports.pluginManifestIsSubsetOfManifest = exports.validatePluginState = exports.cascadePluginState = exports.getKVStateForPlugin = exports.getRootSchemaMap = exports.getRootSchemaForPlugin = exports.getStateFromKVForPlugin = exports.constructDependencySchema = exports.buildObjectsAtPath = exports.indexArrayDuplicates = exports.flattenStateToSchemaPathKV = exports.getStateId = exports.decodeSchemaPath = exports.writePathString = exports.defaultVoidedState = exports.getUpstreamDependencyList = exports.hasPlugin = exports.manifestListToSchemaMap = exports.pluginMapToList = exports.pluginListToMap = exports.getPluginManifests = exports.pluginManifestsAreCompatibleForUpdate = exports.getPluginManifest = exports.readDevPluginManifest = void 0;
const filestructure_1 = require("./filestructure");
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
const memfs_1 = require("memfs");
const cryptojs_1 = require("cryptojs");
const primitives = new Set(["int", "float", "boolean", "string"]);
const readDevPluginManifest = async (pluginName, pluginVersion) => {
    const pluginsJSON = await (0, filestructure_1.getPluginsJsonAsync)();
    if (!pluginsJSON) {
        return null;
    }
    if (pluginsJSON.plugins?.[pluginName]?.proxy) {
        try {
            const uri = `http://127.0.0.1:63403/plugins/${pluginName}/floro/floro.manifest.json`;
            const res = await axios_1.default.get(uri);
            return res.data;
        }
        catch (e) {
            return null;
        }
    }
    try {
        const pluginManifestPath = path_1.default.join(filestructure_1.vDEVPath, `${pluginName}@${pluginVersion}`, "floro", "floro.manifest.json");
        const manifestString = await memfs_1.fs.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
    }
    catch (e) {
        return null;
    }
};
exports.readDevPluginManifest = readDevPluginManifest;
const getPluginManifest = async (pluginName, plugins) => {
    const pluginInfo = plugins.find((v) => v.key == pluginName);
    if (!pluginInfo) {
        return;
    }
    if (pluginInfo.value.startsWith("dev")) {
        const [, v] = pluginInfo.value.split("@");
        return await (0, exports.readDevPluginManifest)(pluginName, v ?? "");
    }
    if (!pluginInfo.value) {
        return null;
    }
    const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, `${pluginName}@${pluginInfo.value}`, "floro", "floro.manifest.json");
    const manifestString = await memfs_1.fs.promises.readFile(pluginManifestPath);
    return JSON.parse(manifestString.toString());
};
exports.getPluginManifest = getPluginManifest;
const pluginManifestsAreCompatibleForUpdate = async (oldPluginList, newPluginList) => {
    const oldManifests = await (0, exports.getPluginManifests)(oldPluginList);
    const newManifests = await (0, exports.getPluginManifests)(newPluginList);
    const oldSchemaMap = (0, exports.manifestListToSchemaMap)(oldManifests);
    const newSchemaMap = (0, exports.manifestListToSchemaMap)(newManifests);
    return newManifests.reduce((isCompatible, newManifest) => {
        if (!isCompatible) {
            return false;
        }
        if (!oldSchemaMap[newManifest.name]) {
            return true;
        }
        return (0, exports.pluginManifestIsSubsetOfManifest)(oldSchemaMap, newSchemaMap, newManifest.name);
    }, true);
};
exports.pluginManifestsAreCompatibleForUpdate = pluginManifestsAreCompatibleForUpdate;
const getPluginManifests = async (pluginList) => {
    const manifests = await Promise.all(pluginList.map(({ key: pluginName }) => {
        return (0, exports.getPluginManifest)(pluginName, pluginList);
    }));
    return manifests?.filter(manifest => {
        return !!manifest;
    });
};
exports.getPluginManifests = getPluginManifests;
const pluginListToMap = (pluginList) => {
    return pluginList.reduce((map, { key, value }) => {
        return {
            ...map,
            [key]: value,
        };
    }, {});
};
exports.pluginListToMap = pluginListToMap;
const pluginMapToList = (pluginMap) => {
    return Object.keys(pluginMap).map((key) => {
        return {
            key,
            value: pluginMap[key],
        };
    });
};
exports.pluginMapToList = pluginMapToList;
const manifestListToSchemaMap = (manifestList) => {
    return manifestList.reduce((acc, manifest) => {
        return {
            ...acc,
            [manifest.name]: manifest,
        };
    }, {});
};
exports.manifestListToSchemaMap = manifestListToSchemaMap;
const hasPlugin = (pluginName, plugins) => {
    for (const { key } of plugins) {
        if (key === pluginName) {
            return true;
        }
    }
    return false;
};
exports.hasPlugin = hasPlugin;
const getUpstreamDependencyList = async (pluginName, manifest, plugins) => {
    if (!(0, exports.hasPlugin)(pluginName, plugins)) {
        return null;
    }
    const pluginInfo = plugins.find((v) => v.key == pluginName);
    const deps = [pluginInfo];
    for (let dependentPluginName in manifest.imports) {
        if (!(0, exports.hasPlugin)(dependentPluginName, plugins)) {
            return null;
        }
        // check semver here
        const dependentManifest = await (0, exports.getPluginManifest)(dependentPluginName, plugins);
        if (!dependentManifest) {
            return null;
        }
        const subDeps = await (0, exports.getUpstreamDependencyList)(dependentPluginName, dependentManifest, plugins);
        if (subDeps == null) {
            return null;
        }
        for (let dep of subDeps) {
            if (!(0, exports.hasPlugin)(dep.key, deps)) {
                deps.push(dep);
            }
        }
    }
    return deps;
};
exports.getUpstreamDependencyList = getUpstreamDependencyList;
const containsCyclicTypes = (schema, struct, visited = {}) => {
    for (const prop in struct) {
        if (struct[prop].type == "set") {
            if (visited[struct[prop].values] ||
                containsCyclicTypes(schema, schema.types[struct[prop].values], {
                    ...visited,
                    [struct[prop].values]: true,
                })) {
                return true;
            }
        }
        else if (schema.types[struct[prop].type]) {
            if (visited[struct[prop].type] ||
                containsCyclicTypes(schema, schema.types[struct[prop].type], {
                    ...visited,
                    [schema.types[struct[prop].type]]: true,
                })) {
                return true;
            }
        }
        else if (!struct[prop]?.type) {
            if (containsCyclicTypes(schema, struct[prop], {
                ...visited,
            })) {
                return true;
            }
        }
    }
    return false;
};
const constructRootSchema = (schema, struct, pluginName) => {
    let out = {};
    for (const prop in struct) {
        out[prop] = {};
        if (struct[prop]?.type == "set") {
            if (typeof struct[prop]?.values == "string" &&
                primitives.has(struct[prop]?.values)) {
                out[prop].type = struct[prop].type;
                out[prop].emptyable = struct[prop]?.emptyable ?? true;
                out[prop].values = struct[prop].values;
                continue;
            }
            if (typeof struct[prop]?.values == "string" &&
                schema.types[struct[prop]?.values]) {
                out[prop].type = struct[prop].type;
                out[prop].emptyable = struct[prop]?.emptyable ?? true;
                out[prop].values = constructRootSchema(schema, schema.types[struct[prop]?.values], pluginName);
                continue;
            }
            if (typeof struct[prop]?.values != "string") {
                out[prop].type = struct[prop].type;
                out[prop].emptyable = struct[prop]?.emptyable ?? true;
                out[prop].values = constructRootSchema(schema, (struct[prop]?.values ?? {}), pluginName);
                continue;
            }
        }
        if (struct[prop]?.type == "array") {
            if (typeof struct[prop]?.values == "string" &&
                primitives.has(struct[prop]?.values)) {
                out[prop].type = struct[prop].type;
                out[prop].emptyable = struct[prop]?.emptyable ?? true;
                out[prop].values = struct[prop].values;
                continue;
            }
            if (typeof struct[prop]?.values == "string" &&
                schema.types[struct[prop]?.values]) {
                out[prop].type = struct[prop].type;
                out[prop].emptyable = struct[prop]?.emptyable ?? true;
                out[prop].values = constructRootSchema(schema, {
                    ...schema.types[struct[prop]?.values],
                    ["(id)"]: {
                        type: "string",
                        isKey: true,
                    },
                }, pluginName);
                continue;
            }
            if (typeof struct[prop]?.values != "string") {
                out[prop].type = struct[prop].type;
                out[prop].emptyable = struct[prop]?.emptyable ?? true;
                out[prop].values = constructRootSchema(schema, {
                    ...(struct[prop]?.values ?? {}),
                    ["(id)"]: {
                        type: "string",
                        isKey: true,
                    },
                }, pluginName);
                continue;
            }
        }
        if (primitives.has(struct[prop]?.type)) {
            out[prop] = struct[prop];
            continue;
        }
        if (/^ref<(.+)>$/.test(struct[prop].type)) {
            const typeName = /^ref<(.+)>$/.exec(struct[prop].type)[1];
            if (primitives.has(typeName)) {
                out[prop] = struct[prop];
                out[prop].type = "ref";
                out[prop].refType = typeName;
                out[prop].refKeyType = typeName;
                out[prop].onDelete = struct[prop]?.onDelete ?? "delete";
                out[prop].nullable = struct[prop]?.nullable ?? false;
            }
            else {
                if ((typeName ?? "")?.startsWith("$")) {
                    out[prop].type = "ref";
                    out[prop].refType = typeName.startsWith("$.")
                        ? typeName.replace("$.", `$(${pluginName}).`)
                        : typeName;
                    out[prop].refType = typeName;
                    out[prop].refKeyType = "<?>";
                    out[prop].onDelete = struct[prop]?.onDelete ?? "delete";
                    out[prop].nullable = struct[prop]?.nullable ?? false;
                    if (struct[prop].isKey) {
                        out[prop].isKey = true;
                    }
                    continue;
                }
                if (!schema.types[typeName]) {
                    const message = "Invalid reference type: " + typeName;
                    throw new Error(message);
                }
                const type = schema.types[typeName];
                let key = null;
                for (let p in type) {
                    if (key)
                        continue;
                    if (type[p]?.isKey) {
                        key = type[p];
                    }
                }
                if (!key) {
                    const message = "Invalid reference type: " +
                        typeName +
                        ". " +
                        typeName +
                        " has no key";
                    throw new Error(message);
                }
                out[prop].type = "ref";
                out[prop].refType = typeName;
                out[prop].refKeyType = key.type;
                out[prop].onDelete = struct[prop]?.onDelete ?? "delete";
                out[prop].nullable = struct[prop]?.nullable ?? false;
                if (struct[prop].isKey) {
                    out[prop].isKey = true;
                }
                continue;
            }
        }
        if (schema.types[struct[prop].type]) {
            out[prop] = constructRootSchema(schema, schema.types[struct[prop].type], pluginName);
            continue;
        }
        if (!struct[prop]?.type) {
            out[prop] = constructRootSchema(schema, struct[prop], pluginName);
            continue;
        }
    }
    return out;
};
const defaultVoidedState = (schemaMap, stateMap) => {
    const rootSchemaMap = (0, exports.getRootSchemaMap)(schemaMap);
    return Object.keys(rootSchemaMap).reduce((acc, pluginName) => {
        const struct = rootSchemaMap[pluginName];
        const state = stateMap?.[pluginName] ?? {};
        return {
            ...acc,
            [pluginName]: sanitizePrimitivesWithSchema(struct, defaultMissingSchemaState(struct, state, stateMap)),
        };
    }, []);
};
exports.defaultVoidedState = defaultVoidedState;
const defaultMissingSchemaState = (struct, state, stateMap) => {
    let out = {};
    for (let prop in struct) {
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            primitives.has(struct[prop].values)) {
            out[prop] = state?.[prop] ?? [];
            continue;
        }
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            typeof struct[prop]?.values == "object") {
            out[prop] =
                (state?.[prop] ?? [])?.map((value) => {
                    return defaultMissingSchemaState(struct[prop]?.values, value, stateMap);
                }) ?? [];
            continue;
        }
        if (primitives.has(struct[prop]?.type)) {
            out[prop] = state?.[prop] ?? null;
            continue;
        }
        if (struct[prop]?.type == "ref") {
            if (state?.[prop]) {
                const referencedObject = getObjectInStateMap(stateMap, state?.[prop]);
                if (!referencedObject) {
                    out[prop] = null;
                    continue;
                }
            }
            out[prop] = state?.[prop] ?? null;
            continue;
        }
        if (struct[prop]) {
            out[prop] = defaultMissingSchemaState(struct[prop], state[prop] ?? {}, stateMap);
        }
    }
    return out;
};
const enforcePrimitiveSet = (set) => {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < set.length; ++i) {
        if (!seen.has(set[i])) {
            out.push(set[i]);
            seen.add(i);
        }
    }
    return out;
};
const sanitizePrimitivesWithSchema = (struct, state) => {
    let out = {};
    for (let prop in struct) {
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            struct[prop].values == "int") {
            const list = state?.[prop]
                ?.map((v) => {
                if (typeof v == "number" && !Number.isNaN(state[prop])) {
                    return Math.floor(v);
                }
                return null;
            })
                ?.filter((v) => v != null) ?? [];
            out[prop] =
                struct[prop]?.type == "set" ? enforcePrimitiveSet(list) : list;
            continue;
        }
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            struct[prop].values == "float") {
            const list = state?.[prop]
                ?.map((v) => {
                if (typeof v == "number" && !Number.isNaN(state[prop])) {
                    return v;
                }
                return null;
            })
                ?.filter((v) => v != null) ?? [];
            out[prop] =
                struct[prop]?.type == "set" ? enforcePrimitiveSet(list) : list;
            continue;
        }
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            struct[prop].values == "boolean") {
            const list = state?.[prop]
                ?.map((v) => {
                if (typeof v == "boolean") {
                    return v;
                }
                return null;
            })
                ?.filter((v) => v != null) ?? [];
            out[prop] =
                struct[prop]?.type == "set" ? enforcePrimitiveSet(list) : list;
            continue;
        }
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            struct[prop].values == "string") {
            const list = state?.[prop]
                ?.map((v) => {
                if (typeof v == "string") {
                    return v;
                }
                return null;
            })
                ?.filter((v) => v != null) ?? [];
            out[prop] =
                struct[prop]?.type == "set" ? enforcePrimitiveSet(list) : list;
            continue;
        }
        if ((struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
            typeof struct[prop]?.values == "object") {
            out[prop] = (state?.[prop] ?? [])?.map((value) => {
                return sanitizePrimitivesWithSchema(struct[prop]?.values, value);
            });
            continue;
        }
        if (struct[prop]?.type == "int") {
            if (typeof state[prop] == "number" && !Number.isNaN(state[prop])) {
                out[prop] = Math.floor(state[prop]);
                continue;
            }
            out[prop] = null;
            continue;
        }
        if (struct[prop]?.type == "float") {
            if (typeof state[prop] == "number" && !Number.isNaN(state[prop])) {
                out[prop] = state[prop];
                continue;
            }
            out[prop] = null;
            continue;
        }
        if (struct[prop]?.type == "boolean") {
            if (typeof state[prop] == "boolean") {
                out[prop] = state[prop];
                continue;
            }
            out[prop] = null;
            continue;
        }
        if (struct[prop]?.type == "string") {
            if (typeof state[prop] == "string") {
                out[prop] = state[prop];
                continue;
            }
            out[prop] = null;
            continue;
        }
        if (!struct[prop]?.type) {
            out[prop] = sanitizePrimitivesWithSchema(struct[prop], state[prop] ?? {});
            continue;
        }
        out[prop] = state[prop] ?? null;
    }
    return out;
};
const writePathString = (pathParts) => {
    return pathParts
        .map((part) => {
        if (typeof part == "string") {
            return part;
        }
        return `${part.key}<${part.value}>`;
    })
        .join(".");
};
exports.writePathString = writePathString;
const decodeSchemaPath = (pathString) => {
    return pathString.split(".").map((part) => {
        if (/^(.+)<(.+)>$/.test(part)) {
            const [, key, value] = /^(.+)<(.+)>$/.exec(part);
            return {
                key,
                value,
            };
        }
        return part;
    });
};
exports.decodeSchemaPath = decodeSchemaPath;
const getStateId = (schema, state) => {
    let hashPairs = [];
    for (let prop in schema) {
        if (!schema[prop].type) {
            hashPairs.push({
                key: prop,
                value: (0, exports.getStateId)(schema[prop], state[prop]),
            });
        }
        if (primitives.has(schema[prop].type)) {
            hashPairs.push({
                key: prop,
                value: cryptojs_1.Crypto.SHA256(`${state[prop]}`),
            });
        }
        if (schema[prop].type == "set" || schema[prop].type == "array") {
            hashPairs.push({
                key: prop,
                value: state[prop]?.reduce((s, element) => {
                    if (typeof schema[prop].values == "string" &&
                        primitives.has(schema[prop].values)) {
                        return cryptojs_1.Crypto.SHA256(s + `${element}`);
                    }
                    return cryptojs_1.Crypto.SHA256(s + (0, exports.getStateId)(schema[prop].values, element));
                }, ""),
            });
        }
    }
    return cryptojs_1.Crypto.SHA256(hashPairs.reduce((s, { key, value }) => {
        if (key == "(id)") {
            return s;
        }
        if (s == "") {
            return `${key}:${value}`;
        }
        return s + "/" + `${key}:${value}`;
    }, ""));
};
exports.getStateId = getStateId;
const flattenStateToSchemaPathKV = (schemaRoot, state, traversalPath) => {
    const kv = [];
    const sets = [];
    const arrays = [];
    const nestedStructures = [];
    const value = {};
    let primaryKey = null;
    for (let prop in schemaRoot) {
        if (schemaRoot[prop].isKey) {
            primaryKey = {
                key: prop,
                value: state[prop],
            };
        }
        if (schemaRoot[prop]?.type == "set" &&
            !primitives.has(schemaRoot[prop].values)) {
            sets.push(prop);
            continue;
        }
        if (schemaRoot[prop]?.type == "array" &&
            !primitives.has(schemaRoot[prop].values)) {
            arrays.push(prop);
            continue;
        }
        if (!primitives.has(schemaRoot[prop]?.type) &&
            !((schemaRoot[prop]?.type == "array" ||
                schemaRoot[prop]?.type == "set") &&
                primitives.has(schemaRoot[prop]?.values)) &&
            schemaRoot[prop]?.type != "ref") {
            nestedStructures.push(prop);
            continue;
        }
        value[prop] = state[prop];
    }
    kv.push({
        key: [...traversalPath, ...(primaryKey ? [primaryKey] : [])],
        value,
    });
    for (let prop of nestedStructures) {
        kv.push(...(0, exports.flattenStateToSchemaPathKV)(schemaRoot[prop], state[prop], [
            ...traversalPath,
            ...(primaryKey ? [primaryKey] : []),
            prop,
        ]));
    }
    for (let prop of arrays) {
        (state?.[prop] ?? []).forEach((element) => {
            const id = (0, exports.getStateId)(schemaRoot[prop].values, element);
            kv.push(...(0, exports.flattenStateToSchemaPathKV)(schemaRoot[prop].values, { ...element, ["(id)"]: id }, [...traversalPath, prop]));
        });
    }
    for (let prop of sets) {
        (state?.[prop] ?? []).forEach((element) => {
            kv.push(...(0, exports.flattenStateToSchemaPathKV)(schemaRoot[prop].values, element, [
                ...traversalPath,
                ...(primaryKey ? [primaryKey] : []),
                prop,
            ]));
        });
    }
    return kv;
};
exports.flattenStateToSchemaPathKV = flattenStateToSchemaPathKV;
const indexArrayDuplicates = (kvs) => {
    let visitedIds = {};
    let out = [];
    for (let { key, value } of kvs) {
        const [, ...decodedPath] = (0, exports.decodeSchemaPath)(key);
        const concatenatedId = decodedPath.reduce((s, part) => {
            if (typeof part != "string" && part?.key == "(id)") {
                return s == "" ? part?.value : s + ":" + part?.value;
            }
            return s;
        }, "");
        if (value["(id)"]) {
            if (visitedIds[concatenatedId] == undefined) {
                visitedIds[concatenatedId] = {
                    count: 0,
                };
            }
            else {
                visitedIds[concatenatedId].count++;
            }
        }
        let updatedKey = key;
        let ids = concatenatedId.split(":").filter((v) => v != "");
        for (let i = 0; i < ids.length; ++i) {
            const id = ids[i];
            const subId = ids.slice(0, i + 1).join(":");
            const count = visitedIds[subId]?.count ?? 0;
            updatedKey = updatedKey.replace(id, `${id}:${count}`);
        }
        if (value["(id)"]) {
            const id = ids[ids.length - 1];
            const count = visitedIds[concatenatedId].count ?? 0;
            value["(id)"] = value["(id)"].replace(id, `${id}:${count}`);
        }
        out.push({ key: updatedKey, value });
    }
    return out;
};
exports.indexArrayDuplicates = indexArrayDuplicates;
const buildObjectsAtPath = (rootSchema, path, properties, out = {}) => {
    // ignore $(store)
    const [, ...decodedPath] = (0, exports.decodeSchemaPath)(path);
    let current = out;
    let currentSchema = rootSchema;
    for (const part of decodedPath) {
        if (typeof part == "string" && currentSchema?.[part]?.type == "set") {
            if (!current[part]) {
                current[part] = [];
            }
            current = current[part];
            currentSchema = currentSchema[part].values;
            continue;
        }
        if (typeof part == "string" && currentSchema?.[part]?.type == "array") {
            if (!current[part]) {
                current[part] = [];
            }
            current = current[part];
            currentSchema = currentSchema[part].values;
            continue;
        }
        if (typeof part == "string") {
            if (!current[part]) {
                current[part] = {};
            }
            current = current[part];
            currentSchema = currentSchema[part];
            continue;
        }
        if (Array.isArray(current)) {
            const element = current?.find?.((v) => v?.[part.key] == part.value) ?? {
                [part.key]: part.value,
            };
            if (!current.find((v) => v?.[part.key] == part.value)) {
                current.push(element);
            }
            current = element;
        }
    }
    for (const prop in properties) {
        current[prop] = properties[prop];
    }
    return out;
};
exports.buildObjectsAtPath = buildObjectsAtPath;
const getSchemaAtPath = (rootSchema, path) => {
    // ignore $(store)
    const [, ...decodedPath] = (0, exports.decodeSchemaPath)(path);
    let currentSchema = rootSchema;
    for (const part of decodedPath) {
        if (typeof part == "string" && currentSchema?.[part]?.type == "set") {
            currentSchema = currentSchema[part].values;
            continue;
        }
        if (typeof part == "string" && currentSchema?.[part]?.type == "array") {
            currentSchema = currentSchema[part].values;
            continue;
        }
        if (typeof part == "string") {
            currentSchema = currentSchema[part];
            continue;
        }
    }
    return currentSchema;
};
const getObjectInStateMap = (stateMap, path) => {
    let current = null;
    const [pluginWrapper, ...decodedPath] = (0, exports.decodeSchemaPath)(path);
    const pluginName = /^\$\((.+)\)$/.exec(pluginWrapper)?.[1] ?? null;
    current = stateMap[pluginName];
    for (let part of decodedPath) {
        if (!current) {
            return null;
        }
        if (typeof part != "string") {
            const { key, value } = part;
            if (Array.isArray(current)) {
                const element = current?.find?.((v) => v?.[key] == value);
                current = element;
            }
            else {
                return null;
            }
        }
        else {
            current = current[part];
        }
    }
    return current ?? null;
};
const cleanArrayIDsFromState = (state) => {
    const out = {};
    for (let prop in state) {
        if (Array.isArray(state[prop])) {
            out[prop] = state[prop].map((v) => {
                if (typeof v == "string" ||
                    typeof v == "number" ||
                    typeof v == "boolean") {
                    return v;
                }
                return cleanArrayIDsFromState(v);
            });
            continue;
        }
        if (state[prop] == null) {
            out[prop] = null;
            continue;
        }
        if (typeof state[prop] == "object") {
            out[prop] = cleanArrayIDsFromState(state[prop]);
            continue;
        }
        if (prop != "(id)") {
            out[prop] = state[prop];
        }
    }
    return out;
};
const generateKVFromStateWithRootSchema = (rootSchema, pluginName, state) => {
    return (0, exports.flattenStateToSchemaPathKV)(rootSchema, state, [
        `$(${pluginName})`,
    ])?.map(({ key, value }) => {
        return {
            key: (0, exports.writePathString)(key),
            value,
        };
    });
};
const iterateSchemaTypes = (types, pluginName) => {
    let out = {};
    for (const prop in types) {
        out[prop] = {};
        if (types[prop]?.type === "set" || types[prop]?.type === "array") {
            out[prop].type = types[prop]?.type;
            out[prop].emptyable = types[prop]?.emptyable ?? true;
            if (typeof types[prop].values == "string" &&
                primitives.has(types[prop].values)) {
                out[prop].values = types[prop].values;
                continue;
            }
            if (typeof types[prop].values == "string" &&
                types[prop].values.split(".").length == 1) {
                out[prop].values = `${pluginName}.${types[prop].values}`;
                continue;
            }
            if (typeof types[prop].values == "object") {
                out[prop].values = iterateSchemaTypes(types[prop].values, pluginName);
                continue;
            }
        }
        if (/^ref<(.+)>$/.test(types[prop].type)) {
            out[prop] = { ...types[prop] };
            const typeGroup = /^ref<(.+)>$/.exec(types[prop].type)[1];
            const splitGroup = typeGroup.split(".");
            if (splitGroup?.length == 1) {
                out[prop].type = `ref<${pluginName}.${typeGroup}>`;
            }
            else {
                out[prop].type = types[prop].type;
            }
            continue;
        }
        if (primitives.has(types[prop]?.type)) {
            out[prop] = types[prop];
            continue;
        }
        if (!types[prop]?.type) {
            out[prop] = iterateSchemaTypes(types[prop], pluginName);
        }
    }
    return out;
};
const drawSchemaTypesFromImports = (schema, pluginName) => {
    const types = Object.keys(schema[pluginName].types).reduce((types, key) => {
        if (key.startsWith(`${pluginName}.`)) {
            return {
                ...types,
                [key]: iterateSchemaTypes(schema[pluginName].types[key], pluginName),
            };
        }
        return {
            ...types,
            [`${pluginName}.${key}`]: iterateSchemaTypes(schema[pluginName].types[key], pluginName),
        };
    }, {});
    return Object.keys(schema[pluginName].imports).reduce((acc, importPluginName) => {
        const importTypes = drawSchemaTypesFromImports(schema, importPluginName);
        return {
            ...acc,
            ...importTypes,
        };
    }, types);
};
const constructDependencySchema = async (plugins) => {
    const [plugin, ...remaining] = plugins;
    const manifest = await (0, exports.getPluginManifest)(plugin.key, plugins);
    if (remaining.length > 0) {
        const upstreamSchema = await (0, exports.constructDependencySchema)(remaining);
        return {
            ...upstreamSchema,
            [plugin.key]: manifest,
        };
    }
    return {
        [plugin.key]: manifest,
    };
};
exports.constructDependencySchema = constructDependencySchema;
const getStateFromKVForPlugin = (schemaMap, kv, pluginName) => {
    const rootSchema = (0, exports.getRootSchemaForPlugin)(schemaMap, pluginName);
    const kvArray = (0, exports.indexArrayDuplicates)(kv);
    let out = {};
    for (let pair of kvArray) {
        out = (0, exports.buildObjectsAtPath)(rootSchema, pair.key, pair.value, out);
    }
    return cleanArrayIDsFromState(out);
};
exports.getStateFromKVForPlugin = getStateFromKVForPlugin;
const getRootSchemaForPlugin = (schemaMap, pluginName) => {
    const schemaWithTypes = drawSchemaTypesFromImports(schemaMap, pluginName);
    const schemaWithStores = iterateSchemaTypes(schemaMap[pluginName].store, pluginName);
    return constructRootSchema({
        types: schemaWithTypes,
    }, schemaWithStores, pluginName);
};
exports.getRootSchemaForPlugin = getRootSchemaForPlugin;
const getRootSchemaMap = (schemaMap) => {
    let rootSchemaMap = {};
    for (let pluginName in schemaMap) {
        rootSchemaMap[pluginName] = (0, exports.getRootSchemaForPlugin)(schemaMap, pluginName);
    }
    return traverseSchemaMapForRefKeyTypes(rootSchemaMap, rootSchemaMap);
};
exports.getRootSchemaMap = getRootSchemaMap;
const getKeyType = (keyPath, rootSchemaMap) => {
    const [pluginWrapper, ...path] = keyPath.split(".");
    let current = null;
    const typeGroup = /^\$\((.+)\)$/.exec(pluginWrapper)?.[1] ?? null;
    if (typeGroup && rootSchemaMap[typeGroup]) {
        current = rootSchemaMap[typeGroup];
    }
    if (current != null) {
        for (let part of path) {
            if (current[part]) {
                current = current[part];
            }
        }
        if (typeof current == "object") {
            for (let prop in current) {
                if (current[prop]?.isKey) {
                    if (typeof current[prop].type == "string" &&
                        (primitives.has(current[prop].type) || current[prop].type == "ref")) {
                        return current[prop].type;
                    }
                    else {
                        return null;
                    }
                }
            }
        }
    }
    return null;
};
const traverseSchemaMapForRefKeyTypes = (schemaMap, rootSchemaMap) => {
    let out = {};
    for (let prop in schemaMap) {
        if (schemaMap?.[prop]?.type == "ref" &&
            schemaMap?.[prop]?.refKeyType == "<?>") {
            const next = { ...schemaMap[prop] };
            const refKeyType = getKeyType(schemaMap?.[prop]?.refType, rootSchemaMap);
            if (refKeyType) {
                next.refKeyType = refKeyType;
            }
            out[prop] = next;
            continue;
        }
        if (typeof schemaMap[prop] == "object") {
            const next = traverseSchemaMapForRefKeyTypes(schemaMap[prop], rootSchemaMap);
            out[prop] = next;
            continue;
        }
        out[prop] = schemaMap[prop];
    }
    return out;
};
const getKVStateForPlugin = (schema, pluginName, stateMap) => {
    const rootUpsteamSchema = (0, exports.getRootSchemaForPlugin)(schema, pluginName);
    const state = (0, exports.defaultVoidedState)(schema, stateMap);
    return generateKVFromStateWithRootSchema(rootUpsteamSchema, pluginName, state?.[pluginName]);
};
exports.getKVStateForPlugin = getKVStateForPlugin;
const getUpstreamDepsInSchemaMap = (schemaMap, pluginName) => {
    const current = schemaMap[pluginName];
    if (Object.keys(current.imports).length == 0) {
        return [];
    }
    const deps = Object.keys(current.imports);
    for (let dep of deps) {
        const upstreamDeps = getUpstreamDepsInSchemaMap(schemaMap, dep);
        deps.push(...upstreamDeps);
    }
    return deps;
};
const getDownstreamDepsInSchemaMap = (schemaMap, pluginName, memo = {}) => {
    if (memo[pluginName]) {
        return [];
    }
    memo[pluginName] = true;
    let out = [];
    for (let dep in schemaMap) {
        if (dep == pluginName) {
            continue;
        }
        if (schemaMap[dep].imports[pluginName]) {
            out.push(dep, ...getDownstreamDepsInSchemaMap(schemaMap, pluginName, memo));
        }
    }
    return out;
};
const refSetFromKey = (key) => {
    const out = [];
    const parts = key.split(".");
    const curr = [];
    for (const part of parts) {
        curr.push(part);
        if (/<.+>$/.test(part)) {
            out.push(curr.join("."));
        }
    }
    return out;
};
/***
 * cascading is heavy but infrequent. It only needs to be
 * called when updating state. Not called when applying diffs
 */
const cascadePluginState = (schemaMap, stateMap, pluginName, rootSchemaMap, memo) => {
    if (!rootSchemaMap) {
        rootSchemaMap = (0, exports.getRootSchemaMap)(schemaMap);
    }
    if (!memo) {
        memo = {};
    }
    const kvs = (0, exports.getKVStateForPlugin)(schemaMap, pluginName, stateMap);
    const removedRefs = new Set();
    let next = [];
    for (const kv of kvs) {
        const key = kv.key;
        const value = {
            ...kv.value,
        };
        const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);
        const containsReferences = Object.keys(subSchema).reduce((hasARef, subSchemaKey) => {
            if (hasARef) {
                return true;
            }
            return subSchema[subSchemaKey]?.type == "ref";
        }, false);
        let shouldDelete = false;
        if (containsReferences) {
            for (let prop in subSchema) {
                if (subSchema[prop]?.type == "ref") {
                    const referencedObject = value[prop]
                        ? getObjectInStateMap(stateMap, value[prop])
                        : null;
                    if (!referencedObject) {
                        if (subSchema[prop]?.onDelete == "nullify") {
                            value[prop] = null;
                        }
                        else {
                            shouldDelete = true;
                            break;
                        }
                    }
                }
            }
        }
        const refs = refSetFromKey(key);
        const containsRemovedRef = refs.reduce((containsRef, refKey) => {
            if (containsRef) {
                return true;
            }
            return removedRefs.has(refKey);
        }, false);
        if (!shouldDelete && !containsRemovedRef) {
            next.push({
                key,
                value,
            });
        }
        else {
            removedRefs.add(key);
        }
    }
    const newPluginState = (0, exports.getStateFromKVForPlugin)(schemaMap, next, pluginName);
    const nextStateMap = { ...stateMap, [pluginName]: newPluginState };
    if (next.length != kvs.length) {
        return (0, exports.cascadePluginState)(schemaMap, { ...stateMap, [pluginName]: newPluginState }, pluginName, rootSchemaMap, memo);
    }
    const downstreamDeps = getDownstreamDepsInSchemaMap(schemaMap, pluginName);
    const result = downstreamDeps.reduce((stateMap, dependentPluginName) => {
        if (memo[`${pluginName}:${dependentPluginName}`]) {
            return {
                ...stateMap,
                ...memo[`${pluginName}:${dependentPluginName}`],
            };
        }
        const result = {
            ...stateMap,
            ...(0, exports.cascadePluginState)(schemaMap, stateMap, dependentPluginName, rootSchemaMap, memo),
        };
        memo[`${pluginName}:${dependentPluginName}`] = result;
        return result;
    }, nextStateMap);
    return result;
};
exports.cascadePluginState = cascadePluginState;
const validatePluginState = (schemaMap, stateMap, pluginName) => {
    const rootSchemaMap = (0, exports.getRootSchemaMap)(schemaMap);
    // ignore $(store)
    const [, ...kvs] = (0, exports.getKVStateForPlugin)(schemaMap, pluginName, stateMap);
    for (const { key, value } of kvs) {
        const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);
        for (let prop in subSchema) {
            if (subSchema[prop]?.type == "array" || subSchema[prop]?.type == "set") {
                if (!subSchema[prop]?.emptyable) {
                    const referencedObject = getObjectInStateMap(stateMap, key);
                    if ((referencedObject?.[prop]?.length ?? 0) == 0) {
                        return false;
                    }
                }
                continue;
            }
            if (subSchema[prop]?.type &&
                (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
                value[prop] == null) {
                return false;
            }
        }
    }
    return true;
};
exports.validatePluginState = validatePluginState;
const objectIsSubsetOfObject = (current, next) => {
    if (typeof current != "object") {
        return false;
    }
    if (typeof next != "object") {
        return false;
    }
    let nested = [];
    for (let prop in current) {
        if (typeof current[prop] == "object" && typeof next[prop] == "object") {
            nested.push([current[prop], next[prop]]);
            continue;
        }
        if (current[prop] != next[prop]) {
            return false;
        }
    }
    return nested.reduce((match, [c, n]) => {
        if (!match) {
            return false;
        }
        return objectIsSubsetOfObject(c, n);
    }, true);
};
const pluginManifestIsSubsetOfManifest = (currentSchemaMap, nextSchemaMap, pluginName) => {
    const currentDeps = [
        pluginName,
        ...getUpstreamDepsInSchemaMap(currentSchemaMap, pluginName),
    ];
    const currentGraph = currentDeps.reduce((graph, plugin) => {
        return {
            ...graph,
            [plugin]: (0, exports.getRootSchemaForPlugin)(currentSchemaMap, plugin),
        };
    }, {});
    const nextDeps = [
        pluginName,
        ...getUpstreamDepsInSchemaMap(nextSchemaMap, pluginName),
    ];
    const nextGraph = nextDeps.reduce((graph, plugin) => {
        return {
            ...graph,
            [plugin]: (0, exports.getRootSchemaForPlugin)(nextSchemaMap, plugin),
        };
    }, {});
    return objectIsSubsetOfObject(currentGraph, nextGraph);
};
exports.pluginManifestIsSubsetOfManifest = pluginManifestIsSubsetOfManifest;
const isTopologicalSubset = (oldSchemaMap, oldStateMap, newSchemaMap, newStateMap, pluginName) => {
    if (!oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
        return true;
    }
    if (oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
        return false;
    }
    if (!(0, exports.pluginManifestIsSubsetOfManifest)(oldSchemaMap, newSchemaMap, pluginName)) {
        return false;
    }
    const oldKVs = (0, exports.getKVStateForPlugin)(oldSchemaMap, pluginName, oldStateMap)
        .map(({ key }) => key)
        ?.filter((key) => {
        // remove array refs, since unstable
        if (/\(id\)<.+>/.test(key)) {
            return false;
        }
        return true;
    });
    const newKVs = (0, exports.getKVStateForPlugin)(newSchemaMap, pluginName, newStateMap).map(({ key }) => key);
    const newKVsSet = new Set(newKVs);
    for (let key of oldKVs) {
        if (!newKVsSet.has(key)) {
            return false;
        }
    }
    return true;
};
exports.isTopologicalSubset = isTopologicalSubset;
const isTopologicalSubsetValid = (oldSchemaMap, oldStateMap, newSchemaMap, newStateMap, pluginName) => {
    if (!(0, exports.isTopologicalSubset)(oldSchemaMap, oldStateMap, newSchemaMap, newStateMap, pluginName)) {
        return false;
    }
    // we need to apply old schema against new data to ensure valid/safe
    // otherwise we would examine props outside of the subspace that may
    // be invalid in the new version but dont exist in the old version
    const oldRootSchemaMap = (0, exports.getRootSchemaMap)(oldSchemaMap);
    // ignore $(store)
    const [, ...oldKVs] = (0, exports.getKVStateForPlugin)(oldSchemaMap, pluginName, oldStateMap).map(({ key }) => key);
    const oldKVsSet = new Set(oldKVs);
    // ignore $(store)
    const [, ...newKVs] = (0, exports.getKVStateForPlugin)(newSchemaMap, pluginName, newStateMap).filter(({ key }) => oldKVsSet.has(key));
    // we can check against newKV since isTopologicalSubset check ensures the key
    // intersection already exists. Here we just have to ensure the new values are
    // compatible against the old schema
    for (const { key, value } of newKVs) {
        const subSchema = getSchemaAtPath(oldRootSchemaMap[pluginName], key);
        for (let prop in subSchema) {
            if (subSchema[prop]?.type == "array" || subSchema[prop]?.type == "set") {
                if (!subSchema[prop]?.emptyable) {
                    const referencedObject = getObjectInStateMap(newStateMap, key);
                    if ((referencedObject?.[prop]?.length ?? 0) == 0) {
                        return false;
                    }
                }
                continue;
            }
            if (subSchema[prop]?.type &&
                (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
                value[prop] == null) {
                return false;
            }
        }
    }
    return true;
};
exports.isTopologicalSubsetValid = isTopologicalSubsetValid;
//# sourceMappingURL=plugins.js.map