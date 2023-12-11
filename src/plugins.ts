import axios from "axios";
import { DiffElement, copyKV } from "./sequenceoperations";
import semver from "semver";
import { DataSource } from "./datasource";
import { GeneratorManifest } from "./generatorcreator";
import fs from 'fs';
import path from 'path';

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
  bounded?: boolean;
  manualOrdering?: boolean;
  onDelete?: "delete" | "nullify";
  default?: unknown|Array<unknown>;
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
  managedCopy?: boolean;
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
  seed?: unknown;
}

export interface CopyInstructions {
  [pluginName: string]: {
    isManualCopy: boolean;
    manualCopyList: Array<string>;
    copyPriority: "yours"|"theirs"; // if not manual copy, this should be set by user, otherwise theirs
    referencePriority: "yours"|"theirs"; // this should always be set by user
  }
};

const primitives = new Set(["int", "float", "boolean", "string", "file"]);

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

export const pluginManifestsAreCompatibleForGeneratorUpdate = async (
  datasource: DataSource,
  oldGeneratorManifest: GeneratorManifest,
  newGeneratorManifest: GeneratorManifest
): Promise<boolean | null> => {
  const oldSchemaMap = await getSchemaMapForGeneratorManifest(datasource, oldGeneratorManifest);
  const newSchemaMap = await getSchemaMapForGeneratorManifest(datasource, newGeneratorManifest);

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
  pluginList: Array<PluginElement>,
  disableDownloads = false
): Promise<Array<Manifest>> => {
  const manifests = await Promise.all(
    pluginList?.map?.(({ key: pluginName, value: pluginVersion }) => {
      return datasource.getPluginManifest(pluginName, pluginVersion, disableDownloads);
    }) ?? []
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
  disableDownloads = false,
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
        manifest.imports[pluginName],
        disableDownloads
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
        disableDownloads,
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
  disableDownloads = false,
  memo: { [key: string]: Array<Manifest> } = {},
): Promise<Array<Manifest> | null> => {
  if (memo[manifest.name + "-" + manifest.version]) {
    return memo[manifest.name + "-" + manifest.version];
  }

  const deps: Array<Manifest> = [manifest];
  for (const dependentPluginName in manifest.imports) {
    const dependentManifest = await datasource.getPluginManifest(
      dependentPluginName,
      manifest.imports[dependentPluginName],
      disableDownloads
    );
    if (!dependentManifest) {
      return null;
    }
    const subDeps = await getUpstreamDependencyManifests(
      datasource,
      dependentManifest,
      disableDownloads,
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

export const getUpstreamDependencyManifestsForGeneratorManifest = async (
  datasource: DataSource,
  generatorManifest: GeneratorManifest,
  disableDownloads = false,
  memo: { [key: string]: Array<Manifest> } = {},
): Promise<Array<Manifest> | null> => {
  const deps: Array<Manifest> = [];
  for (const dependentPluginName in generatorManifest.dependencies) {
    const dependentManifest = await datasource.getPluginManifest(
      dependentPluginName,
      generatorManifest.dependencies[dependentPluginName],
      disableDownloads
    );
    if (!dependentManifest) {
      return null;
    }
    const subDeps = await getUpstreamDependencyManifests(
      datasource,
      dependentManifest,
      disableDownloads,
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
  return deps;
};

const uniqueStrings = (
  strings: Array<string>
): Array<string> => {
  let out: Array<string> = [];
  let seen = new Set();
  for (let str of strings) {
    if (!seen.has(str)) {
      seen.add(str);
      out.push(str);
    }
  }
  return out.sort();
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
            if (a == "dev" && b == "dev") {
              return 0;
            }
            if (a == "dev") {
              return 1;
            }
            if (b == "dev") {
              return -1;
            }
            const aVer = a.startsWith("dev") ? a.split("@")[1] : a;
            const bVer = b.startsWith("dev") ? b.split("@")[1] : b;
            if (semver.eq(aVer, bVer)) {
              return 0;
            }
            return semver.gt(aVer, bVer) ? 1 : -1;
          }
        );
        return {
          ...acc,
          [manifest.name]: uniqueStrings(semList),
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

export const getSchemaMapForGeneratorManifest = async (
  datasource: DataSource,
  generatorManifest: GeneratorManifest
): Promise<{ [key: string]: Manifest } | null> => {
  const deps = await getUpstreamDependencyManifestsForGeneratorManifest(datasource, generatorManifest);
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
    const validSchema =  isSchemaValid(
      rootSchemaMap,
      schemaMap,
      rootSchemaMap,
      expandedTypes
    );
    if (validSchema.status == "ok") {
      if (manifest?.seed) {
        const seedMap = {};
        for (let pluginName in schemaMap) {
          seedMap[pluginName] = schemaMap[pluginName]?.seed ?? {};
        }
        const seedIsValid = await validatePluginState(
          datasource,
          schemaMap,
          seedMap,
          manifest.name
        );
        if (!seedIsValid) {
          return {
            status: "error",
            message: "Invalid seed state",
          };
        }
      }
    }
    return validSchema;
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
        out[prop].emptyable = struct[prop]?.emptyable === undefined ? true : struct[prop]?.emptyable;
        out[prop].values = struct[prop].values;
        if (struct[prop].hasOwnProperty("default")) {
          out[prop].default = struct[prop].default;
        }
        continue;
      }

      if (
        typeof struct[prop]?.values == "string" &&
        schema.types[struct[prop]?.values as string]
      ) {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable === undefined ? true : struct[prop]?.emptyable;
        out[prop].bounded = struct[prop]?.bounded ?? false;
        out[prop].manualOrdering = struct[prop]?.manualOrdering ?? false;
        out[prop].values = constructRootSchema(
          schema,
          schema.types[struct[prop]?.values as string] as TypeStruct,
          pluginName
        );
        continue;
      }
      if (typeof struct[prop]?.values != "string") {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable === undefined ? true : struct[prop]?.emptyable;
        out[prop].bounded = struct[prop]?.bounded ?? false;
        out[prop].manualOrdering = struct[prop]?.manualOrdering ?? false;
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
        out[prop].emptyable = struct[prop]?.emptyable === undefined ? true : struct[prop]?.emptyable;
        out[prop].values = struct[prop].values;
        if (struct[prop].hasOwnProperty("default")) {
          out[prop].default = struct[prop].default;
        }
        continue;
      }

      if (
        typeof struct[prop]?.values == "string" &&
        schema.types[struct[prop]?.values as string]
      ) {
        out[prop].type = struct[prop].type;
        out[prop].emptyable = struct[prop]?.emptyable === undefined ? true : struct[prop]?.emptyable;
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
        out[prop].emptyable = struct[prop]?.emptyable === undefined ? true : struct[prop]?.emptyable;
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
        if (struct[prop]?.hasOwnProperty("default")) {
          out[prop].default = struct[prop]?.default;
        }
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
          if (struct[prop]?.hasOwnProperty("default")) {
            out[prop].default = struct[prop]?.default;
          }
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
        if (struct[prop]?.hasOwnProperty("default")) {
          out[prop].default = struct[prop]?.default;
        }
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
        (state?.[prop] ?? [])?.map?.((value: object) => {
          return defaultMissingSchemaState(
            struct[prop]?.values as TypeStruct,
            value as object,
            stateMap
          );
        }) ?? [];
      continue;
    }
    if (primitives.has(struct[prop]?.type as string)) {
      out[prop] = state?.[prop] ?? struct[prop]?.default ?? null;
      continue;
    }

    if (struct[prop]?.type == "ref") {
      if (state?.[prop]) {
        const referencedObject = getObjectInStateMap(stateMap, state?.[prop]);
        if (!referencedObject) {
          if (struct[prop]?.default) {
            const referencedDefaultObject = getObjectInStateMap(stateMap, state?.[prop]);
            if (referencedDefaultObject) {
              out[prop] = struct[prop]?.default;
              continue;
            }
          }
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
        state?.[prop] ?? struct[prop]?.default ?? {},
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
      (struct[prop].values == "string" || struct[prop].values == "file")
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
      if (typeof state?.[prop] == "number" && !Number.isNaN(state[prop])) {
        out[prop] = Math.floor(state[prop]);
        continue;
      }
      out[prop] = null;
      continue;
    }

    if (struct[prop]?.type == "float") {
      if (typeof state?.[prop] == "number" && !Number.isNaN(state[prop])) {
        out[prop] = state?.[prop];
        continue;
      }
      out[prop] = null;
      continue;
    }

    if (struct[prop]?.type == "boolean") {
      if (typeof state?.[prop] == "boolean") {
        out[prop] = state?.[prop];
        continue;
      }
      out[prop] = null;
      continue;
    }

    if (struct[prop]?.type == "string") {
      if (typeof state?.[prop] == "string") {
        out[prop] = state?.[prop];
        continue;
      }
      out[prop] = null;
      continue;
    }

    if (struct[prop]?.type == "file") {
      if (typeof state?.[prop] == "string") {
        out[prop] = state?.[prop];
        continue;
      }
      out[prop] = null;
      continue;
    }

    if (!struct[prop]?.type) {
      out[prop] = sanitizePrimitivesWithSchema(
        struct?.[prop] as TypeStruct,
        state?.[prop] ?? {}
      );
      continue;
    }
    out[prop] = state?.[prop] ?? null;
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

export const writePathStringWithArrays = (
  pathParts: Array<DiffElement | string | number>
): string => {
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

export const decodeSchemaPathWithArrays = (
  pathString: string
): Array<DiffElement | string | number> => {
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
      hashPairs.push({
        key: prop,
        value: state[prop]?.reduce((s: string, element: object) => {
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
          [
            ...traversalPath,
            ...(primaryKey ? [primaryKey] : []),
            prop
          ],
        )
      );
    });
  }
  for (const prop of sets) {
    (state?.[prop] ?? []).forEach((element) => {
      kv.push(
        ...flattenStateToSchemaPathKV(
          schemaRoot[prop].values,
          element,
          [
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
      value["(id)"] = `${id}:${count}`;
    }
    out.push({ key: updatedKey, value });
  }
  return out;
};

const hasParentPath = (decodedPath: Array<string | DiffElement>): boolean => {
  for (let i = decodedPath.length -1; i >=0; --i) {
    if (typeof decodedPath[i] == "object") {
      return true;
    }
  }
  return false;
}

const parentKeyPath = (pluginName: string, decodedPath: Array<string | DiffElement>): string => {
  for (let i = decodedPath.length -1; i >=0; --i) {
    if (typeof decodedPath[i] == "object") {
      return writePathString([pluginName, ...decodedPath.slice(0, i - 1)]);
    }
  }
  return null;
}

export const buildObjectsAtPath = (
  rootSchema: Manifest,
  path: string,
  properties: { [key: string]: number | string | boolean },
  visitedLists = {},
  visitedKeys = new Set<string>([]),
  out = {}
): object => {
  if (visitedKeys.has(path)) {
    return out;
  }
  // ignore $(store)
  const [pluginName, ...decodedPath] = decodeSchemaPath(path);
  let current = out;
  let currentSchema = rootSchema;
  const partialPath = [];
  if (hasParentPath(decodedPath)) {
    const parentKey = parentKeyPath(pluginName as string, decodedPath);
    if (!visitedKeys.has(parentKey)) {
      return out;
    }
  }
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
      if (!current?.[part]) {
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
  visitedKeys.add(path);
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
  const [pluginWrapper, ...decodedPath] = decodeSchemaPathWithArrays(path);
  const pluginName = /^\$\((.+)\)$/.exec(pluginWrapper as string)?.[1] ?? null;
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
      out[prop].emptyable = types[prop]?.emptyable === undefined ? true : types[prop].emptyable;
      if (types[prop].hasOwnProperty("default")) {
        out[prop].default = types[prop]?.default;
      }
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
        if (types[prop]?.type === "set") {
          out[prop].bounded = types[prop]?.bounded ?? false;
          out[prop].manualOrdering = types[prop]?.manualOrdering ?? false;
        }
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
        if (types[prop]?.type === "set") {
          out[prop].bounded = types[prop]?.bounded ?? false;
          out[prop].manualOrdering = types[prop]?.manualOrdering ?? false;
        }
        continue;
      }
      if (typeof types[prop].values == "object") {
        out[prop].values = iterateSchemaTypes(
          types[prop].values as TypeStruct,
          pluginName,
          importedTypes
        );
        if (types[prop]?.type === "set") {
          out[prop].bounded = types[prop]?.bounded ?? false;
          out[prop].manualOrdering = types[prop]?.manualOrdering ?? false;
        }
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
        if (splitGroup[0] == "$") {
          out[prop].type = `ref<${[`$(${pluginName})`, ...splitGroup.slice(1)].join(".")}>`;
        } else {
          out[prop].type = types[prop].type;
        }
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
  kvs: Array<DiffElement>,
  pluginName: string
): object => {
  const rootSchema = getRootSchemaForPlugin(schemaMap, pluginName);
  const kvCopy = kvs.map(kv => ({key: kv.key, value: Object.assign({}, kv.value)}));
  const kvArray = indexArrayDuplicates(kvCopy);
  let out = {};
  let memo = {};
  let visitedKeys = new Set<string>([]);
  for (const pair of kvArray) {
    out = buildObjectsAtPath(
      rootSchema as unknown as Manifest,
      pair.key,
      pair.value,
      memo,
      visitedKeys,
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

export const getExpandedTypesForSchemaMapWithDependencies = (
  schemaMap: { [key: string]: Manifest },
  dependencies: {[pluginName: string]: string}
): TypeStruct => {
  const upstreamDeps = getUpstreamDepsInSchemaMapWithoutRootPlugin(schemaMap, dependencies);
  const schemaWithTypes = [...upstreamDeps].reduce(
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
  },
  disableDownloads = false
): Promise<{ [key: string]: TypeStruct } | null> => {
  // need to top sort
  const rootSchemaMap = {};
  for (const pluginName in schemaMap) {
    const manifest = schemaMap[pluginName];
    const upsteamDeps = await getUpstreamDependencyManifests(
      datasource,
      manifest,
      disableDownloads
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
    if (typeof schemaMap[prop] == "object" && !Array.isArray(schemaMap[prop])) {
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
  if (Object.keys(current?.imports ?? {}).length == 0) {
    return [];
  }
  const deps = Object.keys(current.imports);
  for (const dep of deps) {
    const upstreamDeps = getUpstreamDepsInSchemaMap(schemaMap, dep);
    deps.push(...upstreamDeps);
  }
  return deps;
};

export const getUpstreamDepsInSchemaMapWithoutRootPlugin = (
  schemaMap: { [key: string]: Manifest },
  dependencies: {[pluginName: string]: string}
): Array<string> => {
  if (Object.keys(dependencies ?? {}).length == 0) {
    return [];
  }
  const deps = Object.keys(dependencies);
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
  isBounded: boolean;
  isManuallyOrdered: boolean;
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
      (typeStruct[prop]?.type == "set" || typeStruct[prop]?.type == "array") &&
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
      let isBounded = typeStruct[prop].bounded ?? false;
      let isManuallyOrdered = isBounded && (typeStruct[prop].manualOrdering ?? false);
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
        isBounded,
        isManuallyOrdered
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
  let last: object;
  let lastPart: string;
  for (let part of path) {
    if (part == "values") {
      if (current == undefined) {
        last[lastPart] = [];
        return last[lastPart] as Array<{ [key: string]: object }>;
      }
      return current as Array<{ [key: string]: object }>;
    }
    last = current;
    lastPart = part;
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
  isBounded: boolean;
  isManuallyOrdered: boolean;
}

const traverseSchemaMapForStaticPointerPaths = (
  rootSchemaMap: { [key: string]: TypeStruct },
  typeStruct: { [key: string]: TypeStruct } | TypeStruct,
  path = [],
  relativePath = [],
  parent = null,
  isBounded = false,
  isManuallyOrdered = false
): Array<StaticPointer> => {
  const refs = [];
  for (const prop in typeStruct) {
    if (typeof typeStruct[prop] == "object" && !typeStruct[prop]?.type) {
      const subRefs = traverseSchemaMapForStaticPointerPaths(
        rootSchemaMap,
        typeStruct[prop] as TypeStruct,
        [...path, prop],
        [...relativePath, prop],
        parent,
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
        [...path, prop, `values_key:${keyProp}`],
        (typeStruct[prop] as ManifestNode)?.bounded ?? false,
        (typeStruct[prop] as ManifestNode)?.manualOrdering ?? false,
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
        isBounded: !!isBounded && !!typeStruct?.[prop]?.isKey,
        isManuallyOrdered
      });
    }
  }
  return refs;
};

interface StateMapPointer {
  parentSetPath: Array<string | { key: string; value: string }>;
  setPath: Array<string | { key: string; value: string }>;
  refPath: Array<string | { key: string; value: string }>;
  refParentPath: Array<string | { key: string; value: string }>;
  ownerObject: unknown;
  refKey: string;
  ref: string;
  onDelete: "delete" | "nullify";
  refType: string;
  isBounded: boolean;
  isManuallyOrdered: boolean;
  pluginName: string;
}

const getPointersAtPath = (
  pointerPath: Array<string>,
  staticPointer: StaticPointer,
  stateMap: { [key: string]: unknown } | Array<unknown>,
  path: Array<string | { key: string; value: string }> = [],
  index = 0
): Array<StateMapPointer> => {
  const pointers: Array<StateMapPointer> = [];
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
      const refParentPath = refPath.slice(0, -1);

      pointers.push({
        setPath: path,
        parentSetPath: path.slice(0, -1),
        ownerObject: current,
        isBounded: staticPointer.isBounded,
        isManuallyOrdered: staticPointer.isManuallyOrdered,
        refKey: pointerPath[i],
        ref: current[pointerPath[i]],
        refPath,
        onDelete: staticPointer.onDelete,
        refType: staticPointer.refType,
        refParentPath,
        pluginName
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
): {values: Array<unknown>, parent: Array<unknown>} => {
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

const getBoundedStaticSetPaths = (staticSetPaths: StaticSetPath[], out: StaticSetPath[] = []): StaticSetPath[] => {
  for (const staticSet of staticSetPaths) {
    if (staticSet.isBounded) {
      out.push(staticSet);
    }
    out.push(...getBoundedStaticSetPaths(staticSet.staticChildren));
  }
  return out;
}

const getParentStatesFromStaticPath = (
  staticPath: Array<string>,
  referenceMap: { [key: string]: StaticStateMapObject },
): Array<unknown> => {
  let curr = referenceMap as { [key: string]: StaticStateMapObject }|StaticStateMapObject;
  const out = [];
  for (let i = 0; i < staticPath.length; ++i) {
    const part = staticPath[i];
    if (part == "values") {
      if (staticPath.length - 1 == i) {
        out.push(curr.parent);
      }
      const results = Object.keys(curr.values).flatMap((key) => {
        return getParentStatesFromStaticPath(
          staticPath.slice(i + 1),
          curr.values[key].object
        );
      })
      out.push(...results);
      break;
    }
    curr = curr[part];
  }
  return out;
}

const getBoundedStateSets = (
  referenceMap: { [key: string]: StaticStateMapObject },
  staticSets: StaticSetPath[]
): Array<{staticSet: StaticSetPath, parents: Array<Array<unknown>>}> => {
  const out = [];
  for (const staticSet of staticSets) {
    const parents = getParentStatesFromStaticPath(staticSet.staticPath, referenceMap)
    out.push({
      staticSet,
      parents
    })
  }
  return out;
};

// call before cascade
// Probably the dirtiest code in this whole thing, I am really sorry.
// It's fastish and does not depend upon any serialization/reserialization
export const enforceBoundedSets = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object }
): Promise<void> => {
  try {
    let shouldRecurse = false;
    const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
    const staticPointers = traverseSchemaMapForStaticPointerPaths(
      rootSchemaMap,
      rootSchemaMap
    );

    const boundedStaticPointers: {[key: string]: StaticPointer} = {};
    for (const staticPointer of staticPointers) {
      if (staticPointer.isBounded) {
        const normalizedPath = staticPointer.staticPath.map(p => {
          if (p.startsWith("values_key:")) {
            return "values";
          }
          return p;
        }).slice(0, -1).join(".");
        boundedStaticPointers[normalizedPath] = staticPointer;
      }
    }
    const staticSetPaths = traverseSchemaMapForStaticSetPaths(
      rootSchemaMap,
      rootSchemaMap
    );

    const boundedStaticSets = getBoundedStaticSetPaths(staticSetPaths);

    const references = compileStateRefs(staticSetPaths, stateMap);
    const boundedStateSetsWithParents = getBoundedStateSets(references, boundedStaticSets);
    for (const boundedStateSetWithParents of boundedStateSetsWithParents) {
      const staticPathString = boundedStateSetWithParents.staticSet.staticPath.join(".");
      const staticPointer: StaticPointer = boundedStaticPointers[staticPathString];
      const [boundingWrappedName, ...boundingRest] = staticPointer.refType.split(".");
      const boundingPluginName =
        /^\$\((.+)\)$/.exec(
          boundingWrappedName as string
        )?.[1];
      const refMapPath = [boundingPluginName, ...boundingRest];
      const boundingSet = accessObjectInReferenceMap(references, refMapPath);
      const boundingSubSchema = getStaticSchemaAtPath(
        rootSchemaMap[boundingPluginName],
        staticPointer.refType
      );
      let boundingKey: string;
      for (let prop in boundingSubSchema) {
        if (boundingSubSchema[prop]?.isKey) {
          boundingKey = prop;
          break;
        }
      }
      let ordinalMap: {[key: string]: number} = {};
      const boundingKeys = Object.keys(boundingSet).map((value, index) => {
        const key = [
          ...staticPointer.refType.split(".").slice(0, -1),
          `${boundingKey}<${value}>`,
        ].join(".");
        ordinalMap[key] = index;
        return key;
      });
      const boundedSubSchema = getStaticSchemaAtPath(
        rootSchemaMap[boundedStateSetWithParents.staticSet.staticPath[0]],
        [`$(${boundedStateSetWithParents.staticSet.staticPath[0]})`,...boundedStateSetWithParents.staticSet.staticPath.slice(1)].join(".")
      );
      for (const boundedSet of boundedStateSetWithParents.parents) {
        const keys = new Set(
          boundedSet
            .filter((v) => !!v[boundedStateSetWithParents.staticSet.keyProp])
            .map(
              (v) => v[boundedStateSetWithParents.staticSet.keyProp] as string
            )
        );
        let outOfOrder = false;
        for (let i = 0; i < boundingKeys.length; ++i) {
          const key = boundingKeys[i];
          if (!keys.has(key)) {
            const defaultObject = defaultMissingSchemaState(
              boundedSubSchema as TypeStruct,
              { [boundedStateSetWithParents.staticSet.keyProp]: key },
              stateMap
            );
            boundedSet.push(defaultObject);
            shouldRecurse = true;
            outOfOrder = true;
          }
          if (ordinalMap[key] != i) {
            if (!staticPointer.isManuallyOrdered) {
              shouldRecurse = true;
            }
            outOfOrder = true;
          }
        }
        if (!staticPointer.isManuallyOrdered && outOfOrder) {
          boundedSet.sort((a, b) => {
            const ordinalA = ordinalMap[a[boundedStateSetWithParents.staticSet.keyProp]] ?? Number.MAX_SAFE_INTEGER;
            const ordinalB = ordinalMap[b[boundedStateSetWithParents.staticSet.keyProp]] ?? Number.MAX_SAFE_INTEGER;
            return ordinalA - ordinalB;
          });
        }
      }
    }
    if (shouldRecurse) {
      await enforceBoundedSets(datasource, schemaMap, stateMap);
    }
  } catch(e) {
  }
}

export const canCopyState = async (
  datasource: DataSource,
  copyFromSchemaMap: { [key: string]: Manifest },
  copyIntoSchemaMap: { [key: string]: Manifest },
  copyInstructions: CopyInstructions
): Promise<boolean> => {
  const copyFromRootSchemaMap = (await getRootSchemaMap(datasource, copyFromSchemaMap)) ?? {};
  const copyIntoRootSchemaMap = (await getRootSchemaMap(datasource, copyIntoSchemaMap)) ?? {};
  const copyListSchemaMap = Object.keys(copyInstructions).reduce((acc, pluginName) => {
    return {
      ...acc,
      [pluginName]: copyFromRootSchemaMap[pluginName]
    }
  }, {});
  return objectIsSubsetOfObject(copyListSchemaMap, copyIntoRootSchemaMap);
}

export const copyState = async (
  datasource: DataSource,
  copyFromSchemaMap: { [key: string]: Manifest },
  copyFromStateMap: { [key: string]: object },
  copyIntoSchemaMap: { [key: string]: Manifest },
  copyIntoStateMap: { [key: string]: object },
  copyInstructions: CopyInstructions
) => {
  const canCopy = await canCopyState(
    datasource,
    copyFromSchemaMap,
    copyIntoSchemaMap,
    copyInstructions
  )
  if (!canCopy) {
    return null;
  }

  const copyFromManifestList = Object.keys(copyFromSchemaMap).map(
    (pluginName) => copyFromSchemaMap[pluginName]
  );

  const topSortedCopyFromManifests = topSortManifests(copyFromManifestList);
  const pluginOrdinalMap: {[pluginName: string]: number} = topSortedCopyFromManifests.reduce((acc, manifest, index) => {
    return {
      ...acc,
      [manifest.name]: index
    };
  }, {});
  // need to mutate copyIntoStateMap
  for (const copyFromManifest of topSortedCopyFromManifests) {
    if (!copyInstructions[copyFromManifest.name]) {
      continue;
    }
    const [, ...fromKvs] = await getKVStateForPlugin(
      datasource,
      copyFromSchemaMap,
      copyFromManifest.name,
      copyFromStateMap
    );
    const [intoTop, ...intoKvs] = await getKVStateForPlugin(
      datasource,
      copyIntoSchemaMap,
      copyFromManifest.name,
      copyIntoStateMap
    );
    const intoKvsSet = new Set(intoKvs.map(kv => kv.key));
    const copyInstructionsForPlugin = copyInstructions[copyFromManifest.name];
    if ( copyInstructionsForPlugin.isManualCopy) {
      for (const key of copyInstructionsForPlugin.manualCopyList) {
        const [pluginName, ...decodedPath] = decodeSchemaPath(key);
        const path = [];
        for (let i = 0; i < decodedPath.length; ++i) {
          path.push(decodedPath[i]);
          if (typeof decodedPath[i] != "string") {
            const setPath = `${pluginName}.${writePathString([...path])}`;
            if (copyInstructionsForPlugin.manualCopyList.includes(setPath)) {
              continue;
            }
            if (!intoKvsSet.has(setPath)) {
              const kv = fromKvs.find(kv => kv.key == setPath);
              intoKvs.unshift(kv)
            }
          }
        }
      }
      const state = getStateFromKVForPlugin(
        copyIntoSchemaMap,
        [intoTop, ...intoKvs],
        copyFromManifest.name
      );
      copyIntoStateMap[copyFromManifest.name] = state;
    }
  }

  for (const copyFromManifest of topSortedCopyFromManifests) {
    if (!copyInstructions[copyFromManifest.name]) {
      continue;
    }
    const copyInstructionsForPlugin = copyInstructions[copyFromManifest.name];
    if (copyInstructionsForPlugin.isManualCopy) {
      // we need this to cascade
      const copyGroups = groupCopyKeyRefs(copyInstructionsForPlugin.manualCopyList, pluginOrdinalMap);
      await copySetsFromCopyFromOntoCopyInto(
        datasource,
        copyFromSchemaMap,
        copyFromStateMap,
        copyIntoSchemaMap,
        copyIntoStateMap,
        pluginOrdinalMap,
        copyGroups,
        copyInstructionsForPlugin.copyPriority,
        copyInstructionsForPlugin.referencePriority
      );
    } else {
      // get all top level sets
      // need to build reference map and discover top level schemas.
      const [, ...kvs] = await getKVStateForPlugin(
        datasource,
        copyFromSchemaMap,
        copyFromManifest.name,
        copyFromStateMap
      );
      const keys = kvs.filter(kv => {
        const keyPath = decodeSchemaPath(kv.key)
        const lastPart = keyPath[keyPath.length - 1];
        if (typeof lastPart == "string") {
          return false;
        }
        return lastPart.key != "(id)";
      }).map(kv => kv.key);
      const copyGroups = groupCopyKeyRefs(keys, pluginOrdinalMap);
      await copySetsFromCopyFromOntoCopyInto(
        datasource,
        copyFromSchemaMap,
        copyFromStateMap,
        copyIntoSchemaMap,
        copyIntoStateMap,
        pluginOrdinalMap,
        copyGroups,
        copyInstructionsForPlugin.copyPriority,
        copyInstructionsForPlugin.referencePriority
      );
    }
  }
  return copyIntoStateMap;
}


const copySetsFromCopyFromOntoCopyInto = async (
  datasource: DataSource,
  copyFromSchemaMap: { [key: string]: Manifest },
  copyFromStateMap: { [key: string]: object },
  copyIntoSchemaMap: { [key: string]: Manifest },
  copyIntoStateMap: { [key: string]: object },
  pluginOrdinalMap: { [pluginName: string]: number },
  copyGroup: CopyGroup,
  priority: "yours" | "theirs",
  referencePriority: "yours" | "theirs"
) => {
  const beforeCopyIntoStateMapString = JSON.stringify(copyIntoStateMap);

  // mutate copyIntoStateMap
  const copyFromRootSchemaMap =
    (await getRootSchemaMap(datasource, copyFromSchemaMap)) ?? {};
  const copyIntoRootSchemaMap =
    (await getRootSchemaMap(datasource, copyIntoSchemaMap)) ?? {};

  const copyFromStaticSetPaths = traverseSchemaMapForStaticSetPaths(
    copyFromRootSchemaMap,
    copyFromRootSchemaMap
  );
  const copyIntoStaticSetPaths = traverseSchemaMapForStaticSetPaths(
    copyIntoRootSchemaMap,
    copyIntoRootSchemaMap
  );

  const copyFromReferences = compileStateRefs(
    copyFromStaticSetPaths,
    copyFromStateMap
  );
  let copyIntoReferences = compileStateRefs(
    copyIntoStaticSetPaths,
    copyIntoStateMap
  );

  for (const pluginName in copyGroup) {
    const keysToTraverse = Object.keys(copyGroup[pluginName].sets).sort(
      (a, b) => (a.length >= b.length ? 1 : -1)
    );
    for (const parentSetPath of keysToTraverse) {
      const referenceKeys = copyGroup[pluginName].sets[parentSetPath];
      const [, ...decodedParentPath] = decodeSchemaPath(parentSetPath);
      const parentPath = [pluginName, ...decodedParentPath];
      const copyFromParentSet = accessSetInReferenceMap(
        copyFromReferences,
        parentPath
      );
      const copyIntoParentSet = accessSetInReferenceMap(
        copyIntoReferences,
        parentPath
      );
      const setKey = (decodeSchemaPath(referenceKeys[0]).pop() as DiffElement)
        .key;
      const copyParentSetFromValues = copyFromParentSet ?? copyIntoParentSet;

      const copyFromKV = Object.keys(copyParentSetFromValues.values).map(
        (key) => {
          return {
            key: `${parentSetPath}.${setKey}<${key}>`,
            value: copyParentSetFromValues.values[key],
          };
        }
      );

      const copyParentSetIntoValues = copyIntoParentSet ?? copyFromParentSet;
      const copyIntoKV = Object.keys(copyParentSetIntoValues.values).map(
        (key) => {
          return {
            key: `${parentSetPath}.${setKey}<${key}>`,
            value: copyParentSetIntoValues.values[key],
          };
        }
      );
      const copiedKV = copyKV<{ instance: object }>(
        copyFromKV,
        copyIntoKV,
        referenceKeys,
        priority
      );
      const parentReplacement = copiedKV
        ?.filter((v) => !!v?.value?.instance)
        .map((v) => {
          return v.value.instance;
        });
      copyParentSetIntoValues.parent.splice(
        0,
        copyParentSetIntoValues?.parent?.length ?? 0
      );
      copyParentSetIntoValues.parent.push(...parentReplacement);

      copyIntoReferences = compileStateRefs(copyIntoStaticSetPaths, copyIntoStateMap);
      const subSchema = getSchemaAtPath(copyIntoRootSchemaMap[pluginName], referenceKeys[0]);
      const subRefs = copiedKV.filter(v => {
        return referenceKeys.includes(v.key)
      })?.filter(v => !!v?.value?.instance).map(v => v.value.instance)?.flatMap(subState => {
        return collectRefsInStateMap(subSchema as TypeStruct, subState);
      });

      const referenceCopyGroups = groupCopyKeyRefs(subRefs, pluginOrdinalMap);
      await copySetsFromCopyFromOntoCopyInto(
        datasource,
        copyFromSchemaMap,
        copyFromStateMap,
        copyIntoSchemaMap,
        copyIntoStateMap,
        pluginOrdinalMap,
        referenceCopyGroups,
        referencePriority,
        referencePriority
      );
    }
  }

  const afterCopyIntoStateMapString = JSON.stringify(copyIntoStateMap);
  // this is janky but the only real way to gaurantee the copy has recursively carried
  // over all copied pointers
  if (afterCopyIntoStateMapString != beforeCopyIntoStateMapString) {
    await copySetsFromCopyFromOntoCopyInto(
      datasource,
      copyFromSchemaMap,
      copyFromStateMap,
      copyIntoSchemaMap,
      copyIntoStateMap,
      pluginOrdinalMap,
      copyGroup,
      priority,
      referencePriority
    );
  }
  return copyIntoStateMap;
};

interface CopyGroup {
  [pluginName: string]: {
    pluginName: string;
    sets: {
      [parentPath: string]: Array<string>;
    };
  };
}

const groupCopyKeyRefs = (
  referenceKeys: Array<string>,
  pluginOrdinalMap: {[pluginName: string]: number}
): CopyGroup => {
  const keyPaths = referenceKeys.map(decodeSchemaPath).sort((a, b) => {
    if (a[0] == b[0]) {
      if (a.length == b.length) {
        return 0;
      }
      return a.length > b.length ? -1 : 1;
    }

    const aPluginName = /^\$\((.+)\)$/.exec(
      a[0] as string
    )?.[1];
    const bPluginName = /^\$\((.+)\)$/.exec(
      b[0] as string
    )?.[1];
    return pluginOrdinalMap[aPluginName] > pluginOrdinalMap[bPluginName] ? 1 : -1;
  });

  return keyPaths.reduce((acc, path) => {
    const keyPath = writePathString(path);
    const parentPath = writePathString(path.slice(0, -1));
    const pluginName = /^\$\((.+)\)$/.exec(
      parentPath.split(".")[0] as string
    )?.[1];
    const pluginSets = acc?.[pluginName] ?? {
      pluginName,
      sets: {},
    };
    const values = pluginSets?.sets?.[parentPath] ?? [];
    values.push(keyPath);
    pluginSets.sets[parentPath] = values;
    return {
      ...acc,
      [pluginName]: pluginSets,
    };
  }, {});
};

export const reIndexSchemaArrays = (kvs: Array<DiffElement>): Array<string> => {
  const out: Array<string> = [];
  const indexMap: {[path: string]: number} = {};
  for (const { key } of kvs) {
    const decodedPath = decodeSchemaPath(key);
    const parts: Array<string|DiffElement> = [];
    const indexStack: Array<number> = [];
    for (const [index, part] of decodedPath.entries()) {
      const isLast = index == decodedPath.length - 1;
      if (typeof part == "object" && part.key == "(id)") {
        const parentPathString = writePathString(parts);
        if (isLast) {
          if (!indexMap?.hasOwnProperty(parentPathString)) {
            indexMap[parentPathString] = 0;
          } else {
            indexMap[parentPathString]++;
          }
        }
        indexStack.push(indexMap[parentPathString])
      }
      parts.push(part);
    }
    let pathIdx = 0;
    const pathWithNumbers = decodedPath.map((part) => {
      if (typeof part == "object" && part.key == "(id)") {
        return indexStack[pathIdx++];
      }
      return part;
    });
    const arrayPath = writePathStringWithArrays(pathWithNumbers);
    out.push(arrayPath);
  }
  return out;
};

const mutateStateMapWithMissingFileRefs = async (
  datasource: DataSource,
  typestruct: TypeStruct,
  state: object
): Promise<void> => {
  for (const prop in typestruct) {
    if (
      (typestruct[prop]?.type == "set" || typestruct[prop]?.type == "array") &&
      typeof typestruct[prop].values == "object"
    ) {
      await Promise.all((state[prop] as Array<object>)?.map?.(async (element) => {
        await mutateStateMapWithMissingFileRefs(datasource, typestruct[prop].values as TypeStruct, element);
      }) ?? [])
      continue;
    }

    if (
      (typestruct[prop]?.type == "set" || typestruct[prop]?.type == "array") &&
      typestruct[prop].values == "file"
    ) {
      const files = await Promise.all((state[prop] as Array<string>)?.map?.(async (file) => {
        if (file && await datasource.checkBinary(file)) {
          return file;
        }
        return null;
      }) ?? []);
      state[prop] = files.filter(v => v != null);
      continue;
    }

    if (
      !typestruct[prop]?.type &&
      typeof typestruct[prop] == "object"
    ) {
      await mutateStateMapWithMissingFileRefs(datasource, typestruct[prop] as TypeStruct, state[prop]);
      continue;
    }

    if (typestruct[prop]?.type == "file") {
      const exists = !!state[prop] ? await datasource.checkBinary(state[prop]) : null;
      if (!exists && !!state[prop]) {
        state[prop] = null;
      }
      continue;
    }
  }
}

// WARNING: MUTATES!
// this has to be really fast because it is run on
// every update.
export const nullifyMissingFileRefs = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object },
): Promise<{ [key: string]: object }> => {
  const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  const promises = []
  for (const pluginName in rootSchemaMap) {
    const typestruct = rootSchemaMap[pluginName] as TypeStruct;
    promises.push(mutateStateMapWithMissingFileRefs(
      datasource,
      typestruct,
      stateMap[pluginName]
    ));
  }
  await Promise.all(promises);
  return stateMap;
}

const collectFileRefsInStateMap = (
  typestruct: TypeStruct,
  state: object
): Array<string> => {
  const refs = [];
  for (const prop in typestruct) {
    if (
      (typestruct[prop]?.type == "set" || typestruct[prop]?.type == "array") &&
      typeof typestruct[prop].values == "object"
    ) {
      const subRefs = (state[prop] as Array<object>)?.flatMap?.((element) => {
        return collectFileRefsInStateMap(typestruct[prop].values as TypeStruct, element);
      }) ?? [];
      refs.push(...subRefs)
      continue;
    }

    if (
      (typestruct[prop]?.type == "set" || typestruct[prop]?.type == "array") &&
      typestruct[prop].values == "file"
    ) {
      const files = (state[prop] as Array<string>)?.filter?.((file) => {
        if (file) {
          return true;
        }
        return false;
      });
      refs.push(...files);
      continue;
    }

    if (
      !typestruct[prop]?.type &&
      typeof typestruct[prop] == "object"
    ) {
      const subRefs = collectFileRefsInStateMap(typestruct[prop] as TypeStruct, state[prop]);
      refs.push(...subRefs)
      continue;
    }

    if (typestruct[prop]?.type == "file") {
      if (!!state[prop]) {
        refs.push(state[prop]);
      }
      continue;
    }
  }
  return refs;
}

export const collectFileRefs = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  stateMap: { [key: string]: object },
): Promise<Array<string>> => {
  const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  const fileRefs = []
  for (const pluginName in rootSchemaMap) {
    const typestruct = rootSchemaMap[pluginName] as TypeStruct;
    fileRefs.push(...collectFileRefsInStateMap(typestruct, stateMap[pluginName]))
  }
  const visited = new Set();
  const out = [];
  for (const file of fileRefs) {
    if (!visited.has(file)) {
      out.push(file);
      visited.add(file);
    }
  }
  return out.sort();
}

const collectRefsInStateMap = (
  typestruct: TypeStruct,
  state: object
): Array<string> => {
  const refs = [];
  for (const prop in typestruct) {
    if (
      (typestruct[prop]?.type == "set" || typestruct[prop]?.type == "array") &&
      typeof typestruct[prop].values == "object"
    ) {
      const subRefs = (state[prop] as Array<object>)?.flatMap?.((element) => {
        return collectRefsInStateMap(typestruct[prop].values as TypeStruct, element);
      }) ?? [];
      refs.push(...subRefs)
      continue;
    }

    if (
      !typestruct[prop]?.type &&
      typeof typestruct[prop] == "object"
    ) {
      const subRefs = collectRefsInStateMap(typestruct[prop] as TypeStruct, state[prop]);
      refs.push(...subRefs)
      continue;
    }

    if (typestruct[prop]?.type == "ref") {
      if (!!state[prop]) {
        refs.push(state[prop]);
      }
      continue;
    }
  }
  return refs;
}

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

export const getInvalidRootStates = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  kvs: Array<DiffElement>,
  pluginName: string
) => {
  const out = [];
  const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  const { key, value } = kvs?.[0] ?? {};
  if (!key) {
    return out;
  }
  const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);

  for (const prop in subSchema) {
    if (subSchema[prop]?.type == "array" || subSchema[prop]?.type == "set") {
      if (subSchema[prop]?.emptyable === false) {
        let containsList = false;
        for (let j  = 1; j < kvs.length; ++j) {
          const { key: nextKey } = kvs[j];
          if (nextKey.startsWith(key + "." + prop)) {
            containsList = true;
            break;
          }
          if (!nextKey.startsWith(key)) {
            break;
          }
        }
        if (!containsList) {
          out.push(key + "." + prop);
        }
      }
      continue;
    }
    if (
      subSchema[prop]?.type &&
      (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
      (value[prop] == null ||
        ((subSchema[prop]?.type == "string" ||
          subSchema[prop]?.type == "file") &&
          value[prop] == ""))
    ) {
      out.push(key + "." + prop);
      continue;
    }

    if (subSchema[prop]?.type == "file") {
      const exists = await datasource.checkBinary(value[prop]);
      if (!exists) {
        out.push(key + "." + prop);
        continue;
      }
    }
  }
  return out;
}

export const getPluginInvalidStateIndices = async (
  datasource: DataSource,
  schemaMap: { [key: string]: Manifest },
  kvs: Array<DiffElement>,
  pluginName: string
): Promise<Array<number>> => {
  const out = [];
  const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
  for (let i = 1; i < kvs.length; ++i) {
    const { key, value } = kvs[i]
    const subSchema = getSchemaAtPath(rootSchemaMap[pluginName], key);
    for (const prop in subSchema) {
      if (subSchema[prop]?.type == "array" || subSchema[prop]?.type == "set") {
        if (subSchema[prop]?.emptyable === false) {
          let containsList = false;
          for (let j  = i + 1; j < kvs.length; ++j) {
            const { key: nextKey } = kvs[j];
            if (nextKey.startsWith(key + "." + prop)) {
              containsList = true;
              break;
            }
            if (!nextKey.startsWith(key)) {
              break;
            }
          }
          if (!containsList) {
            out.push(i);
          }
        }
        continue;
      }
      if (
        subSchema[prop]?.type &&
        (!subSchema[prop]?.nullable || subSchema[prop]?.isKey) &&
        (value[prop] == null ||
          ((subSchema[prop]?.type == "string" ||
            subSchema[prop]?.type == "file") &&
            value[prop] == ""))
      ) {
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
  nextSchemaMap: { [key: string]: Manifest },
  disableDownloads = false
): Promise<boolean> => {
  const oldRootSchema = await getRootSchemaMap(datasource, currentSchemaMap, disableDownloads);
  const nextRootSchema = await getRootSchemaMap(datasource, nextSchemaMap, disableDownloads);

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
    (
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
      }) ?? [];
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
        if (subSchema[prop]?.emptyable === false) {
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
        (value[prop] == null ||
          ((subSchema[prop]?.type == "string" ||
            subSchema[prop]?.type == "file") &&
            value[prop] == ""))
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
  isBoundedSet = false,
  isManuallyOrdered = false,
  path: Array<string> = []
): SchemaValidationResponse => {
  try {
    let keyCount = 0;
    let boundedRefProp = null;
    const sets: Array<string> = [];
    const arrays: Array<string> = [];
    const nestedStructures: Array<string> = [];
    const refs: Array<string> = [];
    const formatValues = isDirectParentArray || isDirectParentSet ? ["values"] : [];
    for (const prop in typeStruct) {
      if (
        typeof typeStruct[prop] == "object"
      ) {
        const [root, ...rest] = path;
        const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");

        if (isBoundedSet && typeStruct?.[prop]?.isKey) {
          boundedRefProp = prop;
        }
        if (!isBoundedSet && isManuallyOrdered) {

          return {
            status: "error",
            message: `Invalid use of manualOrdering on '${prop}'. manualOrdering can only be used on bounded sets. Found at '${formattedPath}'.`,
          };
        }
        if (typeStruct[prop].hasOwnProperty("default")) {
          let okay = false
          if (typeof typeStruct[prop]?.default == "object" && Object.keys(typeStruct[prop]?.default).length == 0) {
            return {
              status: "error",
              message: `Invalid default value type for prop '${prop}'. Default values can not be null or undefined. Found at '${formattedPath}'.`,
            };
          }

          if (typeStruct[prop]?.type == "int") {
            if (typeof typeStruct[prop]?.default == "number" && !Number.isNaN(typeStruct[prop]?.default)) {
              if (Math.round(typeStruct[prop]?.default as number) == typeStruct[prop]?.default as number) {
                okay = true;
              }
            }
          }

          if (typeStruct[prop]?.type == "float") {
            if (typeof typeStruct[prop]?.default == "number" && !Number.isNaN(typeStruct[prop]?.default)) {
              okay = true;
            }
          }

          if (typeStruct[prop]?.type == "boolean") {
            if (typeof typeStruct[prop]?.default == "boolean") {
              okay = true;
            }
          }

          if (typeStruct[prop]?.type == "string") {
            if (typeof typeStruct[prop]?.default == "string") {
              okay = true;
            }
          }

          if (typeStruct[prop]?.type == "ref") {
            const staticPath = replaceRefVarsWithValues(typeStruct[prop].default as string);
            if ((typeStruct[prop]?.refType as string)?.startsWith("$")) {
              if (staticPath != typeStruct[prop]?.refType) {
                return {
                  status: "error",
                  message: `Invalid pointer default type for prop '${prop}'. Found at '${formattedPath}'.`,
                };
              }
              okay = true;
            } else {
              const referencedType = expandedTypes[typeStruct[prop].refType as string];
              if (!referencedType) {
                const [root, ...rest] = path;
                const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
                return {
                  status: "error",
                  message: `Invalid default referenced pointer type '${typeStruct[prop].refType}'. No reference type found for reference at '${formattedPath}'.`,
                };
              }
              const pluginName =
                /^\$\((.+)\)$/.exec(
                  staticPath.split(".")[0] as string
                )?.[1];

              const staticSchema = getStaticSchemaAtPath(
                rootSchemaMap[pluginName],
                staticPath
              );
              if (!staticSchema) {
                const [root, ...rest] = path;
                const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
                return {
                  status: "error",
                  message: `Invalid default referenced pointer type '${typeStruct[prop].refType}'. No reference found for reference at '${formattedPath}'.`,
                };
              }
              if (!typestructsAreEquivalent(staticSchema, referencedType)) {
                return {
                  status: "error",
                  message: `Invalid default referenced pointer type '${typeStruct[prop].refType}'. Corresponding pointer type does not match, found at '${formattedPath}'.`,
                };
              }
              okay = true;
            }
          }

          if (typeStruct[prop]?.type == "set" || typeStruct[prop]?.type == "array") {
            okay = true;
            if (!Array.isArray(typeStruct[prop].default)) {
              return {
                status: "error",
                message: `Invalid default value type for prop '${prop}'. Default value must be a list. Found at '${formattedPath}'.`,
              };
            }
            for (let element of typeStruct[prop].default as Array<unknown>) {
              if (element === null || element === undefined) {
                return {
                  status: "error",
                  message: `Invalid default value type for prop '${prop}'. Default value elements can not be null or undefined. Found at '${formattedPath}'.`,
                };
              }
              if (typeStruct[prop]?.values == "int") {
                if (typeof element != "number" || Number.isNaN(element)) {
                  if (typeStruct[prop]?.type == "set") {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default set of '${prop}'. Not an int. Found at '${formattedPath}'.`,
                    };
                  } else {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default array of '${prop}'. Not an int. Found at '${formattedPath}'.`,
                    };
                  }
                }
                if (Math.round(element as number) != element as number) {
                  if (typeStruct[prop]?.type == "set") {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default set of '${prop}'. Not an int. Found at '${formattedPath}'.`,
                    };
                  } else {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default array of '${prop}'. Not an int. Found at '${formattedPath}'.`,
                    };
                  }
                }
                continue;
              }

              if (typeStruct[prop]?.values == "float") {
                if (typeof element != "number" || Number.isNaN(element)) {
                  if (typeStruct[prop]?.type == "set") {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default set of '${prop}'. Not a float. Found at '${formattedPath}'.`,
                    };
                  } else {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default array of '${prop}'. Not a float. Found at '${formattedPath}'.`,
                    };
                  }
                }
                continue;
              }

              if (typeStruct[prop]?.values == "boolean") {
                if (typeof element != "boolean") {
                  if (typeStruct[prop]?.type == "set") {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default set of '${prop}'. Not a boolean. Found at '${formattedPath}'.`,
                    };
                  } else {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default array of '${prop}'. Not a boolean. Found at '${formattedPath}'.`,
                    };
                  }
                }
                continue;
              }

              if (typeStruct[prop]?.values == "string") {
                if (typeof element != "string") {
                  if (typeStruct[prop]?.type == "set") {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default set of '${prop}'. Not a string. Found at '${formattedPath}'.`,
                    };
                  } else {
                    return {
                      status: "error",
                      message: `Invalid default value type for element in default array of '${prop}'. Not a string. Found at '${formattedPath}'.`,
                    };
                  }
                }
                continue;
              }
              if (typeStruct[prop]?.type == "set") {
                  return {
                    status: "error",
                    message: `Invalid default value type for element in default set of '${prop}'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '${formattedPath}'.`,
                  };

              } else {
                  return {
                    status: "error",
                    message: `Invalid default value type for element in default array of '${prop}'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '${formattedPath}'.`,
                  };
              }
            }
            okay = true;
          }
          if (!okay) {
            return {
              status: "error",
              message: `Invalid default value type for prop '${prop}'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '${formattedPath}'.`,
            };
          }
        }

      }
      if (
        typeof typeStruct[prop] == "object" &&
        Object.keys(typeStruct[prop]).length == 0
      ) {
        const [root, ...rest] = path;
        const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
        const schemaMapValue = getSchemaAtPath?.(
          schemaMap[root].store,
          writePathString([`$(${root})`, ...rest, ...formatValues])
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
          const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
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
          const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
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
        const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
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
        const formattedPath = [`$(${root})`, ...rest, ...formatValues, prop].join(".");
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

    if (isBoundedSet) {
      const [root, ...rest] = path;
      const formattedPath = [`$(${root})`, ...rest].join(".");
      if (!boundedRefProp || !refs.includes(boundedRefProp)) {
        return {
          status: "error",
          message: `A bounded set's key prop must be a constrained reference type. No key reference type found at '${formattedPath}.values'.`,
        };
      }

      for (let refProp of refs) {
        if (refProp == boundedRefProp) {
          continue;
        }
        const refValue = typeStruct[refProp];
        if (refValue?.onDelete != "nullify") {
          return {
            status: "error",
            message: `A bounded set's refs, aside from the primary key, must nullify on delete. Please add onDelete='nullify' to '${formattedPath}.values.${refProp}'.`,
          };
        }
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
        const isBoundedRef = boundedRefProp && refProp == boundedRefProp;
        const refStruct = typeStruct[refProp] as ManifestNode;
        if (refStruct?.refType?.startsWith("$")) {
          // constrained refs
          const [root, ...rest] = path;
          const pluginName =
            /^\$\((.+)\)$/.exec(
              refStruct?.refType.split(".")[0] as string
            )?.[1] ?? (refStruct?.refType.split(".")[0] == "$" ? root : null);
          if (!pluginName) {
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
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
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
            return {
              status: "error",
              message: `Invalid reference pointer '${refStruct.refType}'. No reference value found for value at '${formattedPath}'.`,
            };
          }
          if (refStruct.isKey && refStruct === referencedType[refProp]) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
            return {
              status: "error",
              message: `Invalid reference pointer '${refStruct.refType}'. Keys that are constrained ref types cannot be schematically self-referential. Found at '${formattedPath}'.`,
            };
          }
          if (refStruct?.isKey) {
            const [root, ...rest] = path;
            const currentPath = [`$(${root})`, ...rest, ...formatValues].join(".");
            if (refStruct?.refType?.startsWith(currentPath)) {
              const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
              return {
                status: "error",
                message: `Invalid reference pointer '${refStruct.refType}'. Keys that are constrained ref types cannot point to nested values. Found at '${formattedPath}'.`,
              };
            }
          }
          if (isBoundedRef) {
            const pathParts = decodeSchemaPath(refStruct?.refType);
            const valuesCount = pathParts.reduce((a, p) => a + (p == "values" ? 1 : 0), 0);
            if (valuesCount != 1) {
              const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
              return {
                status: "error",
                message: `Invalid reference pointer '${refStruct.refType}'. Sets that are bounded cannot point to nested values. Found at '${formattedPath}'.`,
              };
            }
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
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
            return {
              status: "error",
              message: `Invalid reference constrainted pointer '${refStruct.refType}'. Constrained references must point directly at the values of a set. Found at '${formattedPath}'.`,
            };
          }
        } else {
          //unconstrained refs
          if (isBoundedRef) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
            return {
              status: "error",
              message: `Invalid bounded set unconstrainted reference key '${refStruct.refType}'. Unconstrained references cannot be keys of a bounded set. Found at '${formattedPath}'.`,
            };
          }
          const referencedType = expandedTypes[refStruct.refType as string];
          if (!referencedType) {
            const [root, ...rest] = path;
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
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
            const formattedPath = [`$(${root})`, ...rest, ...formatValues, refProp].join(".");
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
          false,
          false,
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
          false,
          false,
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
        const isBounded: boolean = !!typeStruct?.[setProp].bounded;
        const isManuallyOrdered: boolean = isBounded && !!typeStruct?.[setProp].manualOrdering;
        return isSchemaValid(
          typeStruct[setProp].values as TypeStruct,
          schemaMap,
          rootSchemaMap,
          expandedTypes,
          true,
          false,
          isArrayDescendent,
          isBounded,
          isManuallyOrdered,
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
    const formatValues = isDirectParentArray || isDirectParentSet ? ["values"] : [];
    const formattedPath = [`$(${root})`, ...rest, ...formatValues].join(".");
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
    if (rootSchema[prop] === undefined) {
      const formattedPath = [...path, prop].join(".");
      if ((typeStruct?.type as unknown as string == "set" || (typeStruct?.type as unknown as string) == "array") && prop == "value") {
        return {
          status: "error",
          message: `Invalid prop in schema. change 'value' to 'values' for '${path.join(".")}'. Found at '${formattedPath}'.`,
        };
      }
      const outObj = typeof typeStruct[prop] == "object" ? JSON.stringify(typeStruct[prop], null, 2) : typeStruct[prop];
      return {
        status: "error",
        message: `Invalid prop in schema. Remove or change '${prop}=${outObj}' from '${path.join(".")}'. Found at '${formattedPath}'.`,
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
  const sets: Array<string> = [];
  const objects: Array<string> = [];
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
      sets.push(prop);
      continue;
    }
    if (!typeStruct[prop]?.type && typeof typeStruct[prop] == "object") {
      objects.push(prop);
      continue;
    }
  }
  for (const prop of sets) {
    out.push(
      ...collectKeyRefs(typeStruct[prop].values as TypeStruct, [
        ...path,
        path.length == 0 ? `$(${prop})` : prop,
      ])
    );
  }
  for (const prop of objects) {
    out.push(
      ...collectKeyRefs(typeStruct[prop] as TypeStruct, [
        ...path,
        path.length == 0 ? `$(${prop})` : prop,
      ])
    );
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
    Object.keys(typestructA ?? {}).filter(v => v != '(id)').length !=
    Object.keys(typestructB ?? {}).filter(v => v != '(id)').length
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
      const areEquivalent = typestructsAreEquivalent(
        expandedTypesWithRefs[type],
        staticSchema
      );
      return areEquivalent;
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
        if (arg.value == "file") {
          return ["FileRef"]
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

interface DiffableElement {
  type: 'array-index'|'set-key';
  key?: string;
  args?: Array<string>;
}

export const getDiffablesList = (
  rootSchemaMap: { [key: string]: TypeStruct },
  pointerArgsMap: { [key: string]: Array<string> },
  includePartialPaths: boolean = false
) => {
  let out = [];
  for (let pluginName in rootSchemaMap) {
    const result = getDiffablesListForTypestruct(
      rootSchemaMap,
      pointerArgsMap,
      rootSchemaMap[pluginName],
      includePartialPaths,
      [pluginName]
    )
    out.push(...result);
  }
  return out.sort((a, b) => {
    return b.length - a.length;
  });
}

export const getDiffablesListForTypestruct = (
  rootSchemaMap: { [key: string]: TypeStruct },
  pointerArgsMap: { [key: string]: Array<string> },
  typestruct: TypeStruct,
  includePartialPaths: boolean,
  path: Array<string|DiffableElement> = []
): Array<string|DiffableElement> => {
  let out = [];
  for (const prop in typestruct) {
    if (
      (typestruct[prop]?.type == "set" || typestruct[prop]?.type == "array") &&
      typeof typestruct[prop]?.values == "object"
    ) {
      if (includePartialPaths) {
        out.push([...path, prop])
      }
      if (typestruct[prop]?.type == "set") {

        let keyProp: string;
        for (const subProp in typestruct[prop]?.values as TypeStruct) {
          if (typestruct[prop]?.values[subProp]?.isKey) {
            keyProp = subProp;
            break;
          }
        }

        if (typestruct[prop]?.values[keyProp].type == "ref") {
          const refType = typestruct[prop]?.values[keyProp].refType;
          const args = [];
          for (let key in pointerArgsMap) {
            if (pointerArgsMap[key].includes(refType)) {
              args.push(replaceRefVarsWithWildcards(key));
            }
          }
          out.push([
              ...path,
              prop,
              {
                type: "set-key",
                key: keyProp,
                args
              },
          ])
          const subPaths = getDiffablesListForTypestruct(
              rootSchemaMap,
              pointerArgsMap,
              typestruct[prop]?.values as TypeStruct,
              includePartialPaths,
              [...path, prop, {
                type: "set-key",
                key: keyProp,
                args,
              }],
          );
          out.push(...subPaths);
          continue;
        }
        out.push([
            ...path,
            prop,
            {
              type: "set-key",
              key: keyProp,
              args: [typestruct[prop]?.values[keyProp].type]
            },
        ])
        const subPaths = getDiffablesListForTypestruct(
          rootSchemaMap,
          pointerArgsMap,
          typestruct[prop]?.values as TypeStruct,
          includePartialPaths,
          [
            ...path,
            prop,
            {
              type: "set-key",
              key: keyProp,
              args: [typestruct[prop]?.values[keyProp].type]
            },
          ]
        );
        out.push(...subPaths);
        continue;
      }
      if (typestruct[prop]?.type == "array") {
        out.push([
          ...path,
          prop,
          {
            type: "array-index",
            args: ["number"],
          },
        ]);

        const subPaths = getDiffablesListForTypestruct(
          rootSchemaMap,
          pointerArgsMap,
          typestruct[prop]?.values as TypeStruct,
          includePartialPaths,
          [
            ...path,
            prop,
            {
              type: "array-index",
              args: ["number"],
            },
          ]
        );
        out.push(...subPaths);
        continue;
      }
    }
    if (!typestruct[prop]?.type && typeof typestruct[prop] == "object") {
      out.push([
        ...path,
        prop
      ]);
      const subPaths = getDiffablesListForTypestruct(
          rootSchemaMap,
          pointerArgsMap,
          typestruct[prop] as TypeStruct,
          includePartialPaths,
          [...path, prop],
      );
      out.push(...subPaths);
      continue;
    }
  }

  return out;
}

export const drawQueryTypes = (argMap: { [key: string]: Array<Array<string>> }) => {
  let code = "export type QueryTypes = {\n";
  for (const path in argMap) {
    const wildcard = replaceRefVarsWithWildcards(path);
    const argStr = argMap[path].reduce((s, argPossibilities) => {
      if (
        argPossibilities[0] == "string" ||
        argPossibilities[0] == "FileRef" ||
        argPossibilities[0] == "boolean" ||
        argPossibilities[0] == "number"
      ) {
        return findAndReplaceWildCard(s, `<$\{${argPossibilities[0]}}>`);
      }
      const line = argPossibilities
        .map(replaceRefVarsWithWildcards)
        .map((wcq) => {
          return `QueryTypes['${wcq}']`;
        })
        .join("|");
        return findAndReplaceWildCard(s, `<$\{${line}}>`);
    }, wildcard);
    code += `  ['${wildcard}']: \`${argStr}\`;\n`;
  }
  code += "};\n";
  return code;
};

const findAndReplaceWildCard = (s: string, replacement: string) => {
  let balance = 0;
  let index = null;
  for (let i = 0; i < s.length; ++i) {
    if (i > 2 && s[i] == ">" && s[i - 1] == "?" && s[i - 2] == "<" && balance == 1) {
      index = [i -2, i]
      break;
    }
    if (s[i] == "<") {
      balance++;
    }
    if (s[i] == ">") {
      balance--;
    }
  }
  if (index) {
    const firstHalf = s.split("").slice(0, index[0]).join("");
    const secondHalf = s.split("").slice(index[1] + 1).join("");
    return firstHalf + replacement + secondHalf;
  }
  return s;
}

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

  const exportedCodes: Array<{code: string, query: string}> = [];
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
            possibleArg == "FileRef" ||
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

    const exportedCode = `export function makeQueryRef(${params}): QueryTypes['${replaceRefVarsWithWildcards(
      query
    )}'];\n`;
    exportedCodes.push({
      code: exportedCode,
      query: replaceRefVarsWithWildcards(query)
    })
  }

  code += exportedCodes.sort((a, b) => {
    return b.query.length - a.query.length;
  }).map(p => p.code).join("");
  const globalParams: Array<string> = [];
  for (let i = 0; i < globalArgs.length; ++i) {
    const args: Array<string> = globalArgs[i];
    const isOptional = i > 0;
    const argType = args
      .map((possibleArg) => {
        if (
          possibleArg == "string" ||
          possibleArg == "FileRef" ||
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
        argType[0] == "FileRef" ||
        argType[0] == "boolean" ||
        argType[0] == "number"
      ) {
        return findAndReplaceWildCard(s, `<$\{arg${i} as ${argType[0]}}>`);
      }
      return findAndReplaceWildCard(s,
        `<$\{arg${i} as ${argType
          .map(replaceRefVarsWithWildcards)
          .map((v) => `QueryTypes['${v}']`)
          .join("|")}}>`
        )
    }, `return \`${replaceRefVarsWithWildcards(query)}\`;`);
    if (args.length > 0) {
      const argCheck = args?.map((_, i) => `(arg${i} != null && arg${i} != undefined)`).join(" && ");
      code += `  if (${argCheck} && query == '${replaceRefVarsWithWildcards(query)}') {\n`;
      code += `    ${returnType}\n`;
      code += `  }\n`;
    } else {
      code += `  if (query == '${replaceRefVarsWithWildcards(query)}') {\n`;
      code += `    ${returnType}\n`;
      code += `  }\n`;
    }
  }
  code += `  return null;\n`;
  code += `};\n`;
  if (useReact) {
    code += `\n`;

    const exportedReactCodes: Array<{code: string, query: string}> = [];
    for (const query in argMap) {
      const args = argMap[query];
      const params = args.reduce((s, possibleArgs, index) => {
        const argType = possibleArgs
          .map((possibleArg) => {
            if (
              possibleArg == "string" ||
              possibleArg == "FileRef" ||
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

      const exportedCode = `export function useQueryRef(${params}): QueryTypes['${replaceRefVarsWithWildcards(
        query
      )}'];\n`;
      exportedReactCodes.push({
        code: exportedCode,
        query: replaceRefVarsWithWildcards(query)
      })
    }
    code += exportedReactCodes.sort((a, b) => {
      return b.query.length - a.query.length;
    }).map(p => p.code).join("");

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
            argType[0] == "FileRef" ||
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

const GET_EXTRACTED_QUERY_ARGS_FUNCTION = `export function extractQueryArgs(query?: string): Array<string> {
  if (!query) {
    return [];
  }
  return (
    decodeSchemaPathWithArrays(query)
      ?.filter((v) => typeof v != "string")
      ?.map((v) => (v as { key: string; value: string }).value as string) ?? []
  );
};`;

const USE_EXTRACTED_QUERY_ARGS_FUNCTION = `export function useExtractQueryArgs(query?: string): Array<string> {
  return useMemo(() => {
    if (!query) {
      return [];
    }
    return (
      decodeSchemaPathWithArrays(query)
        ?.filter((v) => typeof v != "string")
        ?.map((v) => (v as { key: string; value: string }).value as string) ?? []
    );
  }, [query]);
};`;

export const drawExtractQueryArguments = (
  argMap: { [key: string]: Array<Array<string>> },
  useReact = false
) => {
  let code = "";
  const globalArgs: Array<Array<string>> = [];
  const exportedCodes: Array<{code: string, query: string}> = [];
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

    const params = args.map((possibleArgs, index) => {
      return possibleArgs
        .map((possibleArg) => {
          if (
            possibleArg == "string" ||
            possibleArg == "FileRef" ||
            possibleArg == "boolean" ||
            possibleArg == "number"
          ) {
            return possibleArg;
          }
          return `QueryTypes['${replaceRefVarsWithWildcards(possibleArg)}']`;
        })
        .join("|");
    }).join(", ");

    const exportedCode = `export function extractQueryArgs(query?: QueryTypes['${replaceRefVarsWithWildcards(
      query
    )}']): [${params}];\n`;
    exportedCodes.push({
      code: exportedCode,
      query: replaceRefVarsWithWildcards(query)
    });
  }
  code += exportedCodes.sort((a, b) => {
    return b.query.length - a.query.length;
  }).map(p => p.code).join("");
  code += GET_EXTRACTED_QUERY_ARGS_FUNCTION;

  code += "\n\n";
  if (useReact) {
    const exportedReactCodes: Array<{code: string, query: string}> = [];
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

      const params = args.map((possibleArgs, index) => {
        return possibleArgs
          .map((possibleArg) => {
            if (
              possibleArg == "string" ||
              possibleArg == "FileRef" ||
              possibleArg == "boolean" ||
              possibleArg == "number"
            ) {
              return possibleArg;
            }
            return `QueryTypes['${replaceRefVarsWithWildcards(possibleArg)}']`;
          })
          .join("|");
      }).join(", ");

      const exportedCode = `export function useExtractQueryArgs(query?: QueryTypes['${replaceRefVarsWithWildcards(
        query
      )}']): [${params}];\n`;
      exportedReactCodes.push({
        code: exportedCode,
        query: replaceRefVarsWithWildcards(query)
      });
    }
    code += exportedReactCodes.sort((a, b) => {
      return b.query.length - a.query.length;
    }).map(p => p.code).join("");
    code += USE_EXTRACTED_QUERY_ARGS_FUNCTION;

    code += "\n\n";
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
      "  ",
      false,
      false,
      false
    );
    const wildcard = replaceRefVarsWithWildcards(path);
    code += `  ['${wildcard}']: ${typestructCode};\n`;
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
          : typeStruct[prop]?.type == "file"
          ? "FileRef"
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
          : typeStruct[prop]?.values == "file"
          ? "FileRef"
          : typeStruct[prop]?.values;
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

export const GENERATOR_HELPER_FUNCTIONS = `
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
    if (/^\\[(\\d+)\\]$/.test(part)) {
      return parseInt(((/^\\[(\\d+)\\]$/.exec(part) as Array<string>)[1]));
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
  const pluginName = /^\\$\\((.+)\\)$/.exec(pluginWrapper as string)?.[1] ?? null;
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
`;


export const drawGetPluginStore = (
  rootSchemaMap: { [key: string]: TypeStruct },
  useReact = false
): string => {
  let code = "";
  const plugins = Object.keys(rootSchemaMap);
  for (const plugin of plugins) {
    code += `export function getPluginStore(plugin: '${plugin}'): SchemaRoot['${plugin}'];\n`;
  }
  const globalPluginArgs = plugins.map((p) => `'${p}'`).join("|");
  const globalPluginReturn = plugins.map((p) => `SchemaRoot['${p}']`).join("|");
  code += `export function getPluginStore(plugin: ${globalPluginArgs}): ${globalPluginReturn} {\n`;
  code += `  const ctx = useFloroContext();\n`;
  code += `  const root = ctx.applicationState;\n`;
  code += `  if (root == null) {\n`;
  code += `    return {} as ${globalPluginReturn};\n`;
  code += `  }\n`;
  code += `  return root[plugin];\n`;
  code += `}\n`;
  if (useReact) {
    code += "\n";
    for (const plugin of plugins) {
      code += `export function usePluginStore(plugin: '${plugin}'): SchemaRoot['${plugin}'];\n`;
    }
    code += `export function usePluginStore(plugin: ${globalPluginArgs}): ${globalPluginReturn} {\n`;
    code += `  const ctx = useFloroContext();\n`;
    code += `  const root = ctx.applicationState;\n`;
    code += `  return useMemo(() => {\n`;
    code += `    if (root == null) {\n`;
    code += `      return {} as ${globalPluginReturn};\n`;
    code += `    }\n`;
    code += `    return root[plugin];\n`;
    code += `  }, [root, plugin]);\n`;
    code += `}\n\n`;
  }
  return code;
};

export const drawDiffableQueryTypes = (
  diffables: Array<Array<string|DiffableElement>>,
  includePartialPaths: boolean = false
) => {
  const diffableValue = diffables.map(diffable => {
    return `\`${renderDiffable(diffable)}\``
  }).join("|");
  if (includePartialPaths) {
    return `export type PartialDiffableQuery = ${diffableValue};`;
  }
  return `export type DiffableQuery = ${diffableValue};`;
}

export const renderDiffable = (
  diffable: Array<string|DiffableElement>
): string => {
  const [pluginName, ...res] = diffable;
  const subTypes = res.map((element: string|DiffableElement) => {
    if (typeof element == "string") {
      return element;
    }
    if (element.type == "array-index") {
      return "[${number}]";
    }
    if (
      element.args[0] == "boolean"
    ) {
      return `${element.key}<\${boolean}>`
    }
    if (
      element.args[0] == "string"
    ) {
      return `${element.key}<\${string}>`
    }
    if (
      element.args[0] == "file"
    ) {
      return `${element.key}<\${FileRef}>`
    }

    if (
      element.args[0] == "int" ||
      element.args[0] == "float"
    ) {
      return `${element.key}<\${number}>`
    }

    const refs = element.args.map(element => {
      return `QueryTypes['${element}']`;
    })
    return `${element.key}<\${${refs.join("|")}}>`
  });
  return [`$(${pluginName})`, ...subTypes].join(".");
}

export const renderDiffableToWildcard = (
  diffable: Array<string|DiffableElement>
): string => {
  const [pluginName, ...res] = diffable;
  const subTypes = res.map((element: string|DiffableElement) => {
    if (typeof element == "string") {
      return element;
    }
    if (element.type == "array-index") {
      return "[?]";
    }
    if (
      element.args[0] == "boolean"
    ) {
      return `${element.key}<?>`
    }
    if (
      element.args[0] == "string"
    ) {
      return `${element.key}<?>`
    }
    if (
      element.args[0] == "file"
    ) {
      return `${element.key}<?>`
    }

    if (
      element.args[0] == "int" ||
      element.args[0] == "float"
    ) {
      return `${element.key}<?>`
    }

    return `${element.key}<?>`
  });
  return [`$(${pluginName})`, ...subTypes].join(".");
}

export const renderDiffableToSchematicPath = (
  diffable: Array<string|DiffableElement>
): string => {
  const [pluginName, ...res] = diffable;
  const subTypes = res.map((element: string|DiffableElement) => {
    if (typeof element == "string") {
      return element;
    }
    return "values";
  });
  return [`$(${pluginName})`, ...subTypes].join(".");
}

export const drawSchematicTypes = (
  partialDiffables: Array<Array<string|DiffableElement>>,
  rootStruct: TypeStruct,
  referenceReturnTypeMap: { [key: string]: Array<string> },
) => {

  let code = "export type SchemaTypes = {\n";
  for (const pd of partialDiffables) {
    const wildcardPath = renderDiffableToWildcard(pd);
    const schemaPath = renderDiffableToSchematicPath(pd);
    const subSchema = getObjectInStateMap(rootStruct, schemaPath) as ManifestNode|TypeStruct;
    if (subSchema?.type == "set" || subSchema?.type == "array") {
      const typeStruct = `Array<${drawTypestruct(subSchema?.values as TypeStruct, referenceReturnTypeMap, "  ", false, false, false)}>`;
      code += `  ['${wildcardPath}']: ${typeStruct};\n`;
    } else {
      const typeStruct = drawTypestruct(subSchema as TypeStruct, referenceReturnTypeMap, "  ", false, false, false);
      code += `  ['${wildcardPath}']: ${typeStruct};\n`;
    }
  }
  code += "};\n";
  return code;
}
export const drawPointerTypes = (
  partialDiffables: Array<Array<string|DiffableElement>>,
) => {

  let code = "export type PointerTypes = {\n";
  for (const pd of partialDiffables) {
    const wildcardPath = renderDiffableToWildcard(pd);
    const pointerPath = renderDiffable(pd);
    code += `  ['${wildcardPath}']: \`${pointerPath}\`;\n`;
  }
  code += "};\n";
  return code;
}
export const drawDiffableReturnTypes = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  const diffableValue = diffables.map(diffable => {
    return `SchemaTypes['${renderDiffableToWildcard(diffable)}']`
  }).join("|");
  return `export type DiffableReturnTypes = ${diffableValue};`;
}

export const drawProviderApiCode_ = async (): Promise<string> => {
  return await fs.promises.readFile(
    path.join(__dirname, "..", "..", "templates", "GENERATED_PROVIDER_CODE_FUNCTIONS.txt"),
    "utf-8"
  );
};

export const drawProviderApiCode = () => `
type ValueOf<T> = T[keyof T];

interface Packet {
  id: number;
  chunk: string;
  index: number;
  totalPackets: number;
  pluginName: string;
}

interface PluginState {
  commandMode: "view" | "edit" | "compare";
  compareFrom: "none" | "before" | "after";
  themeName: "light" | "dark";
  applicationState: SchemaRoot | null;
  apiStoreInvalidity: { [key: string]: Array<string> };
  conflictList: Array<string>;
  changeset: Array<string>;
  binaryUrls: {
    upload: null | string;
    download: null | string;
    binaryToken: null | string;
  };
  binaryMap: { [key: string]: string };
  isCopyMode: boolean;
  copyList: Array<ValueOf<QueryTypes>>;
  rootSchemaMap: TypeStruct;
  clientStorage: { [key: string]: unknown };
}

interface IFloroContext {
  commandMode: "view" | "edit" | "compare";
  compareFrom: "none" | "before" | "after";
  applicationState: SchemaRoot | null;
  currentPluginAppState: React.MutableRefObject<SchemaRoot | null>;
  changeset: Set<string>;
  apiStoreInvalidity: { [key: string]: Array<string> };
  apiStoreInvaliditySets: { [key: string]: Set<string> };
  conflictSet: Set<string>;
  hasLoaded: boolean;
  saveState: <T extends keyof SchemaRoot>(
    pluginName: T,
    state: SchemaRoot | null
  ) => number | null;
  setPluginState: (state: PluginState) => void;
  saveCopyList: (copyList: Array<ValueOf<QueryTypes>>) => void;
  saveClientStorage: (_: object) => void;
  clearClientStorage: () => void;
  isCopyMode: boolean;
  copyList: Array<ValueOf<QueryTypes>>;
  pluginState: PluginState;
  clientStorage: { [key: string]: unknown };
  lastEditKey: React.MutableRefObject<string | null>;
  lastEditStateId: React.MutableRefObject<string | null>;
}

const FloroContext = createContext({
  commandMode: "view",
  compareFrom: "none",
  applicationState: null,
  changeset: new Set([]),
  apiStoreInvalidity: {},
  apiStoreInvaliditySets: {},
  conflictSet: new Set([]),
  hasLoaded: false,
  saveState: (_state: null) => null,
  setPluginState: (_state: PluginState) => {},
  saveCopyList: (_copyList: Array<ValueOf<QueryTypes>>) => {},
  saveClientStorage: (_storage: object) => {},
  clearClientStorage: () => {},
  isCopyMode: false,
  copyList: [],
  pathKeys: [],
  rootSchemaMap: {},
  clientStorage: {},
  lastEditKey: { current: null },
  lastEditStateId: { current: null },
  currentPluginAppState: { current: null },
  pluginState: {
    commandMode: "view",
    compareFrom: "none",
    themeName: "light",
    isCopyMode: false,
    copyList: [],
    pathKeys: [],
    applicationState: null,
    apiStoreInvalidity: {},
    conflictList: [],
    changeset: [],
    binaryUrls: {
      upload: null,
      download: null,
      binaryToken: null,
    },
    binaryMap: {},
    rootSchemaMap: {},
    clientStorage: {},
  },
} as IFloroContext);

export interface Props {
  children: React.ReactElement;
}

const MAX_DATA_SIZE = 5_000;
const sendMessagetoParent = (
  id: number,
  pluginName: string | null,
  command: string,
  data: object,
  saveCounter?: React.MutableRefObject<number>
) => {
  const dataString = JSON.stringify({ command, data });
  const totalPackets = Math.floor(dataString.length / MAX_DATA_SIZE);
  for (let i = 0; i < dataString.length; i += MAX_DATA_SIZE) {
    const chunk =
      i + MAX_DATA_SIZE > dataString.length
        ? dataString.substring(i)
        : dataString.substring(i, i + MAX_DATA_SIZE);
    setTimeout(() => {
      if (command == "save" && id < ( saveCounter?.current ?? 0)) {
        window.parent?.postMessage(
          {
            id,
            command: "abort",
            pluginName,
          },
          "*"
        );
        return;
      }
      window.parent?.postMessage(
        {
          id,
          chunk,
          index: i / MAX_DATA_SIZE,
          totalPackets,
          command,
          pluginName,
        },
        "*"
      );
    }, 16);
  }
};

export const FloroProvider = (props: Props) => {
  const [pluginState, setPluginState] = useState<PluginState>({
    commandMode: "view",
    compareFrom: "none",
    themeName: "light",
    applicationState: null,
    apiStoreInvalidity: {},
    conflictList: [],
    changeset: [],
    binaryUrls: {
      upload: null,
      download: null,
      binaryToken: null,
    },
    binaryMap: {},
    isCopyMode: false,
    copyList: [],
    rootSchemaMap: {},
    clientStorage: {},
  });
  const currentPluginAppState = useRef<PluginState["applicationState"]>({
    ...pluginState.applicationState,
  } as PluginState["applicationState"]);
  const currentClientStorage = useRef<object>({ ...pluginState.clientStorage });
  const rootSchemaMap = useRef(pluginState.rootSchemaMap);
  const [hasLoaded, setHasLoaded] = useState(false);
  const ids = useRef<Set<number>>(new Set());
  const [copyList, setCopyList] = useState<Array<ValueOf<QueryTypes>>>([]);
  const updateTimeout = useRef<NodeJS.Timeout>();
  const lastEditKey = useRef<string | null>(null);
  const lastEditStateId = useRef<string | null>(null);
  const currentPluginState = useRef<PluginState>(pluginState);

  useEffect(() => {
    currentPluginState.current = pluginState;
  }, [pluginState]);

  useEffect(() => {
    setCopyList(pluginState?.copyList);
  }, [pluginState?.isCopyMode]);

  const incoming = useRef<{
    [id: number]: {
      data: Array<string>;
      counter: number;
    };
  }>({});
  const updateCounter = useRef(1);
  const saveCounter = useRef(1);

  const commandMode = useMemo(() => {
    return pluginState.commandMode;
  }, [pluginState.commandMode]);

  const commandModeRef = useRef(commandMode);

  const compareFrom = useMemo(() => {
    return pluginState.compareFrom;
  }, [pluginState.compareFrom]);

  const changeset = useMemo(() => {
    return new Set(pluginState.changeset);
  }, [pluginState.changeset]);

  const conflictSet = useMemo(() => {
    return new Set(pluginState.conflictList ?? []);
  }, [pluginState.conflictList]);

  useEffect(() => {
    const commandToggleListeners = (event: KeyboardEvent) => {
      if (event.metaKey && event.shiftKey && event.key == "p") {
        window.parent?.postMessage("toggle-vcs", "*");
      }
      if (event.metaKey && event.shiftKey && event.key == "e") {
        window.parent?.postMessage("toggle-command-mode", "*");
      }

      if (event.metaKey && event.shiftKey && event.key == "[") {
        window.parent?.postMessage("toggle-before", "*");
      }

      if (event.metaKey && event.shiftKey && event.key == "]") {
        window.parent?.postMessage("toggle-after", "*");
      }

      if (event.metaKey && event.shiftKey && event.key == "c") {
        window.parent?.postMessage("toggle-compare-mode", "*");
      }

      if (event.metaKey && event.shiftKey && event.key == "b") {
        window.parent?.postMessage("toggle-branches", "*");
      }
    };
    window.addEventListener("keydown", commandToggleListeners);
    return () => {
      window.removeEventListener("keydown", commandToggleListeners);
    };
  }, []);

  const saveState = useCallback(
    <T extends keyof SchemaRoot>(
      pluginName: T,
      state: SchemaRoot | null
    ): number | null => {
      if (commandMode != "edit") {
        return null;
      }
      if (state == null || state[pluginName] == null) {
        return null;
      }
      clearTimeout(updateTimeout.current);
      if (ids.current) {
        updateCounter.current += 2;
        const id = updateCounter.current;
        ids.current = new Set([...Array.from(ids.current), id]);
        setTimeout(() => {
          sendMessagetoParent(id, pluginName, "save", state[pluginName], saveCounter);
        }, 0);
        return id;
      }
      return null;
    },
    [commandMode]
  );

  const saveCopyList = useCallback(
    (copyList: Array<ValueOf<QueryTypes>>) => {
      if (!pluginState.isCopyMode) {
        return;
      }
      clearTimeout(updateTimeout.current);
      setCopyList(copyList);
      if (ids.current) {
        updateCounter.current += 2;
        const id = updateCounter.current;
        ids.current = new Set([...Array.from(ids.current), id]);
        setTimeout(() => {
          sendMessagetoParent(id, null, "update-copy", copyList, saveCounter);
        }, 0);
        return id;
      }
      return null;
    },
    [pluginState.isCopyMode]
  );

  const saveClientStorage = useCallback(
    (clientStorage: object) => {
      clearTimeout(updateTimeout.current);
      if (ids.current) {
        updateCounter.current += 2;
        const id = updateCounter.current;
        ids.current = new Set([...Array.from(ids.current), id]);
        currentClientStorage.current = { ...clientStorage };
        setTimeout(() => {
          sendMessagetoParent(id, null, "update-client-storage", clientStorage, saveCounter);
        }, 0);
        return id;
      }
      return null;
    },
    [commandMode, pluginState]
  );

  const clearClientStorage = useCallback(() => {
    if (ids.current) {
      currentClientStorage.current = {};
      window.parent?.postMessage("clear-client-storage", "*");
      setPluginState({
        ...pluginState,
        clientStorage: {},
      });
    }
    return null;
  }, [pluginState]);

  const applicationState = useMemo(() => {
    if (!hasLoaded) {
      return {} as SchemaRoot;
    }
    return pluginState.applicationState;
  }, [pluginState.applicationState, hasLoaded]);

  const apiStoreInvalidity = useMemo(() => {
    if (!hasLoaded) {
      return {} as { [key: string]: Array<string> };
    }
    return pluginState.apiStoreInvalidity ?? {};
  }, [pluginState.apiStoreInvalidity, hasLoaded]);

  const apiStoreInvalidityStr = useMemo(() => {
    return JSON.stringify(apiStoreInvalidity);
  }, [apiStoreInvalidity]);

  const apiStoreInvaliditySets = useMemo(() => {
    const out: { [key: string]: Set<string> } = {};
    for (let plugin in apiStoreInvalidity) {
      out[plugin] = new Set(apiStoreInvalidity?.[plugin] ?? []);
    }
    return out;
  }, [apiStoreInvalidityStr]);

  useEffect(() => {
    const onMessage = ({ data }: { data: Packet }) => {
      if (!incoming.current[data.id]) {
        incoming.current[data.id] = {
          counter: 0,
          data: new Array(data.totalPackets + 1),
        };
      }
      incoming.current[data.id].data[data.index] = data.chunk;
      incoming.current[data.id].counter++;
      if (incoming.current[data.id].counter == data.totalPackets + 1) {
        const response: { event: string; data: unknown } = JSON.parse(
          incoming.current[data.id].data.join("")
        );
        if (response.event == "load") {
          const state: PluginState = response.data as PluginState;
          rootSchemaMap.current = state.rootSchemaMap;
          setPluginState(state);
          currentPluginAppState.current = state.applicationState;
          commandModeRef.current = state.commandMode;
          setHasLoaded(true);
        }
        if (response.event == "ack" || response.event == "update") {
          clearTimeout(updateTimeout.current);
          const isStale = updateCounter?.current > data.id;
          const state: PluginState = response.data as PluginState;
          if (currentPluginAppState.current && state.applicationState) {
            const nextApplicationState = getNextApplicationState(
              currentPluginAppState.current,
              state.applicationState,
              state.rootSchemaMap,
              lastEditKey,
              isStale
            );
            const didChangeStorage =
              JSON.stringify(state.clientStorage) !=
              JSON.stringify(currentClientStorage.current);
            const nextClientStorage = didChangeStorage
              ? state.clientStorage
              : { ...currentClientStorage.current };
            const nextState = {
              ...state,
              applicationState: nextApplicationState
                ? nextApplicationState
                : (currentClientStorage.current as SchemaRoot),
              clientStorage: nextClientStorage,
            };
            rootSchemaMap.current = state.rootSchemaMap;
            currentPluginAppState.current = nextState.applicationState;
            currentClientStorage.current = { ...nextClientStorage };
            commandModeRef.current = state.commandMode;
            if (nextState.applicationState) {
              setPluginState(nextState);
            }
            updateTimeout.current = setTimeout(() => {
              lastEditKey.current = null;
            }, 200);
          }
        }
        for (const id in incoming.current) {
          const idInt = parseInt(id);
          if (idInt < (updateCounter?.current ?? 0)) {
            delete incoming.current[data.id];
            ids.current.delete(idInt);
          }
        }
      }
      if (data.id > updateCounter.current) {
        updateCounter.current = data.id + 1;
      }
    };
    window.addEventListener("message", onMessage, true);
    window.parent?.postMessage("ready", "*");
    return () => {
      window.removeEventListener("message", onMessage, true);
    };
  }, []);

  return (
    <FloroContext.Provider
      value={{
        applicationState,
        currentPluginAppState,
        apiStoreInvalidity,
        apiStoreInvaliditySets,
        changeset,
        conflictSet,
        commandMode,
        compareFrom,
        hasLoaded,
        saveState,
        setPluginState,
        pluginState,
        clientStorage: pluginState.clientStorage,
        saveCopyList,
        saveClientStorage,
        clearClientStorage,
        isCopyMode: pluginState.isCopyMode,
        copyList,
        lastEditKey,
        lastEditStateId,
      }}
    >
      {props.children}
    </FloroContext.Provider>
  );
};

export const useFloroContext = () => {
  return useContext(FloroContext);
};

function getPluginNameFromQuery(query: string | null): keyof SchemaRoot | null {
  if (query == null) {
    return null;
  }
  const [pluginWrapper] = query.split(".");
  const pluginName = /^\\$\\((.+)\\)$/.exec(pluginWrapper as string)?.[1] ?? null;
  if (!pluginName) {
    return null;
  }
  return pluginName as keyof SchemaRoot;
}

export const useCopyApi = (pointer: ValueOf<QueryTypes> | null) => {
  const { copyList, saveCopyList, isCopyMode } = useFloroContext();
  const isCopied = useMemo(() => {
    if (!pointer) {
      return false;
    }
    return copyList.includes(pointer);
  }, [copyList, pointer]);

  const toggleCopy = useCallback(() => {
    if (!isCopyMode || !pointer) {
      return;
    }
    if (!isCopied) {
      const nextList = [...copyList, pointer];
      saveCopyList(nextList);
    } else {
      const nextList = copyList.filter(
        (copiedPointer) => copiedPointer != pointer
      );
      saveCopyList(nextList);
    }
  }, [isCopied, isCopyMode, copyList, pointer]);
  return {
    isCopied,
    toggleCopy,
  };
};

export const useClientStorageApi = <T,>(
  clientStorageKey: string
): [T | null, (value: T | null) => void, () => void] => {
  const {
    clientStorage,
    saveClientStorage,
    pluginState,
    setPluginState,
    commandMode,
  } = useFloroContext();

  const value = useMemo((): T | null => {
    return (clientStorage?.[clientStorageKey] as T) ?? (null as T);
  }, [clientStorageKey, clientStorage?.[clientStorageKey], commandMode]);
  const [getter, setter] = useState<T | null>(value);
  const timeout = useRef<NodeJS.Timeout>();
  useEffect(() => {
    clearTimeout(timeout?.current);
    timeout.current = setTimeout(() => {
      if (value != getter) {
        setter(value);
      }
    }, 300);
    return () => {
      clearTimeout(timeout.current);
    };
  }, [value]);

  const set = useCallback(
    (value: T | null) => {
      const next = {
        ...clientStorage,
        [clientStorageKey]: value,
      };
      clientStorage[clientStorageKey] = value;
      setter(value);
      saveClientStorage(next);
    },
    [
      value,
      clientStorage,
      clientStorageKey,
      pluginState,
      commandMode,
      setPluginState,
      saveClientStorage,
    ]
  );

  const remove = useCallback(() => {
    const next = {
      ...clientStorage,
    };
    delete next[clientStorageKey];
    delete clientStorage[clientStorageKey];
    setter(null);
    saveClientStorage(next);
  }, [
    value,
    clientStorage,
    clientStorageKey,
    pluginState,
    commandMode,
    setPluginState,
    saveClientStorage,
  ]);

  return [getter, set, remove];
};
`;

export const drawBinaryUploadAndDownloadCode = () => `
type MimeTypes =
  | "audio/aac"
  | "application/x-abiword"
  | "application/x-freearc"
  | "video/x-msvideo"
  | "application/vnd.amazon.ebook"
  | "application/octet-stream"
  | "image/bmp"
  | "application/x-bzip"
  | "application/x-bzip2"
  | "application/x-csh"
  | "text/css"
  | "text/csv"
  | "application/msword"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.ms-fontobject"
  | "application/epub+zip"
  | "application/gzip"
  | "image/gif"
  | "text/html"
  | "image/vnd.microsoft.icon"
  | "text/calendar"
  | "application/java-archive"
  | "text/javascript"
  | "application/json"
  | "application/ld+json"
  | "text/javascript"
  | "audio/mpeg"
  | "video/mpeg"
  | "application/vnd.apple.installer+xml"
  | "application/vnd.oasis.opendocument.presentation"
  | "application/vnd.oasis.opendocument.spreadsheet"
  | "application/vnd.oasis.opendocument.text"
  | "audio/ogg"
  | "video/ogg"
  | "application/ogg"
  | "audio/opus"
  | "font/otf"
  | "image/png"
  | "application/pdf"
  | "application/php"
  | "application/vnd.ms-powerpoint"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "application/vnd.rar"
  | "application/rtf"
  | "application/x-sh"
  | "image/svg+xml"
  | "application/x-shockwave-flash"
  | "application/x-tar"
  | "image/tiff"
  | "image/tiff"
  | "video/mp2t"
  | "font/ttf"
  | "text/plain"
  | "application/vnd.visio"
  | "audio/wav"
  | "audio/webm"
  | "video/webm"
  | "image/webp"
  | "font/woff"
  | "font/woff2"
  | "application/xhtml+xml"
  | "application/vnd.ms-excel"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "application/vnd.mozilla.xul+xml"
  | "application/zip"
  | "video/3gpp"
  | "video/3gpp2"
  | "application/x-7z-compressed"
  | ".jpg"
  | ".midi"
  | "XML";

const mimeMap: { [Property in MimeTypes]: \`.\$\{string}\` } = {
  "audio/aac": ".aac",
  "application/x-abiword": ".abw",
  "application/x-freearc": ".arc",
  "video/x-msvideo": ".avi",
  "application/vnd.amazon.ebook": ".azw",
  "application/octet-stream": ".bin",
  "image/bmp": ".bmp",
  "application/x-bzip": ".bz",
  "application/x-bzip2": ".bz2",
  "application/x-csh": ".csh",
  "text/css": ".css",
  "text/csv": ".csv",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-fontobject": ".eot",
  "application/epub+zip": ".epub",
  "application/gzip": ".gz",
  "image/gif": ".gif",
  "text/html": ".html",
  "image/vnd.microsoft.icon": ".ico",
  "text/calendar": ".ics",
  "application/java-archive": ".jar",
  ".jpg": ".jpeg",
  "XML": ".xml",
  "text/javascript": ".mjs",
  "application/json": ".json",
  "application/ld+json": ".jsonld",
  ".midi": ".mid",
  "audio/mpeg": ".mp3",
  "video/mpeg": ".mpeg",
  "application/vnd.apple.installer+xml": ".mpkg",
  "application/vnd.oasis.opendocument.presentation": ".odp",
  "application/vnd.oasis.opendocument.spreadsheet": ".ods",
  "application/vnd.oasis.opendocument.text": ".odt",
  "audio/ogg": ".oga",
  "video/ogg": ".ogv",
  "application/ogg": ".ogx",
  "audio/opus": ".opus",
  "font/otf": ".otf",
  "image/png": ".png",
  "application/pdf": ".pdf",
  "application/php": ".php",
  "application/vnd.ms-powerpoint": ".ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.rar": ".rar",
  "application/rtf": ".rtf",
  "application/x-sh": ".sh",
  "image/svg+xml": ".svg",
  "application/x-shockwave-flash": ".swf",
  "application/x-tar": ".tar",
  "image/tiff": ".tiff",
  "video/mp2t": ".ts",
  "font/ttf": ".ttf",
  "text/plain": ".txt",
  "application/vnd.visio": ".vsd",
  "audio/wav": ".wav",
  "audio/webm": ".weba",
  "video/webm": ".webm",
  "image/webp": ".webp",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
  "application/xhtml+xml": ".xhtml",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.mozilla.xul+xml": ".xul",
  "application/zip": ".zip",
  "video/3gpp": ".3gp",
  "video/3gpp2": ".3g2",
  "application/x-7z-compressed": ".7z",
};

const startUploadBlob = (
  data: BlobPart[],
  type: MimeTypes,
  url: string,
  progressCallback: (loaded: number, total: number) => void
) => {
  const blob = new Blob(data, { type });
  const ext = mimeMap[type];
  const fileName = \`upload.\$\{ext}\`;

  const formData = new FormData();
  formData.append("file", blob, fileName);
  return upload(formData, url, progressCallback);
};

const startUploadFile = (
  file: File,
  url: string,
  progressCallback: (loaded: number, total: number) => void
) => {
  const formData = new FormData();
  formData.append("file", file);
  return upload(formData, url, progressCallback);
};

const upload = (
  formData: FormData,
  url: string,
  progressCallback: (loaded: number, total: number) => void
) => {
  const xhr = new XMLHttpRequest();
  let promise: Promise<FileRef> | null = new Promise<FileRef>(
    (resolve, reject) => {
      xhr.responseType = "json";
      xhr.open("POST", url);
      xhr.onprogress = function (e) {
        progressCallback(e.loaded, e.total);
      };
      xhr.onerror = function (e) {
        reject(e);
      };
      xhr.onreadystatechange = function (e) {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          const status = xhr.status;
          if (status === 0 || (status >= 200 && status < 400)) {
            resolve(xhr.response["fileRef"]);
          } else {
            reject(e);
          }
        }
      };
      xhr.send(formData);
    }
  );

  return {
    promise,
    abort: () => {
      xhr.abort();
      promise = null;
    },
  };
};

export const useUploadFile = () => {
  const { pluginState } = useFloroContext();
  const [status, setStatus] =
    useState<"none" | "in_progress" | "success" | "error">("none");
  const [progress, setProgress] = useState<number>(0);
  const [fileRef, setFileRef] = useState<FileRef | null>(null);
  const [uploadObject, setUploadObject] =
    useState<null | { promise: Promise<FileRef> | null; abort: () => void }>(
      null
    );

  const reset = useCallback(() => {
    setStatus("none");
    setProgress(0);
    setFileRef(null);
    setUploadObject(null)
  }, []);

  const isLoading = useMemo(() => status == "in_progress", [status]);

  const onProgress = useCallback((loaded: number, total: number) => {
    setProgress(loaded / total);
  }, []);

  const uploadFile = useCallback(
    (file: File) => {
      if (status == "in_progress") {
        return;
      }
      if (!pluginState.binaryUrls.upload || !pluginState.binaryUrls.binaryToken) {
        return;
      }
      setStatus("in_progress");
      setProgress(0);
      setUploadObject(
        startUploadFile(file, pluginState.binaryUrls.upload + (!pluginState.binaryUrls?.binaryToken ? "" : "?token=" + pluginState.binaryUrls?.binaryToken), onProgress)
      );
    },
    [status, pluginState.binaryUrls.upload, pluginState.binaryUrls?.binaryToken, onProgress]
  );

  const uploadBlob = useCallback(
    (data: BlobPart[], type: MimeTypes) => {
      if (status == "in_progress") {
        return;
      }
      if (!pluginState.binaryUrls.upload || !pluginState.binaryUrls.binaryToken) {
        return;
      }
      setUploadObject(
        startUploadBlob(data, type, pluginState.binaryUrls.upload + (!pluginState.binaryUrls?.binaryToken ? "" : "?token=" + pluginState.binaryUrls?.binaryToken), onProgress)
      );
      setStatus("in_progress");
      setProgress(0);
    },
    [status, pluginState.binaryUrls.upload, pluginState.binaryUrls.binaryToken, onProgress]
  );

  useEffect(() => {
    if (!uploadObject) {
      return;
    }
    let aborted = false;
    uploadObject.promise
      ?.then((fileRef) => {
        if (!aborted) {
          setStatus("success");
          setProgress(1);
          setFileRef(fileRef);
        }
      })
      .catch((e) => {
        if (!aborted) {
          setStatus("error");
          setProgress(0);
        }
      });
    return () => {
      uploadObject.abort();
      aborted = true;
    };
  }, [uploadObject]);

  return {
    uploadBlob,
    uploadFile,
    reset,
    status,
    progress,
    fileRef,
    isLoading,
  };
};

export const useBinaryRef = (fileRef?: FileRef|null) => {
    const { pluginState } = useFloroContext();
    return useMemo(() => {
      if (!fileRef) {
        return null;
      }
      if (pluginState.binaryMap[fileRef]) {
        return (
          pluginState.binaryMap[fileRef] +
          (!pluginState.binaryUrls?.binaryToken ? "" : "?token=" + pluginState.binaryUrls?.binaryToken)
        );
      }
      return \`\$\{pluginState.binaryUrls.download}/\$\{fileRef}\` + (!pluginState.binaryUrls?.binaryToken ? "" : "?token=" + pluginState.binaryUrls?.binaryToken);
    }, [
      fileRef,
      pluginState.binaryMap?.[fileRef ?? ""],
      pluginState.binaryUrls?.binaryToken,
      pluginState.binaryUrls.download,
    ]);
}

interface BinaryReturn {
  "arraybuffer": ArrayBuffer,
  "blob": Blob,
  "document": Document|XMLDocument,
  "json": object,
  "text": string,
};

const download = (
  url: string,
  responseType: keyof BinaryReturn
) => {
  const xhr = new XMLHttpRequest();
  let promise: Promise<FileRef> | null = new Promise<FileRef>(
    (resolve, reject) => {
      xhr.responseType = responseType;
      xhr.open("GET", url);
      xhr.onerror = function (e) {
        reject(e);
      };
      xhr.onreadystatechange = function (e) {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          const status = xhr.status;
          if (status === 0 || (status >= 200 && status < 400)) {
            resolve(xhr.response);
          } else {
            reject(e);
          }
        }
      };
      xhr.send();
    }
  );

  return {
    promise,
    abort: () => {
      xhr.abort();
      promise = null;
    },
  };
};

export const useBinaryData = <K extends keyof BinaryReturn>(
  fileRef: FileRef | null,
  responseType: K
) => {
  const binRef = useBinaryRef(fileRef);
  const [data, setData] = useState<BinaryReturn[K] | null>(null);
  const [status, setStatus] =
    useState<"none" | "in_progress" | "success" | "error">("none");
  const isLoading = useMemo(() => status == "in_progress", [status]);

  useEffect(() => {
    if (binRef) {
      setStatus("none");
    }
  }, [binRef]);

  useEffect(() => {
    if (status != "none") {
      return;
    }
    if (!binRef) {
      return;
    }
    let aborted = false;
    const downloadObject = download(binRef, responseType);
    downloadObject.promise
      .then((result: unknown) => {
        if (!aborted) {
          setData(result as BinaryReturn[K]);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!aborted) {
          setStatus("error");
        }
      });
    return () => {
      aborted = true;
      downloadObject?.abort();
    };
  }, [status, binRef, responseType]);

  return { isLoading, status, data };
};
`;

export const drawUseFloroStateFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useFloroState(query: PointerTypes['${wildcard}'], defaultData?: SchemaTypes['${wildcard}']): [SchemaTypes['${wildcard}']|null, (t: SchemaTypes['${wildcard}'], doSave?: boolean) => void, () => void];\n`;
  }
  code += USE_FLORO_STATE_FUNCTION + "\n";
  return code;
}

export const USE_FLORO_STATE_FUNCTION = `
export function useFloroState<T>(query: string, defaultData?: T): [T|null, (t: T, doSave?: true) => void, () => void];
export function useFloroState<T>(query: string, defaultData?: T): [T|null, (t: T, doSave?: boolean) => void|(() => void), () => void] {
  const ctx = useFloroContext();
  const pluginName = useMemo(() => getPluginNameFromQuery(query), [query]);

  const stateId = useMemo(() => {
    return query + ":" + Math.random();
  }, [query])

  const obj = useMemo((): T|null => {
    if (!ctx.hasLoaded) {
      return defaultData ?? null;
    }
    const existingObj = getObjectInStateMap(
      ctx.applicationState as SchemaRoot,
      query
    );
    if (existingObj) {
      return existingObj as T;
    }
    if (ctx.applicationState && defaultData) {
      return defaultData;
    }
    return null;
  }, [ctx.applicationState, query, defaultData, ctx.hasLoaded]);

  const [getter, setter] = useState<T|null>(obj ?? defaultData ?? null);

  useEffect(() => {
    if (ctx.commandMode == "edit" && query == ctx?.lastEditKey?.current) {
      if (stateId != ctx?.lastEditStateId?.current && obj != getter) {
        setter(obj);
      }
      return;
    }
    if (obj != getter) {
      setter(obj);
    }
  }, [obj, ctx.commandMode, query, stateId])

  const save = useCallback(() => {
    if (
      ctx.currentPluginAppState.current &&
      pluginName &&
      getter &&
      ctx.commandMode == "edit"
    ) {
      ctx.lastEditKey.current = query;
      ctx.lastEditStateId.current = stateId;
      const next = updateObjectInStateMap(
        { ...ctx.currentPluginAppState.current },
        query,
        getter
      ) as SchemaRoot;
      ctx.currentPluginAppState.current = next;
      ctx.saveState(pluginName, ctx.applicationState);
    }
  }, [
    query,
    pluginName,
    obj,
    ctx.saveState,
    ctx.pluginState,
    ctx.applicationState,
    ctx.commandMode,
    getter,
    stateId,
  ]);

  const set = useCallback(
    (obj: T, doSave = true) => {
      if (
        ctx.currentPluginAppState.current &&
        pluginName &&
        obj &&
        ctx.commandMode == "edit"
      ) {
        setter(obj);
        ctx.lastEditKey.current = query;
        ctx.lastEditStateId.current = stateId;
        if (doSave) {
          const next = updateObjectInStateMap(
            { ...ctx.currentPluginAppState.current },
            query,
            obj
          ) as SchemaRoot;
          ctx.currentPluginAppState.current = next;
          ctx.saveState(pluginName, next);
        } else {
          return () => {
            ctx.lastEditKey.current = query;
            ctx.lastEditStateId.current = stateId;
            const next = updateObjectInStateMap(
              { ...ctx.currentPluginAppState.current },
              query,
              obj
            ) as SchemaRoot;
            ctx.currentPluginAppState.current = next;
            ctx.saveState(pluginName, next);
          };
        }
      }
    },
    [
      query,
      ctx.saveState,
      obj,
      pluginName,
      ctx.pluginState,
      ctx.applicationState,
      ctx.commandMode,
    ]
  );
  return [getter, set, save];
};
`;

export const drawUseIsFloroInvalidFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useIsFloroInvalid(query: PointerTypes['${wildcard}'], fuzzy?: boolean): boolean;\n`;
  }
  code += USE_FLORO_IS_INVALID_FUNCTION + "\n";
  return code;
}

export const USE_FLORO_IS_INVALID_FUNCTION = `
export function useIsFloroInvalid(query: PartialDiffableQuery|DiffableQuery, fuzzy = true): boolean {
  const ctx = useFloroContext();
  const pluginName = useMemo(() => getPluginNameFromQuery(query), [query]);
  const invalidQueriesSet = useMemo(() => {
    if (!pluginName) {
      return new Set() as Set<PartialDiffableQuery | DiffableQuery>;
    }
    return (
      ctx.apiStoreInvaliditySets?.[pluginName] ??
      (new Set() as Set<PartialDiffableQuery | DiffableQuery>)
    );
  }, [ctx.apiStoreInvaliditySets, pluginName]);
  return useMemo(() => {
    if (fuzzy) {
      return containsDiffable(invalidQueriesSet, query, true);
    }
    return containsDiffable(invalidQueriesSet, query, false);
  }, [invalidQueriesSet, query, fuzzy])
};`;

export const drawUseWasAddedFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useWasAdded(query: PointerTypes['${wildcard}'], fuzzy?: boolean): boolean;\n`;
  }
  code += USE_WAS_ADDED_FUNCTION + "\n";
  return code;
}

export const USE_WAS_ADDED_FUNCTION = `
export function useWasAdded(query: PartialDiffableQuery|DiffableQuery, fuzzy = true): boolean {
  const ctx = useFloroContext();
  return useMemo(() => {
    if (ctx.commandMode != "compare" || ctx.compareFrom != "after") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.changeset, query, true);
    }
    return containsDiffable(ctx.changeset, query, false);
  }, [ctx.changeset, query, fuzzy, ctx.compareFrom, ctx.commandMode])
};`;


export const drawUseWasRemovedFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useWasRemoved(query: PointerTypes['${wildcard}'], fuzzy?: boolean): boolean;\n`;
  }
  code += USE_WAS_REMOVED_FUNCTION + "\n";
  return code;
}

export const USE_WAS_REMOVED_FUNCTION = `
export function useWasRemoved(query: PartialDiffableQuery|DiffableQuery, fuzzy = true): boolean {
  const ctx = useFloroContext();
  return useMemo(() => {
    if (ctx.commandMode != "compare" || ctx.compareFrom != "before") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.changeset, query, true);
    }
    return containsDiffable(ctx.changeset, query, false);
  }, [ctx.changeset, query, fuzzy, ctx.compareFrom, ctx.commandMode])
};`;

export const drawUseHasConflictFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useHasConflict(query: PointerTypes['${wildcard}'], fuzzy?: boolean): boolean;\n`;
  }
  code += USE_HAS_CONFLICT_FUNCTION + "\n";
  return code;
}

export const USE_HAS_CONFLICT_FUNCTION = `
export function useHasConflict(query: PartialDiffableQuery|DiffableQuery, fuzzy = true): boolean {
  const ctx = useFloroContext();
  return useMemo(() => {
    if (ctx.commandMode != "compare") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.conflictSet, query, true);
    }
    return containsDiffable(ctx.conflictSet, query, false);
  }, [ctx.conflictSet, query, fuzzy, ctx.commandMode])
};`;


export const drawUseWasChangedFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useWasChanged(query: PointerTypes['${wildcard}'], fuzzy?: boolean): boolean;\n`;
  }
  code += USE_WAS_CHANGED_FUNCTION + "\n";
  return code;
}

export const USE_WAS_CHANGED_FUNCTION = `
export function useWasChanged(query: PartialDiffableQuery|DiffableQuery, fuzzy = true): boolean {
  const ctx = useFloroContext();
  const wasAdded = useMemo(() => {
    if (ctx.commandMode != "compare" || ctx.compareFrom != "after") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.changeset, query, true);
    }
    return containsDiffable(ctx.changeset, query, false);
  }, [ctx.changeset, query, fuzzy, ctx.compareFrom, ctx.commandMode])

  const wasRemoved = useMemo(() => {
    if (ctx.commandMode != "compare" || ctx.compareFrom != "before") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.changeset, query, true);
    }
    return containsDiffable(ctx.changeset, query, false);
  }, [ctx.changeset, query, fuzzy, ctx.compareFrom, ctx.commandMode])
  return wasAdded || wasRemoved;
};`;


export const drawUseHasIndicationFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useHasIndication(query: PointerTypes['${wildcard}'], fuzzy?: boolean): boolean;\n`;
  }
  code += USE_HAS_INDICATION_FUNCTION + "\n";
  return code;
}

export const USE_HAS_INDICATION_FUNCTION = `
export function useHasIndication(query: PartialDiffableQuery|DiffableQuery, fuzzy = true): boolean {
  const ctx = useFloroContext();

  const pluginName = useMemo(() => getPluginNameFromQuery(query), [query]);
  const invalidQueriesSet = useMemo(() => {
    if (!pluginName) {
      return new Set() as Set<PartialDiffableQuery | DiffableQuery>;
    }
    return (
      ctx.apiStoreInvaliditySets?.[pluginName] ??
      (new Set() as Set<PartialDiffableQuery | DiffableQuery>)
    );
  }, [ctx.apiStoreInvaliditySets, pluginName]);
  const isInvalid = useMemo(() => {
    if (fuzzy) {
      return containsDiffable(invalidQueriesSet, query, true);
    }
    return containsDiffable(invalidQueriesSet, query, false);
  }, [invalidQueriesSet, query, fuzzy])

  const wasAdded = useMemo(() => {
    if (ctx.commandMode != "compare" || ctx.compareFrom != "after") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.changeset, query, true);
    }
    return containsDiffable(ctx.changeset, query, false);
  }, [ctx.changeset, query, fuzzy, ctx.compareFrom, ctx.commandMode])

  const wasRemoved = useMemo(() => {
    if (ctx.commandMode != "compare" || ctx.compareFrom != "before") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.changeset, query, true);
    }
    return containsDiffable(ctx.changeset, query, false);
  }, [ctx.changeset, query, fuzzy, ctx.compareFrom, ctx.commandMode])

  const hasConflict = useMemo(() => {
    if (ctx.commandMode != "compare") {
      return false;
    }
    if (fuzzy) {
      return containsDiffable(ctx.conflictSet, query, true);
    }
    return containsDiffable(ctx.conflictSet, query, false);
  }, [ctx.conflictSet, query, fuzzy, ctx.commandMode])
  return isInvalid || wasAdded || wasRemoved || hasConflict;
};`;


export const drawUseReferencedObjectFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function useReferencedObject(query?: PointerTypes['${wildcard}']): SchemaTypes['${wildcard}'];\n`;
  }
  code += USE_REFERENCED_OBJECT_FUNCTION + "\n";
  return code;
}

export const USE_REFERENCED_OBJECT_FUNCTION = `
export function useReferencedObject<T>(query?: string): T|null {
  const ctx = useFloroContext();
  return useMemo(() => {
    if (!query) {
      return null;
    }
    const existingObj = getObjectInStateMap(
      ctx.applicationState as SchemaRoot,
      query
    );
    if (existingObj) {
      return existingObj as T;
    }
    return null;
  }, [query, ctx.applicationState]);
};`;

export const drawGetReferencedObjectFunction = (
  diffables: Array<Array<string|DiffableElement>>
) => {
  let code = "";
  for (let diffable of diffables) {
    const wildcard = renderDiffableToWildcard(diffable);
    code += `export function getReferencedObject(root: SchemaRoot, query?: PointerTypes['${wildcard}']): SchemaTypes['${wildcard}'];\n`;
  }
  code += USE_GET_OBJECT_FUNCTION + "\n";
  return code;
}

export const USE_GET_OBJECT_FUNCTION = `
export function getReferencedObject<T>(root: SchemaRoot, query?: string): T|null {
  if (!query) {
    return null;
  }
  const existingObj = getObjectInStateMap(
    root,
    query
  );
  if (existingObj) {
    return existingObj as T;
  }
  return null;
};`;

export const GENERATED_CODE_FUNCTIONS = `
interface StateObject {
  [key: string | number]: string | StateObject | number | null;
}
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
    if (/^\\[(\\d+)\\]$/.test(part)) {
      return parseInt(((/^\\[(\\d+)\\]$/.exec(part) as Array<string>)[1]));
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
  const pluginName = /^\\$\\((.+)\\)$/.exec(pluginWrapper as string)?.[1] ?? null;
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

export function containsDiffable(changeset: Set<string>, query: PartialDiffableQuery, fuzzy: boolean): boolean;
export function containsDiffable(changeset: Set<string>, query: DiffableQuery, fuzzy: boolean): boolean;
export function containsDiffable(changeset: Set<string>, query: PartialDiffableQuery|DiffableQuery, fuzzy: boolean) {
  if (!fuzzy) {
    return changeset.has(query);
  }
  for (let value of changeset) {
    if (value.startsWith(query)) {
      return true;
    }
  }
  return false;
}

const getIndexPathInStateMap = (
  stateMap: { [pluginName: string]: object },
  path: string
): Array<string | number> | null => {
  let current: null | object = null;
  const [pluginWrapper, ...decodedPath] = decodeSchemaPathWithArrays(path);
  const pluginName = /^\\$\\((.+)\\)$/.exec(pluginWrapper as string)?.[1] ?? null;
  const indexPath: Array<string | number> = [];
  if (pluginName == null) {
    return null;
  }
  indexPath.push(pluginName);
  current = stateMap[pluginName];
  for (const part of decodedPath) {
    if (!current) {
      return null;
    }
    if (typeof part == "number") {
      current = current[part];
      indexPath.push(part);
    } else if (typeof part != "string") {
      const { key, value } = part as { key: string; value: string };
      if (Array.isArray(current)) {
        const element = current?.find?.((v, index) => {
          if (v?.[key] == value) {
            indexPath.push(index);
            return true;
          }
          return false;
        });
        current = element;
      } else {
        return null;
      }
    } else {
      indexPath.push(part);
      current = current[part];
    }
  }
  return indexPath;
};

const updateObjectInStateMap = (
  stateMap: { [pluginName: string]: object },
  path: string,
  objectToUpdate: object
) => {
  const indexPath = getIndexPathInStateMap(stateMap, path);
  if (indexPath == null) {
    return null;
  }
  let current: object = stateMap;
  let last!: object | Array<object>;
  for (let i = 0; i < indexPath.length; ++i) {
    last = current;
    current = current[indexPath[i]];
  }
  if (!last) {
    return stateMap;
  }
  last[indexPath[indexPath.length - 1]] = objectToUpdate;
  return stateMap;
};


export type StringDiff = {
  add: {
    [key: number]: string;
  };
  remove: {
    [key: number]: string;
  };
};

export type Diff = {
  add: {
    [key: string]: DiffElement;
  };
  remove: {
    [key: string]: DiffElement;
  };
};

export interface DiffElement {
  key: string;
  value: any;
}

const fastHash = (str: string) => {
  let hash = 0;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * hash2) ^ ((hash << 5) - hash + str.charCodeAt(i));
    hash2 = (hash2 << 5) - hash + str.charCodeAt(i);
    hash |= 0;
    hash2 |= 0;
  }
  return hash.toString(36).padEnd(6) + hash2.toString(36).padEnd(6);
};

export const getLCS = (
  left: Array<string>,
  right: Array<string>
): Array<string> => {
  const diff = mdiff(left, right);
  const lcs = diff.getLcs();
  return lcs ?? [];
};

export const getArrayStringDiff = (
  past: Array<string>,
  present: Array<string>
): StringDiff => {
  const longestSequence = getLCS(past, present);

  let diff = {
    add: {},
    remove: {},
  };

  for (let i = 0, removeIndex = 0; i < past.length; ++i) {
    if (longestSequence[removeIndex] == past[i]) {
      removeIndex++;
    } else {
      diff.remove[i] = past[i];
    }
  }

  for (let i = 0, addIndex = 0; i < present.length; ++i) {
    if (longestSequence[addIndex] == present[i]) {
      addIndex++;
    } else {
      diff.add[i] = present[i];
    }
  }
  return diff;
};

export const getRowHash = (obj: {
  key: string;
  value: {
    [key: string]: number | string | boolean | Array<number | string | boolean>;
  };
}): string => {
  return fastHash(obj.key + JSON.stringify(obj.value));
};

export const getDiff = (
  before: Array<DiffElement>,
  after: Array<DiffElement>
): Diff => {
  const past = before.map(getRowHash);
  const present = after.map(getRowHash);
  const longestSequence = getLCS(past, present);
  let removeIndex = 0;
  let diff = {
    add: {},
    remove: {},
  };
  for (let i = 0; i < past.length; ++i) {
    if (longestSequence[removeIndex] == past[i]) {
      removeIndex++;
    } else {
      diff.remove[i] = before[i];
    }
  }

  let addIndex = 0;
  for (let i = 0; i < present.length; ++i) {
    if (longestSequence[addIndex] == present[i]) {
      addIndex++;
    } else {
      diff.add[i] = after[i];
    }
  }
  return diff;
};

export interface ManifestNode {
  type: string;
  isKey?: boolean;
  values?: string | TypeStruct;
  ref?: string;
  refKeyType?: string;
  refType?: string;
  nullable?: boolean;
  emptyable?: boolean;
  bounded?: boolean;
  manualOrdering?: boolean;
  onDelete?: "delete" | "nullify";
  default?: unknown|Array<unknown>;
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
  managedCopy?: boolean;
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
  seed?: unknown;
}

const primitives = new Set(["int", "float", "boolean", "string", "file"]);

const writePathString = (
  pathParts: Array<DiffElement | string>
): string => {
  return pathParts
    .map((part) => {
      if (typeof part == "string") {
        return part;
      }
      return \`\$\{part.key\}<\$\{part.value\}>\`;
    })
    .join(".");
};

const generateKVFromStateWithRootSchema = (
  rootSchema: TypeStruct,
  pluginName: string,
  state: object
): Array<DiffElement> => {
  const flattenedState = flattenStateToSchemaPathKV(
    rootSchema as unknown as Manifest,
    state,
    [\`$(\$\{pluginName\})\`]
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

const generateKVState = (
  rootSchema: TypeStruct,
  state: object
) => {
  const out:Array<DiffElement> = [];
  for (const pluginName in rootSchema) {
    out.push(
      ...generateKVFromStateWithRootSchema(
        rootSchema[pluginName] as TypeStruct,
        pluginName,
        state[pluginName]
      )
    );
  }
  return out;
}

const getStateId = (schema: TypeStruct, state: object): string => {
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
        value: fastHash(\`\$\{state[prop]\}\`),
      });
    }
    if (schema[prop].type == "set" || schema[prop].type == "array") {
      hashPairs.push({
        key: prop,
        value: state[prop]?.reduce((s: string, element: object) => {
          if (
            typeof schema[prop].values == "string" &&
            primitives.has(schema[prop].values as string)
          ) {
            return fastHash(s + \`\$\{element\}\`);
          }
          return fastHash(
            s + getStateId(schema[prop].values as TypeStruct, element)
          );
        }, ""),
      });
    }
  }
  return fastHash(
    hashPairs.reduce((s, { key, value }) => {
      if (key == "(id)") {
        return s;
      }
      if (s == "") {
        return \`\$\{key\}:\$\{value\}\`;
      }
      return s + "/" + \`\$\{key\}:\$\{value\}\`;
    }, "")
  );
};

const flattenStateToSchemaPathKV = (
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
          [
            ...traversalPath,
            ...(primaryKey ? [primaryKey] : []),
            prop
          ],
        )
      );
    });
  }
  for (const prop of sets) {
    (state?.[prop] ?? []).forEach((element) => {
      kv.push(
        ...flattenStateToSchemaPathKV(
          schemaRoot[prop].values,
          element,
          [
          ...traversalPath,
          ...(primaryKey ? [primaryKey] : []),
          prop,
        ])
      );
    });
  }
  return kv;
};

export const reIndexSchemaArrays = (kvs: Array<DiffElement>): Array<string> => {
  const out: Array<string> = [];
  const indexMap: {[path: string]: number} = {};
  for (const { key } of kvs) {
    const decodedPath = decodeSchemaPath(key);
    const parts: Array<string|DiffElement> = [];
    const indexStack: Array<number> = [];
    for (const [index, part] of decodedPath.entries()) {
      const isLast = index == decodedPath.length - 1;
      if (typeof part == "object" && part.key == "(id)") {
        const parentPathString = writePathString(parts);
        if (isLast) {
          if (!indexMap?.hasOwnProperty(parentPathString)) {
            indexMap[parentPathString] = 0;
          } else {
            indexMap[parentPathString]++;
          }
        }
        indexStack.push(indexMap[parentPathString])
      }
      parts.push(part);
    }
    let pathIdx = 0;
    const pathWithNumbers = decodedPath.map((part) => {
      if (typeof part == "object" && part.key == "(id)") {
        return indexStack[pathIdx++];
      }
      return part;
    });
    const arrayPath = writePathStringWithArrays(pathWithNumbers);
    out.push(arrayPath);
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

export const writePathStringWithArrays = (
  pathParts: Array<DiffElement | string | number>
): string => {
  return pathParts
    .map((part) => {
      if (typeof part == "string") {
        return part;
      }
      if (typeof part == "number") {
        return \`[\$\{part\}]\`;
      }
      return \`\$\{part.key\}<\$\{part.value\}>\`;
    })
    .join(".");
};

const getNextApplicationState = (currentApplicationState: {[key: string]: object}, nextApplicationState: {[key: string]: object}, rootSchemaMap: TypeStruct, lastEditKey: React.MutableRefObject<null|string>, isStale: boolean): SchemaRoot | null => {
  try {
    if (!currentApplicationState && !nextApplicationState) {
      return null;
    }
    if (!currentApplicationState) {
      return nextApplicationState as SchemaRoot;
    }
    if (!nextApplicationState) {
      return currentApplicationState as SchemaRoot;
    }
    const key = lastEditKey.current;
    const nextKV = generateKVState(rootSchemaMap, nextApplicationState);
    const currentKV = generateKVState(rootSchemaMap, currentApplicationState);
    if (key) {
      const nextReindexedKeys = reIndexSchemaArrays(nextKV);
      const currentReindexedKeys = reIndexSchemaArrays(currentKV);
      let nextKeyIndex = -1;
      for (let i = 0; i < nextReindexedKeys.length; ++i) {
        if (key.startsWith(nextReindexedKeys[i])) {
          nextKeyIndex = i;
        }
      }
      let currentKeyIndex = -1;
      for (let i = 0; i < currentReindexedKeys.length; ++i) {
        if (key.startsWith(currentReindexedKeys[i])) {
          currentKeyIndex = i;
        }
      }
      if (nextKeyIndex != -1 && currentKeyIndex != -1 && nextKeyIndex == currentKeyIndex){
        const currentKey = nextReindexedKeys[nextKeyIndex];
        const nextKey = currentReindexedKeys[currentKeyIndex];
        const object = getObjectInStateMap(currentApplicationState, currentKey + key.substring(currentKey.length));
        const nextObject = getObjectInStateMap(nextApplicationState, nextKey + key.substring(nextKey.length));
        let pastKeyCount = 0;
        let nextKeyCount = 0;
        let pastKeys = new Set<string>();
        for(let i = 0; i < currentReindexedKeys.length; ++i) {
          const k = currentReindexedKeys[i];
          pastKeys.add(k)
          pastKeyCount++;
        }
        let hasAllKeys = true;
        for(let i = 0; i < nextReindexedKeys.length; ++i) {
          const k = nextReindexedKeys[i];
          if (!pastKeys.has(k)) {
            hasAllKeys = false;
            break;
          }
          nextKeyCount++;
        }
        hasAllKeys = hasAllKeys && pastKeyCount == nextKeyCount;
        if (hasAllKeys && object && nextObject && JSON.stringify(object) != JSON.stringify(nextObject)) {
          if (isStale) {
            return currentApplicationState as SchemaRoot;
          }
          return updateObjectInStateMap(nextApplicationState, key, object) as SchemaRoot;
        }
        if (hasAllKeys && !isStale) {
          return currentApplicationState as SchemaRoot;
        }
      }
    }
    const diff = getDiff(currentKV, nextKV);
    if (Object.keys(diff.add).length == 0 && Object.keys(diff.remove).length == 0) {
      return currentApplicationState as SchemaRoot;
    }
    return nextApplicationState as SchemaRoot;
  } catch(e) {
    return nextApplicationState as SchemaRoot;
  }
}
`;

export const GENERATED_CODE_FUNCTIONS_ = async (): Promise<string> => {
  return await fs.promises.readFile(
    path.join(__dirname, "..", "..", "templates", "GENERATED_CODE_FUNCTIONS.txt"),
    "utf-8"
  );
};