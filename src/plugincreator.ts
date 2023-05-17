import fs from "fs";
import path from "path";
import tar from "tar";
import {
  copyDirectory,
  existsAsync,
  getPluginsJsonAsync,
  getRemoteHostAsync,
  getUserSessionAsync,
  vDEVPath,
  vTMPPath,
  writePluginsJsonAsync,
} from "./filestructure";
import {
  getDependenciesForManifest,
  Manifest,
  getRootSchemaMap,
  getExpandedTypesForPlugin,
  collectKeyRefs,
  buildPointerReturnTypeMap,
  buildPointerArgsMap,
  drawMakeQueryRef,
  drawSchemaRoot,
  drawGetPluginStore,
  verifyPluginDependencyCompatability,
  getUpstreamDependencyManifests,
  pluginManifestsAreCompatibleForUpdate,
  validatePluginManifest,
  TypeStruct,
  getDiffablesList,
  drawDiffableQueryTypes,
  drawSchematicTypes,
  drawPointerTypes,
  drawProviderApiCode,
  drawUseFloroStateFunction,
  drawUseWasAddedFunction,
  drawUseWasRemovedFunction,
  drawUseIsFloroInvalidFunction,
  drawUseHasConflictFunction,
  drawUseWasChangedFunction,
  drawUseHasIndicationFunction,
  drawUseReferencedObjectFunction,
  drawGetReferencedObjectFunction,
  GENERATED_CODE_FUNCTIONS,
  drawExtractQueryArguments,
  coalesceDependencyVersions,
  drawBinaryUploadAndDownloadCode,
} from "./plugins";
import clc from "cli-color";
import { exec } from "child_process";
import axios from "axios";
import FormData from "form-data";
import inquirer from "inquirer";
import { DataSource, makeMemoizedDataSource } from "./datasource";

axios.defaults.validateStatus = function () {
  return true;
};

export const PLUGIN_REGEX = /^[a-z0-9-][a-z0-9-_]{2,20}$/;

export const checkDirectoryIsPluginWorkingDirectory = async (
  cwd: string
): Promise<boolean> => {
  const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
  return await existsAsync(floroManifestPath);
};

