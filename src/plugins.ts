import axios from "axios";
import { DiffElement } from "./versioncontrol";
import semver from "semver";
import { DataSource } from "./datasource";

axios.defaults.validateStatus = function () {
  return true;
};

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
  icon:
    | string
    | {
        light: string;
        dark: string;
        selected?:
          | string
          | {
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

const primitives = new Set(["int", "float", "boolean", "string"]);

export const pluginManifestsAreCompatibleForUpdate = async (
  datasource: DataSource,
  oldManifest: Manifest,
  newManifest: Manifest
): Promise<boolean | null> => {
  const oldSchemaMap = await getSchemaMapForManifest(datasource, oldManifest);
  const newSchemaMap = await getSchemaMapForManifest(datasource, newManifest);

  if (!oldSchemaMap) {
    return null;
  }

  if (!newSchemaMap) {
    return null;
  }

  return await asyncReduce(
    true,
    Object.keys(newSchemaMap).map((k) => newSchemaMap[k]),
    async (isCompatible, newManifest) => {
      if (!isCompatible) {
        return false;
      }
      if (!oldSchemaMap[newManifest.name]) {
        return true;
      }
      return await pluginManifestIsSubsetOfManifest(
        datasource,
        oldSchemaMap,
        newSchemaMap
      );
    }
  );
};

export const schemaMapsAreCompatible = async (
  datasource: DataSource,
  oldSchemaMap: { [key: string]: Manifest },
  newSchemaMap: { [key: string]: Manifest }
): Promise<boolean | null> => {
  if (!oldSchemaMap) {
    return null;
  }

  if (!newSchemaMap) {
    return null;
  }

  const isSubSet = await pluginManifestIsSubsetOfManifest(
    datasource,
    oldSchemaMap,
    newSchemaMap
  );
  return isSubSet;
};

export const topSortManifests = (manifests: Array<Manifest>) => {
  const lexicallySortedManifests = manifests.sort((a, b) => {
    if (a.name == b.name) return 0;
    return a.name > b.name ? 1 : -1;
  });
  const visited = new Set();
  const manifestMap = manifestListToSchemaMap(lexicallySortedManifests);
  const out: Array<Manifest> = [];
  for (const manifest of lexicallySortedManifests) {
    if (visited.has(manifest.name)) {
      continue;
    }
    const upstreamDeps = getUpstreamDepsInSchemaMap(
      manifestMap,
      manifest.name
    ).map((pluginName) => manifestMap[pluginName]);
    const depsToAdd = topSortManifests(upstreamDeps);
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

export const getPluginManifests = async (
  datasource: DataSource,
  pluginList: Array<PluginElement>
): Promise<Array<Manifest>> => {
  const manifests = await Promise.all(
    pluginList.map(({ key: pluginName, value: pluginVersion }) => {
      return datasource.getPluginManifest(pluginName, pluginVersion);
    })
  );
  return manifests?.filter((manifest: Manifest | null) => {
    if (manifest == null) {
      return false;
    }
    return true;
  }) as Array<Manifest>;
};

export const getManifestMapFromManifestList = (manifests: Array<Manifest>) => {
  return manifests.reduce((acc, manifest) => {
    return {
      ...acc,
      [manifest.name]: manifest,
    };
  }, {});
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

export const manifestListToPluginList = (
  manifestList: Array<Manifest>
): Array<PluginElement> => {
  return manifestList.map((p) => {
    return {
      key: p.name,
      value: p.version,
    };
  });
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

export const hasPluginManifest = (
  manifest: Manifest,
  manifests: Array<Manifest>
): boolean => {
  for (const { name, version } of manifests) {
    if (name === manifest.name && version === manifest.version) {
      return true;
    }
  }
  return false;
};

export interface DepFetch {
  status: "ok" | "error";
  reason?: string;
  deps?: Array<Manifest>;
}

export const getDependenciesForManifest = async (
  datasource: DataSource,
  manifest: Manifest,
  seen = {}
): Promise<DepFetch> => {
  const deps: Array<Manifest> = [];
  for (const pluginName in manifest.imports) {
    if (seen[pluginName]) {
      return {
        status: "error",
        reason: `cyclic dependency imports in ${pluginName}`,
      };
    }
    try {
      const pluginManifest = await datasource.getPluginManifest(
        pluginName,
        manifest.imports[pluginName]
      );
      if (!pluginManifest) {
        return {
          status: "error",
          reason: `cannot fetch manifest for ${pluginName}`,
        };
      }
      const depResult = await getDependenciesForManifest(
        datasource,
        pluginManifest,
        {
          ...seen,
          [manifest.name]: true,
        }
      );
      if (depResult.status == "error") {
        return depResult;
      }
      deps.push(pluginManifest, ...(depResult.deps as Array<Manifest>));
    } catch (e) {
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

export const getUpstreamDependencyManifests = async (
  datasource: DataSource,
  manifest: Manifest,
  memo: { [key: string]: Array<Manifest> } = {}
): Promise<Array<Manifest> | null> => {
  if (memo[manifest.name + "-" + manifest.version]) {
    return memo[manifest.name + "-" + manifest.version];
  }

  const deps: Array<Manifest> = [manifest];
  for (const dependentPluginName in manifest.imports) {
    const dependentManifest = await datasource.getPluginManifest(
      dependentPluginName,
      manifest.imports[dependentPluginName]
    );
    if (!dependentManifest) {
      return null;
    }
    const subDeps = await getUpstreamDependencyManifests(
      datasource,
      dependentManifest,
      memo
    );
    if (subDeps == null) {
      return null;
    }
    for (const dep of subDeps) {
      if (!hasPluginManifest(dep, deps)) {
        deps.push(dep);
      }
    }
  }
  memo[manifest.name + "-" + manifest.version] = deps;
  return deps;
};

export const coalesceDependencyVersions = (
  deps: Array<Manifest>
): null | {
  [pluginName: string]: Array<string>;
} => {
  try {
    return deps.reduce((acc, manifest) => {
      if (acc[manifest.name]) {
        const semList = [manifest.version, ...acc[manifest.name]].sort(
          (a: string, b: string) => {
            if (semver.eq(a, b)) {
              return 0;
            }
            return semver.gt(a, b) ? 1 : -1;
          }
        );
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
  } catch (e) {
    return null;
  }
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

export const verifyPluginDependencyCompatability = async (
  datasource: DataSource,
  deps: Array<Manifest>
): Promise<VerifyDepsResult> => {
  const depsMap = coalesceDependencyVersions(deps);
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
      const lastManifest = deps.find(
        (v) => v.name == pluginName && v.version == depsMap[pluginName][i - 1]
      );
      if (!lastManifest) {
        return {
          isValid: false,
          status: "error",
          reason: "dep_fetch",
          pluginName,
          pluginVersion: depsMap[pluginName][i - 1],
        };
      }
      const nextManifest = deps.find(
        (v) => v.name == pluginName && v.version == depsMap[pluginName][i]
      );
      if (!nextManifest) {
        return {
          isValid: false,
          status: "error",
          reason: "dep_fetch",
          pluginName,
          pluginVersion: depsMap[pluginName][i],
        };
      }
      const lastDeps = await getDependenciesForManifest(
        datasource,
        lastManifest
      );
      if (!lastDeps) {
        return {
          isValid: false,
          status: "error",
          reason: "dep_fetch",
          pluginName,
          pluginVersion: depsMap[pluginName][i - 1],
        };
      }
      const nextDeps = await getDependenciesForManifest(
        datasource,
        nextManifest
      );
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
      const lastSchemaMap = manifestListToSchemaMap([
        lastManifest,
        ...(lastDeps.deps as Array<Manifest>),
      ]);
      // need to coalesce
      const nextSchemaMap = manifestListToSchemaMap([
        nextManifest,
        ...(nextDeps.deps as Array<Manifest>),
      ]);
      const areCompatible = await pluginManifestIsSubsetOfManifest(
        datasource,
        lastSchemaMap,
        nextSchemaMap
      );
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

export const getSchemaMapForManifest = async (
  datasource: DataSource,
  manifest: Manifest
): Promise<{ [key: string]: Manifest } | null> => {
  const deps = await getUpstreamDependencyManifests(datasource, manifest);
  if (!deps) {
    return null;
  }
  const areValid = await verifyPluginDependencyCompatability(datasource, deps);
  if (!areValid.isValid) {
    return null;
  }
  const depsMap = coalesceDependencyVersions(deps);
  const out: { [key: string]: Manifest } = {};
  for (const pluginName in depsMap) {
    const maxVersion = depsMap[pluginName][depsMap[pluginName].length - 1];
    const depManifest = deps.find(
      (v) => v.name == pluginName && v.version == maxVersion
    );
    if (!depManifest) {
      return null;
    }
    out[depManifest.name] = depManifest;
  }
  out[manifest.name] = manifest;
  return out;
};

export const schemaManifestHasInvalidSyntax = (
  schema: Manifest
): SyntaxValidation => {
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
  return schemaHasInvalidTypeSytax(schema, schema.store);
};

export interface SyntaxValidation {
  isInvalid: boolean;
  error?: string;
}

export const schemaHasInvalidTypeSytax = (
  schema: Manifest,
  struct: TypeStruct,
  visited = {}
): SyntaxValidation => {
  for (const prop in struct) {
    if (visited[struct[prop]?.type as string]) {
      continue;
    }
    if (
      typeof struct[prop].type == "string" &&
      (struct[prop]?.type as string)?.startsWith("$")
    ) {
      return {
        isInvalid: true,
        error: `${prop} in \n${JSON.stringify(
          struct,
          null,
          2
        )}\n type value cannot start with $`,
      };
    }

    if (
      (struct[prop].type as string) == "set" ||
      (struct[prop].type as string) == "array"
    ) {
      if (
        typeof struct[prop].values == "string" &&
        (struct[prop]?.values as string)?.startsWith("$")
      ) {
        return {
          isInvalid: true,
          error: `${prop} in \n${JSON.stringify(
            struct,
            null,
            2
          )}\n values value cannot start with $`,
        };
      }
      if (
        typeof struct[prop].values == "string" &&
        primitives.has(struct[prop].values as string)
      ) {
        continue;
      }
      if (typeof struct[prop].values != "string") {
        const syntaxCheck = schemaHasInvalidTypeSytax(
          schema,
          struct[prop].values as TypeStruct,
          {
            ...visited,
          }
        );
        if (syntaxCheck.isInvalid) {
          return syntaxCheck;
        }
        continue;
      }
      if (
        typeof struct[prop].values == "string" &&
        schema.types[struct[prop].values as string]
      ) {
        const syntaxCheck = schemaHasInvalidTypeSytax(
          schema,
          schema.types[struct[prop].values as string] as TypeStruct,
          {
            ...visited,
            [struct[prop].values as string]: true,
          }
        );
        if (syntaxCheck.isInvalid) {
          return syntaxCheck;
        }
      }
      continue;
    }
    if (schema.types[struct[prop].type as string]) {
      const syntaxCheck = schemaHasInvalidTypeSytax(
        schema,
        schema.types[struct[prop].type as string] as TypeStruct,
        {
          ...visited,
          [struct[prop].type as string]: true,
        }
      );
      if (syntaxCheck.isInvalid) {
        return syntaxCheck;
      }
      continue;
    }
    if (!struct[prop]?.type) {
      if (typeof struct[prop] == "string") {
        return {
          isInvalid: true,
          error: `${prop} in \n${JSON.stringify(
            struct,
            null,
            2
          )}\n canot be a string value, found "${
            struct[prop]
          }". Perhaps try changing to type \n${JSON.stringify(
            { ...struct, [prop]: { type: struct[prop] } },
            null,
            2
          )}`,
        };
      }
      const syntaxCheck = schemaHasInvalidTypeSytax(
        schema,
        struct[prop] as TypeStruct,
        {
          ...visited,
        }
      );
      if (syntaxCheck.isInvalid) {
        return syntaxCheck;
      }
    }
  }
  return { isInvalid: false };
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
            [struct[prop].type as string]: true,
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

export const validatePluginManifest = async (
  datasource: DataSource,
  manifest: Manifest
) => {
  try {
    const syntaxCheck = schemaManifestHasInvalidSyntax(manifest);
    if (syntaxCheck.isInvalid) {
      return {
        status: "error",
        message: syntaxCheck.error,
      };
    }
    if (containsCyclicTypes(manifest, manifest.store)) {
      return {
        status: "error",
        message: `${manifest.name}'s schema contains cyclic types, consider using references`,
      };
    }
    const deps = await getUpstreamDependencyManifests(datasource, manifest);
    if (!deps) {
      return {
        status: "error",
        message: "failed to get upstream dependencies.",
      };
    }
    const areValid = await verifyPluginDependencyCompatability(
      datasource,
      deps
    );
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

    const schemaMap = await getSchemaMapForManifest(datasource, manifest);
    if (!schemaMap) {
      return {
        status: "error",
        message: "failed to construct schema map",
      };
    }
    const expandedTypes = getExpandedTypesForPlugin(schemaMap, manifest.name);
    const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
    const hasValidPropsType = invalidSchemaPropsCheck(
      schemaMap[manifest.name].store,
      rootSchemaMap[manifest.name],
      [`$(${manifest.name})`]
    );
    if (hasValidPropsType.status == "error") {
      return hasValidPropsType;
    }
    return isSchemaValid(
      rootSchemaMap,
      schemaMap,
      rootSchemaMap,
      expandedTypes
    );
  } catch (e) {
    return {
      status: "error",
      message: e?.toString?.() ?? "unknown error",
    };
  }
};

const constructRootSchema = (
  schema: Manifest,
  struct: TypeStruct,
  pluginName: string
): TypeStruct => {
  const out = {};
  const sortedStructedProps = Object.keys(struct).sort();
  for (const prop of sortedStructedProps) {
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
      const typeName = /^ref<(.+)>$/.exec(
        struct[prop].type as string
      )?.[1] as string;
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
        let key: null | TypeStruct = null;
        for (const p in type) {
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

export const defaultVoidedState = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object }
) => {
  const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  const defaultedState = {};
  for (const pluginName of Object.keys(rootSchemaMap)) {
    const struct = rootSchemaMap[pluginName];
    const state = stateMap?.[pluginName] ?? {};
    defaultedState[pluginName] = sanitizePrimitivesWithSchema(
      struct,
      defaultMissingSchemaState(struct, state, stateMap)
    );
  }
  return defaultedState;
};

const defaultMissingSchemaState = (
  struct: TypeStruct,
  state: object,
  stateMap: { [key: string]: object }
) => {
  const out = {};
  for (const prop in struct) {
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
  const out: Array<boolean | string | number> = [];
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
  const out = {};
  for (const prop in struct) {
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
  const out: Array<string> = [];
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

const fastHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36).padEnd(6, "0");
};

export const getStateId = (schema: TypeStruct, state: object): string => {
  const hashPairs: Array<DiffElement> = [];
  const sortedProps = Object.keys(schema).sort();
  for (const prop of sortedProps) {
    if (!schema[prop].type) {
      hashPairs.push({
        key: prop,
        value: getStateId(schema[prop] as TypeStruct, state[prop]),
      });
    }
    if (primitives.has(schema[prop].type as string)) {
      hashPairs.push({
        key: prop,
        value: fastHash(`${state[prop]}`),
      });
    }
    if (schema[prop].type == "set" || schema[prop].type == "array") {
      // TODO: REMOVE REDUCE
      hashPairs.push({
        key: prop,
        value: state[prop]?.reduce((s: string, element) => {
          if (
            typeof schema[prop].values == "string" &&
            primitives.has(schema[prop].values as string)
          ) {
            return fastHash(s + `${element}`);
          }
          return fastHash(
            s + getStateId(schema[prop].values as TypeStruct, element)
          );
        }, ""),
      });
    }
  }
  // TODO: REMOVE REDUCE
  return fastHash(
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
  traversalPath: Array<string | DiffElement>
): Array<{
  key: string | Array<string | DiffElement>;
  value: unknown;
}> => {
  const kv: Array<{
    key: string | Array<string | DiffElement>;
    value: unknown;
  }> = [];
  const sets: Array<string> = [];
  const arrays: Array<string> = [];
  const nestedStructures: Array<string> = [];
  const value = {};
  let primaryKey: null | DiffElement = null;
  const sortedProps = Object.keys(schemaRoot).sort();
  for (const prop of sortedProps) {
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

  for (const prop of nestedStructures) {
    kv.push(
      ...flattenStateToSchemaPathKV(schemaRoot[prop], state[prop], [
        ...traversalPath,
        ...(primaryKey ? [primaryKey] : []),
        prop,
      ])
    );
  }
  for (const prop of arrays) {
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
  for (const prop of sets) {
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
  const visitedIds: { [key: string]: { count: number } } = {};
  const out: Array<DiffElement> = [];
  for (const { key, value } of kvs) {
    const [, ...decodedPath] = decodeSchemaPath(key);
    const concatenatedId: string = decodedPath.reduce((s: string, part) => {
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
    const ids = concatenatedId.split(":").filter((v: string) => v != "");
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
  visitedLists = {},
  out = {}
): object => {
  // ignore $(store)
  const [, ...decodedPath] = decodeSchemaPath(path);
  let current = out;
  let currentSchema = rootSchema;
  const partialPath = [];
  for (const part of decodedPath) {
    partialPath.push(part);
    if (typeof part == "string" && currentSchema?.[part]?.type == "set") {
      const listPath = writePathString(partialPath);
      if (!visitedLists[listPath]) {
        visitedLists[listPath] = {};
      }
      if (!current[part as string]) {
        current[part as string] = [];
      }
      current = current[part];
      currentSchema = currentSchema[part].values;
      continue;
    }
    if (typeof part == "string" && currentSchema?.[part]?.type == "array") {
      const listPath = writePathString(partialPath);
      if (!visitedLists[listPath]) {
        visitedLists[listPath] = {};
      }
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
      const listPath = writePathString(partialPath.slice(0, -1));
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

const getSchemaAtPath = (
  rootSchema: Manifest | TypeStruct,
  path: string
): object | null => {
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
  let current: null | object = null;
  const [pluginWrapper, ...decodedPath] = decodeSchemaPath(path);
  const pluginName = /^\$\((.+)\)$/.exec(pluginWrapper as string)?.[1] ?? null;
  if (pluginName == null) {
    return null;
  }
  current = stateMap[pluginName];
  for (const part of decodedPath) {
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
  for (const prop in state) {
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
  const out = {};
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
      const typeGroup = /^ref<(.+)>$/.exec(
        types[prop].type as string
      )?.[1] as string;
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

export const getStateFromKVForPlugin = (
  schemaMap: { [key: string]: Manifest },
  kv: Array<DiffElement>,
  pluginName: string
): object => {
  const rootSchema = getRootSchemaForPlugin(schemaMap, pluginName);
  const kvArray = indexArrayDuplicates(kv);
  let out = {};
  let memo = {};
  for (const pair of kvArray) {
    out = buildObjectsAtPath(
      rootSchema as unknown as Manifest,
      pair.key,
      pair.value,
      memo,
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

export const getRootSchemaMap = async (
  datasource: DataSource,
  schemaMap: {
    [key: string]: Manifest;
  }
): Promise<{ [key: string]: TypeStruct } | null> => {
  // need to top sort
  const rootSchemaMap = {};
  for (const pluginName in schemaMap) {
    const manifest = schemaMap[pluginName];
    const upsteamDeps = await getUpstreamDependencyManifests(
      datasource,
      manifest
    );
    const subSchemaMap = manifestListToSchemaMap(upsteamDeps as Manifest[]);
    rootSchemaMap[pluginName] = getRootSchemaForPlugin(
      subSchemaMap,
      pluginName
    );
  }
  return traverseSchemaMapForRefKeyTypes(rootSchemaMap, rootSchemaMap);
};

const getKeyType = (
  keyPath: string,
  rootSchemaMap: { [key: string]: TypeStruct }
): string | null => {
  const [pluginWrapper, ...path] = splitPath(keyPath);
  let current: null | TypeStruct | ManifestNode = null;
  const typeGroup = /^\$\((.+)\)$/.exec(pluginWrapper as string)?.[1] ?? null;
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
  const out = {};
  for (const prop in schemaMap) {
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

export const getKVStateForPlugin = async (
  datasource: DataSource,
  schema: { [key: string]: Manifest },
  pluginName: string,
  stateMap: { [key: string]: object }
): Promise<Array<DiffElement>> => {
  const rootUpsteamSchema = getRootSchemaForPlugin(schema, pluginName);
  const state = await defaultVoidedState(datasource, schema, stateMap);
  return generateKVFromStateWithRootSchema(
    rootUpsteamSchema,
    pluginName,
    state?.[pluginName]
  );
};

export const getUpstreamDepsInSchemaMap = (
  schemaMap: { [key: string]: Manifest },
  pluginName: string
): Array<string> => {
  const current = schemaMap[pluginName];
  if (Object.keys(current.imports).length == 0) {
    return [];
  }
  const deps = Object.keys(current.imports);
  for (const dep of deps) {
    const upstreamDeps = getUpstreamDepsInSchemaMap(schemaMap, dep);
    deps.push(...upstreamDeps);
  }
  return deps;
};

export const getDownstreamDepsInSchemaMap = (
  schemaMap: { [key: string]: Manifest },
  pluginName: string,
  memo: { [pluginName: string]: boolean } = {}
): Array<string> => {
  if (memo[pluginName]) {
    return [];
  }
  memo[pluginName] = true;
  const out: Array<string> = [];
  for (const dep in schemaMap) {
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
  const out: Array<string> = [];
  const parts = splitPath(key);
  const curr: Array<string> = [];
  for (const part of parts) {
    curr.push(part);
    if (/<.+>$/.test(part)) {
      out.push(curr.join("."));
    }
  }
  return out;
};

const asyncReduce = async <T, U>(
  initVal: T,
  list: Array<U>,
  callback: (a: T, e: U, i: number) => Promise<T>
): Promise<T> => {
  let out = initVal;
  for (let i = 0; i < list.length; ++i) {
    const element = list[i];
    out = await callback(out, element, i);
  }
  return out;
};

interface StaticSetPath {
  staticPath: Array<string>;
  relativePath: Array<string>;
  staticChildren: Array<StaticSetPath>;
  keyProp: string;
  keyPropIsRef: boolean;
}

const traverseSchemaMapForStaticSetPaths = (
  rootSchemaMap: { [key: string]: TypeStruct },
  typeStruct: { [key: string]: TypeStruct } | TypeStruct,
  path = [],
  relativePath = [],
  parent = null
): Array<StaticSetPath> => {
  const refs = [];
  for (const prop in typeStruct) {
    if (typeof typeStruct[prop] == "object" && !typeStruct[prop]?.type) {
      const subRefs = traverseSchemaMapForStaticSetPaths(
        rootSchemaMap,
        typeStruct[prop] as TypeStruct,
        [...path, prop],
        [...relativePath, prop],
        parent
      );
      refs.push(...subRefs);
      continue;
    }
    if (
      typeStruct[prop]?.type == "set" &&
      typeof typeStruct[prop].values != "string"
    ) {
      const staticChildren = traverseSchemaMapForStaticSetPaths(
        rootSchemaMap,
        typeStruct[prop].values as TypeStruct,
        [...path, prop, "values"],
        [],
        [...path, prop, "values"]
      );
      let keyProp = null;
      let keyPropIsRef = false;
      for (const key in typeStruct[prop].values as object) {
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

const getSetInStateMapFromStaticPath = (
  path: string[],
  stateMap: { [key: string]: object }
): Array<{ [key: string]: object }> => {
  let current: object = stateMap;
  for (let part of path) {
    if (part == "values") {
      return current as Array<{ [key: string]: object }>;
    }
    current = current[part];
  }
  return null;
};

interface StaticStateMapChild {
  parent: Array<{ [key: string]: object }>;
  object: StaticStateMapObject;
  instance: unknown;
  keyProp: string;
  keyPropIsRef: boolean;
}

interface StaticStateMapObject {
  values: Array<StaticStateMapChild>;
  parent: Array<{ [key: string]: object }>;
}

const compileStateRefs = (
  staticSetPaths: Array<StaticSetPath>,
  stateMap: { [key: string]: object }
): { [key: string]: StaticStateMapObject } => {
  const out = {};
  for (const staticSet of staticSetPaths) {
    const parent = getSetInStateMapFromStaticPath(
      staticSet.relativePath,
      stateMap
    );
    const values = {};
    if (parent) {
      for (let child of parent) {
        const object = compileStateRefs(
          staticSet.staticChildren,
          child as { [key: string]: object }
        );
        values[child[staticSet.keyProp] as unknown as string] = {
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
    } else {
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

interface StaticPointer {
  staticPath: Array<string>;
  relativePath: Array<string>;
  refType: string;
  onDelete: "delete" | "nullify";
}

const traverseSchemaMapForStaticPointerPaths = (
  rootSchemaMap: { [key: string]: TypeStruct },
  typeStruct: { [key: string]: TypeStruct } | TypeStruct,
  path = [],
  relativePath = [],
  parent = null
): Array<StaticPointer> => {
  const refs = [];
  for (const prop in typeStruct) {
    if (typeof typeStruct[prop] == "object" && !typeStruct[prop]?.type) {
      const subRefs = traverseSchemaMapForStaticPointerPaths(
        rootSchemaMap,
        typeStruct[prop] as TypeStruct,
        [...path, prop],
        [...relativePath, prop],
        parent
      );
      refs.push(...subRefs);
      continue;
    }
    if (
      (typeStruct[prop]?.type == "set" || typeStruct[prop]?.type == "array") &&
      typeof typeStruct[prop].values != "string"
    ) {
      // find key value
      let keyProp = null;
      for (const key in typeStruct[prop].values as object) {
        if (typeStruct[prop].values[key]?.isKey) {
          keyProp = key;
          break;
        }
      }
      const staticChildren = traverseSchemaMapForStaticPointerPaths(
        rootSchemaMap,
        typeStruct[prop].values as TypeStruct,
        [...path, prop, `values_key:${keyProp}`],
        [],
        [...path, prop, `values_key:${keyProp}`]
      );
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

interface StateMapPointer {
  parentSetPath: Array<string | { key: string; value: "string" }>;
  setPath: Array<string | { key: string; value: "string" }>;
  refPath: Array<string | { key: string; value: "string" }>;
  ownerObject: unknown;
  refKey: string;
  ref: string;
  onDelete: "delete" | "nullify";
  refType: "string";
}

const getPointersAtPath = (
  pointerPath: Array<string>,
  staticPointer: StaticPointer,
  stateMap: { [key: string]: unknown } | Array<unknown>,
  path: Array<string | { key: string; value: string }> = [],
  index = 0
): Array<StateMapPointer> => {
  const pointers = [];
  const subPath = [...path];
  let current = stateMap;
  for (let i = index; i < pointerPath.length; ++i) {
    if (i + 1 == pointerPath.length) {
      if (!current?.[pointerPath[i]]) {
        continue;
      }
      const [pluginNameEncoded, ...remainingRefPath] = decodeSchemaPath(
        current[pointerPath[i]]
      );
      const pluginName = /\$\((.+)\)/.exec(pluginNameEncoded as string)[1];
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
      for (let j = 0; j < (current as Array<unknown>).length; ++j) {
        const subState = current[j];
        const keyValue = subState[keyProp];
        const subPointers = getPointersAtPath(
          pointerPath,
          staticPointer,
          subState,
          [...subPath, { key: keyProp, value: keyValue }],
          i + 1
        );
        pointers.push(...subPointers);
      }
      break;
    }

    subPath.push(pointerPath[i]);
    current = current[pointerPath[i]];
  }
  return pointers;
};

export const compileStatePointers = (
  staticPointers: Array<StaticPointer>,
  stateMap: { [key: string]: object }
): Array<StateMapPointer> => {
  const pointers = [];
  for (const staticPointer of staticPointers) {
    const ptrs = getPointersAtPath(
      staticPointer.staticPath,
      staticPointer,
      stateMap
    );
    pointers.push(...ptrs);
  }
  return pointers;
};

const accessObjectInReferenceMap = (
  referenceMap: { [key: string]: StaticStateMapObject },
  path: Array<string | { key: string; value: string }>
): StaticStateMapChild => {
  let curr:
    | { [key: string]: StaticStateMapObject }
    | StaticStateMapObject
    | StaticStateMapChild = referenceMap;
  for (let i = 0; i < path.length; ++i) {
    const part = path[i];
    const isLast = i + 1 == path.length;
    if (typeof part == "string") {
      curr = curr[part];
      continue;
    }
    const { value } = part;
    curr = (curr as StaticStateMapObject).values[value] as StaticStateMapChild;
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
  return curr as StaticStateMapChild;
};

const accessSetInReferenceMap = (
  referenceMap: { [key: string]: StaticStateMapObject },
  path: Array<string | { key: string; value: string }>
): Array<unknown> => {
  let curr:
    | { [key: string]: StaticStateMapObject }
    | StaticStateMapObject
    | StaticStateMapChild
    | Array<unknown> = referenceMap;
  for (let i = 0; i < path.length; ++i) {
    const part = path[i];
    const isLast = i + 1 == path.length;
    if (typeof part == "string") {
      curr = curr[part];
      continue;
    }
    const { value } = part;
    curr = (curr as StaticStateMapObject).values[value] as StaticStateMapChild;
    if (!curr) {
      return null;
    }
    if (!isLast) {
      curr = curr.object;
    }
  }
  return curr as any;
};

export const recursivelyCheckIfReferenceExists = (
  ref: string,
  refPath: Array<string | { key: string; value: string }>,
  referenceMap: { [key: string]: StaticStateMapObject },
  visited = {}
): boolean => {
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
    const [pluginNameEncoded, ...remainingRefPath] = decodeSchemaPath(
      referenceObject.instance[referenceObject.keyProp]
    );
    const pluginName = /\$\((.+)\)/.exec(pluginNameEncoded as string)[1];
    const nextRefPath = [pluginName, ...remainingRefPath];
    return recursivelyCheckIfReferenceExists(
      nextRef,
      nextRefPath,
      referenceMap,
      visited
    );
  }
  return true;
};

/**
 *
 * This is a really ugly function but it gets called frequently
 * and must not depend upon serialization/deserialization to and
 * from KV. It also has to be able to work in place to stay performant.
 * It get called on every update call.
 */
export const cascadePluginState = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object }
): Promise<{ [key: string]: object }> => {
  try {
    const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
    const staticPointers = traverseSchemaMapForStaticPointerPaths(
      rootSchemaMap,
      rootSchemaMap
    );
    const pointers = compileStatePointers(staticPointers, stateMap);
    // if no pointers just return the stateMap
    if (pointers.length == 0) {
      return stateMap;
    }
    const staticSetPaths = traverseSchemaMapForStaticSetPaths(
      rootSchemaMap,
      rootSchemaMap
    );
    const references = compileStateRefs(staticSetPaths, stateMap);
    let deletions = 0;
    for (let ptr of pointers) {
      const refExists = recursivelyCheckIfReferenceExists(
        ptr.ref,
        ptr.refPath,
        references
      );
      if (!refExists) {
        if (ptr.onDelete == "delete") {
          deletions++;
          const parentSet = accessSetInReferenceMap(
            references,
            ptr.parentSetPath
          );
          if (!parentSet) {
            continue;
          }
          delete parentSet.values[ptr.ref];
          let pointerIndex = -1;
          for (
            let i = 0;
            i < (parentSet["parent"] as Array<object>).length;
            ++i
          ) {
            if (parentSet["parent"][i][ptr.refKey] == ptr.ref) {
              pointerIndex = i;
              break;
            }
          }
          if (pointerIndex != -1) {
            parentSet["parent"].splice(pointerIndex, 1);
          }
        }
        if (
          ptr.onDelete == "nullify" &&
          ptr?.ownerObject?.[ptr.refKey] != null
        ) {
          ptr.ownerObject[ptr.refKey] = null;
        }
      }
    }
    if (deletions > 0) {
      // bad but highly infrequent
      return cascadePluginState(datasource, schemaMap, stateMap);
    }
    return stateMap;
  } catch (e) {
    return stateMap;
  }
};

/***
 * cascading is heavy but infrequent. It only needs to be
 * called when updating state. Not called when applying diffs
 * @deprecated because it is not scalable at all
 */
export const cascadePluginStateDeprecated = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object },
  pluginName: string,
  rootSchemaMap?: { [key: string]: TypeStruct },
  memo: { [key: string]: { [key: string]: object } } = {}
): Promise<{ [key: string]: object }> => {
  if (!rootSchemaMap) {
    rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  }
  if (!memo) {
    memo = {};
  }
  const kvs = await getKVStateForPlugin(
    datasource,
    schemaMap,
    pluginName,
    stateMap
  );
  const removedRefs = new Set();
  const next: Array<DiffElement> = [];
  for (const kv of kvs) {
    const key = kv.key;
    const value = {
      ...kv.value,
    };
    const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key) as object;
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
      for (const prop in subSchema) {
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
    const out = cascadePluginStateDeprecated(
      datasource,
      schemaMap,
      { ...stateMap, [pluginName]: newPluginState },
      pluginName,
      rootSchemaMap,
      memo
    );
    return out;
  }
  const downstreamDeps = getDownstreamDepsInSchemaMap(schemaMap, pluginName);
  const result = await asyncReduce(
    nextStateMap,
    downstreamDeps,
    async (stateMap, dependentPluginName) => {
      if (memo[`${pluginName}:${dependentPluginName}`]) {
        return {
          ...stateMap,
          ...memo[`${pluginName}:${dependentPluginName}`],
        };
      }
      const result = {
        ...stateMap,
        ...(await cascadePluginStateDeprecated(
          datasource,
          schemaMap,
          stateMap,
          dependentPluginName,
          rootSchemaMap,
          memo
        )),
      };
      memo[`${pluginName}:${dependentPluginName}`] = result;
      return result;
    }
  );
  return result;
};

export const validatePluginState = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object },
  pluginName: string
): Promise<boolean> => {
  const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  // ignore $(store)
  const [, ...kvs] = await getKVStateForPlugin(
    datasource,
    schemaMap,
    pluginName,
    stateMap
  );
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
  const nested: Array<[object, object]> = [];
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

export const pluginManifestIsSubsetOfManifest = async (
  datasource: DataSource,
  currentSchemaMap: { [key: string]: Manifest },
  nextSchemaMap: { [key: string]: Manifest }
): Promise<boolean> => {
  const oldRootSchema = await getRootSchemaMap(datasource, currentSchemaMap);
  const nextRootSchema = await getRootSchemaMap(datasource, nextSchemaMap);
  if (!oldRootSchema) {
    return false;
  }

  if (!nextRootSchema) {
    return false;
  }
  return objectIsSubsetOfObject(oldRootSchema, nextRootSchema);
};

export const isTopologicalSubset = async (
  datasource: DataSource,
  oldSchemaMap: { [key: string]: Manifest },
  oldStateMap: { [key: string]: object },
  newSchemaMap: { [key: string]: Manifest },
  newStateMap: { [key: string]: object },
  pluginName: string
): Promise<boolean> => {
  if (!oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
    return true;
  }
  if (oldSchemaMap[pluginName] && !newSchemaMap[pluginName]) {
    return false;
  }

  if (
    !(await pluginManifestIsSubsetOfManifest(
      datasource,
      oldSchemaMap,
      newSchemaMap
    ))
  ) {
    return false;
  }
  const oldKVs =
    (await (
      await getKVStateForPlugin(
        datasource,
        oldSchemaMap,
        pluginName,
        oldStateMap
      )
    )
      ?.map?.(({ key }) => key)
      ?.filter?.((key) => {
        // remove array refs, since unstable
        if (/\(id\)<.+>/.test(key)) {
          return false;
        }
        return true;
      })) ?? [];
  const newKVs = (
    await getKVStateForPlugin(datasource, newSchemaMap, pluginName, newStateMap)
  ).map(({ key }) => key);
  const newKVsSet = new Set(newKVs);
  for (const key of oldKVs) {
    if (!newKVsSet.has(key)) {
      return false;
    }
  }
  return true;
};

export const isTopologicalSubsetValid = async (
  datasource: DataSource,
  oldSchemaMap: { [key: string]: Manifest },
  oldStateMap: { [key: string]: object },
  newSchemaMap: { [key: string]: Manifest },
  newStateMap: { [key: string]: object },
  pluginName: string
): Promise<boolean> => {
  if (
    !(await isTopologicalSubset(
      datasource,
      oldSchemaMap,
      oldStateMap,
      newSchemaMap,
      newStateMap,
      pluginName
    ))
  ) {
    return false;
  }
  // we need to apply old schema against new data to ensure valid/safe
  // otherwise we would examine props outside of the subspace that may
  // be invalid in the new version but dont exist in the old version
  const oldRootSchemaMap =
    (await getRootSchemaMap(datasource, oldSchemaMap)) ?? {};
  // ignore $(store)
  const [, ...oldKVs] = (
    await getKVStateForPlugin(datasource, oldSchemaMap, pluginName, oldStateMap)
  ).map(({ key }) => key);
  const oldKVsSet = new Set(oldKVs);
  // ignore $(store)
  const [, ...newKVs] = (
    await getKVStateForPlugin(datasource, newSchemaMap, pluginName, newStateMap)
  ).filter(({ key }) => oldKVsSet.has(key));
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
    const sets: Array<string> = [];
    const arrays: Array<string> = [];
    const nestedStructures: Array<string> = [];
    const refs: Array<string> = [];
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

    const refCheck = refs.reduce(
      (
        response: SchemaValidationResponse,
        refProp
      ): SchemaValidationResponse => {
        if (response.status != "ok") {
          return response;
        }
        const refStruct = typeStruct[refProp] as ManifestNode;
        if (refStruct?.refType?.startsWith("$")) {
          const [root, ...rest] = path;
          const pluginName =
            /^\$\((.+)\)$/.exec(
              refStruct?.refType.split(".")[0] as string
            )?.[1] ?? (refStruct?.refType.split(".")[0] == "$" ? root : null);
          if (!pluginName) {
            const formattedPath = [`$(${root})`, ...rest, refProp].join(".");
            return {
              status: "error",
              message: `Invalid reference pointer '${refStruct.refType}'. No reference value found for value at '${formattedPath}'.`,
            };
          }
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
              message: `Invalid reference pointer '${refStruct.refType}'. Keys that are constrained ref types cannot be schematically self-referential. Found at '${formattedPath}'.`,
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
          const referencedType = expandedTypes[refStruct.refType as string];
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
      (
        response: SchemaValidationResponse,
        nestedStructureProp
      ): SchemaValidationResponse => {
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
      (
        response: SchemaValidationResponse,
        arrayProp
      ): SchemaValidationResponse => {
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
      (
        response: SchemaValidationResponse,
        setProp
      ): SchemaValidationResponse => {
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
  for (const prop in typeStruct) {
    if (!rootSchema[prop]) {
      const formattedPath = [...path, prop].join(".");
      return {
        status: "error",
        message: `Invalid prop in schema. Remove or change '${prop}=${
          typeStruct[prop]
        }' from '${path.join(".")}'. Found at '${formattedPath}'.`,
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
  path: Array<string | { key: string; value: string }> = []
): Array<string> => {
  const out: Array<string> = [];
  for (const prop in typeStruct) {
    if (typeStruct[prop]?.isKey) {
      if (typeStruct[prop].type == "ref") {
        path.push({ key: prop, value: `ref<${typeStruct[prop].refType}>` });
      } else {
        path.push({ key: prop, value: typeStruct[prop].type as string });
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
  const out = {};
  for (const prop in typeStruct) {
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
        const pluginName = /^\$\((.+)\)$/.exec(
          refType.split(".")[0] as string
        )?.[1] as string;
        const staticSchema = getStaticSchemaAtPath(
          rootSchemaMap[pluginName],
          refType
        );
        const keyProp = Object.keys(staticSchema).find(
          (p) => staticSchema[p].isKey
        );
        const refKeyType = staticSchema[keyProp as string].type;
        out[prop].refKeyType = refKeyType;
      } else {
        const staticSchema = expandedTypes[refType];
        const keyProp = Object.keys(staticSchema).find(
          (p) => staticSchema[p].isKey
        );
        const refKeyType = staticSchema[keyProp as string].type;
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
  for (const prop in typestructA) {
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
  const out = {};
  for (const key of referenceKeys) {
    const pluginName = /^\$\((.+)\)$/.exec(
      key.split(".")[0] as string
    )?.[1] as string;
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

const getPointersForRefType = (
  refType: string,
  referenceReturnTypeMap: { [key: string]: Array<string> }
): Array<string> => {
  return Object.keys(referenceReturnTypeMap).filter((path) => {
    return referenceReturnTypeMap[path].includes(refType);
  });
};

export const buildPointerArgsMap = (referenceReturnTypeMap: {
  [key: string]: Array<string>;
}): { [key: string]: Array<Array<string>> } => {
  const out = {};
  for (const key in referenceReturnTypeMap) {
    const path = decodeSchemaPath(key);
    const argsPath = path.filter(
      (part) => typeof part != "string"
    ) as Array<DiffElement>;
    const args = argsPath.map((arg) => {
      if (primitives.has(arg.value)) {
        if (arg.value == "int" || arg.value == "float") {
          return ["number"];
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

const drawQueryTypes = (argMap: { [key: string]: Array<Array<string>> }) => {
  let code = "export type QueryTypes = {\n";
  for (const path in argMap) {
    const wildcard = replaceRefVarsWithWildcards(path);
    const argStr = argMap[path].reduce((s, argPossibilities) => {
      if (
        argPossibilities[0] == "string" ||
        argPossibilities[0] == "boolean" ||
        argPossibilities[0] == "number"
      ) {
        return s.replace("<?>", `<$\{${argPossibilities[0]}}>`);
      }
      const line = argPossibilities
        .map(replaceRefVarsWithWildcards)
        .map((wcq) => `QueryTypes['${wcq}']`)
        .join("|");
      return s.replace("<?>", `<$\{${line}}>`);
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
  const globalArgs: Array<Array<string>> = [];
  const globalQueryParam = Object.keys(argMap)
    .map(replaceRefVarsWithWildcards)
    .map((query) => `'${query}'`)
    .join("|");
  const globalQueryReturn = Object.keys(argMap)
    .map(replaceRefVarsWithWildcards)
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
  const globalParams: Array<string> = [];
  for (let i = 0; i < globalArgs.length; ++i) {
    const args: Array<string> = globalArgs[i];
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

  for (const query in argMap) {
    const args = argMap[query];
    const returnType = args.reduce((s, argType, i) => {
      if (
        argType[0] == "string" ||
        argType[0] == "boolean" ||
        argType[0] == "number"
      ) {
        return s.replace("<?>", `<$\{arg${i} as ${argType[0]}}>`);
      }
      return s.replace(
        "<?>",
        `<$\{arg${i} as ${argType
          .map(replaceRefVarsWithWildcards)
          .map((v) => `QueryTypes['${v}']`)
          .join("|")}}>`
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
    for (const query in argMap) {
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

      code += `export function useQueryRef(${params}): QueryTypes['${replaceRefVarsWithWildcards(
        query
      )}'];\n`;
    }

    code += `export function useQueryRef(query: ${globalQueryParam}, ${globalParams.join(
      ", "
    )}): ${globalQueryReturn}|null {\n`;
    code += `  return useMemo(() => {\n`;

    for (const query in argMap) {
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
  for (const path in referenceReturnTypeMap) {
    const [staticPath] = referenceReturnTypeMap[path];
    const pluginName = /^\$\((.+)\)$/.exec(
      staticPath.split(".")[0] as string
    )?.[1] as string;
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

const drawTypestruct = (
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

export const getObjectInStateMap = (stateMap: object&{[key: string]: object}, path: string): object | null => {
  let current: null | undefined | object&{[key: string]: object}| unknown = null;
  const [pluginWrapper, ...decodedPath] = decodeSchemaPath(path);
  const pluginName = /^$((.+))$/.exec(pluginWrapper as string)?.[1] ?? null;
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
      current = (current as {[key: string]: object|unknown})[part];
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

export const drawGetReferencedObject = (
  argMap: { [key: string]: Array<Array<string>> },
  useReact = false
): string => {
  const wildcards = Object.keys(argMap).map(replaceRefVarsWithWildcards);
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

export const drawGetPluginStore = (
  rootSchemaMap: { [key: string]: TypeStruct },
  useReact = false
): string => {
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
