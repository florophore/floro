import { getPluginsJsonAsync, vDEVPath, vPluginsPath } from "./filestructure";

import axios from "axios";
import path from "path";
import { DiffElement } from "./versioncontrol";
import fs from 'fs';
import { Crypto } from "cryptojs";

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
  icon:
    | string
    | {
        light: string;
        dark: string;
      };
  imports: {
    [name: string]: string;
  };
  types: TypeStruct;
  store: TypeStruct;
}

const primitives = new Set(["int", "float", "boolean", "string"]);

export const readDevPluginManifest = async (
  pluginName: string,
  pluginVersion: string
): Promise<Manifest | null> => {
  const pluginsJSON = await getPluginsJsonAsync();
  if (!pluginsJSON) {
    return null;
  }
  if (pluginsJSON.plugins?.[pluginName]?.proxy) {
    try {
      const uri = `http://127.0.0.1:63403/plugins/${pluginName}/floro/floro.manifest.json`;
      const res = await axios.get(uri);
      return res.data;
    } catch (e) {
      return null;
    }
  }
  try {
    const pluginManifestPath = path.join(
      vDEVPath,
      `${pluginName}@${pluginVersion}`,
      "floro",
      "floro.manifest.json"
    );
    const manifestString = await fs.promises.readFile(pluginManifestPath);
    return JSON.parse(manifestString.toString());
  } catch (e) {
    return null;
  }
};

export const getPluginManifest = async (
  pluginName: string,
  plugins: Array<PluginElement>
): Promise<Manifest | null> => {
  const pluginInfo = plugins.find((v) => v.key == pluginName);
  if (!pluginInfo) {
    return;
  }
  if (pluginInfo.value.startsWith("dev")) {
    const [, v] = pluginInfo.value.split("@");
    return await readDevPluginManifest(pluginName, v ?? "");
  }
  if (!pluginInfo.value) {
    return null;
  }
  const pluginManifestPath = path.join(
    vPluginsPath,
    `${pluginName}@${pluginInfo.value}`,
    "floro",
    "floro.manifest.json"
  );
  const manifestString = await fs.promises.readFile(pluginManifestPath);
  return JSON.parse(manifestString.toString());
};

export const pluginManifestsAreCompatibleForUpdate = async (
  oldPluginList: Array<PluginElement>,
  newPluginList: Array<PluginElement>
): Promise<boolean> => {
  const oldManifests = await getPluginManifests(oldPluginList);
  const newManifests = await getPluginManifests(newPluginList);
  const oldSchemaMap = manifestListToSchemaMap(oldManifests);
  const newSchemaMap = manifestListToSchemaMap(newManifests);

  return newManifests.reduce((isCompatible, newManifest) => {
    if (!isCompatible) {
      return false;
    }
    if (!oldSchemaMap[newManifest.name]) {
      return true;
    }
    return pluginManifestIsSubsetOfManifest(
      oldSchemaMap,
      newSchemaMap,
      newManifest.name
    );
  }, true);
};

export const getPluginManifests = async (
  pluginList: Array<PluginElement>
): Promise<Array<Manifest>> => {
  const manifests = await Promise.all(
    pluginList.map(({ key: pluginName }) => {
      return getPluginManifest(pluginName, pluginList);
    })
  );
  return manifests?.filter((manifest) => {
    return !!manifest;
  });
};

export const pluginListToMap = (
  pluginList: Array<PluginElement>
): { [pluginName: string]: string } => {
  return pluginList.reduce((map, { key, value }) => {
    return {
      ...map,
      [key]: value,
    };
  }, {});
};

export const pluginMapToList = (pluginMap: {
  [pluginName: string]: string;
}): Array<PluginElement> => {
  return Object.keys(pluginMap).map((key) => {
    return {
      key,
      value: pluginMap[key],
    };
  });
};

export const manifestListToSchemaMap = (
  manifestList: Array<Manifest>
): { [pluginName: string]: Manifest } => {
  return manifestList.reduce((acc, manifest) => {
    return {
      ...acc,
      [manifest.name]: manifest,
    };
  }, {});
};

export const hasPlugin = (
  pluginName: string,
  plugins: Array<PluginElement>
): boolean => {
  for (const { key } of plugins) {
    if (key === pluginName) {
      return true;
    }
  }
  return false;
};

export const getUpstreamDependencyList = async (
  pluginName: string,
  manifest: Manifest,
  plugins: Array<PluginElement>
): Promise<Array<PluginElement> | null> => {
  if (!hasPlugin(pluginName, plugins)) {
    return null;
  }
  const pluginInfo = plugins.find((v) => v.key == pluginName);
  const deps = [pluginInfo];
  for (let dependentPluginName in manifest.imports) {
    if (!hasPlugin(dependentPluginName, plugins)) {
      return null;
    }
    // check semver here
    const dependentManifest = await getPluginManifest(
      dependentPluginName,
      plugins
    );
    if (!dependentManifest) {
      return null;
    }
    const subDeps = await getUpstreamDependencyList(
      dependentPluginName,
      dependentManifest,
      plugins
    );
    if (subDeps == null) {
      return null;
    }
    for (let dep of subDeps) {
      if (!hasPlugin(dep.key, deps)) {
        deps.push(dep);
      }
    }
  }
  return deps;
};

export const containsCyclicTypes = (
  schema: Manifest,
  struct: TypeStruct,
  visited = {}
) => {
  for (const prop in struct) {
    if (
      (struct[prop].type as string) == "set" ||
      ((struct[prop].type as string) == "array" &&
        !primitives.has(struct[prop].values as string))
    ) {
      if (
        visited[struct[prop].values as string] ||
        containsCyclicTypes(
          schema,
          schema.types[struct[prop].values as string] as TypeStruct,
          {
            ...visited,
            [struct[prop].values as string]: true,
          }
        )
      ) {
        return true;
      }
    } else if (schema.types[struct[prop].type as string]) {
      if (
        visited[struct[prop].type as string] ||
        containsCyclicTypes(
          schema,
          schema.types[struct[prop].type as string] as TypeStruct,
          {
            ...visited,
            [schema.types[struct[prop].type as string] as unknown as string]:
              true,
          }
        )
      ) {
        return true;
      }
    } else if (!struct[prop]?.type) {
      if (
        containsCyclicTypes(schema, struct[prop] as TypeStruct, {
          ...visited,
        })
      ) {
        return true;
      }
    }
  }
  return false;
};

