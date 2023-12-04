import path from "path";
import { GeneratorManifest } from "./generatorcreator";
import axios from "axios";
import {
  existsAsync,
  getRemoteHostAsync,
  getUserSessionAsync,
  vBinariesPath,
  vPluginsPath,
} from "./filestructure";
import {
  Branch,
  RenderedApplicationState,
  RepoInfo,
  convertCommitStateToRenderedState,
  getCommitState,
} from "./repo";
import { makeDataSource, readDevPluginManifest } from "./datasource";
import {
  Manifest,
  getPluginManifests,
  getUpstreamDependencyManifestsForGeneratorManifest,
  manifestListToSchemaMap,
  pluginManifestIsSubsetOfManifest,
} from "./plugins";
import fs from "fs";
import { isBinaryFile } from "arraybuffer-isbinary";
import { createSocket } from "./socket";

export interface Generator {
  filename?: () => string;
  getFloroGenerator: () => GeneratorManifest;
  getJSON: (
    state: object,
    args: object,
    mode: "build" | "hot" | "live-update",
    assetAccessor: (binaryRef: string) => Promise<Buffer | string | null>
  ) => Promise<object>;
  generate: (
    state: object,
    outDir: string,
    args: object,
    assetAccessor: (binaryRef: string) => Promise<Buffer | string | null>
  ) => Promise<void>;
}

export interface Module {
  repository: `@${string}/${string}`;
  branch: string;
  moduleDir: string;
  metaFileName: `${string}.floro.json`;
  modulesOutDirectory: `floro_modules`;
  assetHost: string;
  generators: Array<{
    generator: Generator;
    args: object;
  }>;
}

export interface MetaFile {
  moduleFile: string;
  repositoryId: string;
  sha: string;
  message: string;
  idx: number;
  genratorDependencies: {
    [generatorName: string]: {
      [pluginName: string]: string;
    };
  };
}

