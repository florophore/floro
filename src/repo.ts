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
  collectFileRefs,
  getKVStateForPlugin,
  getPluginInvalidStateIndices,
  getPluginManifests,
  getSchemaMapForManifest,
  getStateFromKVForPlugin,
  Manifest,
  manifestListToSchemaMap,
  nullifyMissingFileRefs,
  PluginElement,
  pluginListToMap,
  reIndexSchemaArrays,
} from "./plugins";
import {
  applyDiff,
  CommitData,
  Diff,
  getArrayStringDiff,
  getDiff,
  getDiffHash,
  getKVHash,
  getMergeSequence,
  hashString,
  StringDiff,
} from "./versioncontrol";
import { SourceCommitNode, SourceGraph, getTargetBranchId } from "./sourcegraph";
import { getCanPopStashedChanges, getMergeConflictDiff, getStashSize } from "./repoapi";

export interface Comparison {
  against: "wip" | "branch" | "sha" | "merge";
  comparisonDirection: "forward" | "backward";
  branch: string | null;
  commit: string | null;
};

export interface RepoState {
  branch: string | null;
  commit: string | null;
  isInMergeConflict: boolean;
  merge: null | {
    fromSha: string;
    intoSha: string;
    originSha: string;
    direction: "yours" | "theirs";
  };
  commandMode: "view" | "edit" | "compare";
  comparison: null | Comparison;
}

export interface RepoSetting {
  mainBranch: string;
}

export interface RawStore {
  [name: string]: Array<{ key: string; value: string }>;
}

export interface ApplicationKVState {
  description: Array<string>;
  licenses: Array<{ key: string; value: string }>;
  plugins: Array<{ key: string; value: string }>;
  store: RawStore;
  binaries: Array<string>;
}

export interface RenderedApplicationState {
  description: Array<string>;
  licenses: Array<{ key: string; value: string }>;
  plugins: Array<{ key: string; value: string }>;
  store: { [key: string]: object };
  binaries: Array<string>;
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
  binaries: StringDiff;
  store: StoreStateDiff;
  licenses: Diff;
  description: StringDiff;
}

export interface Branch {
  id: string;
  name: string;
  lastCommit: null | string;
  baseBranchId: null | string;
  createdBy: string;
  createdAt: string;
}

export interface BranchMeta {
  branchId: string;
  lastLocalCommit: string | null;
  lastRemoteCommit: string | null;
}

export interface BranchesMetaState {
  userBranches: Array<BranchMeta>;
  allBranches: Array<BranchMeta>;
}

export interface CommitHistory {
  sha: null | string;
  parent: null | string;
  historicalParent: null | string;
  mergeBase: null | string;
  idx: number;
  message: string;
}

export interface CheckpointMap {
  [sha: string]: ApplicationKVState;
}

export interface ApiDiff {
  description: {
    added: Array<number>;
    removed: Array<number>;
  };
  licenses: {
    added: Array<number>;
    removed: Array<number>;
  };
  plugins: {
    added: Array<number>;
    removed: Array<number>;
  };
  store: {
    [key: string]: {
      added: Array<string>;
      removed: Array<string>;
    }
  };
}

export interface ApiStoreInvalidity {
  [key: string]: Array<string>;
}

export interface ApiResponse {
  repoState: RepoState;
  applicationState: RenderedApplicationState;
  schemaMap: {[key: string]: Manifest};
  beforeState?: RenderedApplicationState;
  beforeApiStoreInvalidity?: ApiStoreInvalidity,
  beforeManifests?: Array<Manifest>,
  beforeSchemaMap?: { [pluginName: string]: Manifest }
  apiDiff?: ApiDiff;
  apiStoreInvalidity?: ApiStoreInvalidity;
  isWIP?: boolean;
  branch?: Branch;
  baseBranch?: Branch;
  lastCommit?: CommitData;
  mergeCommit?: CommitData;
  canPopStashedChanges?: boolean;
  stashSize?: number;
}

export interface SourceGraphResponse {
  commits: Array<SourceCommitNode>;
  branches: Array<Branch>;
  branchesMetaState: BranchesMetaState;
  repoState?: RepoState;
}

export const EMPTY_COMMIT_STATE: ApplicationKVState = {
  description: [],
  licenses: [],
  plugins: [],
  store: {},
  binaries: [],
};

export const EMPTY_RENDERED_APPLICATION_STATE: RenderedApplicationState = {
  description: [],
  licenses: [],
  plugins: [],
  store: {},
  binaries: [],
};

export const EMPTY_COMMIT_DIFF: StateDiff = {
  description: { add: {}, remove: {} },
  licenses: { add: {}, remove: {} },
  plugins: { add: {}, remove: {} },
  store: {},
  binaries: { add: {}, remove: {} },
};

const CHECKPOINT_MODULO = 50;

