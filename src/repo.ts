import axios from "axios";
import fs, { access, createWriteStream, existsSync } from "fs";
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
import {
  cascadePluginState,
  getKVStateForPlugin,
  getPluginManifests,
  getSchemaMapForManifest,
  getStateFromKVForPlugin,
  Manifest,
  PluginElement,
  pluginListToMap,
  readPluginManifest,
} from "./plugins";
import {
  applyDiff,
  CommitData,
  Diff,
  getDiff,
  getDiffHash,
  getKVHash,
  getMergeSequence,
  getRowHash,
  getTextDiff,
  hashString,
  TextDiff,
} from "./versioncontrol";

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

export interface RenderedCommitState {
  description: Array<string>;
  licenses: Array<{ key: string; value: string }>;
  plugins: Array<{ key: string; value: string }>;
  store: { [key: string]: object };
  binaries: Array<{ key: string; value: string }>;
}

export interface TokenizedState {
  description: Array<string>;
  licenses: Array<string>;
  plugins: Array<string>;
  store: { [key: string]: Array<string> };
  binaries: Array<string>;
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
  isMerge: boolean;
  merge: null | {
    fromSha: string,
    fromBranch: string,
    intoSha: string,
    intoBranch: string,
  };
}

export interface Branch {
  name: string;
  firstCommit: null | string;
  lastCommit: null | string;
  createdBy: string;
  createdAt: string;
}

