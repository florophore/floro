import axios from "axios";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import FormData from "form-data";
import { DataSource } from "./datasource";
import {
  existsAsync,
  getRemoteHostAsync,
  getUserSession,
  getUserSessionAsync,
  User,
  vBinariesPath,
  vReposPath,
} from "./filestructure";
import { broadcastAllDevices } from "./multiplexer";
import {
  cascadePluginState,
  collectFileRefs,
  defaultVoidedState,
  enforceBoundedSets,
  getInvalidRootStates,
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
} from "./sequenceoperations";
import { SourceCommitNode } from "./sourcegraph";
import { DiffElement } from "./sequenceoperations";
import LRCache from "./lrcache";
const lrcache = new LRCache();

export interface FetchInfo {
  canPushBranch: boolean;
  canPull: boolean;
  userHasPermissionToPush: boolean;
  userCanPush: boolean;
  branchPushDisabled: boolean;
  hasConflict: boolean;
  accountInGoodStanding: boolean;
  nothingToPush: boolean;
  nothingToPull: boolean;
  containsDevPlugins: boolean;
  baseBranchRequiresPush: boolean;
  remoteBranch?: Branch;
  pullCanMergeWip: boolean;
  remoteAhead: boolean;
  fetchFailed: boolean;
  commits: Array<CommitExchange>;
  branches: Array<Branch>;
  hasUnreleasedPlugins: boolean;
  hasInvalidPlugins: boolean;
  hasRemoteBranchCycle: boolean;
  hasLocalBranchCycle: boolean;
  hasOpenMergeRequestConflict: boolean;
}

export interface RepoInfo {
  id: string;
  name: string;
  organizationId: string|null;
  userId: string|null;
  ownerHandle: string;
  isPrivate: boolean;
  repoType: "user_repo"|"org_repo";
}

export interface BranchRuleSettings {
  branchId: string;
  branchName: string;
  directPushingDisabled: boolean;
  requiresApprovalToMerge: boolean;
  requireReapprovalOnPushToMerge: boolean;
  automaticallyDeletesMergedFeatureBranches: boolean;
  canCreateMergeRequests: boolean;
  canMergeWithApproval: boolean;
  canApproveMergeRequests: boolean;
  canRevert: boolean;
  canAutofix: boolean;
}

export interface RemoteSettings {
  defaultBranchId: string;
  canReadRepo: boolean;
  canPushBranches: boolean;
  canChangeSettings: boolean;
  canWriteAnnouncements: boolean;
  accountInGoodStanding: boolean;
  branchRules: Array<BranchRuleSettings>;
}

export interface CommitExchange {
  sha: string;
  originalSha: string;
  idx: number;
  parent: string;
  saved?: boolean;
}

export interface CloneFile {
  state: "in_progress" | "done" | "paused";
  downloadedCommits: number;
  totalCommits: number;
  lastCommitIndex: number | null;
  branches: Array<Branch>;
  commits: Array<CommitExchange>;
  settings: RemoteSettings;
}

export interface Comparison {
  against: "wip" | "branch" | "sha" | "merge";
  comparisonDirection: "forward" | "backward";
  branch: string | null;
  commit: string | null;
  same: boolean;
}

export interface RepoState {
  branch: string | null;
  commit: string | null;
  isInMergeConflict: boolean;
  merge: null | {
    fromSha: string;
    intoSha: string;
    originSha: string;
    direction: "yours" | "theirs";
    conflictList: ConflictList;
    mergeState: ApplicationKVState;
  };
  commandMode: "view" | "edit" | "compare";
  comparison: null | Comparison;
}

export interface RepoSetting {
  mainBranch: string;
}

export interface RawStore {
  [name: string]: Array<{
    key: string;
    value: {
      key: string;
      value:
        | {
            [key: string]:
              | number
              | string
              | boolean
              | Array<number | string | boolean>;
          }
        | string;
    };
  }>;
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
  createdByUsername: string;
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
  originalSha?: null | string;
  parent: null | string;
  historicalParent: null | string;
  mergeBase: null | string;
  revertFromSha: null | string;
  revertToSha: null | string;
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
    };
  };
}

export interface ApiStoreInvalidity {
  [key: string]: Array<string>;
}

export interface ConflictList {
  description: Array<number>;
  licenses: Array<number>;
  plugins: Array<number>;
  store: {
    [key: string]: Array<{
      key: string;
      index: number;
    }>;
  };
}

export interface DivergenceOrigin {
  trueOrigin: string|null;
  fromOrigin: string|null;
  intoOrigin: string|null;
  fromLastCommonAncestor: string|null;
  intoLastCommonAncestor: string|null;
  basedOn: "into" | "from";
  rebaseShas: Array<string>;
}

