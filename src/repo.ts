import axios from "axios";
import fs, { createWriteStream, existsSync } from "fs";
import path from "path";
import tar from "tar";
import {
  existsAsync,
  getRemoteHostAsync,
  getUserSession,
  User,
  vReposPath,
  vTMPPath,
} from "./filestructure";
import { broadcastAllDevices } from "./multiplexer";
import { generateStateFromKV, getPluginManifest } from "./plugins";
import { applyDiff, CommitData, Diff, TextDiff } from "./versioncontrol";

export interface RawStore {
  [name: string]: Array<{ key: string; value: string }>;
}

export interface CommitState {
  description: Array<string>;
  licenses: Array<{ key: string; value: string }>;
  plugins: Array<{ key: string; value: string }>;
  store: RawStore;
  binaries: Array<{ key: string; value: string }>;
}

export interface StoreStateDiff {
  [pluginName: string]: Diff;
}

export interface StateDiff {
  plugins: Diff;
  binaries: Diff;
  store: StoreStateDiff;
  licenses: Diff;
  description: TextDiff;
}

export interface State {
  diff: StateDiff;
  branch: string | null;
  commit: string | null;
}

export interface Branch {
  name: string,
  firstCommit: null | string;
  lastCommit: null | string;
  createdBy: string;
  createdAt: string;
}

export interface CommitHistory {
  sha: null|string;
  message: string;
} 

const EMPTY_COMMIT_STATE: CommitState = {
  description: [],
  licenses: [],
  plugins: [],
  store: {},
  binaries: [],
};

const EMPTY_COMMIT_DIFF: StateDiff = {
  description: { add: {}, remove: {} },
  licenses: { add: {}, remove: {} },
  plugins: { add: {}, remove: {} },
  store: {},
  binaries: { add: {}, remove: {} },
};

const EMPTY_COMMIT_DIFF_STRING = JSON.stringify(EMPTY_COMMIT_DIFF);

export const getLocalRepos = async (): Promise<string[]> => {
  const repoDir = await fs.promises.readdir(vReposPath);
  return repoDir?.filter((repoName) => {
    return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(
      repoName
    );
  });
};

export const cloneRepo = async (repoId: string): Promise<boolean> => {
  try {
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const repoPath = path.join(vReposPath, repoId);
    const downloadPath = path.join(vTMPPath, `${repoId}.tar.gz`);
    await axios({
      method: "get",
      url: `${remote}/api/repo/${repoId}/clone`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
      onDownloadProgress: (progressEvent) => {
        broadcastAllDevices(`repo:${repoId}:clone-progress`, progressEvent);
      },
      responseType: "stream",
    }).then((response) => {
      const exists = existsSync(downloadPath);
      if (exists) {
        return true;
      }
      const writer = createWriteStream(downloadPath);
      return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        let error = null;
        writer.on("error", (err) => {
          error = err;
          writer.close();
          reject(err);
        });
        writer.on("close", () => {
          if (!error) {
            resolve(true);
          }
        });
      });
    });
    const exists = await existsAsync(repoPath);
    if (!exists) {
      await fs.promises.mkdir(repoPath);
      if (process.env.NODE_ENV != "test") {
        await fs.promises.chmod(repoPath, 0o755);
      }
      await tar.x({
        file: downloadPath,
        cwd: repoPath,
      });
    }
    const downloadExists = await existsAsync(downloadPath);
    if (downloadExists) {
      await fs.promises.rm(downloadPath);
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getRepoSettings = async (repoId: string) => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const settingsPath = path.join(repoPath, `settings.json`);
    const settings = await fs.promises.readFile(settingsPath);
    return JSON.parse(settings.toString());
  } catch (e) {
    return null;
  }
};

export const getCurrentState = async (repoId: string): Promise<State> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fs.promises.readFile(currentPath);
    return JSON.parse(current.toString());
  } catch (e) {
    return null;
  }
};

export const getCurrentCommitSha = async (repoId: string): Promise<string|null> => {
  try {
    const current = await getCurrentState(repoId);
    if (current.commit) {
      return current.commit;
    }
    if (current.branch) {
      const branch = await getLocalBranch(repoId, current.branch);
      return branch?.lastCommit ?? null;
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const getLocalBranches = async (
  repoId: string
): Promise<Array<Branch>> => {
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
        return getLocalBranch(repoId, branchName);
      })
  );
  return branches.filter((branch) => branch != null);
};