const constructRootSchema = (
  schema: Manifest,
  struct: TypeStruct,
  pluginName: string
): TypeStruct => {
  let out = {};
  for (const prop in struct) {
    out[prop] = {};
    if (struct[prop]?.type == "set") {
      if (
        typeof struct[prop]?.values == "string" &&
        primitives.has(struct[prop]?.values as string)
      ) {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable ?? true;
        out[prop].values = struct[prop].values;
        continue;
      }

      if (
        typeof struct[prop]?.values == "string" &&
        schema.types[struct[prop]?.values as string]
      ) {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable ?? true;
        out[prop].values = constructRootSchema(
          schema,
          schema.types[struct[prop]?.values as string] as TypeStruct,
          pluginName
        );
        continue;
      }
      if (typeof struct[prop]?.values != "string") {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable ?? true;
        out[prop].values = constructRootSchema(
          schema,
          (struct[prop]?.values ?? {}) as TypeStruct,
          pluginName
        );
        continue;
      }
    }
    if (struct[prop]?.type == "array") {
      if (
        typeof struct[prop]?.values == "string" &&
        primitives.has(struct[prop]?.values as string)
      ) {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable ?? true;
        out[prop].values = struct[prop].values;
        continue;
      }

      if (
        typeof struct[prop]?.values == "string" &&
        schema.types[struct[prop]?.values as string]
      ) {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable ?? true;
        out[prop].values = constructRootSchema(
          schema,
          {
            ...(schema.types[struct[prop]?.values as string] as TypeStruct),
            ["(id)"]: {
              type: "string",
              isKey: true,
            },
          },
          pluginName
        );
        continue;
      }

      if (typeof struct[prop]?.values != "string") {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable ?? true;
        out[prop].values = constructRootSchema(
          schema,
          {
            ...((struct[prop]?.values ?? {}) as TypeStruct),
            ["(id)"]: {
              type: "string",
              isKey: true,
            },
          },
          pluginName
        );
        continue;
      }
    }
    if (primitives.has(struct[prop]?.type as string)) {
      out[prop] = struct[prop];
      continue;
    }
    if (/^ref<(.+)>$/.test(struct[prop].type as string)) {
      const typeName = /^ref<(.+)>$/.exec(struct[prop].type as string)[1];
      if (primitives.has(typeName)) {
        out[prop] = struct[prop];
        out[prop].type = "ref";
        out[prop].refType = typeName;
        out[prop].refKeyType = typeName;
        out[prop].onDelete = struct[prop]?.onDelete ?? "delete";
        out[prop].nullable = struct[prop]?.nullable ?? false;
      } else {
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
          if (key) continue;
          if (type[p]?.isKey) {
            key = type[p];
          }
        }
        if (!key) {
          const message =
            "Invalid reference type: " +
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
    if (schema.types[struct[prop].type as string]) {
      out[prop] = constructRootSchema(
        schema,
        schema.types[struct[prop].type as string] as TypeStruct,
        pluginName
      );
      continue;
    }
    if (!struct[prop]?.type) {
      out[prop] = constructRootSchema(
        schema,
        struct[prop] as TypeStruct,
        pluginName
      );
      continue;
    }
  }
  return out;
};

export const defaultVoidedState = (
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object }
) => {
  const rootSchemaMap = getRootSchemaMap(schemaMap);
  return Object.keys(rootSchemaMap).reduce((acc, pluginName) => {
    const struct = rootSchemaMap[pluginName];
    const state = stateMap?.[pluginName] ?? {};
    return {
      ...acc,
      [pluginName]: sanitizePrimitivesWithSchema(
        struct,
        defaultMissingSchemaState(struct, state, stateMap)
      ),
    };
  }, []);
};

const defaultMissingSchemaState = (
  struct: TypeStruct,
  state: object,
  stateMap: { [key: string]: object }
) => {
  let out = {};
  for (let prop in struct) {
    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      primitives.has(struct[prop].values as string)
    ) {
      out[prop] = state?.[prop] ?? [];
      continue;
    }
    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      typeof struct[prop]?.values == "object"
    ) {
      out[prop] =
        (state?.[prop] ?? [])?.map((value: object) => {
          return defaultMissingSchemaState(
            struct[prop]?.values as TypeStruct,
            value as object,
            stateMap
          );
        }) ?? [];
      continue;
    }
    if (primitives.has(struct[prop]?.type as string)) {
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
      out[prop] = defaultMissingSchemaState(
        struct[prop] as TypeStruct,
        state[prop] ?? {},
        stateMap
      );
    }
  }
  return out;
};

