import path from "path";
import fs, { createWriteStream } from "fs";
import {
  existsAsync,
  getPluginsJsonAsync,
  getRemoteHostAsync,
  getUserSessionAsync,
  vDEVPath,
  vPluginsPath,
  vReposPath,
  vTMPPath,
} from "./filestructure";
import { Manifest } from "./plugins";
import {
  ApplicationKVState,
  Branch,
  RenderedApplicationState,
  RepoSetting,
  RepoState,
} from "./repo";
import { CommitData } from "./versioncontrol";
import axios from "axios";
import { broadcastAllDevices } from "./multiplexer";
import tar from "tar";

axios.defaults.validateStatus = function () {
  return true;
};

export interface DataSource {
  /* PLUGINS */
  getPluginManifest?: (
    pluginName: string,
    pluginVersion: string
  ) => Promise<Manifest>;
  pluginManifestExists?: (
    pluginName: string,
    pluginVersion: string
  ) => Promise<boolean>;
  /* REPOS */
  readRepos?(): Promise<Array<string>>;
  repoExists?(repoId?: string): Promise<boolean>;
  readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
  readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
  saveCurrentRepoState?: (
    repoId: string,
    state: RepoState
  ) => Promise<RepoState>;

  readBranch?: (repoId: string, branchName: string) => Promise<Branch>;
  readBranches?: (repoId: string) => Promise<Array<Branch>>;
  deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
  saveBranch?: (
    repoId: string,
    branchName: string,
    branchData: Branch
  ) => Promise<Branch>;

  saveCommit?: (
    repoId: string,
    sha: string,
    commitData: CommitData
  ) => Promise<CommitData>;
  readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
  readCheckpoint?(repoId: string, sha: string): Promise<ApplicationKVState>;

  saveCheckpoint?(
    repoId: string,
    sha: string,
    commitState: ApplicationKVState
  ): Promise<ApplicationKVState>;

  readHotCheckpoint?(repoId: string): Promise<[string, ApplicationKVState]>;

  saveHotCheckpoint?(
    repoId: string,
    sha: string,
    commitState: ApplicationKVState
  ): Promise<[string, ApplicationKVState]>;

  deleteHotCheckpoint?(repoId: string): Promise<boolean>;

  readRenderedState?(repoId: string): Promise<RenderedApplicationState>;

  saveRenderedState?(
    repoId: string,
    commitState: RenderedApplicationState
  ): Promise<RenderedApplicationState>;

  readStash?(repoId: string, sha: string|null): Promise<Array<ApplicationKVState>>;

  saveStash?(
    repoId: string,
    sha: string|null,
    stashState: Array<ApplicationKVState>
  ): Promise<Array<ApplicationKVState>>;
}

/* PLUGINS */
/**
 * We need to export readDevPluginManifest for the daemon server
 * all other methods not in datasource should remain internal to
 * this file.
 */
export const readDevPluginManifest = async (
  pluginName: string,
  pluginVersion: string
): Promise<Manifest | null> => {
  const pluginsJSON = await getPluginsJsonAsync();
  if (!pluginsJSON) {
    return null;
  }
  if (
    pluginsJSON.plugins?.[pluginName]?.proxy &&
    !pluginVersion.startsWith("dev@")
  ) {
    try {
      const uri = `http://127.0.0.1:63403/plugins/${pluginName}/dev/floro/floro.manifest.json`;
      const res = await axios.get(uri);
      return res.data;
    } catch (e) {
      return null;
    }
  }
  try {
    const pluginManifestPath = path.join(
      vDEVPath,
      pluginName,
      pluginVersion.split("@")?.[1] ?? "none",
      "floro",
      "floro.manifest.json"
    );
    const manifestString = await fs.promises.readFile(pluginManifestPath);
    return JSON.parse(manifestString.toString());
  } catch (e) {
    return null;
  }
};

