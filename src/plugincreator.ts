import fs from "fs";
import path from "path";
import tar from "tar";
import {
  copyDirectory,
  existsAsync,
  getPluginsJsonAsync,
  getRemoteHostAsync,
  getUserSession,
  getUserSessionAsync,
  vDEVPath,
  vTMPPath,
  writePluginsJsonAsync,
} from "./filestructure";
import {
  getPluginManifest,
  getDependenciesForManifest,
  Manifest,
  manifestListToSchemaMap,
  pluginManifestIsSubsetOfManifest,
  pluginMapToList,
  containsCyclicTypes,
  getRootSchemaMap,
  getExpandedTypesForPlugin,
  isSchemaValid,
  invalidSchemaPropsCheck,
  collectKeyRefs,
  buildPointerReturnTypeMap,
  buildPointerArgsMap,
  drawMakeQueryRef,
  drawSchemaRoot,
  drawRefReturnTypes,
  drawGetReferencedObject,
  drawGetPluginStore,
  verifyPluginDependencyCompatability,
} from "./plugins";
import clc from "cli-color";
import semver from "semver";
import { exec } from "child_process";
import axios from "axios";
import FormData from "form-data";
import { Blob } from "buffer";
import inquirer from "inquirer";

export const PLUGIN_REGEX = /^[a-z0-9-][a-z0-9-_]{2,20}$/

export const checkDirectoryIsPluginWorkingDirectory = async (
  cwd: string
): Promise<boolean> => {
  const floroManifestPath = path.join(cwd, "floro", "floro.manifest.json");
  return await existsAsync(floroManifestPath);
};

export const buildFloroTemplate = async (cwd: string, name: string): Promise<void> => {
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
  console.log(
    clc.cyanBright.bgBlack.underline("Successfully added " + name)
  );
  console.log(
    clc.cyanBright.bgBlack.underline("Restarting daemon.")
  )
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
    await new Promise((resolve, reject) => {
      console.log("packaging plugin...");
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
    console.log("done packaging");

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

export const tarCreationPlugin = async (
  cwd: string
): Promise<null | string> => {
  const canExport = canExportPlugin(cwd);
  if (!canExport) {
    return null;
  }
  try {
    await new Promise((resolve, reject) => {
      console.log("packaging plugin...");
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
    console.log("done packaging");
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
    const buffer = await fs.promises.readFile(tarPath);
    const blob = new Blob([Uint8Array.from(buffer)]);
    formData.append("file", fs.createReadStream(tarPath));
    await axios.post(`${remote}/api/plugin/upload`, formData, {
      headers: {
        ["session_key"]: session?.clientKey,
        "Content-Type": "multipart/form-data",
      },
    });
    console.log("HERE");
    ///reader.readAsBinaryString(new Blob([await fs.promises.readFile(tarPath)]))
  } catch (e) {
    console.log("e", e);
  }
};

export interface DepFetch {
  status: "ok" | "error";
  reason?: string;
  deps?: Array<Manifest>;
}

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

export const getSchemaMapForCreationManifest = async (
  manifest: Manifest,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
): Promise<{ [key: string]: Manifest } | null> => {
  // switch to getUpstreamDependencies
  const depResult = await getDependenciesForManifest(manifest, pluginFetch);
  if (depResult.status == "error") {
    return null;
  }
  const areValid = await verifyPluginDependencyCompatability(
    depResult.deps,
    pluginFetch
  );
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

export const generateTypeScriptAPI = async (
  manifest: Manifest,
  useReact = true,

  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
): Promise<string> => {
  const schemaMap = await getSchemaMapForCreationManifest(
    manifest,
    pluginFetch
  );
  const rootSchemaMap = getRootSchemaMap(schemaMap);
  const referenceKeys = collectKeyRefs(rootSchemaMap);
  const expandedTypes = getExpandedTypesForPlugin(schemaMap, manifest.name);
  const referenceReturnTypeMap = buildPointerReturnTypeMap(
    rootSchemaMap,
    expandedTypes,
    referenceKeys
  );
  const referenceArgsMap = buildPointerArgsMap(referenceReturnTypeMap);

  let code = useReact ? "import { useMemo } from 'react';\n\n" : "";
  const queryTypesCode = drawMakeQueryRef(referenceArgsMap, useReact);
  code += queryTypesCode + "\n\n";
  const schemaRootCode = drawSchemaRoot(rootSchemaMap, referenceReturnTypeMap);
  code += schemaRootCode + "\n\n";
  const refReturnTypesCode = drawRefReturnTypes(
    rootSchemaMap,
    referenceReturnTypeMap
  );
  code += refReturnTypesCode;
  const getReferenceObjectCode = drawGetReferencedObject(
    referenceArgsMap,
    useReact
  );
  code += getReferenceObjectCode + "\n\n";
  const getReferencePluginStoreCode = drawGetPluginStore(
    rootSchemaMap,
    useReact
  );
  code += getReferencePluginStoreCode;
  return code;
};