export const buildFloroTemplate = async (
  cwd: string,
  name: string
): Promise<void> => {
  if (!name || !PLUGIN_REGEX.test(name)) {
    console.log(clc.redBright.bgBlack.underline("Invalid plugin name"));
    return;
  }
  const defaultBuiltPath = path.join(cwd, name);
  const defaultExists = await existsAsync(defaultBuiltPath);
  if (defaultExists) {
    console.log(
      clc.redBright.bgBlack.underline(
        "cannot build in this directory. " +
          defaultBuiltPath +
          " already exists."
      )
    );
    return;
  }
  const defaultDisplayName = name[0].toUpperCase() + name.substring(1);
  const { displayName } = await inquirer.prompt({
    type: "input",
    name: "displayName",
    message: "What should the display name of your plugin be?",
    default: defaultDisplayName,
  });

  const pluginsJSON = await getPluginsJsonAsync();
  let defaultPort = 2000;
  let maxPort = Math.max(
    ...(Object.keys(pluginsJSON.plugins)
      .map((k) => pluginsJSON.plugins?.[k]?.host)
      ?.filter((v) => !!v)
      ?.map((v) => v?.split?.(":")?.[(v?.split?.(":").length ?? 0) - 1])
      ?.filter((v) => !!v)
      ?.map((v) => parseInt(v)) ?? [defaultPort])
  );
  for (let pluginName in pluginsJSON.plugins) {
    if (pluginsJSON.plugins[pluginName]?.host?.endsWith?.(":" + defaultPort)) {
      defaultPort = maxPort + 1;
      break;
    }
  }
  const { port } = await inquirer.prompt({
    type: "number",
    name: "port",
    message: "What port will you run your plugin on during development?",
    default: defaultPort,
  });
  for (let pluginName in pluginsJSON.plugins) {
    if (pluginsJSON.plugins[pluginName]?.host?.endsWith?.(":" + port)) {
      console.log(
        clc.redBright.bgBlack.underline("port already in use by " + pluginName)
      );
      return;
    }
  }
  let { description } = await inquirer.prompt({
    type: "input",
    name: "description",
    message: "Write a description for what your plugin does.",
    default: "Will add later.",
  });
  if (!description) {
    description = "";
  }
  const templatePath = path.join(__dirname, "..", "..", "plugin_template");
  const templateSrcPath = path.join(templatePath, "src");
  const templateFloroPath = path.join(templatePath, "floro");
  const files = await Promise.all([
    ...(await fs.promises.readdir(templatePath)),
    ...(
      await fs.promises.readdir(templateSrcPath)
    ).map((p) => path.join("src", p)),
    ...(
      await fs.promises.readdir(templateFloroPath)
    ).map((p) => path.join("floro", p)),
  ]);
  await fs.promises.mkdir(defaultBuiltPath);
  for (const fname of files) {
    const templateFilePath = path.join(templatePath, fname);
    const lstat = await fs.promises.lstat(templateFilePath);
    const writePath = path
      .join(defaultBuiltPath, fname)
      .replace(".template", "");
    if (lstat.isDirectory()) {
      await fs.promises.mkdir(writePath);
    } else {
      const contents = await fs.promises.readFile(templateFilePath, "utf-8");
      const replaced = contents
        .replaceAll("PLUGIN_NAME", name)
        .replaceAll("PLUGIN_PORT", port)
        .replaceAll("PLUGIN_DISPLAY_NAME", displayName)
        .replaceAll("PLUGIN_DESCRIPTION", description);

      await fs.promises.writeFile(writePath, replaced);
    }
  }
  pluginsJSON.plugins[name] = {
    proxy: true,
    host: "http://localhost:" + defaultPort,
  };
  await writePluginsJsonAsync(pluginsJSON);
  console.log(clc.cyanBright.bgBlack.underline("Successfully added " + name));
  console.log(clc.cyanBright.bgBlack.underline("Restarting daemon."));
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

export const validateLocalManifest = async (cwd: string) => {
  const isPluginDir = await checkDirectoryIsPluginWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro plugin directory")
    );
    return false;
  }
  try {
    const datasource = makeMemoizedDataSource();
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const manifest = JSON.parse(floroManifestString.toString());
    const result = await validatePluginManifest(
      datasource,
      manifest as Manifest
    );
    if (result.status == "error") {
      console.log(result.message);
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getLocalManifestReadFunction = async (cwd: string) => {
  const isPluginDir = await checkDirectoryIsPluginWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro plugin directory")
    );
    return null;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const manifest = JSON.parse(floroManifestString.toString());
    const datasource = makeMemoizedDataSource();
    return async (pluginName, pluginVersion) => {
      if (pluginName == manifest.name && pluginVersion == manifest.version) {
        return manifest;
      }
      return await datasource.getPluginManifest(pluginName, pluginVersion);
    };
  } catch (e) {
    return null;
  }
};
export const inspectLocalManifest = async (
  cwd: string,
  expand = false
): Promise<TypeStruct|{[key: string]: Manifest}> => {
  const datasource = makeMemoizedDataSource();
  const isPluginDir = await checkDirectoryIsPluginWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro plugin directory")
    );
    return null;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const manifest = JSON.parse(floroManifestString.toString());
    const schemaMap = await getSchemaMapForCreationManifest(
      datasource,
      manifest,
    );
    if (expand) {
      const rootSchemaMap = await getRootSchemaMap(datasource, schemaMap);
      return rootSchemaMap;
    }
    return schemaMap;
  } catch (e) {
    return null;
  }
};