const pullPluginTar = async (
  name: string,
  version: string,
  link: string,
  hash: string
): Promise<Manifest | null> => {
  const downloadPath = path.join(vTMPPath, `${hash}.tar.gz`);
  const pluginPath = path.join(vPluginsPath, name, version);
  const didWrite = await axios.get(link);
  await axios({
    method: "get",
    url: link,
    onDownloadProgress: (progressEvent) => {
      broadcastAllDevices(
        `plugin:${name}@${version}:download-progress`,
        progressEvent
      );
    },
    responseType: "stream",
  }).then((response) => {
    const exists = fs.existsSync(downloadPath);
    if (exists) {
      return true;
    }
    const writer = createWriteStream(downloadPath);
    return new Promise((resolve) => {
      response.data.pipe(writer);
      let error = null;
      writer.on("error", (err) => {
        error = err;
        writer.close();
        resolve(false);
      });
      writer.on("close", () => {
        if (!error) {
          resolve(true);
        }
      });
    });
  });
  const exists = await existsAsync(pluginPath);
  if (!exists && didWrite) {
    await fs.promises.mkdir(pluginPath, { recursive: true });
    if (process.env.NODE_ENV != "test") {
      await fs.promises.chmod(pluginPath, 0o755);
    }
    await tar.x({
      file: downloadPath,
      cwd: pluginPath,
    });
  }
  if (exists && didWrite) {
    await tar.x({
      file: downloadPath,
      cwd: pluginPath,
    });
  }
  const downloadExists = await existsAsync(downloadPath);
  if (downloadExists) {
    await fs.promises.rm(downloadPath);
  }
  if (didWrite) {
    const pluginManifestPath = path.join(
      vPluginsPath,
      name,
      version,
      "floro",
      "floro.manifest.json"
    );
    const manifestString = await fs.promises.readFile(pluginManifestPath);
    return JSON.parse(manifestString.toString());
  }
  return null;
};

export const downloadPlugin = async (
  pluginName: string,
  pluginVersion: string
): Promise<Manifest | null> => {
  const remote = await getRemoteHostAsync();
  const session = await getUserSessionAsync();

  const request = await axios.get(
    `${remote}/api/plugin/${pluginName}/${pluginVersion}/install`,
    {
      headers: {
        ["session_key"]: session?.clientKey,
      },
    }
  );
  if (request.status == 200) {
    const installResponse = request.data;
    for (const dependency of installResponse.dependencies) {
      const pluginManifestPath = path.join(
        vPluginsPath,
        dependency.name,
        dependency.version,
        "floro",
        "floro.manifest.json"
      );
      const existsLocallly = await existsAsync(pluginManifestPath);
      if (existsLocallly) {
        continue;
      }
      const dependencyManifest = await pullPluginTar(
        dependency.name,
        dependency.version,
        dependency.link,
        dependency.hash
      );
      if (!dependencyManifest) {
        return null;
      }
      const stillExistsLocallly = await existsAsync(pluginManifestPath);
      if (!stillExistsLocallly) {
        return null;
      }
    }
    return await pullPluginTar(
      installResponse.name,
      installResponse.version,
      installResponse.link,
      installResponse.hash
    );
  }
  return null;
};

export const getPluginManifest = async (
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
    vPluginsPath,
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
  return await downloadPlugin(pluginName, pluginValue);
};

const pluginManifestExists = async (
  pluginName: string,
  pluginVersion: string
): Promise<boolean> => {
  const pluginManifestPath = path.join(
    vPluginsPath,
    pluginName,
    pluginVersion,
    "floro",
    "floro.manifest.json"
  );
  return await existsAsync(pluginManifestPath);
};

/* REPOS */

export const readRepos = async (): Promise<string[]> => {
  const repoDir = await fs.promises.readdir(vReposPath);
  return repoDir?.filter((repoName) => {
    return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(
      repoName
    );
  });
};

const repoExists = async (repoId?: string): Promise<boolean> => {
  if (!repoId) {
    return false;
  }
  return await existsAsync(path.join(vReposPath, repoId));
};

const readRepoSettings = async (repoId: string): Promise<RepoSetting> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const settingsPath = path.join(repoPath, `settings.json`);
    const settings = await fs.promises.readFile(settingsPath);
    return JSON.parse(settings.toString());
  } catch (e) {
    return null;
  }
};

const readRenderedState = async (
  repoId: string
): Promise<RenderedApplicationState> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const statePath = path.join(repoPath, `state.json`);
    const state = await fs.promises.readFile(statePath);
    return JSON.parse(state.toString());
  } catch (e) {
    return null;
  }
};