export const syncModule = async (
  cwd: string,
  moduleFile: string,
  isLocal = false,
  apiKey?: string
) => {
  try {
    apiKey = apiKey ?? process.env?.["FLORO_REMOTE_API_KEY"];
    const modulePath = path.join(cwd, moduleFile);
    const moduleDir = path.dirname(modulePath);
    const exists = await existsAsync(modulePath);

    if (!exists) {
      return {
        status: "error",
        message: `Could not find floro module at "${modulePath}".`,
      };
    }
    const moduleImport = require(modulePath);
    const module: Module = moduleImport();
    if (!module.repository) {
      return {
        status: "error",
        message: `invalid repository name in "${moduleFile}".`,
      };
    }
    const [handleWithAt, repoName] = module?.repository.split("/") as [
      string,
      string
    ];
    if (!handleWithAt || !repoName) {
      return {
        status: "error",
        message: `invalid repository name in "${moduleFile}".`,
      };
    }
    if (handleWithAt[0] != "@") {
      return {
        status: "error",
        message: `invalid repository name in "${moduleFile}". Prefix repository handle with "@".`,
      };
    }
    const ownerHandle = handleWithAt.substring(1);

    const syncInfo = await fetchRepoSyncInfo(
      ownerHandle,
      repoName,
      apiKey,
      isLocal
    );
    if (!syncInfo) {
      return {
        status: "error",
        message: `failed to fetch module sync info`,
      };
    }
    if (!syncInfo.id) {
      return {
        status: "error",
        message: `No repository found when syncing for "${module.repository}".`,
      };
    }
    const brancName = module?.branch ?? "main";
    const moduleBranch = syncInfo.branches?.find(
      (b) => b.id?.toLowerCase() == brancName?.toLowerCase()
    );
    if (!moduleBranch) {
      return {
        status: "error",
        message: `Could not find "${brancName}" in synced info.`,
      };
    }
    if (!moduleBranch?.lastCommit) {
      return {
        status: "error",
        message: `Module branch does not have any commits. Sha is null.`,
      };
    }
    const syncState = await fetchRepoSyncState(
      syncInfo.id,
      moduleBranch?.lastCommit,
      apiKey,
      isLocal
    );
    if (!syncState) {
      return {
        status: "error",
        message: `Failed to fetch sync state.`,
      };
    }

    const repoManifests = await fetchRepoSyncManifests(
      syncInfo.id,
      moduleBranch?.lastCommit,
      apiKey,
      isLocal
    );
    if (!repoManifests) {
      return {
        status: "error",
        message: `Failed to fetch repository manifests.`,
      };
    }

    const repoSchemaMap = manifestListToSchemaMap(repoManifests);
    const getPluginManifest = async (
      pluginName: string,
      pluginValue: string
    ): Promise<Manifest> => {
      if (pluginValue.startsWith("dev")) {
        return await readDevPluginManifest(pluginName, pluginValue);
      }
      if (!pluginValue) {
        return null;
      }
      const pluginManifestPath = path.join(
        vPluginsPath(),
        pluginName,
        pluginValue,
        "floro",
        "floro.manifest.json"
      );
      const existsLocallly = await existsAsync(pluginManifestPath);
      if (existsLocallly) {
        const manifestString = await fs.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
      }
      return fetchSyncManifest(pluginName, pluginValue, apiKey, false);
    };
    const datasource = makeDataSource({ getPluginManifest });

    const visitedGenerators = new Set<string>();
    for (const [index, { generator }] of module.generators.entries()) {
      const generatorManifest = generator.getFloroGenerator();
      if (!generatorManifest) {
        return {
          status: "error",
          message: `Invalid generator, could not find generator manifest at index: ${index} in ${moduleFile} generators.`,
        };
      }
      if (!generatorManifest?.name) {
        return {
          status: "error",
          message: `Invalid generator, could not find name in generator manifest of generator at index: ${index} in ${moduleFile} generators.`,
        };
      }
      if (visitedGenerators.has(generatorManifest?.name?.toLowerCase())) {
        return {
          status: "error",
          message: `Duplicate generator "${generatorManifest?.name}" found at index: ${index} in ${moduleFile} generators.`,
        };
      }
      visitedGenerators.add(generatorManifest?.name?.toLowerCase());
      const deps = Object.keys(generatorManifest.dependencies).map(
        (pluginName) => {
          return {
            pluginName,
            pluginVersion: generatorManifest.dependencies[pluginName],
          };
        }
      );
      const generatorManifestList =
        await getUpstreamDependencyManifestsForGeneratorManifest(
          datasource,
          generatorManifest,
          true
        );
      for (const [index, manifest] of generatorManifestList.entries()) {
        const dep = deps[index];
        if (!manifest) {
          return {
            status: "error",
            message: `Failed to fetch manifest for dependency "${dep.pluginName} (version: ${dep.pluginName})" in "${generatorManifest?.name}" found at index: ${index} in ${moduleFile} generators.`,
          };
        }
      }

      const generatorSchemaMap = manifestListToSchemaMap(generatorManifestList);
      const tmpDataStore = makeDataSource({
        getPluginManifest: async (pluginName, pluginVersion) => {
          const result = (
            repoManifests?.find(
              (m) => m.name == pluginName && m.version == pluginVersion
            ) ??
            generatorManifestList.find(
              (m) => m.name == pluginName && m.version == pluginVersion
            )
          );
          if (result) {
            return result;
          }

          const pluginManifestPath = path.join(
            vPluginsPath(),
            pluginName,
            pluginVersion,
            "floro",
            "floro.manifest.json"
          );
          const existsLocallly = await existsAsync(pluginManifestPath);
          if (existsLocallly) {
            const manifestString = await fs.promises.readFile(pluginManifestPath);
            return JSON.parse(manifestString.toString());
          }
          return null;
        },
      });
      const isCompatible = await pluginManifestIsSubsetOfManifest(
        tmpDataStore,
        generatorSchemaMap,
        repoSchemaMap,
        true
      );
      if (!isCompatible) {
        return {
          status: "error",
          message: `Dependencies of "${generatorManifest?.name}" are incompatible with repository dependencies at sha "${moduleBranch.lastCommit}" found at index: ${index} in ${moduleFile} generators.`,
        };
      }
    }

    const genratorDependencies = module.generators.reduce((acc, generator) => {
      const generatorManifest = generator.generator.getFloroGenerator();
      return {
        ...acc,
        [generatorManifest.name]: generatorManifest.dependencies,
      };
    }, {});
    const metaFile = JSON.stringify(
      {
        moduleFile,
        repositoryId: syncInfo.id,
        sha: moduleBranch.lastCommit,
        message: syncState.commitInfo.message,
        idx: syncState.commitInfo.idx,
        genratorDependencies,
      } as MetaFile,
      null,
      2
    );
    const metaFileName = module?.metaFileName ?? "meta.floro.json";
    const metaFilePath = path.join(moduleDir, metaFileName);
    await fs.promises.writeFile(metaFilePath, metaFile, "utf8");
    return {
      status: "ok",
      message: `synced repo and wrote meta file to ${metaFilePath}`,
    };
  } catch (e) {
    console.log("Sync Error", e);
    return {
      status: "error",
      message: `Unknown sync error see console.`,
    };
  }
};