export const pullLocalDeps = async (
  cwd: string,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
) => {
  const isPluginDir = await checkDirectoryIsPluginWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro plugin directory")
    );
    return false;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const manifest = JSON.parse(floroManifestString.toString());
    const imports = manifest?.imports ?? {};
    for (let depName in imports) {
      await pluginFetch(depName, imports[depName]);
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const exportPluginToDev = async (cwd: string) => {
  const canExport = canExportPlugin(cwd);
  if (!canExport) {
    return false;
  }
  try {
    await new Promise((resolve, reject) => {
      if (process.env.NODE_ENV == "test") {
        resolve("testing");
        return;
      } else {
        console.log("packaging plugin...");
      }
      exec(
        "CDN_HOST=http://localhost:63403 npm run floro:package",
        { cwd },
        (err, stdout) => {
          if (err) {
            console.error("something went wrong while packaging!");
            reject(err);
            return;
          }
          console.log(stdout);
          resolve(stdout);
        }
      );
    });
    if (process.env.NODE_ENV != "test") {
      console.log("done packaging");
    }

    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const floroManifest = JSON.parse(floroManifestString.toString());
    const pluginName = floroManifest.name;
    const pluginVersion = floroManifest.version;
    const devPathDir = path.join(vDEVPath, pluginName);
    const devVersionPathDir = path.join(devPathDir, pluginVersion);
    const devVersionPathExists = await existsAsync(devVersionPathDir);
    if (devVersionPathExists) {
      await fs.promises.rm(devVersionPathDir, { recursive: true });
    }
    await fs.promises.mkdir(devVersionPathDir, { recursive: true });
    const sourceManifestDirPath = path.join(cwd, "floro");
    const destManifestDirPath = path.join(devVersionPathDir, "floro");
    const sourceIndexHTMLPath = path.join(cwd, "dist", "index.html");
    const destIndexHTMLPath = path.join(devVersionPathDir, "index.html");
    const sourceAssetsPath = path.join(cwd, "dist", "assets");
    const destAssetsPath = path.join(devVersionPathDir, "assets");
    await copyDirectory(sourceManifestDirPath, destManifestDirPath);
    await fs.promises.copyFile(sourceIndexHTMLPath, destIndexHTMLPath);
    await copyDirectory(sourceAssetsPath, destAssetsPath);
    return true;
  } catch (e) {
    return false;
  }
};

export const installDependency = async (
  cwd: string,
  depname: string
): Promise<Manifest | null> => {
  const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
  const floroManifestString = await fs.promises.readFile(floroManifestPath);
  const manifest = JSON.parse(floroManifestString.toString());
  const [pluginName, version] = depname.split("@");
  let depManifest: Manifest | undefined;
  const remote = await getRemoteHostAsync();
  const session = await getUserSessionAsync();
  const manifestRequest = await axios.get(
    `${remote}/api/plugin/${pluginName}/${version ?? "last"}/manifest`,
    {
      headers: {
        ["session_key"]: session?.clientKey,
      },
    }
  );
  if (manifestRequest.status == 403) {
    console.log(
      clc.redBright.bgBlack.underline("Forbidden access to " + depname)
    );
    return null;
  }
  if (manifestRequest.status == 404) {
    console.log(clc.redBright.bgBlack.underline("Could not find " + depname));
    return null;
  }
  if (manifestRequest.status == 200) {
    depManifest = manifestRequest.data;
  }
  if (!depManifest) {
    return null;
  }

  const datasource = makeMemoizedDataSource();
  const memoizedDataSource = makeMemoizedDataSource({
    getPluginManifest: async (pluginName, pluginVersion) => {
      const localCopy = await datasource.getPluginManifest(pluginName, pluginVersion);
      if (localCopy) {
        return localCopy;
      }
      const request = await axios.get(
        `${remote}/api/plugin/${pluginName}/${version}/manifest`,
        {
          headers: {
            ["session_key"]: session?.clientKey,
          },
        }
      );
      if (request.status == 200) {
        return request.data;
      }
      return null;

    },
  });
  const dependencyManifests = await getUpstreamDependencyManifests(
    memoizedDataSource,
    depManifest
  );
  if (!dependencyManifests) {
    console.log(
      clc.redBright.bgBlack.underline("Failed to fetch deps for " + depname)
    );
    return null;
  }
  const proposedManifest = { ...manifest, imports: { ...manifest.imports } };
  for (const upstreamManifest of dependencyManifests) {
    proposedManifest.imports[upstreamManifest.name] = upstreamManifest.version;
  }

  const areCompatible = await pluginManifestsAreCompatibleForUpdate(
    memoizedDataSource,
    manifest,
    proposedManifest
  );
  if (!areCompatible) {
    console.log(
      clc.redBright.bgBlack.underline(
        depname +
          " is incompatible with other dependencies. Please specifiy a different version or remove conflicting dependencies."
      )
    );
    return null;
  }
  const imports = [...Object.keys(manifest.imports), depManifest.name]
    .sort()
    .reduce((acc, pluginName) => {
      if (pluginName == depManifest.name) {
        return {
          ...acc,
          [pluginName]: depManifest.version,
        };
      }
      return {
        ...acc,
        [pluginName]: manifest.imports[pluginName],
      };
    }, {});
  manifest.imports = imports;
  await fs.promises.writeFile(
    floroManifestPath,
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );
  return manifest;
};

export const tarCreationPlugin = async (
  cwd: string
): Promise<null | string> => {
  const canExport = canExportPlugin(cwd);
  if (!canExport) {
    return null;
  }
  try {
    await new Promise((resolve, reject) => {
      if (process.env.NODE_ENV != "test") {
        console.log("packaging plugin...");
      }
      if (process.env.NODE_ENV == "test") {
        resolve("testing");
        return;
      }
      exec(
        "CDN_HOST=http://localhost:63403 npm run build",
        { cwd },
        (err, stdout) => {
          if (err) {
            console.error("something went wrong while packaging!");
            reject(err);
            return;
          }
          console.log(stdout);
          resolve(stdout);
        }
      );
    });
    if (process.env.NODE_ENV != "test") {
      console.log("done packaging");
    }
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
      await fs.promises.rm(buildPathDir, { recursive: true });
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
        C: buildPathDir,
        portable: true,
      },
      await fs.promises.readdir(buildPathDir)
    );
    return tarFile;
  } catch (e) {
    return null;
  }
};