const saveRenderedState = async (
  repoId: string,
  state: RenderedApplicationState
): Promise<RenderedApplicationState> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const statePath = path.join(repoPath, `state.json`);
    await fs.promises.writeFile(statePath, JSON.stringify(state), "utf-8");
    return state;
  } catch (e) {
    return null;
  }
};

const readCurrentRepoState = async (repoId: string): Promise<RepoState> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fs.promises.readFile(currentPath);
    return JSON.parse(current.toString());
  } catch (e) {
    return null;
  }
};

const saveCurrentRepoState = async (
  repoId: string,
  state: RepoState
): Promise<RepoState> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(state, null, 2)),
      "utf-8"
    );
    return state;
  } catch (e) {
    return null;
  }
};

const readBranch = async (
  repoId: string,
  branchName: string
): Promise<Branch> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const branchPath = path.join(repoPath, "branches", `${branchName}.json`);
    const branchData = await fs.promises.readFile(branchPath);
    const branch = JSON.parse(branchData.toString());
    return {
      ...branch,
      name: branchName,
    };
  } catch (e) {
    return null;
  }
};

const readBranches = async (repoId: string): Promise<Array<Branch>> => {
  const branchesPath = path.join(vReposPath, repoId, "branches");
  const branchesDir = await fs.promises.readdir(branchesPath);
  const branches = await Promise.all(
    branchesDir
      ?.filter((branchName) => {
        return /.*\.json$/.test(branchName);
      })
      ?.map((branchFileName) => {
        const branchName = branchFileName.substring(
          0,
          branchFileName.length - 5
        );
        return readBranch(repoId, branchName);
      })
  );
  return branches.filter((branch) => branch != null);
};
const deleteBranch = async (
  repoId: string,
  branchName: string
): Promise<boolean> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const branchPath = path.join(repoPath, "branches", `${branchName}.json`);
    await fs.promises.rm(branchPath);
    return true;
  } catch (e) {
    return false;
  }
};

const saveBranch = async (
  repoId: string,
  branchName: string,
  branchData: Branch
): Promise<Branch> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const branchPath = path.join(repoPath, "branches", `${branchName}.json`);
    await fs.promises.writeFile(
      branchPath,
      Buffer.from(JSON.stringify(branchData, null, 2))
    );
    return branchData;
  } catch (e) {
    return null;
  }
};

const getCommitDirPath = (repoId: string, commitSha: string): string => {
  return path.join(vReposPath, repoId, "commits", commitSha.substring(0, 2));
};

const saveCommit = async (
  repoId: string,
  sha: string,
  commitData: CommitData
): Promise<CommitData> => {
  try {
    const commitDir = getCommitDirPath(repoId, sha);
    const commitDirExists = await existsAsync(commitDir);
    if (!commitDirExists) {
      await fs.promises.mkdir(commitDir, 0o755);
    }
    const commitPath = path.join(commitDir, `${sha.substring(2)}.json`);
    await fs.promises.writeFile(
      commitPath,
      Buffer.from(JSON.stringify(commitData, null, 2))
    );
    return commitData;
  } catch (e) {
    return null;
  }
};

const readCommit = async (repoId: string, sha: string): Promise<CommitData> => {
  try {
    if (!sha) {
      return null;
    }
    const commitDir = getCommitDirPath(repoId, sha);
    const commitPath = path.join(commitDir, `${sha.substring(2)}.json`);
    const commitDataString = await fs.promises.readFile(commitPath);
    return JSON.parse(commitDataString.toString());
  } catch (e) {
    return null;
  }
};

const readHotCheckpoint = async (
  repoId: string
): Promise<[string, ApplicationKVState]> => {
  try {
    const hotPath = path.join(vReposPath, repoId, "hotcheckpoint.json");
    const hotPointExists = await existsAsync(hotPath);
    if (!hotPointExists) {
      return null;
    }
    const hotpointString = await fs.promises.readFile(hotPath, "utf8");
    const hotpoint = JSON.parse(hotpointString);
    return hotpoint as [string, ApplicationKVState];
  } catch (e) {
    return null;
  }
};