export const watchModule = async (
  cwd: string,
  moduleFile: string
): Promise<{ status: string; message: string }> => {
  try {
    const modulePath = path.join(cwd, moduleFile);
    const moduleDir = path.dirname(modulePath);
    const exists = await existsAsync(modulePath);

    if (!exists) {
      return {
        status: "error",
        message: `Could not find floro module at "${modulePath}".`,
      };
    }
    const moduleImport = require(modulePath);
    const module: Module = moduleImport();
    const metaFileName = module?.metaFileName ?? "meta.floro.json";
    const metaFilePath = path.join(moduleDir, metaFileName);
    const metaExists = await existsAsync(metaFilePath);
    if (!metaExists) {
      return {
        status: "error",
        message: `Could not find meta file "${metaFileName}". Try syncing (floro module sync) before watching.`,
      };
    }
    const metaFileString = await fs.promises.readFile(metaFilePath, "utf8");
    const metaFile = JSON.parse(metaFileString) as MetaFile;
    let debounce: NodeJS.Timeout = null;
    return await new Promise(() => {
      const socket = createSocket("cli");
      socket.on("state:changed", (payload) => {
        if (payload.repoId == metaFile.repositoryId) {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            buildModuleFromState(cwd, moduleFile);
            console.log("rebuilt application state from " + module.repository);
          }, 300);
        }
      });
    });
  } catch (e) {
    console.log("Error", e);
  }
};

export const buildCurrent = async (
  cwd: string,
  moduleFile: string
): Promise<{ status: string; message: string }> => {
  try {
    const modulePath = path.join(cwd, moduleFile);
    const moduleDir = path.dirname(modulePath);
    const exists = await existsAsync(modulePath);

    if (!exists) {
      return {
        status: "error",
        message: `Could not find floro module at "${modulePath}".`,
      };
    }
    const moduleImport = require(modulePath);
    const module: Module = moduleImport();
    const metaFileName = module?.metaFileName ?? "meta.floro.json";
    const metaFilePath = path.join(moduleDir, metaFileName);
    const metaExists = await existsAsync(metaFilePath);
    if (!metaExists) {
      return {
        status: "error",
        message: `Could not find meta file "${metaFileName}".`,
      };
    }
    const result = buildModuleFromState(cwd, moduleFile);
    return result;
  } catch (e) {
    console.log("Error", e);
  }
};