const enforcePrimitiveSet = (
  set: Array<boolean | string | number>
): Array<boolean | string | number> => {
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

const sanitizePrimitivesWithSchema = (struct: TypeStruct, state: object) => {
  let out = {};
  for (let prop in struct) {
    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      struct[prop].values == "int"
    ) {
      const list =
        state?.[prop]
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
    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      struct[prop].values == "float"
    ) {
      const list =
        state?.[prop]
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

    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      struct[prop].values == "boolean"
    ) {
      const list =
        state?.[prop]
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

    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      struct[prop].values == "string"
    ) {
      const list =
        state?.[prop]
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

    if (
      (struct[prop]?.type == "set" || struct[prop]?.type == "array") &&
      typeof struct[prop]?.values == "object"
    ) {
      out[prop] =
        (state?.[prop] ?? [])?.map((value: object) => {
          return sanitizePrimitivesWithSchema(
            struct[prop]?.values as TypeStruct,
            value
          );
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

    if (!struct[prop]?.type) {
      out[prop] = sanitizePrimitivesWithSchema(
        struct[prop] as TypeStruct,
        state[prop] ?? {}
      );
      continue;
    }
    out[prop] = state[prop] ?? null;
  }
  return out;
};

export const writePathString = (
  pathParts: Array<DiffElement | string>
): string => {
  return pathParts
    .map((part) => {
      if (typeof part == "string") {
        return part;
      }
      return `${part.key}<${part.value}>`;
    })
    .join(".");
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

const getCounterArrowBalanance = (str: string): number => {
  let counter = 0;
  for (let i = 0; i < str.length; ++i) {
    if (str[i] == "<") counter++;
    if (str[i] == ">") counter--;
  }
  return counter;
};

const splitPath = (str: string): Array<string> => {
  let out = [];
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

export const decodeSchemaPath = (
  pathString: string
): Array<DiffElement | string> => {
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

export const getStateId = (schema: TypeStruct, state: object) => {
  let hashPairs = [];
  for (let prop in schema) {
    if (!schema[prop].type) {
      hashPairs.push({
        key: prop,
        value: getStateId(schema[prop] as TypeStruct, state[prop]),
      });
    }
    if (primitives.has(schema[prop].type as string)) {
      hashPairs.push({
        key: prop,
        value: Crypto.SHA256(`${state[prop]}`),
      });
    }
    if (schema[prop].type == "set" || schema[prop].type == "array") {
      hashPairs.push({
        key: prop,
        value: state[prop]?.reduce((s: string, element) => {
          if (
            typeof schema[prop].values == "string" &&
            primitives.has(schema[prop].values as string)
          ) {
            return Crypto.SHA256(s + `${element}`);
          }
          return Crypto.SHA256(
            s + getStateId(schema[prop].values as TypeStruct, element)
          );
        }, ""),
      });
    }
  }
  return Crypto.SHA256(
    hashPairs.reduce((s, { key, value }) => {
      if (key == "(id)") {
        return s;
      }
      if (s == "") {
        return `${key}:${value}`;
      }
      return s + "/" + `${key}:${value}`;
    }, "")
  );
};

export const flattenStateToSchemaPathKV = (
  schemaRoot: Manifest,
  state: object,
  traversalPath: Array<string>
): Array<DiffElement> => {
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

    if (
      schemaRoot[prop]?.type == "set" &&
      !primitives.has(schemaRoot[prop].values)
    ) {
      sets.push(prop);
      continue;
    }
    if (
      schemaRoot[prop]?.type == "array" &&
      !primitives.has(schemaRoot[prop].values)
    ) {
      arrays.push(prop);
      continue;
    }
    if (
      !primitives.has(schemaRoot[prop]?.type) &&
      !(
        (schemaRoot[prop]?.type == "array" ||
          schemaRoot[prop]?.type == "set") &&
        primitives.has(schemaRoot[prop]?.values)
      ) &&
      schemaRoot[prop]?.type != "ref"
    ) {
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
    kv.push(
      ...flattenStateToSchemaPathKV(schemaRoot[prop], state[prop], [
        ...traversalPath,
        ...(primaryKey ? [primaryKey] : []),
        prop,
      ])
    );
  }
  for (let prop of arrays) {
    (state?.[prop] ?? []).forEach((element) => {
      const id = getStateId(schemaRoot[prop].values, element);
      kv.push(
        ...flattenStateToSchemaPathKV(
          schemaRoot[prop].values,
          { ...element, ["(id)"]: id },
          [...traversalPath, prop]
        )
      );
    });
  }
  for (let prop of sets) {
    (state?.[prop] ?? []).forEach((element) => {
      kv.push(
        ...flattenStateToSchemaPathKV(schemaRoot[prop].values, element, [
          ...traversalPath,
          ...(primaryKey ? [primaryKey] : []),
          prop,
        ])
      );
    });
  }
  return kv;
};

export const indexArrayDuplicates = (
  kvs: Array<DiffElement>
): Array<DiffElement> => {
  let visitedIds: { [key: string]: { count: number } } = {};
  let out = [];
  for (let { key, value } of kvs) {
    const [, ...decodedPath] = decodeSchemaPath(key);
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
      } else {
        visitedIds[concatenatedId].count++;
      }
    }
    let updatedKey = key;
    let ids = concatenatedId.split(":").filter((v: string) => v != "");
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

export const buildObjectsAtPath = (
  rootSchema: Manifest,
  path: string,
  properties: { [key: string]: number | string | boolean },
  out = {}
): object => {
  // ignore $(store)
  const [, ...decodedPath] = decodeSchemaPath(path);
  let current = out;
  let currentSchema = rootSchema;
  for (const part of decodedPath) {
    if (typeof part == "string" && currentSchema?.[part]?.type == "set") {
      if (!current[part as string]) {
        current[part as string] = [];
      }
      current = current[part];
      currentSchema = currentSchema[part].values;
      continue;
    }
    if (typeof part == "string" && currentSchema?.[part]?.type == "array") {
      if (!current[part as string]) {
        current[part as string] = [];
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

const getSchemaAtPath = (
  rootSchema: Manifest | TypeStruct,
  path: string
): object => {
  try {
    const [, ...decodedPath] = decodeSchemaPath(path);
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
  } catch (e) {
    return null;
  }
  // ignore $(store)
};

const getStaticSchemaAtPath = (
  rootSchema: Manifest | TypeStruct,
  path: string
): object => {
  // ignore $(store)
  const [, ...decodedPath] = decodeSchemaPath(path);
  let currentSchema = rootSchema;
  for (const part of decodedPath) {
    if (typeof part == "string") {
      currentSchema = currentSchema[part];
      continue;
    }
  }
  return currentSchema;
};

const getObjectInStateMap = (
  stateMap: { [pluginName: string]: object },
  path: string
): object | null => {
  let current = null;
  const [pluginWrapper, ...decodedPath] = decodeSchemaPath(path);
  const pluginName = /^\$\((.+)\)$/.exec(pluginWrapper as string)?.[1] ?? null;
  current = stateMap[pluginName];
  for (let part of decodedPath) {
    if (!current) {
      return null;
    }
    if (typeof part != "string") {
      const { key, value } = part as DiffElement;
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

const cleanArrayIDsFromState = (state: object) => {
  const out = {};
  for (let prop in state) {
    if (Array.isArray(state[prop])) {
      out[prop] = state[prop].map((v: object | string | number | boolean) => {
        if (
          typeof v == "string" ||
          typeof v == "number" ||
          typeof v == "boolean"
        ) {
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

const generateKVFromStateWithRootSchema = (
  rootSchema: TypeStruct,
  pluginName: string,
  state: object
): Array<DiffElement> => {
  const flattenedState = flattenStateToSchemaPathKV(
    rootSchema as unknown as Manifest,
    state,
    [`$(${pluginName})`]
  );
  return (
    flattenedState?.map?.(({ key, value }) => {
      return {
        key: writePathString(key as unknown as Array<string | DiffElement>),
        value,
      };
    }) ?? []
  );
};

const iterateSchemaTypes = (
  types: Manifest["types"],
  pluginName: string,
  importedTypes = {}
): object => {
  let out = {};
  for (const prop in types) {
    out[prop] = {};
    if (types[prop]?.type === "set" || types[prop]?.type === "array") {
      out[prop].type = types[prop]?.type;
      out[prop].emptyable = types[prop]?.emptyable ?? true;
      if (
        typeof types[prop].values == "string" &&
        primitives.has(types[prop].values as string)
      ) {
        out[prop].values = types[prop].values;
        continue;
      }
      if (
        typeof types[prop].values == "string" &&
        (types[prop].values as string).split(".").length == 1
      ) {
        out[prop].values = `${pluginName}.${types[prop].values}`;
        continue;
      }
      if (
        typeof types[prop].values == "string" &&
        typeof importedTypes[types[prop].values as string] == "object"
      ) {
        out[prop].values = iterateSchemaTypes(
          importedTypes[types[prop].values as string] as TypeStruct,
          pluginName,
          importedTypes
        );
        continue;
      }
      if (typeof types[prop].values == "object") {
        out[prop].values = iterateSchemaTypes(
          types[prop].values as TypeStruct,
          pluginName,
          importedTypes
        );
        continue;
      }
    }
    if (/^ref<(.+)>$/.test(types[prop].type as string)) {
      out[prop] = { ...types[prop] };
      const typeGroup = /^ref<(.+)>$/.exec(types[prop].type as string)[1];
      const splitGroup = typeGroup.split(".");
      if (splitGroup?.length == 1) {
        out[prop].type = `ref<${pluginName}.${typeGroup}>`;
      } else {
        out[prop].type = types[prop].type;
      }
      continue;
    }
    if (primitives.has(types[prop]?.type as string)) {
      out[prop] = types[prop];
      continue;
    }

    if (
      typeof types[prop].type == "string" &&
      importedTypes[types[prop]?.type as string]
    ) {
      out[prop] = iterateSchemaTypes(
        importedTypes[types[prop]?.type as string],
        pluginName,
        importedTypes
      );
      continue;
    }

    if (
      typeof types[prop].type == "string" &&
      importedTypes[pluginName + "." + types[prop]?.type]
    ) {
      out[prop] = iterateSchemaTypes(
        importedTypes[pluginName + "." + types[prop]?.type],
        pluginName,
        importedTypes
      );
      continue;
    }

    if (!types[prop]?.type) {
      out[prop] = iterateSchemaTypes(
        types[prop] as TypeStruct,
        pluginName,
        importedTypes
      );
    }
  }
  return out;
};

const drawSchemaTypesFromImports = (
  schema: { [key: string]: Manifest },
  pluginName: string,
  importedTypes = {}
): TypeStruct => {
  const types = Object.keys(schema[pluginName].types).reduce((types, key) => {
    if (key.startsWith(`${pluginName}.`)) {
      return {
        ...types,
        [key]: iterateSchemaTypes(
          schema[pluginName].types[key] as TypeStruct,
          pluginName,
          { ...importedTypes, ...schema[pluginName].types }
        ),
      };
    }
    return {
      ...types,
      [`${pluginName}.${key}`]: iterateSchemaTypes(
        schema[pluginName].types[key] as TypeStruct,
        pluginName,
        { ...importedTypes, ...schema[pluginName].types }
      ),
    };
  }, {});

  return Object.keys(schema[pluginName].imports).reduce(
    (acc, importPluginName) => {
      const importTypes = drawSchemaTypesFromImports(
        schema,
        importPluginName,
        importedTypes
      );
      return {
        ...acc,
        ...importTypes,
      };
    },
    types
  );
};

export const constructDependencySchema = async (
  plugins: Array<PluginElement>
): Promise<{ [key: string]: Manifest }> => {
  const [plugin, ...remaining] = plugins;
  const manifest = await getPluginManifest(plugin.key, plugins);
  if (remaining.length > 0) {
    const upstreamSchema = await constructDependencySchema(remaining);
    return {
      ...upstreamSchema,
      [plugin.key]: manifest,
    };
  }
  return {
    [plugin.key]: manifest,
  };
};

export const getStateFromKVForPlugin = (
  schemaMap: { [key: string]: Manifest },
  kv: Array<DiffElement>,
  pluginName: string
): object => {
  const rootSchema = getRootSchemaForPlugin(schemaMap, pluginName);
  const kvArray = indexArrayDuplicates(kv);
  let out = {};
  for (let pair of kvArray) {
    out = buildObjectsAtPath(
      rootSchema as unknown as Manifest,
      pair.key,
      pair.value,
      out
    );
  }
  return cleanArrayIDsFromState(out);
};

export const getExpandedTypesForPlugin = (
  schemaMap: { [key: string]: Manifest },
  pluginName: string
): TypeStruct => {
  const upstreamDeps = getUpstreamDepsInSchemaMap(schemaMap, pluginName);
  const schemaWithTypes = [...upstreamDeps, pluginName].reduce(
    (acc, pluginName) => {
      return {
        ...acc,
        ...drawSchemaTypesFromImports(schemaMap, pluginName, acc),
      };
    },
    {}
  );
  return Object.keys(schemaWithTypes).reduce((acc, type) => {
    return {
      ...acc,
      [type]: iterateSchemaTypes(acc[type], type, schemaWithTypes),
    };
  }, schemaWithTypes);
};

export const getRootSchemaForPlugin = (
  schemaMap: { [key: string]: Manifest },
  pluginName: string
): TypeStruct => {
  const schemaWithTypes = getExpandedTypesForPlugin(schemaMap, pluginName);
  const schemaWithStores = iterateSchemaTypes(
    schemaMap[pluginName].store,
    pluginName,
    schemaWithTypes
  );

  return constructRootSchema(
    {
      types: schemaWithTypes,
    } as Manifest,
    schemaWithStores as TypeStruct,
    pluginName
  );
};

export const getRootSchemaMap = (schemaMap: {
  [key: string]: Manifest;
}): { [key: string]: TypeStruct } => {
  let rootSchemaMap = {};
  for (let pluginName in schemaMap) {
    rootSchemaMap[pluginName] = getRootSchemaForPlugin(schemaMap, pluginName);
  }
  return traverseSchemaMapForRefKeyTypes(rootSchemaMap, rootSchemaMap);
};

const getKeyType = (
  keyPath: string,
  rootSchemaMap: { [key: string]: TypeStruct }
): string | null => {
  const [pluginWrapper, ...path] = splitPath(keyPath);
  let current = null;
  const typeGroup = /^\$\((.+)\)$/.exec(pluginWrapper as string)?.[1] ?? null;
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
          if (
            typeof current[prop].type == "string" &&
            (primitives.has(current[prop].type) || current[prop].type == "ref")
          ) {
            return current[prop].type;
          } else {
            return null;
          }
        }
      }
    }
  }
  return null;
};

const traverseSchemaMapForRefKeyTypes = (
  schemaMap: { [key: string]: TypeStruct | ManifestNode },
  rootSchemaMap: { [key: string]: TypeStruct }
): { [key: string]: TypeStruct } => {
  let out = {};
  for (let prop in schemaMap) {
    if (
      (schemaMap?.[prop] as ManifestNode)?.type == "ref" &&
      schemaMap?.[prop]?.refKeyType == "<?>"
    ) {
      const next = { ...schemaMap[prop] };
      const refKeyType = getKeyType(
        schemaMap?.[prop]?.refType as string,
        rootSchemaMap
      );
      if (refKeyType) {
        next.refKeyType = refKeyType;
      }
      out[prop] = next;
      continue;
    }
    if (typeof schemaMap[prop] == "object") {
      const next = traverseSchemaMapForRefKeyTypes(
        schemaMap[prop] as TypeStruct,
        rootSchemaMap
      );
      out[prop] = next;
      continue;
    }
    out[prop] = schemaMap[prop];
  }
  return out;
};

export const getKVStateForPlugin = (
  schema: { [key: string]: Manifest },
  pluginName: string,
  stateMap: { [key: string]: object }
): Array<DiffElement> => {
  const rootUpsteamSchema = getRootSchemaForPlugin(schema, pluginName);
  const state = defaultVoidedState(schema, stateMap);
  return generateKVFromStateWithRootSchema(
    rootUpsteamSchema,
    pluginName,
    state?.[pluginName]
  );
};

const getUpstreamDepsInSchemaMap = (
  schemaMap: { [key: string]: Manifest },
  pluginName: string
): Array<string> => {
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

const getDownstreamDepsInSchemaMap = (
  schemaMap: { [key: string]: Manifest },
  pluginName: string,
  memo: { [pluginName: string]: boolean } = {}
): Array<string> => {
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
      out.push(
        dep,
        ...getDownstreamDepsInSchemaMap(schemaMap, pluginName, memo)
      );
    }
  }
  return out;
};

const refSetFromKey = (key: string): Array<string> => {
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

/***
 * cascading is heavy but infrequent. It only needs to be
 * called when updating state. Not called when applying diffs
 */
export const cascadePluginState = (
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object },
  pluginName: string,
  rootSchemaMap?: { [key: string]: TypeStruct },
  memo?: { [key: string]: { [key: string]: object } }
): { [key: string]: object } => {
  if (!rootSchemaMap) {
    rootSchemaMap = getRootSchemaMap(schemaMap);
  }
  if (!memo) {
    memo = {};
  }
  const kvs = getKVStateForPlugin(schemaMap, pluginName, stateMap);
  const removedRefs = new Set();
  let next = [];
  for (const kv of kvs) {
    const key = kv.key;
    const value = {
      ...kv.value,
    };
    const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);
    const containsReferences = Object.keys(subSchema).reduce(
      (hasARef, subSchemaKey) => {
        if (hasARef) {
          return true;
        }
        return subSchema[subSchemaKey]?.type == "ref";
      },
      false
    );

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
            } else {
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
    } else {
      removedRefs.add(key);
    }
  }
  const newPluginState = getStateFromKVForPlugin(schemaMap, next, pluginName);
  const nextStateMap = { ...stateMap, [pluginName]: newPluginState };
  if (next.length != kvs.length) {
    return cascadePluginState(
      schemaMap,
      { ...stateMap, [pluginName]: newPluginState },
      pluginName,
      rootSchemaMap,
      memo
    );
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
      ...cascadePluginState(
        schemaMap,
        stateMap,
        dependentPluginName,
        rootSchemaMap,
        memo
      ),
    };
    memo[`${pluginName}:${dependentPluginName}`] = result;
    return result;
  }, nextStateMap);
  return result;
};

export const validatePluginState = (
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object },
  pluginName: string
): boolean => {
  const rootSchemaMap = getRootSchemaMap(schemaMap);
  // ignore $(store)
  const [, ...kvs] = getKVStateForPlugin(schemaMap, pluginName, stateMap);
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
      if (
        subSchema[prop]?.type &&
        (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
        value[prop] == null
      ) {
        return false;
      }
    }
  }
  return true;
};

const objectIsSubsetOfObject = (current: object, next: object): boolean => {
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

export const pluginManifestIsSubsetOfManifest = (
  currentSchemaMap: { [key: string]: Manifest },
  nextSchemaMap: { [key: string]: Manifest },
  pluginName: string
): boolean => {
  const currentDeps = [
    pluginName,
    ...getUpstreamDepsInSchemaMap(currentSchemaMap, pluginName),
  ];
  const currentGraph = currentDeps.reduce((graph, plugin) => {
    return {
      ...graph,
      [plugin]: getRootSchemaForPlugin(currentSchemaMap, plugin),
    };
  }, {});
  const nextDeps = [
    pluginName,
    ...getUpstreamDepsInSchemaMap(nextSchemaMap, pluginName),
  ];
  const nextGraph = nextDeps.reduce((graph, plugin) => {
    return {
      ...graph,
      [plugin]: getRootSchemaForPlugin(nextSchemaMap, plugin),
    };
  }, {});
  return objectIsSubsetOfObject(currentGraph, nextGraph);
};

export const isTopologicalSubset = (
  oldSchemaMap: { [key: string]: Manifest },
  oldStateMap: { [key: string]: object },
  newSchemaMap: { [key: string]: Manifest },
  newStateMap: { [key: string]: object },
  pluginName: string
): boolean => {
  if (!oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
    return true;
  }
  if (oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
    return false;
  }

  if (
    !pluginManifestIsSubsetOfManifest(oldSchemaMap, newSchemaMap, pluginName)
  ) {
    return false;
  }
  const oldKVs =
    getKVStateForPlugin(oldSchemaMap, pluginName, oldStateMap)
      ?.map?.(({ key }) => key)
      ?.filter?.((key) => {
        // remove array refs, since unstable
        if (/\(id\)<.+>/.test(key)) {
          return false;
        }
        return true;
      }) ?? [];
  const newKVs = getKVStateForPlugin(newSchemaMap, pluginName, newStateMap).map(
    ({ key }) => key
  );
  const newKVsSet = new Set(newKVs);
  for (let key of oldKVs) {
    if (!newKVsSet.has(key)) {
      return false;
    }
  }
  return true;
};

export const isTopologicalSubsetValid = (
  oldSchemaMap: { [key: string]: Manifest },
  oldStateMap: { [key: string]: object },
  newSchemaMap: { [key: string]: Manifest },
  newStateMap: { [key: string]: object },
  pluginName: string
): boolean => {
  if (
    !isTopologicalSubset(
      oldSchemaMap,
      oldStateMap,
      newSchemaMap,
      newStateMap,
      pluginName
    )
  ) {
    return false;
  }
  // we need to apply old schema against new data to ensure valid/safe
  // otherwise we would examine props outside of the subspace that may
  // be invalid in the new version but dont exist in the old version
  const oldRootSchemaMap = getRootSchemaMap(oldSchemaMap);
  // ignore $(store)
  const [, ...oldKVs] = getKVStateForPlugin(
    oldSchemaMap,
    pluginName,
    oldStateMap
  ).map(({ key }) => key);
  const oldKVsSet = new Set(oldKVs);
  // ignore $(store)
  const [, ...newKVs] = getKVStateForPlugin(
    newSchemaMap,
    pluginName,
    newStateMap
  ).filter(({ key }) => oldKVsSet.has(key));
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
      if (
        subSchema[prop]?.type &&
        (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
        value[prop] == null
      ) {
        return false;
      }
    }
  }
  return true;
};

export interface SchemaValidationResponse {
  status: "ok" | "error";
  message?: string;
}

export const isSchemaValid = (
  typeStruct: TypeStruct,
  schemaMap: { [key: string]: Manifest },
  rootSchemaMap: { [key: string]: TypeStruct },
  expandedTypes: TypeStruct,
  isDirectParentSet = false,
  isDirectParentArray = false,
  isArrayDescendent = false,
  path: Array<string> = []
): SchemaValidationResponse => {
  try {
    let keyCount = 0;
    const sets = [];
    const arrays = [];
    const nestedStructures = [];
    const refs = [];
    for (const prop in typeStruct) {
      if (
        typeof typeStruct[prop] == "object" &&
        Object.keys(typeStruct[prop]).length == 0
      ) {
        const [root, ...rest] = path;
        const formattedPath = [`$(${root})`, ...rest, prop].join(".");
        const schemaMapValue = getSchemaAtPath?.(
          schemaMap[root].store,
          writePathString([`$(${root})`, ...rest])
        );
        const schemaMapValueProp = schemaMapValue?.[prop] as ManifestNode;
        if (
          schemaMapValue &&
          schemaMapValueProp &&
          schemaMapValueProp?.type &&
          (schemaMapValueProp.type == "set" ||
            schemaMapValueProp.type == "array") &&
          !primitives.has((schemaMapValueProp?.values as string) ?? "")
        ) {
          return {
            status: "error",
            message: `Invalid value type for values '${schemaMapValueProp.values}'. Found at '${formattedPath}'.`,
          };
        }

        if (
          schemaMapValue &&
          schemaMapValueProp &&
          schemaMapValueProp?.type &&
          !(
            schemaMapValueProp.type == "set" ||
            schemaMapValueProp.type == "array"
          ) &&
          !primitives.has((schemaMapValueProp?.type as string) ?? "")
        ) {
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
        if (
          typeStruct[prop]?.type == "ref" &&
          typeStruct[prop].onDelete == "nullify"
        ) {
          const [root, ...rest] = path;
          const formattedPath = [`$(${root})`, ...rest, prop].join(".");
          return {
            status: "error",
            message: `Invalid key '${prop}'. Key types that are refs cannot have a cascaded onDelete values of nullify. Found at '${formattedPath}'.`,
          };
        }
        keyCount++;
      }

      if (
        typeof typeStruct[prop]?.type == "string" &&
        typeof typeStruct[prop]?.values != "string" &&
        typeStruct[prop].type == "set" &&
        Object.keys(typeStruct[prop]?.values ?? {}).length != 0
      ) {
        sets.push(prop);
        continue;
      }

      if (
        typeof typeStruct[prop]?.type == "string" &&
        typeof typeStruct[prop]?.values != "string" &&
        typeStruct[prop].type == "array" &&
        Object.keys(typeStruct[prop]?.values ?? {}).length != 0
      ) {
        arrays.push(prop);
        continue;
      }

      if (
        typeof typeStruct[prop]?.type == "string" &&
        typeStruct[prop].type == "ref"
      ) {
        refs.push(prop);
        continue;
      }

      if (
        typeof typeStruct[prop]?.type == "string" &&
        !(
          typeStruct[prop]?.type == "set" ||
          typeStruct[prop]?.type == "array" ||
          typeStruct[prop]?.type == "ref"
        ) &&
        !primitives.has(typeStruct[prop].type as string)
      ) {
        const [root, ...rest] = path;
        const formattedPath = [`$(${root})`, ...rest, prop].join(".");
        const schemaMapValue = getSchemaAtPath?.(
          schemaMap[root].store,
          writePathString([`$(${root})`, ...rest])
        );
        const schemaMapValueProp = schemaMapValue?.[prop] as ManifestNode;
        if (
          schemaMapValue &&
          schemaMapValueProp &&
          schemaMapValueProp?.type &&
          !primitives.has((schemaMapValueProp?.type as string) ?? "")
        ) {
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

      if (
        typeof typeStruct[prop]?.type == "string" &&
        (typeStruct[prop]?.type == "set" ||
          typeStruct[prop]?.type == "array") &&
        typeof typeStruct[prop]?.values == "string" &&
        !primitives.has(typeStruct[prop].values as string)
      ) {
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
        message: `Arrays cannot contain keyed set descendents. Found at '${formattedPath}'.`,
      };
    }

    if (isDirectParentArray && keyCount > 1) {
      const [root, ...rest] = path;
      const formattedPath = [`$(${root})`, ...rest].join(".");
      return {
        status: "error",
        message: `Arrays cannot contain keyed values. Found at '${formattedPath}'.`,
      };
    }

    if (isDirectParentSet && keyCount > 1) {
      const [root, ...rest] = path;
      const formattedPath = [`$(${root})`, ...rest].join(".");
      return {
        status: "error",
        message: `Sets cannot contain multiple key types. Multiple key types found at '${formattedPath}'.`,
      };
    }

    if (isDirectParentSet && keyCount == 0) {
      const [root, ...rest] = path;
      const formattedPath = [`$(${root})`, ...rest].join(".");
      return {
        status: "error",
        message: `Sets must contain one (and only one) key type. No key type found at '${formattedPath}'.`,
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

    const refCheck = refs.reduce(
      (response, refProp) => {
        if (response.status != "ok") {
          return response;
        }
        const refStruct = typeStruct[refProp] as ManifestNode;
        if (refStruct?.refType?.startsWith("$")) {
          const pluginName =
            /^\$\((.+)\)$/.exec(
              refStruct?.refType.split(".")[0] as string
            )?.[1] ?? null;
          const referencedType = getStaticSchemaAtPath(
            rootSchemaMap[pluginName],
            refStruct.refType as string
          ) as TypeStruct | ManifestNode;
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
              message: `Invalid reference pointer '${refStruct.refType}'. Keys that are constrained ref types, cannot be self-referential. Found at '${formattedPath}'.`,
            };
          }
          const containsKey = Object.keys(referencedType).reduce(
            (contains, prop) => {
              if (contains) {
                return true;
              }
              return referencedType[prop]?.isKey;
            },
            false
          );
          if (!containsKey) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
            return {
              status: "error",
              message: `Invalid reference constrainted pointer '${refStruct.refType}'. Constrained references must point directly at the values of a set. Found at '${formattedPath}'.`,
            };
          }
        } else {
          const referencedType = expandedTypes[refStruct.refType];
          if (!referencedType) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
            return {
              status: "error",
              message: `Invalid reference pointer '${refStruct.refType}'. No reference type found for reference at '${formattedPath}'.`,
            };
          }
          const containsKey = Object.keys(referencedType).reduce(
            (contains, prop) => {
              if (contains) {
                return true;
              }
              return referencedType[prop]?.isKey;
            },
            false
          );
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
      },
      { status: "ok" }
    );

    if (refCheck.status != "ok") {
      return refCheck;
    }

    const nestedStructureCheck = nestedStructures.reduce(
      (response, nestedStructureProp) => {
        if (response.status != "ok") {
          return response;
        }
        return isSchemaValid(
          typeStruct[nestedStructureProp] as TypeStruct,
          schemaMap,
          rootSchemaMap,
          expandedTypes,
          false,
          false,
          isArrayDescendent,
          [...path, nestedStructureProp]
        );
      },
      { status: "ok" }
    );

    if (nestedStructureCheck.status != "ok") {
      return nestedStructureCheck;
    }

    const arrayCheck = arrays.reduce(
      (response, arrayProp) => {
        if (response.status != "ok") {
          return response;
        }
        return isSchemaValid(
          typeStruct[arrayProp].values as TypeStruct,
          schemaMap,
          rootSchemaMap,
          expandedTypes,
          false,
          true,
          true,
          [...path, arrayProp]
        );
      },
      { status: "ok" }
    );

    if (arrayCheck.status != "ok") {
      return arrayCheck;
    }

    const setCheck = sets.reduce(
      (response, setProp) => {
        if (response.status != "ok") {
          return response;
        }
        return isSchemaValid(
          typeStruct[setProp].values as TypeStruct,
          schemaMap,
          rootSchemaMap,
          expandedTypes,
          true,
          false,
          isArrayDescendent,
          [...path, setProp]
        );
      },
      { status: "ok" }
    );

    if (setCheck.status != "ok") {
      return setCheck;
    }

    return {
      status: "ok",
    };
  } catch (e) {
    const [root, ...rest] = path;
    const formattedPath = [`$(${root})`, ...rest].join(".");
    return {
      status: "error",
      message: `${
        e?.toString?.() ?? "unknown error"
      }. Found at '${formattedPath}'.`,
    };
  }
};

export const invalidSchemaPropsCheck = (
  typeStruct: TypeStruct,
  rootSchema: TypeStruct | object,
  path: Array<string> = []
): SchemaValidationResponse => {
  for (let prop in typeStruct) {
    if (!rootSchema[prop]) {
      const formattedPath = [...path, prop].join(".");
      return {
        status: "error",
        message: `Invalid prop in schema. Remove '${prop}' from '${path.join(
          "."
        )}'. Found at '${formattedPath}'.`,
      };
    }
    if (typeof typeStruct[prop] == "object") {
      const hasInvalidTypesResponse = invalidSchemaPropsCheck(
        typeStruct[prop] as TypeStruct,
        rootSchema[prop] ?? {},
        [...path, prop]
      );
      if (hasInvalidTypesResponse.status == "error") {
        return hasInvalidTypesResponse;
      }
    }
  }
  return {
    status: "ok",
  };
};

export const collectKeyRefs = (
  typeStruct: TypeStruct,
  path = []
): Array<string> => {
  let out = [];
  for (let prop in typeStruct) {
    if (typeStruct[prop]?.isKey) {
      if (typeStruct[prop].type == "ref") {
        path.push({ key: prop, value: `ref<${typeStruct[prop].refType}>` });
      } else {
        path.push({ key: prop, value: typeStruct[prop].type });
      }
      out.push(writePathString(path));
    }
    if (
      typeStruct[prop]?.type == "set" &&
      typeof typeStruct[prop]?.values == "object"
    ) {
      out.push(
        ...collectKeyRefs(typeStruct[prop].values as TypeStruct, [
          ...path,
          path.length == 0 ? `$(${prop})` : prop,
        ])
      );
      continue;
    }
    if (!typeStruct[prop]?.type && typeof typeStruct[prop] == "object") {
      out.push(
        ...collectKeyRefs(typeStruct[prop] as TypeStruct, [
          ...path,
          path.length == 0 ? `$(${prop})` : prop,
        ])
      );
      continue;
    }
  }
  return out;
};

const replaceRefVarsWithValues = (pathString: string): string => {
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

export const replaceRefVarsWithWildcards = (pathString: string): string => {
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

export const replaceRawRefsInExpandedType = (
  typeStruct: TypeStruct,
  expandedTypes: TypeStruct,
  rootSchemaMap: { [key: string]: TypeStruct }
): TypeStruct => {
  let out = {};
  for (let prop in typeStruct) {
    if (
      typeof typeStruct[prop]?.type == "string" &&
      /^ref<(.+)>$/.test(typeStruct[prop]?.type as string)
    ) {
      const { value: refType } = extractKeyValueFromRefString(
        typeStruct[prop]?.type as string
      );
      out[prop] = { ...typeStruct[prop] };
      out[prop].type = "ref";
      out[prop].refType = refType;
      out[prop].onDelete = typeStruct[prop]?.onDelete ?? "delete";
      out[prop].nullable = typeStruct[prop]?.nullable ?? false;
      if (/^\$\(.+\)/.test(refType)) {
        const pluginName =
          /^\$\((.+)\)$/.exec(refType.split(".")[0] as string)?.[1] ?? null;
        const staticSchema = getStaticSchemaAtPath(
          rootSchemaMap[pluginName],
          refType
        );
        const keyProp = Object.keys(staticSchema).find(
          (p) => staticSchema[p].isKey
        );
        const refKeyType = staticSchema[keyProp].type;
        out[prop].refKeyType = refKeyType;
      } else {
        const staticSchema = expandedTypes[refType];
        const keyProp = Object.keys(staticSchema).find(
          (p) => staticSchema[p].isKey
        );
        const refKeyType = staticSchema[keyProp].type;
        out[prop].refKeyType = refKeyType;
      }
      continue;
    }
    if (typeof typeStruct[prop] == "object") {
      out[prop] = replaceRawRefsInExpandedType(
        typeStruct[prop] as TypeStruct,
        expandedTypes,
        rootSchemaMap
      );
      continue;
    }
    out[prop] = typeStruct[prop];
  }
  return out;
};

export const typestructsAreEquivalent = (
  typestructA: TypeStruct | object,
  typestructB: TypeStruct | object
) => {
  if (
    Object.keys(typestructA ?? {}).length !=
    Object.keys(typestructB ?? {}).length
  ) {
    return false;
  }
  for (let prop in typestructA) {
    if (typeof typestructA[prop] == "object" && typeof typestructB[prop]) {
      const areEquivalent = typestructsAreEquivalent(
        typestructA[prop],
        typestructB[prop]
      );
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

export const buildPointerReturnTypeMap = (
  rootSchemaMap: { [key: string]: TypeStruct },
  expandedTypes: TypeStruct,
  referenceKeys: Array<string>
): { [key: string]: Array<string> } => {
  const expandedTypesWithRefs = replaceRawRefsInExpandedType(
    expandedTypes,
    expandedTypes,
    rootSchemaMap
  );
  let out = {};
  for (let key of referenceKeys) {
    const pluginName =
      /^\$\((.+)\)$/.exec(key.split(".")[0] as string)?.[1] ?? null;
    const staticPath = replaceRefVarsWithValues(key);
    const staticSchema = getStaticSchemaAtPath(
      rootSchemaMap[pluginName],
      staticPath
    );
    const types = Object.keys(expandedTypesWithRefs).filter((type) => {
      return typestructsAreEquivalent(
        expandedTypesWithRefs[type],
        staticSchema
      );
    });
    out[key] = [staticPath, ...types];
  }
  return out;
};

export const buildPointerArgsMap = (referenceReturnTypeMap: {
  [key: string]: Array<string>;
}): { [key: string]: Array<Array<string>> } => {
  let out = {};
  for (let key in referenceReturnTypeMap) {
    const path = decodeSchemaPath(key);
    const argsPath = path.filter(
      (part) => typeof part != "string"
    ) as Array<DiffElement>;
    let args = argsPath.map((arg) => {
      if (primitives.has(arg.value)) {
        if (arg.value == "int" || arg.value == "float") {
          return ["number"];
        }
        return [arg.value];
      }
      const { value: argValue } = extractKeyValueFromRefString(arg.value);
      let refArgs = getPointersForRefType(argValue, referenceReturnTypeMap);
      return refArgs;
    });
    out[key] = args;
  }
  return out;
};

export const getPointersForRefType = (
  refType: string,
  referenceReturnTypeMap: { [key: string]: Array<string> }
): Array<string> => {
  return Object.keys(referenceReturnTypeMap).filter((path) => {
    return referenceReturnTypeMap[path].includes(refType);
  });
};

export const getStaticPointersForRefType = (
  staticRefType: string,
  referenceReturnTypeMap: { [key: string]: Array<string> }
): Array<string> => {
  const staticReferenceReturnTypeMap = {};
  const staticPathMap = {};
  for (let path in referenceReturnTypeMap) {
    const staticPath = replaceRefVarsWithValues(path);
    staticReferenceReturnTypeMap[staticPath] = referenceReturnTypeMap[path];
    staticPathMap[staticPath] = path;
  }
  return Object.keys(staticReferenceReturnTypeMap)
    .filter((staticPath) => {
      return staticReferenceReturnTypeMap[staticPath].includes(staticRefType);
    })
    ?.map((staticPath) => staticPathMap[staticPath]);
};

const drawQueryTypes = (argMap: { [key: string]: Array<Array<string>> }) => {
  let code = "export type QueryTypes = {\n";
  for (let path in argMap) {
    const wildcard = replaceRefVarsWithWildcards(path);
    const argStr = argMap[path].reduce((s, argPossibilities) => {
      if (
        argPossibilities[0] == "string" ||
        argPossibilities[0] == "boolean" ||
        argPossibilities[0] == "number"
      ) {
        return s.replace("<?>", `<\$\{${argPossibilities[0]}\}>`);
      }
      const line = argPossibilities
        .map(replaceRefVarsWithWildcards)
        .map((wcq) => `QueryTypes['${wcq}']`)
        .join("|");
      return s.replace("<?>", `<\$\{${line}\}>`);
    }, wildcard);
    code += `  ['${wildcard}']: \`${argStr}\`;\n`;
  }
  code += "};\n";
  return code;
};

export const drawMakeQueryRef = (
  argMap: { [key: string]: Array<Array<string>> },
  useReact = false
) => {
  let code = drawQueryTypes(argMap) + "\n";
  let globalArgs = [];
  const globalQueryParam = Object.keys(argMap)
    .map(replaceRefVarsWithWildcards)
    .map((query) => `'${query}'`)
    .join("|");
  const globalQueryReturn = Object.keys(argMap)
    .map(replaceRefVarsWithWildcards)
    .map((query) => `QueryTypes['${query}']`)
    .join("|");
  for (let query in argMap) {
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
          if (
            possibleArg == "string" ||
            possibleArg == "boolean" ||
            possibleArg == "number"
          ) {
            return possibleArg;
          }
          return `QueryTypes['${replaceRefVarsWithWildcards(possibleArg)}']`;
        })
        .join("|");
      return s + `, arg${index}: ${argType}`;
    }, `query: '${replaceRefVarsWithWildcards(query)}'`);

    code += `export function makeQueryRef(${params}): QueryTypes['${replaceRefVarsWithWildcards(
      query
    )}'];\n`;
  }
  let globalParams = [];
  for (let i = 0; i < globalArgs.length; ++i) {
    const args = globalArgs[i];
    const isOptional = i > 0;
    const argType = args
      .map((possibleArg) => {
        if (
          possibleArg == "string" ||
          possibleArg == "boolean" ||
          possibleArg == "number"
        ) {
          return possibleArg;
        }
        return `QueryTypes['${replaceRefVarsWithWildcards(possibleArg)}']`;
      })
      .join("|");
    const params = `arg${i}${isOptional ? "?" : ""}: ${argType}`;
    globalParams.push(params);
  }

  code += `export function makeQueryRef(query: ${globalQueryParam}, ${globalParams.join(
    ", "
  )}): ${globalQueryReturn}|null {\n`;

  for (let query in argMap) {
    const args = argMap[query];
    const returnType = args.reduce((s, argType, i) => {
      if (
        argType[0] == "string" ||
        argType[0] == "boolean" ||
        argType[0] == "number"
      ) {
        return s.replace("<?>", `<\$\{arg${i} as ${argType[0]}\}>`);
      }
      return s.replace(
        "<?>",
        `<\$\{arg${i} as ${argType
          .map(replaceRefVarsWithWildcards)
          .map((v) => `QueryTypes['${v}']`)
          .join("|")}\}>`
      );
    }, `return \`${replaceRefVarsWithWildcards(query)}\`;`);
    code += `  if (query == '${replaceRefVarsWithWildcards(query)}') {\n`;
    code += `    ${returnType}\n`;
    code += `  }\n`;
  }
  code += `  return null;\n`;
  code += `};\n`;
  if (useReact) {
    code += `\n`;
    for (let query in argMap) {
      const args = argMap[query];
      const params = args.reduce((s, possibleArgs, index) => {
        const argType = possibleArgs
          .map((possibleArg) => {
            if (
              possibleArg == "string" ||
              possibleArg == "boolean" ||
              possibleArg == "number"
            ) {
              return possibleArg;
            }
            return `QueryTypes['${replaceRefVarsWithWildcards(possibleArg)}']`;
          })
          .join("|");
        return s + `, arg${index}: ${argType}`;
      }, `query: '${replaceRefVarsWithWildcards(query)}'`);

      code += `export function useMakeQueryRef(${params}): QueryTypes['${replaceRefVarsWithWildcards(
        query
      )}'];\n`;
    }

    code += `export function useMakeQueryRef(query: ${globalQueryParam}, ${globalParams.join(
      ", "
    )}): ${globalQueryReturn}|null {\n`;
    code += `  return useMemo(() => {\n`;

    for (let query in argMap) {
      const args = argMap[query];
      const argsCasts = args
        .map((argType, i) => {
          if (
            argType[0] == "string" ||
            argType[0] == "boolean" ||
            argType[0] == "number"
          ) {
            return `arg${i} as ${argType[0]}`;
          }
          return `arg${i} as ${argType
            .map(replaceRefVarsWithWildcards)
            .map((v) => `QueryTypes['${v}']`)
            .join("|")}`;
        })
        .join(", ");
      code += `    if (query == '${replaceRefVarsWithWildcards(query)}') {\n`;
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

export const drawSchemaRoot = (
  rootSchemaMap: TypeStruct,
  referenceReturnTypeMap: { [key: string]: Array<string> }
) => {
  return `export type SchemaRoot = ${drawTypestruct(
    rootSchemaMap,
    referenceReturnTypeMap
  )}`;
};

export const drawRefReturnTypes = (
  rootSchemaMap: TypeStruct,
  referenceReturnTypeMap: { [key: string]: Array<string> }
) => {
  let code = `export type RefReturnTypes = {\n`;
  for (let path in referenceReturnTypeMap) {
    const [staticPath] = referenceReturnTypeMap[path];
    const pluginName =
      /^\$\((.+)\)$/.exec(staticPath.split(".")[0] as string)?.[1] ?? null;
    const staticSchema = getStaticSchemaAtPath(
      rootSchemaMap[pluginName] as TypeStruct,
      staticPath
    );
    const typestructCode = drawTypestruct(
      staticSchema as TypeStruct,
      referenceReturnTypeMap,
      "  "
    );
    const wildcard = replaceRefVarsWithWildcards(path);
    code += `  ['${wildcard}']: ${typestructCode}\n`;
  }
  code += "};\n";
  return code;
};

export const drawTypestruct = (
  typeStruct: TypeStruct,
  referenceReturnTypeMap: { [key: string]: Array<string> },
  indentation = "",
  semicolonLastLine = true,
  identTop = true,
  breakLastLine = true
) => {
  let code = `${identTop ? indentation : ""}{\n`;
  for (const prop in typeStruct) {
    if (prop == "(id)") {
      continue;
    }
    if (
      typeof typeStruct[prop]?.type == "string" &&
      primitives.has(typeStruct[prop]?.type as string)
    ) {
      const propName = typeStruct[prop].nullable
        ? `['${prop}']?`
        : `['${prop}']`;
      const type =
        typeStruct[prop]?.type == "int" || typeStruct[prop]?.type == "float"
          ? "number"
          : typeStruct[prop]?.type;
      code += `  ${indentation}${propName}: ${type};\n`;
      continue;
    }

    if (
      typeof typeStruct[prop]?.type == "string" &&
      typeStruct[prop]?.type == "ref"
    ) {
      const propName = typeStruct[prop].nullable
        ? `['${prop}']?`
        : `['${prop}']`;
      const returnTypes = Object.keys(referenceReturnTypeMap)
        .filter((query) => {
          return referenceReturnTypeMap[query].includes(
            typeStruct[prop]?.refType as string
          );
        })
        .map(replaceRefVarsWithWildcards)
        .map((query) => `QueryTypes['${query}']`)
        .join("|");
      code += `  ${indentation}${propName}: ${returnTypes};\n`;
      continue;
    }

    if (
      typeof typeStruct[prop]?.type == "string" &&
      (typeStruct[prop]?.type == "array" || typeStruct[prop]?.type == "set") &&
      typeof typeStruct[prop]?.values == "string" &&
      primitives.has(typeStruct[prop]?.values as string)
    ) {
      const type =
        typeStruct[prop]?.values == "int" || typeStruct[prop]?.values == "float"
          ? "number"
          : typeStruct[prop]?.type;
      const propName = `['${prop}']`;
      code += `  ${indentation}${propName}: Array<${type}>;\n`;
      continue;
    }

    if (
      typeof typeStruct[prop]?.type == "string" &&
      (typeStruct[prop]?.type == "array" || typeStruct[prop]?.type == "set") &&
      typeof typeStruct[prop]?.values == "object"
    ) {
      const type = drawTypestruct(
        typeStruct[prop]?.values as TypeStruct,
        referenceReturnTypeMap,
        `${indentation}  `,
        false,
        false,
        false
      );
      const propName = `['${prop}']`;
      code += `  ${indentation}${propName}: Array<${type}>;\n`;
      continue;
    }

    if (!typeStruct[prop]?.type && typeof typeStruct[prop] == "object") {
      const type = drawTypestruct(
        typeStruct[prop] as TypeStruct,
        referenceReturnTypeMap,
        `${indentation}  `,
        false,
        false,
        false
      );
      const propName = `['${prop}']`;
      code += `  ${indentation}${propName}: ${type};\n`;
      continue;
    }
  }
  code += `${indentation}}${semicolonLastLine ? ";" : ""}${
    breakLastLine ? "\n" : ""
  }`;
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

const decodeSchemaPath = (
  pathString: string
): Array<{ key: string; value: string } | string> => {
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

export const getObjectInStateMap = (stateMap: object, path: string): object | null => {
  let current: null | undefined | object = null;
  const [pluginWrapper, ...decodedPath] = decodeSchemaPath(path);
  const pluginName = /^\$\((.+)\)$/.exec(pluginWrapper as string)?.[1] ?? null;
  if (!pluginName) {
    return null;
  }
  current = stateMap[pluginName];
  for (let part of decodedPath) {
    if (!current) {
      return null;
    }
    if (typeof part != "string") {
      const { key, value } = part as { key: string; value: string };
      if (Array.isArray(current)) {
        const element = current.find?.((v) => v?.[key] == value);
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
        return \`\$\{key\}<?>\`;
      }
      return part;
    })
    .join(".");
};
`;

export const drawGetReferencedObject = (
  argMap: { [key: string]: Array<Array<string>> },
  useReact = false
) => {
  const wildcards = Object.keys(argMap).map(replaceRefVarsWithWildcards);
  let code = "";
  code += GENERATED_CODE_FUNCTIONS;
  code += "\n";
  for (let wildcard of wildcards) {
    code += `export function getReferencedObject(root: SchemaRoot, query: QueryTypes['${wildcard}']): RefReturnTypes['${wildcard}'];\n`;
  }
  const globalQueryTypes = wildcards
    .map((wildcard) => `QueryTypes['${wildcard}']`)
    .join("|");
  const globalReturnTypes = wildcards
    .map((wildcard) => `RefReturnTypes['${wildcard}']`)
    .join("|");
  code += `export function getReferencedObject(root: SchemaRoot, query: ${globalQueryTypes}): ${globalReturnTypes}|null {\n`;
  for (let wildcard of wildcards) {
    code += `  if (replaceRefVarsWithWildcards(query) == '${wildcard}') {\n`;
    code += `    return getObjectInStateMap(root, query) as RefReturnTypes['${wildcard}'];\n`;
    code += `  }\n`;
  }
  code += `  return null;\n`;
  code += `}`;
  if (useReact) {
    code += `\n`;
    for (let wildcard of wildcards) {
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
    for (let wildcard of wildcards) {
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

export const drawGetPluginStore = (
  rootSchemaMap: { [key: string]: TypeStruct },
  useReact = false
) => {
  let code = "";
  code += "\n";
  const plugins = Object.keys(rootSchemaMap);
  for (let plugin of plugins) {
    code += `export function getPluginStore(root: SchemaRoot, plugin: '${plugin}'): SchemaRoot['${plugin}'];\n`;
  }
  const globalPluginArgs = plugins.map(p => `'${p}'`).join('|');
  const globalPluginReturn = plugins.map(p => `SchemaRoot['${p}']`).join('|');
  code += `export function getPluginStore(root: SchemaRoot, plugin: ${globalPluginArgs}): ${globalPluginReturn} {\n`;
  code += `  return root[plugin];\n`;
  code += `}\n`;
  if (useReact) {
    code += "\n";
    for (let plugin of plugins) {
      code += `export function usePluginStore(root: SchemaRoot, plugin: '${plugin}'): SchemaRoot['${plugin}'];\n`;
    }
    code += `export function usePluginStore(root: SchemaRoot, plugin: ${globalPluginArgs}): ${globalPluginReturn} {\n`;
    code += `  return useMemo(() => {\n`;
    code += `    return root[plugin];\n`;
    code += `  }, [root, plugin]);\n`;
    code += `}\n`;
  }
  return code;
}