export interface CommitHistory {
  sha: null | string;
  idx: number;
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

export const getAddedDeps = (
  oldPlugins: Array<PluginElement>,
  newPlugins: Array<PluginElement>
): Array<PluginElement> => {
  const oldPluginMap = pluginListToMap(oldPlugins);
  const out: Array<PluginElement> = [];
  for (const plugin of newPlugins) {
    if (!oldPluginMap[plugin.key] || oldPluginMap[plugin.key] != plugin.value) {
      out.push(plugin);
    }
  }
  return out;
};

export const getRemovedDeps = (
  oldPlugins: Array<PluginElement>,
  newPlugins: Array<PluginElement>
): Array<PluginElement> => {
  const newPluginMap = pluginListToMap(newPlugins);
  const out: Array<PluginElement> = [];
  for (const plugin of oldPlugins) {
    if (!newPluginMap[plugin.key] || newPluginMap[plugin.key] != plugin.value) {
      out.push(plugin);
    }
  }
  return out;
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

//CHECK
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

//CHECK
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

//CHECK
export const getCurrentCommitSha = async (
  repoId: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<string | null> => {
  try {
    const current = await fetchCurrentState(repoId);
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
};

export const canCommit = async (
  repoId: string,
  user: User,
  message: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<boolean> => {
  if (!user || !user.id) {
    return false;
  }
  if ((message ?? "").length == 0) {
    return false;
  }
  const currentSha = await getCurrentCommitSha(repoId, fetchCurrentState);
  const commit = await readCommit(repoId, currentSha);
  if (commit) {
    // ensure safe
  }
  const currentState = await fetchCurrentState(repoId);
  if (!currentState) {
    return false;
  }
  if (diffIsEmpty(currentState.diff)) {
    return false;
  }
  return true;
};

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

export const buildCommitData = (
  parentSha: string,
  historicalParent: string,
  idx: number,
  diff: StateDiff,
  userId: string,
  timestamp: string,
  message: string
): CommitData => {
  const commitData: CommitData = {
    parent: parentSha,
    historicalParent: historicalParent,
    idx: idx,
    diff,
    timestamp,
    userId,
    message,
  };
  const sha = getDiffHash(commitData);
  return {
    ...commitData,
    sha,
  };
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
  sha: string | null
): Promise<Array<CommitHistory> | null> => {
  if (sha == null) {
    return [];
  }
  const commit = await readCommit(repoId, sha);
  if (commit == null) {
    return null;
  }
  const history = await getHistory(repoId, commit.parent);
  return [
    {
      sha,
      idx: commit.idx,
      message: commit.message,
    },
    ...history,
  ];
};

export const getBaseDivergenceSha = (
  history: Array<CommitHistory>,
  origin: CommitData
): CommitHistory => {
  const baseIdx = origin.idx + 1;
  for(const commit of history) {
    if (commit.idx == baseIdx) {
      return commit;
    }
  }
  return null;
}

export const getDivergenceOriginSha = async (
  repoId: string,
  sha1: string,
  sha2: string
) => {
  const history1 = await getHistory(repoId, sha1);
  if (!history1) {
    throw "missing history";
  }
  const history2 = await getHistory(repoId, sha2);

  if (!history2) {
    throw "missing history";
  }
  const longerHistory =
    history1.length >= history2.length ? history1 : history2;
  const shorterHistory =
    history1.length < history2.length ? history1 : history2;
  const visited = new Set();
  for (let historyObj of shorterHistory) {
    visited.add(historyObj.sha);
  }
  for (let historyObj of longerHistory) {
    if (visited.has(historyObj.sha)) {
      return historyObj.sha;
    }
  }
  return null;
};

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
): Promise<Branch | null> => {
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

/**
 *  REFACTOR ABOVE WITH FOLLOWINg
 *  */
export const applyStateDiffToCommitState = async (
  commitState: CommitState,
  stateDiff: StateDiff
) => {
  return Object.keys(stateDiff).reduce((acc, namespace): CommitState => {
    if (namespace == "store") {
      const store: RawStore = Object.keys(stateDiff?.store ?? {}).reduce(
        (storeAcc, pluginName) => {
          return {
            ...storeAcc,
            [pluginName]: applyDiff(
              stateDiff?.store?.[pluginName] ?? { add: {}, remove: {} },
              storeAcc?.[pluginName] ?? []
            ),
          };
        },
        commitState?.store ?? ({} as RawStore)
      );
      return {
        ...acc,
        store,
      };
    }
    return {
      ...acc,
      [namespace]: applyDiff(stateDiff[namespace], commitState[namespace]),
    };
  }, commitState);
};

export const getCurrentBranch = async (
  repoId: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<Branch | null> => {
  const current = await fetchCurrentState(repoId);
  if (current.branch) {
    const branch = await getLocalBranch(repoId, current.branch);
    return branch;
  }
  return null;
};

export const getUnstagedCommitState = async (
  repoId: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<CommitState> => {
  const current = await fetchCurrentState(repoId);
  if (current.branch) {
    const branch = await getLocalBranch(repoId, current.branch);
    const commitState = await getCommitState(repoId, branch.lastCommit);
    return commitState;
  }
  const commitState = await getCommitState(repoId, current.commit);
  return commitState;
};

export const getRepoState = async (
  repoId: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<CommitState> => {
  const current = await fetchCurrentState(repoId);
  const state = await getUnstagedCommitState(repoId, fetchCurrentState);
  return Object.keys(current.diff).reduce((acc, namespace): CommitState => {
    if (namespace == "store") {
      const store: RawStore = Object.keys(current.diff?.store ?? {}).reduce(
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

export const getProposedStateFromDiffListOnCurrent = async (
  repoId: string,
  diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
  }>,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<State | null> => {
  const current = await fetchCurrentState(repoId);
  const commitState = await getCommitState(repoId, current.commit);
  try {
    const updated = diffList.reduce((acc, { namespace, diff, pluginName }) => {
      if (namespace != "store") {
        return {
          ...acc,
          diff: {
            ...acc.diff,
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
    return updated as State;
  } catch (e) {
    return null;
  }
};

export const saveDiffListToCurrent = async (
  repoId: string,
  diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
  }>,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<State | null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const proposedChanges = await getProposedStateFromDiffListOnCurrent(
      repoId,
      diffList,
      fetchCurrentState
    );
    if (!proposedChanges) {
      return null;
    }
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(proposedChanges, null, 2)),
      "utf-8"
    );
    return proposedChanges;
  } catch (e) {
    return null;
  }
};

/**
 *
 * use when committing against branch or sha
 */
export const updateCurrentCommitSHA = async (
  repoId: string,
  sha: string,
  isResolvingMerge: boolean,
  fetchCurrentState: (repoId: string) => Promise<State>,
): Promise<State | null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fetchCurrentState(repoId);
    if (current.isMerge && !isResolvingMerge) {
      return null;
    }
    const updated = {
      ...current,
      commit: sha,
      diff: EMPTY_COMMIT_DIFF,
      isMerge: false,
      merge: null,
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

export const updateCurrentWithSHA = async (
  repoId: string,
  sha: string,
  isResolvingMerge: boolean,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<State | null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fetchCurrentState(repoId);
    if (current.isMerge && !isResolvingMerge) {
      return null;
    }
    const updated = {
      ...current,
      commit: sha,
      branch: null,
      diff: EMPTY_COMMIT_DIFF,
      isMerge: false,
      merge: null,
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

export const updateCurrentWithNewBranch = async (
  repoId: string,
  branchName: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<State | null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fetchCurrentState(repoId);
    if (current.isMerge) {
      return null;
    }
    const updated = {
      ...current,
      //commit: null,
      branch: branchName,
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

export const updateCurrentBranch = async (
  repoId: string,
  branchName: string,
  fetchCurrentState: (repoId: string) => Promise<State>
): Promise<State | null> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fetchCurrentState(repoId);
    if (current.isMerge) {
      return null;
    }
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

export const getPluginsToRunUpdatesOn = (
  pastPlugins: Array<PluginElement>,
  nextPlugins: Array<PluginElement>
) => {
  return nextPlugins.filter(({ key, value }) => {
    const lastPlugin = pastPlugins.find((p) => p.key == key);
    if (!lastPlugin) {
      return true;
    }
    if (lastPlugin.value != value) {
      return true;
    }
    return false;
  });
};

export const buildStateStore = async (
  state: CommitState,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
): Promise<{ [key: string]: object }> => {
  let out = {};
  const manifests = await getPluginManifests(state.plugins, pluginFetch);
  for (const pluginManifest of manifests) {
    const kv = state?.store?.[pluginManifest.name] ?? [];
    const schemaMap = await getSchemaMapForManifest(
      pluginManifest,
      pluginFetch
    );
    const pluginState = getStateFromKVForPlugin(
      schemaMap,
      kv,
      pluginManifest.name
    );
    out[pluginManifest.name] = pluginState;
  }
  return out;
};

export const convertStateStoreToKV = async (
  state: CommitState,
  stateStore: { [key: string]: object },
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
): Promise<RawStore> => {
  let out = {};
  const manifests = await getPluginManifests(state.plugins, pluginFetch);
  for (const pluginManifest of manifests) {
    const schemaMap = await getSchemaMapForManifest(
      pluginManifest,
      pluginFetch
    );
    const kv = await getKVStateForPlugin(
      schemaMap,
      pluginManifest.name,
      stateStore,
      pluginFetch
    );
    out[pluginManifest.name] = kv;
  }
  return out;
};

export const tokenizeCommitState = (
  commitState: CommitState
): [TokenizedState, { [key: string]: unknown }] => {
  const tokenStore: { [key: string]: unknown } = {};
  const description = commitState.description.reduce((acc, value) => {
    const hash = hashString(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const licenses = commitState.licenses.reduce((acc, value) => {
    const hash = getKVHash(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const plugins = commitState.plugins.reduce((acc, value) => {
    const hash = getKVHash(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const binaries = commitState.binaries.reduce((acc, value) => {
    const hash = getKVHash(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const store = Object.keys(commitState.store).reduce((acc, key) => {
    const pluginStore = commitState.store[key].reduce((storeAcc, value) => {
      const hash = getKVHash(value);
      tokenStore[hash] = value;
      return [...storeAcc, hash];
    }, []);
    return {
      ...acc,
      [key]: pluginStore,
    };
  }, {});
  return [
    {
      description,
      licenses,
      plugins,
      store,
      binaries,
    },
    tokenStore,
  ];
};

export const detokenizeStore = (
  tokenizedState: TokenizedState,
  tokenStore: { [key: string]: unknown }
): CommitState => {
  const description = tokenizedState.description.map((token) => {
    return tokenStore[token];
  }) as Array<string>;

  const licenses = tokenizedState.licenses.map((token) => {
    return tokenStore[token];
  }) as Array<{ key: string; value: string }>;

  const plugins = tokenizedState.plugins.map((token) => {
    return tokenStore[token];
  }) as Array<{ key: string; value: string }>;

  const binaries = tokenizedState.binaries.map((token) => {
    return tokenStore[token];
  }) as Array<{ key: string; value: string }>;

  const store = Object.keys(tokenizedState.store).reduce((acc, pluginName) => {
    return {
      ...acc,
      [pluginName]: tokenizedState.store[pluginName].map((token) => {
        return tokenStore[token];
      }),
    };
  }, {});
  return {
    description,
    licenses,
    plugins,
    store,
    binaries,
  };
};

export const mergeTokenStores = (
  tokenStore1: { [key: string]: unknown },
  tokenStore2: { [key: string]: unknown }
) => {
  return {
    ...tokenStore1,
    ...tokenStore2,
  };
};

export const uniqueKV = (
  kvList: Array<{ key: string; value: string }>
): Array<{ key: string; value: string }> => {
  let out: Array<{ key: string; value: string }> = [];
  let seen = new Set();
  for (let { key, value } of kvList) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ key, value });
    }
  }
  return out;
};

export const getCommitStateDiffList = (
  commit1: CommitState,
  commit2: CommitState
): Array<{
  diff: Diff | TextDiff;
  namespace: string;
  pluginName?: string;
}> => {
  const diffList = [];
  const pluginsToTraverse = Array.from([
    ...Object.keys(commit1.store),
    ...Object.keys(commit2.store),
  ]);
  for (const prop in commit2) {
    if (prop == "store") {
      for (const pluginName of pluginsToTraverse) {
        const diff = getDiff(
          commit1?.store?.[pluginName] ?? [],
          commit2?.store?.[pluginName] ?? []
        );
        diffList.push({
          diff,
          namespace: "store",
          pluginName,
        });
      }
      continue;
    }
    if (prop == "description") {
      const diff = getTextDiff((commit1?.[prop] ?? []).join(""), (commit2?.[prop] ?? [])?.join(""));
      diffList.push({
        diff,
        namespace: prop,
      });
      continue;
    }

    const diff = getDiff(commit1?.[prop] ?? [], commit2?.[prop] ?? []);
    diffList.push({
      diff,
      namespace: prop,
    });
  }
  return diffList;
};

export const renderDiffList = (
  diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
  }>
): StateDiff => {
  return diffList.reduce((acc: {diff: StateDiff}, { namespace, diff, pluginName }) => {
    if (namespace != "store") {
      return {
        ...acc,
        diff: {
          ...acc.diff,
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
      } as StateDiff,
    };
  }, {diff: EMPTY_COMMIT_DIFF}).diff;
};

export const getMergeCommitStates = async (
  repoId: string,
  sha1: string,
  sha2: string
) => {
  try {
    const originSha = await getDivergenceOriginSha(repoId, sha1, sha2);
    const commit1 = await getCommitState(repoId, sha1);
    const commit2 = await getCommitState(repoId, sha2);
    const originCommit = !!originSha
      ? await getCommitState(repoId, originSha)
      : EMPTY_COMMIT_STATE;
    return {
      commit1,
      commit2,
      originCommit,
    };
  } catch(e) {
    return null;
  }
};

export const canAutoMergeCommitStates = async (
  commit1: CommitState,
  commit2: CommitState,
  originCommit: CommitState,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest>,
): Promise<boolean> => {
  try {
    const yourMerge = await getMergedCommitState(
      commit1,
      commit2,
      originCommit,
      pluginFetch,
      "yours"
    );
    const theirMerge = await getMergedCommitState(
      commit1,
      commit2,
      originCommit,
      pluginFetch,
      "theirs"
    );
    return JSON.stringify(yourMerge) == JSON.stringify(theirMerge);
  } catch (e) {
    return null;
  }
};

export const getMergedCommitState = async (
  commit1: CommitState,
  commit2: CommitState,
  originCommit: CommitState,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest>,
  whose: "yours" | "theirs" = "yours"
): Promise<CommitState> => {
  try {
    const [tokenizedCommit1, tokenizedStore1] = tokenizeCommitState(commit1);
    const [tokenizedCommit2, tokenizedStore2] = tokenizeCommitState(commit2);
    const [tokenizedOrigin] = tokenizeCommitState(originCommit);

    const tokenizedDescription = getMergeSequence(
      tokenizedOrigin.description,
      tokenizedCommit1.description,
      tokenizedCommit2.description,
      whose
    );

    const tokenizedLicenses = getMergeSequence(
      tokenizedOrigin.licenses,
      tokenizedCommit1.licenses,
      tokenizedCommit2.licenses,
      whose
    );

    const tokenizedPlugins = getMergeSequence(
      tokenizedOrigin.plugins,
      tokenizedCommit1.plugins,
      tokenizedCommit2.plugins,
      whose
    );

    const tokenizedBinaries = getMergeSequence(
      tokenizedOrigin.binaries,
      tokenizedCommit1.binaries,
      tokenizedCommit2.binaries,
      whose
    );

    const pluginsToTraverse = Array.from([
      ...Object.keys(tokenizedCommit1.store),
      ...Object.keys(tokenizedCommit2.store),
    ]);
    const tokenizedStore = {};
    for (const pluginName of pluginsToTraverse) {
      const pluginKVs1 = tokenizedCommit1?.store?.[pluginName] ?? [];
      const pluginKVs2 = tokenizedCommit2?.store?.[pluginName] ?? [];
      const orignKVs = tokenizedOrigin?.store?.[pluginName] ?? [];
      const pluginStoreSequence = getMergeSequence(
        orignKVs,
        pluginKVs1,
        pluginKVs2,
        whose
      );
      tokenizedStore[pluginName] = pluginStoreSequence;
    }
    const tokenStore = mergeTokenStores(tokenizedStore1, tokenizedStore2);
    const tokenizedState: TokenizedState = {
      description: tokenizedDescription,
      licenses: tokenizedLicenses,
      plugins: tokenizedPlugins,
      store: tokenizedStore,
      binaries: tokenizedBinaries,
    };

    const mergeState = detokenizeStore(tokenizedState, tokenStore);
    mergeState.plugins = uniqueKV(mergeState.plugins);
    mergeState.binaries = uniqueKV(mergeState.binaries);
    mergeState.licenses = uniqueKV(mergeState.licenses);

    let stateStore = await buildStateStore(mergeState, pluginFetch);

    const manifests = await getPluginManifests(mergeState.plugins, pluginFetch);
    const rootManifests = manifests.filter(
      (m) => Object.keys(m.imports).length === 0
    );

    for (const manifest of rootManifests) {
      const schemaMap = await getSchemaMapForManifest(manifest, pluginFetch);
      stateStore = await cascadePluginState(
        schemaMap,
        stateStore,
        manifest.name,
        pluginFetch
      );
    }

    mergeState.store = await convertStateStoreToKV(
      mergeState,
      stateStore,
      pluginFetch
    );
    return mergeState;
  } catch (e) {
    return null;
  }
};

export const canAutoMergeOnTopCurrentState = async (
  repoId: string,
  mergeSha: string,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
) => {
  try {
    const current = await getCurrentState(repoId);
    const repoState = await getRepoState(repoId, getCurrentState);
    const mergeState = await getCommitState(repoId, mergeSha);
    const { originCommit } = await getMergeCommitStates(repoId, current.commit, mergeSha);
    return await canAutoMergeCommitStates(repoState, mergeState, originCommit, pluginFetch);
  } catch (e) {
    return null;
  }
}

export const renderCommitState = async (
  state: CommitState,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest>
): Promise<RenderedCommitState> => {
  const store = await buildStateStore(state, pluginFetch);
  return {
    ...state,
    store,
  };
};