export const buildModuleFromState = async (cwd: string, moduleFile: string) => {
  try {
    const modulePath = path.join(cwd, moduleFile);
    const moduleDir = path.dirname(modulePath);
    const exists = await existsAsync(modulePath);

    if (!exists) {
      return {
        status: "error",
        message: `Could not find floro module at "${modulePath}".`,
      };
    }
    const moduleImport = require(modulePath);
    const module: Module = moduleImport();
    const metaFileName = module?.metaFileName ?? "meta.floro.json";
    const metaFilePath = path.join(moduleDir, metaFileName);
    const metaExists = await existsAsync(metaFilePath);
    if (!metaExists) {
      return {
        status: "error",
        message: `Could not find meta file "${metaFileName}". Try syncing (floro module sync) before building.`,
      };
    }
    const metaFileString = await fs.promises.readFile(metaFilePath, "utf8");
    const metaFile = JSON.parse(metaFileString) as MetaFile;

    const floroModulesDirName = module.moduleDir ?? "floro_modules";
    const floroModulesPath = path.join(cwd, floroModulesDirName);
    const floroModulesExists = await existsAsync(floroModulesPath);
    if (!floroModulesExists) {
      await fs.promises.mkdir(floroModulesPath);
    }
    const getPluginManifest = async (
      pluginName: string,
      pluginValue: string
    ): Promise<Manifest> => {
      if (pluginValue.startsWith("dev")) {
        return await readDevPluginManifest(pluginName, pluginValue);
      }
      if (!pluginValue) {
        return null;
      }
      const pluginManifestPath = path.join(
        vPluginsPath(),
        pluginName,
        pluginValue,
        "floro",
        "floro.manifest.json"
      );
      const existsLocallly = await existsAsync(pluginManifestPath);
      if (existsLocallly) {
        const manifestString = await fs.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
      }
      return fetchSyncManifest(pluginName, pluginValue);
    };
    const datasource = makeDataSource({ getPluginManifest });
    const renderedState = await datasource.readRenderedState(
      metaFile.repositoryId
    );

    const repoManifests = await Promise.all(
      renderedState.plugins.map(({ key, value }) => {
        return datasource.getPluginManifest(key, value, true);
      })
    );
    const binaries = await Promise.all(
      renderedState.binaries.map(async (binaryRef) => {
        const hash = binaryRef.split(".")[0];
        const binSubDir = path.join(vBinariesPath(), hash.substring(0, 2));
        const binaryFullPath = path.join(binSubDir, binaryRef);
        return {
          hash,
          path: binaryFullPath,
          fileName: binaryRef,
        };
      })
    );

    const repoBinaries = {
      datasource: "fs",
      binaries,
    };

    const repoSchemaMap = manifestListToSchemaMap(repoManifests);
    const visitedGenerators = new Set<string>();
    for (const [index, { generator, args }] of module.generators.entries()) {
      const generatorManifest = generator.getFloroGenerator();
      if (!generatorManifest) {
        return {
          status: "error",
          message: `Invalid generator, could not find generator manifest at index: ${index} in ${moduleFile} generators.`,
        };
      }
      if (!generatorManifest?.name) {
        return {
          status: "error",
          message: `Invalid generator, could not find name in generator manifest of generator at index: ${index} in ${moduleFile} generators.`,
        };
      }
      if (visitedGenerators.has(generatorManifest?.name?.toLowerCase())) {
        return {
          status: "error",
          message: `Duplicate generator "${generatorManifest?.name}" found at index: ${index} in ${moduleFile} generators.`,
        };
      }
      visitedGenerators.add(generatorManifest?.name?.toLowerCase());
      const deps = Object.keys(generatorManifest.dependencies).map(
        (pluginName) => {
          return {
            pluginName,
            pluginVersion: generatorManifest.dependencies[pluginName],
          };
        }
      );
      const generatorManifestList =
        await getUpstreamDependencyManifestsForGeneratorManifest(
          datasource,
          generatorManifest,
          true
        );
      for (const [index, manifest] of generatorManifestList.entries()) {
        const dep = deps[index];
        if (!manifest) {
          return {
            status: "error",
            message: `Failed to fetch manifest for dependency "${dep.pluginName} (version: ${dep.pluginName})" in "${generatorManifest?.name}" found at index: ${index} in ${moduleFile} generators.`,
          };
        }
      }
      const outDir = path.join(
        floroModulesPath,
        generatorManifest.name.toLowerCase()
      );

      const outDirExist = await existsAsync(outDir);
      if (!outDirExist) {
        await fs.promises.mkdir(outDir);
      }

      const generatorSchemaMap = manifestListToSchemaMap(generatorManifestList);
      const tmpDataStore = makeDataSource({
        getPluginManifest: async (pluginName, pluginVersion) => {
          const result = (
            repoManifests?.find(
              (m) => m.name == pluginName && m.version == pluginVersion
            ) ??
            generatorManifestList.find(
              (m) => m.name == pluginName && m.version == pluginVersion
            )
          );
          if (result) {
            return result;
          }

          const pluginManifestPath = path.join(
            vPluginsPath(),
            pluginName,
            pluginVersion,
            "floro",
            "floro.manifest.json"
          );
          const existsLocallly = await existsAsync(pluginManifestPath);
          if (existsLocallly) {
            const manifestString = await fs.promises.readFile(pluginManifestPath);
            return JSON.parse(manifestString.toString());
          }
          return null;
        },
      });

      const isCompatible = await pluginManifestIsSubsetOfManifest(
        tmpDataStore,
        generatorSchemaMap,
        repoSchemaMap,
        true
      );
      if (!isCompatible) {
        console.log(
          `Dependencies of "${generatorManifest?.name}" are incompatible with repository current state dependencies`
        );
        return;
      }

      await generator.generate(
        renderedState.store,
        outDir,
        args,
        async (binRef) => {
          const binary = repoBinaries.binaries.find(
            (b) => b.fileName == binRef
          );
          const binSubDir = path.join(
            vBinariesPath(),
            binary.hash.substring(0, 2)
          );
          const binaryFullPath = path.join(binSubDir, binRef);
          const fileData = await fs.promises.readFile(binaryFullPath);
          if (isBinaryFile(fileData)) {
            return fileData;
          }
          return fileData.toString();
        }
      );
    }

    return {
      status: "ok",
      message: `build succeeded!`,
    };
  } catch (e) {
    console.log("Build Error", e);
    return {
      status: "error",
      message: `Unknown build error see console.`,
    };
  }
};