export const BRANCH_NAME_REGEX = /^[-_ ()[\]'"|a-zA-Z0-9]{3,100}$/;

export const getRepos = async (): Promise<string[]> => {
  const repoDir = await fs.promises.readdir(vReposPath);
  return repoDir?.filter((repoName) => {
    return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(
      repoName
    );
  });
};

export const getBranchIdFromName = (name: string): string => {
  return name.toLowerCase().replaceAll(" ", "-").replaceAll(/[[\]'"]/g, "");
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
    const current = await datasource.readCurrentRepoState(repoId);
    if (current.branch) {
      const branch = await datasource.readBranch(repoId, current.branch);
      return branch?.lastCommit ?? null;
    }
    if (current.commit) {
      return current.commit;
    }
    return null;
  } catch (e) {
    return null;
  }
};

export const diffIsEmpty = (stateDiff: StateDiff) => {
  for (const prop in stateDiff) {
    if (prop == "store" && Object.keys(stateDiff?.store ?? {}).length != 0) {
      for (const pluginName in stateDiff.store) {
        if (
          Object.keys(stateDiff?.store?.[pluginName]?.add ?? {}).length != 0 ||
          Object.keys(stateDiff?.store?.[pluginName]?.remove ?? {}).length != 0
        ) {
          return false;
        }
      }
    }
    if (Object.keys(stateDiff?.[prop]?.add ?? {}).length != 0) {
      return false;
    }
    if (Object.keys(stateDiff?.[prop]?.remove ?? {}).length != 0) {
      return false;
    }
  }
  return true;
};

export const canCommit = async (
  datasource: DataSource,
  repoId: string,
  user: User,
  message: string,
  diff: StateDiff
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
  const currentState = await datasource.readCurrentRepoState(repoId);
  if (!currentState) {
    return false;
  }
  if (diffIsEmpty(diff)) {
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
      mergeBase: commit.mergeBase,
      parent: commit.parent,
      historicalParent: commit.historicalParent,
    },
    ...history,
  ];
};

export const getBaseDivergenceSha = (
  history: Array<CommitHistory>,
  origin: CommitData
): CommitHistory => {
  if (!origin) {
    return null;
  }
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
  fromSha: string,
  intoSha: string
) => {
  const fromHistory = await getHistory(datasource, repoId, fromSha);
  if (!fromHistory) {
    throw "missing history";
  }
  const intoHistory = await getHistory(datasource, repoId, intoSha);

  if (!fromHistory) {
    throw "missing history";
  }
  const longerHistory =
    fromHistory.length >= intoHistory.length ? fromHistory : intoHistory;
  const shorterHistory =
    fromHistory.length < intoHistory.length ? fromHistory : intoHistory;
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
  sha: string | null,
  historyLength?: number,
  checkedHot?: boolean,
  hotCheckpoint?: [string, ApplicationKVState]
): Promise<ApplicationKVState | null> => {
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
  const state = await getCommitState(
    datasource,
    repoId,
    commitData.parent,
    historyLength,
    checkedHot,
    hotCheckpoint
  );
  const out = applyStateDiffToCommitState(state, commitData.diff);
  if (
    commitData.idx % CHECKPOINT_MODULO == 0 &&
    commitData.idx < historyLength - CHECKPOINT_MODULO
  ) {
    await datasource.saveCheckpoint(repoId, sha, out);
  }
  return out;
};

export const applyStateDiffToCommitState = (
  applicationKVState: ApplicationKVState,
  stateDiff: StateDiff
): ApplicationKVState => {
  return Object.keys(stateDiff).reduce((acc, namespace): ApplicationKVState => {
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
        applicationKVState?.store ?? ({} as RawStore)
      );
      return {
        ...acc,
        store,
      };
    }
    return {
      ...acc,
      [namespace]: applyDiff(
        stateDiff[namespace],
        applicationKVState[namespace]
      ),
    };
  }, applicationKVState);
};

export const getCurrentBranch = async (
  datasource: DataSource,
  repoId: string
): Promise<Branch | null> => {
  const current = await datasource.readCurrentRepoState(repoId);
  if (current.branch) {
    const branch = await datasource.readBranch(repoId, current.branch);
    return branch;
  }
  return null;
};

export const getUnstagedCommitState = async (
  datasource: DataSource,
  repoId: string
): Promise<ApplicationKVState> => {
  const currentRepoState = await datasource.readCurrentRepoState(repoId);
  if (currentRepoState.isInMergeConflict) {
    const { fromCommitState, intoCommitState, originCommit } =
      await getMergeCommitStates(
        datasource,
        repoId,
        currentRepoState?.merge?.fromSha,
        currentRepoState?.merge?.intoSha
      );
    return await getMergedCommitState(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommit,
      currentRepoState?.merge?.direction
    );
  }
  const hotCheckpoint = await datasource.readHotCheckpoint(repoId);
  if (hotCheckpoint && currentRepoState.commit) {
    if (hotCheckpoint[0] == currentRepoState.commit) {
      return hotCheckpoint[1];
    }
  }
  const commitState = await getCommitState(
    datasource,
    repoId,
    currentRepoState.commit
  );
  if (currentRepoState.commit) {
    await datasource.saveHotCheckpoint(
      repoId,
      currentRepoState.commit,
      commitState
    );
  }
  return commitState;
};

export const getApplicationState = async (
  datasource: DataSource,
  repoId: string
): Promise<RenderedApplicationState> => {
  return await datasource.readRenderedState(repoId);
};

