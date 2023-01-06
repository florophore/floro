"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKVStateForPlugin = exports.getRootSchemaForPlugin = exports.constructDependencySchema = exports.drawSchemaTypesFromImports = exports.iterateSchemaTypes = exports.generateStateFromKV = exports.generateKVFromState = exports.buildObjectsAtPath = exports.flattenStateToSchemaPathKV = exports.decodeSchemaPath = exports.writePathString = exports.constructRootSchema = exports.containsCyclicTypes = exports.primitives = exports.getUpstreamDependencyList = exports.hasPlugin = exports.getPluginManifest = exports.readDevPluginManifest = void 0;
const filestructure_1 = require("./filestructure");
const axios_1 = __importDefault(require("axios"));
const pluginsJSON = (0, filestructure_1.getPluginsJson)();
const readDevPluginManifest = async (pluginName) => {
    if (!pluginsJSON.plugins[pluginName]) {
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
    // TODO ADD COMPILED PLUGIN CHECK HERE
};
exports.readDevPluginManifest = readDevPluginManifest;
const getPluginManifest = async (pluginName, plugins) => {
    const pluginInfo = plugins.find((v) => v.key == pluginName);
    if (!pluginInfo) {
        return;
    }
    if (pluginInfo.value == "dev") {
        return await (0, exports.readDevPluginManifest)(pluginName);
    }
    // todo implement semver
    return null;
};
exports.getPluginManifest = getPluginManifest;
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
exports.primitives = new Set(["int", "float", "boolean", "string"]);
const containsCyclicTypes = (schema, struct, visited = {}) => {
    for (const prop in struct) {
        if (struct[prop].type == "collection") {
            if (visited[struct[prop].values] ||
                (0, exports.containsCyclicTypes)(schema, schema.types[struct[prop].values], {
                    ...visited,
                    [struct[prop].values]: true,
                })) {
                return true;
            }
        }
        else if (schema.types[struct[prop].type]) {
            if (visited[struct[prop].type] ||
                (0, exports.containsCyclicTypes)(schema, schema.types[struct[prop].type], {
                    ...visited,
                    [schema.types[struct[prop].type]]: true,
                })) {
                return true;
            }
        }
        else if (!struct[prop]?.type) {
            if ((0, exports.containsCyclicTypes)(schema, struct[prop], {
                ...visited,
            })) {
                return true;
            }
        }
    }
    return false;
};
exports.containsCyclicTypes = containsCyclicTypes;
const constructRootSchema = (schema, struct, pluginName) => {
    let out = {};
    for (const prop in struct) {
        out[prop] = {};
        if (struct[prop]?.type == "collection") {
            if (exports.primitives.has(struct[prop]?.values)) {
                out[prop].type = "collection";
                out[prop].values = (0, exports.constructRootSchema)(schema, struct[prop]?.values, pluginName);
                continue;
            }
            if (schema.types[struct[prop]?.values]) {
                out[prop].type = "collection";
                out[prop].values = (0, exports.constructRootSchema)(schema, schema.types[struct[prop]?.values], pluginName);
                continue;
            }
        }
        if (exports.primitives.has(struct[prop]?.type)) {
            out[prop] = struct[prop];
            continue;
        }
        if (/^ref<([A-z-_\.]+)>$/.test(struct[prop].type)) {
            const typeName = /^ref<([A-z-_\.]+)>$/.exec(struct[prop].type)[1];
            if (exports.primitives.has(typeName)) {
                out[prop] = struct[prop];
                out[prop].type = "ref";
                out[prop].refType = typeName;
                out[prop].refKeyType = typeName;
            }
            else {
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
                if (struct?.[prop]?.path?.startsWith("$.")) {
                    out[prop].path = struct[prop].path.replace("$.", `$(${pluginName}).`);
                }
                else {
                    out[prop].path = struct[prop].path;
                }
                out[prop].type = "ref";
                out[prop].refType = typeName;
                out[prop].refKeyType = key.type;
                if (struct[prop].isKey) {
                    out[prop].isKey = true;
                }
                continue;
            }
        }
        if (schema.types[struct[prop].type]) {
            out[prop] = (0, exports.constructRootSchema)(schema, schema.types[struct[prop].type], pluginName);
            continue;
        }
        if (!struct[prop]?.type) {
            out[prop] = (0, exports.constructRootSchema)(schema, struct[prop], pluginName);
            continue;
        }
    }
    return out;
};
exports.constructRootSchema = constructRootSchema;
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
const flattenStateToSchemaPathKV = (schemaRoot, state, traversalPath) => {
    const kv = [];
    const collections = [];
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
        if (schemaRoot[prop]?.type == "collection") {
            collections.push(prop);
            continue;
        }
        if (!exports.primitives.has(schemaRoot[prop]?.type) &&
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
    for (let prop of collections) {
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
const buildObjectsAtPath = (rootSchema, path, properties, out = {}) => {
    // ignore $(store)
    const [, ...decodedPath] = (0, exports.decodeSchemaPath)(path);
    let current = out;
    let currentSchema = rootSchema;
    for (const part of decodedPath) {
        if (typeof part == "string" &&
            currentSchema?.[part]?.type == "collection") {
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
const generateKVFromState = (schema, state, pluginName) => {
    const hasCycle = (0, exports.containsCyclicTypes)(schema, schema.store);
    if (hasCycle) {
        console.error("type cycle detected, try using references");
        return;
    }
    const rootSchema = (0, exports.constructRootSchema)(schema, schema.store, pluginName);
    // type check schema again state
    return (0, exports.flattenStateToSchemaPathKV)(rootSchema, state, [
        `"$(${pluginName})`,
    ])?.map(({ key, value }) => {
        return {
            key: (0, exports.writePathString)(key),
            value,
        };
    });
};
exports.generateKVFromState = generateKVFromState;
const generateStateFromKV = (schema, kv, pluginName) => {
    const hasCycle = (0, exports.containsCyclicTypes)(schema, schema.store);
    if (hasCycle) {
        console.error("type cycle detected, try using references");
        return;
    }
    const rootSchema = (0, exports.constructRootSchema)(schema, schema.store, pluginName);
    // type check schema again state
    let out = {};
    for (let pair of kv) {
        out = (0, exports.buildObjectsAtPath)(rootSchema, pair.key, pair.value, out);
    }
    return out;
};
exports.generateStateFromKV = generateStateFromKV;
const iterateSchemaTypes = (types, pluginName) => {
    let out = {};
    for (const prop in types) {
        out[prop] = {};
        if (types[prop]?.type === "collection") {
            out[prop].type = "collection";
            if (typeof types[prop].values == "string" &&
                types[prop].values.split(".").length == 1) {
                out[prop].values = `${pluginName}.${types[prop].values}`;
                continue;
            }
            if (typeof types[prop].values == "object") {
                out[prop].values = (0, exports.iterateSchemaTypes)(types[prop].values, pluginName);
                continue;
            }
        }
        if (/^ref<([A-z-_\.]+)>$/.test(types[prop].type)) {
            out[prop] = { ...types[prop] };
            const typeGroup = /^ref<([A-z-_\.]+)>$/.exec(types[prop].type)[1];
            const splitGroup = typeGroup.split(".");
            if (splitGroup?.length == 1) {
                out[prop].type = `ref<${pluginName}.${typeGroup}>`;
            }
            else {
                out[prop].type = types[prop].type;
            }
            if (typeof types?.[prop]?.path == "string" &&
                types?.[prop]?.path?.startsWith("$.")) {
                out[prop].path = types[prop].path.replace("$.", `$(${pluginName}).`);
            }
            else {
                out[prop].path = types[prop].path;
            }
            continue;
        }
        if (exports.primitives.has(types[prop]?.type)) {
            out[prop] = types[prop];
            continue;
        }
        if (!types[prop]?.type) {
            out[prop] = (0, exports.iterateSchemaTypes)(types[prop], pluginName);
        }
    }
    return out;
};
exports.iterateSchemaTypes = iterateSchemaTypes;
const drawSchemaTypesFromImports = (schema, pluginName) => {
    const types = Object.keys(schema[pluginName].types).reduce((types, key) => {
        if (key.startsWith(`${pluginName}.`)) {
            return {
                ...types,
                [key]: (0, exports.iterateSchemaTypes)(schema[pluginName].types[key], pluginName),
            };
        }
        return {
            ...types,
            [`${pluginName}.${key}`]: (0, exports.iterateSchemaTypes)(schema[pluginName].types[key], pluginName),
        };
    }, {});
    return Object.keys(schema[pluginName].imports).reduce((acc, importPluginName) => {
        const importTypes = (0, exports.drawSchemaTypesFromImports)(schema, importPluginName);
        return {
            ...acc,
            ...importTypes,
        };
    }, types);
};
exports.drawSchemaTypesFromImports = drawSchemaTypesFromImports;
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
const getRootSchemaForPlugin = (schema, manifest, pluginName) => {
    const schemaWithTypes = (0, exports.drawSchemaTypesFromImports)(schema, pluginName);
    const schemaWithStores = (0, exports.iterateSchemaTypes)(manifest.store, pluginName);
    return (0, exports.constructRootSchema)({
        types: schemaWithTypes,
    }, schemaWithStores, pluginName);
};
exports.getRootSchemaForPlugin = getRootSchemaForPlugin;
const getKVStateForPlugin = (schema, manifest, pluginName, state) => {
    const rootUpsteamSchema = (0, exports.getRootSchemaForPlugin)(schema, manifest, pluginName);
    const pluginKVState = (0, exports.flattenStateToSchemaPathKV)(rootUpsteamSchema, state ?? {}, [`$(${pluginName})`]);
    return pluginKVState?.map(({ key, value }) => {
        return {
            key: (0, exports.writePathString)(key),
            value,
        };
    });
};
exports.getKVStateForPlugin = getKVStateForPlugin;
//# sourceMappingURL=plugins.js.map