export const buildModule = async (
  cwd: string,
  moduleFile: string,
  isLocal = false,
  apiKey?: string
) => {
  try {
    apiKey = apiKey ?? process.env?.["FLORO_REMOTE_API_KEY"];
    const modulePath = path.join(cwd, moduleFile);
    const moduleDir = path.dirname(modulePath);
    const exists = await existsAsync(modulePath);

    if (!exists) {
      return {
        status: "error",
        message: `Could not find floro module at "${modulePath}".`,
      };
    }
    const moduleImport = require(modulePath);
    const module: Module = moduleImport();
    const metaFileName = module?.metaFileName ?? "meta.floro.json";
    const metaFilePath = path.join(moduleDir, metaFileName);
    const metaExists = await existsAsync(metaFilePath);
    if (!metaExists) {
      return {
        status: "error",
        message: `Could not find meta file "${metaFileName}". Try syncing (floro module sync) before building.`,
      };
    }
    const metaFileString = await fs.promises.readFile(metaFilePath, "utf8");
    const metaFile = JSON.parse(metaFileString) as MetaFile;

    const floroModulesDirName = module.moduleDir ?? "floro_modules";
    const floroModulesPath = path.join(cwd, floroModulesDirName);
    const floroModulesExists = await existsAsync(floroModulesPath);
    if (!floroModulesExists) {
      await fs.promises.mkdir(floroModulesPath);
    }

    const syncState = await fetchRepoSyncState(
      metaFile.repositoryId,
      metaFile?.sha,
      apiKey,
      isLocal
    );
    if (!syncState) {
      return {
        status: "error",
        message: `Failed to fetch sync state.`,
      };
    }

    const repoManifests = await fetchRepoSyncManifests(
      metaFile.repositoryId,
      metaFile?.sha,
      apiKey,
      isLocal
    );
    if (!repoManifests) {
      return {
        status: "error",
        message: `Failed to fetch repository manifests.`,
      };
    }

    const repoBinaries = await fetchRepoSyncBinaries(
      metaFile.repositoryId,
      metaFile?.sha,
      apiKey,
      isLocal
    );
    if (!repoBinaries) {
      return {
        status: "error",
        message: `Failed to fetch repository binaries.`,
      };
    }
    const getPluginManifest = async (
      pluginName: string,
      pluginValue: string
    ): Promise<Manifest> => {
      if (pluginValue.startsWith("dev")) {
        return await readDevPluginManifest(pluginName, pluginValue);
      }
      if (!pluginValue) {
        return null;
      }
      const pluginManifestPath = path.join(
        vPluginsPath(),
        pluginName,
        pluginValue,
        "floro",
        "floro.manifest.json"
      );
      const existsLocallly = await existsAsync(pluginManifestPath);
      if (existsLocallly) {
        const manifestString = await fs.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
      }
      return fetchSyncManifest(pluginName, pluginValue, apiKey, false);
    };
    const datasource = makeDataSource({ getPluginManifest });

    const visitedGenerators = new Set<string>();
    for (const [index, { generator, args }] of module.generators.entries()) {
      const generatorManifest = generator.getFloroGenerator();
      if (!generatorManifest) {
        return {
          status: "error",
          message: `Invalid generator, could not find generator manifest at index: ${index} in ${moduleFile} generators.`,
        };
      }
      if (!generatorManifest?.name) {
        return {
          status: "error",
          message: `Invalid generator, could not find name in generator manifest of generator at index: ${index} in ${moduleFile} generators.`,
        };
      }
      if (visitedGenerators.has(generatorManifest?.name?.toLowerCase())) {
        return {
          status: "error",
          message: `Duplicate generator "${generatorManifest?.name}" found at index: ${index} in ${moduleFile} generators.`,
        };
      }
      visitedGenerators.add(generatorManifest?.name?.toLowerCase());
      const deps = Object.keys(generatorManifest.dependencies).map(
        (pluginName) => {
          return {
            pluginName,
            pluginVersion: generatorManifest.dependencies[pluginName],
          };
        }
      );
      const generatorManifestList =
        await getUpstreamDependencyManifestsForGeneratorManifest(
          datasource,
          generatorManifest,
          true
        );
      for (const [index, manifest] of generatorManifestList.entries()) {
        const dep = deps[index];
        if (!manifest) {
          return {
            status: "error",
            message: `Failed to fetch manifest for dependency "${dep.pluginName} (version: ${dep.pluginName})" in "${generatorManifest?.name}" found at index: ${index} in ${moduleFile} generators.`,
          };
        }
      }
      const outDir = path.join(
        floroModulesPath,
        generatorManifest.name.toLowerCase()
      );

      const outDirExist = await existsAsync(outDir);
      if (!outDirExist) {
        await fs.promises.mkdir(outDir);
      }

      await generator.generate(
        syncState.state.store,
        outDir,
        args,
        async (binRef) => {
          const binary = repoBinaries.binaries.find(
            (b) => b.fileName == binRef
          );
          if (repoBinaries.datasource == "fs") {
            const binSubDir = path.join(
              vBinariesPath(),
              binary.hash.substring(0, 2)
            );
            const binaryFullPath = path.join(binSubDir, binRef);
            const fileData = await fs.promises.readFile(binaryFullPath);
            if (isBinaryFile(fileData)) {
              return fileData;
            }
            return fileData.toString();
          }
          const fileDataRequest = await axios.get(binary.url);
          return fileDataRequest.data;
        }
      );
    }

    return {
      status: "ok",
      message: `build succeeded!`,
    };
  } catch (e) {
    console.log("Build Error", e);
    return {
      status: "error",
      message: `Unknown build error see console.`,
    };
  }
};

