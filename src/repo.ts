import axios from "axios";
import fs, { createWriteStream, existsSync } from "fs";
import path from "path";
import tar from "tar";
import { DataSource } from "./datasource";
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
  PluginElement,
  pluginListToMap,
} from "./plugins";
import {
  applyDiff,
  CommitData,
  Diff,
  getDiff,
  getDiffHash,
  getKVHash,
  getMergeSequence,
  getTextDiff,
  hashString,
  TextDiff,
} from "./versioncontrol";

export interface RepoSetting {
  mainBranch: string;
}

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
    fromSha: string;
    fromBranch: string;
    intoSha: string;
    intoBranch: string;
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

export interface CheckpointMap {
  [sha: string]: CommitState
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

const CHECKPOINT_MODULO = 50;

const EMPTY_COMMIT_DIFF_STRING = JSON.stringify(EMPTY_COMMIT_DIFF);

export const getRepos = async (): Promise<string[]> => {
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
export const getCurrentCommitSha = async (
  datasource: DataSource,
  repoId: string
): Promise<string | null> => {
  try {
    const current = await datasource.getCurrentState(repoId);
    if (current.commit) {
      return current.commit;
    }
    if (current.branch) {
      const branch = await datasource.getBranch(repoId, current.branch);
      return branch?.lastCommit ?? null;
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const diffIsEmpty = (stateDiff: StateDiff) => {
  return JSON.stringify(stateDiff) == EMPTY_COMMIT_DIFF_STRING;
};

export const canCommit = async (
  datasource: DataSource,
  repoId: string,
  user: User,
  message: string
): Promise<boolean> => {
  if (!user || !user.id) {
    return false;
  }
  if ((message ?? "").length == 0) {
    return false;
  }
  const currentSha = await getCurrentCommitSha(datasource, repoId);
  const commit = await datasource.readCommit(repoId, currentSha);
  if (commit) {
    // ensure safe
  }
  const currentState = await datasource.getCurrentState(repoId);
  if (!currentState) {
    return false;
  }
  if (diffIsEmpty(currentState.diff)) {
    return false;
  }
  return true;
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

export const getHistory = async (
  datasource: DataSource,
  repoId: string,
  sha: string | null
): Promise<Array<CommitHistory> | null> => {
  if (sha == null) {
    return [];
  }
  const commit = await datasource.readCommit(repoId, sha);
  if (commit == null) {
    return null;
  }
  const history = await getHistory(datasource, repoId, commit.parent);
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
  for (const commit of history) {
    if (commit.idx == baseIdx) {
      return commit;
    }
  }
  return null;
};

export const getDivergenceOriginSha = async (
  datasource: DataSource,
  repoId: string,
  sha1: string,
  sha2: string
) => {
  const history1 = await getHistory(datasource, repoId, sha1);
  if (!history1) {
    throw "missing history";
  }
  const history2 = await getHistory(datasource, repoId, sha2);

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

export const getCommitState = async (
  datasource: DataSource,
  repoId: string,
  sha: string|null,
  historyLength?: number,
  checkedHot?: boolean,
  hotCheckpoint?: [string, CommitState],
): Promise<CommitState | null> => {
  if (!sha) {
    return EMPTY_COMMIT_STATE;
  }
  if (checkedHot && hotCheckpoint) {
    if (hotCheckpoint[0] == sha) {
      return hotCheckpoint[1];
    }
  }

  if (!checkedHot) {
    checkedHot = true;
    hotCheckpoint = await datasource.readHotCheckpoint(repoId);
    if (hotCheckpoint && hotCheckpoint?.[0] == sha) {
      return hotCheckpoint[1];
    }
  }

  const commitData = await datasource.readCommit(repoId, sha);
  if (!historyLength) {
    historyLength = commitData.idx + 1;
  }
  if (commitData.idx % CHECKPOINT_MODULO == 0) {
    const checkpointState = await datasource.readCheckpoint(repoId, sha);
    if (checkpointState) {
      return checkpointState;
    }
  }
  const state = await getCommitState(datasource, repoId, commitData.parent, historyLength, checkedHot, hotCheckpoint);
  const out = await applyStateDiffToCommitState(state, commitData.diff);

  if (commitData.idx % CHECKPOINT_MODULO == 0 && commitData.idx < (historyLength - CHECKPOINT_MODULO)) {
    await datasource.saveCheckpoint(repoId, sha, out);
  }
  return out;
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
  datasource: DataSource,
  repoId: string
): Promise<Branch | null> => {
  const current = await datasource.getCurrentState(repoId);
  if (current.branch) {
    const branch = await datasource.getBranch(repoId, current.branch);
    return branch;
  }
  return null;
};

export const getUnstagedCommitState = async (
  datasource: DataSource,
  repoId: string
): Promise<CommitState> => {
  const current = await datasource.getCurrentState(repoId);
  const hotCheckpoint = await datasource.readHotCheckpoint(repoId);
  if (hotCheckpoint && current.commit) {
    if (hotCheckpoint[0] == current.commit) {
      return hotCheckpoint[1];
    }
  }
  const commitState = await getCommitState(datasource, repoId, current.commit);
  if (current.commit) {
    await datasource.saveHotCheckpoint(repoId, current.commit, commitState);
  }
  return commitState;
};

export const getRepoState = async (
  datasource: DataSource,
  repoId: string
): Promise<CommitState> => {
  const current = await datasource.getCurrentState(repoId);
  const state = await getUnstagedCommitState(datasource, repoId);
  return applyStateDiffToCommitState(state, current.diff);
};

export const getProposedStateFromDiffListOnCurrent = async (
  datasource: DataSource,
  repoId: string,
  diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
  }>
): Promise<State | null> => {
  const current = await datasource.getCurrentState(repoId);
  const commitState = await getCommitState(datasource, repoId, current.commit);
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
  datasource: DataSource,
  repoId: string,
  diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
  }>
): Promise<State | null> => {
  try {
    const proposedChanges = await getProposedStateFromDiffListOnCurrent(
      datasource,
      repoId,
      diffList
    );
    if (!proposedChanges) {
      return null;
    }
    await datasource.saveCurrentState(repoId, proposedChanges);
    return proposedChanges;
  } catch (e) {
    return null;
  }
};

/**
 * use when committing against branch or sha
 */
export const updateCurrentCommitSHA = async (
  datasource: DataSource,
  repoId: string,
  sha: string,
  isResolvingMerge: boolean
): Promise<State | null> => {
  try {
    const current = await datasource.getCurrentState(repoId);
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
    return await datasource.saveCurrentState(repoId, updated);
  } catch (e) {
    return null;
  }
};

/**
 * use when HEAD is detached
 */
export const updateCurrentWithSHA = async (
  datasource: DataSource,
  repoId: string,
  sha: string,
  isResolvingMerge: boolean
): Promise<State | null> => {
  try {
    const current = await datasource.getCurrentState(repoId);
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
    return await datasource.saveCurrentState(repoId, updated);
  } catch (e) {
    return null;
  }
};

export const updateCurrentWithNewBranch = async (
  datasource: DataSource,
  repoId: string,
  branchName: string
): Promise<State | null> => {
  try {
    const current = await datasource.getCurrentState(repoId);
    if (current.isMerge) {
      return null;
    }
    const updated = {
      ...current,
      //commit: null,
      branch: branchName,
    };
    return await datasource.saveCurrentState(repoId, updated);
  } catch (e) {
    return null;
  }
};

export const updateCurrentBranch = async (
  datasource: DataSource,
  repoId: string,
  branchName: string
): Promise<State | null> => {
  try {
    const current = await datasource.getCurrentState(repoId);
    if (current.isMerge) {
      return null;
    }
    const updated = {
      ...current,
      commit: null,
      branch: branchName,
      diff: EMPTY_COMMIT_DIFF,
    };
    return await datasource.saveCurrentState(repoId, updated);
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
  datasource: DataSource,
  state: CommitState
): Promise<{ [key: string]: object }> => {
  let out = {};
  const manifests = await getPluginManifests(
    datasource,
    state.plugins
  );
  for (const pluginManifest of manifests) {
    const kv = state?.store?.[pluginManifest.name] ?? [];
    const schemaMap = await getSchemaMapForManifest(
      datasource,
      pluginManifest
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
  datasource: DataSource,
  state: CommitState,
  stateStore: { [key: string]: object }
): Promise<RawStore> => {
  let out = {};
  const manifests = await getPluginManifests(
    datasource,
    state.plugins
  );
  for (const pluginManifest of manifests) {
    const schemaMap = await getSchemaMapForManifest(
      datasource,
      pluginManifest,
    );
    const kv = await getKVStateForPlugin(
      datasource,
      schemaMap,
      pluginManifest.name,
      stateStore
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
      const diff = getTextDiff(
        (commit1?.[prop] ?? []).join(""),
        (commit2?.[prop] ?? [])?.join("")
      );
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
  return diffList.reduce(
    (acc: { diff: StateDiff }, { namespace, diff, pluginName }) => {
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
    },
    { diff: EMPTY_COMMIT_DIFF }
  ).diff;
};

export const getMergeCommitStates = async (
  datasource: DataSource,
  repoId: string,
  sha1: string,
  sha2: string
) => {
  try {
    const originSha = await getDivergenceOriginSha(
      datasource,
      repoId,
      sha1,
      sha2
    );
    const commit1 = await getCommitState(datasource, repoId, sha1);
    const commit2 = await getCommitState(datasource, repoId, sha2);
    const originCommit = !!originSha
      ? await getCommitState(datasource, repoId, originSha)
      : EMPTY_COMMIT_STATE;
    return {
      commit1,
      commit2,
      originCommit,
    };
  } catch (e) {
    return null;
  }
};

export const canAutoMergeCommitStates = async (
  datasource: DataSource,
  commit1: CommitState,
  commit2: CommitState,
  originCommit: CommitState
): Promise<boolean> => {
  try {
    const yourMerge = await getMergedCommitState(
      datasource,
      commit1,
      commit2,
      originCommit,
      "yours"
    );
    const theirMerge = await getMergedCommitState(
      datasource,
      commit1,
      commit2,
      originCommit,
      "theirs"
    );
    return JSON.stringify(yourMerge) == JSON.stringify(theirMerge);
  } catch (e) {
    return null;
  }
};

export const getMergedCommitState = async (
  datasource: DataSource,
  commit1: CommitState,
  commit2: CommitState,
  originCommit: CommitState,
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

    let stateStore = await buildStateStore(datasource, mergeState);

    const manifests = await getPluginManifests(
      datasource,
      mergeState.plugins
    );
    const rootManifests = manifests.filter(
      (m) => Object.keys(m.imports).length === 0
    );

    for (const manifest of rootManifests) {
      const schemaMap = await getSchemaMapForManifest(
        datasource,
        manifest,
      );
      stateStore = await cascadePluginState(
        datasource,
        schemaMap,
        stateStore,
        manifest.name
      );
    }

    mergeState.store = await convertStateStoreToKV(
      datasource,
      mergeState,
      stateStore
    );
    return mergeState;
  } catch (e) {
    return null;
  }
};

export const canAutoMergeOnTopCurrentState = async (
  datasource: DataSource,
  repoId: string,
  mergeSha: string
) => {
  try {
    const current = await datasource.getCurrentState(repoId);
    const repoState = await getRepoState(datasource, repoId);
    const mergeState = await getCommitState(datasource, repoId, mergeSha);
    const { originCommit } = await getMergeCommitStates(
      datasource,
      repoId,
      current.commit,
      mergeSha
    );
    return await canAutoMergeCommitStates(
      datasource,
      repoState,
      mergeState,
      originCommit
    );
  } catch (e) {
    return null;
  }
};

export const renderCommitState = async (
  datasource: DataSource,
  state: CommitState
): Promise<RenderedCommitState> => {
  const store = await buildStateStore(datasource, state);
  return {
    ...state,
    store,
  };
};
