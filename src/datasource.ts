import path from "path";
import fs from "fs";
import { existsAsync, vPluginsPath, vReposPath } from "./filestructure";
import { Manifest } from "./plugins";
import { Branch, RepoSetting, State } from "./repo";
import { CommitData } from "./versioncontrol";

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
  repoExists?(repoId?: string): Promise<boolean>;
  getRepoSettings?: (repoId: string) => Promise<RepoSetting>;
  getCurrentState?: (repoId: string) => Promise<State>;
  saveCurrentState?: (repoId: string, state: State) => Promise<State>;

  getBranch?: (repoId: string, branchName: string) => Promise<Branch>;
  getBranches?: (repoId: string) => Promise<Array<Branch>>;
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
}

const repoExists = async (repoId?: string): Promise<boolean> => {
  if (!repoId) {
    return false;
  }
  return await existsAsync(path.join(vReposPath, repoId));
};

/* PLUGINS */
const getPluginManifest = async (
  pluginName: string,
  pluginVersion: string
): Promise<Manifest> => {
  const pluginManifestPath = path.join(
    vPluginsPath,
    pluginName,
    pluginVersion,
    "floro",
    "floro.manifest.json"
  );
  const manifestString = await fs.promises.readFile(pluginManifestPath);
  return JSON.parse(manifestString.toString());
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
const getRepoSettings = async (repoId: string): Promise<RepoSetting> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const settingsPath = path.join(repoPath, `settings.json`);
    const settings = await fs.promises.readFile(settingsPath);
    return JSON.parse(settings.toString());
  } catch (e) {
    return null;
  }
};

const getCurrentState = async (repoId: string): Promise<State> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fs.promises.readFile(currentPath);
    return JSON.parse(current.toString());
  } catch (e) {
    return null;
  }
};

const getBranch = async (
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

const getBranches = async (repoId: string): Promise<Array<Branch>> => {
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
        return getBranch(repoId, branchName);
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

const saveCurrentState = async (
  repoId: string,
  state: State
): Promise<State> => {
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
    const commitDir = getCommitDirPath(repoId, sha);
    const commitPath = path.join(commitDir, `${sha.substring(2)}.json`);
    const commitDataString = await fs.promises.readFile(commitPath);
    return JSON.parse(commitDataString.toString());
  } catch (e) {
    return null;
  }
};

export const makeDataSource = (datasource: DataSource = {
    repoExists,
    getPluginManifest,
    pluginManifestExists,
    getRepoSettings,
    getCurrentState,
    saveCurrentState,
    getBranch,
    getBranches,
    deleteBranch,
    saveBranch,
    saveCommit,
    readCommit,
  }) => {
  const defaultDataSource: DataSource = {
    repoExists,
    getPluginManifest,
    pluginManifestExists,
    getRepoSettings,
    getCurrentState,
    saveCurrentState,
    getBranch,
    getBranches,
    deleteBranch,
    saveBranch,
    saveCommit,
    readCommit,
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
  }


  const memoizedPluginManifestExistence = new Set();
  const _pluginManifestExists = async (pluginName: string, pluginVersion: string) => {
    const pluginString = pluginName + "-" + pluginVersion;
    if (memoizedPluginManifestExistence.has(pluginName)) {
        return true;
    }
    const result = await dataSource.pluginManifestExists(pluginName, pluginVersion);
    if (result) {
        memoizedRepoExistence.add(pluginString);
    }
    return result;
  }

  const manifestMemo: { [key: string]: Manifest } = {};
  const _getPluginManifest = async (
    pluginName: string,
    pluginVersion: string
  ): Promise<Manifest> => {
    const memoString = pluginName + "-" + pluginVersion;
    if (manifestMemo[memoString]) {
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
  const _getRepoSettings = async (repoId: string): Promise<RepoSetting> => {
    if (memoizedSettings[repoId]) {
      return memoizedSettings[repoId];
    }
    const result = await dataSource.getRepoSettings(repoId);
    if (result) {
      memoizedSettings[repoId] = result;
    }
    return result;
  };

  const memoizedCurrentState = {};
  const _getCurrentState = async (repoId: string): Promise<State> => {
    if (memoizedCurrentState[repoId]) {
      return memoizedCurrentState[repoId];
    }
    const result = await dataSource.getCurrentState(repoId);
    if (result) {
      memoizedCurrentState[repoId] = result;
    }
    return result;
  };

  const _saveCurrentState = async (
    repoId: string,
    state: State
  ): Promise<State> => {
    const result = await dataSource.saveCurrentState(repoId, state);
    if (result) {
      memoizedCurrentState[repoId] = result;
    }
    console.log("MCS", memoizedCurrentState)
    return result;
  };

  const branchMemo = {};
  const branchesMemo = {};
  const _getBranch = async (
    repoId: string,
    branchName: string
  ): Promise<Branch> => {
    const branchMemoString = repoId + "-" + branchName;
    if (branchMemo[branchMemoString]) {
      return branchMemo[branchMemoString];
    }
    const result = await dataSource.getBranch(repoId, branchName);
    if (result) {
      branchMemo[branchMemoString] = result;
    }
    return result;
  };

  const _getBranches = async (repoId: string): Promise<Array<Branch>> => {
    if (branchesMemo[repoId]) {
      return branchesMemo[repoId];
    }
    const result = await dataSource.getBranches(repoId);
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

  const defaultDataSource: DataSource = {
    repoExists: _repoExists,
    pluginManifestExists: _pluginManifestExists,
    getPluginManifest: _getPluginManifest,
    getRepoSettings: _getRepoSettings,
    getCurrentState: _getCurrentState,
    saveCurrentState: _saveCurrentState,
    getBranch: _getBranch,
    getBranches: _getBranches,
    saveBranch: _saveBranch,
    deleteBranch: _deleteBranch,
    saveCommit: _saveCommit,
    readCommit: _readCommit,
  };
  return {
    ...dataSource,
    ...defaultDataSource,
    ...dataSourceOverride,
  };
};

export default makeDataSource();