export const convertRenderedCommitStateToKv = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<ApplicationKVState> => {
  const out: ApplicationKVState = {
    description: [],
    licenses: [],
    plugins: [],
    store: undefined,
    binaries: [],
  };
  for (const prop in renderedAppState) {
    if (prop == "store") {
      out[prop] = await convertRenderedStateStoreToKV(
        datasource,
        renderedAppState
      );
      continue;
    }
    out[prop] = renderedAppState[prop];
  }
  return out;
};

/**
 * MAINTAINS BRANCH
 */
export const updateCurrentCommitSHA = async (
  datasource: DataSource,
  repoId: string,
  sha: string,
  isResolvingMerge: boolean
): Promise<RepoState | null> => {
  try {
    const current = await datasource.readCurrentRepoState(repoId);
    if (current.isInMergeConflict && !isResolvingMerge) {
      return null;
    }
    const updated: RepoState = {
      ...current,
      commit: sha,
      isInMergeConflict: false,
      merge: null,
    };
    const nextState = await datasource.saveCurrentRepoState(repoId, updated);
    const unrenderedState = await getCommitState(datasource, repoId, sha);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unrenderedState
    );
    await datasource.saveRenderedState(repoId, renderedState);
    return nextState;
  } catch (e) {
    return null;
  }
};

/**
 * DETACHES HEAD FROM BRANCH
 */
export const updateCurrentWithSHA = async (
  datasource: DataSource,
  repoId: string,
  sha: string,
  isResolvingMerge: boolean
): Promise<RepoState | null> => {
  try {
    const current = await datasource.readCurrentRepoState(repoId);
    if (current.isInMergeConflict && !isResolvingMerge) {
      return null;
    }
    const updated: RepoState = {
      ...current,
      commit: sha,
      branch: null,
      isInMergeConflict: false,
      merge: null,
    };
    const nextState = await datasource.saveCurrentRepoState(repoId, updated);
    const unrenderedState = await getCommitState(datasource, repoId, sha);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unrenderedState
    );
    await datasource.saveRenderedState(repoId, renderedState);
    return nextState;
  } catch (e) {
    return null;
  }
};

export const updateCurrentWithNewBranch = async (
  datasource: DataSource,
  repoId: string,
  branch: Branch
): Promise<RepoState | null> => {
  try {
    const current = await datasource.readCurrentRepoState(repoId);
    if (current.isInMergeConflict) {
      return null;
    }
    const updated = {
      ...current,
      commit: branch?.lastCommit,
      branch: branch.id,
    };
    await datasource.saveCurrentRepoState(repoId, updated);
    const unrenderedState = await getCommitState(
      datasource,
      repoId,
      branch?.lastCommit
    );
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unrenderedState
    );
    await datasource.saveRenderedState(repoId, renderedState);
    return updated;
  } catch (e) {
    return null;
  }
};

