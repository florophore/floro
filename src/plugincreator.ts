import fs from "fs";
import path from "path";
import tar from "tar";
import {
  copyDirectory,
  existsAsync,
  vDEVPath,
  vTMPPath,
} from "./filestructure";
import {
  getPluginManifest,
  Manifest,
  manifestListToSchemaMap,
  pluginManifestIsSubsetOfManifest,
  pluginMapToList,
  containsCyclicTypes,
  getRootSchemaMap,
  getExpandedTypesForPlugin,
  isSchemaValid,
  invalidSchemaPropsCheck,
} from "./plugins";
import semver from "semver";

export const checkDirectoryIsPluginWorkingDirectory = async (
  cwd: string
): Promise<boolean> => {
  const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
  return await existsAsync(floroManifestPath);
};

export const isCreationDistDirectoryValid = async (
  cwd: string
): Promise<boolean> => {
  const indexHTMLPath = path.join(cwd, "dist", "index.html");
  const indexHTMLExists = await existsAsync(indexHTMLPath);
  if (!indexHTMLExists) {
    return false;
  }
  const assetsPath = path.join(cwd, "dist", "assets");
  const assetsExists = await existsAsync(assetsPath);
  if (!assetsExists) {
    return false;
  }
  return true;
};

export const canExportPlugin = async (cwd: string): Promise<boolean> => {
  const isPluginDir = await checkDirectoryIsPluginWorkingDirectory(cwd);
  if (!isPluginDir) {
    return false;
  }
  const isValid = await isCreationDistDirectoryValid(cwd);
  if (!isValid) {
    return false;
  }
  return true;
};

export const exportPluginToDev = async (cwd: string) => {
  const canExport = canExportPlugin(cwd);
  if (!canExport) {
    return false;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const floroManifest = JSON.parse(floroManifestString.toString());
    const pluginName = floroManifest.name;
    const pluginVersion = floroManifest.version;
    const devPathDir = path.join(vDEVPath, `${pluginName}@${pluginVersion}`);
    const devPathExists = await existsAsync(devPathDir);
    if (devPathExists) {
      await fs.promises.rmdir(devPathDir);
    }
    await fs.promises.mkdir(devPathDir, { recursive: true });
    const sourceManifestDirPath = path.join(cwd, "floro");
    const destManifestDirPath = path.join(devPathDir, "floro");
    const sourceIndexHTMLPath = path.join(cwd, "dist", "index.html");
    const destIndexHTMLPath = path.join(devPathDir, "index.html");
    const sourceAssetsPath = path.join(cwd, "dist", "assets");
    const destAssetsPath = path.join(devPathDir, "assets");
    await copyDirectory(sourceManifestDirPath, destManifestDirPath);
    await fs.promises.copyFile(sourceIndexHTMLPath, destIndexHTMLPath);
    await copyDirectory(sourceAssetsPath, destAssetsPath);
    return true;
  } catch (e) {
    return false;
  }
};

export const tarCreationPlugin = async (cwd: string): Promise<boolean> => {
  const canExport = canExportPlugin(cwd);
  if (!canExport) {
    return false;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const floroManifest = JSON.parse(floroManifestString.toString());
    const pluginName = floroManifest.name;
    const pluginVersion = floroManifest.version;
    const buildPathDir = path.join(
      vTMPPath,
      "build",
      `${pluginName}@${pluginVersion}`
    );
    const outPathDir = path.join(vTMPPath, "out");
    const buildPathExists = await existsAsync(buildPathDir);
    const outPathExists = await existsAsync(buildPathDir);
    if (!outPathExists) {
      await fs.promises.mkdir(outPathDir, { recursive: true });
    }
    if (buildPathExists) {
      await fs.promises.rmdir(buildPathDir);
    }
    await fs.promises.mkdir(buildPathDir, { recursive: true });
    const sourceManifestDirPath = path.join(cwd, "floro");
    const destManifestDirPath = path.join(buildPathDir, "floro");
    const sourceIndexHTMLPath = path.join(cwd, "dist", "index.html");
    const destIndexHTMLPath = path.join(buildPathDir, "index.html");
    const sourceAssetsPath = path.join(cwd, "dist", "assets");
    const destAssetsPath = path.join(buildPathDir, "assets");
    await copyDirectory(sourceManifestDirPath, destManifestDirPath);
    await fs.promises.copyFile(sourceIndexHTMLPath, destIndexHTMLPath);
    await copyDirectory(sourceAssetsPath, destAssetsPath);
    const tarFile = path.join(
      vTMPPath,
      "out",
      `${pluginName}@${pluginVersion}.tar.gz`
    );
    const tarExists = await existsAsync(tarFile);
    if (tarExists) {
      await fs.promises.rm(tarFile);
    }
    await tar.create(
      {
        gzip: true,
        file: tarFile,
      },
      [buildPathDir]
    );
    return true;
  } catch (e) {
    return false;
  }
};