const fetchRepoSyncInfo = async (
  ownerHandle: string,
  repoName: string,
  apiKey?: string,
  buildLocal = false
): Promise<RepoInfo & { branches: Branch[] }> => {
  try {
    if (buildLocal) {
      const datasource = makeDataSource();
      const repoIds = await datasource.readRepos();
      const repoInfos = await Promise.all(
        repoIds.map((id) => {
          return datasource.readInfo(id);
        })
      );
      const repoInfo = repoInfos.find((r) => {
        return r.name == repoName && r.ownerHandle == ownerHandle;
      });
      if (repoInfo) {
        const branches: Branch[] = await datasource.readBranches(repoInfo.id);
        if (!branches) {
          return null;
        }
        return {
          ...repoInfo,
          branches,
        };
      }
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const repoSyncInfo = await axios({
      method: "get",
      url: `${remote}/sync/api/v0/repo/${ownerHandle}/${repoName}`,
      headers: {
        ["session_key"]: session?.clientKey,
        ["floro-api-key"]: apiKey,
      },
    });
    return repoSyncInfo?.data ?? null;
  } catch (e) {
    return null;
  }
};

const fetchRepoSyncState = async (
  repoId: string,
  sha: string,
  apiKey?: string,
  buildLocal = false
): Promise<{
  state: RenderedApplicationState;
  commitInfo: {
    sha: string;
    message: string;
    idx: number;
    username: string;
    authorUsername: string;
  };
}> => {
  try {
    const datasource = makeDataSource();
    const repoExists = await datasource.repoExists(repoId);
    if (repoExists) {
      const commitExists = await datasource.commitExists(repoId, sha);
      if (commitExists) {
        const commitState = await getCommitState(datasource, repoId, sha);
        const commit = await datasource.readCommit(repoId, sha);
        if (commitState && commit) {
          const state = await convertCommitStateToRenderedState(
            datasource,
            commitState
          );
          const commitInfo = {
            sha: sha,
            message: commit.message,
            idx: commit.idx,
            username: commit.username,
            authorUsername: commit.authorUsername,
          };
          return {
            state,
            commitInfo,
          };
        }
      }
    }
    if (buildLocal) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const repoSyncStateLinkRequest = await axios({
      method: "get",
      url: `${remote}/sync/api/v0/repo/${repoId}/commit/${sha}/stateLink`,
      headers: {
        ["session_key"]: session?.clientKey,
        ["floro-api-key"]: apiKey,
      },
    });
    if (repoSyncStateLinkRequest?.data?.stateLink) {
      const stateRequest = await axios({
        method: "get",
        url: repoSyncStateLinkRequest?.data?.stateLink,
      });
      const state = stateRequest?.data ?? null;
      if (!state) {
        return null;
      }

      const repoSyncCommitInfoRequest = await axios({
        method: "get",
        url: `${remote}/sync/api/v0/repo/${repoId}/commit/${sha}`,
        headers: {
          ["session_key"]: session?.clientKey,
          ["floro-api-key"]: apiKey,
        },
      });
      if (!repoSyncCommitInfoRequest?.data) {
        return null;
      }
      const commitInfo = {
        sha,
        message: repoSyncCommitInfoRequest?.data?.message as string,
        idx: repoSyncCommitInfoRequest?.data?.idx as number,
        username: repoSyncCommitInfoRequest?.data?.username as string,
        authorUsername: repoSyncCommitInfoRequest?.data
          ?.authorUsername as string,
      };
      return {
        state,
        commitInfo,
      };
    }
    return null;
  } catch (e) {
    return null;
  }
};

const fetchRepoSyncManifests = async (
  repoId: string,
  sha: string,
  apiKey?: string,
  buildLocal = false
): Promise<Array<Manifest>> => {
  try {
    const datasource = makeDataSource();
    const repoExists = await datasource.repoExists(repoId);
    if (repoExists) {
      const commitExists = await datasource.commitExists(repoId, sha);
      if (commitExists) {
        const commitState = await getCommitState(datasource, repoId, sha);
        try {
          const manifests = getPluginManifests(
            datasource,
            commitState.plugins,
            true
          );
          if (manifests) {
            return manifests;
          }
        } catch (e) {}
      }
    }
    if (buildLocal) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const repoSyncManifestsRequest = await axios({
      method: "get",
      url: `${remote}/sync/api/v0/repo/${repoId}/commit/${sha}/manifest`,
      headers: {
        ["session_key"]: session?.clientKey,
        ["floro-api-key"]: apiKey,
      },
    });
    return repoSyncManifestsRequest?.data ?? null;
  } catch (e) {
    return null;
  }
};

const fetchSyncManifest = async (
  pluginName: string,
  pluginVersion: string,
  apiKey?: string,
  buildLocal = false
): Promise<Manifest> => {
  try {
    const datasource = makeDataSource();
    const localManifest = await datasource.getPluginManifest(
      pluginName,
      pluginVersion,
      true
    );
    if (localManifest) {
      return localManifest;
    }
    if (buildLocal) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const repoSyncManifestsRequest = await axios({
      method: "get",
      url: `${remote}/sync/api/v0/plugin/${pluginName}/${pluginVersion}/manifest`,
      headers: {
        ["session_key"]: session?.clientKey,
        ["floro-api-key"]: apiKey,
      },
    });
    return repoSyncManifestsRequest?.data ?? null;
  } catch (e) {
    return null;
  }
};

const fetchRepoSyncBinaries = async (
  repoId: string,
  sha: string,
  apiKey?: string,
  buildLocal = false
): Promise<{
  datasource: "fs" | "fetch";
  binaries: Array<{
    hash: string;
    url?: string;
    path?: string;
    fileName: string;
  }>;
}> => {
  try {
    const datasource = makeDataSource();
    const repoExists = await datasource.repoExists(repoId);
    if (repoExists) {
      const commitExists = await datasource.commitExists(repoId, sha);
      if (commitExists) {
        const commitState = await getCommitState(datasource, repoId, sha);
        try {
          const binaries = commitState.binaries.map((binaryRef) => {
            const binSubDir = path.join(
              vBinariesPath(),
              binaryRef.substring(0, 2)
            );
            const fullPath = path.join(binSubDir, binaryRef);
            return {
              path: fullPath,
              fileName: binaryRef,
              hash: binaryRef.split(".")[0],
            };
          });
          return {
            datasource: "fs",
            binaries,
          };
        } catch (e) {}
      }
    }
    if (buildLocal) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const repoSyncManifestsRequest = await axios({
      method: "get",
      url: `${remote}/sync/api/v0/repo/${repoId}/commit/${sha}/manifest`,
      headers: {
        ["session_key"]: session?.clientKey,
        ["floro-api-key"]: apiKey,
      },
    });
    const binaries = repoSyncManifestsRequest?.data ?? null;
    return {
      datasource: "fetch",
      binaries,
    };
  } catch (e) {
    return null;
  }
};