export const updateCurrentBranch = async (
  datasource: DataSource,
  repoId: string,
  branchId: string
): Promise<RepoState | null> => {
  try {
    const current = await datasource.readCurrentRepoState(repoId);
    if (current.isInMergeConflict) {
      return null;
    }
    const branch = await datasource.readBranch(repoId, branchId);
    const updated = {
      ...current,
      commit: branch.lastCommit,
      branch: branchId,
    };
    await datasource.saveBranch(repoId, branchId, branch);
    return await datasource.saveCurrentRepoState(repoId, updated);
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

const getDefaultComparison = async (
  datasource: DataSource,
  repoId: string,
  repoState: RepoState
): Promise<Comparison> => {
  const renderedState = await getApplicationState(datasource, repoId);
  const applicationKVState = await convertRenderedCommitStateToKv(
    datasource,
    renderedState
  );
  const unstagedState = await getUnstagedCommitState(datasource, repoId);
  const isWIP =
    unstagedState &&
    (await getIsWip(
      datasource,
      repoId,
      repoState,
      unstagedState,
      applicationKVState
    ));
  if (repoState.isInMergeConflict) {
    return {
      against: "merge",
      comparisonDirection: "forward",
      branch: null,
      commit: null,
    };
  }
  if (isWIP) {
    return {
      against: "wip",
      comparisonDirection: "forward",
      branch: null,
      commit: null,
    };
  }
  if (repoState?.branch) {
    const currentBranch = await datasource?.readBranch(
      repoId,
      repoState?.branch
    );
    if (currentBranch && currentBranch?.baseBranchId) {
      const baseBranch = currentBranch?.baseBranchId
        ? await datasource?.readBranch(repoId, currentBranch?.baseBranchId)
        : null;
      const comparisonDirection = await getComparisonDirection(datasource, repoId, "branch", baseBranch?.id);
      if (baseBranch?.id) {
        return {
          against: "branch",
          comparisonDirection,
          branch: baseBranch?.id,
          commit: null,
        };
      }
    }
  }
  if (repoState?.commit) {
    const currentCommit = await datasource?.readCommit(
      repoId,
      repoState?.commit
    );
    if (currentCommit && currentCommit?.parent) {
      const previousCommit = currentCommit?.parent
        ? await datasource?.readCommit(repoId, currentCommit?.parent)
        : null;
      if (previousCommit?.sha) {
        return {
          against: "sha",
          comparisonDirection: "forward",
          branch: null,
          commit: previousCommit.sha,
        };
      }
    }
  }

  return {
    against: "wip",
    comparisonDirection: "forward",
    branch: null,
    commit: null,
  };
};

export const changeCommandMode = async (datasource: DataSource, repoId: string, commandMode: "view"|"edit"|"compare") => {
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const nextRepoState: RepoState = {
      ...currentRepoState,
      commandMode,
      comparison:
        commandMode == "compare"
          ? await getDefaultComparison(datasource, repoId, currentRepoState)
          : null,
    };
    await datasource.saveCurrentRepoState(repoId, nextRepoState);
    return nextRepoState;
  } catch (e) {
    return null;
  }
}

export const getComparisonDirection = async (
  datasource: DataSource,
  repoId: string,
  against: "branch" | "sha",
  branchId?: string|null,
  sha?: string|null,
): Promise<"forward"|"backward"> => {
  if (against == "branch" && branchId) {
    const branch = await datasource.readBranch(repoId, branchId);
    if (branch?.lastCommit) {
      return await getComparisonDirection(
        datasource,
        repoId,
        "sha",
        null,
        branch?.lastCommit
      );
    }
  }
  if (sha) {
    const commit = await datasource?.readCommit(repoId, sha);
    if (!commit?.sha) {
      return "forward";
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState?.commit)
    if (commit?.sha == currentRepoState.commit) {
      return "forward";
    }

    const commits = await datasource.readCommits(repoId);
    const branchesMetaState = await datasource.readBranchesMetaState(repoId);
    const branches = await datasource.readBranches(repoId);
    const sourcegraph = new SourceGraph(commits, branchesMetaState, currentRepoState);
    const pointerMap = sourcegraph?.getPointers();
    const currentPointer = pointerMap[currentRepoState?.commit];
    const comparisonPointer = pointerMap[commit?.sha];
    const currentTopBranchId = getTargetBranchId(branches, currentPointer.branchIds);
    const comparisonTopBranchId = getTargetBranchId(branches, comparisonPointer.branchIds);
    if (currentTopBranchId != comparisonTopBranchId) {
      return "forward";
    }
    const topBranch = await datasource?.readBranch(repoId, currentTopBranchId);
    if (!topBranch?.lastCommit) {
      return "forward";
    }
    const currentOriginSha = await getDivergenceOriginSha(
      datasource,
      repoId,
      topBranch?.lastCommit,
      currentPointer.sha
    );
    if (!currentOriginSha) {
      return "forward";
    }

    const comparisonOriginSha = await getDivergenceOriginSha(
      datasource,
      repoId,
      topBranch?.lastCommit,
      comparisonPointer.sha
    );
    if (!comparisonOriginSha) {
      return "forward";
    }

    const currentOrigin = await datasource?.readCommit(repoId, currentOriginSha);
    if (!currentOrigin) {
      return "forward";
    }
    const comparisonOrigin = await datasource?.readCommit(repoId, comparisonOriginSha);
    if (!comparisonOrigin) {
      return "forward";
    }
    if (currentOrigin?.idx < comparisonOrigin?.idx) {
      return "backward";
    }
  }

  return "forward";
}

export const updateComparison = async (
  datasource: DataSource,
  repoId: string,
  against: "wip" | "branch" | "sha",
  branchId?: string|null,
  sha?: string|null,
) => {

  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState || currentRepoState?.commandMode != "compare") {
      return null;
    }
    if (against == "wip") {
      const nextRepoState: RepoState = {
        ...currentRepoState,
        comparison: {
          against,
          comparisonDirection: "forward",
          branch: null,
          commit: null,
        }
      };
      return await datasource.saveCurrentRepoState(repoId, nextRepoState);
    }
    if (against == "branch") {
      const comparisonDirection = await getComparisonDirection(datasource, repoId, against, branchId)
      const nextRepoState: RepoState = {
        ...currentRepoState,
        comparison: {
          against,
          comparisonDirection,
          branch: branchId ?? null,
          commit: null,
        }
      };
      return await datasource.saveCurrentRepoState(repoId, nextRepoState);
    }
    if (against == "sha") {
      const comparisonDirection = await getComparisonDirection(datasource, repoId, against, null, sha);
      const nextRepoState: RepoState = {
        ...currentRepoState,
        comparison: {
          against,
          comparisonDirection,
          branch: null,
          commit: sha ?? null,
        }
      };
      return await datasource.saveCurrentRepoState(repoId, nextRepoState);
    }
    return null;
  } catch(e) {
    return null;
  }
}