export const uploadPluginTar = () => {};

export interface DepFetch {
  status: "ok" | "error";
  reason?: string;
  deps?: Array<Manifest>;
}

export const getDependenciesForManifest = async (
  manifest: Manifest,
  seen = {}
): Promise<DepFetch> => {
  let deps = [];
  const pluginList = pluginMapToList(manifest.imports);
  for (let pluginName in manifest.imports) {
    if (seen[pluginName]) {
      return {
        status: "error",
        reason: `cyclic dependency imports in ${pluginName}`,
      };
    }
    try {
      // check if is dev plug
      // if dev do nothing
      // if not dev, see if exists locally
      // if not exists local, then download
      const pluginManifest = await getPluginManifest(pluginName, pluginList);
      const depResult = await getDependenciesForManifest(pluginManifest, {
        ...seen,
        [manifest.name]: true,
      });
      if (depResult.status == "error") {
        return depResult;
      }
      deps.push(pluginManifest, ...depResult.deps);
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

const coalesceDependencyVersions = (
  deps: Array<Manifest>
): {
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
  deps: Array<Manifest>
): Promise<VerifyDepsResult> => {
  const depsMap = coalesceDependencyVersions(deps);
  for (let pluginName in depsMap) {
    if (depsMap[pluginName].length == 0) {
      continue;
    }
    for (let i = 1; i < depsMap[pluginName].length; ++i) {
      const lastManifest = await getPluginManifest(pluginName, [
        {
          key: pluginName,
          value: depsMap[pluginName][i - 1],
        },
      ]);
      const nextManifest = await getPluginManifest(pluginName, [
        {
          key: pluginName,
          value: depsMap[pluginName][i],
        },
      ]);
      const lastDeps = await getDependenciesForManifest(lastManifest);
      if (lastDeps.status == "error") {
        return {
          isValid: false,
          status: "error",
          reason: "dep_fetch",
          pluginName,
          pluginVersion: depsMap[pluginName][i - 1],
        };
      }
      const nextDeps = await getDependenciesForManifest(nextManifest);
      if (nextDeps.status == "error") {
        return {
          isValid: false,
          status: "error",
          reason: "dep_fetch",
          pluginName,
          pluginVersion: depsMap[pluginName][i],
        };
      }
      const lastSchemaMap = manifestListToSchemaMap([
        lastManifest,
        ...lastDeps.deps,
      ]);
      const nextSchemaMap = manifestListToSchemaMap([
        nextManifest,
        ...nextDeps.deps,
      ]);
      const areCompatible = pluginManifestIsSubsetOfManifest(
        lastSchemaMap,
        nextSchemaMap,
        pluginName
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

export const getSchemaMapForCreationManifest = async (
  manifest: Manifest
): Promise<{ [key: string]: Manifest } | null> => {
  const depResult = await getDependenciesForManifest(manifest);
  if (depResult.status == "error") {
    return null;
  }
  const areValid = await verifyPluginDependencyCompatability(depResult.deps);
  if (!areValid.isValid) {
    return null;
  }
  const depsMap = coalesceDependencyVersions(depResult.deps);
  let out = {};
  for (let pluginName in depsMap) {
    const maxVersion = depsMap[pluginName][depsMap[pluginName].length - 1];
    const depManifest = depResult.deps.find((v) => v.version == maxVersion);
    out[depManifest.name] = depManifest;
  }
  out[manifest.name] = manifest;
  return out;
};

export const validatePluginManifest = async (manifest: Manifest) => {
  try {
    if (containsCyclicTypes(manifest, manifest.store)) {
      return {
        status: "error",
        message: `${manifest.name}'s schema contains cyclic types, consider using references`,
      };
    }
    const depResult = await getDependenciesForManifest(manifest);
    if (depResult.status == "error") {
      return {
        status: "error",
        message: depResult.reason,
      };
    }
    const areValid = await verifyPluginDependencyCompatability(depResult.deps);
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

    const schemaMap = await getSchemaMapForCreationManifest(manifest);
    const expandedTypes = getExpandedTypesForPlugin(schemaMap, manifest.name);
    const rootSchemaMap = getRootSchemaMap(schemaMap);
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
