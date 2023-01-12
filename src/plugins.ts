import { getPluginsJsonAsync, vDEVPath, vPluginsPath } from "./filestructure";

import axios from "axios";
import path from "path";
import { DiffElement } from "./versioncontrol";
import { fs } from "memfs";
import { Crypto } from "cryptojs";

export interface PluginElement {
  key: string;
  value: string;
}

export interface ManifestNode {
  type: string;
  isKey?: boolean;
  values?: string | TypeStruct;
  path?: string;
}

export interface TypeStruct {
  [key: string]: ManifestNode | TypeStruct;
}

export interface Manifest {
  version: string;
  name: string;
  displayName: string;
  publisher: string;
  icon:string|{
    light: string;
    dark: string;
  },
  imports: {
    [name: string]: string;
  };
  types: TypeStruct;
  store: TypeStruct;
}

export const readDevPluginManifest = async (pluginName: string, pluginVersion: string): Promise<Manifest|null> => {
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
    const pluginManifestPath = path.join(vDEVPath,`${pluginName}@${pluginVersion}`, 'floro', 'floro.manifest.json')
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
  const pluginManifestPath = path.join(vPluginsPath,`${pluginName}@${pluginInfo.value}`, 'floro', 'floro.manifest.json')
  const manifestString = await fs.promises.readFile(pluginManifestPath);
  return JSON.parse(manifestString.toString());
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

export const primitives = new Set(["int", "float", "boolean", "string"]);

export const containsCyclicTypes = (
  schema: Manifest,
  struct: TypeStruct,
  visited = {}
) => {
  for (const prop in struct) {
    if ((struct[prop].type as string) == "set") {
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

export const constructRootSchema = (
  schema: Manifest,
  struct: TypeStruct,
  pluginName: string
): TypeStruct => {
  let out = {};
  for (const prop in struct) {
    out[prop] = {};
    if (struct[prop]?.type == "set") {
      if (typeof struct[prop]?.values == "string" && primitives.has(struct[prop]?.values as string)) {
        out[prop].type = struct[prop].type;
        out[prop].values = struct[prop].values;
        continue;
      }

      if (typeof struct[prop]?.values == "string" && schema.types[struct[prop]?.values as string]) {
        out[prop].type = struct[prop].type;
        out[prop].values = constructRootSchema(
          schema,
          schema.types[struct[prop]?.values as string] as TypeStruct,
          pluginName
        );
        continue;
      }
      if (typeof struct[prop]?.values != "string") {
        out[prop].type = struct[prop].type;
        out[prop].values = constructRootSchema(
          schema,
          (struct[prop]?.values ?? {}) as TypeStruct,
          pluginName
        );
        continue;
      }
    }
    if (struct[prop]?.type == "array") {
      if (typeof struct[prop]?.values == "string" && primitives.has(struct[prop]?.values as string)) {
        out[prop].type = struct[prop].type;
        out[prop].values = struct[prop].values;
        continue;
      }

      if (typeof struct[prop]?.values == "string" && schema.types[struct[prop]?.values as string]) {
        out[prop].type = struct[prop].type;
        out[prop].values = constructRootSchema(
          schema,
          {
            ...(schema.types[struct[prop]?.values as string] as TypeStruct),
            ["(id)"]: {
              type: "string",
              isKey: true
            }
          },
          pluginName
        );
        continue;
      }

      if (typeof struct[prop]?.values != "string") {
        out[prop].type = struct[prop].type;
        out[prop].values = constructRootSchema(
          schema,
          {
            ...((struct[prop]?.values ?? {}) as TypeStruct),
            ["(id)"]: {
              type: "string",
              isKey: true
            }
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
    if (/^ref<([A-z-_\.]+)>$/.test(struct[prop].type as string)) {
      const typeName = /^ref<([A-z-_\.]+)>$/.exec(
        struct[prop].type as string
      )[1];
      if (primitives.has(typeName)) {
        out[prop] = struct[prop];
        out[prop].type = "ref";
        out[prop].refType = typeName;
        out[prop].refKeyType = typeName;
      } else {
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
        if ((struct?.[prop]?.path as string)?.startsWith("$.")) {
          out[prop].path = (struct[prop].path as string).replace(
            "$.",
            `$(${pluginName}).`
          );
        } else {
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

export const decodeSchemaPath = (
  pathString: string
): Array<DiffElement | string> => {
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

export const getStateId = (
  schema: TypeStruct,
  state: unknown) => {
    let hashPairs = [];
    debugger;
    for(let prop in schema) {
      if (!schema[prop].type) {
        hashPairs.push({
          key: prop,
          value: getStateId(schema[prop] as TypeStruct, state[prop])
        })
      }
      if (primitives.has(schema[prop].type as string)) {
        hashPairs.push({
          key: prop,
          value: Crypto.SHA256(`${state[prop]}`)
        })
      }
      if (schema[prop].type == "set" || schema[prop].type == "array") {
        hashPairs.push({
          key: prop,
          value: state[prop]?.reduce((s: string, element) => {
            if (typeof schema[prop].values == "string" && primitives.has(schema[prop].values as string)) {
              return Crypto.SHA256(
                s + `${element}`
              );
            }
            return Crypto.SHA256(
              s + getStateId(schema[prop].values as TypeStruct, element)
            );
          }, ""),
        });

      }
    }
    return Crypto.SHA256(hashPairs.reduce((s, {key, value}) => {
      if (key == "(id)") {
        return s;
      }
      if (s == "") {
        return `${key}:${value}`;
      }
      return s + "/" + `${key}:${value}`;
    }, ""));
  }

export const flattenStateToSchemaPathKV = (
  schemaRoot: Manifest,
  state: unknown,
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

    if (schemaRoot[prop]?.type == "set" && !primitives.has(schemaRoot[prop].values)) {
      sets.push(prop);
      continue;
    }
    if (schemaRoot[prop]?.type == "array" && !primitives.has(schemaRoot[prop].values)) {
      arrays.push(prop);
      continue;
    }
    if (
      !primitives.has(schemaRoot[prop]?.type) &&
      !((schemaRoot[prop]?.type == "array" || schemaRoot[prop]?.type == "set") && primitives.has(schemaRoot[prop]?.values)) &&
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
      const id = getStateId(schemaRoot[prop].values, element)
      kv.push(
        ...flattenStateToSchemaPathKV(schemaRoot[prop].values, {...element, ["(id)"]: id}, [
          ...traversalPath,
          prop,
        ])
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

export const indexArrayDuplicates = (kvs: Array<DiffElement>): Array<DiffElement> => {
  let visitedIds: { [key: string]: {count: number}} = {};
  let out = [];
  for (let { key, value} of kvs) {
    const [, ...decodedPath] = decodeSchemaPath(key);
    const concatenatedId = decodedPath.reduce((s, part) => {
      if (typeof part != "string" && part?.key == "(id)") {
        return s == "" ? part?.value : s + ":" + part?.value;
      }
      return s;
    }, "")
    if (value["(id)"]) {
      if (visitedIds[concatenatedId] == undefined) {
        visitedIds[concatenatedId] = {
          count: 0
        };
      } else {
        visitedIds[concatenatedId].count++;
      }
    }
    let updatedKey = key;
    let ids = concatenatedId.split(":").filter(v => v != "");
    for (let i = 0; i < ids.length; ++i) {
      const id = ids[i];
      const subId = ids.slice(0, i + 1).join(":");
      const count = visitedIds[subId]?.count ?? 0;
      updatedKey = updatedKey.replace(id, `${id}:${count}`)
    }
    if (value['(id)']) {
      const id = ids[ids.length - 1];
      const count = visitedIds[concatenatedId].count ?? 0;
      value['(id)'] = value['(id)'].replace(id, `${id}:${count}`);
    }
    out.push({key: updatedKey, value})
  }
  return out;
}

export const buildObjectsAtPath = (
  rootSchema: Manifest,
  path: string,
  properties: { [key: string]: number | string | boolean },
  out = {}
): unknown => {
  // ignore $(store)
  const [, ...decodedPath] = decodeSchemaPath(path);
  let current = out;
  let currentSchema = rootSchema;
  for (const part of decodedPath) {
    if (
      typeof part == "string" &&
      currentSchema?.[part]?.type == "set"
    ) {
      if (!current[part as string]) {
        current[part as string] = [];
      }
      current = current[part];
      currentSchema = currentSchema[part].values;
      continue;
    }
    if (
      typeof part == "string" &&
      currentSchema?.[part]?.type == "array"
    ) {
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

const cleanArrayIDsFromState = (state: object) => {
  const out = {};
  for (let prop in state) {
    if (Array.isArray(state[prop])) {
      out[prop] = state[prop].map((v: object|string|number|boolean) => {
        if (typeof v == "string" || typeof v == "number" || typeof v == "boolean") {
          return v;
        }
        return cleanArrayIDsFromState(v);
      });
      continue;
    }
    if (typeof state[prop] == "object") {
      out[prop] =  cleanArrayIDsFromState(state[prop]);
      continue;
    }
    if (prop != "(id)") {
      out[prop] = state[prop];
    }
  }
  return out;
}

export const generateKVFromState = (
  schema: Manifest,
  state: unknown,
  pluginName: string
): Array<DiffElement> => {
  const hasCycle = containsCyclicTypes(schema, schema.store);
  if (hasCycle) {
    console.error("type cycle detected, try using references");
    return;
  }
  const rootSchema = constructRootSchema(schema, schema.store, pluginName);
  // type check schema again state
  return flattenStateToSchemaPathKV(rootSchema as unknown as Manifest, state, [
    `$(${pluginName})`,
  ])?.map(({ key, value }) => {
    return {
      key: writePathString(key as unknown as Array<string | DiffElement>),
      value,
    };
  });
};

export const generateStateFromKV = (
  schema: Manifest,
  kv: Array<DiffElement>,
  pluginName: string
): unknown => {
  const rootSchema = constructRootSchema(schema, schema.store, pluginName);
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

export const iterateSchemaTypes = (
  types: Manifest["types"],
  pluginName: string
): unknown => {
  let out = {};
  for (const prop in types) {
    out[prop] = {};
    if (types[prop]?.type === "set") {
      out[prop].type = "set";
      if (
        typeof types[prop].values == "string" &&
        (types[prop].values as string).split(".").length == 1
      ) {
        out[prop].values = `${pluginName}.${types[prop].values}`;
        continue;
      }
      if (typeof types[prop].values == "object") {
        out[prop].values = iterateSchemaTypes(
          types[prop].values as TypeStruct,
          pluginName
        );
        continue;
      }
    }
    if (/^ref<([A-z-_\.]+)>$/.test(types[prop].type as string)) {
      out[prop] = { ...types[prop] };
      const typeGroup = /^ref<([A-z-_\.]+)>$/.exec(
        types[prop].type as string
      )[1];
      const splitGroup = typeGroup.split(".");
      if (splitGroup?.length == 1) {
        out[prop].type = `ref<${pluginName}.${typeGroup}>`;
      } else {
        out[prop].type = types[prop].type;
      }
      if (
        typeof types?.[prop]?.path == "string" &&
        (types?.[prop]?.path as string)?.startsWith("$.")
      ) {
        out[prop].path = (types[prop].path as string).replace(
          "$.",
          `$(${pluginName}).`
        );
      } else {
        out[prop].path = types[prop].path;
      }
      continue;
    }
    if (primitives.has(types[prop]?.type as string)) {
      out[prop] = types[prop];
      continue;
    }
    if (!types[prop]?.type) {
      out[prop] = iterateSchemaTypes(types[prop] as TypeStruct, pluginName);
    }
  }
  return out;
};

export const drawSchemaTypesFromImports = (
  schema: { [key: string]: Manifest },
  pluginName: string
): TypeStruct => {
  const types = Object.keys(schema[pluginName].types).reduce((types, key) => {
    if (key.startsWith(`${pluginName}.`)) {
      return {
        ...types,
        [key]: iterateSchemaTypes(
          schema[pluginName].types[key] as TypeStruct,
          pluginName
        ),
      };
    }
    return {
      ...types,
      [`${pluginName}.${key}`]: iterateSchemaTypes(
        schema[pluginName].types[key] as TypeStruct,
        pluginName
      ),
    };
  }, {});

  return Object.keys(schema[pluginName].imports).reduce(
    (acc, importPluginName) => {
      const importTypes = drawSchemaTypesFromImports(schema, importPluginName);
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

export const getRootSchemaForPlugin = (
  schema: { [key: string]: Manifest },
  manifest: Manifest,
  pluginName: string
): TypeStruct => {
  const schemaWithTypes = drawSchemaTypesFromImports(schema, pluginName);
  const schemaWithStores = iterateSchemaTypes(manifest.store, pluginName);

  return constructRootSchema(
    {
      types: schemaWithTypes,
    } as Manifest,
    schemaWithStores as TypeStruct,
    pluginName
  );
};

export const getKVStateForPlugin = (
  schema: { [key: string]: Manifest },
  manifest: Manifest,
  pluginName: string,
  state: unknown
): Array<DiffElement> => {
  const rootUpsteamSchema = getRootSchemaForPlugin(
    schema,
    manifest,
    pluginName
  );
  const pluginKVState = flattenStateToSchemaPathKV(
    rootUpsteamSchema as unknown as Manifest,
    state ?? {},
    [`$(${pluginName})`]
  );
  return pluginKVState?.map(({ key, value }) => {
    return {
      key: writePathString(key as unknown as Array<string | DiffElement>),
      value,
    };
  });
};