export const uploadPluginTar = async (tarPath: string) => {
  try {
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const formData = new FormData();
    formData.append("file", fs.createReadStream(tarPath));
    const didSucceed = await axios
      .post(`${remote}/api/plugin/upload`, formData, {
        headers: {
          ["session_key"]: session?.clientKey,
          "Content-Type": "multipart/form-data",
        },
      })
      .then((response) => {
        if (response.status == 200) {
          return true;
        }
        if (response?.data?.message) {
          console.log(response?.data?.message);
        } else {
          console.log("Unknown upload error");
        }
        return false;
      });
    return didSucceed;
  } catch (e) {
    console.log("Unknown upload error");
    return false;
  }
};

export interface DepFetch {
  status: "ok" | "error";
  reason?: string;
  deps?: Array<Manifest>;
}

export const getSchemaMapForCreationManifest = async (
  datasource: DataSource,
  manifest: Manifest,
): Promise<{ [key: string]: Manifest } | null> => {
  // switch to getUpstreamDependencies
  const depResult = await getDependenciesForManifest(datasource, manifest);
  if (depResult.status == "error") {
    return null;
  }
  const areValid = await verifyPluginDependencyCompatability(
    datasource,
    depResult.deps
  );
  if (!areValid.isValid) {
    return null;
  }
  const depsMap = coalesceDependencyVersions(depResult.deps);
  let out = {};
  for (let pluginName in depsMap) {
    const maxVersion = depsMap[pluginName][depsMap[pluginName].length - 1];
    const depManifest = depResult.deps.find((v) => v.version == maxVersion && v.name == pluginName);
    out[depManifest.name] = depManifest;
  }
  out[manifest.name] = manifest;
  return out;
};

export const generateLocalTypescriptAPI = async (
  cwd: string,
  useReact = true,
): Promise<boolean> => {
  const datasource = makeMemoizedDataSource();
  const isPluginDir = await checkDirectoryIsPluginWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro plugin directory")
    );
    return false;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const manifest = JSON.parse(floroManifestString.toString());
    const code = await generateTypeScriptAPI(datasource, manifest, useReact);
    if (code) {
      const writeApiPath = path.join(cwd, "src", "floro-schema-api.tsx");
      if (await existsAsync(writeApiPath)) {
        await fs.promises.rm(writeApiPath);
      }
      await fs.promises.writeFile(writeApiPath, code, "utf-8");
      return true;
    }
    return false;
  } catch (e) {
    console.log("E", e)
    return false;
  }
};