export const buildStateStore = async (
  datasource: DataSource,
  appKvState: ApplicationKVState
): Promise<{ [key: string]: object }> => {
  let out = {};
  const manifests = await getPluginManifests(datasource, appKvState.plugins);
  for (const pluginManifest of manifests) {
    const kv = appKvState?.store?.[pluginManifest.name] ?? [];
    const schemaMap = await getSchemaMapForManifest(datasource, pluginManifest);
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
  appKVState: ApplicationKVState,
  stateStore: { [key: string]: object }
): Promise<RawStore> => {
  let out = {};
  const manifests = await getPluginManifests(datasource, appKVState.plugins);
  for (const pluginManifest of manifests) {
    const schemaMap = await getSchemaMapForManifest(datasource, pluginManifest);
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

export const convertRenderedStateStoreToKV = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<RawStore> => {
  let out = {};
  const manifests = await getPluginManifests(
    datasource,
    renderedAppState.plugins
  );
  for (const pluginManifest of manifests) {
    const schemaMap = await getSchemaMapForManifest(datasource, pluginManifest);
    const kv = await getKVStateForPlugin(
      datasource,
      schemaMap,
      pluginManifest.name,
      renderedAppState.store
    );
    out[pluginManifest.name] = kv;
  }
  return out;
};

export const convertCommitStateToRenderedState = async (
  datasource: DataSource,
  appKVState: ApplicationKVState
): Promise<RenderedApplicationState> => {
  const store = await buildStateStore(datasource, appKVState);
  return {
    ...appKVState,
    store,
  };
};

export const tokenizeCommitState = (
  appKVState: ApplicationKVState
): [TokenizedState, { [key: string]: unknown }] => {
  const tokenStore: { [key: string]: unknown } = {};
  const description = appKVState.description.reduce((acc, value) => {
    const hash = hashString(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const licenses = appKVState.licenses.reduce((acc, value) => {
    const hash = getKVHash(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const plugins = appKVState.plugins.reduce((acc, value) => {
    const hash = getKVHash(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const binaries = appKVState.binaries.reduce((acc, value) => {
    const hash = hashString(value);
    tokenStore[hash] = value;
    return [...acc, hash];
  }, []);

  const store = Object.keys(appKVState.store).reduce((acc, key) => {
    const pluginStore = appKVState.store[key].reduce((storeAcc, value) => {
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
): ApplicationKVState => {
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
  }) as Array<string>;

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
  fromStore: { [key: string]: unknown },
  intoStore: { [key: string]: unknown }
) => {
  return {
    ...fromStore,
    ...intoStore,
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

export const uniqueStrings = (
  strings: Array<string>
): Array<string> => {
  let out: Array<string> = [];
  let seen = new Set();
  for (let str of strings) {
    if (!seen.has(str)) {
      seen.add(str);
      out.push(str);
    }
  }
  return out.sort();
};

export const getStateDiffFromCommitStates = (
  beforeKVState: ApplicationKVState,
  afterKVState: ApplicationKVState
): StateDiff => {
  const stateDiff: StateDiff = {
    plugins: {
      add: {},
      remove: {},
    },
    binaries: {
      add: {},
      remove: {},
    },
    store: {},
    licenses: {
      add: {},
      remove: {},
    },
    description: {
      add: {},
      remove: {},
    },
  };
  const pluginsToTraverse = Array.from([
    ...Object.keys(beforeKVState.store),
    ...Object.keys(afterKVState.store),
  ]);
  for (const prop in afterKVState) {
    if (prop == "store") {
      for (const pluginName of pluginsToTraverse) {
        const diff = getDiff(
          beforeKVState?.store?.[pluginName] ?? [],
          afterKVState?.store?.[pluginName] ?? []
        );
        stateDiff.store[pluginName] = diff;
      }
      continue;
    }
    if (prop == "description" || prop == "binaries") {
      const diff = getArrayStringDiff(
        (beforeKVState?.[prop] ?? []) as Array<string>,
        (afterKVState?.[prop] ?? []) as Array<string>
      );
      stateDiff[prop] = diff;
      continue;
    }

    const diff = getDiff(
      beforeKVState?.[prop] ?? [],
      afterKVState?.[prop] ?? []
    );
    stateDiff[prop] = diff;
  }
  return stateDiff;
};

export const getMergeCommitStates = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string,
  intoSha: string
) => {
  try {
    const originSha = await getDivergenceOriginSha(
      datasource,
      repoId,
      fromSha,
      intoSha
    );
    const fromCommitState = await getCommitState(datasource, repoId, fromSha);
    const intoCommitState = await getCommitState(datasource, repoId, intoSha);
    const originCommit = !!originSha
      ? await getCommitState(datasource, repoId, originSha)
      : EMPTY_COMMIT_STATE;
    return {
      fromCommitState,
      intoCommitState,
      originCommit,
    };
  } catch (e) {
    return null;
  }
};

export const canAutoMergeCommitStates = async (
  datasource: DataSource,
  fromCommitState: ApplicationKVState,
  intoCommitState: ApplicationKVState,
  originCommitState: ApplicationKVState
): Promise<boolean> => {
  try {
    const yourMerge = await getMergedCommitState(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommitState,
      "yours"
    );
    const theirMerge = await getMergedCommitState(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommitState,
      "theirs"
    );
    return JSON.stringify(yourMerge) == JSON.stringify(theirMerge);
  } catch (e) {
    return null;
  }
};

export const getMergedCommitState = async (
  datasource: DataSource,
  fromState: ApplicationKVState,
  intoState: ApplicationKVState,
  originCommit: ApplicationKVState,
  direction: "yours" | "theirs" = "yours"
): Promise<ApplicationKVState> => {
  try {
    const [tokenizedCommitFrom, tokenizedStoreFrom] =
      tokenizeCommitState(fromState);
    const [tokenizedCommitInto, tokenizedStoreInto] =
      tokenizeCommitState(intoState);
    const [tokenizedOrigin] = tokenizeCommitState(originCommit);

    const tokenizedDescription = getMergeSequence(
      tokenizedOrigin.description,
      tokenizedCommitFrom.description,
      tokenizedCommitInto.description,
      direction
    );

    const tokenizedLicenses = getMergeSequence(
      tokenizedOrigin.licenses,
      tokenizedCommitFrom.licenses,
      tokenizedCommitInto.licenses,
      direction
    );

    const tokenizedPlugins = getMergeSequence(
      tokenizedOrigin.plugins,
      tokenizedCommitFrom.plugins,
      tokenizedCommitInto.plugins,
      direction
    );

    const tokenizedBinaries = getMergeSequence(
      tokenizedOrigin.binaries,
      tokenizedCommitFrom.binaries,
      tokenizedCommitInto.binaries,
      direction
    );

    const pluginsToTraverse = Array.from([
      ...Object.keys(tokenizedCommitFrom.store),
      ...Object.keys(tokenizedCommitInto.store),
    ]);
    const tokenizedStore = {};
    for (const pluginName of pluginsToTraverse) {
      const pluginKVsFrom = tokenizedCommitFrom?.store?.[pluginName] ?? [];
      const pluginKVsInto = tokenizedCommitInto?.store?.[pluginName] ?? [];
      const orignKVs = tokenizedOrigin?.store?.[pluginName] ?? [];
      const pluginStoreSequence = getMergeSequence(
        orignKVs,
        pluginKVsFrom,
        pluginKVsInto,
        direction
      );
      tokenizedStore[pluginName] = pluginStoreSequence;
    }
    const tokenStore = mergeTokenStores(tokenizedStoreFrom, tokenizedStoreInto);
    const tokenizedState: TokenizedState = {
      description: tokenizedDescription,
      licenses: tokenizedLicenses,
      plugins: tokenizedPlugins,
      store: tokenizedStore,
      binaries: tokenizedBinaries,
    };

    const mergeState = detokenizeStore(tokenizedState, tokenStore);
    mergeState.plugins = uniqueKV(mergeState.plugins);
    mergeState.licenses = uniqueKV(mergeState.licenses);

    let stateStore = await buildStateStore(datasource, mergeState);

    const manifests = await getPluginManifests(datasource, mergeState.plugins);

    const schemaMap = manifestListToSchemaMap(manifests)
    stateStore = await cascadePluginState(datasource, schemaMap, stateStore);
    stateStore = await nullifyMissingFileRefs(datasource, schemaMap, stateStore);
    const binaries = await collectFileRefs(datasource, schemaMap, stateStore);

    mergeState.store = await convertStateStoreToKV(
      datasource,
      mergeState,
      stateStore
    );
    mergeState.binaries = uniqueStrings(binaries);

    return mergeState;
  } catch (e) {
    return null;
  }
};

export const getCanAutoMergeOnUnStagedState = async (
  datasource: DataSource,
  repoId: string,
  mergeSha: string
) => {
  try {
  const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const repoState = await datasource.readCurrentRepoState(repoId);
    const mergeState = await getCommitState(datasource, repoId, mergeSha);
    const { originCommit } = await getMergeCommitStates(
      datasource,
      repoId,
      repoState.commit,
      mergeSha
    );
    return await canAutoMergeCommitStates(
      datasource,
      unstagedState,
      mergeState,
      originCommit
    );
  } catch (e) {
    return null;
  }
};

export const getCanAutoMergeOnTopCurrentState = async (
  datasource: DataSource,
  repoId: string,
  mergeSha: string
) => {
  try {
    const currentRenderedState = await datasource.readRenderedState(repoId);
    const currentAppKVstate = await convertRenderedCommitStateToKv(
      datasource,
      currentRenderedState
    );
    const repoState = await datasource.readCurrentRepoState(repoId);
    const mergeState = await getCommitState(datasource, repoId, mergeSha);
    const { originCommit } = await getMergeCommitStates(
      datasource,
      repoId,
      repoState.commit,
      mergeSha
    );
    return await canAutoMergeCommitStates(
      datasource,
      currentAppKVstate,
      mergeState,
      originCommit
    );
  } catch (e) {
    return null;
  }
};

export const getApiDiff = (
  beforeState: ApplicationKVState,
  afterState: ApplicationKVState,
  stateDiff: StateDiff
): ApiDiff => {
  const description = {
    added: Object.keys(stateDiff.description.add).map((v) => parseInt(v)),
    removed: Object.keys(stateDiff.description.remove).map((v) => parseInt(v)),
  };

  const licenses = {
    added: Object.keys(stateDiff.licenses.add).map((v) => parseInt(v)),
    removed: Object.keys(stateDiff.licenses.remove).map((v) => parseInt(v)),
  };

  const plugins = {
    added: Object.keys(stateDiff.plugins.add).map((v) => parseInt(v)),
    removed: Object.keys(stateDiff.plugins.remove).map((v) => parseInt(v)),
  };
  let store = {};

  for (const pluginName in (stateDiff?.store ?? {})) {
    if (!beforeState?.store?.[pluginName]) {
      // show only added state
      const afterIndexedKvs = reIndexSchemaArrays(
        afterState?.store?.[pluginName] ?? []
      );
      const added = Object.keys(stateDiff?.store?.[pluginName]?.add ?? {})
        .map((v) => parseInt(v))
        .map((i) => afterIndexedKvs[i]);
      store[pluginName] = {
        added,
        removed: [],
      };
      continue;
    }

    if (!afterState?.store?.[pluginName]) {
      // show only removed state
      const beforeIndexedKvs = reIndexSchemaArrays(
        beforeState?.store?.[pluginName] ?? []
      );
      const removed = Object.keys(stateDiff?.store?.[pluginName]?.remove ?? {})
        .map((v) => parseInt(v))
        .map((i) => beforeIndexedKvs[i]);
      store[pluginName] = {
        added: [],
        removed,
      };

      continue;
    }

    const afterIndexedKvs = reIndexSchemaArrays(
      afterState?.store?.[pluginName] ?? []
    );
    const added = Object.keys(stateDiff?.store?.[pluginName]?.add ?? {})
      .map((v) => parseInt(v))
      .map((i) => afterIndexedKvs[i]);
    const beforeIndexedKvs = reIndexSchemaArrays(
      beforeState?.store?.[pluginName] ?? []
    );
    const removed = Object.keys(stateDiff?.store?.[pluginName]?.remove ?? {})
      .map((v) => parseInt(v))
      .map((i) => beforeIndexedKvs[i]);

    store[pluginName] = {
      added,
      removed,
    };
  }
  return {
    description,
    licenses,
    plugins,
    store,
  };
};

export const getInvalidStates = async (
  datasource: DataSource,
  appKvState: ApplicationKVState
): Promise<ApiStoreInvalidity> => {
  const manifests = await getPluginManifests(datasource, appKvState.plugins);
  const schemaMap = manifestListToSchemaMap(manifests)
  const store = {};
  for (let pluginName in appKvState.store) {
    const invalidStateIndices = await getPluginInvalidStateIndices(
      datasource,
      schemaMap,
      appKvState.store[pluginName],
      pluginName
    );
    const indexedKvs = reIndexSchemaArrays(
      appKvState?.store?.[pluginName] ?? []
    );
    store[pluginName] = invalidStateIndices.map(i => indexedKvs[i]);
  }
  return store;
}

export const getIsWip = async (
  datasource: DataSource,
  repoId: string,
  repoState: RepoState,
  unstagedState: ApplicationKVState,
  applicationKVState: ApplicationKVState,

) => {
  if (repoState?.isInMergeConflict) {
      const diff = await getMergeConflictDiff(datasource, repoId);
      //const diff = getStateDiffFromCommitStates(unstagedMergeState, applicationKVState);
      return !diffIsEmpty(diff);
  }
    const diff = getStateDiffFromCommitStates(unstagedState, applicationKVState);
    return !diffIsEmpty(diff);
}

export const getBranchFromRepoState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState
) => {
  if (!repoState?.branch) {
    return null;
  }
  return (await datasource.readBranch(repoId, repoState?.branch)) ?? null;
}

export const getBaseBranchFromBranch = async (
  repoId: string,
  datasource: DataSource,
  branch: Branch
) => {
  if (!branch) {
    return null;
  }
  if (!branch?.baseBranchId) {
    return null;
  }
  return (await datasource.readBranch(repoId, branch?.baseBranchId)) ?? null;
}

export const getLastCommitFromRepoState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState
) => {
  if (!repoState?.commit) {
    return null;
  }
  return (await datasource.readCommit(repoId, repoState?.commit)) ?? null;
}

export const getApiDiffFromComparisonState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState,
  applicationKVState: ApplicationKVState
): Promise<{
  apiDiff: ApiDiff,
  beforeState: RenderedApplicationState,
  beforeApiStoreInvalidity: ApiStoreInvalidity,
  beforeManifests: Array<Manifest>,
  beforeSchemaMap: { [pluginName: string]: Manifest }
  }> => {

  if (repoState.comparison?.against == "branch") {
    const comparatorBranch = repoState?.comparison?.branch
      ? await datasource.readBranch(repoId, repoState?.comparison?.branch)
      : null;
    const branchState = await getCommitState(
      datasource,
      repoId,
      comparatorBranch?.lastCommit
    );
    // this has to be invertible based on direction
    const diff =
      repoState.comparison.comparisonDirection == "forward"
        ? getStateDiffFromCommitStates(branchState, applicationKVState)
        : getStateDiffFromCommitStates(applicationKVState, branchState);
    const beforeState = await convertCommitStateToRenderedState(datasource, branchState);
    const beforeApiStoreInvalidity = await getInvalidStates(datasource, branchState);
    const beforeManifests = await getPluginManifests(datasource, branchState.plugins);
    const beforeSchemaMap = manifestListToSchemaMap(beforeManifests);
    return {
      beforeState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      apiDiff: getApiDiff(branchState, applicationKVState, diff)
    };
  }

  if (repoState.comparison?.against == "sha") {
    const commitState = await getCommitState(
      datasource,
      repoId,
      repoState.comparison?.commit
    );
    const diff =
      repoState.comparison.comparisonDirection == "forward"
        ? getStateDiffFromCommitStates(commitState, applicationKVState)
        : getStateDiffFromCommitStates(applicationKVState, commitState);
    const beforeState = await convertCommitStateToRenderedState(datasource, commitState);
    const beforeApiStoreInvalidity = await getInvalidStates(datasource, commitState);
    const beforeManifests = await getPluginManifests(datasource, commitState.plugins);
    const beforeSchemaMap = manifestListToSchemaMap(beforeManifests);
    return {
      beforeState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      apiDiff: getApiDiff(commitState, applicationKVState, diff)
    };
  }
  // "WIP"
  const unstagedState = await getUnstagedCommitState(datasource, repoId);
  const diff = getStateDiffFromCommitStates(unstagedState, applicationKVState);
  const beforeState = await convertCommitStateToRenderedState(datasource, unstagedState);
  const beforeApiStoreInvalidity = await getInvalidStates(datasource, unstagedState);
  const beforeManifests = await getPluginManifests(datasource, unstagedState.plugins);
  const beforeSchemaMap = manifestListToSchemaMap(beforeManifests);
  return {
    beforeState,
    beforeApiStoreInvalidity,
    beforeManifests,
    beforeSchemaMap,
    apiDiff: getApiDiff(unstagedState, applicationKVState, diff)
  };
}

export const renderApiReponse = async (
  repoId: string,
  datasource: DataSource,
  renderedApplicationState: RenderedApplicationState,
  applicationKVState: ApplicationKVState,
  repoState: RepoState
): Promise<ApiResponse> => {
  const apiStoreInvalidity = await getInvalidStates(datasource, applicationKVState);
  const manifests = await getPluginManifests(datasource, renderedApplicationState.plugins);
  const schemaMap = manifestListToSchemaMap(manifests);
  const branch = await getBranchFromRepoState(repoId, datasource, repoState);
  const baseBranch = await getBaseBranchFromBranch(repoId, datasource, branch);
  const lastCommit = await getLastCommitFromRepoState(repoId, datasource, repoState);
  const mergeCommit =
      repoState.isInMergeConflict
        ? await datasource.readCommit(repoId, repoState?.merge.fromSha)
        : null;

  if (repoState.commandMode == "edit") {
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const isWIP =
      unstagedState &&
      (await getIsWip(
        datasource,
        repoId,
        repoState,
        unstagedState,
        applicationKVState
      ));
    const [canPopStashedChanges, stashSize] = await Promise.all(
      [
        getCanPopStashedChanges(datasource, repoId),
        getStashSize(datasource, repoId)
      ]
    )
    return {
      apiStoreInvalidity,
      repoState,
      applicationState: renderedApplicationState,
      schemaMap,
      branch,
      baseBranch,
      lastCommit,
      isWIP,
      canPopStashedChanges,
      stashSize,
      mergeCommit
    }
  }

  if (repoState.commandMode == "view") {

    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const isWIP =
      unstagedState &&
      (await getIsWip(
        datasource,
        repoId,
        repoState,
        unstagedState,
        applicationKVState
      ));
    return {
      apiStoreInvalidity,
      repoState,
      applicationState: renderedApplicationState,
      schemaMap,
      branch,
      baseBranch,
      lastCommit,
      isWIP,
      mergeCommit
    }
  }
  if (repoState.commandMode == "compare") {

    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const isWIP =
      unstagedState &&
      (await getIsWip(
        datasource,
        repoId,
        repoState,
        unstagedState,
        applicationKVState
      ));
    const { apiDiff, beforeState, beforeApiStoreInvalidity, beforeManifests, beforeSchemaMap } = await getApiDiffFromComparisonState(
      repoId,
      datasource,
      repoState,
      applicationKVState
    );

    if (repoState.comparison.comparisonDirection == "backward") {
      return {
        apiStoreInvalidity: beforeApiStoreInvalidity,
        repoState,
        applicationState: beforeState,
        schemaMap: beforeSchemaMap,
        branch,
        baseBranch,
        lastCommit,
        isWIP,
        apiDiff,
        beforeState: renderedApplicationState,
        beforeApiStoreInvalidity: apiStoreInvalidity,
        beforeManifests: manifests,
        beforeSchemaMap: schemaMap,
        mergeCommit
      };
    }
    return {
      apiStoreInvalidity,
      repoState,
      applicationState: renderedApplicationState,
      schemaMap,
      branch,
      baseBranch,
      lastCommit,
      isWIP,
      apiDiff,
      beforeState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      mergeCommit
    };

  }
  return null;

}

export const renderSourceGraphInputs = async (
  repoId: string,
  datasource: DataSource
): Promise<SourceGraphResponse> => {
  try {
    const [commits, branches, branchesMetaState, repoState] = await Promise.all([
      datasource.readCommits(repoId),
      datasource.readBranches(repoId),
      datasource.readBranchesMetaState(repoId),
      datasource.readCurrentRepoState(repoId),
    ]);
    return {
      commits,
      branches,
      branchesMetaState,
      repoState
    };
  } catch (e) {
    return null;
  }
};