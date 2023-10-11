import fs from "fs";
import axios from "axios";
import path from "path";
import {
  existsAsync, getRemoteHostAsync, getUserSessionAsync,
} from "./filestructure";
import clc from "cli-color";
import { DataSource, makeMemoizedDataSource } from "./datasource";
import {
  GENERATOR_HELPER_FUNCTIONS,
  Manifest,
  TypeStruct,
  buildPointerArgsMap,
  buildPointerReturnTypeMap,
  collectKeyRefs,
  drawExtractQueryArguments,
  drawGetReferencedObjectFunction,
  drawMakeQueryRef,
  drawPointerTypes,
  drawSchemaRoot,
  drawSchematicTypes,
  getDiffablesList,
  getExpandedTypesForSchemaMapWithDependencies,
  getRootSchemaMap,
  getSchemaMapForGeneratorManifest,
  getUpstreamDependencyManifests,
  getUpstreamDependencyManifestsForGeneratorManifest,
  isSchemaValid,
  pluginManifestsAreCompatibleForGeneratorUpdate,
  verifyPluginDependencyCompatability,
} from "./plugins";
import inquirer from "inquirer";

export const GENERATOR_NAME_REGEX = /^[a-z0-9-][a-z0-9-_]{2,100}$/;

// entryFile ./dist/index.js
// outDir ./exports

axios.defaults.validateStatus = function () {
  return true;
};

export interface GeneratorManifest {
    name: string;
    entryFileFromRoot?: string;
    outDirFromRoot?: string;
    dependencies: {
        [pluginName: string]: string
    };
}

export const checkDirectoryIsGeneratorWorkingDirectory = async (
  cwd: string
): Promise<boolean> => {
  const floroGeneratorManifestPath = path.join(cwd, "floro", "floro.generator.json");
  return await existsAsync(floroGeneratorManifestPath);
};