export const generateTypeScriptAPI = async (
  datasource: DataSource,
  manifest: Manifest,
  useReact = true
): Promise<string> => {

  const schemaMap = await getSchemaMapForCreationManifest(
    datasource,
    manifest,
  );
  const rootSchemaMap = await getRootSchemaMap(datasource, schemaMap);
  const referenceKeys = collectKeyRefs(rootSchemaMap);
  const expandedTypes = getExpandedTypesForPlugin(schemaMap, manifest.name);
  const referenceReturnTypeMap = buildPointerReturnTypeMap(
    rootSchemaMap,
    expandedTypes,
    referenceKeys
  );
  const referenceArgsMap = buildPointerArgsMap(referenceReturnTypeMap);
  const diffableListWithoutPartials = getDiffablesList(
    rootSchemaMap,
    referenceReturnTypeMap,
  );

  const diffableListWithPartials = getDiffablesList(
    rootSchemaMap,
    referenceReturnTypeMap,
    true
  );

  let code = useReact ? "import React, { useEffect, createContext, useMemo, useCallback, useState, useContext, useRef } from 'react';\n\n" : "";
  code += "export type FileRef = `${string}.${string}`;\n\n";

  const partialDiffableQueryTypes = drawDiffableQueryTypes(
    diffableListWithPartials,
    true
  );

  code += partialDiffableQueryTypes + "\n\n";
  const diffableQueryTypes = drawDiffableQueryTypes(
    diffableListWithoutPartials,
    false
  );
  code += diffableQueryTypes + "\n\n";

  const schemaTypesCode = drawSchematicTypes(
    diffableListWithPartials,
    rootSchemaMap,
    referenceReturnTypeMap,
  );
  code += schemaTypesCode + "\n\n";

  const pointerTypesCode = drawPointerTypes(
    diffableListWithPartials,
  );
  code += pointerTypesCode + "\n\n";

  const schemaRootCode = drawSchemaRoot(rootSchemaMap, referenceReturnTypeMap);
  code += schemaRootCode + "\n\n";

  const providerCode = drawProviderApiCode();
  code += providerCode;

  code += GENERATED_CODE_FUNCTIONS + "\n\n";

  const queryTypesCode = drawMakeQueryRef(referenceArgsMap, useReact);
  code += queryTypesCode + "\n\n";

  const extractArgsCode = drawExtractQueryArguments(referenceArgsMap, useReact);
  code += extractArgsCode;

  const getPluginStoreCode = drawGetPluginStore(
    rootSchemaMap,
    useReact
  );
  code += getPluginStoreCode;


  const getReferencedObjectCode = drawGetReferencedObjectFunction(diffableListWithPartials);
  code += getReferencedObjectCode + "\n";

  const useReferencedObjectCode = drawUseReferencedObjectFunction(diffableListWithPartials);
  code += useReferencedObjectCode + "\n";

  const useFloroStateCode = drawUseFloroStateFunction(diffableListWithPartials);
  code += useFloroStateCode;

  const useFloroIsInvalidCode = drawUseIsFloroInvalidFunction(diffableListWithPartials);
  code += useFloroIsInvalidCode;

  const useWasAddedCode = drawUseWasAddedFunction(diffableListWithPartials);
  code += useWasAddedCode;

  const useWasRemovedCode = drawUseWasRemovedFunction(diffableListWithPartials);
  code += useWasRemovedCode;

  const useHasConflictCode = drawUseHasConflictFunction(diffableListWithPartials);
  code += useHasConflictCode;

  const useWasChangedCode = drawUseWasChangedFunction(diffableListWithPartials);
  code += useWasChangedCode;

  const useHasIndicationCode = drawUseHasIndicationFunction(diffableListWithPartials);
  code += useHasIndicationCode;

  const uploadDownloadCode = drawBinaryUploadAndDownloadCode();
  code += uploadDownloadCode;

  return code;
};