export const getCommitDirPath = (repoId: string, commitSha: string): string => {
  return path.join(vReposPath, repoId, "commits", commitSha.substring(0, 2));
};

export const diffIsEmpty = (stateDiff: StateDiff) => {
  return JSON.stringify(stateDiff) == EMPTY_COMMIT_DIFF_STRING;
}

export const canCommit = async (
  repoId: string,
  user: User,
  message: string,
): Promise<boolean> => {
  if (!user || !user.id) {
    return false;
  }
  if ((message ?? "").length == 0) {
    return false;
  }
  const currentSha = await getCurrentCommitSha(repoId);
  const commit = await readCommit(repoId, currentSha);
  if (!commit) {
    return false;
  }
  const currentState = await getCurrentState(repoId);
  if (!currentState) {
    return false;
  }
  if (diffIsEmpty(currentState.diff)) {
    return false;
  }
  return true;
}

export const readCommit = async (
  repoId: string,
  commitSha: string
): Promise<CommitData | null> => {
  try {
    const commitDir = getCommitDirPath(repoId, commitSha);
    const commitPath = path.join(commitDir, `${commitSha.substring(2)}.json`);
    const commitDataString = await fs.promises.readFile(commitPath);
    return JSON.parse(commitDataString.toString());
  } catch (e) {
    return null;
  }
};

export const writeCommit = async (
  repoId: string,
  commitSha: string,
  commitData: CommitData
) => {
  try {
    const commitDir = getCommitDirPath(repoId, commitSha);
    const commitDirExists = await existsAsync(commitDir);
    if (!commitDirExists) {
      await fs.promises.mkdir(commitDir, 0o755);
    }
    const commitPath = path.join(commitDir, `${commitSha.substring(2)}.json`);
    await fs.promises.writeFile(
      commitPath,
      Buffer.from(JSON.stringify(commitData, null, 2))
    );
    return commitData;
  } catch (e) {
    return null;
  }
};

export const getHistory = async (
  repoId: string,
  sha: string|null
): Promise<Array<CommitHistory>|null> => {
  if (sha == null) {
    return [];
  }
  const commit = await readCommit(repoId, sha);
  if (commit == null) {
    return null;
  }
  const history = await getHistory(repoId, commit.historicalParent);
  return [{
    sha,
    message: commit.message
  }, ...history];
}