export const buildFloroGeneratorTemplate = async (
  cwd: string,
  name: string
): Promise<void> => {
  if (!name || !GENERATOR_NAME_REGEX.test(name)) {
    console.log(clc.redBright.bgBlack.underline("Invalid generator name"));
    return;
  }
  if (!name.endsWith("generator")) {
    const { updateName } = await inquirer.prompt({
      type: `confirm`,
      name: 'updateName',
      message: `By convention generator names end in "-generator". Do you want to update your project name to "${name}-generator"?`
    });
    if (updateName) {
      name = name + "-generator";
    }
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
  const templatePath = path.join(__dirname, "..", "..", "generator_template");
  const templateSrcPath = path.join(templatePath, "src");
  const templateFloroPath = path.join(templatePath, "floro");
  const templateTestPath = path.join(templatePath, "test");
  const templateMocksPath = path.join(templatePath, "__mocks__");
  const templateMockFsPath = path.join(templateMocksPath, "fs");
  const files = await Promise.all([
    ...(await fs.promises.readdir(templatePath)),
    ...(
      await fs.promises.readdir(templateSrcPath)
    ).map((p) => path.join("src", p)),
    ...(
      await fs.promises.readdir(templateFloroPath)
    ).map((p) => path.join("floro", p)),
    ...(
      await fs.promises.readdir(templateTestPath)
    ).map((p) => path.join("test", p)),
    ...(
      await fs.promises.readdir(templateMocksPath)
    ).map((p) => path.join("__mocks__", p)),
    ...(
      await fs.promises.readdir(templateMockFsPath)
    ).map((p) => path.join("__mocks__", "fs", p)),
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
        .replaceAll("GENERATOR_NAME", name)

      await fs.promises.writeFile(writePath, replaced);
    }
  }
  console.log(clc.cyanBright.bgBlack.underline("Successfully created generator " + name));
};


export const inspectLocalGeneratorManifest = async (
  cwd: string,
  expand = false
): Promise<TypeStruct|{[key: string]: Manifest}> => {
  const datasource = makeMemoizedDataSource();
  const isPluginDir = await checkDirectoryIsGeneratorWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro generator directory")
    );
    return null;
  }
  try {
    const floroManifestPath = path.join(cwd, "floro", "floro.generator.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const generatorManifest = JSON.parse(floroManifestString.toString());
    const schemaMap = await getSchemaMapForGeneratorManifest(
      datasource,
      generatorManifest,
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

export const pullGeneratorDeps = async (
  cwd: string,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
) => {
  const isGeneratorDir = await checkDirectoryIsGeneratorWorkingDirectory(cwd);
  if (!isGeneratorDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro generator directory")
    );
    return false;
  }
  try {
    const floroGeneratorPath = path.join(cwd, "floro", "floro.generator.json");
    const floroGeneratorString = await fs.promises.readFile(floroGeneratorPath);
    const generatorFile = JSON.parse(floroGeneratorString.toString()) as GeneratorManifest;
    const dependencies = generatorFile?.dependencies ?? {};
    for (let depName in dependencies) {
      await pluginFetch(depName, dependencies[depName]);
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const installGeneratorDependency = async (
  cwd: string,
  depname: string
): Promise<GeneratorManifest | null> => {
  const floroGeneratorPath = path.join(cwd, "floro", "floro.generator.json");
  const floroGeneratorString = await fs.promises.readFile(floroGeneratorPath);
  const generatorManifest = JSON.parse(floroGeneratorString.toString()) as GeneratorManifest;
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
  const proposedGenerator: GeneratorManifest = { ...generatorManifest, dependencies: { ...generatorManifest.dependencies } };
  for (const upstreamManifest of dependencyManifests) {
    proposedGenerator.dependencies[upstreamManifest.name] = upstreamManifest.version;
  }

  const areCompatible = await pluginManifestsAreCompatibleForGeneratorUpdate(
    memoizedDataSource,
    generatorManifest,
    proposedGenerator
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
  const dependencies = [...Object.keys(generatorManifest.dependencies), depManifest.name]
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
        [pluginName]: generatorManifest.dependencies[pluginName],
      };
    }, {});
  generatorManifest.dependencies = dependencies;
  await fs.promises.writeFile(
    floroGeneratorPath,
    JSON.stringify(generatorManifest, null, 2),
    "utf-8"
  );
  return generatorManifest;
}

export const validateLocalGenerator = async (cwd: string) => {
  const isPluginDir = await checkDirectoryIsGeneratorWorkingDirectory(cwd);
  if (!isPluginDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro generator directory")
    );
    return false;
  }
  try {
    const datasource = makeMemoizedDataSource();
    const floroManifestPath = path.join(cwd, "floro", "floro.generator.json");
    const floroManifestString = await fs.promises.readFile(floroManifestPath);
    const generatorManifest = JSON.parse(floroManifestString.toString());
    const result = await validateGeneratorManifest(
      datasource,
      generatorManifest as GeneratorManifest
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

export const validateGeneratorManifest = async (
  datasource: DataSource,
  generatorManifest: GeneratorManifest
) => {
  try {
    const deps = await getUpstreamDependencyManifestsForGeneratorManifest(datasource, generatorManifest);
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

    const schemaMap = await getSchemaMapForGeneratorManifest(datasource, generatorManifest);
    if (!schemaMap) {
      return {
        status: "error",
        message: "failed to construct schema map",
      };
    }
    const expandedTypes = getExpandedTypesForSchemaMapWithDependencies(schemaMap, generatorManifest.dependencies);
    const rootSchemaMap = (await getRootSchemaMap(datasource, schemaMap)) ?? {};
    const validSchema =  isSchemaValid(
      rootSchemaMap,
      schemaMap,
      rootSchemaMap,
      expandedTypes
    );
    return validSchema;
  } catch (e) {
    return {
      status: "error",
      message: e?.toString?.() ?? "unknown error",
    };
  }
};

export const generateLocalTypescriptGeneratorAPI = async (
  cwd: string,
  useReact = true,
): Promise<boolean> => {
  const datasource = makeMemoizedDataSource();
  const isGeneratorDir = await checkDirectoryIsGeneratorWorkingDirectory(cwd);
  if (!isGeneratorDir) {
    console.log(
      clc.redBright.bgBlack.underline("Invalid floro generator directory")
    );
    return false;
  }
  try {
    const floroGeneratorManifestPath = path.join(cwd, "floro", "floro.generator.json");
    const floroGeneratorManifestString = await fs.promises.readFile(floroGeneratorManifestPath);
    const generatorManifest = JSON.parse(floroGeneratorManifestString.toString()) as GeneratorManifest;
    const code = await generateTypeScriptGeneratorAPI(datasource, generatorManifest);
    if (code) {
      const writeApiPath = path.join(cwd, "src", "floro-generator-schema-api.ts");
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
export const generateTypeScriptGeneratorAPI = async (
  datasource: DataSource,
  generatorManifest: GeneratorManifest,
): Promise<string> => {

  const schemaMap = await getSchemaMapForGeneratorManifest(
    datasource,
    generatorManifest,
  );
  const rootSchemaMap = await getRootSchemaMap(datasource, schemaMap);
  const referenceKeys = collectKeyRefs(rootSchemaMap);
  const expandedTypes = getExpandedTypesForSchemaMapWithDependencies(schemaMap, generatorManifest.dependencies);
  const referenceReturnTypeMap = buildPointerReturnTypeMap(
    rootSchemaMap,
    expandedTypes,
    referenceKeys
  );
  const referenceArgsMap = buildPointerArgsMap(referenceReturnTypeMap);
  const diffableListWithPartials = getDiffablesList(
    rootSchemaMap,
    referenceReturnTypeMap,
    true
  );

  let code = "";
  code += "export type FileRef = `${string}.${string}`;\n\n";

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

  code += GENERATOR_HELPER_FUNCTIONS;

  const queryTypesCode = drawMakeQueryRef(referenceArgsMap, false);
  code += queryTypesCode + "\n\n";

  const extractArgsCode = drawExtractQueryArguments(referenceArgsMap, false);
  code += extractArgsCode;

  const getReferencedObjectCode = drawGetReferencedObjectFunction(diffableListWithPartials);
  code += getReferencedObjectCode + "\n";

  return code;
}