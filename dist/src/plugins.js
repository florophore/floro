"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectKeyRefs = exports.invalidSchemaPropsCheck = exports.isSchemaValid = exports.isTopologicalSubsetValid = exports.isTopologicalSubset = exports.pluginManifestIsSubsetOfManifest = exports.getPluginInvalidStateIndices = exports.validatePluginState = exports.nullifyMissingFileRefs = exports.reIndexSchemaArrays = exports.cascadePluginStateDeprecated = exports.cascadePluginState = exports.recursivelyCheckIfReferenceExists = exports.compileStatePointers = exports.getDownstreamDepsInSchemaMap = exports.getUpstreamDepsInSchemaMap = exports.getKVStateForPlugin = exports.getRootSchemaMap = exports.getRootSchemaForPlugin = exports.getExpandedTypesForPlugin = exports.getStateFromKVForPlugin = exports.buildObjectsAtPath = exports.indexArrayDuplicates = exports.flattenStateToSchemaPathKV = exports.getStateId = exports.decodeSchemaPathWithArrays = exports.decodeSchemaPath = exports.writePathStringWithArrays = exports.writePathString = exports.defaultVoidedState = exports.validatePluginManifest = exports.containsCyclicTypes = exports.schemaHasInvalidTypeSytax = exports.schemaManifestHasInvalidSyntax = exports.getSchemaMapForManifest = exports.verifyPluginDependencyCompatability = exports.coalesceDependencyVersions = exports.getUpstreamDependencyManifests = exports.getDependenciesForManifest = exports.hasPluginManifest = exports.hasPlugin = exports.manifestListToPluginList = exports.manifestListToSchemaMap = exports.pluginMapToList = exports.pluginListToMap = exports.getManifestMapFromManifestList = exports.getPluginManifests = exports.topSortManifests = exports.schemaMapsAreCompatible = exports.pluginManifestsAreCompatibleForUpdate = void 0;
exports.drawGetPluginStore = exports.drawGetReferencedObject = exports.drawRefReturnTypes = exports.drawSchemaRoot = exports.drawMakeQueryRef = exports.buildPointerArgsMap = exports.buildPointerReturnTypeMap = exports.typestructsAreEquivalent = exports.replaceRawRefsInExpandedType = exports.replaceRefVarsWithWildcards = void 0;
const axios_1 = __importDefault(require("axios"));
const semver_1 = __importDefault(require("semver"));
axios_1.default.defaults.validateStatus = function () {
    return true;
};
const primitives = new Set(["int", "float", "boolean", "string", "file"]);
const pluginManifestsAreCompatibleForUpdate = async (datasource, oldManifest, newManifest) => {
    const oldSchemaMap = await (0, exports.getSchemaMapForManifest)(datasource, oldManifest);
    const newSchemaMap = await (0, exports.getSchemaMapForManifest)(datasource, newManifest);
    if (!oldSchemaMap) {
        return null;
    }
    if (!newSchemaMap) {
        return null;
    }
    return await asyncReduce(true, Object.keys(newSchemaMap).map((k) => newSchemaMap[k]), async (isCompatible, newManifest) => {
        if (!isCompatible) {
            return false;
        }
        if (!oldSchemaMap[newManifest.name]) {
            return true;
        }
        return await (0, exports.pluginManifestIsSubsetOfManifest)(datasource, oldSchemaMap, newSchemaMap);
    });
};
exports.pluginManifestsAreCompatibleForUpdate = pluginManifestsAreCompatibleForUpdate;
const schemaMapsAreCompatible = async (datasource, oldSchemaMap, newSchemaMap) => {
    if (!oldSchemaMap) {
        return null;
    }
    if (!newSchemaMap) {
        return null;
    }
    const isSubSet = await (0, exports.pluginManifestIsSubsetOfManifest)(datasource, oldSchemaMap, newSchemaMap);
    return isSubSet;
};
exports.schemaMapsAreCompatible = schemaMapsAreCompatible;
const topSortManifests = (manifests) => {
    const lexicallySortedManifests = manifests.sort((a, b) => {
        if (a.name == b.name)
            return 0;
        return a.name > b.name ? 1 : -1;
    });
    const visited = new Set();
    const manifestMap = (0, exports.manifestListToSchemaMap)(lexicallySortedManifests);
    const out = [];
    for (const manifest of lexicallySortedManifests) {
        if (visited.has(manifest.name)) {
            continue;
        }
        const upstreamDeps = (0, exports.getUpstreamDepsInSchemaMap)(manifestMap, manifest.name).map((pluginName) => manifestMap[pluginName]);
        const depsToAdd = (0, exports.topSortManifests)(upstreamDeps);
        for (const upstreamDep of depsToAdd) {
            if (!visited.has(upstreamDep.name)) {
                visited.add(upstreamDep.name);
                out.push(upstreamDep);
            }
        }
        visited.add(manifest.name);
        out.push(manifest);
    }
    return out;
};
exports.topSortManifests = topSortManifests;
const getPluginManifests = async (datasource, pluginList) => {
    const manifests = await Promise.all(pluginList.map(({ key: pluginName, value: pluginVersion }) => {
        return datasource.getPluginManifest(pluginName, pluginVersion);
    }));
    return manifests?.filter((manifest) => {
        if (manifest == null) {
            return false;
        }
        return true;
    });
};
exports.getPluginManifests = getPluginManifests;
const getManifestMapFromManifestList = (manifests) => {
    return manifests.reduce((acc, manifest) => {
        return {
            ...acc,
            [manifest.name]: manifest,
        };
    }, {});
};
exports.getManifestMapFromManifestList = getManifestMapFromManifestList;
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
const manifestListToPluginList = (manifestList) => {
    return manifestList.map((p) => {
        return {
            key: p.name,
            value: p.version,
        };
    });
};
exports.manifestListToPluginList = manifestListToPluginList;
const hasPlugin = (pluginName, plugins) => {
    for (const { key } of plugins) {
        if (key === pluginName) {
            return true;
        }
    }
    return false;
};
exports.hasPlugin = hasPlugin;
const hasPluginManifest = (manifest, manifests) => {
    for (const { name, version } of manifests) {
        if (name === manifest.name && version === manifest.version) {
            return true;
        }
    }
    return false;
};
exports.hasPluginManifest = hasPluginManifest;
const getDependenciesForManifest = async (datasource, manifest, seen = {}) => {
    const deps = [];
    for (const pluginName in manifest.imports) {
        if (seen[pluginName]) {
            return {
                status: "error",
                reason: `cyclic dependency imports in ${pluginName}`,
            };
        }
        try {
            const pluginManifest = await datasource.getPluginManifest(pluginName, manifest.imports[pluginName]);
            if (!pluginManifest) {
                return {
                    status: "error",
                    reason: `cannot fetch manifest for ${pluginName}`,
                };
            }
            const depResult = await (0, exports.getDependenciesForManifest)(datasource, pluginManifest, {
                ...seen,
                [manifest.name]: true,
            });
            if (depResult.status == "error") {
                return depResult;
            }
            deps.push(pluginManifest, ...depResult.deps);
        }
        catch (e) {
            return {
                status: "error",
                reason: `cannot fetch manifest for ${pluginName}`,
            };
        }
    }
    return {
        status: "ok",
        deps,
    };
};
exports.getDependenciesForManifest = getDependenciesForManifest;
const getUpstreamDependencyManifests = async (datasource, manifest, memo = {}) => {
    if (memo[manifest.name + "-" + manifest.version]) {
        return memo[manifest.name + "-" + manifest.version];
    }
    const deps = [manifest];
    for (const dependentPluginName in manifest.imports) {
        const dependentManifest = await datasource.getPluginManifest(dependentPluginName, manifest.imports[dependentPluginName]);
        if (!dependentManifest) {
            return null;
        }
        const subDeps = await (0, exports.getUpstreamDependencyManifests)(datasource, dependentManifest, memo);
        if (subDeps == null) {
            return null;
        }
        for (const dep of subDeps) {
            if (!(0, exports.hasPluginManifest)(dep, deps)) {
                deps.push(dep);
            }
        }
    }
    memo[manifest.name + "-" + manifest.version] = deps;
    return deps;
};
exports.getUpstreamDependencyManifests = getUpstreamDependencyManifests;
const coalesceDependencyVersions = (deps) => {
    try {
        return deps.reduce((acc, manifest) => {
            if (acc[manifest.name]) {
                const semList = [manifest.version, ...acc[manifest.name]].sort((a, b) => {
                    if (semver_1.default.eq(a, b)) {
                        return 0;
                    }
                    return semver_1.default.gt(a, b) ? 1 : -1;
                });
                return {
                    ...acc,
                    [manifest.name]: semList,
                };
            }
            return {
                ...acc,
                [manifest.name]: [manifest.version],
            };
        }, {});
    }
    catch (e) {
        return null;
    }
};
exports.coalesceDependencyVersions = coalesceDependencyVersions;
const verifyPluginDependencyCompatability = async (datasource, deps) => {
    const depsMap = (0, exports.coalesceDependencyVersions)(deps);
    if (!depsMap) {
        return {
            isValid: false,
            status: "error",
            reason: "incompatible",
        };
    }
    for (const pluginName in depsMap) {
        if (depsMap[pluginName].length <= 1) {
            continue;
        }
        for (let i = 1; i < depsMap[pluginName].length; ++i) {
            const lastManifest = deps.find((v) => v.name == pluginName && v.version == depsMap[pluginName][i - 1]);
            if (!lastManifest) {
                return {
                    isValid: false,
                    status: "error",
                    reason: "dep_fetch",
                    pluginName,
                    pluginVersion: depsMap[pluginName][i - 1],
                };
            }
            const nextManifest = deps.find((v) => v.name == pluginName && v.version == depsMap[pluginName][i]);
            if (!nextManifest) {
                return {
                    isValid: false,
                    status: "error",
                    reason: "dep_fetch",
                    pluginName,
                    pluginVersion: depsMap[pluginName][i],
                };
            }
            const lastDeps = await (0, exports.getDependenciesForManifest)(datasource, lastManifest);
            if (!lastDeps) {
                return {
                    isValid: false,
                    status: "error",
                    reason: "dep_fetch",
                    pluginName,
                    pluginVersion: depsMap[pluginName][i - 1],
                };
            }
            const nextDeps = await (0, exports.getDependenciesForManifest)(datasource, nextManifest);
            if (!nextDeps) {
                return {
                    isValid: false,
                    status: "error",
                    reason: "dep_fetch",
                    pluginName,
                    pluginVersion: depsMap[pluginName][i],
                };
            }
            // need to coalesce
            const lastSchemaMap = (0, exports.manifestListToSchemaMap)([
                lastManifest,
                ...lastDeps.deps,
            ]);
            // need to coalesce
            const nextSchemaMap = (0, exports.manifestListToSchemaMap)([
                nextManifest,
                ...nextDeps.deps,
            ]);
            const areCompatible = await (0, exports.pluginManifestIsSubsetOfManifest)(datasource, lastSchemaMap, nextSchemaMap);
            if (!areCompatible) {
                return {
                    isValid: false,
                    status: "error",
                    reason: "incompatible",
                    pluginName,
                    lastVersion: depsMap[pluginName][i - 1],
                    nextVersion: depsMap[pluginName][i],
                };
            }
        }
    }
    return {
        isValid: true,
        status: "ok",
    };
};
exports.verifyPluginDependencyCompatability = verifyPluginDependencyCompatability;
const getSchemaMapForManifest = async (datasource, manifest) => {
    const deps = await (0, exports.getUpstreamDependencyManifests)(datasource, manifest);
    if (!deps) {
        return null;
    }
    const areValid = await (0, exports.verifyPluginDependencyCompatability)(datasource, deps);
    if (!areValid.isValid) {
        return null;
    }
    const depsMap = (0, exports.coalesceDependencyVersions)(deps);
    const out = {};
    for (const pluginName in depsMap) {
        const maxVersion = depsMap[pluginName][depsMap[pluginName].length - 1];
        const depManifest = deps.find((v) => v.name == pluginName && v.version == maxVersion);
        if (!depManifest) {
            return null;
        }
        out[depManifest.name] = depManifest;
    }
    out[manifest.name] = manifest;
    return out;
};
exports.getSchemaMapForManifest = getSchemaMapForManifest;
const schemaManifestHasInvalidSyntax = (schema) => {
    if (!schema?.store) {
        return {
            isInvalid: true,
            error: "Store cannot be empty",
        };
    }
    if (typeof schema?.store != "object") {
        return {
            isInvalid: true,
            error: "Store must be an object",
        };
    }
    if (Object.keys(schema.store).length == 0) {
        return {
            isInvalid: true,
            error: "Store cannot be empty",
        };
    }
    if (!schema?.types) {
        return {
            isInvalid: true,
            error: "Types cannot be empty",
        };
    }
    if (typeof schema?.types != "object") {
        return {
            isInvalid: true,
            error: "Types must be an object",
        };
    }
    if (!schema?.imports) {
        return {
            isInvalid: true,
            error: "Imports cannot be empty",
        };
    }
    if (typeof schema?.imports != "object") {
        return {
            isInvalid: true,
            error: "Imports must be an object",
        };
    }
    return (0, exports.schemaHasInvalidTypeSytax)(schema, schema.store);
};
exports.schemaManifestHasInvalidSyntax = schemaManifestHasInvalidSyntax;
const schemaHasInvalidTypeSytax = (schema, struct, visited = {}) => {
    for (const prop in struct) {
        if (visited[struct[prop]?.type]) {
            continue;
        }
        if (typeof struct[prop].type == "string" &&
            struct[prop]?.type?.startsWith("$")) {
            return {
                isInvalid: true,
                error: `${prop} in \n${JSON.stringify(struct, null, 2)}\n type value cannot start with $`,
            };
        }
        if (struct[prop].type == "set" ||
            struct[prop].type == "array") {
            if (typeof struct[prop].values == "string" &&
                struct[prop]?.values?.startsWith("$")) {
                return {
                    isInvalid: true,
                    error: `${prop} in \n${JSON.stringify(struct, null, 2)}\n values value cannot start with $`,
                };
            }
            if (typeof struct[prop].values == "string" &&
                primitives.has(struct[prop].values)) {
                continue;
            }
            if (typeof struct[prop].values != "string") {
                const syntaxCheck = (0, exports.schemaHasInvalidTypeSytax)(schema, struct[prop].values, {
                    ...visited,
                });
                if (syntaxCheck.isInvalid) {
                    return syntaxCheck;
                }
                continue;
            }
            if (typeof struct[prop].values == "string" &&
                schema.types[struct[prop].values]) {
                const syntaxCheck = (0, exports.schemaHasInvalidTypeSytax)(schema, schema.types[struct[prop].values], {
                    ...visited,
                    [struct[prop].values]: true,
                });
                if (syntaxCheck.isInvalid) {
                    return syntaxCheck;
                }
            }
            continue;
        }
        if (schema.types[struct[prop].type]) {
            const syntaxCheck = (0, exports.schemaHasInvalidTypeSytax)(schema, schema.types[struct[prop].type], {
                ...visited,
                [struct[prop].type]: true,
            });
            if (syntaxCheck.isInvalid) {
                return syntaxCheck;
            }
            continue;
        }
        if (!struct[prop]?.type) {
            if (typeof struct[prop] == "string") {
                return {
                    isInvalid: true,
                    error: `${prop} in \n${JSON.stringify(struct, null, 2)}\n canot be a string value, found "${struct[prop]}". Perhaps try changing to type \n${JSON.stringify({ ...struct, [prop]: { type: struct[prop] } }, null, 2)}`,
                };
            }
            const syntaxCheck = (0, exports.schemaHasInvalidTypeSytax)(schema, struct[prop], {
                ...visited,
            });
            if (syntaxCheck.isInvalid) {
                return syntaxCheck;
            }
        }
    }
    return { isInvalid: false };
};
exports.schemaHasInvalidTypeSytax = schemaHasInvalidTypeSytax;
const containsCyclicTypes = (schema, struct, visited = {}) => {
    for (const prop in struct) {
        if (struct[prop].type == "set" ||
            (struct[prop].type == "array" &&
                !primitives.has(struct[prop].values))) {
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
                    [struct[prop].type]: true,
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
const validatePluginManifest = async (datasource, manifest) => {
    try {
        const syntaxCheck = (0, exports.schemaManifestHasInvalidSyntax)(manifest);
        if (syntaxCheck.isInvalid) {
            return {
                status: "error",
                message: syntaxCheck.error,
            };
        }
        if ((0, exports.containsCyclicTypes)(manifest, manifest.store)) {
            return {
                status: "error",
                message: `${manifest.name}'s schema contains cyclic types, consider using references`,
            };
        }
        const deps = await (0, exports.getUpstreamDependencyManifests)(datasource, manifest);
        if (!deps) {
            return {
                status: "error",
                message: "failed to get upstream dependencies.",
            };
        }
        const areValid = await (0, exports.verifyPluginDependencyCompatability)(datasource, deps);
        if (!areValid.isValid) {
            if (areValid.reason == "dep_fetch") {
                return {
                    status: "error",
                    message: `failed to fetch dependency ${areValid.pluginName}@${areValid.pluginVersion}`,
                };
            }
            if (areValid.reason == "incompatible") {
                return {
                    status: "error",
                    message: `incompatible dependency versions for ${areValid.pluginName} between version ${areValid.lastVersion} and ${areValid.nextVersion}`,
                };
            }
        }
        const schemaMap = await (0, exports.getSchemaMapForManifest)(datasource, manifest);
        if (!schemaMap) {
            return {
                status: "error",
                message: "failed to construct schema map",
            };
        }
        const expandedTypes = (0, exports.getExpandedTypesForPlugin)(schemaMap, manifest.name);
        const rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
        const hasValidPropsType = (0, exports.invalidSchemaPropsCheck)(schemaMap[manifest.name].store, rootSchemaMap[manifest.name], [`$(${manifest.name})`]);
        if (hasValidPropsType.status == "error") {
            return hasValidPropsType;
        }
        return (0, exports.isSchemaValid)(rootSchemaMap, schemaMap, rootSchemaMap, expandedTypes);
    }
    catch (e) {
        return {
            status: "error",
            message: e?.toString?.() ?? "unknown error",
        };
    }
};
exports.validatePluginManifest = validatePluginManifest;
const constructRootSchema = (schema, struct, pluginName) => {
    const out = {};
    const sortedStructedProps = Object.keys(struct).sort();
    for (const prop of sortedStructedProps) {
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
            const typeName = /^ref<(.+)>$/.exec(struct[prop].type)?.[1];
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
                for (const p in type) {
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
const defaultVoidedState = async (datasource, schemaMap, stateMap) => {
    const rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
    const defaultedState = {};
    for (const pluginName of Object.keys(rootSchemaMap)) {
        const struct = rootSchemaMap[pluginName];
        const state = stateMap?.[pluginName] ?? {};
        defaultedState[pluginName] = sanitizePrimitivesWithSchema(struct, defaultMissingSchemaState(struct, state, stateMap));
    }
    return defaultedState;
};
exports.defaultVoidedState = defaultVoidedState;
const defaultMissingSchemaState = (struct, state, stateMap) => {
    const out = {};
    for (const prop in struct) {
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
    const out = {};
    for (const prop in struct) {
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
            (struct[prop].values == "string" || struct[prop].values == "file")) {
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
            out[prop] =
                (state?.[prop] ?? [])?.map((value) => {
                    return sanitizePrimitivesWithSchema(struct[prop]?.values, value);
                }) ?? [];
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
        if (struct[prop]?.type == "file") {
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
const writePathStringWithArrays = (pathParts) => {
    return pathParts
        .map((part) => {
        if (typeof part == "string") {
            return part;
        }
        if (typeof part == "number") {
            return `[${part}]`;
        }
        return `${part.key}<${part.value}>`;
    })
        .join(".");
};
exports.writePathStringWithArrays = writePathStringWithArrays;
const extractKeyValueFromRefString = (str) => {
    let key = "";
    let i = 0;
    while (str[i] != "<") {
        key += str[i++];
    }
    let value = "";
    let counter = 1;
    i++;
    while (i < str.length) {
        if (str[i] == "<")
            counter++;
        if (str[i] == ">")
            counter--;
        if (counter >= 1) {
            value += str[i];
        }
        i++;
    }
    return {
        key,
        value,
    };
};
const getCounterArrowBalanance = (str) => {
    let counter = 0;
    for (let i = 0; i < str.length; ++i) {
        if (str[i] == "<")
            counter++;
        if (str[i] == ">")
            counter--;
    }
    return counter;
};
const splitPath = (str) => {
    const out = [];
    let arrowBalance = 0;
    let curr = "";
    for (let i = 0; i <= str.length; ++i) {
        if (i == str.length) {
            out.push(curr);
            continue;
        }
        if (arrowBalance == 0 && str[i] == ".") {
            out.push(curr);
            curr = "";
            continue;
        }
        if (str[i] == "<") {
            arrowBalance++;
        }
        if (str[i] == ">") {
            arrowBalance--;
        }
        curr += str[i];
    }
    return out;
};
const decodeSchemaPath = (pathString) => {
    return splitPath(pathString).map((part) => {
        if (/^(.+)<(.+)>$/.test(part) && getCounterArrowBalanance(part) == 0) {
            const { key, value } = extractKeyValueFromRefString(part);
            return {
                key,
                value,
            };
        }
        return part;
    });
};
exports.decodeSchemaPath = decodeSchemaPath;
const decodeSchemaPathWithArrays = (pathString) => {
    return splitPath(pathString).map((part) => {
        if (/^\[(\d+)\]$/.test(part)) {
            return parseInt(/^\[(\d+)\]$/.exec(part)[1]);
        }
        if (/^(.+)<(.+)>$/.test(part) && getCounterArrowBalanance(part) == 0) {
            const { key, value } = extractKeyValueFromRefString(part);
            return {
                key,
                value,
            };
        }
        return part;
    });
};
exports.decodeSchemaPathWithArrays = decodeSchemaPathWithArrays;
const fastHash = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36).padEnd(6, "0");
};
const getStateId = (schema, state) => {
    const hashPairs = [];
    const sortedProps = Object.keys(schema).sort();
    for (const prop of sortedProps) {
        if (!schema[prop].type) {
            hashPairs.push({
                key: prop,
                value: (0, exports.getStateId)(schema[prop], state[prop]),
            });
        }
        if (primitives.has(schema[prop].type)) {
            hashPairs.push({
                key: prop,
                value: fastHash(`${state[prop]}`),
            });
        }
        if (schema[prop].type == "set" || schema[prop].type == "array") {
            // TODO: REMOVE REDUCE
            hashPairs.push({
                key: prop,
                value: state[prop]?.reduce((s, element) => {
                    if (typeof schema[prop].values == "string" &&
                        primitives.has(schema[prop].values)) {
                        return fastHash(s + `${element}`);
                    }
                    return fastHash(s + (0, exports.getStateId)(schema[prop].values, element));
                }, ""),
            });
        }
    }
    // TODO: REMOVE REDUCE
    return fastHash(hashPairs.reduce((s, { key, value }) => {
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
    const sortedProps = Object.keys(schemaRoot).sort();
    for (const prop of sortedProps) {
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
    for (const prop of nestedStructures) {
        kv.push(...(0, exports.flattenStateToSchemaPathKV)(schemaRoot[prop], state[prop], [
            ...traversalPath,
            ...(primaryKey ? [primaryKey] : []),
            prop,
        ]));
    }
    for (const prop of arrays) {
        (state?.[prop] ?? []).forEach((element) => {
            const id = (0, exports.getStateId)(schemaRoot[prop].values, element);
            kv.push(...(0, exports.flattenStateToSchemaPathKV)(schemaRoot[prop].values, { ...element, ["(id)"]: id }, [
                ...traversalPath,
                ...(primaryKey ? [primaryKey] : []),
                prop
            ]));
        });
    }
    for (const prop of sets) {
        (state?.[prop] ?? []).forEach((element) => {
            debugger;
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
    const visitedIds = {};
    const out = [];
    for (const { key, value } of kvs) {
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
        const ids = concatenatedId.split(":").filter((v) => v != "");
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
const buildObjectsAtPath = (rootSchema, path, properties, visitedLists = {}, out = {}) => {
    // ignore $(store)
    const [, ...decodedPath] = (0, exports.decodeSchemaPath)(path);
    let current = out;
    let currentSchema = rootSchema;
    const partialPath = [];
    for (const part of decodedPath) {
        partialPath.push(part);
        if (typeof part == "string" && currentSchema?.[part]?.type == "set") {
            const listPath = (0, exports.writePathString)(partialPath);
            if (!visitedLists[listPath]) {
                visitedLists[listPath] = {};
            }
            if (!current[part]) {
                current[part] = [];
            }
            current = current[part];
            currentSchema = currentSchema[part].values;
            continue;
        }
        if (typeof part == "string" && currentSchema?.[part]?.type == "array") {
            const listPath = (0, exports.writePathString)(partialPath);
            if (!visitedLists[listPath]) {
                visitedLists[listPath] = {};
            }
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
            const listPath = (0, exports.writePathString)(partialPath.slice(0, -1));
            const listElement = visitedLists[listPath]?.[part.value];
            const element = listElement ?? {
                [part.key]: part.value,
            };
            if (!listElement) {
                visitedLists[listPath][part.value] = element;
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
    try {
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
    }
    catch (e) {
        return null;
    }
    // ignore $(store)
};
const getStaticSchemaAtPath = (rootSchema, path) => {
    // ignore $(store)
    const [, ...decodedPath] = (0, exports.decodeSchemaPath)(path);
    let currentSchema = rootSchema;
    for (const part of decodedPath) {
        if (typeof part == "string") {
            currentSchema = currentSchema[part];
            continue;
        }
    }
    return currentSchema;
};
const getObjectInStateMap = (stateMap, path) => {
    let current = null;
    const [pluginWrapper, ...decodedPath] = (0, exports.decodeSchemaPathWithArrays)(path);
    const pluginName = /^\$\((.+)\)$/.exec(pluginWrapper)?.[1] ?? null;
    if (pluginName == null) {
        return null;
    }
    current = stateMap[pluginName];
    for (const part of decodedPath) {
        if (!current) {
            return null;
        }
        if (typeof part == "number") {
            current = current[part];
        }
        else if (typeof part != "string") {
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
    for (const prop in state) {
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
    const flattenedState = (0, exports.flattenStateToSchemaPathKV)(rootSchema, state, [`$(${pluginName})`]);
    return (flattenedState?.map?.(({ key, value }) => {
        return {
            key: (0, exports.writePathString)(key),
            value,
        };
    }) ?? []);
};
const iterateSchemaTypes = (types, pluginName, importedTypes = {}) => {
    const out = {};
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
            if (typeof types[prop].values == "string" &&
                typeof importedTypes[types[prop].values] == "object") {
                out[prop].values = iterateSchemaTypes(importedTypes[types[prop].values], pluginName, importedTypes);
                continue;
            }
            if (typeof types[prop].values == "object") {
                out[prop].values = iterateSchemaTypes(types[prop].values, pluginName, importedTypes);
                continue;
            }
        }
        if (/^ref<(.+)>$/.test(types[prop].type)) {
            out[prop] = { ...types[prop] };
            const typeGroup = /^ref<(.+)>$/.exec(types[prop].type)?.[1];
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
        if (typeof types[prop].type == "string" &&
            importedTypes[types[prop]?.type]) {
            out[prop] = iterateSchemaTypes(importedTypes[types[prop]?.type], pluginName, importedTypes);
            continue;
        }
        if (typeof types[prop].type == "string" &&
            importedTypes[pluginName + "." + types[prop]?.type]) {
            out[prop] = iterateSchemaTypes(importedTypes[pluginName + "." + types[prop]?.type], pluginName, importedTypes);
            continue;
        }
        if (!types[prop]?.type) {
            out[prop] = iterateSchemaTypes(types[prop], pluginName, importedTypes);
        }
    }
    return out;
};
const drawSchemaTypesFromImports = (schema, pluginName, importedTypes = {}) => {
    const types = Object.keys(schema[pluginName].types).reduce((types, key) => {
        if (key.startsWith(`${pluginName}.`)) {
            return {
                ...types,
                [key]: iterateSchemaTypes(schema[pluginName].types[key], pluginName, { ...importedTypes, ...schema[pluginName].types }),
            };
        }
        return {
            ...types,
            [`${pluginName}.${key}`]: iterateSchemaTypes(schema[pluginName].types[key], pluginName, { ...importedTypes, ...schema[pluginName].types }),
        };
    }, {});
    return Object.keys(schema[pluginName].imports).reduce((acc, importPluginName) => {
        const importTypes = drawSchemaTypesFromImports(schema, importPluginName, importedTypes);
        return {
            ...acc,
            ...importTypes,
        };
    }, types);
};
const getStateFromKVForPlugin = (schemaMap, kv, pluginName) => {
    const rootSchema = (0, exports.getRootSchemaForPlugin)(schemaMap, pluginName);
    const kvArray = (0, exports.indexArrayDuplicates)(kv);
    let out = {};
    let memo = {};
    for (const pair of kvArray) {
        out = (0, exports.buildObjectsAtPath)(rootSchema, pair.key, pair.value, memo, out);
    }
    return cleanArrayIDsFromState(out);
};
exports.getStateFromKVForPlugin = getStateFromKVForPlugin;
const getExpandedTypesForPlugin = (schemaMap, pluginName) => {
    const upstreamDeps = (0, exports.getUpstreamDepsInSchemaMap)(schemaMap, pluginName);
    const schemaWithTypes = [...upstreamDeps, pluginName].reduce((acc, pluginName) => {
        return {
            ...acc,
            ...drawSchemaTypesFromImports(schemaMap, pluginName, acc),
        };
    }, {});
    return Object.keys(schemaWithTypes).reduce((acc, type) => {
        return {
            ...acc,
            [type]: iterateSchemaTypes(acc[type], type, schemaWithTypes),
        };
    }, schemaWithTypes);
};
exports.getExpandedTypesForPlugin = getExpandedTypesForPlugin;
const getRootSchemaForPlugin = (schemaMap, pluginName) => {
    const schemaWithTypes = (0, exports.getExpandedTypesForPlugin)(schemaMap, pluginName);
    const schemaWithStores = iterateSchemaTypes(schemaMap[pluginName].store, pluginName, schemaWithTypes);
    return constructRootSchema({
        types: schemaWithTypes,
    }, schemaWithStores, pluginName);
};
exports.getRootSchemaForPlugin = getRootSchemaForPlugin;
const getRootSchemaMap = async (datasource, schemaMap) => {
    // need to top sort
    const rootSchemaMap = {};
    for (const pluginName in schemaMap) {
        const manifest = schemaMap[pluginName];
        const upsteamDeps = await (0, exports.getUpstreamDependencyManifests)(datasource, manifest);
        const subSchemaMap = (0, exports.manifestListToSchemaMap)(upsteamDeps);
        rootSchemaMap[pluginName] = (0, exports.getRootSchemaForPlugin)(subSchemaMap, pluginName);
    }
    return traverseSchemaMapForRefKeyTypes(rootSchemaMap, rootSchemaMap);
};
exports.getRootSchemaMap = getRootSchemaMap;
const getKeyType = (keyPath, rootSchemaMap) => {
    const [pluginWrapper, ...path] = splitPath(keyPath);
    let current = null;
    const typeGroup = /^\$\((.+)\)$/.exec(pluginWrapper)?.[1] ?? null;
    if (typeGroup && rootSchemaMap[typeGroup]) {
        current = rootSchemaMap[typeGroup];
    }
    if (current != null) {
        for (const part of path) {
            if (current && current[part]) {
                current = current[part];
            }
        }
        if (typeof current == "object") {
            for (const prop in current) {
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
    const out = {};
    for (const prop in schemaMap) {
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
const getKVStateForPlugin = async (datasource, schema, pluginName, stateMap) => {
    const rootUpsteamSchema = (0, exports.getRootSchemaForPlugin)(schema, pluginName);
    const state = await (0, exports.defaultVoidedState)(datasource, schema, stateMap);
    return generateKVFromStateWithRootSchema(rootUpsteamSchema, pluginName, state?.[pluginName]);
};
exports.getKVStateForPlugin = getKVStateForPlugin;
const getUpstreamDepsInSchemaMap = (schemaMap, pluginName) => {
    const current = schemaMap[pluginName];
    if (Object.keys(current.imports).length == 0) {
        return [];
    }
    const deps = Object.keys(current.imports);
    for (const dep of deps) {
        const upstreamDeps = (0, exports.getUpstreamDepsInSchemaMap)(schemaMap, dep);
        deps.push(...upstreamDeps);
    }
    return deps;
};
exports.getUpstreamDepsInSchemaMap = getUpstreamDepsInSchemaMap;
const getDownstreamDepsInSchemaMap = (schemaMap, pluginName, memo = {}) => {
    if (memo[pluginName]) {
        return [];
    }
    memo[pluginName] = true;
    const out = [];
    for (const dep in schemaMap) {
        if (dep == pluginName) {
            continue;
        }
        if (schemaMap[dep].imports[pluginName]) {
            out.push(dep, ...(0, exports.getDownstreamDepsInSchemaMap)(schemaMap, pluginName, memo));
        }
    }
    return out;
};
exports.getDownstreamDepsInSchemaMap = getDownstreamDepsInSchemaMap;
const refSetFromKey = (key) => {
    const out = [];
    const parts = splitPath(key);
    const curr = [];
    for (const part of parts) {
        curr.push(part);
        if (/<.+>$/.test(part)) {
            out.push(curr.join("."));
        }
    }
    return out;
};
const asyncReduce = async (initVal, list, callback) => {
    let out = initVal;
    for (let i = 0; i < list.length; ++i) {
        const element = list[i];
        out = await callback(out, element, i);
    }
    return out;
};
const traverseSchemaMapForStaticSetPaths = (rootSchemaMap, typeStruct, path = [], relativePath = [], parent = null) => {
    const refs = [];
    for (const prop in typeStruct) {
        if (typeof typeStruct[prop] == "object" && !typeStruct[prop]?.type) {
            const subRefs = traverseSchemaMapForStaticSetPaths(rootSchemaMap, typeStruct[prop], [...path, prop], [...relativePath, prop], parent);
            refs.push(...subRefs);
            continue;
        }
        if (typeStruct[prop]?.type == "set" &&
            typeof typeStruct[prop].values != "string") {
            const staticChildren = traverseSchemaMapForStaticSetPaths(rootSchemaMap, typeStruct[prop].values, [...path, prop, "values"], [], [...path, prop, "values"]);
            let keyProp = null;
            let keyPropIsRef = false;
            for (const key in typeStruct[prop].values) {
                if (typeStruct[prop].values[key]?.isKey) {
                    keyProp = key;
                    if (typeStruct[prop].values[key].type == "ref") {
                        keyPropIsRef = true;
                    }
                    break;
                }
            }
            refs.push({
                staticPath: [...path, prop, "values"],
                staticChildren,
                relativePath: [...relativePath, prop, "values"],
                keyProp,
                keyPropIsRef,
            });
        }
    }
    return refs;
};
const getSetInStateMapFromStaticPath = (path, stateMap) => {
    let current = stateMap;
    for (let part of path) {
        if (part == "values") {
            return current;
        }
        current = current[part];
    }
    return null;
};
const compileStateRefs = (staticSetPaths, stateMap) => {
    const out = {};
    for (const staticSet of staticSetPaths) {
        const parent = getSetInStateMapFromStaticPath(staticSet.relativePath, stateMap);
        const values = {};
        if (parent) {
            for (let child of parent) {
                const object = compileStateRefs(staticSet.staticChildren, child);
                values[child[staticSet.keyProp]] = {
                    object,
                    instance: child,
                    parent,
                    keyProp: staticSet.keyProp,
                    keyPropIsRef: staticSet.keyPropIsRef,
                };
            }
        }
        const keys = staticSet.relativePath.slice(0, -1);
        if (keys.length == 1) {
            out[keys[0]] = {
                values,
                parent,
            };
        }
        else {
            let curr = out[keys[0]] ?? {};
            let top = curr;
            out[keys[0]] = top;
            for (let i = 1; i < keys.length - 1; ++i) {
                const key = keys[i];
                if (!curr[key]) {
                    curr[key] = {};
                }
                curr = curr[key];
            }
            curr[keys[keys.length - 1]] = {
                values,
                parent,
            };
        }
    }
    return out;
};
const traverseSchemaMapForStaticPointerPaths = (rootSchemaMap, typeStruct, path = [], relativePath = [], parent = null) => {
    const refs = [];
    for (const prop in typeStruct) {
        if (typeof typeStruct[prop] == "object" && !typeStruct[prop]?.type) {
            const subRefs = traverseSchemaMapForStaticPointerPaths(rootSchemaMap, typeStruct[prop], [...path, prop], [...relativePath, prop], parent);
            refs.push(...subRefs);
            continue;
        }
        if ((typeStruct[prop]?.type == "set" || typeStruct[prop]?.type == "array") &&
            typeof typeStruct[prop].values != "string") {
            // find key value
            let keyProp = null;
            for (const key in typeStruct[prop].values) {
                if (typeStruct[prop].values[key]?.isKey) {
                    keyProp = key;
                    break;
                }
            }
            const staticChildren = traverseSchemaMapForStaticPointerPaths(rootSchemaMap, typeStruct[prop].values, [...path, prop, `values_key:${keyProp}`], [], [...path, prop, `values_key:${keyProp}`]);
            refs.push(...staticChildren);
            continue;
        }
        if (typeStruct[prop]?.type == "ref") {
            refs.push({
                staticPath: [...path, prop],
                relativePath: [...relativePath, prop],
                refType: typeStruct[prop]?.refType,
                onDelete: typeStruct[prop]?.onDelete,
            });
        }
    }
    return refs;
};
const getPointersAtPath = (pointerPath, staticPointer, stateMap, path = [], index = 0) => {
    const pointers = [];
    const subPath = [...path];
    let current = stateMap;
    for (let i = index; i < pointerPath.length; ++i) {
        if (i + 1 == pointerPath.length) {
            if (!current?.[pointerPath[i]]) {
                continue;
            }
            const [pluginNameEncoded, ...remainingRefPath] = (0, exports.decodeSchemaPath)(current[pointerPath[i]]);
            const pluginName = /\$\((.+)\)/.exec(pluginNameEncoded)[1];
            const refPath = [pluginName, ...remainingRefPath];
            pointers.push({
                setPath: path,
                parentSetPath: path.slice(0, -1),
                ownerObject: current,
                refKey: pointerPath[i],
                ref: current[pointerPath[i]],
                refPath,
                onDelete: staticPointer.onDelete,
                refType: staticPointer.refType,
            });
            break;
        }
        if (pointerPath[i].startsWith("values_key:")) {
            const [, keyProp] = pointerPath[i].split(":");
            for (let j = 0; j < current.length; ++j) {
                const subState = current[j];
                const keyValue = subState[keyProp];
                const subPointers = getPointersAtPath(pointerPath, staticPointer, subState, [...subPath, { key: keyProp, value: keyValue }], i + 1);
                pointers.push(...subPointers);
            }
            break;
        }
        subPath.push(pointerPath[i]);
        current = current[pointerPath[i]];
    }
    return pointers;
};
const compileStatePointers = (staticPointers, stateMap) => {
    const pointers = [];
    for (const staticPointer of staticPointers) {
        const ptrs = getPointersAtPath(staticPointer.staticPath, staticPointer, stateMap);
        pointers.push(...ptrs);
    }
    return pointers;
};
exports.compileStatePointers = compileStatePointers;
const accessObjectInReferenceMap = (referenceMap, path) => {
    let curr = referenceMap;
    for (let i = 0; i < path.length; ++i) {
        const part = path[i];
        const isLast = i + 1 == path.length;
        if (typeof part == "string") {
            curr = curr[part];
            continue;
        }
        const { value } = part;
        curr = curr.values[value];
        if (!curr) {
            return null;
        }
        if (!isLast) {
            curr = curr["object"];
        }
    }
    if (curr === referenceMap) {
        return null;
    }
    return curr;
};
const accessSetInReferenceMap = (referenceMap, path) => {
    let curr = referenceMap;
    for (let i = 0; i < path.length; ++i) {
        const part = path[i];
        const isLast = i + 1 == path.length;
        if (typeof part == "string") {
            curr = curr[part];
            continue;
        }
        const { value } = part;
        curr = curr.values[value];
        if (!curr) {
            return null;
        }
        if (!isLast) {
            curr = curr.object;
        }
    }
    return curr;
};
const recursivelyCheckIfReferenceExists = (ref, refPath, referenceMap, visited = {}) => {
    if (visited[ref]) {
        return true;
    }
    visited[ref] = true;
    const referenceObject = accessObjectInReferenceMap(referenceMap, refPath);
    if (!referenceObject) {
        return false;
    }
    if (referenceObject.keyPropIsRef) {
        const nextRef = referenceObject.instance[referenceObject.keyProp];
        const [pluginNameEncoded, ...remainingRefPath] = (0, exports.decodeSchemaPath)(referenceObject.instance[referenceObject.keyProp]);
        const pluginName = /\$\((.+)\)/.exec(pluginNameEncoded)[1];
        const nextRefPath = [pluginName, ...remainingRefPath];
        return (0, exports.recursivelyCheckIfReferenceExists)(nextRef, nextRefPath, referenceMap, visited);
    }
    return true;
};
exports.recursivelyCheckIfReferenceExists = recursivelyCheckIfReferenceExists;
/**
 *
 * This is a really ugly function but it gets called frequently
 * and must not depend upon serialization/deserialization to and
 * from KV. It also has to be able to work in place to stay performant.
 * It get called on every update call.
 */
const cascadePluginState = async (datasource, schemaMap, stateMap) => {
    try {
        const rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
        const staticPointers = traverseSchemaMapForStaticPointerPaths(rootSchemaMap, rootSchemaMap);
        const pointers = (0, exports.compileStatePointers)(staticPointers, stateMap);
        // if no pointers just return the stateMap
        if (pointers.length == 0) {
            return stateMap;
        }
        const staticSetPaths = traverseSchemaMapForStaticSetPaths(rootSchemaMap, rootSchemaMap);
        const references = compileStateRefs(staticSetPaths, stateMap);
        let deletions = 0;
        for (let ptr of pointers) {
            const refExists = (0, exports.recursivelyCheckIfReferenceExists)(ptr.ref, ptr.refPath, references);
            if (!refExists) {
                if (ptr.onDelete == "delete") {
                    deletions++;
                    const parentSet = accessSetInReferenceMap(references, ptr.parentSetPath);
                    if (!parentSet) {
                        continue;
                    }
                    delete parentSet.values[ptr.ref];
                    let pointerIndex = -1;
                    for (let i = 0; i < parentSet["parent"].length; ++i) {
                        if (parentSet["parent"][i][ptr.refKey] == ptr.ref) {
                            pointerIndex = i;
                            break;
                        }
                    }
                    if (pointerIndex != -1) {
                        parentSet["parent"].splice(pointerIndex, 1);
                    }
                }
                if (ptr.onDelete == "nullify" &&
                    ptr?.ownerObject?.[ptr.refKey] != null) {
                    ptr.ownerObject[ptr.refKey] = null;
                }
            }
        }
        if (deletions > 0) {
            // bad but highly infrequent
            return (0, exports.cascadePluginState)(datasource, schemaMap, stateMap);
        }
        return stateMap;
    }
    catch (e) {
        return stateMap;
    }
};
exports.cascadePluginState = cascadePluginState;
/***
 * cascading is heavy but infrequent. It only needs to be
 * called when updating state. Not called when applying diffs
 * @deprecated because it is not scalable at all and couples
 * kv state to plugin transformations
 */
const cascadePluginStateDeprecated = async (datasource, schemaMap, stateMap, pluginName, rootSchemaMap, memo = {}) => {
    if (!rootSchemaMap) {
        rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
    }
    if (!memo) {
        memo = {};
    }
    const kvs = await (0, exports.getKVStateForPlugin)(datasource, schemaMap, pluginName, stateMap);
    const removedRefs = new Set();
    const next = [];
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
            for (const prop in subSchema) {
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
        const out = (0, exports.cascadePluginStateDeprecated)(datasource, schemaMap, { ...stateMap, [pluginName]: newPluginState }, pluginName, rootSchemaMap, memo);
        return out;
    }
    const downstreamDeps = (0, exports.getDownstreamDepsInSchemaMap)(schemaMap, pluginName);
    const result = await asyncReduce(nextStateMap, downstreamDeps, async (stateMap, dependentPluginName) => {
        if (memo[`${pluginName}:${dependentPluginName}`]) {
            return {
                ...stateMap,
                ...memo[`${pluginName}:${dependentPluginName}`],
            };
        }
        const result = {
            ...stateMap,
            ...(await (0, exports.cascadePluginStateDeprecated)(datasource, schemaMap, stateMap, dependentPluginName, rootSchemaMap, memo)),
        };
        memo[`${pluginName}:${dependentPluginName}`] = result;
        return result;
    });
    return result;
};
exports.cascadePluginStateDeprecated = cascadePluginStateDeprecated;
const reIndexSchemaArrays = (kvs) => {
    const out = [];
    const listStack = [];
    let indexStack = [];
    for (const { key, value } of kvs) {
        const decodedPath = (0, exports.decodeSchemaPath)(key);
        const lastPart = decodedPath[decodedPath.length - 1];
        if (typeof lastPart == "object" && lastPart.key == "(id)") {
            const parentPath = decodedPath.slice(0, -1);
            const parentPathString = (0, exports.writePathString)(parentPath);
            const peek = listStack?.[listStack.length - 1];
            if (peek != parentPathString) {
                if (!peek || key.startsWith(peek)) {
                    listStack.push(parentPathString);
                    indexStack.push(0);
                }
                else {
                    while (listStack.length > 0 &&
                        !key.startsWith(listStack[listStack.length - 1])) {
                        listStack.pop();
                        indexStack.pop();
                    }
                    indexStack[indexStack.length - 1]++;
                }
            }
            else {
                const currIndex = indexStack.pop();
                indexStack.push(currIndex + 1);
            }
            let pathIdx = 0;
            const pathWithNumbers = decodedPath.map((part) => {
                if (typeof part == "object" && part.key == "(id)") {
                    return indexStack[pathIdx++];
                }
                return part;
            });
            const arrayPath = (0, exports.writePathStringWithArrays)(pathWithNumbers);
            out.push(arrayPath);
        }
        else {
            out.push(key);
        }
    }
    return out;
};
exports.reIndexSchemaArrays = reIndexSchemaArrays;
const nullifyMissingFileRefs = async (datasource, schemaMap, stateMap) => {
    const rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
    console.log("ROOT SCHEMA MAP", JSON.stringify(rootSchemaMap, null, 2));
    console.log("STATE MAP", JSON.stringify(stateMap, null, 2));
};
exports.nullifyMissingFileRefs = nullifyMissingFileRefs;
const validatePluginState = async (datasource, schemaMap, stateMap, pluginName) => {
    const rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
    // ignore $(store)
    const [, ...kvs] = await (0, exports.getKVStateForPlugin)(datasource, schemaMap, pluginName, stateMap);
    for (const { key, value } of kvs) {
        const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);
        for (const prop in subSchema) {
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
            if (subSchema[prop]?.type == "file") {
                const exists = await datasource.checkBinary(value[prop]);
                if (!exists) {
                    return false;
                }
            }
        }
    }
    return true;
};
exports.validatePluginState = validatePluginState;
const getPluginInvalidStateIndices = async (datasource, schemaMap, kvs, pluginName) => {
    const out = [];
    const rootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, schemaMap)) ?? {};
    for (let i = 1; i < kvs.length; ++i) {
        const { key, value } = kvs[i];
        const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);
        for (const prop in subSchema) {
            if (subSchema[prop]?.type == "array" || subSchema[prop]?.type == "set") {
                if (!subSchema[prop]?.emptyable) {
                    const referencedObject = value;
                    if ((referencedObject?.[prop]?.length ?? 0) == 0) {
                        out.push(i);
                    }
                }
                continue;
            }
            if (subSchema[prop]?.type &&
                (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
                value[prop] == null) {
                out.push(i);
                continue;
            }
            if (subSchema[prop]?.type == "file") {
                const exists = await datasource.checkBinary(value[prop]);
                if (!exists) {
                    out.push(i);
                    continue;
                }
            }
        }
    }
    return out;
};
exports.getPluginInvalidStateIndices = getPluginInvalidStateIndices;
const objectIsSubsetOfObject = (current, next) => {
    if (typeof current != "object") {
        return false;
    }
    if (typeof next != "object") {
        return false;
    }
    const nested = [];
    for (const prop in current) {
        if (!!current[prop] && !next[prop]) {
            return false;
        }
        if (!current[prop] && !!next[prop]) {
            continue;
        }
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
const pluginManifestIsSubsetOfManifest = async (datasource, currentSchemaMap, nextSchemaMap) => {
    const oldRootSchema = await (0, exports.getRootSchemaMap)(datasource, currentSchemaMap);
    const nextRootSchema = await (0, exports.getRootSchemaMap)(datasource, nextSchemaMap);
    if (!oldRootSchema) {
        return false;
    }
    if (!nextRootSchema) {
        return false;
    }
    return objectIsSubsetOfObject(oldRootSchema, nextRootSchema);
};
exports.pluginManifestIsSubsetOfManifest = pluginManifestIsSubsetOfManifest;
const isTopologicalSubset = async (datasource, oldSchemaMap, oldStateMap, newSchemaMap, newStateMap, pluginName) => {
    if (!oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
        return true;
    }
    if (oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
        return false;
    }
    if (!(await (0, exports.pluginManifestIsSubsetOfManifest)(datasource, oldSchemaMap, newSchemaMap))) {
        return false;
    }
    const oldKVs = (await (await (0, exports.getKVStateForPlugin)(datasource, oldSchemaMap, pluginName, oldStateMap))
        ?.map?.(({ key }) => key)
        ?.filter?.((key) => {
        // remove array refs, since unstable
        if (/\(id\)<.+>/.test(key)) {
            return false;
        }
        return true;
    })) ?? [];
    const newKVs = (await (0, exports.getKVStateForPlugin)(datasource, newSchemaMap, pluginName, newStateMap)).map(({ key }) => key);
    const newKVsSet = new Set(newKVs);
    for (const key of oldKVs) {
        if (!newKVsSet.has(key)) {
            return false;
        }
    }
    return true;
};
exports.isTopologicalSubset = isTopologicalSubset;
const isTopologicalSubsetValid = async (datasource, oldSchemaMap, oldStateMap, newSchemaMap, newStateMap, pluginName) => {
    if (!(await (0, exports.isTopologicalSubset)(datasource, oldSchemaMap, oldStateMap, newSchemaMap, newStateMap, pluginName))) {
        return false;
    }
    // we need to apply old schema against new data to ensure valid/safe
    // otherwise we would examine props outside of the subspace that may
    // be invalid in the new version but dont exist in the old version
    const oldRootSchemaMap = (await (0, exports.getRootSchemaMap)(datasource, oldSchemaMap)) ?? {};
    // ignore $(store)
    const [, ...oldKVs] = (await (0, exports.getKVStateForPlugin)(datasource, oldSchemaMap, pluginName, oldStateMap)).map(({ key }) => key);
    const oldKVsSet = new Set(oldKVs);
    // ignore $(store)
    const [, ...newKVs] = (await (0, exports.getKVStateForPlugin)(datasource, newSchemaMap, pluginName, newStateMap)).filter(({ key }) => oldKVsSet.has(key));
    // we can check against newKV since isTopologicalSubset check ensures the key
    // intersection already exists. Here we just have to ensure the new values are
    // compatible against the old schema
    for (const { key, value } of newKVs) {
        const subSchema = getSchemaAtPath(oldRootSchemaMap[pluginName], key);
        for (const prop in subSchema) {
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
const isSchemaValid = (typeStruct, schemaMap, rootSchemaMap, expandedTypes, isDirectParentSet = false, isDirectParentArray = false, isArrayDescendent = false, path = []) => {
    try {
        let keyCount = 0;
        const sets = [];
        const arrays = [];
        const nestedStructures = [];
        const refs = [];
        for (const prop in typeStruct) {
            if (typeof typeStruct[prop] == "object" &&
                Object.keys(typeStruct[prop]).length == 0) {
                const [root, ...rest] = path;
                const formattedPath = [`$(${root})`, ...rest, prop].join(".");
                const schemaMapValue = getSchemaAtPath?.(schemaMap[root].store, (0, exports.writePathString)([`$(${root})`, ...rest]));
                const schemaMapValueProp = schemaMapValue?.[prop];
                if (schemaMapValue &&
                    schemaMapValueProp &&
                    schemaMapValueProp?.type &&
                    (schemaMapValueProp.type == "set" ||
                        schemaMapValueProp.type == "array") &&
                    !primitives.has(schemaMapValueProp?.values ?? "")) {
                    return {
                        status: "error",
                        message: `Invalid value type for values '${schemaMapValueProp.values}'. Found at '${formattedPath}'.`,
                    };
                }
                if (schemaMapValue &&
                    schemaMapValueProp &&
                    schemaMapValueProp?.type &&
                    !(schemaMapValueProp.type == "set" ||
                        schemaMapValueProp.type == "array") &&
                    !primitives.has(schemaMapValueProp?.type ?? "")) {
                    return {
                        status: "error",
                        message: `Invalid value type '${schemaMapValueProp.type}. Found' at '${formattedPath}'.`,
                    };
                }
                return {
                    status: "error",
                    message: `Invalid value type for prop '${prop}'. Found at '${formattedPath}'.`,
                };
            }
            if (typeof typeStruct[prop]?.type == "string" && typeStruct[prop].isKey) {
                if (typeStruct[prop]?.nullable == true) {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, prop].join(".");
                    return {
                        status: "error",
                        message: `Invalid key '${prop}'. Key types cannot be nullable. Found at '${formattedPath}'.`,
                    };
                }
                if (typeStruct[prop]?.type == "ref" &&
                    typeStruct[prop].onDelete == "nullify") {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, prop].join(".");
                    return {
                        status: "error",
                        message: `Invalid key '${prop}'. Key types that are refs cannot have a cascaded onDelete values of nullify. Found at '${formattedPath}'.`,
                    };
                }
                keyCount++;
            }
            if (typeof typeStruct[prop]?.type == "string" &&
                typeof typeStruct[prop]?.values != "string" &&
                typeStruct[prop].type == "set" &&
                Object.keys(typeStruct[prop]?.values ?? {}).length != 0) {
                sets.push(prop);
                continue;
            }
            if (typeof typeStruct[prop]?.type == "string" &&
                typeof typeStruct[prop]?.values != "string" &&
                typeStruct[prop].type == "array" &&
                Object.keys(typeStruct[prop]?.values ?? {}).length != 0) {
                arrays.push(prop);
                continue;
            }
            if (typeof typeStruct[prop]?.type == "string" &&
                typeStruct[prop].type == "ref") {
                refs.push(prop);
                continue;
            }
            if (typeof typeStruct[prop]?.type == "string" &&
                !(typeStruct[prop]?.type == "set" ||
                    typeStruct[prop]?.type == "array" ||
                    typeStruct[prop]?.type == "ref") &&
                !primitives.has(typeStruct[prop].type)) {
                const [root, ...rest] = path;
                const formattedPath = [`$(${root})`, ...rest, prop].join(".");
                const schemaMapValue = getSchemaAtPath?.(schemaMap[root].store, (0, exports.writePathString)([`$(${root})`, ...rest]));
                const schemaMapValueProp = schemaMapValue?.[prop];
                if (schemaMapValue &&
                    schemaMapValueProp &&
                    schemaMapValueProp?.type &&
                    !primitives.has(schemaMapValueProp?.type ?? "")) {
                    return {
                        status: "error",
                        message: `Invalid value type for type '${schemaMapValueProp.type}'. Found at '${formattedPath}'.`,
                    };
                }
                return {
                    status: "error",
                    message: `Invalid value type for prop '${prop}'. Found at '${formattedPath}'.`,
                };
            }
            if (typeof typeStruct[prop]?.type == "string" &&
                (typeStruct[prop]?.type == "set" ||
                    typeStruct[prop]?.type == "array") &&
                typeof typeStruct[prop]?.values == "string" &&
                !primitives.has(typeStruct[prop].values)) {
                const [root, ...rest] = path;
                const formattedPath = [`$(${root})`, ...rest, prop].join(".");
                return {
                    status: "error",
                    message: `Invalid type for values of '${typeStruct[prop]?.type}'. Found at '${formattedPath}'.`,
                };
            }
            if (typeof typeStruct[prop] == "object" && !typeStruct[prop]?.type) {
                nestedStructures.push(prop);
                continue;
            }
        }
        if (sets.length > 0 && isArrayDescendent) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest].join(".");
            return {
                status: "error",
                message: `Arrays cannot contain keyed set descendents. Found at '${formattedPath}.values'.`,
            };
        }
        if (isDirectParentArray && keyCount > 1) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest].join(".");
            return {
                status: "error",
                message: `Arrays cannot contain keyed values. Found at '${formattedPath}.values'.`,
            };
        }
        if (isDirectParentSet && keyCount > 1) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest].join(".");
            return {
                status: "error",
                message: `Sets cannot contain multiple key types. Multiple key types found at '${formattedPath}.values'.`,
            };
        }
        if (isDirectParentSet && keyCount == 0) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest].join(".");
            return {
                status: "error",
                message: `Sets must contain one (and only one) key type. No key type found at '${formattedPath}.values'.`,
            };
        }
        if (!isDirectParentArray && !isDirectParentSet && keyCount > 0) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest].join(".");
            return {
                status: "error",
                message: `Only sets may contain key types. Invalid key type found at '${formattedPath}'.`,
            };
        }
        const refCheck = refs.reduce((response, refProp) => {
            if (response.status != "ok") {
                return response;
            }
            const refStruct = typeStruct[refProp];
            if (refStruct?.refType?.startsWith("$")) {
                const [root, ...rest] = path;
                const pluginName = /^\$\((.+)\)$/.exec(refStruct?.refType.split(".")[0])?.[1] ?? (refStruct?.refType.split(".")[0] == "$" ? root : null);
                if (!pluginName) {
                    const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
                    return {
                        status: "error",
                        message: `Invalid reference pointer '${refStruct.refType}'. No reference value found for value at '${formattedPath}'.`,
                    };
                }
                const referencedType = getStaticSchemaAtPath(rootSchemaMap[pluginName], refStruct.refType);
                if (!referencedType) {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
                    return {
                        status: "error",
                        message: `Invalid reference pointer '${refStruct.refType}'. No reference value found for value at '${formattedPath}'.`,
                    };
                }
                if (refStruct.isKey && refStruct === referencedType[refProp]) {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
                    return {
                        status: "error",
                        message: `Invalid reference pointer '${refStruct.refType}'. Keys that are constrained ref types cannot be schematically self-referential. Found at '${formattedPath}'.`,
                    };
                }
                const containsKey = Object.keys(referencedType).reduce((contains, prop) => {
                    if (contains) {
                        return true;
                    }
                    return referencedType[prop]?.isKey;
                }, false);
                if (!containsKey) {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
                    return {
                        status: "error",
                        message: `Invalid reference constrainted pointer '${refStruct.refType}'. Constrained references must point directly at the values of a set. Found at '${formattedPath}'.`,
                    };
                }
            }
            else {
                const referencedType = expandedTypes[refStruct.refType];
                if (!referencedType) {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
                    return {
                        status: "error",
                        message: `Invalid reference pointer '${refStruct.refType}'. No reference type found for reference at '${formattedPath}'.`,
                    };
                }
                const containsKey = Object.keys(referencedType).reduce((contains, prop) => {
                    if (contains) {
                        return true;
                    }
                    return referencedType[prop]?.isKey;
                }, false);
                if (!containsKey) {
                    const [root, ...rest] = path;
                    const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
                    return {
                        status: "error",
                        message: `Invalid reference pointer '${refStruct.refType}'. References type ${refStruct.refType} contains no key type. Found at '${formattedPath}'.`,
                    };
                }
            }
            return { status: "ok" };
        }, { status: "ok" });
        if (refCheck.status != "ok") {
            return refCheck;
        }
        const nestedStructureCheck = nestedStructures.reduce((response, nestedStructureProp) => {
            if (response.status != "ok") {
                return response;
            }
            return (0, exports.isSchemaValid)(typeStruct[nestedStructureProp], schemaMap, rootSchemaMap, expandedTypes, false, false, isArrayDescendent, [...path, nestedStructureProp]);
        }, { status: "ok" });
        if (nestedStructureCheck.status != "ok") {
            return nestedStructureCheck;
        }
        const arrayCheck = arrays.reduce((response, arrayProp) => {
            if (response.status != "ok") {
                return response;
            }
            return (0, exports.isSchemaValid)(typeStruct[arrayProp].values, schemaMap, rootSchemaMap, expandedTypes, false, true, true, [...path, arrayProp]);
        }, { status: "ok" });
        if (arrayCheck.status != "ok") {
            return arrayCheck;
        }
        const setCheck = sets.reduce((response, setProp) => {
            if (response.status != "ok") {
                return response;
            }
            return (0, exports.isSchemaValid)(typeStruct[setProp].values, schemaMap, rootSchemaMap, expandedTypes, true, false, isArrayDescendent, [...path, setProp]);
        }, { status: "ok" });
        if (setCheck.status != "ok") {
            return setCheck;
        }
        return {
            status: "ok",
        };
    }
    catch (e) {
        const [root, ...rest] = path;
        const formattedPath = [`$(${root})`, ...rest].join(".");
        return {
            status: "error",
            message: `${e?.toString?.() ?? "unknown error"}. Found at '${formattedPath}'.`,
        };
    }
};
exports.isSchemaValid = isSchemaValid;
const invalidSchemaPropsCheck = (typeStruct, rootSchema, path = []) => {
    for (const prop in typeStruct) {
        if (!rootSchema[prop]) {
            const formattedPath = [...path, prop].join(".");
            return {
                status: "error",
                message: `Invalid prop in schema. Remove or change '${prop}=${typeStruct[prop]}' from '${path.join(".")}'. Found at '${formattedPath}'.`,
            };
        }
        if (typeof typeStruct[prop] == "object") {
            const hasInvalidTypesResponse = (0, exports.invalidSchemaPropsCheck)(typeStruct[prop], rootSchema[prop] ?? {}, [...path, prop]);
            if (hasInvalidTypesResponse.status == "error") {
                return hasInvalidTypesResponse;
            }
        }
    }
    return {
        status: "ok",
    };
};
exports.invalidSchemaPropsCheck = invalidSchemaPropsCheck;
const collectKeyRefs = (typeStruct, path = []) => {
    const out = [];
    for (const prop in typeStruct) {
        if (typeStruct[prop]?.isKey) {
            if (typeStruct[prop].type == "ref") {
                path.push({ key: prop, value: `ref<${typeStruct[prop].refType}>` });
            }
            else {
                path.push({ key: prop, value: typeStruct[prop].type });
            }
            out.push((0, exports.writePathString)(path));
        }
        if (typeStruct[prop]?.type == "set" &&
            typeof typeStruct[prop]?.values == "object") {
            out.push(...(0, exports.collectKeyRefs)(typeStruct[prop].values, [
                ...path,
                path.length == 0 ? `$(${prop})` : prop,
            ]));
            continue;
        }
        if (!typeStruct[prop]?.type && typeof typeStruct[prop] == "object") {
            out.push(...(0, exports.collectKeyRefs)(typeStruct[prop], [
                ...path,
                path.length == 0 ? `$(${prop})` : prop,
            ]));
            continue;
        }
    }
    return out;
};
exports.collectKeyRefs = collectKeyRefs;
const replaceRefVarsWithValues = (pathString) => {
    const path = splitPath(pathString);
    return path
        .map((part) => {
        if (/^(.+)<(.+)>$/.test(part)) {
            return "values";
        }
        return part;
    })
        .join(".");
};
const replaceRefVarsWithWildcards = (pathString) => {
    const path = splitPath(pathString);
    return path
        .map((part) => {
        if (/^(.+)<(.+)>$/.test(part)) {
            const { key } = extractKeyValueFromRefString(part);
            return `${key}<?>`;
        }
        return part;
    })
        .join(".");
};
exports.replaceRefVarsWithWildcards = replaceRefVarsWithWildcards;
const replaceRawRefsInExpandedType = (typeStruct, expandedTypes, rootSchemaMap) => {
    const out = {};
    for (const prop in typeStruct) {
        if (typeof typeStruct[prop]?.type == "string" &&
            /^ref<(.+)>$/.test(typeStruct[prop]?.type)) {
            const { value: refType } = extractKeyValueFromRefString(typeStruct[prop]?.type);
            out[prop] = { ...typeStruct[prop] };
            out[prop].type = "ref";
            out[prop].refType = refType;
            out[prop].onDelete = typeStruct[prop]?.onDelete ?? "delete";
            out[prop].nullable = typeStruct[prop]?.nullable ?? false;
            if (/^\$\(.+\)/.test(refType)) {
                const pluginName = /^\$\((.+)\)$/.exec(refType.split(".")[0])?.[1];
                const staticSchema = getStaticSchemaAtPath(rootSchemaMap[pluginName], refType);
                const keyProp = Object.keys(staticSchema).find((p) => staticSchema[p].isKey);
                const refKeyType = staticSchema[keyProp].type;
                out[prop].refKeyType = refKeyType;
            }
            else {
                const staticSchema = expandedTypes[refType];
                const keyProp = Object.keys(staticSchema).find((p) => staticSchema[p].isKey);
                const refKeyType = staticSchema[keyProp].type;
                out[prop].refKeyType = refKeyType;
            }
            continue;
        }
        if (typeof typeStruct[prop] == "object") {
            out[prop] = (0, exports.replaceRawRefsInExpandedType)(typeStruct[prop], expandedTypes, rootSchemaMap);
            continue;
        }
        out[prop] = typeStruct[prop];
    }
    return out;
};
exports.replaceRawRefsInExpandedType = replaceRawRefsInExpandedType;
const typestructsAreEquivalent = (typestructA, typestructB) => {
    if (Object.keys(typestructA ?? {}).length !=
        Object.keys(typestructB ?? {}).length) {
        return false;
    }
    for (const prop in typestructA) {
        if (typeof typestructA[prop] == "object" && typeof typestructB[prop]) {
            const areEquivalent = (0, exports.typestructsAreEquivalent)(typestructA[prop], typestructB[prop]);
            if (!areEquivalent) {
                return false;
            }
            continue;
        }
        if (typestructA[prop] != typestructB[prop]) {
            return false;
        }
    }
    return true;
};
exports.typestructsAreEquivalent = typestructsAreEquivalent;
const buildPointerReturnTypeMap = (rootSchemaMap, expandedTypes, referenceKeys) => {
    const expandedTypesWithRefs = (0, exports.replaceRawRefsInExpandedType)(expandedTypes, expandedTypes, rootSchemaMap);
    const out = {};
    for (const key of referenceKeys) {
        const pluginName = /^\$\((.+)\)$/.exec(key.split(".")[0])?.[1];
        const staticPath = replaceRefVarsWithValues(key);
        const staticSchema = getStaticSchemaAtPath(rootSchemaMap[pluginName], staticPath);
        const types = Object.keys(expandedTypesWithRefs).filter((type) => {
            return (0, exports.typestructsAreEquivalent)(expandedTypesWithRefs[type], staticSchema);
        });
        out[key] = [staticPath, ...types];
    }
    return out;
};
exports.buildPointerReturnTypeMap = buildPointerReturnTypeMap;
const getPointersForRefType = (refType, referenceReturnTypeMap) => {
    return Object.keys(referenceReturnTypeMap).filter((path) => {
        return referenceReturnTypeMap[path].includes(refType);
    });
};
const buildPointerArgsMap = (referenceReturnTypeMap) => {
    const out = {};
    for (const key in referenceReturnTypeMap) {
        const path = (0, exports.decodeSchemaPath)(key);
        const argsPath = path.filter((part) => typeof part != "string");
        const args = argsPath.map((arg) => {
            if (primitives.has(arg.value)) {
                if (arg.value == "int" || arg.value == "float") {
                    return ["number"];
                }
                if (arg.value == "file") {
                    return ["FileRef"];
                }
                return [arg.value];
            }
            const { value: argValue } = extractKeyValueFromRefString(arg.value);
            const refArgs = getPointersForRefType(argValue, referenceReturnTypeMap);
            return refArgs;
        });
        out[key] = args;
    }
    return out;
};
exports.buildPointerArgsMap = buildPointerArgsMap;
const drawQueryTypes = (argMap) => {
    let code = "export type QueryTypes = {\n";
    for (const path in argMap) {
        const wildcard = (0, exports.replaceRefVarsWithWildcards)(path);
        const argStr = argMap[path].reduce((s, argPossibilities) => {
            if (argPossibilities[0] == "string" ||
                argPossibilities[0] == "boolean" ||
                argPossibilities[0] == "number") {
                return s.replace("<?>", `<$\{${argPossibilities[0]}}>`);
            }
            const line = argPossibilities
                .map(exports.replaceRefVarsWithWildcards)
                .map((wcq) => `QueryTypes['${wcq}']`)
                .join("|");
            return s.replace("<?>", `<$\{${line}}>`);
        }, wildcard);
        code += `  ['${wildcard}']: \`${argStr}\`;\n`;
    }
    code += "};\n";
    return code;
};
const drawMakeQueryRef = (argMap, useReact = false) => {
    let code = drawQueryTypes(argMap) + "\n";
    const globalArgs = [];
    const globalQueryParam = Object.keys(argMap)
        .map(exports.replaceRefVarsWithWildcards)
        .map((query) => `'${query}'`)
        .join("|");
    const globalQueryReturn = Object.keys(argMap)
        .map(exports.replaceRefVarsWithWildcards)
        .map((query) => `QueryTypes['${query}']`)
        .join("|");
    for (const query in argMap) {
        const args = argMap[query];
        for (let i = 0; i < args.length; ++i) {
            if (globalArgs[i] == undefined) {
                globalArgs.push([]);
            }
            for (let j = 0; j < args[i].length; ++j) {
                if (!globalArgs[i].includes(args[i][j])) {
                    globalArgs[i].push(args[i][j]);
                }
            }
        }
        const params = args.reduce((s, possibleArgs, index) => {
            const argType = possibleArgs
                .map((possibleArg) => {
                if (possibleArg == "string" ||
                    possibleArg == "boolean" ||
                    possibleArg == "number") {
                    return possibleArg;
                }
                return `QueryTypes['${(0, exports.replaceRefVarsWithWildcards)(possibleArg)}']`;
            })
                .join("|");
            return s + `, arg${index}: ${argType}`;
        }, `query: '${(0, exports.replaceRefVarsWithWildcards)(query)}'`);
        code += `export function makeQueryRef(${params}): QueryTypes['${(0, exports.replaceRefVarsWithWildcards)(query)}'];\n`;
    }
    const globalParams = [];
    for (let i = 0; i < globalArgs.length; ++i) {
        const args = globalArgs[i];
        const isOptional = i > 0;
        const argType = args
            .map((possibleArg) => {
            if (possibleArg == "string" ||
                possibleArg == "boolean" ||
                possibleArg == "number") {
                return possibleArg;
            }
            return `QueryTypes['${(0, exports.replaceRefVarsWithWildcards)(possibleArg)}']`;
        })
            .join("|");
        const params = `arg${i}${isOptional ? "?" : ""}: ${argType}`;
        globalParams.push(params);
    }
    code += `export function makeQueryRef(query: ${globalQueryParam}, ${globalParams.join(", ")}): ${globalQueryReturn}|null {\n`;
    for (const query in argMap) {
        const args = argMap[query];
        const returnType = args.reduce((s, argType, i) => {
            if (argType[0] == "string" ||
                argType[0] == "boolean" ||
                argType[0] == "number") {
                return s.replace("<?>", `<$\{arg${i} as ${argType[0]}}>`);
            }
            return s.replace("<?>", `<$\{arg${i} as ${argType
                .map(exports.replaceRefVarsWithWildcards)
                .map((v) => `QueryTypes['${v}']`)
                .join("|")}}>`);
        }, `return \`${(0, exports.replaceRefVarsWithWildcards)(query)}\`;`);
        code += `  if (query == '${(0, exports.replaceRefVarsWithWildcards)(query)}') {\n`;
        code += `    ${returnType}\n`;
        code += `  }\n`;
    }
    code += `  return null;\n`;
    code += `};\n`;
    if (useReact) {
        code += `\n`;
        for (const query in argMap) {
            const args = argMap[query];
            const params = args.reduce((s, possibleArgs, index) => {
                const argType = possibleArgs
                    .map((possibleArg) => {
                    if (possibleArg == "string" ||
                        possibleArg == "boolean" ||
                        possibleArg == "number") {
                        return possibleArg;
                    }
                    return `QueryTypes['${(0, exports.replaceRefVarsWithWildcards)(possibleArg)}']`;
                })
                    .join("|");
                return s + `, arg${index}: ${argType}`;
            }, `query: '${(0, exports.replaceRefVarsWithWildcards)(query)}'`);
            code += `export function useQueryRef(${params}): QueryTypes['${(0, exports.replaceRefVarsWithWildcards)(query)}'];\n`;
        }
        code += `export function useQueryRef(query: ${globalQueryParam}, ${globalParams.join(", ")}): ${globalQueryReturn}|null {\n`;
        code += `  return useMemo(() => {\n`;
        for (const query in argMap) {
            const args = argMap[query];
            const argsCasts = args
                .map((argType, i) => {
                if (argType[0] == "string" ||
                    argType[0] == "boolean" ||
                    argType[0] == "number") {
                    return `arg${i} as ${argType[0]}`;
                }
                return `arg${i} as ${argType
                    .map(exports.replaceRefVarsWithWildcards)
                    .map((v) => `QueryTypes['${v}']`)
                    .join("|")}`;
            })
                .join(", ");
            code += `    if (query == '${(0, exports.replaceRefVarsWithWildcards)(query)}') {\n`;
            code += `      return makeQueryRef(query, ${argsCasts});\n`;
            code += `    }\n`;
        }
        code += `    return null;\n`;
        code += `  }, [query, ${globalArgs
            .map((_, i) => `arg${i}`)
            .join(", ")}]);\n`;
        code += `};`;
    }
    return code;
};
exports.drawMakeQueryRef = drawMakeQueryRef;
const drawSchemaRoot = (rootSchemaMap, referenceReturnTypeMap) => {
    return `export type SchemaRoot = ${drawTypestruct(rootSchemaMap, referenceReturnTypeMap)}`;
};
exports.drawSchemaRoot = drawSchemaRoot;
const drawRefReturnTypes = (rootSchemaMap, referenceReturnTypeMap) => {
    let code = `export type RefReturnTypes = {\n`;
    for (const path in referenceReturnTypeMap) {
        const [staticPath] = referenceReturnTypeMap[path];
        const pluginName = /^\$\((.+)\)$/.exec(staticPath.split(".")[0])?.[1];
        const staticSchema = getStaticSchemaAtPath(rootSchemaMap[pluginName], staticPath);
        const typestructCode = drawTypestruct(staticSchema, referenceReturnTypeMap, "  ");
        const wildcard = (0, exports.replaceRefVarsWithWildcards)(path);
        code += `  ['${wildcard}']: ${typestructCode}\n`;
    }
    code += "};\n";
    return code;
};
exports.drawRefReturnTypes = drawRefReturnTypes;
const drawTypestruct = (typeStruct, referenceReturnTypeMap, indentation = "", semicolonLastLine = true, identTop = true, breakLastLine = true) => {
    let code = `${identTop ? indentation : ""}{\n`;
    for (const prop in typeStruct) {
        if (prop == "(id)") {
            continue;
        }
        if (typeof typeStruct[prop]?.type == "string" &&
            primitives.has(typeStruct[prop]?.type)) {
            const propName = typeStruct[prop].nullable
                ? `['${prop}']?`
                : `['${prop}']`;
            const type = typeStruct[prop]?.type == "int" || typeStruct[prop]?.type == "float"
                ? "number"
                : typeStruct[prop]?.type == "file"
                    ? "FileRef"
                    : typeStruct[prop]?.type;
            code += `  ${indentation}${propName}: ${type};\n`;
            continue;
        }
        if (typeof typeStruct[prop]?.type == "string" &&
            typeStruct[prop]?.type == "ref") {
            const propName = typeStruct[prop].nullable
                ? `['${prop}']?`
                : `['${prop}']`;
            const returnTypes = Object.keys(referenceReturnTypeMap)
                .filter((query) => {
                return referenceReturnTypeMap[query].includes(typeStruct[prop]?.refType);
            })
                .map(exports.replaceRefVarsWithWildcards)
                .map((query) => `QueryTypes['${query}']`)
                .join("|");
            code += `  ${indentation}${propName}: ${returnTypes};\n`;
            continue;
        }
        if (typeof typeStruct[prop]?.type == "string" &&
            (typeStruct[prop]?.type == "array" || typeStruct[prop]?.type == "set") &&
            typeof typeStruct[prop]?.values == "string" &&
            primitives.has(typeStruct[prop]?.values)) {
            const type = typeStruct[prop]?.values == "int" || typeStruct[prop]?.values == "float"
                ? "number"
                : typeStruct[prop]?.values == "file"
                    ? "FileRef"
                    : typeStruct[prop]?.type;
            const propName = `['${prop}']`;
            code += `  ${indentation}${propName}: Array<${type}>;\n`;
            continue;
        }
        if (typeof typeStruct[prop]?.type == "string" &&
            (typeStruct[prop]?.type == "array" || typeStruct[prop]?.type == "set") &&
            typeof typeStruct[prop]?.values == "object") {
            const type = drawTypestruct(typeStruct[prop]?.values, referenceReturnTypeMap, `${indentation}  `, false, false, false);
            const propName = `['${prop}']`;
            code += `  ${indentation}${propName}: Array<${type}>;\n`;
            continue;
        }
        if (!typeStruct[prop]?.type && typeof typeStruct[prop] == "object") {
            const type = drawTypestruct(typeStruct[prop], referenceReturnTypeMap, `${indentation}  `, false, false, false);
            const propName = `['${prop}']`;
            code += `  ${indentation}${propName}: ${type};\n`;
            continue;
        }
    }
    code += `${indentation}}${semicolonLastLine ? ";" : ""}${breakLastLine ? "\n" : ""}`;
    return code;
};
const GENERATED_CODE_FUNCTIONS = `
const getCounterArrowBalanance = (str: string): number => {
  let counter = 0;
  for (let i = 0; i < str.length; ++i) {
    if (str[i] == "<") counter++;
    if (str[i] == ">") counter--;
  }
  return counter;
};

const extractKeyValueFromRefString = (
  str: string
): { key: string; value: string } => {
  let key = "";
  let i = 0;
  while (str[i] != "<") {
    key += str[i++];
  }
  let value = "";
  let counter = 1;
  i++;
  while (i < str.length) {
    if (str[i] == "<") counter++;
    if (str[i] == ">") counter--;
    if (counter >= 1) {
      value += str[i];
    }
    i++;
  }
  return {
    key,
    value,
  };
};

const splitPath = (str: string): Array<string> => {
  let out: Array<string> = [];
  let arrowBalance = 0;
  let curr = "";
  for (let i = 0; i <= str.length; ++i) {
    if (i == str.length) {
      out.push(curr);
      continue;
    }
    if (arrowBalance == 0 && str[i] == ".") {
      out.push(curr);
      curr = "";
      continue;
    }
    if (str[i] == "<") {
      arrowBalance++;
    }
    if (str[i] == ">") {
      arrowBalance--;
    }
    curr += str[i];
  }
  return out;
};

const decodeSchemaPathWithArrays = (
  pathString: string
): Array<{key: string, value: string} | string | number> => {
  return splitPath(pathString).map((part) => {
    if (/^[(d+)]$/.test(part)) {
      return parseInt(((/^[(d+)]$/.exec(part) as Array<string>)[1]));
    }
    if (/^(.+)<(.+)>$/.test(part) && getCounterArrowBalanance(part) == 0) {
      const { key, value } = extractKeyValueFromRefString(part);
      return {
        key,
        value,
      };
    }
    return part;
  });
};

const getObjectInStateMap = (
  stateMap: { [pluginName: string]: object },
  path: string
): object | null => {
  let current: null | object = null;
  const [pluginWrapper, ...decodedPath] = decodeSchemaPathWithArrays(path);
  const pluginName = /^$((.+))$/.exec(pluginWrapper as string)?.[1] ?? null;
  if (pluginName == null) {
    return null;
  }
  current = stateMap[pluginName];
  for (const part of decodedPath) {
    if (!current) {
      return null;
    }
    if (typeof part == "number") {
      current = current[part];
    } else if (typeof part != "string") {
      const { key, value } = part as {key: string, value: string};
      if (Array.isArray(current)) {
        const element = current?.find?.((v) => v?.[key] == value);
        current = element;
      } else {
        return null;
      }
    } else {
      current = current[part];
    }
  }
  return current ?? null;
};

export const replaceRefVarsWithWildcards = (pathString: string): string => {
  const path = splitPath(pathString);
  return path
    .map((part) => {
      if (/^(.+)<(.+)>$/.test(part)) {
        const { key } = extractKeyValueFromRefString(part);
        return \`$\{key}<?>\`;
      }
      return part;
    })
    .join(".");
};
`;
const drawGetReferencedObject = (argMap, useReact = false) => {
    const wildcards = Object.keys(argMap).map(exports.replaceRefVarsWithWildcards);
    let code = "";
    code += GENERATED_CODE_FUNCTIONS;
    code += "\n";
    for (const wildcard of wildcards) {
        code += `export function getReferencedObject(root: SchemaRoot, query: QueryTypes['${wildcard}']): RefReturnTypes['${wildcard}'];\n`;
    }
    const globalQueryTypes = wildcards
        .map((wildcard) => `QueryTypes['${wildcard}']`)
        .join("|");
    const globalReturnTypes = wildcards
        .map((wildcard) => `RefReturnTypes['${wildcard}']`)
        .join("|");
    code += `export function getReferencedObject(root: SchemaRoot, query: ${globalQueryTypes}): ${globalReturnTypes}|null {\n`;
    for (const wildcard of wildcards) {
        code += `  if (replaceRefVarsWithWildcards(query) == '${wildcard}') {\n`;
        code += `    return getObjectInStateMap(root, query) as RefReturnTypes['${wildcard}'];\n`;
        code += `  }\n`;
    }
    code += `  return null;\n`;
    code += `}`;
    if (useReact) {
        code += `\n`;
        for (const wildcard of wildcards) {
            code += `export function useReferencedObject(root: SchemaRoot, query: QueryTypes['${wildcard}']): RefReturnTypes['${wildcard}'];\n`;
        }
        const globalQueryTypes = wildcards
            .map((wildcard) => `QueryTypes['${wildcard}']`)
            .join("|");
        const globalReturnTypes = wildcards
            .map((wildcard) => `RefReturnTypes['${wildcard}']`)
            .join("|");
        code += `export function useReferencedObject(root: SchemaRoot, query: ${globalQueryTypes}): ${globalReturnTypes}|null {\n`;
        code += `  return useMemo(() => {\n`;
        for (const wildcard of wildcards) {
            code += `    if (replaceRefVarsWithWildcards(query) == '${wildcard}') {\n`;
            code += `      return getObjectInStateMap(root, query) as RefReturnTypes['${wildcard}'];\n`;
            code += `    }\n`;
        }
        code += `    return null;\n`;
        code += `  }, [root, query]);\n`;
        code += `}`;
    }
    return code;
};
exports.drawGetReferencedObject = drawGetReferencedObject;
const drawGetPluginStore = (rootSchemaMap, useReact = false) => {
    let code = "";
    code += "\n";
    const plugins = Object.keys(rootSchemaMap);
    for (const plugin of plugins) {
        code += `export function getPluginStore(root: SchemaRoot, plugin: '${plugin}'): SchemaRoot['${plugin}'];\n`;
    }
    const globalPluginArgs = plugins.map((p) => `'${p}'`).join("|");
    const globalPluginReturn = plugins.map((p) => `SchemaRoot['${p}']`).join("|");
    code += `export function getPluginStore(root: SchemaRoot, plugin: ${globalPluginArgs}): ${globalPluginReturn} {\n`;
    code += `  return root[plugin];\n`;
    code += `}\n`;
    if (useReact) {
        code += "\n";
        for (const plugin of plugins) {
            code += `export function usePluginStore(root: SchemaRoot, plugin: '${plugin}'): SchemaRoot['${plugin}'];\n`;
        }
        code += `export function usePluginStore(root: SchemaRoot, plugin: ${globalPluginArgs}): ${globalPluginReturn} {\n`;
        code += `  return useMemo(() => {\n`;
        code += `    return root[plugin];\n`;
        code += `  }, [root, plugin]);\n`;
        code += `}\n`;
    }
    return code;
};
exports.drawGetPluginStore = drawGetPluginStore;
//# sourceMappingURL=plugins.js.map