export const getLocalBranch = async (
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
export const deleteLocalBranch = async (
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

export const updateLocalBranch = async (
  repoId: string,
  branchName: string,
  branchData: Branch
): Promise<Branch|null> => {
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

export const getCommitState = async (
  repoId: string,
  sha?: string
): Promise<CommitState | null> => {
  if (!sha) {
    return EMPTY_COMMIT_STATE;
  }
  const commitData = await readCommit(repoId, sha);
  if (commitData == null) {
    return null;
  }
  const state = await getCommitState(repoId, commitData.parent);
  return Object.keys(commitData.diff).reduce((acc, namespace): CommitState => {
    if (namespace == "store") {
      const store: RawStore = Object.keys(commitData?.diff?.store ?? {}).reduce(
        (storeAcc, pluginName) => {
          return {
            ...storeAcc,
            [pluginName]: applyDiff(
              commitData.diff?.store?.[pluginName] ?? { add: {}, remove: {} },
              storeAcc?.[pluginName] ?? []
            ),
          };
        },
        state?.store ?? ({} as RawStore)
      );
      return {
        ...acc,
        store,
      };
    }
    return {
      ...acc,
      [namespace]: applyDiff(commitData.diff[namespace], state[namespace]),
    };
  }, {} as CommitState);
};

export const getCurrentBranch = async (repoId: string): Promise<Branch|null> => {
  const current = await getCurrentState(repoId);
  if (current.branch) {
    const branch = await getLocalBranch(repoId, current.branch);
    return branch;
  }
  return null;
};

export const getUnstagedCommitState = async (
  repoId: string
): Promise<CommitState> => {
  const current = await getCurrentState(repoId);
  if (current.branch) {
    const branch = await getLocalBranch(repoId, current.branch);
    const commitState = await getCommitState(repoId, branch.lastCommit);
    return commitState;
  }
  const commitState = await getCommitState(repoId, current.commit);
  return commitState;
};

export const getRepoState = async (repoId: string): Promise<CommitState> => {
  const current = await getCurrentState(repoId);
  const state = await getUnstagedCommitState(repoId);
  return Object.keys(current.diff).reduce((acc, namespace): CommitState => {
    if (namespace == "store") {

      const store: RawStore = Object.keys(acc?.store ?? {}).reduce(
        (storeAcc, pluginName) => {
          return {
            ...storeAcc,
            [pluginName]: applyDiff(
              current.diff?.store?.[pluginName] ?? { add: {}, remove: {} },
              storeAcc?.[pluginName] ?? []
            ),
          };
        },
       acc?.store ?? ({} as RawStore)
      );

      return {
        ...acc,
        store,
      };
    }
    return {
      ...acc,
      [namespace]: applyDiff(current.diff[namespace], state[namespace]),
    };
  }, state as CommitState);
};

export const saveDiffListToCurrent = async (
  repoId: string,
  diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
  }>
): Promise<State> => {
  const current = await getCurrentState(repoId);
  const commitState = await getCommitState(repoId);
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const updated = diffList.reduce((acc, { namespace, diff, pluginName }) => {
      if (namespace != "store") {
        return {
          ...acc,
          diff: {
            ...current.diff,
            [namespace]: diff,
          },
        };
      }
      return {
        ...acc,
        diff: {
          ...acc.diff,
          store: {
            ...(acc.diff?.store ?? {}),
            [pluginName]: diff,
          },
        },
      };
    }, current);
    // PRUNE DANGLING PLUGINS FROM STORE
    const nextPlugins = applyDiff(updated.diff.plugins, commitState.plugins);
    const pluginNameSet = new Set(nextPlugins.map((p) => p.key));
    for (let pluginName in updated.diff.store) {
      if (!pluginNameSet.has(pluginName)) {
        delete updated.diff.store[pluginName];
      }
    }
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(updated, null, 2))
    );
    return updated as State;
  } catch (e) {
    return current;
  }
};

/**
 * 
 * use when committing gainst branch or sha
 */
export const updateCurrentCommitSHA = async (repoId: string, sha: string): Promise<State|null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await getCurrentState(repoId);
    const updated = {
      ...current,
      commit: sha,
      diff: EMPTY_COMMIT_DIFF,
    };
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(updated, null, 2))
    );
    return updated as State;
  } catch (e) {
    return null;
  }
};

/**
 * 
 * use when HEAD is detached
 */

export const updateCurrentWithSHA = async (repoId: string, sha: string): Promise<State|null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await getCurrentState(repoId);
    const updated = {
      ...current,
      commit: sha,
      branch: null,
      diff: EMPTY_COMMIT_DIFF,
    };
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(updated, null, 2))
    );
    return updated as State;
  } catch (e) {
    return null;
  }
};

export const updateCurrentWithNewBranch = async (repoId: string, branchName: string): Promise<State|null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await getCurrentState(repoId);
    const updated = {
      ...current,
      commit: null,
      branch: branchName
    };
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(updated, null, 2))
    );
    return updated as State;
  } catch (e) {
    return null;
  }
};

export const updateCurrentBranch = async (repoId: string, branchName: string): Promise<State|null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await getCurrentState(repoId);
    const updated = {
      ...current,
      commit: null,
      branch: branchName,
      diff: EMPTY_COMMIT_DIFF,
    };
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(updated, null, 2))
    );
    return updated as State;
  } catch (e) {
    return null;
  }
};

export const buildStateStore = async (
  state: CommitState
): Promise<{ [key: string]: unknown }> => {
  let out = {};
  const plugins = new Set(state.plugins.map(v => v.key));
  for (let pluginName in state.store) {
    if (plugins.has(pluginName)) {
      const kv = state?.store?.[pluginName] ?? [];
      const manifest = await getPluginManifest(pluginName, state?.plugins ?? []);
      const pluginState = generateStateFromKV(manifest, kv, pluginName);
      out[pluginName] = pluginState;
    }
  }
  return out;
};