const saveHotCheckpoint = async (
  repoId: string,
  sha: string,
  commitState: ApplicationKVState
): Promise<[string, ApplicationKVState]> => {
  try {
    const hotPath = path.join(vReposPath, repoId, "hotcheckpoint.json");
    await fs.promises.writeFile(
      hotPath,
      JSON.stringify([sha, commitState]),
      "utf8"
    );
    return [sha, commitState];
  } catch (e) {
    return null;
  }
};

const deleteHotCheckpoint = async (repoId: string): Promise<boolean> => {
  try {
    const hotPath = path.join(vReposPath, repoId, "hotcheckpoint.json");
    const hotPointExists = await existsAsync(hotPath);
    if (!hotPointExists) {
      return false;
    }
    await fs.promises.rm(hotPath);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 *
 * CHECKPOINTS
 */

const getCheckpointDirPath = (repoId: string, commitSha: string): string => {
  return path.join(
    vReposPath,
    repoId,
    "checkpoints",
    commitSha.substring(0, 2)
  );
};

const readCheckpoint = async (
  repoId: string,
  sha: string
): Promise<ApplicationKVState> => {
  try {
    const checkpointDirPath = getCheckpointDirPath(repoId, sha);
    const checkpointPath = path.join(checkpointDirPath, sha + ".json");
    const checkpointExists = await existsAsync(checkpointPath);
    if (!checkpointExists) {
      return null;
    }
    const checkpointString = await fs.promises.readFile(checkpointPath, "utf8");
    return JSON.parse(checkpointString);
  } catch (e) {
    return null;
  }
};

const saveCheckpoint = async (
  repoId: string,
  sha: string,
  commitState: ApplicationKVState
): Promise<ApplicationKVState> => {
  try {
    const baseCheckpoint = path.join(vReposPath, repoId, "checkpoints");
    const baseCheckpointDirExists = await existsAsync(baseCheckpoint);
    if (!baseCheckpointDirExists) {
      await fs.promises.mkdir(baseCheckpoint);
    }
    const checkpointDirPath = getCheckpointDirPath(repoId, sha);
    const checkpointDirExists = await existsAsync(checkpointDirPath);
    if (!checkpointDirExists) {
      await fs.promises.mkdir(checkpointDirPath);
    }
    const checkpointPath = path.join(checkpointDirPath, sha + ".json");
    const checkpointString = JSON.stringify(commitState);
    await fs.promises.writeFile(checkpointPath, checkpointString, "utf-8");
    return commitState;
  } catch (e) {
    return null;
  }
};

/**
 * STASH
 */

const readStash = async (repoId: string, sha: string | null): Promise<Array<ApplicationKVState>> => {
  try {
    const stashDir = path.join(vReposPath, repoId, "stash");
    const stashName = sha ? `${sha}.json` : `null_stash.json`;
    const stashPath = path.join(stashDir, stashName);
    const existsStash = await existsAsync(stashPath);
    let stash = [];
    if (existsStash) {
      const rawStash = await fs.promises.readFile(stashPath, 'utf8')
      stash = JSON.parse(rawStash) as Array<ApplicationKVState>;
    }
    return stash;
  } catch(e) {
    return null;
  }
};

const saveStash = async (
  repoId: string,
  sha: string | null,
  stashState: Array<ApplicationKVState>
) => {
  try {
    const stashDir = path.join(vReposPath, repoId, "stash");
    const stashName = sha ? `${sha}.json` : `null_stash.json`;
    const stashPath = path.join(stashDir, stashName);
    await fs.promises.writeFile(stashPath, JSON.stringify(stashState));
    return stashState;
  } catch(e) {
    return null;
  }
};

export const makeDataSource = (datasource: DataSource = {}) => {
  const defaultDataSource: DataSource = {
    readRepos,
    repoExists,
    getPluginManifest,
    pluginManifestExists,
    readRepoSettings,
    readCurrentRepoState,
    saveCurrentRepoState,
    readBranch,
    readBranches,
    deleteBranch,
    saveBranch,
    saveCommit,
    readCommit,
    readCheckpoint,
    saveCheckpoint,
    readHotCheckpoint,
    deleteHotCheckpoint,
    saveHotCheckpoint,
    readRenderedState,
    saveRenderedState,
    readStash,
    saveStash
  };
  return {
    ...defaultDataSource,
    ...datasource,
  };
};

export const makeMemoizedDataSource = (dataSourceOverride: DataSource = {}) => {
  const dataSource = makeDataSource();

  const memoizedRepoExistence = new Set();
  const _repoExists = async (repoId: string) => {
    if (memoizedRepoExistence.has(repoId)) {
      return true;
    }
    const result = await dataSource.repoExists(repoId);
    if (result) {
      memoizedRepoExistence.add(repoId);
    }
    return result;
  };

  const memoizedPluginManifestExistence = new Set();
  const _pluginManifestExists = async (
    pluginName: string,
    pluginVersion: string
  ) => {
    const pluginString = pluginName + "-" + pluginVersion;
    if (
      memoizedPluginManifestExistence.has(pluginName) &&
      !pluginVersion.startsWith("dev")
    ) {
      return true;
    }
    const result = await dataSource.pluginManifestExists(
      pluginName,
      pluginVersion
    );
    if (result) {
      memoizedRepoExistence.add(pluginString);
    }
    return result;
  };

  const manifestMemo: { [key: string]: Manifest } = {};
  const _getPluginManifest = async (
    pluginName: string,
    pluginVersion: string
  ): Promise<Manifest> => {
    const memoString = pluginName + "-" + pluginVersion;
    if (manifestMemo[memoString] && !pluginVersion.startsWith("dev")) {
      return manifestMemo[memoString];
    }
    const result = await dataSource.getPluginManifest(
      pluginName,
      pluginVersion
    );
    if (result) {
      manifestMemo[memoString] = result;
    }
    return result;
  };

  const memoizedSettings = {};
  const _readRepoSettings = async (repoId: string): Promise<RepoSetting> => {
    if (memoizedSettings[repoId]) {
      return memoizedSettings[repoId];
    }
    const result = await dataSource.readRepoSettings(repoId);
    if (result) {
      memoizedSettings[repoId] = result;
    }
    return result;
  };

  const memoizedCurrentState = {};
  const _readCurrentRepoState = async (repoId: string): Promise<RepoState> => {
    if (memoizedCurrentState[repoId]) {
      return memoizedCurrentState[repoId];
    }
    const result = await dataSource.readCurrentRepoState(repoId);
    if (result) {
      memoizedCurrentState[repoId] = result;
    }
    return result;
  };

  const _saveCurrentRepoState = async (
    repoId: string,
    state: RepoState
  ): Promise<RepoState> => {
    const result = await dataSource.saveCurrentRepoState(repoId, state);
    if (result) {
      memoizedCurrentState[repoId] = result;
    }
    return result;
  };

  const branchMemo = {};
  const branchesMemo = {};
  const _readBranch = async (
    repoId: string,
    branchName: string
  ): Promise<Branch> => {
    const branchMemoString = repoId + "-" + branchName;
    if (branchMemo[branchMemoString]) {
      return branchMemo[branchMemoString];
    }
    const result = await dataSource.readBranch(repoId, branchName);
    if (result) {
      branchMemo[branchMemoString] = result;
    }
    return result;
  };

  const _readBranches = async (repoId: string): Promise<Array<Branch>> => {
    if (branchesMemo[repoId]) {
      return branchesMemo[repoId];
    }
    const result = await dataSource.readBranches(repoId);
    if (result) {
      branchesMemo[repoId] = result;
    }
    return result;
  };

  const _saveBranch = async (
    repoId: string,
    branchName: string,
    branchData: Branch
  ): Promise<Branch> => {
    const branchMemoString = repoId + "-" + branchName;
    const result = await dataSource.saveBranch(repoId, branchName, branchData);
    if (result) {
      branchMemo[branchMemoString] = result;
      delete branchesMemo[repoId];
    }
    return result;
  };

  const _deleteBranch = async (
    repoId: string,
    branchName: string
  ): Promise<boolean> => {
    const result = await dataSource.deleteBranch(repoId, branchName);
    if (result) {
      delete branchMemo[repoId];
      delete branchesMemo[repoId];
    }
    return result;
  };

  const commitMemo = {};
  const _saveCommit = async (
    repoId: string,
    sha: string,
    commitData: CommitData
  ): Promise<CommitData> => {
    const commitString = repoId + "-" + sha;
    const result = await dataSource.saveCommit(repoId, sha, commitData);
    if (result) {
      commitMemo[commitString] = result;
    }
    return result;
  };

  const _readCommit = async (
    repoId: string,
    sha: string
  ): Promise<CommitData> => {
    const commitString = repoId + "-" + sha;
    if (commitMemo[commitString]) {
      return commitMemo[commitString];
    }
    const result = await dataSource.readCommit(repoId, sha);
    if (result) {
      commitMemo[commitString] = result;
    }
    return result;
  };

  const checkpointMemo = {};
  const _readCheckpoint = async (
    repoId: string,
    sha: string
  ): Promise<ApplicationKVState> => {
    const checkpointString = repoId + "-" + sha;
    if (checkpointMemo[checkpointString]) {
      return checkpointMemo[checkpointString];
    }
    const result = await dataSource.readCheckpoint(repoId, sha);
    if (result) {
      checkpointMemo[checkpointString] = result;
    }
    return result;
  };

  const _saveCheckpoint = async (
    repoId: string,
    sha: string,
    commitState: ApplicationKVState
  ): Promise<ApplicationKVState> => {
    const checkpointString = repoId + "-" + sha;
    const result = await dataSource.saveCheckpoint(repoId, sha, commitState);
    if (result) {
      checkpointMemo[checkpointString] = result;
    }
    return result;
  };

  const hotCheckpointMemo = {};
  const _readHotCheckpoint = async (
    repoId: string
  ): Promise<[string, ApplicationKVState]> => {
    if (hotCheckpointMemo[repoId]) {
      return hotCheckpointMemo[repoId];
    }
    const result = await dataSource.readHotCheckpoint(repoId);
    if (result) {
      hotCheckpointMemo[repoId] = result;
    }
    return result;
  };

  const _saveHotCheckpoint = async (
    repoId: string,
    sha: string,
    checkpoint: ApplicationKVState
  ): Promise<[string, ApplicationKVState]> => {
    const result = await dataSource.saveHotCheckpoint(repoId, sha, checkpoint);
    if (result) {
      hotCheckpointMemo[repoId] = result;
    }
    return result;
  };

  const _deleteHotCheckpoint = async (repoId: string): Promise<boolean> => {
    const result = await dataSource.deleteHotCheckpoint(repoId);
    if (result) {
      delete hotCheckpointMemo[repoId];
    }
    return result;
  };

  const stateMemo = {};
  const _saveRenderedState = async (
    repoId: string,
    state: RenderedApplicationState
  ): Promise<RenderedApplicationState> => {
    const result = await dataSource.saveRenderedState(repoId, state);
    if (result) {
      stateMemo[repoId] = result;
    }
    return result;
  };

  const _readRenderedState = async (
    repoId: string
  ): Promise<RenderedApplicationState> => {
    if (stateMemo[repoId]) {
      return stateMemo[repoId];
    }
    const result = await dataSource.readRenderedState(repoId);
    return result;
  };

  const defaultDataSource: DataSource = {
    repoExists: _repoExists,
    pluginManifestExists: _pluginManifestExists,
    getPluginManifest: _getPluginManifest,
    readRepoSettings: _readRepoSettings,
    readCurrentRepoState: _readCurrentRepoState,
    saveCurrentRepoState: _saveCurrentRepoState,
    readBranch: _readBranch,
    readBranches: _readBranches,
    saveBranch: _saveBranch,
    deleteBranch: _deleteBranch,
    saveCommit: _saveCommit,
    readCommit: _readCommit,
    readCheckpoint: _readCheckpoint,
    saveCheckpoint: _saveCheckpoint,
    readHotCheckpoint: _readHotCheckpoint,
    saveHotCheckpoint: _saveHotCheckpoint,
    deleteHotCheckpoint: _deleteHotCheckpoint,
    readRenderedState: _readRenderedState,
    saveRenderedState: _saveRenderedState,
  };
  return {
    ...dataSource,
    ...defaultDataSource,
    ...dataSourceOverride,
  };
};