export interface ApiResponse {
  repoState: RepoState;
  applicationState: RenderedApplicationState;
  kvState: ApplicationKVState;
  schemaMap: { [pluginId: string]: Manifest };
  beforeState?: RenderedApplicationState;
  beforeKvState?: ApplicationKVState;
  beforeApiStoreInvalidity?: ApiStoreInvalidity;
  beforeManifests?: Array<Manifest>;
  beforeSchemaMap?: { [pluginId: string]: Manifest };
  apiDiff?: ApiDiff;
  apiStoreInvalidity?: ApiStoreInvalidity;
  isWIP?: boolean;
  branch?: Branch;
  baseBranch?: Branch;
  lastCommit?: CommitData;
  mergeCommit?: CommitData;
  canPopStashedChanges?: boolean;
  stashSize?: number;
  conflictResolution?: ConflictList;
  checkedOutBranchIds: Array<string>;
  binaryToken: string;
  divergenceOrigin?: DivergenceOrigin;
  divergenceSha?: string;
  storageMap?: { [pluginId: string]: object };
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

const CHECKPOINT_MODULO = 5;
const MAX_PULL_RETRY_ATTEMPTS = 10;

export const BRANCH_NAME_REGEX = /^[-_ ()[\]'"|a-zA-Z0-9]{3,100}$/;

export const getRepos = async (): Promise<string[]> => {
  const repoDir = await fs.promises.readdir(vReposPath());
  return repoDir?.filter((repoName) => {
    return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(
      repoName
    );
  });
};

export const getBranchIdFromName = (name: string): string => {
  return name
    .toLowerCase()
    .replaceAll(" ", "-")
    .replaceAll(/[[\]'"]/g, "");
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

export const saveRemoteSha = async (
  datasource: DataSource,
  repoId: string,
  sha: string,
  isCloning = false
): Promise<boolean> => {
  try {
    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const commitExists = await datasource.commitExists(repoId, sha);
    if (commitExists) {
      if (isCloning) {
        // save on top of clonefile
        const clonefile = await datasource.readCloneFile(repoId);
        if (!clonefile) {
          return false;
        }
        const isSaved =
          clonefile?.commits?.find((c) => c.sha == sha)?.saved ?? false;
        if (!isSaved) {
          const commits = clonefile.commits.map((c) => {
            if (c.sha == sha) {
              return {
                ...c,
                saved: true,
              };
            }
            return c;
          });
          clonefile.commits = commits;
          const currentCloneFile = await datasource.readCloneFile(repoId);
          if (currentCloneFile) {
            clonefile.state = currentCloneFile.state;
            const result = await datasource.saveCloneFile(repoId, clonefile);
            return !!result;
          } else {
            return false
          }
        }
      }
      return true;
    }
    let clonefile = isCloning ? await datasource.readCloneFile(repoId) : null;
    if (isCloning) {
      if (!clonefile || clonefile.state == "paused") {
        return false;
      }
    }
    const commitLinkRequest = await axios({
      method: "get",
      url: `${remote}/api/repo/${repoId}/commit/link/${sha}`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
    });
    if (!commitLinkRequest?.data) {
      return false;
    }
    if (isCloning) {
      clonefile = await datasource.readCloneFile(repoId);
      if (!clonefile || clonefile.state == "paused") {
        return false;
      }
    }
    const commitLink: string = commitLinkRequest.data?.link;
    const commitRequest = await axios({
      method: "get",
      url: commitLink,
    });
    const commit: CommitData = commitRequest?.data;
    if (!commit) {
      return false;
    }

    if (isCloning) {
      clonefile = await datasource.readCloneFile(repoId);
      if (!clonefile || clonefile.state == "paused") {
        return false;
      }
    }
    const addedPlugins: Array<DiffElement> = Object.keys(
      commit?.diff.plugins.add
    ).map((key) => {
      return commit?.diff.plugins.add[key];
    });
    const pluginDownloads = await Promise.all(
      addedPlugins.map(({ key: pluginName, value: pluginVersion }) => {
        return datasource.getPluginManifest(pluginName, pluginVersion, false);
      })
    );
    for (const pluginManifest of pluginDownloads) {
      if (!pluginManifest) {
        return false;
      }
    }
    const addedBinaries: Array<string> = Object.keys(
      commit?.diff.binaries.add
    ).map((key) => {
      return commit?.diff.binaries.add[key];
    });
    for (const fileNames of addedBinaries) {
      if (!fileNames) {
        return false;
      }
    }

    if (isCloning) {
      clonefile = await datasource.readCloneFile(repoId);
      if (!clonefile || clonefile.state == "paused") {
        return false;
      }
    }
    const binaryLinksRequest = await axios({
      method: "post",
      url: `${remote}/api/repo/${repoId}/binary/links`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
      data: {
        links: addedBinaries,
      },
    });
    if (!binaryLinksRequest.data) {
      return false;
    }
    if (isCloning) {
      clonefile = await datasource.readCloneFile(repoId);
      if (!clonefile || clonefile.state == "paused") {
        return false;
      }
    }
    const binDownwloads: Promise<boolean>[] = [];
    const binaryLinks: Array<{ fileName: string; link: string }> =
      binaryLinksRequest.data;
    for (const binaryLink of binaryLinks) {
      binDownwloads.push(
        new Promise(async () => {
          try {
            const existsAlready = await datasource.checkBinary(
              binaryLink.fileName
            );
            if (existsAlready) {
              return true;
            }
            const content = await axios({
              method: "get",
              url: binaryLink.link,
            });
            if (!content?.data) {
              return false;
            }
            await datasource.writeBinary(binaryLink.fileName, content as any);
            return true;
          } catch (e) {
            return false;
          }
        })
      );
    }
    const binResults = await Promise.all(binDownwloads);
    for (let didDownload of binResults) {
      if (!didDownload) {
        return false;
      }
    }
    const repoExists = await datasource.repoExists(repoId);
    if (repoExists) {
      await datasource.saveCommit(repoId, sha, commit);
    }

    if (isCloning) {
      const clonefile = await datasource.readCloneFile(repoId);
      if (!clonefile) {
        return false;
      }
      if (clonefile.state == "paused") {
        return false;
      }
      const isSaved =
        clonefile?.commits?.find((c) => c.sha == sha)?.saved ?? false;
      if (!isSaved) {
        const commits = clonefile.commits.map((c) => {
          if (c.sha == sha) {
            return {
              ...c,
              saved: true,
            };
          }
          return c;
        });
        clonefile.commits = commits;
        const currentCloneFile = await datasource.readCloneFile(repoId);
        if (currentCloneFile) {
          clonefile.state = currentCloneFile.state;
          const result = await datasource.saveCloneFile(repoId, clonefile);
          return !!result;
        } else {
          return false;
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  }
};

const fetchRepoInfo = async (repoId: string) => {
  try {
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const infoRequest = await axios({
      method: "get",
      url: `${remote}/api/repo/${repoId}/info`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
    });
    const info: RepoInfo = infoRequest?.data;
    if (infoRequest.status != 200) {
      return null;
    }
    return info;
  } catch(e) {
    return null;
  }
}

export const getRepoInfo = async (
  datasource: DataSource,
  repoId: string
): Promise<RepoInfo|null> => {
  const repoInfo = await datasource.readInfo(repoId);
  if (!repoInfo) {
    const remoteInfo = await fetchRepoInfo(repoId);
    if (remoteInfo) {
      return datasource.saveInfo(repoId, remoteInfo);
    }
    return null;
  }
  return repoInfo;
}

export const cloneRepo = async (
  datasource: DataSource,
  repoId: string
): Promise<boolean> => {
  try {
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const cloneFileExists = await datasource.checkCloneFile(repoId);
    if (!cloneFileExists) {
      try {
        const cloneRequest = await axios({
          method: "get",
          url: `${remote}/api/repo/${repoId}/clone`,
          headers: {
            ["session_key"]: session?.clientKey,
          },
        });
        const cloneInfo: {
          commits: Array<CommitExchange>;
          branches: Array<Branch>;
          settings: RemoteSettings;
        } = cloneRequest?.data;
        if (cloneRequest.status != 200) {
          return false;
        }
        const initCloneFile: CloneFile = {
          state: "in_progress",
          downloadedCommits: 0,
          totalCommits: cloneInfo.commits.length,
          lastCommitIndex: null,
          branches: cloneInfo.branches,
          commits: cloneInfo.commits.sort((a, b) => a.idx - b.idx),
          settings: cloneInfo.settings,
        };
        await datasource.saveCloneFile(repoId, initCloneFile);
        broadcastAllDevices("clone-progress:" + repoId, initCloneFile);
      } catch (e) {
        return false;
      }
    }
    let cloneFile = await datasource.readCloneFile(repoId);
    const startCommitIndex =
      cloneFile.lastCommitIndex == null ? 0 : cloneFile.lastCommitIndex + 1;
    for (
      let index = startCommitIndex;
      index < cloneFile.commits.length;
      ++index
    ) {
      cloneFile = await datasource.readCloneFile(repoId);
      if (!cloneFile) {
        return false;
      }
      if (cloneFile.state == "paused") {
        return false;
      }
      const commitExchangeInfo = cloneFile.commits[index];
      if (!commitExchangeInfo.saved) {
        const didSucceed = await saveRemoteSha(
          datasource,
          repoId,
          commitExchangeInfo.sha,
          true
        );
        if (!didSucceed) {
          let didEventuallySucceed = false;
          for (let i = 1; i < MAX_PULL_RETRY_ATTEMPTS; ++i) {
            // wait a second
            await new Promise((r) => setTimeout(r, 1000));
            const didSucceedOnRetry = await saveRemoteSha(
              datasource,
              repoId,
              commitExchangeInfo.sha,
              true
            );
            if (didSucceedOnRetry) {
              didEventuallySucceed = true;
              break;
            }
          }
          if (!didEventuallySucceed) {
            cloneFile.state = "paused";
            broadcastAllDevices("clone-progress:" + repoId, cloneFile);

            const currentCloneFile = await datasource.readCloneFile(repoId);
            if (!currentCloneFile) {
              return false;
            }
            await datasource.saveCloneFile(repoId, cloneFile);
            return false;
          }
        }
      }

      const commits = cloneFile.commits.map((c) => {
        if (c.sha == commitExchangeInfo.sha) {
          return {
            ...c,
            saved: true,
          };
        }
        return c;
      });
      cloneFile.commits = commits;
      cloneFile.lastCommitIndex = index;
      cloneFile.downloadedCommits++;

      const currentCloneFile = await datasource.readCloneFile(repoId);
      if (!currentCloneFile) {
        return false;
      }
      if (currentCloneFile.state == "paused") {
        return false;
      }
      cloneFile.state = currentCloneFile.state;

      const savedCloneFile = await datasource.saveCloneFile(repoId, cloneFile);
      broadcastAllDevices("clone-progress:" + repoId, cloneFile);
      if (!savedCloneFile) {
        return false;
      }
    }

    const branches: Array<Branch> = [];
    for (
      let index = 0;
      index < cloneFile.branches.length;
      ++index
    ) {
      const branch = cloneFile.branches[index];
      const writtenBranch = await datasource.saveBranch(
        repoId,
        branch.id,
        branch
      );
      if (!writtenBranch) {
        return false;
      }
      branches.push(branch);
    }

    const userBranchIds = new Set(branches
      .filter((b) => b.createdBy == session?.user?.id)
      ?.map((b) => b.id));

    const branchMetaState: BranchesMetaState = {
      allBranches: [],
      userBranches: [],
    };

    branchMetaState.allBranches = cloneFile.branches.map((branchData) => {
      return {
        branchId: branchData.id,
        lastLocalCommit: branchData.lastCommit,
        lastRemoteCommit: branchData.lastCommit,
      };
    });

    const requiredBranchIds = new Set([
      cloneFile.settings.defaultBranchId,
      ...cloneFile.settings.branchRules?.map((b) => b.branchId),
    ]);
    branchMetaState.userBranches = branchMetaState.allBranches.filter((b) => {
      return requiredBranchIds.has(b.branchId) || userBranchIds.has(b.branchId);
    });
    const savedBranchMetaState = await datasource.saveBranchesMetaState(
      repoId,
      branchMetaState
    );
    if (!savedBranchMetaState) {
      return false;
    }

    const defaultBranch = branchMetaState.userBranches.find(
      (v) => v.branchId == cloneFile.settings.defaultBranchId
    );
    const unrenderedKVState = await getCommitState(
      datasource,
      repoId,
      defaultBranch?.lastLocalCommit
    );
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unrenderedKVState
    );
    const savedRenderedState = await datasource.saveRenderedState(
      repoId,
      renderedState
    );
    if (!savedRenderedState) {
      return false;
    }
    const current: RepoState = {
      branch: defaultBranch.branchId,
      commandMode: "view",
      commit: defaultBranch.lastLocalCommit,
      isInMergeConflict: false,
      merge: null,
      comparison: null,
    };
    const savedRepoState = await datasource.saveCurrentRepoState(
      repoId,
      current
    );
    if (!savedRepoState) {
      return false;
    }

    const savedRemoteSettings = await datasource.saveRemoteSettings(
      repoId,
      cloneFile.settings
    );
    if (!savedRemoteSettings) {
      return false;
    }
    const savedLocalSettings = await datasource.saveLocalSettings(
      repoId,
      cloneFile.settings
    );
    if (!savedLocalSettings) {
      return false;
    }
    const repoInfo = await getRepoInfo(datasource, repoId);
    if (!repoInfo) {
      return false;
    }

    const cloneFileDeleted = await datasource.deleteCloneFile(repoId);
    if (!cloneFileDeleted) {
      return false;
    }

    broadcastAllDevices("clone-done:" + repoId, cloneFile);
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
    // check that the index is really + 1
    // apply state and ensure no keys overlap
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
  username: string,
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
    username,
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
  if (datasource?.readCommitHistory) {
    const history = await datasource.readCommitHistory(repoId, sha);
    if (history) {
      return history;
    }
  }
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
      originalSha: commit?.originalSha,
      idx: commit.idx,
      message: commit.message,
      mergeBase: commit.mergeBase,
      revertFromSha: commit?.revertFromSha,
      revertToSha: commit?.revertToSha,
      parent: commit.parent,
      historicalParent: commit.historicalParent,
    },
    ...history,
  ];
};

/***
 * This is a kind of difficult problem to understand so I'm going to
 * illustrate with ascii, in hopes that it helps explain a little or help recall the complexity.
 * See the following version tree, branches are denoted by *
 *
 *                      * F2
 *            - (I) -- (J)
 *          /      * main
 *  (A) -- (B) -- (C)
 *     \           * F1
 *       - (X) -- (Y)
 *
 * first we merge main -> F1 (into)
 *
 *                      * F2
 *            - (I) -- (J)
 *          /      * main
 *  (A) -- (B) -- (C)
 *     \                                  * F1
 *       - (X) -- (Y) -- (B') -- (C') -- (M0)
 *
 * this is a simple merge since the true divergent origin really is just A
 *
 * next we merge main -> F2 (into)
 *
 *                                     * F2
 *            - (I) -- (J) -- (C'') -- (M1)
 *          /      * main
 *  (A) -- (B) -- (C)
 *     \                                  * F1
 *       - (X) -- (Y) -- (B') -- (C') -- (M0)
 *
 * Again, this is a simple merge since the true divergent origin really is just A
 *
 * next we merge F1 -> main (into)
 *
 *
 *                                     * F2
 *            - (I) -- (J) -- (C'') -- (M1)
 *          /
 *  (A) -- (B) -- (C)
 *     \                                  * F1, main
 *       - (X) -- (Y) -- (B') -- (C') -- (M0)
 *
 * because F1 contains B', we know to just rebase any un-rebased sha onto the rebase list after (B) in A->B->C.
 * because C is already rebased in A->X->Y->B'->C'->M0, the rebaseList is empty
 * Since the list is empty, there is no merge to be performed and we simply shift the branch head
 * of main, to M0
 *
 *
 *
 * next we merge F2 -> main (into)
 *
 *                                     * F2
 *            - (I) -- (J) -- (C'') -- (M1)
 *          /
 *  (A) -- (B) -- (C)
 *     \                                  * F1                             *main
 *       - (X) -- (Y) -- (B') -- (C') -- (M0) -- (I') -- (J') -- (M1') -- (M2)
 *
 *
 * Merging in either direction should result in exaclty the same tree lineage. origin of the two commits
 * is really B and B'. Since the F2 tree A->B->I->J->C''->M1, contains the orginalSha of B, we skip over the
 * C'' in the rebaseList due to the fact that it has already been accounted for in the M1 lineage. This merge is
 * communative. The only difference is which branch head is ultimately updated by merging.
 *
 * subsequently if we merge F1 -> main (into) and F2 -> main (into). This is the minimum amount of commits we
 * can theoretically produce, to create an idempotent history preserving lineage
 *
 *
 *            - (I) -- (J) -- (C'') -- (M1)
 *          /
 *  (A) -- (B) -- (C)
 *     \                                                                  *main, F1, F2
 *       - (X) -- (Y) -- (B') -- (C') -- (M0) -- (I') -- (J') -- (M1') -- (M2)
 */

export const getDivergenceOrigin = async (
  datasource: DataSource,
  repoId: string,
  intoSha?: string,
  fromSha?: string
): Promise<DivergenceOrigin> => {
  const fromHistory = await getHistory(datasource, repoId, fromSha);
  if (!fromHistory) {
    throw "missing history";
  }
  const intoHistory = await getHistory(datasource, repoId, intoSha);

  if (!fromHistory) {
    throw "missing history";
  }
  return getDivergenceOriginFromHistoryOrCommitExchange(fromHistory, intoHistory);
};


export const getDivergenceOriginFromHistoryOrCommitExchange = async (
  fromHistory: Array<CommitHistory|CommitExchange>,
  intoHistory: Array<CommitHistory|CommitExchange>,
): Promise<DivergenceOrigin> => {
  if (!fromHistory) {
    throw "missing history";
  }

  if (!fromHistory) {
    throw "missing history";
  }

  const key = LRCache.getCacheKey([
    "getDivergenceOriginFromHistoryOrCommitExchange",
    fromHistory,
    intoHistory,
  ]);
  const cached = lrcache.get<DivergenceOrigin>(key, 10_000);
  if (cached) {
    return cached.unwrap();
  }
  const longerHistory =
    fromHistory.length >= intoHistory.length ? fromHistory : intoHistory;
  const shorterHistory =
    fromHistory.length < intoHistory.length ? fromHistory : intoHistory;
  const visited = new Set();
  const intoVisited: { [idx: number]: CommitHistory|CommitExchange } = {};
  const intoLookup: { [sha: string]: CommitHistory|CommitExchange } = {};
  const intoOriginalLookup: { [sha: string]: CommitHistory|CommitExchange } = {};
  const fromVisited: { [idx: number]: CommitHistory|CommitExchange } = {};
  const fromLookup: { [sha: string]: CommitHistory|CommitExchange } = {};
  const fromOriginalLookup: { [sha: string]: CommitHistory|CommitExchange } = {};
  for (let historyObj of shorterHistory) {
    visited.add(historyObj.sha);
    if (fromHistory.length >= intoHistory.length) {
      if (historyObj?.originalSha) {
        intoOriginalLookup[historyObj?.originalSha] = historyObj;
      }
      intoVisited[historyObj.idx] = historyObj;
      intoLookup[historyObj.sha] = historyObj;
    } else {
      if (historyObj?.originalSha) {
        fromOriginalLookup[historyObj?.originalSha] = historyObj;
      }
      fromVisited[historyObj.idx] = historyObj;
      fromLookup[historyObj.sha] = historyObj;
    }
  }
  let trueOriginObj: CommitHistory|CommitExchange | null = null;
  for (let historyObj of longerHistory) {
    if (fromHistory.length >= intoHistory.length) {
      if (historyObj?.originalSha) {
        fromOriginalLookup[historyObj?.originalSha] = historyObj;
      }
      fromVisited[historyObj.idx] = historyObj;
      fromLookup[historyObj.sha] = historyObj;
    } else {
      if (historyObj?.originalSha) {
        intoOriginalLookup[historyObj?.originalSha] = historyObj;
      }
      intoVisited[historyObj.idx] = historyObj;
      intoLookup[historyObj.sha] = historyObj;
    }
    if (visited.has(historyObj.sha)) {
      trueOriginObj = historyObj;
      break;
    }
  }
  if (!trueOriginObj) {
    let fromLastCommonAncestor = null;
    let intoLastCommonAncestor = null;
    for (let i = 0; i <= (fromHistory?.[0]?.idx ?? -1); ++i) {
      const historyObj = fromVisited[i];
      const rebaseShas = [];
      if (intoOriginalLookup[historyObj.sha] ) {
        intoLastCommonAncestor = historyObj.sha;
        fromLastCommonAncestor = intoOriginalLookup[historyObj?.sha].sha;
        for (let j = i + 1; j <= (fromHistory?.[0]?.idx ?? -1); ++j) {
          const rebaseObj = fromVisited[j];
          if ((!rebaseObj?.originalSha && !intoOriginalLookup?.[rebaseObj.sha]) || (historyObj.originalSha && !intoOriginalLookup?.[rebaseObj.originalSha])) {
            rebaseShas.push(rebaseObj.sha)
          } else {
            intoLastCommonAncestor = rebaseObj.sha;
            fromLastCommonAncestor = rebaseObj?.originalSha ? intoOriginalLookup?.[rebaseObj.originalSha]?.sha : intoOriginalLookup?.[rebaseObj.sha]?.sha;
          }
        }
        const out: DivergenceOrigin =  {
          trueOrigin: null,
          fromOrigin: historyObj.sha,
          intoOrigin: intoOriginalLookup[historyObj?.sha].sha,
          fromLastCommonAncestor,
          intoLastCommonAncestor,
          basedOn: "into",
          rebaseShas
        }
        lrcache.set(key, out, 10_000);
        return out;
      }
    }
    for (let i = 0; i <= (intoHistory?.[0]?.idx ?? -1); ++i) {
      const historyObj = intoVisited[i];
      const rebaseShas = [];
      if (fromOriginalLookup[historyObj.sha]) {

        intoLastCommonAncestor = fromOriginalLookup[historyObj?.sha ?? historyObj?.originalSha].sha;
        fromLastCommonAncestor = historyObj.sha;
        for (let j = i + 1; j <= (intoHistory?.[0]?.idx ?? -1); ++j) {
          const rebaseObj = intoVisited[j];
          if ((!rebaseObj?.originalSha && !fromOriginalLookup?.[rebaseObj.sha]) || (rebaseObj.originalSha && !fromOriginalLookup?.[rebaseObj.originalSha])) {
            rebaseShas.push(rebaseObj.sha)
          } else {
            fromLastCommonAncestor = rebaseObj.sha;
            intoLastCommonAncestor = rebaseObj?.originalSha ? fromOriginalLookup?.[rebaseObj.originalSha]?.sha : fromOriginalLookup?.[rebaseObj.sha]?.sha;
          }
        }

        const out: DivergenceOrigin = {
          trueOrigin: null,
          fromOrigin: fromOriginalLookup[historyObj?.sha ?? historyObj?.originalSha].sha,
          intoOrigin: historyObj.sha,
          fromLastCommonAncestor,
          intoLastCommonAncestor,
          basedOn: "from",
          rebaseShas
        }
        lrcache.set(key, out, 10_000);
        return out;
      }
    }
    const rebaseShas = [];
    for (let i = intoHistory.length - 1; i >= 0; --i) {
      rebaseShas.push(intoHistory[i].sha);
    }
    const out: DivergenceOrigin = {
      trueOrigin: null,
      fromOrigin: null,
      intoOrigin: null,
      fromLastCommonAncestor: null,
      intoLastCommonAncestor: null,
      basedOn: "from",
      rebaseShas
    }
    lrcache.set(key, out, 10_000);
    return out;
  }

  if (trueOriginObj) {
    let fromLastCommonAncestor = trueOriginObj.sha;
    let intoLastCommonAncestor = trueOriginObj.sha;
    for (let i = trueOriginObj.idx; i <= (fromHistory?.[0]?.idx ?? -1); ++i) {
      const historyObj = fromVisited[i];
      const rebaseShas = [];
      if (intoOriginalLookup[historyObj.sha] ) {
        intoLastCommonAncestor = historyObj.sha;
        fromLastCommonAncestor = intoOriginalLookup[historyObj?.sha].sha;
        for (let j = i + 1; j <= (fromHistory?.[0]?.idx ?? -1); ++j) {
          const rebaseObj = fromVisited[j];
          if ((!rebaseObj?.originalSha && !intoOriginalLookup?.[rebaseObj.sha]) || (historyObj.originalSha && !intoOriginalLookup?.[rebaseObj.originalSha])) {
            rebaseShas.push(rebaseObj.sha)
          } else {
            intoLastCommonAncestor = rebaseObj.sha;
            fromLastCommonAncestor = rebaseObj?.originalSha ? intoOriginalLookup?.[rebaseObj.originalSha]?.sha : intoOriginalLookup?.[rebaseObj.sha]?.sha;
          }
        }
        const out: DivergenceOrigin = {
          trueOrigin: trueOriginObj.sha,
          fromOrigin: historyObj.sha,
          intoOrigin: intoOriginalLookup[historyObj?.sha].sha,
          fromLastCommonAncestor,
          intoLastCommonAncestor,
          basedOn: "into",
          rebaseShas
        }
        lrcache.set(key, out, 10_000);
        return out;
      }
    }
    for (let i = trueOriginObj.idx; i <= (intoHistory?.[0]?.idx ?? -1); ++i) {
      const historyObj = intoVisited[i];
      const rebaseShas = [];
      if (fromOriginalLookup[historyObj.sha]) {

        intoLastCommonAncestor = fromOriginalLookup[historyObj?.sha ?? historyObj?.originalSha].sha;
        fromLastCommonAncestor = historyObj.sha;
        for (let j = i + 1; j <= (intoHistory?.[0]?.idx ?? -1); ++j) {
          const rebaseObj = intoVisited[j];
          if ((!rebaseObj?.originalSha && !fromOriginalLookup?.[rebaseObj.sha]) || (rebaseObj.originalSha && !fromOriginalLookup?.[rebaseObj.originalSha])) {
            rebaseShas.push(rebaseObj.sha)
          } else {
            fromLastCommonAncestor = rebaseObj.sha;
            intoLastCommonAncestor = rebaseObj?.originalSha ? fromOriginalLookup?.[rebaseObj.originalSha]?.sha : fromOriginalLookup?.[rebaseObj.sha]?.sha;
          }
        }

        const out: DivergenceOrigin = {
          trueOrigin: trueOriginObj.sha,
          fromOrigin: fromOriginalLookup[historyObj?.sha ?? historyObj?.originalSha].sha,
          intoOrigin: historyObj.sha,
          fromLastCommonAncestor,
          intoLastCommonAncestor,
          basedOn: "from",
          rebaseShas
        }
        lrcache.set(key, out, 10_000);
        return out;
      }
    }

    const rebaseShas = [];
    for (let i = trueOriginObj.idx + 1; i <= (fromHistory?.[0]?.idx ?? -1); ++i) {
      const historyObj = fromVisited[i];
      if (!intoOriginalLookup[historyObj.sha]) {
          rebaseShas.push(historyObj.sha)
      }
    }
    const out: DivergenceOrigin = {
      trueOrigin: trueOriginObj.sha,
      fromOrigin: trueOriginObj.sha,
      intoOrigin: trueOriginObj.sha,
      fromLastCommonAncestor,
      intoLastCommonAncestor,
      basedOn: "into",
      rebaseShas
    }
    lrcache.set(key, out, 10_000);
    return out;
  }
  const out: DivergenceOrigin = {
    trueOrigin: null,
    fromOrigin: null,
    intoOrigin: null,
    fromLastCommonAncestor: null,
    intoLastCommonAncestor: null,
    basedOn: "into",
    rebaseShas: []
  }
  lrcache.set(key, out, 10_000);
  return out;
};

export const getMergeOriginSha = (
  divergeOrigin: DivergenceOrigin | null
): null|string => {
  if (!divergeOrigin) {
    return null;
  }
  if (divergeOrigin.basedOn == "from") {
    return divergeOrigin.fromOrigin;
  }
  return divergeOrigin.intoOrigin;
}

export const getCommitState = async (
  datasource: DataSource,
  repoId: string,
  sha: string | null,
  historyLength?: number,
  checkedHot?: boolean,
  hotCheckpoint?: [string, ApplicationKVState]
): Promise<ApplicationKVState | null> => {
  const result = await getCommitStateRaw(
    datasource,
    repoId,
    sha,
    historyLength,
    checkedHot,
    hotCheckpoint
  )
  return result;
}

export const getCommitStateRaw = async (
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
  if (datasource?.readCommitApplicationState) {
    const state = await datasource.readCommitApplicationState(repoId, sha);
    return state;
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
  const state = await getCommitStateRaw(
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
  if (currentRepoState?.isInMergeConflict) {
    if (currentRepoState?.merge?.mergeState) {
      return currentRepoState?.merge?.mergeState;
    }
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

export const updateCurrentWithNewBranch = async (
  datasource: DataSource,
  repoId: string,
  branch: Branch
): Promise<RepoState | null> => {
  try {
    const current = await datasource.readCurrentRepoState(repoId);
    if (current?.isInMergeConflict) {
      return null;
    }
    let same = false;
    if (current.comparison) {
      if (current.comparison.against == "branch") {
        const comparingBranch = await datasource.readBranch(repoId, current.branch);
        same = comparingBranch?.lastCommit == branch?.lastCommit;
      } else if (current.comparison.against == "sha") {
        same = current.comparison.commit == branch?.lastCommit;
      } else {
        same = true;
      }
    }
    const updated = {
      ...current,
      commit: branch?.lastCommit,
      branch: branch.id,
      comparison: current.comparison ? {
        ...current.comparison,
        same
      } : null
    };
    await datasource.saveCurrentRepoState(repoId, updated);
    return updated;
  } catch (e) {
    return null;
  }
};

export const branchIdIsCyclic = (branchId: string, branches: Branch[], visited: Set<string> = new Set()) =>{
  if (visited.has(branchId)) {
    return true;
  }
  visited.add(branchId);
  for (const branch of branches) {
    if (branch?.baseBranchId && branch.baseBranchId == branchId) {
      const hasCycle = branchIdIsCyclic(branch.id, branches, new Set(Array.from(visited)));
      if (hasCycle) {
        return true;
      }
    }
  }
  return false;
}

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

    let same = false
    if (current.comparison) {
      if (current.comparison.against == "branch") {
        const comparingBranch = await datasource.readBranch(repoId, current.branch);
        same = comparingBranch?.lastCommit == branch?.lastCommit;
      } else if (current.comparison.against == "sha") {
        same = current.comparison.commit == branch?.lastCommit;
      } else {
        same = true;
      }
    }
    const updated = {
      ...current,
      commit: branch.lastCommit,
      branch: branchId,
      comparison: current?.comparison ? {
        ...current?.comparison,
        same
      } : null
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

export const buildStateStore = async (
  datasource: DataSource,
  appKvState: ApplicationKVState
): Promise<{ [key: string]: object }> => {
  let out = {};
  const manifests = await getPluginManifests(datasource, appKvState.plugins);
  for (const pluginManifest of manifests) {
    const kv = appKvState?.store?.[pluginManifest.name] ?? [];
    const schemaMap = await getSchemaMapForManifest(datasource, pluginManifest);
    try {
      const pluginState = getStateFromKVForPlugin(
        schemaMap,
        kv,
        pluginManifest.name
      );
      out[pluginManifest.name] = pluginState;
    } catch(e) {
      console.log("Error", e);
    }
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
  const key = LRCache.getCacheKey([
    "indexArrayDuplicates",
    appKVState,
    stateStore,
    manifests
  ]);
  const cached = lrcache.get<RawStore>(key);
  if (cached) {
    return cached.unwrapCopy();
  }

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
  lrcache.set(key, out);
  return out;
};

export const convertCommitStateToRenderedState = async (
  datasource: DataSource,
  appKVState: ApplicationKVState
): Promise<RenderedApplicationState> => {
  const manifests = await getPluginManifests(datasource, appKVState.plugins);
  const store = await buildStateStore(datasource, appKVState);
  const schemaMap = manifestListToSchemaMap(manifests);
  const defaultedStore = await defaultVoidedState(datasource, schemaMap, store);
  const out = {
    ...appKVState,
    store: defaultedStore,
  }
  return out;
};

export const tokenizeCommitState = (
  appKVState: ApplicationKVState
): [TokenizedState, { [key: string]: unknown }] => {
  const key = LRCache.getCacheKey([
    "tokenizeCommitState",
    appKVState,
  ]);
  const cached = lrcache.get<[TokenizedState, { [key: string]: unknown }]>(key);
  if (cached) {
    return cached.unwrap();
  }
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
  const out: [TokenizedState, { [key: string]: unknown}] = [
    {
      description,
      licenses,
      plugins,
      store,
      binaries,
    },
    tokenStore,
  ];
  lrcache.set(key, out);
  return out;
};

export const detokenizeStore = (
  tokenizedState: TokenizedState,
  tokenStore: { [key: string]: unknown }
): ApplicationKVState => {
  const key = LRCache.getCacheKey([
    "detokenizeStore",
    tokenizedState,
    tokenStore,
  ]);
  const cached = lrcache.get<ApplicationKVState>(key);
  if (cached) {
    return cached.unwrap();
  }
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
  const out = {
    description,
    licenses,
    plugins,
    store,
    binaries,
  };
  lrcache.set(key, out);
  return out;
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

export const uniqueKVObj = <T>(
  kvList: Array<{ key: string; value: T }>
): Array<{ key: string; value: T }> => {
  let out: Array<{ key: string; value: T }> = [];
  let seen = new Set();
  for (let { key, value } of kvList) {
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ key, value });
    }
  }
  return out;
};
export const uniqueKVList = <T>(
  kvList: Array<{ key: string; value: T }>
): Array<{ key: string; value: T }> => {
  let out: Array<{ key: string; value: T }> = [];
  let seen = new Set();
  for (let { key, value } of kvList) {
    if (!seen.has(key + ":" + value)) {
      seen.add(key + ":" + value);
      out.push({ key, value });
    }
  }
  return out;
};



export const uniqueStrings = (strings: Array<string>): Array<string> => {
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
  const key = LRCache.getCacheKey([
    "getStateDiffFromCommitStates",
    beforeKVState,
    afterKVState
  ]);
  const cached = lrcache.get<StateDiff>(key);
  if (cached) {
    return cached.unwrap();
  }

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
    ...Object.keys(beforeKVState?.store ?? {}),
    ...Object.keys(afterKVState?.store ?? {}),
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
  lrcache.set(key, stateDiff);
  return stateDiff;
};

export const getMergeCommitStates = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string,
  intoSha: string
) => {
  try {
    const key = LRCache.getCacheKey([
      "getMergeCommitStates",
      repoId,
      fromSha,
      intoSha,
    ]);
    const cached = lrcache.get<{
      fromCommitState: ApplicationKVState;
      intoCommitState: ApplicationKVState;
      originCommit: ApplicationKVState;
    }>(key);
    if (cached) {
      return cached.unwrap();
    }
    const divergeOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      intoSha,
      fromSha,
    );
    const originSha = getMergeOriginSha(divergeOrigin);
    const fromCommitState = await getCommitState(datasource, repoId, fromSha);
    const intoCommitState = await getCommitState(datasource, repoId, intoSha);
    const originCommit = !!originSha
      ? await getCommitState(datasource, repoId, originSha)
      : EMPTY_COMMIT_STATE;
    const out = {
      fromCommitState,
      intoCommitState,
      originCommit,
    };
    lrcache.set(key, out)
    return out;
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
    const key = LRCache.getCacheKey(["canAutoMergeCommitStates", fromCommitState, intoCommitState, originCommitState]);
    const cached = lrcache.get<boolean>(key);
    if (cached != null) {
      return cached.unwrap();
    }

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
    const result = JSON.stringify(yourMerge) == JSON.stringify(theirMerge);
    lrcache.set(key, result);
    return result;
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
    const key = LRCache.getCacheKey([
      "getMergedCommitState",
      fromState,
      intoState,
      originCommit,
      direction,
    ]);
    const cached = lrcache.get<ApplicationKVState>(key);
    if (cached) {
      return cached.unwrap();
    }

    const [tokenizedCommitFrom, tokenizedStoreFrom] =
      tokenizeCommitState(fromState);
    const [tokenizedCommitInto, tokenizedStoreInto] =
      tokenizeCommitState(intoState);
    const [tokenizedOrigin] = tokenizeCommitState(originCommit);

    const tokenizedDescription = getMergeSequence(
      tokenizedOrigin.description,
      tokenizedCommitInto.description,
      tokenizedCommitFrom.description,
      direction
    );

    const tokenizedLicenses = getMergeSequence(
      tokenizedOrigin.licenses,
      tokenizedCommitInto.licenses,
      tokenizedCommitFrom.licenses,
      direction
    );

    const tokenizedPlugins = getMergeSequence(
      tokenizedOrigin.plugins,
      tokenizedCommitInto.plugins,
      tokenizedCommitFrom.plugins,
      direction
    );

    const tokenizedBinaries = getMergeSequence(
      tokenizedOrigin.binaries,
      tokenizedCommitInto.binaries,
      tokenizedCommitFrom.binaries,
      direction
    );

    const seen = new Set<string>([]);
    const pluginsToTraverse = Array.from([
      ...Object.keys(tokenizedCommitInto.store),
      ...Object.keys(tokenizedCommitFrom.store),
    ]).filter((v) => {
      if (seen.has(v)) {
        return false;
      }
      seen.add(v);
      return true;
    });
    const tokenizedStore = {};
    for (const pluginName of pluginsToTraverse) {
      const pluginKVsInto = tokenizedCommitInto?.store?.[pluginName] ?? [];
      const pluginKVsFrom = tokenizedCommitFrom?.store?.[pluginName] ?? [];
      const orignKVs = tokenizedOrigin?.store?.[pluginName] ?? [];
      const pluginStoreSequence = getMergeSequence(
        orignKVs,
        pluginKVsInto,
        pluginKVsFrom,
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

    const schemaMap = manifestListToSchemaMap(manifests);
    await enforceBoundedSets(datasource, schemaMap, stateStore);
    stateStore = await cascadePluginState(datasource, schemaMap, stateStore);
    stateStore = await nullifyMissingFileRefs(
      datasource,
      schemaMap,
      stateStore
    );
    const binaries = await collectFileRefs(datasource, schemaMap, stateStore);

    mergeState.store = await convertStateStoreToKV(
      datasource,
      mergeState,
      stateStore
    );
    mergeState.binaries = uniqueStrings(binaries);
    lrcache.set(key, mergeState);
    return mergeState;
  } catch (e) {
    return null;
  }
};

export const getConflictResolution = (
  resolveDiff: StateDiff,
  conflictList: ConflictList
): ConflictList => {
  const key = LRCache.getCacheKey([
    "getConflictResolution",
    resolveDiff,
    conflictList,
  ]);
  const cached = lrcache.get<ConflictList>(key);
  if (cached) {
    return cached.unwrap();
  }
  const description: Array<number> = [];
  for (let i = 0; i < conflictList.description.length; ++i) {
    if (!resolveDiff?.description?.remove?.[conflictList.description[i]]) {
      description.push(conflictList.description[i]);
    }
  }

  const licenses: Array<number> = [];
  for (let i = 0; i < conflictList.licenses.length; ++i) {
    if (!resolveDiff?.licenses?.remove?.[conflictList.licenses[i]]) {
      licenses.push(conflictList.licenses[i]);
    }
  }

  const plugins: Array<number> = [];
  for (let i = 0; i < conflictList.plugins.length; ++i) {
    if (!resolveDiff?.plugins?.remove?.[conflictList.plugins[i]]) {
      plugins.push(conflictList.plugins[i]);
    }
  }

  const store: { [key: string]: Array<{ key: string; index: number }> } = {};
  for (const plugin in conflictList.store) {
    store[plugin] = [];
    const pluginStore = conflictList.store[plugin];
    for (let i = 0; i < pluginStore.length; ++i) {
      if (!resolveDiff?.store?.[plugin]?.remove?.[pluginStore[i].index]) {
        store[plugin].push(pluginStore[i]);
      }
    }
  }

  const out = {
    description,
    licenses,
    plugins,
    store,
  };
  lrcache.set(key, out);
  return out;
};

export const getConflictList = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string,
  intoSha: string,
  originSha: string,
  direction: "theirs" | "yours"
): Promise<ConflictList> => {
  const key = LRCache.getCacheKey([
    "getConflictList",
    repoId,
    fromSha,
    intoSha,
    originSha,
    direction
  ]);
  const cached = lrcache.get<ConflictList>(key);
  if (cached) {
    return cached.unwrap();
  }
  const fromCommitState = await getCommitState(datasource, repoId, fromSha);
  const intoCommitState = await getCommitState(datasource, repoId, intoSha);
  const originCommitState = await getCommitState(datasource, repoId, originSha);

  const yourState = await getMergedCommitState(
    datasource,
    fromCommitState,
    intoCommitState,
    originCommitState,
    "yours"
  );

  const theirState = await getMergedCommitState(
    datasource,
    fromCommitState,
    intoCommitState,
    originCommitState,
    "theirs"
  );
  const conflictState = direction == "yours" ? yourState : theirState;
  const counterState = direction == "yours" ? theirState : yourState;
  const description: Array<number> = [];
  for (let i = 0; i < conflictState.description.length; ++i) {
    if (conflictState.description[i] != counterState.description[i]) {
      description.push(i);
    }
  }

  const licenses: Array<number> = [];
  for (let i = 0; i < conflictState.licenses.length; ++i) {
    if (conflictState.licenses[i].key != counterState.licenses[i].key) {
      licenses.push(i);
    }
  }

  const plugins: Array<number> = [];
  for (let i = 0; i < conflictState.plugins.length; ++i) {
    if (
      conflictState.plugins[i].key != counterState.plugins[i].key ||
      conflictState.plugins[i].value != counterState.plugins[i].value
    ) {
      plugins.push(i);
    }
  }

  const store: { [key: string]: Array<{ key: string; index: number }> } = {};
  for (const plugin in conflictState.store) {
    store[plugin] = [];
    const pluginStore = reIndexSchemaArrays(conflictState.store[plugin]);
    for (let i = 0; i < conflictState.store[plugin].length; ++i) {
      if (
        conflictState.store[plugin][i].key !=
          counterState.store?.[plugin][i].key ||
        JSON.stringify(conflictState.store[plugin][i].value) !=
          JSON.stringify(counterState.store?.[plugin][i].value)
      ) {
        store[plugin].push({
          key: pluginStore[i],
          index: i,
        });
      }
    }
  }
  const out = {
    description,
    licenses,
    plugins,
    store,
  };
  lrcache.set(key, out);
  return out;
};

export const getApiDiff = (
  beforeState: ApplicationKVState,
  afterState: ApplicationKVState,
  stateDiff: StateDiff
): ApiDiff => {
  const key = LRCache.getCacheKey([
    "getApiDiff",
    beforeState,
    afterState,
    stateDiff,
  ]);
  const cached = lrcache.get<ApiDiff>(key);
  if (cached) {
    return cached.unwrap();
  }
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

  for (const pluginName in stateDiff?.store ?? {}) {
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
  const out = {
    description,
    licenses,
    plugins,
    store,
  };
  lrcache.set(key, out);
  return out;
};

export const getInvalidStates = async (
  datasource: DataSource,
  appKvState: ApplicationKVState
): Promise<ApiStoreInvalidity> => {
  const manifests = await getPluginManifests(datasource, appKvState.plugins);
  const schemaMap = manifestListToSchemaMap(manifests);
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

    const invalidRootStates = await getInvalidRootStates(
      datasource,
      schemaMap,
      appKvState.store[pluginName],
      pluginName
    );
    const invalidStates = [
      ...invalidRootStates,
      ...invalidStateIndices.map((i) => indexedKvs[i]),
    ];
    store[pluginName] = invalidStates;
  }
  return store;
};
export const getBranchFromRepoState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState
) => {
  if (!repoState?.branch) {
    return null;
  }
  return (await datasource.readBranch(repoId, repoState?.branch)) ?? null;
};

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
};

export const getLastCommitFromRepoState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState
) => {
  if (!repoState?.commit) {
    return null;
  }
  return (await datasource.readCommit(repoId, repoState?.commit)) ?? null;
};

export const readComparisonState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState,
) => {

  if (repoState.comparison?.against == "branch") {
    const comparatorBranch = repoState?.comparison?.branch
      ? await datasource.readBranch(repoId, repoState?.comparison?.branch)
      : null;
    const branchState = await getCommitState(
      datasource,
      repoId,
      comparatorBranch?.lastCommit
    );
    return await convertCommitStateToRenderedState(
      datasource,
      branchState
    );
  }

  if (repoState.comparison?.against == "sha") {
    return await getCommitState(
      datasource,
      repoId,
      repoState.comparison?.commit
    );
  }
  // "WIP"
  return await getUnstagedCommitState(datasource, repoId);
}

export const getApiDiffFromComparisonState = async (
  repoId: string,
  datasource: DataSource,
  repoState: RepoState,
  applicationKVState: ApplicationKVState
): Promise<{
  apiDiff: ApiDiff;
  diff: StateDiff;
  beforeState: RenderedApplicationState;
  beforeKvState: ApplicationKVState;
  beforeApiStoreInvalidity: ApiStoreInvalidity;
  beforeManifests: Array<Manifest>;
  beforeSchemaMap: { [pluginName: string]: Manifest };
  divergenceOrigin: DivergenceOrigin;
  divergenceSha: string
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
    const beforeState = await convertCommitStateToRenderedState(
      datasource,
      branchState
    );
    const beforeApiStoreInvalidity = await getInvalidStates(
      datasource,
      branchState
    );
    const beforeManifests = await getPluginManifests(
      datasource,
      branchState.plugins
    );
    const beforeSchemaMap = manifestListToSchemaMap(beforeManifests);

    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      repoState?.commit,
      comparatorBranch?.lastCommit as string,
    );
    const divergenceSha = getMergeOriginSha(divergenceOrigin);
    return {
      beforeState,
      beforeKvState: branchState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      diff,
      divergenceOrigin,
      divergenceSha,
      apiDiff:
        repoState.comparison.comparisonDirection == "forward"
          ? getApiDiff(branchState, applicationKVState, diff)
          : getApiDiff(applicationKVState, branchState, diff),
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
    const beforeState = await convertCommitStateToRenderedState(
      datasource,
      commitState
    );
    const beforeApiStoreInvalidity = await getInvalidStates(
      datasource,
      commitState
    );
    const beforeManifests = await getPluginManifests(
      datasource,
      commitState.plugins
    );
    const beforeSchemaMap = manifestListToSchemaMap(beforeManifests);
    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      repoState?.commit,
      repoState.comparison?.commit,
    );;
    const divergenceSha = getMergeOriginSha(divergenceOrigin);
    return {
      beforeState,
      beforeKvState: commitState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      diff,
      divergenceSha,
      divergenceOrigin,
      apiDiff:
        repoState.comparison.comparisonDirection == "forward"
          ? getApiDiff(commitState, applicationKVState, diff)
          : getApiDiff(applicationKVState, commitState, diff),
    };
  }
  // "WIP"
  const unstagedState = await getUnstagedCommitState(datasource, repoId);
  const diff = getStateDiffFromCommitStates(unstagedState, applicationKVState);
  const beforeState = await convertCommitStateToRenderedState(
    datasource,
    unstagedState
  );
  const beforeApiStoreInvalidity = await getInvalidStates(
    datasource,
    unstagedState
  );
  const beforeManifests = await getPluginManifests(
    datasource,
    unstagedState.plugins
  );
  const beforeSchemaMap = manifestListToSchemaMap(beforeManifests);
  return {
    beforeState,
    beforeKvState: unstagedState,
    beforeApiStoreInvalidity,
    beforeManifests,
    beforeSchemaMap,
    diff,
    divergenceOrigin: {
      basedOn: "into",
      trueOrigin: repoState?.commit,
      fromOrigin: repoState?.commit,
      intoOrigin: repoState?.commit,
      fromLastCommonAncestor: repoState?.commit,
      intoLastCommonAncestor: repoState?.commit,
      rebaseShas: []
    },
    divergenceSha: repoState?.commit,
    apiDiff: getApiDiff(unstagedState, applicationKVState, diff),
  };
};

const getPluginsFromLastRemoteState = async (
  datasource: DataSource,
  repoId: string,
  branch: Branch
): Promise<Array<{ name: string; version: string }>> => {
  const branchMetaState = await datasource.readBranchesMetaState(repoId);
  const branchMeta = branchMetaState?.allBranches?.find((b) => {
    return b.branchId == branch.id;
  });
  const history = await getHistory(datasource, repoId, branch?.lastCommit);
  const plugins: Array<{name: string, version: string}> = [];
  const seen = new Set<string>();
  for (const { sha } of history) {
    if (sha == branchMeta?.lastRemoteCommit) {
      break;
    }
    const commit = await datasource.readCommit(repoId, sha);
    for (const { key, value} of Object.values(commit?.diff?.plugins?.add ?? {})) {
      const pvKeyName = `${key}:${value}`;
      if (seen.has(pvKeyName)) {
        continue;
      }
      seen.add(pvKeyName);
      plugins.push({
        name: key,
        version: value
      })
    }
  }
  return plugins;
};

export const getKVStateFromBranchHeadLink = async (
  datasource: DataSource,
  repoId: string,
  remoteSha: string|null,
  branchHeadLink: {
    id: string;
    lastCommit: string;
    kvLink: string;
    stateLink: string;
  }
): Promise<ApplicationKVState|null> => {
  try {
    if (!remoteSha) {
      return EMPTY_COMMIT_STATE;
    }
    const localCommitData = await datasource.readCommit(repoId, remoteSha);
    if (!!localCommitData) {
      return getCommitState(datasource, repoId, remoteSha);
    }
    const kvState = await fetchRemoteKvState(branchHeadLink.kvLink);
    if (!kvState) {
      return null;
    }
    const binariesToAdd: Array<string> = [];
    const remote = await getRemoteHostAsync();
    const session = getUserSession();

    for (let binary of kvState?.binaries ?? []) {
      const existsAlready = await datasource.checkBinary(binary);
      if (!existsAlready) {
        binariesToAdd.push(binary);
      }
    }

    if (binariesToAdd.length > 0) {
      const binaryLinksRequest = await axios({
        method: "post",
        url: `${remote}/api/repo/${repoId}/binary/links`,
        headers: {
          ["session_key"]: session?.clientKey,
        },
        data: {
          links: binariesToAdd,
        },
      });
      const binDownwloads: Promise<boolean>[] = [];
      const binaryLinks: Array<{ fileName: string; link: string }> =
        binaryLinksRequest.data;
      for (const binaryLink of binaryLinks) {
        binDownwloads.push(
          new Promise(async () => {
            try {
              const existsAlready = await datasource.checkBinary(
                binaryLink.fileName
              );
              if (existsAlready) {
                return true;
              }
              const content = await axios({
                method: "get",
                url: binaryLink.link,
              });
              if (!content?.data) {
                return false;
              }
              await datasource.writeBinary(binaryLink.fileName, content as any);
              return true;
            } catch (e) {
              return false;
            }
          })
        );
      }
      const allBinsDownloaded = await Promise.all(binDownwloads);
      for(let didDownload of allBinsDownloaded) {
        if (!didDownload) {
          return null;
        }
      }
    }
    return kvState;
  } catch (e) {
    return null;
  }
};

export const getRemoteFetchInfo = async (datasource: DataSource, repoId: string): Promise<{
      commits: Array<CommitExchange>;
      branches: Array<Branch>;
      branchHeadLinks: Array<{
        id: string,
        lastCommit: string,
        kvLink: string,
        stateLink: string,
      }>;
      pluginStatuses: Array<{
        name: string,
        version: string,
        status: "ok"|"unreleased"|"invalid"
      }>;
      settings: RemoteSettings;
      hasRemoteBranchCycle: boolean;
      hasOpenMergeRequest: boolean;
      status: "ok"|"fail"
}> => {
  try {
    const repoState = await datasource.readCurrentRepoState(repoId);
    const branch = await datasource?.readBranch(repoId, repoState.branch);
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    const branchLeaves = branchMetaState.allBranches.map(bms => bms.lastLocalCommit);
    const plugins = await getPluginsFromLastRemoteState(datasource, repoId, branch);
    const fetchRequest = await axios({
      method: "post",
      url: `${remote}/api/repo/${repoId}/fetch`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
      data: {
        branchLeaves,
        branch,
        plugins
      }
    });
    const fetchInfo: {
      commits: Array<CommitExchange>;
      branches: Array<Branch>;
      settings: RemoteSettings;
      branchHeadLinks: Array<{
        id: string,
        lastCommit: string,
        kvLink: string,
        stateLink: string,
      }>;
      pluginStatuses: Array<{
        name: string;
        version: string;
        status: "ok"|"unreleased"|"invalid"
      }>
      hasRemoteBranchCycle: boolean;
      hasOpenMergeRequest: boolean;
    } = fetchRequest?.data;
    if (typeof fetchRequest?.data != "string") {
      await datasource.saveRemoteSettings(repoId, fetchInfo.settings);
    } else {
      const currentRemoteSettings = await datasource.readRemoteSettings(repoId);
      return {
        settings: currentRemoteSettings,
        commits: [],
        branches: [],
        branchHeadLinks: [],
        pluginStatuses: [],
        hasRemoteBranchCycle: false,
        hasOpenMergeRequest: false,
        status: "fail"
      }
    }
    return {
      ...fetchInfo,
      status: "ok"
    };
  } catch (e) {
    const currentRemoteSettings = await datasource.readRemoteSettings(repoId);
    return {
      settings: currentRemoteSettings,
      commits: [],
      branches: [],
      branchHeadLinks: [],
      pluginStatuses: [],
      hasRemoteBranchCycle: false,
      hasOpenMergeRequest: false,
      status: "fail"
    }
  }
};

export const fetchRemoteKvState = async (kvLink: string): Promise<ApplicationKVState> => {
    const kvRequest = await axios({
      method: "get",
      url: kvLink,
    });
    return kvRequest?.data ?? null;
}

export const checkRemoteShaExistence = async (
  repoId: string,
  sha?: string
): Promise<boolean | null> => {
  try {
    if (!sha) {
      return true;
    }
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const existenceRequest = await axios({
      method: "get",
      url: `${remote}/api/repo/${repoId}/commit/exists/${sha}`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
    });
    return existenceRequest?.data?.exists ?? false;
  } catch (e) {
    return null;
  }
};

export const checkRemoteBinaryExistence = async (
  repoId: string,
  fileName?: string
): Promise<boolean | null> => {
  try {
    if (!fileName) {
      return false;
    }
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const existenceRequest = await axios({
      method: "get",
      url: `${remote}/api/repo/${repoId}/binary/exists/${fileName}`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
    });
    return existenceRequest?.data?.exists ?? false;
  } catch (e) {
    return null;
  }
};

export const pushBinary = async (
  repoId: string,
  binaryRef: string,
  branchId: string
): Promise<boolean | null> => {
  try {
    const binSubDir = path.join(vBinariesPath(), binaryRef.substring(0, 2));
    const existsBinSubDir = await existsAsync(binSubDir);
    if (!existsBinSubDir) {
      return null;
    }
    const fullPath = path.join(binSubDir, binaryRef);
    const exists = await existsAsync(fullPath);
    if (!exists) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const mimeType = mime.contentType(path.extname(fullPath));
    const content = await fs.promises.readFile(fullPath);
    const data = new FormData();
    data.append('file', content, {
      contentType: mimeType,
      filename: fullPath
    });
    const ackUploadRequest = await axios.post(
      `${remote}/api/repo/${repoId}/push/binary?branch=${branchId}`,
      data,
      {
        headers: {
          ["session_key"]: session?.clientKey,
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return ackUploadRequest?.data?.ack ?? false;
  } catch (e) {
    return null;
  }
};

export const pushCommitData = async (
  repoId: string,
  commitData: CommitData,
  branchId: string
): Promise<boolean | null> => {
  try {
    if (!commitData) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const ackUploadRequest = await axios.post(
      `${remote}/api/repo/${repoId}/push/commit?branch=${branchId}`,
      {
        commitData,
      },
      {
        headers: {
          ["session_key"]: session?.clientKey,
        },
      }
    );

    return ackUploadRequest?.data?.ack ?? false;
  } catch (e) {
    return null;
  }
};

export const pushBranch = async (
  repoId: string,
  branch: Branch
): Promise<{
  commits: Array<CommitExchange>;
  branches: Array<Branch>;
  settings: RemoteSettings;
} | null> => {
  try {
    if (!branch) {
      return null;
    }
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const ackUploadRequest = await axios({
      method: "post",
      url: `${remote}/api/repo/${repoId}/push/branch`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
      data: {
        branch,
      },
    });
    return ackUploadRequest?.data ?? null;
  } catch (e) {
    return null;
  }
};