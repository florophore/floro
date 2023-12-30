import path from "path";
import webhookQueue from "./webhookqueue";
import { existsAsync, vReposPath, getUserAsync, User } from "./filestructure";
import binarySession from "./binary_session";
import {
  getCurrentBranch,
  getUnstagedCommitState,
  getCurrentCommitSha,
  getHistory,
  getCommitState,
  Branch,
  updateCurrentWithNewBranch,
  canCommit,
  getAddedDeps,
  getRemovedDeps,
  getMergeCommitStates,
  canAutoMergeCommitStates,
  uniqueKV,
  diffIsEmpty,
  getMergedCommitState,
  getDivergenceOrigin,
  getStateDiffFromCommitStates,
  RenderedApplicationState,
  convertCommitStateToRenderedState,
  RepoState,
  getBranchIdFromName,
  BRANCH_NAME_REGEX,
  updateCurrentBranch,
  uniqueStrings,
  getConflictList,
  getInvalidStates,
  ApplicationKVState,
  getBranchFromRepoState,
  getLastCommitFromRepoState,
  ApiResponse,
  getBaseBranchFromBranch,
  getConflictResolution,
  SourceGraphResponse,
  getApiDiffFromComparisonState,
  RawStore,
  Comparison,
  uniqueKVObj,
  getRemoteFetchInfo,
  FetchInfo,
  checkRemoteShaExistence,
  checkRemoteBinaryExistence,
  pushBinary,
  pushCommitData,
  pushBranch,
  fetchRemoteKvState,
  CommitExchange,
  saveRemoteSha,
  getMergeOriginSha,
  branchIdIsCyclic,
  applyStateDiffToCommitState,
  CommitHistory,
  getDivergenceOriginFromHistoryOrCommitExchange,
  getKVStateFromBranchHeadLink,
  DivergenceOrigin,
} from "./repo";
import {
  CommitData,
  DiffElement,
  getDiffHash,
  splitTextForDiff,
} from "./sequenceoperations";
import {
  PluginElement,
  pluginManifestsAreCompatibleForUpdate,
  getSchemaMapForManifest,
  getPluginManifests,
  getManifestMapFromManifestList,
  getDownstreamDepsInSchemaMap,
  getUpstreamDepsInSchemaMap,
  pluginMapToList,
  topSortManifests,
  manifestListToPluginList,
  cascadePluginState,
  nullifyMissingFileRefs,
  collectFileRefs,
  manifestListToSchemaMap,
  getKVStateForPlugin,
  enforceBoundedSets,
  indexArrayDuplicates,
  defaultVoidedState,
} from "./plugins";
import { LicenseCodes } from "./licensecodes";
import { DataSource } from "./datasource";
import {
  SourceGraph,
  getPotentialBaseBranchesForSha,
} from "./sourcegraph";
import LRCache from "./lrcache";
const lrcache = new LRCache();

export const ILLEGAL_BRANCH_NAMES = new Set(["none"]);

export const writeRepoDescription = async (
  datasource: DataSource,
  repoId?: string,
  description?: string
) => {
  if (!repoId) {
    return null;
  }
  if (typeof description != "string") {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  try {
    const renderedState = await datasource.readRenderedState(repoId);
    renderedState.description = splitTextForDiff(description);
    const sanitizedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    return sanitizedRenderedState;
  } catch (e) {
    return null;
  }
};

export const writeRepoLicenses = async (
  datasource: DataSource,
  repoId?: string,
  licensesInput?: Array<{ key: string; value: string }>
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const licenses: Array<DiffElement> = (licensesInput ?? [])?.map(
      (rawLicense: DiffElement) => {
        if (!LicenseCodes?.[rawLicense?.key]) {
          return null;
        }
        return {
          key: rawLicense.key,
          value: LicenseCodes[rawLicense.key],
        };
      }
    );

    if (licenses.includes(null)) {
      return null;
    }
    const renderedState = await datasource.readRenderedState(repoId);
    renderedState.licenses = licenses;
    const sanitizedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    return sanitizedRenderedState;
  } catch (e) {
    return null;
  }
};

export const readRepoDescription = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await existsAsync(path.join(vReposPath(), repoId));
  if (!exists) {
    return;
  }
  const renderedState = await datasource.readRenderedState(repoId);
  return renderedState.description;
};

export const getRepoCloneState = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return {
      state: "none",
      downloadedCommits: 0,
      totalCommits: 1,
    };
  }
  const exists = await existsAsync(path.join(vReposPath(), repoId));
  if (!exists) {
    return {
      state: "none",
      downloadedCommits: 0,
      totalCommits: 1,
    };
  }
  try {
    const cloneFile = await datasource.readCloneFile(repoId);
    if (!cloneFile) {
      return {
        state: "done",
        downloadedCommits: 1,
        totalCommits: 1,
      };
    }
    return {
      state: cloneFile?.state,
      downloadedCommits: cloneFile?.downloadedCommits,
      totalCommits: cloneFile?.totalCommits,
    };
  } catch (e) {
    return null;
  }
};

export const getCurrentRepoBranch = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await getCurrentBranch(datasource, repoId);
    return branch;
  } catch (e) {
    return null;
  }
};

export const getRepoBranches = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branches = await datasource.readBranches(repoId);
    return branches;
  } catch (e) {
    return null;
  }
};
// add create branch

export const updateLocalBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchName?: string,
  branchHeadSha?: string,
  baseBranchId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  const user = await getUserAsync();
  if (!user) {
    return null;
  }
  if (
    !BRANCH_NAME_REGEX.test(branchName) ||
    ILLEGAL_BRANCH_NAMES.has(branchName?.toLowerCase?.() ?? "")
  ) {
    return null;
  }

  try {
    const repoState = await datasource.readCurrentRepoState(repoId);
    if (!repoState.branch) {
      return null;
    }
    const originalBranch = await datasource.readBranch(
      repoId,
      repoState?.branch
    );
    if (!originalBranch) {
      return null;
    }
    const canSwitch = await canSwitchShasWithWIP(
      datasource,
      repoId,
      branchHeadSha
    );
    if (!canSwitch) {
      return null;
    }
    const branches = await datasource.readBranches(repoId);
    const potentialBaseBranches = branches?.filter((v) => v.id != originalBranch.id);
    const branchId = getBranchIdFromName(branchName);

    const combinedBranches = combineBranches(potentialBaseBranches, [
      {
        id: branchId,
        baseBranchId,
      } as Branch
    ]);
    if (baseBranchId && branchIdIsCyclic(branchId, combinedBranches)) {
      return null;
    }

    const branchAlreadyExists = branches
      .filter((v) => v.id != originalBranch.id)
      .map((v) => v.id)
      .includes(branchId);
    if (branchAlreadyExists) {
      return null;
    }

    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    if (!currentKVState) {
      return null;
    }

    const headState = await getCommitState(datasource, repoId, branchHeadSha);
    if (!headState) {
      return null;
    }
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const isWIP = await getIsWip(
      datasource,
      repoId,
      repoState,
      unstagedState,
      currentKVState
    );
    const newCurrentKVState = !isWIP
      ? headState
      : await getMergedCommitState(
          datasource,
          headState, // theirs
          currentKVState, // yours
          unstagedState // origin
        );
    const newRenderedState = await convertCommitStateToRenderedState(
      datasource,
      newCurrentKVState
    );

    const branch: Branch = {
      id: branchId,
      lastCommit: branchHeadSha,
      createdBy: user.id,
      createdByUsername: user.username,
      createdAt: new Date().toISOString(),
      name: branchName,
      baseBranchId,
    };

    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    const branchData = await datasource.saveBranch(repoId, branchId, branch);
    if (originalBranch.id != branch.id) {
      await datasource.deleteBranch(repoId, originalBranch.id);

      for (const oldBranch of branches) {
        if (oldBranch.id == originalBranch.id) {
          continue;
        }
        if (oldBranch.baseBranchId == originalBranch.id) {
          // CHECK FOR CYCLE
          oldBranch.baseBranchId = branchData.id;
          if (!branchIdIsCyclic(branchData.id, branches)) {
            await datasource?.saveBranch(repoId, oldBranch.id, oldBranch);
          } else {
            oldBranch.baseBranchId = null;
            await datasource?.saveBranch(repoId, oldBranch.id, oldBranch);
          }
        }
      }
    }
    branchMetaState.allBranches = branchMetaState.allBranches.map((v) => {
      if (v.branchId == originalBranch.id) {
        return {
          branchId: branchData.id,
          lastLocalCommit: branchHeadSha,
          lastRemoteCommit:
            branchHeadSha != originalBranch.lastCommit ||
            originalBranch.id != branch.id
              ? null
              : v.lastRemoteCommit,
        };
      }
      return v;
    });

    branchMetaState.userBranches = branchMetaState.userBranches.map((v) => {
      if (v.branchId == originalBranch.id) {
        return {
          branchId: branchData.id,
          lastLocalCommit: branchHeadSha,
          lastRemoteCommit:
            branchHeadSha != originalBranch.lastCommit ||
            originalBranch.id != branch.id
              ? null
              : v.lastRemoteCommit,
        };
      }
      return v;
    });

    await datasource.saveBranchesMetaState(repoId, branchMetaState);
    const newRepoState = await updateCurrentWithNewBranch(
      datasource,
      repoId,
      branchData
    );
    await datasource.saveRenderedState(repoId, newRenderedState);
    return newRepoState;
  } catch (e) {
    return null;
  }
};

export const createRepoBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchName?: string,
  branchHead?: string,
  baseBranchId?: string,
  shouldSwitchToNewBranch?: boolean
): Promise<RepoState> => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  if (baseBranchId) {
    const branches = await datasource.readBranches(repoId);
    const branch = await datasource.readBranch(repoId, baseBranchId);
    if (!branch) {
      return null;
    }
    const commits = await datasource.readCommits(repoId);
    const branchesMetaState = await datasource.readBranchesMetaState(repoId);
    const repoState = await datasource.readCurrentRepoState(repoId);
    const sourcegraph = new SourceGraph(commits, branchesMetaState, repoState);
    const pointers = sourcegraph.getPointers();
    const potentialBaseBranches = getPotentialBaseBranchesForSha(
      branchHead,
      branches,
      pointers
    );
    const baseBranchIds = potentialBaseBranches?.map((b) => b.id);
    if (!baseBranchIds.includes(baseBranchId)) {
      return null;
    }
  }

  try {
    const user = await getUserAsync();
    if (!user) {
      return null;
    }
    if (
      !BRANCH_NAME_REGEX.test(branchName) ||
      ILLEGAL_BRANCH_NAMES.has(branchName?.toLowerCase?.() ?? "")
    ) {
      return null;
    }

    let newRenderedState: RenderedApplicationState | null;
    if (shouldSwitchToNewBranch) {
      const headState = await getCommitState(datasource, repoId, branchHead);
      if (!headState) {
        return null;
      }
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const newCurrentKVState = await getMergedCommitState(
        datasource,
        headState, // theirs
        currentKVState, // yours
        unstagedState // origin
      );

      // save to rendered current after branch change goes through
      newRenderedState = await convertCommitStateToRenderedState(
        datasource,
        newCurrentKVState
      );
    }

    const branchId = getBranchIdFromName(branchName);
    const branch: Branch = {
      id: branchId,
      lastCommit: branchHead,
      createdBy: user.id,
      createdByUsername: user.username,
      createdAt: new Date().toISOString(),
      name: branchName,
      baseBranchId,
    };

    const currentBranches = await datasource.readBranches(repoId);
    const branchAlreadyExists = currentBranches
      .map((v) => v.id)
      .includes(branchId);
    if (branchAlreadyExists) {
      return null;
    }
    const branchData = await datasource.saveBranch(repoId, branchId, branch);
    const branches = await datasource.readBranches(repoId);
    if (branchIdIsCyclic(branchId, branches)) {
      await datasource.deleteBranch(repoId, branchId);
      return null;
    }

    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    branchMetaState.allBranches.push({
      branchId: branchData.id,
      lastLocalCommit: branchHead,
      lastRemoteCommit: null,
    });
    branchMetaState.userBranches.push({
      branchId: branchData.id,
      lastLocalCommit: branchHead,
      lastRemoteCommit: null,
    });

    await datasource.saveBranchesMetaState(repoId, branchMetaState);
    let repoState = await datasource.readCurrentRepoState(repoId);
    if (shouldSwitchToNewBranch) {
      repoState = await updateCurrentWithNewBranch(
        datasource,
        repoId,
        branchData
      );
    }
    if (newRenderedState) {
      const sanitizedRenderedState = await sanitizeApplicationKV(
        datasource,
        newRenderedState
      );
      await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    }
    return repoState;
  } catch (e) {
    return null;
  }
};

export const switchRepoBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = branchId
      ? await datasource?.readBranch(repoId, branchId)
      : null;

    const headState = await getCommitState(
      datasource,
      repoId,
      branch?.lastCommit
    );
    if (!headState) {
      return null;
    }
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const repoState = await datasource.readCurrentRepoState(repoId);
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const isWIP = await getIsWip(
      datasource,
      repoId,
      repoState,
      unstagedState,
      currentKVState
    );
    const newCurrentKVState = !isWIP
      ? headState
      : await getMergedCommitState(
          datasource,
          headState, // theirs
          currentKVState, // yours
          unstagedState // origin
        );

    const newRenderedState = await convertCommitStateToRenderedState(
      datasource,
      newCurrentKVState
    );

    const currentBranches = await datasource.readBranches(repoId);
    if (branchId && !currentBranches.map((v) => v.id).includes(branchId)) {
      return null;
    }

    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    const branchMeta = branchMetaState.allBranches.find(
      (bm) => bm.branchId == branchId
    );
    const userBranchMeta = branchMetaState.userBranches.find(
      (bm) => bm.branchId == branchId
    );
    if (branchMeta && !userBranchMeta) {
      branchMetaState.userBranches.push(branchMeta);
    }

    await datasource.saveBranchesMetaState(repoId, branchMetaState);
    const sanitizedRenderedState = await sanitizeApplicationKV(
      datasource,
      newRenderedState
    );
    await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    return await updateCurrentBranch(datasource, repoId, branchId);
  } catch (e) {
    return null;
  }
};

export const checkIsBranchProtected = async (
  datasource: DataSource,
  repoId: string,
  branchId: string
): Promise<boolean> => {
  const remoteSettings = await datasource?.readRemoteSettings(repoId);
  if (!remoteSettings) {
    return false;
  }
  if (branchId == remoteSettings?.defaultBranchId) {
    return true;
  }
  const branchRule = remoteSettings?.branchRules?.find(
    (br) => br.branchId == branchId
  );
  if (!branchRule) {
    return false;
  }
  return branchRule.directPushingDisabled;
};

export const deleteLocalBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  if (!branchId) {
    return null;
  }

  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    let finalBranchSha;
    let finalBranchId = currentRepoState.branch;
    let isSwitchingToBase = false;
    if (currentRepoState.branch == branchId) {
      const currentBranch = await datasource.readBranch(repoId, branchId);
      finalBranchSha = currentBranch.lastCommit;
      const baseBranch = currentBranch.baseBranchId
        ? await datasource.readBranch(repoId, currentBranch.baseBranchId)
        : null;
      finalBranchId = baseBranch?.id;
      isSwitchingToBase = true;

      finalBranchSha = baseBranch?.lastCommit;
      if (baseBranch && baseBranch?.lastCommit) {
        const canSwitch = await canSwitchShasWithWIP(
          datasource,
          repoId,
          baseBranch?.lastCommit
        );
        if (!canSwitch) {
          return null;
        }
      }
    }
    if (currentRepoState.branch) {
      const currentBranch = await datasource.readBranch(repoId, branchId);
      const currentBranches = await datasource.readBranches(repoId);
      if (
        currentBranch?.baseBranchId &&
        currentBranch?.baseBranchId == branchId
      ) {
        const remoteSettings = await datasource?.readRemoteSettings(repoId);
        // CHECK FOR CYCLE
        currentBranch.baseBranchId = remoteSettings?.defaultBranchId ?? null;
        if (!branchIdIsCyclic(currentBranch.id, currentBranches)) {
          await datasource?.saveBranch(repoId, currentBranch.id, currentBranch);
        } else {
          currentBranch.baseBranchId = null;
          await datasource?.saveBranch(repoId, currentBranch.id, currentBranch);
        }
      }
    }

    let newRenderedState: null | RenderedApplicationState;
    if (finalBranchSha) {
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const isWIP = await getIsWip(
        datasource,
        repoId,
        currentRepoState,
        unstagedState,
        currentKVState
      );

      if (isSwitchingToBase && !isWIP) {
        /// no need to merge, just update
        const headState = await getCommitState(
          datasource,
          repoId,
          finalBranchSha
        );
        newRenderedState = await convertCommitStateToRenderedState(
          datasource,
          headState
        );
      } else {
        const headState = await getCommitState(
          datasource,
          repoId,
          finalBranchSha
        );
        if (!headState) {
          return null;
        }
        const newCurrentKVState = await getMergedCommitState(
          datasource,
          headState, // theirs
          currentKVState, // yours
          unstagedState // origin
        );

        newRenderedState = await convertCommitStateToRenderedState(
          datasource,
          newCurrentKVState
        );
      }
    }
    const currentBranches = await datasource.readBranches(repoId);
    if (!currentBranches.map((v) => v.id).includes(branchId)) {
      return null;
    }

    for (const branch of currentBranches) {
      if (branch.id == branchId) {
        continue;
      }
      if (branch.baseBranchId == branchId) {
        // CHECK FOR CYCLE
        branch.baseBranchId = finalBranchId;
        if (!branchIdIsCyclic(branch.id, currentBranches)) {
          await datasource?.saveBranch(repoId, branch.id, branch);
        } else {
          branch.baseBranchId = null;
          await datasource?.saveBranch(repoId, branch.id, branch);
        }
      }
    }

    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    branchMetaState.userBranches = branchMetaState.userBranches.filter(
      (bm) => bm.branchId != branchId
    );
    branchMetaState.allBranches = branchMetaState.allBranches.filter(
      (bm) => bm.branchId != branchId
    );
    await datasource.saveBranchesMetaState(repoId, branchMetaState);

    let repoState = currentRepoState;
    if (currentRepoState.branch == branchId) {
      repoState = await updateCurrentBranch(datasource, repoId, finalBranchId);
    }

    if (newRenderedState) {
      const sanitizedRenderedState = await sanitizeApplicationKV(
        datasource,
        newRenderedState
      );
      await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    }
    await datasource.deleteBranch(repoId, branchId);
    return repoState;
  } catch (e) {
    return null;
  }
};

export const readSettings = async (datasource: DataSource, repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const settings = await datasource.readRepoSettings(repoId);
    if (!settings) {
      return null;
    }
    return settings;
  } catch (e) {
    return null;
  }
};

export const readLastCommit = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const sha = await getCurrentCommitSha(datasource, repoId);
    if (!sha) {
      return null;
    }
    const commit = await datasource.readCommit(repoId, sha);
    if (!commit) {
      return null;
    }
    return commit;
  } catch (e) {
    return null;
  }
};

export const readRepoCommit = async (
  datasource: DataSource,
  repoId: string,
  sha: string | null
) => {
  if (!repoId) {
    return null;
  }
  if (sha === undefined) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const commit = await datasource.readCommit(repoId, sha);
    if (!commit) {
      return null;
    }
    return commit;
  } catch (e) {
    return null;
  }
};

export const readCurrentHistory = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const sha = await getCurrentCommitSha(datasource, repoId);
    if (!sha) {
      return [];
    }
    const history = await getHistory(datasource, repoId, sha);
    if (!history) {
      return null;
    }
    return history;
  } catch (e) {
    return null;
  }
};

export const readBranchHistory = async (
  datasource: DataSource,
  repoId?: string,
  branchId?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!branchId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await datasource.readBranch(repoId, branchId);
    if (!branch) {
      return null;
    }
    const history = await getHistory(datasource, repoId, branch.lastCommit);
    if (!history) {
      return null;
    }
    return history;
  } catch (e) {
    return null;
  }
};

export const readCommitHistory = async (
  datasource: DataSource,
  repoId: string,
  sha: string | null
) => {
  if (!repoId) {
    return null;
  }
  if (sha === undefined) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const commit = await datasource.readCommit(repoId, sha);
    if (!commit) {
      return null;
    }
    const history = await getHistory(datasource, repoId, sha);
    if (!history) {
      return null;
    }
    return history;
  } catch (e) {
    return null;
  }
};

export const readCurrentState = async (
  datasource: DataSource,
  repoId?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const state = await getApplicationState(datasource, repoId);
    return state;
  } catch (e) {
    return null;
  }
};

export const readCommitState = async (
  datasource: DataSource,
  repoId?: string,
  sha?: string
): Promise<RenderedApplicationState> => {
  if (!repoId) {
    return null;
  }
  if (!sha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const state = await getCommitState(datasource, repoId, sha);
    if (!state) {
      return null;
    }
    return convertCommitStateToRenderedState(datasource, state);
  } catch (e) {
    return null;
  }
};

export const readBranchState = async (
  datasource: DataSource,
  repoId?: string,
  branchId?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!branchId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await datasource.readBranch(repoId, branchId);
    if (!branch) {
      return null;
    }
    const state = await getCommitState(datasource, repoId, branch.lastCommit);
    if (!state) {
      return null;
    }
    return state;
  } catch (e) {
    return null;
  }
};

export const writeRepoCommit = async (
  datasource: DataSource,
  repoId?: string,
  message?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!message) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const user = await getUserAsync();
    if (!user?.id) {
      return null;
    }
    const currentState = await datasource.readCurrentRepoState(repoId);
    const currentRenderedState = await datasource.readRenderedState(repoId);
    const isCurrentRenderedStateValid = await isRenderedStateValid(datasource, currentRenderedState);
    if (!isCurrentRenderedStateValid) {
      return null;
    }
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentRenderedState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const diff = getStateDiffFromCommitStates(unstagedState, currentKVState);
    const commitIsValid = await canCommit(
      datasource,
      repoId,
      user,
      message,
      diff
    );
    if (!commitIsValid) {
      return null;
    }

    const currentSha = await getCurrentCommitSha(datasource, repoId);
    const parent = currentSha
      ? await datasource.readCommit(repoId, currentSha)
      : null;
    const idx = parent ? parent.idx + 1 : 0;
    const timestamp = new Date().toISOString();
    const commitData: CommitData = {
      parent: parent ? parent.sha : null,
      historicalParent: parent ? parent.sha : null,
      idx: idx,
      diff,
      timestamp,
      userId: user.id,
      username: user.username,
      message,
    };
    const sha = getDiffHash(commitData);
    const commit = await datasource.saveCommit(repoId, sha, {
      sha,
      ...commitData,
    });
    if (!commit) {
      return null;
    }
    const appliedKVState = applyStateDiffToCommitState(unstagedState, commitData.diff);
    const appliedKVStateString = JSON.stringify(appliedKVState);
    const currentKVStateString = JSON.stringify(currentKVState);
    if (appliedKVStateString != currentKVStateString) {
      return null;
    }
    if (currentState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentState.branch
      );

      const nextBranch = await datasource.saveBranch(repoId, currentState.branch, {
        ...branchState,
        lastCommit: sha,
      });
      webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);
      const branchMetaState = await datasource.readBranchesMetaState(repoId);
      branchMetaState.allBranches = branchMetaState.allBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = sha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = sha;
          }
          return branch;
        }
      );

      await datasource.saveBranchesMetaState(repoId, branchMetaState);
    }
    await updateCurrentCommitSHA(datasource, repoId, sha, false);
    await datasource.saveHotCheckpoint(repoId, sha, currentKVState);
    return commit;
  } catch (e) {
    console.log("Error", e)
    return null;
  }
};

export const updatePlugins = async (
  datasource: DataSource,
  repoId: string,
  plugins: Array<PluginElement>
) => {
  if (!repoId) {
    return null;
  }
  if (!plugins) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const addedPlugins = getAddedDeps(unstagedState.plugins, plugins);
    const removedPlugins = getRemovedDeps(unstagedState.plugins, plugins);
    const oldManifests = await getPluginManifests(
      datasource,
      unstagedState.plugins
    );
    const newManifests = await getPluginManifests(datasource, plugins);

    const oldManifestMap = getManifestMapFromManifestList(oldManifests);
    const newManifestMap = getManifestMapFromManifestList(newManifests);

    for (const removedManifest of removedPlugins) {
      const downstreamDeps = getDownstreamDepsInSchemaMap(
        oldManifestMap,
        removedManifest.key
      );
      for (const downstreamDep of downstreamDeps) {
        // checks the dep is truly deleted and not updated
        // ensure any downstream dependencies are no longer present
        // otherwise they have to be removed first in a separate request
        if (
          newManifestMap[downstreamDep] &&
          !newManifestMap[removedManifest.key]
        ) {
          // EDGE CASE: check that the version present in new manifest
          // no longer holds reference to orig dep
          // if new version hold no reference, this is safe
          if (!newManifestMap[downstreamDep].imports[removedManifest.key]) {
            continue;
          }
          return null;
        }
      }
    }
    const pluginsToAppend: Array<PluginElement> = [];
    for (const addedDep of addedPlugins) {
      const addedDepImportsList = pluginMapToList(
        newManifestMap[addedDep.key].imports
      );
      const addedDepImportManifests = await getPluginManifests(
        datasource,
        addedDepImportsList
      );
      const addedDepImportsManifestMap = getManifestMapFromManifestList([
        newManifestMap[addedDep.key],
        ...addedDepImportManifests,
      ]);
      // need to construct deps from imports
      const upstreamDeps = getUpstreamDepsInSchemaMap(
        addedDepImportsManifestMap,
        addedDep.key
      );
      for (const upstreamDep of upstreamDeps) {
        const upstreamManifest = await datasource.getPluginManifest(
          upstreamDep,
          addedDepImportsManifestMap[upstreamDep].version
        );
        if (newManifestMap[upstreamDep]) {
          if (newManifestMap[upstreamDep].version != upstreamManifest.version) {
            const areCompatible = await pluginManifestsAreCompatibleForUpdate(
              datasource,
              upstreamManifest,
              newManifestMap[upstreamDep]
            );
            if (!areCompatible) {
              return null;
            }
          }
          continue;
        }
        if (!newManifestMap[upstreamDep]) {
          pluginsToAppend.push({
            key: upstreamManifest.name,
            value: upstreamManifest.version,
          });
        }
      }
    }
    // do top sort
    const updatedPlugins = uniqueKV([...plugins, ...pluginsToAppend]);
    const updatedManifests = await getPluginManifests(
      datasource,
      updatedPlugins
    );
    const updatedManifestMap = getManifestMapFromManifestList(updatedManifests);
    for (let updatedPlugin of updatedManifests) {
      const upstreamDeps = getUpstreamDepsInSchemaMap(
        updatedManifestMap,
        updatedPlugin.name
      );
      for (const upstreamDep of upstreamDeps) {
        const upstreamManifest = await datasource.getPluginManifest(
          upstreamDep,
          updatedPlugin.imports[upstreamDep]
        );
        if (
          upstreamManifest.version != updatedManifestMap[upstreamDep].version
        ) {
          // we need to know that the depended upon version is subset of the version
          // being used by the app to ensure read safety
          const areCompatible = await pluginManifestsAreCompatibleForUpdate(
            datasource,
            upstreamManifest,
            updatedManifestMap[upstreamDep]
          );
          if (!areCompatible) {
            return null;
          }
        }
      }
    }
    const sortedUpdatedManifests = topSortManifests(updatedManifests);
    const sortedUpdatedPlugins = manifestListToPluginList(
      sortedUpdatedManifests
    );

    const pluginsToBeAddedToStore = getAddedDeps(
      unstagedState.plugins,
      sortedUpdatedPlugins
    );
    const pluginAdditions = [];
    for (const plugin of pluginsToBeAddedToStore) {
      pluginAdditions.push({
        namespace: "store",
        pluginName: plugin.key,
        diff: {
          add: {},
          remove: {},
        },
      });
    }

    const currentRenderedState = await datasource.readRenderedState(repoId);
    const lexicallyOrderedPlugins = updatedPlugins.sort((a, b) => {
      if (a.key == b.key) return 0;
      return a.key > b.key ? 1 : -1;
    });
    let store = currentRenderedState.store;
    for (let { key } of lexicallyOrderedPlugins) {
      if (!store[key]) {
        const manifest = updatedManifests.find((m) => m.name == key);
        store[key] = (manifest?.seed as object) ?? {};
      }
    }
    const schemaMap = manifestListToSchemaMap(updatedManifests);
    await enforceBoundedSets(datasource, schemaMap, store);
    store = await cascadePluginState(datasource, schemaMap, store);
    store = await nullifyMissingFileRefs(datasource, schemaMap, store);
    const binaries = await collectFileRefs(datasource, schemaMap, store);
    currentRenderedState.store = store;
    currentRenderedState.plugins = sortedUpdatedPlugins;
    currentRenderedState.binaries = uniqueStrings(binaries);
    const sanitizedRenderedState = await sanitizeApplicationKV(
      datasource,
      currentRenderedState
    );
    sanitizedRenderedState.store = {
      ...sanitizedRenderedState.store,
    };
    await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    return currentRenderedState;
  } catch (e) {
    return null;
  }
};

export const updatePluginState = async (
  datasource: DataSource,
  repoId: string,
  pluginName: string,
  updatedState: object
) => {
  if (!repoId) {
    return null;
  }
  if (!pluginName) {
    return null;
  }
  if (!updatedState) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const current = await getApplicationState(datasource, repoId);
    if (current == null) {
      return null;
    }
    const pluginVersion = (current?.plugins ?? []).find(
      (v) => v.key == pluginName
    )?.value;
    if (!pluginVersion) {
      return null;
    }
    const manifests = await getPluginManifests(datasource, current.plugins);
    const schemaMap = manifestListToSchemaMap(manifests);

    const renderedState = await datasource.readRenderedState(repoId);
    const stateStore = renderedState.store;
    stateStore[pluginName] = updatedState;

    await enforceBoundedSets(datasource, schemaMap, renderedState.store);

    renderedState.store = await cascadePluginState(
      datasource,
      schemaMap,
      stateStore
    );
    renderedState.store = await nullifyMissingFileRefs(
      datasource,
      schemaMap,
      renderedState.store
    );
    renderedState.binaries = uniqueStrings(
      await collectFileRefs(datasource, schemaMap, renderedState.store)
    );
    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    await enforceBoundedSets(
      datasource,
      schemaMap,
      sanitiziedRenderedState.store
    );
    sanitiziedRenderedState.store = await cascadePluginState(
      datasource,
      schemaMap,
      sanitiziedRenderedState.store
    );
    sanitiziedRenderedState.store = await nullifyMissingFileRefs(
      datasource,
      schemaMap,
      sanitiziedRenderedState.store
    );

    sanitiziedRenderedState.binaries = uniqueStrings(
      await collectFileRefs(datasource, schemaMap, sanitiziedRenderedState.store)
    );
    await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
    return sanitiziedRenderedState;
  } catch (e) {
    return null;
  }
};

export const getCanMerge = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string
): Promise<boolean> => {
  if (!repoId) {
    return null;
  }
  if (!fromSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  const user = await getUserAsync();
  if (!user?.id) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    const commitStateResult = await getMergeCommitStates(
      datasource,
      repoId,
      fromSha,
      currentRepoState.commit
    );
    if (!commitStateResult) {
      return null;
    }
    const { fromCommitState, intoCommitState, originCommit } =
      commitStateResult;

    //QA
    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      currentRepoState.commit,
      fromSha,
    );

    if (divergenceOrigin?.intoOrigin == currentRepoState.commit) {
      return true;
    }

    const canAutoCommitMergeStates = await canAutoMergeCommitStates(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommit
    );
    if (!canAutoCommitMergeStates) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const getMergeRebaseCommitList = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string,
  user: User,
  includeMerge: boolean = true
): Promise<Array<CommitData>> => {
  if (!repoId) {
    return null;
  }
  if (!fromSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  if (!user?.id) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const commitStateResult = await getMergeCommitStates(
      datasource,
      repoId,
      fromSha,
      currentRepoState.commit
    );
    const { fromCommitState, intoCommitState, originCommit } =
      commitStateResult;

    const divergnceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      currentRepoState.commit,
      fromSha
    );
    const mergeBase = getMergeOriginSha(divergnceOrigin);
    const canAutoCommitMergeStates =
      !currentRepoState.isInMergeConflict &&
      (await canAutoMergeCommitStates(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit
      ));
    const headCommit =
      divergnceOrigin.basedOn == "from"
        ? await datasource.readCommit(repoId, fromSha)
        : await datasource.readCommit(repoId, currentRepoState.commit);
    const headKvState =
      divergnceOrigin.basedOn == "from" ? fromCommitState : intoCommitState;

    const rebaseList = [];
    let lastCommit = headCommit;
    let isFirst = true;
    let lastOriginalIdx = headCommit.idx;
    let lastCopiedCommit = headCommit;
    for (const shaToRebase of divergnceOrigin.rebaseShas) {
      const commitToRebaseOriginal = await datasource.readCommit(
        repoId,
        shaToRebase
      );
      const commitToRebase = { ...commitToRebaseOriginal };
      const idx = (lastCommit?.idx ?? -1) + 1;
      if (isFirst || lastCommit?.idx - lastOriginalIdx != 1) {
        const kvState = await getCommitState(datasource, repoId, shaToRebase);
        const previousState = await getCommitState(
          datasource,
          repoId,
          lastCopiedCommit.sha
        );
        commitToRebase.diff = getStateDiffFromCommitStates(
          previousState,
          kvState
        );
        isFirst = false;
      }
      lastOriginalIdx = commitToRebaseOriginal?.idx;
      lastCopiedCommit = commitToRebaseOriginal;
      commitToRebase.authorUserId =
        commitToRebase.authorUserId ?? commitToRebase.userId;
      commitToRebase.authorUsername =
        commitToRebase.authorUsername ?? commitToRebase.username;
      commitToRebase.userId = user.id;
      commitToRebase.username = user.username;
      commitToRebase.historicalParent = commitToRebase.parent;
      commitToRebase.parent = lastCommit.sha;
      commitToRebase.idx = idx;
      commitToRebase.originalSha =
        commitToRebase.originalSha ?? commitToRebase.sha;
      commitToRebase.sha = getDiffHash(commitToRebase);
      rebaseList.push(commitToRebase);
      lastCommit = commitToRebase;
    }

    if (includeMerge && canAutoCommitMergeStates) {
      const mergeState = await getMergedCommitState(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit
      );

      const lastKvState =
        divergnceOrigin.rebaseShas?.length == 0
          ? headKvState
          : await getCommitState(datasource, repoId, lastCommit?.originalSha);
      const mergeStateHeadDiff = getStateDiffFromCommitStates(
        lastKvState,
        mergeState
      );
      if (!diffIsEmpty(mergeStateHeadDiff)) {
        const mergeCommit: CommitData = {
          diff: mergeStateHeadDiff,
          idx: (lastCommit?.idx ?? -1) + 1,
          historicalParent: lastCommit.sha,
          userId: user.id,
          username: user.username,
          parent: lastCommit.sha,
          timestamp: new Date().toISOString(),
          message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
          mergeBase,
        };
        mergeCommit.sha = getDiffHash(mergeCommit);
        rebaseList.push(mergeCommit);
      }
    }
    return rebaseList;
  } catch (e) {
    return null;
  }
};

export const getMergeRebaseCommitListInto = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string,
  intoSha: string,
  user: User
): Promise<Array<CommitData>> => {
  if (!repoId) {
    return null;
  }
  if (!fromSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  if (!user?.id) {
    return null;
  }
  try {
    const commitStateResult = await getMergeCommitStates(
      datasource,
      repoId,
      fromSha,
      intoSha
    );
    const { fromCommitState, intoCommitState, originCommit } =
      commitStateResult;

    const divergnceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      intoSha,
      fromSha
    );
    const mergeBase = getMergeOriginSha(divergnceOrigin);
    const canAutoCommitMergeStates = (await canAutoMergeCommitStates(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit
      ));
    const headCommit =
      divergnceOrigin.basedOn == "from"
        ? await datasource.readCommit(repoId, fromSha)
        : await datasource.readCommit(repoId, intoSha);
    const headKvState =
      divergnceOrigin.basedOn == "from" ? fromCommitState : intoCommitState;

    const rebaseList = [];
    let lastCommit = headCommit;
    let isFirst = true;
    let lastOriginalIdx = headCommit.idx;
    let lastCopiedCommit = headCommit;
    for (const shaToRebase of divergnceOrigin.rebaseShas) {
      const commitToRebaseOriginal = await datasource.readCommit(
        repoId,
        shaToRebase
      );
      const commitToRebase = { ...commitToRebaseOriginal };
      const idx = (lastCommit?.idx ?? -1) + 1;
      if (isFirst || lastCommit?.idx - lastOriginalIdx != 1) {
        const kvState = await getCommitState(datasource, repoId, shaToRebase);
        const previousState = await getCommitState(
          datasource,
          repoId,
          lastCopiedCommit.sha
        );
        commitToRebase.diff = getStateDiffFromCommitStates(
          previousState,
          kvState
        );
        isFirst = false;
      }
      lastOriginalIdx = commitToRebaseOriginal?.idx;
      lastCopiedCommit = commitToRebaseOriginal;
      commitToRebase.authorUserId =
        commitToRebase.authorUserId ?? commitToRebase.userId;
      commitToRebase.authorUsername =
        commitToRebase.authorUsername ?? commitToRebase.username;
      commitToRebase.userId = user.id;
      commitToRebase.username = user.username;
      commitToRebase.historicalParent = commitToRebase.parent;
      commitToRebase.parent = lastCommit.sha;
      commitToRebase.idx = idx;
      commitToRebase.originalSha =
        commitToRebase.originalSha ?? commitToRebase.sha;
      commitToRebase.sha = getDiffHash(commitToRebase);
      rebaseList.push(commitToRebase);
      lastCommit = commitToRebase;
    }

    if (canAutoCommitMergeStates) {
      const mergeState = await getMergedCommitState(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit
      );

      const lastKvState =
        divergnceOrigin.rebaseShas?.length == 0
          ? headKvState
          : await getCommitState(datasource, repoId, lastCommit?.originalSha);
      const mergeStateHeadDiff = getStateDiffFromCommitStates(
        lastKvState,
        mergeState
      );
      if (!diffIsEmpty(mergeStateHeadDiff)) {
        const mergeCommit: CommitData = {
          diff: mergeStateHeadDiff,
          idx: (lastCommit?.idx ?? -1) + 1,
          historicalParent: lastCommit.sha,
          userId: user.id,
          username: user.username,
          parent: lastCommit.sha,
          timestamp: new Date().toISOString(),
          message: `Merge [${fromSha}] into [${intoSha}]`,
          mergeBase,
        };
        mergeCommit.sha = getDiffHash(mergeCommit);
        rebaseList.push(mergeCommit);
      }
    }
    return rebaseList;
  } catch (e) {
    return null;
  }
};

export const mergeCommit = async (
  datasource: DataSource,
  repoId: string,
  fromSha: string
) => {
  if (!repoId) {
    return null;
  }
  if (!fromSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  const user = await getUserAsync();
  if (!user?.id) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    const commitStateResult = await getMergeCommitStates(
      datasource,
      repoId,
      fromSha,
      currentRepoState.commit
    );
    if (!commitStateResult) {
      return null;
    }

    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      currentRepoState.commit,
      fromSha,
    );
    const { fromCommitState, intoCommitState, originCommit } =
      commitStateResult;
    const canAutoCommitMergeStates = await canAutoMergeCommitStates(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommit
    );
    //const mergeOriginSha = getMergeOriginSha(divergenceOrigin);
    if (divergenceOrigin.trueOrigin == currentRepoState.commit) {
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const isWIP = await getIsWip(
        datasource,
        repoId,
        currentRepoState,
        unstagedState,
        currentKVState
      );
      const canSwitch =
        !isWIP || (await canSwitchShasWithWIP(datasource, repoId, fromSha));
      if (canSwitch) {
        if (currentRepoState.branch) {
          const branchState = await datasource.readBranch(
            repoId,
            currentRepoState.branch
          );
          await updateLocalBranch(
            datasource,
            repoId,
            branchState.name,
            fromSha,
            branchState.baseBranchId
          );
          const nextBranch = await datasource.readBranch(
            repoId,
            currentRepoState.branch
          );
          webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);
        } else {
          // BRANCHLESS CASE
          await updateCurrentCommitSHA(datasource, repoId, fromSha, false);
        }
        return await getApplicationState(datasource, repoId);
      }
      return null;
    }

    const canAutoMergeOnTopOfCurrentState =
      await getCanAutoMergeOnTopCurrentState(datasource, repoId, fromSha);
    if (canAutoCommitMergeStates && canAutoMergeOnTopOfCurrentState) {
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );

      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const currentDiff = getStateDiffFromCommitStates(
        unstagedState,
        currentKVState
      );

      const rebaseList = await getMergeRebaseCommitList(
        datasource,
        repoId,
        fromSha,
        user
      );
      if (rebaseList == null) {
        return null;
      }
      const finalCommit =
        rebaseList[rebaseList.length - 1] ??
        (await datasource.readCommit(
          repoId,
          divergenceOrigin?.basedOn == "from"
            ? fromSha
            : currentRepoState.commit
        ));
      for (let commitData of rebaseList) {
        const result = await datasource.saveCommit(
          repoId,
          commitData.sha,
          commitData
        );
        if (!result) {
          return null;
        }
      }
      if (currentRepoState.branch) {
        const branchState = await datasource.readBranch(
          repoId,
          currentRepoState.branch
        );
        const nextBranch = await datasource.saveBranch(repoId, currentRepoState.branch, {
          ...branchState,
          lastCommit: finalCommit.sha,
        });

        webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);

        const branchMetaState = await datasource.readBranchesMetaState(repoId);
        branchMetaState.allBranches = branchMetaState.allBranches.map(
          (branch) => {
            if (branch.branchId == branchState.id) {
              return {
                ...branch,
                lastLocalCommit: finalCommit.sha,
              };
            }
            return branch;
          }
        );

        branchMetaState.userBranches = branchMetaState.userBranches.map(
          (branch) => {
            if (branch.branchId == branchState.id) {
              return {
                ...branch,
                lastLocalCommit: finalCommit.sha,
              };
            }
            return branch;
          }
        );

        await datasource.saveBranchesMetaState(repoId, branchMetaState);
      }
      await updateCurrentCommitSHA(datasource, repoId, finalCommit.sha, false);
      const finalCommitState = await getCommitState(
        datasource,
        repoId,
        finalCommit.sha
      );
      if (!diffIsEmpty(currentDiff)) {
        const mergeCurrState = await getMergedCommitState(
          datasource,
          finalCommitState,
          currentKVState,
          intoCommitState
        );
        const currentAfterRestorationRendered =
          await convertCommitStateToRenderedState(datasource, mergeCurrState);
        const sanitizedCurrentAfterRestorationRendered =
          await sanitizeApplicationKV(
            datasource,
            currentAfterRestorationRendered
          );
        const state = await datasource.saveRenderedState(
          repoId,
          sanitizedCurrentAfterRestorationRendered
        );
        return state;
      } else {
        const renderedState = await convertCommitStateToRenderedState(
          datasource,
          finalCommitState
        );

        const sanitizedRenderedState = await sanitizeApplicationKV(
          datasource,
          renderedState
        );
        const state = await datasource.saveRenderedState(
          repoId,
          sanitizedRenderedState
        );
        return state;
      }
    } else {
      // CANNOT AUTO-MERGE CASE
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const currentDiff = getStateDiffFromCommitStates(
        unstagedState,
        currentKVState
      );
      if (!diffIsEmpty(currentDiff)) {
        // DO NOT ATTEMPT MERGE IF WIP AND HAS CONFLICTS
        return null;
      }

      const direction = "yours";
      const mergeState = await getMergedCommitState(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit,
        direction
      );
      const originSha = getMergeOriginSha(divergenceOrigin);

      const conflictList = await getConflictList(
        datasource,
        repoId,
        fromSha,
        currentRepoState.commit,
        originSha,
        direction
      );

      const updated: RepoState = {
        ...currentRepoState,
        isInMergeConflict: true,
        merge: {
          originSha,
          fromSha,
          intoSha: currentRepoState.commit,
          direction,
          mergeState,
          conflictList,
          returnCommandMode: "compare"
        },
        commandMode: "compare",
        comparison: {
          against: "merge",
          comparisonDirection: "forward",
          branch: null,
          commit: null,
          same: true,
        },
      };
      await datasource.saveCurrentRepoState(repoId, updated);
      const renderedState = await convertCommitStateToRenderedState(
        datasource,
        mergeState
      );
      const sanitizedRenderedState = await sanitizeApplicationKV(
        datasource,
        renderedState
      );
      await datasource.saveRenderedState(repoId, sanitizedRenderedState);
      return renderedState;
    }
  } catch (e) {
    return null;
  }
};

export const updateMergeDirection = async (
  datasource: DataSource,
  repoId: string,
  direction: "yours" | "theirs"
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState.isInMergeConflict) {
      return null;
    }
    const fromCommitState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.merge.fromSha
    );
    const intoCommitState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.merge.intoSha
    );
    const originCommitState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.merge.originSha
    );

    const mergeState = await getMergedCommitState(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommitState,
      direction
    );

    const conflictList = await getConflictList(
      datasource,
      repoId,
      currentRepoState.merge.fromSha,
      currentRepoState.merge.intoSha,
      currentRepoState.merge.originSha,
      direction
    );
    const updated: RepoState = {
      ...currentRepoState,
      isInMergeConflict: true,
      merge: {
        ...currentRepoState.merge,
        direction,
        conflictList,
        mergeState,
      },
    };
    await datasource.saveCurrentRepoState(repoId, updated);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      mergeState
    );
    const sanitizedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    return renderedState;
  } catch (e) {
    return null;
  }
};

export const abortMerge = async (datasource: DataSource, repoId: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState.isInMergeConflict) {
      return null;
    }
    if (currentRepoState.merge.returnCommandMode != "view") {
      const updated: RepoState = {
        ...currentRepoState,
        isInMergeConflict: false,
        merge: null,
        commandMode: "compare",
        comparison: {
          against: "wip",
          comparisonDirection: "forward",
          branch: null,
          commit: null,
          same: true,
        },
      };
      await datasource.saveCurrentRepoState(repoId, updated);
    } else {
      const updated: RepoState = {
        ...currentRepoState,
        isInMergeConflict: false,
        merge: null,
        commandMode: "view",
        comparison: null,
      };
      await datasource.saveCurrentRepoState(repoId, updated);
    }
    const appState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.commit
    );
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      appState
    );
    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
    return renderedState;
  } catch (e) {
    return null;
  }
};

export const resolveMerge = async (datasource: DataSource, repoId: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const user = await getUserAsync();
    if (!user?.id) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState.isInMergeConflict) {
      return null;
    }
    const fromSha = currentRepoState.merge.fromSha;
    const rebaseList = await getMergeRebaseCommitList(
      datasource,
      repoId,
      fromSha,
      user,
      false
    );

    if (rebaseList == null) {
      return null;
    }
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );

    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      currentRepoState.commit,
      fromSha,
    );
    const headCommit =
      divergenceOrigin.basedOn == "from"
        ? await datasource.readCommit(repoId, fromSha)
        : await datasource.readCommit(repoId, currentRepoState.commit);
    const finalCommit = rebaseList[rebaseList?.length - 1] ?? headCommit;

    const intoCommitState = await getCommitState(
      datasource,
      repoId,
      finalCommit?.originalSha ?? finalCommit?.sha
    );

    const mergeDiff = getStateDiffFromCommitStates(
      intoCommitState,
      currentKVState
    );
    const mergeBase = getMergeOriginSha(divergenceOrigin);
    const mergeCommit: CommitData = {
      parent: finalCommit.sha,
      historicalParent: finalCommit.sha,
      idx: finalCommit.idx + 1,
      message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
      mergeBase: mergeBase,
      userId: user.id,
      username: user.username,
      timestamp: new Date().toISOString(),
      diff: mergeDiff,
    };
    mergeCommit.sha = getDiffHash(mergeCommit);
    rebaseList.push(mergeCommit);
    for (let commitData of rebaseList) {
      const result = await datasource.saveCommit(
        repoId,
        commitData.sha,
        commitData
      );
      if (!result) {
        return null;
      }
    }

    if (currentRepoState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentRepoState.branch
      );
      const nextBranch = await datasource.saveBranch(repoId, currentRepoState.branch, {
        ...branchState,
        lastCommit: mergeCommit.sha,
      });
      webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);

      const branchMetaState = await datasource.readBranchesMetaState(repoId);
      branchMetaState.allBranches = branchMetaState.allBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = mergeCommit.sha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = mergeCommit.sha;
          }
          return branch;
        }
      );

      await datasource.saveBranchesMetaState(repoId, branchMetaState);
    }
    const repoState = await updateCurrentCommitSHA(
      datasource,
      repoId,
      mergeCommit.sha,
      true
    );
    if (currentRepoState.merge.returnCommandMode != "view") {
      const updated: RepoState = {
        ...repoState,
        isInMergeConflict: false,
        merge: null,
        commandMode: "compare",
        comparison: {
          against: "wip",
          comparisonDirection: "forward",
          branch: null,
          commit: null,
          same: true,
        },
      };
      await datasource.saveCurrentRepoState(repoId, updated);
    } else {
      const updated: RepoState = {
        ...repoState,
        isInMergeConflict: false,
        merge: null,
        commandMode: "view",
        comparison: null,
      };
      await datasource.saveCurrentRepoState(repoId, updated);
    }
    return currentAppState;
  } catch (e) {
    return null;
  }
};

export const hasMergeConflictDiff = async (
  datasource: DataSource,
  repoId: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const mergeDiff = await getMergeConflictDiff(datasource, repoId);
    if (!mergeDiff) {
      return false;
    }
    return !diffIsEmpty(mergeDiff);
  } catch (e) {
    return null;
  }
};

export const getCanStash = async (datasource: DataSource, repoId: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const currentDiff = getStateDiffFromCommitStates(
      unstagedState,
      currentKVState
    );

    if (diffIsEmpty(currentDiff)) {
      return false;
    }
    return true;
  } catch (e) {
    return null;
  }
};

export const stashChanges = async (datasource: DataSource, repoId: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const currentDiff = getStateDiffFromCommitStates(
      unstagedState,
      currentKVState
    );
    if (diffIsEmpty(currentDiff)) {
      return null;
    }
    const stashList =
      (await datasource.readStash(repoId, currentRepoState)) ?? [];
    stashList?.push(currentKVState);
    await datasource.saveStash(repoId, currentRepoState, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unstagedState
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    return await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
  } catch (e) {
    return null;
  }
};

export const getStashSize = async (datasource: DataSource, repoId: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const stashList = await datasource.readStash(repoId, currentRepoState);
    return stashList.length;
  } catch (e) {
    return null;
  }
};

export const getCanPopStashedChanges = async (
  datasource: DataSource,
  repoId: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const stashList = await datasource.readStash(repoId, currentRepoState);
    if (stashList.length == 0) {
      return false;
    }
    const topChanges = stashList.pop();
    const canPop = await canAutoMergeCommitStates(
      datasource,
      topChanges, // theirs
      currentKVState, // yours
      unstagedState // origin
    );
    return canPop;
  } catch (e) {
    return null;
  }
};

export const popStashedChanges = async (
  datasource: DataSource,
  repoId: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const stashList = await datasource.readStash(repoId, currentRepoState);
    if (stashList.length == 0) {
      return null;
    }
    const topChanges = stashList.pop();
    const canPop = await canAutoMergeCommitStates(
      datasource,
      topChanges, // theirs
      currentKVState, // yours
      unstagedState // origin
    );
    if (!canPop) {
      return null;
    }

    const appliedStash = await getMergedCommitState(
      datasource,
      topChanges, // theirs
      currentKVState, // yours
      unstagedState // origin
    );
    await datasource.saveStash(repoId, currentRepoState, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      appliedStash
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    return await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
  } catch (e) {
    return null;
  }
};

export const applyStashedChange = async (
  datasource: DataSource,
  repoId: string,
  index: number
) => {
  if (!repoId) {
    return null;
  }
  if (index === undefined) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );

    // we have to test for merge conflict here
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const stashList = await datasource.readStash(repoId, currentRepoState);
    if (stashList.length == 0) {
      return null;
    }
    const change = stashList[index];
    if (!change) {
      {
        return null;
      }
    }
    stashList.splice(index, 1);
    const canPop = await canAutoMergeCommitStates(
      datasource,
      change, // theirs
      currentKVState, // yours
      unstagedState // origin
    );
    if (!canPop) {
      return null;
    }

    const appliedStash = await getMergedCommitState(
      datasource,
      change, // theirs
      currentKVState, // yours
      unstagedState // origin
    );
    await datasource.saveStash(repoId, currentRepoState, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      appliedStash
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    return await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
  } catch (e) {
    return null;
  }
};

export const discardCurrentChanges = async (
  datasource: DataSource,
  repoId: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    // we have to test for merge conflict here
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unstagedState
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    return await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
  } catch (e) {
    return null;
  }
};

export const canSwitchShasWithWIP = async (
  datasource: DataSource,
  repoId: string,
  toSha?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!toSha) {
    return true;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  if (!toSha) {
    return false;
  }
  try {
    const fromSha = await getCurrentCommitSha(datasource, repoId);
    if (fromSha == toSha) {
      return true;
    }
    const toState = await getCommitState(datasource, repoId, toSha);
    if (!toState) {
      return false;
    }

    const repoState = await datasource.readCurrentRepoState(repoId);
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );

    const isWIP = await getIsWip(
      datasource,
      repoId,
      repoState,
      unstagedState,
      currentKVState
    );
    if (!isWIP) {
      return true;
    }

    return await canAutoMergeCommitStates(
      datasource,
      toState, // theirs
      currentKVState, // yours
      unstagedState // origin
    );
  } catch (e) {
    return null;
  }
};

export const getCanRevert = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string,
  user: User
) => {
  if (!repoId) {
    return false;
  }
  if (!reversionSha) {
    return false;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return false;
  }
  try {
    if (!user?.id) {
      return false;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return false;
    }
    if (!currentRepoState.commit) {
      return false;
    }
    const history = await getHistory(
      datasource,
      repoId,
      currentRepoState.commit
    );
    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    const isInHistory = history.reduce((isInHist, commit) => {
      if (isInHist) {
        return true;
      }
      return commit.sha == reversionSha;
    }, false);
    if (!commitToRevert || !isInHistory) {
      return false;
    }
    let currentCommitInfo = history[0];
    let index = 0;
    while (
      index < history.length &&
      currentCommitInfo &&
      currentCommitInfo.idx >= commitToRevert?.idx
    ) {
      if (currentCommitInfo?.revertFromSha && currentCommitInfo?.revertToSha) {
        const revertFrom = await datasource.readCommit(
          repoId,
          currentCommitInfo?.revertFromSha
        );
        const revertTo = await datasource.readCommit(
          repoId,
          currentCommitInfo?.revertToSha
        );
        if (
          commitToRevert?.idx <= revertFrom.idx &&
          commitToRevert?.idx >= revertTo.idx
        ) {
          return false;
        }
      }
      currentCommitInfo = history[++index];
    }
    return true;
  } catch (e) {}
};

export const getReversionCommit = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string,
  user: User
): Promise<CommitData> => {
  try {
    if (!(await getCanRevert(datasource, repoId, reversionSha, user))) {
      return null;
    }
    if (!user?.id) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    if (!currentRepoState.commit) {
      return null;
    }

    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    const commitBeforeReversion = await datasource?.readCommit(
      repoId,
      commitToRevert?.parent
    );
    const shaBeforeReversion = commitBeforeReversion?.sha ?? null;
    const reversionState = await getCommitState(
      datasource,
      repoId,
      shaBeforeReversion
    );
    const currentCommit = await datasource.readCommit(
      repoId,
      currentRepoState.commit
    );

    const reversionDiff = getStateDiffFromCommitStates(
      unstagedState,
      reversionState
    );

    const revertCommit: CommitData = {
      parent: currentCommit.sha,
      historicalParent: currentCommit.sha,
      idx: currentCommit.idx + 1,
      message: `Revert [${reversionSha}]: (message) ${commitToRevert.message}`,
      userId: user.id,
      username: user.username,
      authorUserId: commitToRevert.authorUserId,
      authorUsername: commitToRevert.authorUsername,
      timestamp: new Date().toISOString(),
      diff: reversionDiff,
      revertFromSha: reversionSha,
      revertToSha: currentCommit.sha,
    };
    revertCommit.sha = getDiffHash(revertCommit);
    return revertCommit;
  } catch (e) {
    return null;
  }
};

export const revertCommit = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string
) => {
  if (!repoId) {
    return null;
  }
  if (!reversionSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const user = await getUserAsync();
    if (!user?.id) {
      return null;
    }
    if (!(await getCanRevert(datasource, repoId, reversionSha, user))) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    if (!currentRepoState.commit) {
      return null;
    }

    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    const commitBeforeReversion = await datasource?.readCommit(
      repoId,
      commitToRevert?.parent
    );
    const shaBeforeReversion = commitBeforeReversion?.sha ?? null;
    const reversionState = await getCommitState(
      datasource,
      repoId,
      shaBeforeReversion
    );
    const revertCommit: CommitData = await getReversionCommit(
      datasource,
      repoId,
      reversionSha,
      user
    );
    if (!revertCommit) {
      return null;
    }
    await datasource.saveCommit(repoId, revertCommit.sha, revertCommit);
    if (currentRepoState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentRepoState.branch
      );
      await datasource.saveBranch(repoId, currentRepoState.branch, {
        ...branchState,
        lastCommit: revertCommit.sha,
      });
      const branchMetaState = await datasource.readBranchesMetaState(repoId);
      branchMetaState.allBranches = branchMetaState.allBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            return {
              ...branch,
              lastLocalCommit: revertCommit.sha,
            };
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            return {
              ...branch,
              lastLocalCommit: revertCommit.sha,
            };
          }
          return branch;
        }
      );
      await datasource.saveBranchesMetaState(repoId, branchMetaState);
    }
    await updateCurrentCommitSHA(datasource, repoId, revertCommit.sha, false);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      reversionState
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    const state = datasource.saveRenderedState(repoId, sanitiziedRenderedState);
    return state;
  } catch (e) {
    return null;
  }
};

export const getCanAutofixReversionIfNotWIP = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string,
  user: User
) => {
  if (!repoId) {
    return null;
  }
  if (!reversionSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    if (!currentRepoState.commit) {
      return null;
    }

    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );

    const history = await getHistory(
      datasource,
      repoId,
      currentRepoState.commit
    );
    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    const isInHistory = history.reduce((isInHist, commit) => {
      if (isInHist) {
        return true;
      }
      return commit.sha == reversionSha;
    }, false);
    if (!commitToRevert || !isInHistory) {
      return false;
    }
    const commitBeforeReversion = await datasource?.readCommit(
      repoId,
      commitToRevert?.parent
    );
    const shaBeforeReversion = commitBeforeReversion?.sha ?? null;
    const beforeReversionState = await getCommitState(
      datasource,
      repoId,
      shaBeforeReversion
    );
    const reversionState = await getCommitState(
      datasource,
      repoId,
      reversionSha
    );

    const canAutoFix = await canAutoMergeCommitStates(
      datasource,
      currentKVState, // yours
      beforeReversionState, // theirs
      reversionState // origin
    );
    return canAutoFix;
  } catch (e) {
    return null;
  }
};

export const getCanAutofixReversion = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string,
  user: User
) => {
  if (!repoId) {
    return null;
  }
  if (!reversionSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    if (!user?.id) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    if (!currentRepoState.commit) {
      return null;
    }

    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const currentDiff = getStateDiffFromCommitStates(
      unstagedState,
      currentKVState
    );
    if (!diffIsEmpty(currentDiff)) {
      return false;
    }
    const history = await getHistory(
      datasource,
      repoId,
      currentRepoState.commit
    );
    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    const isInHistory = history.reduce((isInHist, commit) => {
      if (isInHist) {
        return true;
      }
      return commit.sha == reversionSha;
    }, false);
    if (!commitToRevert || !isInHistory) {
      return false;
    }
    const commitBeforeReversion = await datasource?.readCommit(
      repoId,
      commitToRevert?.parent
    );
    const shaBeforeReversion = commitBeforeReversion?.sha ?? null;
    const beforeReversionState = await getCommitState(
      datasource,
      repoId,
      shaBeforeReversion
    );
    const reversionState = await getCommitState(
      datasource,
      repoId,
      reversionSha
    );

    const canAutoFix = await canAutoMergeCommitStates(
      datasource,
      currentKVState, // yours
      beforeReversionState, // theirs
      reversionState // origin
    );
    return canAutoFix;
  } catch (e) {
    return null;
  }
};

export const getAutoFixCommit = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string,
  user: User
): Promise<CommitData> => {
  if (!repoId) {
    return null;
  }
  if (!reversionSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    if (!user?.id) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    if (!currentRepoState.commit) {
      return null;
    }

    const currentKVState = await getUnstagedCommitState(datasource, repoId);
    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    const commitBeforeReversion = await datasource?.readCommit(
      repoId,
      commitToRevert?.parent
    );
    const shaBeforeReversion = commitBeforeReversion?.sha ?? null;
    const beforeReversionState = await getCommitState(
      datasource,
      repoId,
      shaBeforeReversion
    );
    const reversionState = await getCommitState(
      datasource,
      repoId,
      reversionSha
    );

    const canAutoFix = await canAutoMergeCommitStates(
      datasource,
      currentKVState, //theirs
      beforeReversionState, //yours
      reversionState //origin
    );
    if (!canAutoFix) {
      return null;
    }

    const autoFixState = await getMergedCommitState(
      datasource,
      currentKVState, //theirs
      beforeReversionState, //yours
      reversionState //origin
    );

    const currentCommit = await datasource.readCommit(
      repoId,
      currentRepoState.commit
    );

    const autofixDiff = getStateDiffFromCommitStates(
      currentKVState,
      autoFixState
    );

    const autofixCommit: CommitData = {
      parent: currentCommit.sha,
      historicalParent: currentCommit.sha,
      idx: currentCommit.idx + 1,
      message: `Fix-Forward [${reversionSha}]: (message) ${commitToRevert.message}`,
      userId: user.id,
      username: user.username,
      authorUserId: commitToRevert.authorUserId,
      authorUsername: commitToRevert.authorUsername,
      timestamp: new Date().toISOString(),
      diff: autofixDiff,
    };
    autofixCommit.sha = getDiffHash(autofixCommit);
    return autofixCommit;
  } catch (e) {
    return null;
  }
};

export const autofixReversion = async (
  datasource: DataSource,
  repoId: string,
  reversionSha: string
) => {
  if (!repoId) {
    return null;
  }
  if (!reversionSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const user = await getUserAsync();
    if (!user?.id) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.isInMergeConflict) {
      return null;
    }
    if (!currentRepoState.commit) {
      return null;
    }

    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const currentDiff = getStateDiffFromCommitStates(
      unstagedState,
      currentKVState
    );
    if (!diffIsEmpty(currentDiff)) {
      return null;
    }
    const canAutoFixWithoutWip = await getCanAutofixReversionIfNotWIP(
      datasource,
      repoId,
      reversionSha,
      user
    );
    if (!canAutoFixWithoutWip) {
      return null;
    }
    const commitToRevert = await datasource.readCommit(repoId, reversionSha);
    if (!commitToRevert) {
      return null;
    }
    const commitBeforeReversion = await datasource?.readCommit(
      repoId,
      commitToRevert?.parent
    );
    const shaBeforeReversion = commitBeforeReversion?.sha ?? null;
    const beforeReversionState = await getCommitState(
      datasource,
      repoId,
      shaBeforeReversion
    );
    const reversionState = await getCommitState(
      datasource,
      repoId,
      reversionSha
    );

    const canAutoFix = await canAutoMergeCommitStates(
      datasource,
      currentKVState, //theirs
      beforeReversionState, //yours
      reversionState //origin
    );
    if (!canAutoFix) {
      return null;
    }

    const autoFixState = await getMergedCommitState(
      datasource,
      currentKVState, //theirs
      beforeReversionState, //yours
      reversionState //origin
    );

    const autofixCommit: CommitData = await getAutoFixCommit(
      datasource,
      repoId,
      reversionSha,
      user
    );
    if (!autofixCommit) {
      return null;
    }

    await datasource.saveCommit(repoId, autofixCommit.sha, autofixCommit);
    if (currentRepoState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentRepoState.branch
      );
      await datasource.saveBranch(repoId, currentRepoState.branch, {
        ...branchState,
        lastCommit: autofixCommit.sha,
      });
      const branchMetaState = await datasource.readBranchesMetaState(repoId);
      branchMetaState.allBranches = branchMetaState.allBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = autofixCommit.sha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = autofixCommit.sha;
          }
          return branch;
        }
      );
      await datasource.saveBranchesMetaState(repoId, branchMetaState);
    }
    await updateCurrentCommitSHA(datasource, repoId, autofixCommit.sha, false);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      autoFixState
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    const state = await datasource.saveRenderedState(
      repoId,
      sanitiziedRenderedState
    );
    return state;
  } catch (e) {
    return null;
  }
};

export const cherryPickRevision = async (
  datasource: DataSource,
  repoId: string,
  cherryPickedSha: string
) => {
  if (!repoId) {
    return null;
  }
  if (!cherryPickedSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource?.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const cherryPickedCommit = await datasource.readCommit(
      repoId,
      cherryPickedSha
    );

    if (cherryPickedSha == currentRepoState.commit) {
      return null;
    }

    if (!cherryPickedCommit) {
      return null;
    }

    const beforeCherryPickedSha = cherryPickedCommit?.parent ?? null;

    const cherryPickedState = await getCommitState(
      datasource,
      repoId,
      cherryPickedSha
    );
    const beforeCherryPickedState = await getCommitState(
      datasource,
      repoId,
      beforeCherryPickedSha
    );

    const canCherryPick = await canAutoMergeCommitStates(
      datasource,
      cherryPickedState,
      currentKVState,
      beforeCherryPickedState
    );

    if (!canCherryPick) {
      return null;
    }

    const updatedState = await getMergedCommitState(
      datasource,
      cherryPickedState, // yours
      currentKVState, // theirs
      beforeCherryPickedState // origin
    );

    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      updatedState
    );
    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    return await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
  } catch (e) {
    return null;
  }
};

export const getCanCherryPickRevision = async (
  datasource: DataSource,
  repoId: string,
  cherryPickedSha: string
) => {
  if (!repoId) {
    return null;
  }
  if (!cherryPickedSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource?.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const cherryPickedCommit = await datasource.readCommit(
      repoId,
      cherryPickedSha
    );
    if (!cherryPickedCommit) {
      return false;
    }

    if (cherryPickedSha == currentRepoState.commit) {
      return false;
    }
    const beforeCherryPickedSha = cherryPickedCommit?.parent ?? null;

    const cherryPickedState = await getCommitState(
      datasource,
      repoId,
      cherryPickedSha
    );
    const beforeCherryPickedState = await getCommitState(
      datasource,
      repoId,
      beforeCherryPickedSha
    );

    const canCherryPick = await canAutoMergeCommitStates(
      datasource,
      cherryPickedState, // yours
      currentKVState, // theirs
      beforeCherryPickedState // origin
    );
    if (!canCherryPick) {
      return false;
    }

    const updatedState = await getMergedCommitState(
      datasource,
      cherryPickedState, // yours
      currentKVState, // theirs
      beforeCherryPickedState // origin
    );

    if (JSON.stringify(updatedState) == JSON.stringify(currentKVState)) {
      return false;
    }

    return canCherryPick;
  } catch (e) {
    return null;
  }
};

export const getCanAmendRevision = async (
  datasource: DataSource,
  repoId: string,
  amendSha: string
): Promise<boolean> => {
  if (!repoId) {
    return null;
  }
  if (!amendSha) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return false;
  }
  try {
    const user = await getUserAsync();
    if (!user?.id) {
      return false;
    }
    const repoState = await datasource.readCurrentRepoState(repoId);
    const amendCommit = await datasource.readCommit(repoId, amendSha);
    if (!amendCommit) {
      return false;
    }

    const history = await getHistory(datasource, repoId, repoState.commit);

    for (let i = 0; i < history.length; ++i) {
      if (history[i].sha == amendCommit.sha) {
        return true;
      }
    }
    return false;
  } catch (e) {
    return false;
  }
};
export const amendRevision = async (
  datasource: DataSource,
  repoId: string,
  amendSha: string,
  message: string
) => {
  if (!repoId) {
    return null;
  }
  if (!amendSha) {
    return null;
  }
  if (!message || message.trim() == "") {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  const canAmend = await getCanAmendRevision(datasource, repoId, amendSha);
  if (!canAmend) {
    return null;
  }
  const user = await getUserAsync();
  if (!user?.id) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const amendCommit = await datasource.readCommit(repoId, amendSha);
    if (!amendCommit) {
      return false;
    }

    let currentCommit: CommitData = await datasource.readCommit(
      repoId,
      currentRepoState.commit
    );

    const commitsToReWrite = [];
    while (currentCommit && currentCommit.parent != amendCommit.parent) {
      commitsToReWrite.unshift(currentCommit);
      currentCommit = await datasource.readCommit(
        repoId,
        currentCommit?.parent
      );
    }

    if (!currentCommit) {
      return null;
    }

    const amendedCommit: CommitData = {
      ...amendCommit,
      message,
    };
    amendedCommit.sha = getDiffHash(amendedCommit);
    const ammendCommit = await datasource.saveCommit(
      repoId,
      amendedCommit.sha,
      amendedCommit
    );
    if (!ammendCommit) {
      return null;
    }
    let lastAmendSha = amendedCommit.sha;
    for (const commitToAmend of commitsToReWrite) {
      const downstreamAmendedCommit: CommitData = {
        ...commitToAmend,
        parent: lastAmendSha,
      };
      downstreamAmendedCommit.sha = getDiffHash(downstreamAmendedCommit);
      const commit = await datasource.saveCommit(
        repoId,
        downstreamAmendedCommit.sha,
        downstreamAmendedCommit
      );
      lastAmendSha = downstreamAmendedCommit.sha;
      if (!commit) {
        return null;
      }
    }

    if (currentRepoState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentRepoState.branch
      );
      await datasource.saveBranch(repoId, currentRepoState.branch, {
        ...branchState,
        lastCommit: lastAmendSha,
      });
      const branchMetaState = await datasource.readBranchesMetaState(repoId);
      branchMetaState.allBranches = branchMetaState.allBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = lastAmendSha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = lastAmendSha;
          }
          return branch;
        }
      );
      await datasource.saveBranchesMetaState(repoId, branchMetaState);
    }
    await updateCurrentCommitSHA(datasource, repoId, lastAmendSha, false);
    const currentAppState = await getApplicationState(datasource, repoId);
    return await convertRenderedCommitStateToKv(datasource, currentAppState);
  } catch (e) {
    return null;
  }
};

export const rollbackCommit = async (
  datasource: DataSource,
  repoId: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const currentDiff = getStateDiffFromCommitStates(
      unstagedState,
      currentKVState
    );
    if (!diffIsEmpty(currentDiff)) {
      return null;
    }

    const currentCommit = await datasource.readCommit(
      repoId,
      currentRepoState.commit
    );
    const rollbackSha =
      currentCommit?.mergeBase ?? currentCommit?.parent ?? null;
    const parentKVState = await getCommitState(datasource, repoId, rollbackSha);

    if (currentRepoState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentRepoState.branch
      );
      await datasource.saveBranch(repoId, currentRepoState.branch, {
        ...branchState,
        lastCommit: rollbackSha,
      });

      const branchMetaState = await datasource.readBranchesMetaState(repoId);
      branchMetaState.allBranches = branchMetaState.allBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = rollbackSha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = rollbackSha;
          }
          return branch;
        }
      );
      await datasource.saveBranchesMetaState(repoId, branchMetaState);
    }
    await updateCurrentCommitSHA(datasource, repoId, rollbackSha, false);

    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      parentKVState
    );
    const sanitizedRenderedState = await sanitizeApplicationKV(
      datasource,
      renderedState
    );
    return await datasource.saveRenderedState(repoId, sanitizedRenderedState);
  } catch (e) {
    return null;
  }
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

    let same = false;
    if (current.comparison) {
      if (current.comparison.against == "branch") {
        const comparingBranch = await datasource.readBranch(
          repoId,
          current.branch
        );
        same = comparingBranch?.lastCommit == sha;
      } else if (current.comparison.against == "sha") {
        same = current.comparison.commit == sha;
      } else {
        same = true;
      }
    }
    const updated: RepoState = {
      ...current,
      commit: sha,
      isInMergeConflict: false,
      merge: null,
      comparison: current?.comparison
        ? {
            ...current?.comparison,
            same,
          }
        : null,
    };

    const currentRenderedState = await getApplicationState(datasource, repoId);
    const currentApplicationKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentRenderedState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const unrenderedState = await getCommitState(datasource, repoId, sha);

    const canMergeWIP = await canAutoMergeCommitStates(
      datasource,
      currentApplicationKVState,
      unrenderedState,
      unstagedState
    );
    if (!canMergeWIP) {
      return null;
    }
    const nextShaWIPState = await getMergedCommitState(
      datasource,
      currentApplicationKVState,
      unrenderedState,
      unstagedState
    );

    const nextState = await datasource.saveCurrentRepoState(repoId, updated);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      nextShaWIPState
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

    const currentRenderedState = await getApplicationState(datasource, repoId);
    const currentApplicationKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentRenderedState
    );
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const unrenderedState = await getCommitState(datasource, repoId, sha);
    const isWIP =
      unstagedState &&
      (await getIsWip(
        datasource,
        repoId,
        current,
        unstagedState,
        currentApplicationKVState
      ));

    if (isWIP) {
      const canMergeWIP = await canAutoMergeCommitStates(
        datasource,
        currentApplicationKVState,
        unrenderedState,
        unstagedState
      );
      if (!canMergeWIP) {
        return null;
      }

      const nextShaWIPState = await getMergedCommitState(
        datasource,
        currentApplicationKVState,
        unrenderedState,
        unstagedState
      );

      const nextState = await datasource.saveCurrentRepoState(repoId, updated);
      const renderedState = await convertCommitStateToRenderedState(
        datasource,
        nextShaWIPState
      );
      await datasource.saveRenderedState(repoId, renderedState);
      return nextState;
    }

    const nextState = await datasource.saveCurrentRepoState(repoId, updated);
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

export const getPluginClientStorage = async(datasource: DataSource, repoId: string, pluginIds: string[]) => {
  const out = {};
  for (const pluginId of pluginIds) {
    out[pluginId] = await datasource.readPluginClientStorage(repoId, pluginId);
  }
  return out;
}

export const renderStashResponse =async (
  repoId: string,
  datasource: DataSource
) => {
  const [canPopStashedChanges, stashSize] = await Promise.all([
    getCanPopStashedChanges(datasource, repoId),
    getStashSize(datasource, repoId),
  ]);
  return {
    canPopStashedChanges,
    stashSize
  }
}

export const renderApiReponse = async (
  repoId: string,
  datasource: DataSource,
  renderedApplicationState: RenderedApplicationState,
  applicationKVState: ApplicationKVState,
  repoState: RepoState
): Promise<ApiResponse> => {
  const [
    apiStoreInvalidity,
    manifests,
    branch,
    lastCommit,
    mergeCommit,
    checkedOutBranchIds,
  ] = await Promise.all([
    getInvalidStates(datasource, applicationKVState),
    getPluginManifests(datasource, renderedApplicationState?.plugins),
    getBranchFromRepoState(repoId, datasource, repoState),
    getLastCommitFromRepoState(repoId, datasource, repoState),
    repoState?.isInMergeConflict
      ? await datasource.readCommit(repoId, repoState?.merge.fromSha)
      : null,
    getCheckoutBranchIds(datasource, repoId),
  ]);
  const baseBranch = await getBaseBranchFromBranch(repoId, datasource, branch);
  const schemaMap = manifestListToSchemaMap(manifests);

  const binaryToken = binarySession.token;

  if (repoState?.commandMode == "edit") {
    const storageMap = await getPluginClientStorage(
      datasource,
      repoId,
      renderedApplicationState.plugins.map((kv) => kv.key)
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

    const [canPopStashedChanges, stashSize] = await Promise.all([
      getCanPopStashedChanges(datasource, repoId),
      getStashSize(datasource, repoId),
    ]);
    return {
      apiStoreInvalidity,
      repoState,
      applicationState: renderedApplicationState,
      kvState: applicationKVState,
      schemaMap,
      branch,
      baseBranch,
      lastCommit,
      isWIP,
      canPopStashedChanges,
      stashSize,
      mergeCommit,
      checkedOutBranchIds,
      binaryToken,
      storageMap
    };
  }

  if (repoState?.commandMode == "view") {
    const storageMap = await getPluginClientStorage(
      datasource,
      repoId,
      renderedApplicationState.plugins.map((kv) => kv.key)
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
    return {
      apiStoreInvalidity,
      repoState,
      applicationState: renderedApplicationState,
      kvState: applicationKVState,
      schemaMap,
      branch,
      baseBranch,
      lastCommit,
      isWIP,
      mergeCommit,
      checkedOutBranchIds,
      binaryToken,
      storageMap
    };
  }
  if (repoState?.commandMode == "compare") {
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
    const {
      apiDiff,
      diff,
      beforeState,
      beforeKvState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      divergenceOrigin,
      divergenceSha,
    } = await getApiDiffFromComparisonState(
      repoId,
      datasource,
      repoState,
      applicationKVState
    );
    const storageMap = await getPluginClientStorage(
      datasource,
      repoId,
      Array.from(
        new Set([
          ...renderedApplicationState.plugins.map((kv) => kv.key),
          ...beforeState.plugins.map((kv) => kv.key),
        ])
      )
    );

    const conflictResolution = repoState?.isInMergeConflict
      ? getConflictResolution(diff, repoState?.merge?.conflictList)
      : null;

    if (repoState.comparison.comparisonDirection == "backward") {
      return {
        apiStoreInvalidity: beforeApiStoreInvalidity,
        repoState,
        applicationState: beforeState,
        kvState: beforeKvState,
        beforeKvState: applicationKVState,
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
        mergeCommit,
        checkedOutBranchIds,
        binaryToken,
        divergenceOrigin,
        divergenceSha,
        storageMap
      };
    }
    return {
      apiStoreInvalidity,
      repoState,
      applicationState: renderedApplicationState,
      kvState: applicationKVState,
      schemaMap,
      branch,
      baseBranch,
      lastCommit,
      isWIP,
      apiDiff,
      beforeState,
      beforeKvState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
      mergeCommit,
      conflictResolution,
      checkedOutBranchIds,
      binaryToken,
      divergenceOrigin,
      divergenceSha,
      storageMap
    };
  }
  return null;
};

export const renderSourceGraphInputs = async (
  repoId: string,
  datasource: DataSource
): Promise<SourceGraphResponse> => {
  try {
    const [commits, branches, branchesMetaState, repoState] = await Promise.all(
      [
        datasource.readCommits(repoId),
        datasource.readBranches(repoId),
        datasource.readBranchesMetaState(repoId),
        datasource.readCurrentRepoState(repoId),
      ]
    );
    return {
      commits,
      branches,
      branchesMetaState,
      repoState,
    };
  } catch (e) {
    return null;
  }
};

export const changeCommandMode = async (
  datasource: DataSource,
  repoId: string,
  commandMode: "view" | "edit" | "compare"
) => {
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const nextRepoState: RepoState = {
      ...currentRepoState,
      commandMode,
      comparison:
        commandMode == "compare"
          ? getDefaultComparison(currentRepoState)
          : null,
    };
    await datasource.saveCurrentRepoState(repoId, nextRepoState);
    return nextRepoState;
  } catch (e) {
    return null;
  }
};

export const updateComparison = async (
  datasource: DataSource,
  repoId: string,
  against: "wip" | "branch" | "sha",
  branchId?: string | null,
  sha?: string | null
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
          same: true,
        },
      };
      return await datasource.saveCurrentRepoState(repoId, nextRepoState);
    }
    if (against == "branch") {
      const comparisonDirection = await getComparisonDirection(
        datasource,
        repoId,
        against,
        branchId
      );
      const branch = await datasource.readBranch(repoId, branchId);
      const currentSha = await getCurrentCommitSha(datasource, repoId);
      const nextRepoState: RepoState = {
        ...currentRepoState,
        comparison: {
          against,
          comparisonDirection,
          branch: branchId ?? null,
          commit: null,
          same: branch?.lastCommit == currentSha,
        },
      };
      return await datasource.saveCurrentRepoState(repoId, nextRepoState);
    }
    if (against == "sha") {
      const currentSha = await getCurrentCommitSha(datasource, repoId);
      const comparisonDirection = await getComparisonDirection(
        datasource,
        repoId,
        against,
        null,
        sha
      );
      const nextRepoState: RepoState = {
        ...currentRepoState,
        comparison: {
          against,
          comparisonDirection,
          branch: null,
          commit: sha ?? null,
          same: sha == currentSha,
        },
      };
      return await datasource.saveCurrentRepoState(repoId, nextRepoState);
    }
    return null;
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
  fromSha: string
) => {
  try {
    const currentRenderedState = await datasource.readRenderedState(repoId);
    const currentAppKVstate = await convertRenderedCommitStateToKv(
      datasource,
      currentRenderedState
    );
    const repoState = await datasource.readCurrentRepoState(repoId);
    const fromState = await getCommitState(datasource, repoId, fromSha);
    const { originCommit } = await getMergeCommitStates(
      datasource,
      repoId,
      repoState.commit,
      fromSha
    );
    return await canAutoMergeCommitStates(
      datasource,
      currentAppKVstate,
      fromState,
      originCommit
    );
  } catch (e) {
    return null;
  }
};
export const getIsMerged = async (
  datasource: DataSource,
  repoId: string,
  intoSha: string,
  fromSha: string
) => {
  try {
    const currentUser = await getUserAsync();
    const rebaseList = await getMergeRebaseCommitList(datasource, repoId, fromSha, currentUser, false);
    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      intoSha,
      fromSha
    );
    const divergenceSha: string = getMergeOriginSha(divergenceOrigin) as string;
    if (rebaseList.length > 0) {
      return false;
    }

    const { originCommit } = await getMergeCommitStates(
      datasource,
      repoId,
      intoSha,
      fromSha
    );
    const currentRenderedState = await datasource.readRenderedState(repoId);
    const currentAppKVstate = await convertRenderedCommitStateToKv(
      datasource,
      currentRenderedState
    );

    const fromState = await getCommitState(datasource, repoId, fromSha);
    const canAutoMerge = await canAutoMergeCommitStates(
      datasource,
      currentAppKVstate,
      fromState,
      originCommit
    )
    if (canAutoMerge) {
      if (intoSha != divergenceSha) {
        return false;
      }
      return true;
    }
    return false;
  } catch (e) {
    return null;
  }
};

export const getApplicationState = async (
  datasource: DataSource,
  repoId: string
): Promise<RenderedApplicationState> => {
  return await datasource.readRenderedState(repoId);
};

export const isRenderedStateValid = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<boolean> => {

  const seenPlugins = new Set();
  for (const { key } of renderedAppState.plugins ?? []) {
    if (seenPlugins.has(key)) {
      return false;
    }
    seenPlugins.add(key);
  }

  const seenLicenses = new Set();
  for (const { key } of renderedAppState.licenses) {
    if (seenLicenses.has(key)) {
      return false;
    }
    seenLicenses.add(key);
  }

  const indexedKvStore =
    await convertRenderedStateStoreToArrayDuplicateIndexedKV(
      datasource,
      renderedAppState
    );
  for (const pluginName in indexedKvStore) {
    const indexedKV = indexedKvStore[pluginName];
    const seenKeys = new Set();
    for (const { key } of indexedKV) {
      if (seenKeys.has(key)) {
        return false;
      }
      seenKeys.add(key);
    }
  }
  return true;
}

// DO NOT CACHE!
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

export const convertRenderedStateStoreToKV = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<RawStore> => {
  let out = {};
  const manifests = await getPluginManifests(
    datasource,
    renderedAppState.plugins
  );
  const key = LRCache.getCacheKey(["convertRenderedStateStoreToKV", renderedAppState, manifests]);
  const cached = lrcache.get<RawStore>(key)
  if (cached) {
    return cached.unwrapCopy();
  }
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
  lrcache.set(key, out);
  return out;
};

export const convertRenderedStateStoreToArrayDuplicateIndexedKV = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<{[pluginName: string]: Array<DiffElement>}> => {
  let out = {};
  const manifests = await getPluginManifests(
    datasource,
    renderedAppState.plugins
  );
  const key = LRCache.getCacheKey(["convertRenderedStateStoreToArrayDuplicateIndexedKV", renderedAppState, manifests]);
  const cached = lrcache.get<{[pluginName: string]: Array<DiffElement>}>(key)
  if (cached) {
    return cached.unwrapCopy();
  }
  for (const pluginManifest of manifests) {
    const schemaMap = await getSchemaMapForManifest(datasource, pluginManifest);
    const kvs = await getKVStateForPlugin(
      datasource,
      schemaMap,
      pluginManifest.name,
      renderedAppState.store
    );

    const kvCopy = kvs.map(kv => ({key: kv.key, value: Object.assign({}, kv.value)}));
    const kvArray = indexArrayDuplicates(kvCopy);
    out[pluginManifest.name] = kvArray;
  }
  lrcache.set(key, out);
  return out;
};

export const sanitizeApplicationKV = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<RenderedApplicationState> => {
  const unrendered = await convertRenderedCommitStateToKv(
    datasource,
    renderedAppState
  );
  const rendered = await convertCommitStateToRenderedState(
    datasource,
    unrendered
  );
  rendered.plugins = uniqueKVObj(rendered.plugins);
  rendered.licenses = uniqueKVObj(rendered.licenses);
  rendered.binaries = uniqueStrings(rendered.binaries);

  const manifests = await getPluginManifests(datasource, rendered.plugins);
  const schemaMap = manifestListToSchemaMap(manifests);
  const store = await defaultVoidedState(datasource, schemaMap, rendered.store);
  rendered.store = store;
  return rendered;
};

export const getDefaultComparison = (
  repoState: RepoState
): Comparison => {
  if (repoState.isInMergeConflict) {
    return {
      against: "merge",
      comparisonDirection: "forward",
      branch: null,
      commit: null,
      same: true,
    };
  }

  return {
    against: "wip",
    comparisonDirection: "forward",
    branch: null,
    commit: null,
    same: true,
  };
};

export const getComparisonDirection = async (
  datasource: DataSource,
  repoId: string,
  against: "branch" | "sha",
  branchId?: string | null,
  sha?: string | null
): Promise<"forward" | "backward"> => {
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
    const currentSha = await getCurrentCommitSha(datasource, repoId);
    if (!currentSha) {
      return "backward";
    }
    if (commit?.sha == currentSha) {
      return "forward";
    }
    const currentCommit = await datasource?.readCommit(repoId, currentSha);
    const fromHistory = await getHistory(datasource, repoId, commit.sha);
    const isInHistoryOfFromCommit = fromHistory.reduce((isInHist, commit) => {
      if (isInHist) {
        return true;
      }
      return (
        commit.sha == currentCommit.sha ||
        commit?.originalSha == currentCommit?.sha
      );
    }, false);
    if (isInHistoryOfFromCommit) {
      return "backward";
    }
    const intoHistory = await getHistory(datasource, repoId, currentCommit.sha);
    const isInHistoryOfIntoCommit = intoHistory.reduce((isInHist, commit) => {
      if (isInHist) {
        return true;
      }
      return commit.sha == sha || commit?.originalSha == sha;
    }, false);
    if (isInHistoryOfIntoCommit) {
      return "forward";
    }

    // QA
    const divergenceOrigin = await getDivergenceOrigin(
      datasource,
      repoId,
      currentSha,
      sha
    );
    if (!divergenceOrigin) {
      return "forward";
    }
    if (divergenceOrigin?.basedOn == "into") {
      return "forward";
    }
    if (divergenceOrigin?.basedOn == "from") {
      return "backward";
    }
  }
  return "forward";
};

export const getMergeConflictDiff = async (
  datasource: DataSource,
  repoId: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState.isInMergeConflict) {
      return null;
    }

    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    if (currentRepoState.merge.mergeState) {
      return getStateDiffFromCommitStates(
        currentRepoState.merge.mergeState,
        currentKVState
      );
    }

    const fromCommitState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.merge.fromSha
    );
    const intoCommitState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.merge.intoSha
    );
    const originCommitState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.merge.originSha
    );
    const mergeState = await getMergedCommitState(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommitState,
      currentRepoState.merge.direction
    );
    return getStateDiffFromCommitStates(mergeState, currentKVState);
  } catch (e) {
    return null;
  }
};
const getRemoteBranchDivergenceOrigin = async (
  datasource: DataSource,
  repoId: string,
  remoteCommits: Array<CommitExchange>,
  remoteBranch?: Branch,
  localBranch?: Branch
): Promise<DivergenceOrigin> => {
  const localCommits = await datasource.readCommits(repoId);
  const localCommitMap = localCommits.reduce((acc, c) => {
    return {
      ...acc,
      [c.sha]: c,
    };
  }, {});

  const remoteCommitMap = remoteCommits.reduce((acc, c) => {
    return {
      ...acc,
      [c.sha]: c,
    };
  }, {});
  let currentSha = remoteBranch?.lastCommit;
  const remoteHistory: Array<CommitExchange|CommitHistory> = [];
  while(currentSha) {
    const commit: CommitExchange|CommitHistory = remoteCommitMap[currentSha] ?? localCommitMap[currentSha];
    remoteHistory.push(commit);
    currentSha = commit?.parent;
  }

  const localHistory = await getHistory(datasource, repoId, localBranch?.lastCommit);
  return await getDivergenceOriginFromHistoryOrCommitExchange(remoteHistory, localHistory);
};

const checkIfBranchHeadsDiverges = async (
  datasource: DataSource,
  repoId: string,
  remoteCommits: Array<CommitExchange>,
  remoteBranch?: Branch,
  localBranch?: Branch
) => {
  if (!localBranch?.lastCommit || !remoteBranch?.lastCommit) {
    return false;
  }
  if (localBranch?.lastCommit == remoteBranch?.lastCommit) {
    return false;
  }
  const localCommits = await datasource.readCommits(repoId);
  const localCommitMap = localCommits.reduce((acc, c) => {
    return {
      ...acc,
      [c.sha]: c,
    };
  }, {});

  const remoteCommitMap = remoteCommits.reduce((acc, c) => {
    return {
      ...acc,
      [c.sha]: c,
    };
  }, {});
  const remoteIdx =
    remoteCommitMap[remoteBranch?.lastCommit]?.idx ??
    localCommitMap[remoteBranch?.lastCommit]?.idx ??
    -1;
  const localIdx = localCommitMap[localBranch?.lastCommit]?.idx ?? -1;
  let currentSha =
    remoteIdx >= localIdx ? remoteBranch?.lastCommit : localBranch?.lastCommit;
  const targetSha =
    currentSha == remoteBranch?.lastCommit
      ? localBranch?.lastCommit
      : remoteBranch?.lastCommit;

  let index = currentSha == remoteBranch?.lastCommit ? remoteIdx : localIdx;
  const targetIdx =
    currentSha == remoteBranch?.lastCommit ? localIdx : remoteIdx;
  while (currentSha) {
    if (currentSha == targetSha) {
      return false;
    }
    if (index < targetIdx) {
      return true;
    }
    currentSha =
      remoteCommitMap[currentSha]?.parent ?? localCommitMap[currentSha]?.parent;
    index--;
  }
  return true;
};

const getBranchHeadIndices = async (
  datasource: DataSource,
  repoId: string,
  remoteCommits: Array<CommitExchange>,
  remoteBranch?: Branch,
  localBranch?: Branch
) => {
  if (!localBranch?.lastCommit && !remoteBranch?.lastCommit) {
    return {
      localIdx: -1,
      remoteIdx: -1,
    };
  }
  const localCommits = await datasource.readCommits(repoId);
  const localCommitMap = localCommits.reduce((acc, c) => {
    return {
      ...acc,
      [c.sha]: c,
    };
  }, {});

  const remoteCommitMap = remoteCommits.reduce((acc, c) => {
    return {
      ...acc,
      [c.sha]: c,
    };
  }, {});
  const remoteIdx =
    remoteCommitMap[remoteBranch?.lastCommit]?.idx ??
    localCommitMap[remoteBranch?.lastCommit]?.idx ??
    -1;
  const localIdx = localCommitMap[localBranch?.lastCommit]?.idx ?? -1;
  return {
    remoteIdx,
    localIdx,
  };
};

export const getIsWip = async (
  datasource: DataSource,
  repoId: string,
  repoState: RepoState,
  unstagedState: ApplicationKVState,
  applicationKVState: ApplicationKVState
) => {
  if (repoState?.isInMergeConflict) {
    const diff = await getMergeConflictDiff(datasource, repoId);
    return !diffIsEmpty(diff);
  }
  const diff = getStateDiffFromCommitStates(unstagedState, applicationKVState);
  return !diffIsEmpty(diff);
};

const combineBranches = (start: Branch[], end: Branch[]): Array<Branch> => {
  const branchMap = [...start, ...end].reduce((acc, branch) => {
    return {
      ...acc,
      [branch.id]: branch,
    };
  }, {} as { [branchId: string]: Branch });
  return Object.values(branchMap);
};

export const getFetchInfo = async (
  datasource: DataSource,
  repoId: string
): Promise<FetchInfo> => {
  try {
    const repoState = await datasource.readCurrentRepoState(repoId);
    if (!repoState?.branch) {
      return {
        canPull: false,
        canPushBranch: false,
        userHasPermissionToPush: false,
        userCanPush: false,
        branchPushDisabled: false,
        hasConflict: false,
        nothingToPush: true,
        nothingToPull: true,
        containsDevPlugins: false,
        baseBranchRequiresPush: false,
        accountInGoodStanding: true,
        pullCanMergeWip: false,
        fetchFailed: false,
        remoteAhead: false,
        hasUnreleasedPlugins: false,
        hasInvalidPlugins: false,
        commits: [],
        branches: [],
        hasRemoteBranchCycle: false,
        hasLocalBranchCycle: false,
        hasOpenMergeRequestConflict: false
      };
    }

    const fetchInfo = await getRemoteFetchInfo(datasource, repoId);
    if (fetchInfo.status == "fail") {
      return {
        canPull: false,
        canPushBranch: false,
        userHasPermissionToPush: false,
        userCanPush: false,
        branchPushDisabled: false,
        hasConflict: false,
        nothingToPush: true,
        nothingToPull: true,
        containsDevPlugins: false,
        baseBranchRequiresPush: false,
        accountInGoodStanding: true,
        pullCanMergeWip: false,
        fetchFailed: true,
        remoteAhead: false,
        hasUnreleasedPlugins: false,
        hasInvalidPlugins: false,
        commits: [],
        branches: [],
        hasRemoteBranchCycle: false,
        hasLocalBranchCycle: false,
        hasOpenMergeRequestConflict: false
      };
    }

    for (const commit of fetchInfo?.commits ?? []) {
      const didPullCommmit = await saveRemoteSha(datasource, repoId, commit.sha);
      if (!didPullCommmit) {
        return null;
      }
    }

    // START BRANCH SYNC
    // now iterate over branches
    const branchesMetaState = await datasource.readBranchesMetaState(repoId);
    const userLocalBranchIds = new Set(
      branchesMetaState?.userBranches.map((b) => b.branchId)
    );

    const remoteBranchIds = new Set(fetchInfo?.branches.map((b) => b.id));

    const remoteSettings = await datasource?.readRemoteSettings(repoId);
    const protectedBranchIds = new Set(
      remoteSettings?.branchRules?.map((b) => b.branchId)
    );
    protectedBranchIds.add(remoteSettings?.defaultBranchId);

    const localAllBranchIds = new Set(
      branchesMetaState?.allBranches.map((b) => b.branchId)
    );

    // 1) remove no longer needed branches
    // 2) add new branches/updates
    let branchIdsToEvict = [];
    branchesMetaState.allBranches = branchesMetaState.allBranches.filter((b) => {
      if (
        userLocalBranchIds.has(b.branchId) ||
        remoteBranchIds.has(b.branchId) ||
        protectedBranchIds.has(b.branchId)
      ) {
        return true;
      }
      branchIdsToEvict.push(b.branchId);
      return false;
    });
    const branchesToAdd = [];
    const branchesToUpdate = [];
    for (const branch of fetchInfo?.branches) {
      if (!localAllBranchIds.has(branch.id)) {
        const currentBranches = await datasource.readBranches(repoId);
        const isCyclic = branchIdIsCyclic(branch.id, [
          ...currentBranches.filter((b) => b.id != branch.id),
          branch,
        ]);
        if (isCyclic) {
          continue;
        }
        branchesToAdd.push(branch);
        branchesMetaState.allBranches.push({
          branchId: branch.id,
          lastLocalCommit: branch.lastCommit,
          lastRemoteCommit: branch.lastCommit,
        });
      } else if (!userLocalBranchIds.has(branch.id)) {
        const currentBranches = await datasource.readBranches(repoId);
        const isCyclic = branchIdIsCyclic(branch.id, [
          ...currentBranches.filter((b) => b.id != branch.id),
          branch,
        ]);
        if (isCyclic) {
          continue;
        }
        const branchMetaData = branchesMetaState.allBranches.find(
          (b) => b.branchId == branch.id
        );
        branchesToUpdate.push(branch);
        branchMetaData.lastLocalCommit = branch.lastCommit;
        branchMetaData.lastRemoteCommit = branch.lastCommit;
      }
    }

    branchesMetaState.userBranches = branchesMetaState.userBranches.map((v) => {
      return branchesMetaState.allBranches.find((b) => b.branchId == v.branchId);
    });
    for (const branchIdToEvict of branchIdsToEvict) {
      await datasource.deleteBranch(repoId, branchIdToEvict);
    }

    const currentBranches = await datasource.readBranches(repoId);
    const nextCombinedBranches = combineBranches(currentBranches, [
      ...branchesToAdd,
      ...branchesToUpdate,
    ]);
    for (const branch of branchesToAdd) {
      const isCyclic = branchIdIsCyclic(branch.id, nextCombinedBranches);
      if (isCyclic) {
        continue;
      }
      const nextBranch = await datasource.saveBranch(repoId, branch.id, branch);
      webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);
    }

    for (const branch of branchesToUpdate) {
      const isCyclic = branchIdIsCyclic(branch.id, nextCombinedBranches);
      if (isCyclic) {
        continue;
      }
      const nextBranch = await datasource.saveBranch(repoId, branch.id, branch);
      webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);
    }

    await datasource.saveBranchesMetaState(repoId, branchesMetaState);
    // END BRANCH SYNC

    const localBranches = await datasource.readBranches(repoId);
    const combinedBranches = combineBranches(localBranches, fetchInfo.branches);
    const hasLocalBranchCycle = branchIdIsCyclic(
      repoState?.branch,
      combinedBranches
    );

    const hasUnreleasedPlugins = fetchInfo.pluginStatuses.reduce(
      (hasUnreleased, pluginStatus) => {
        if (hasUnreleased) {
          return true;
        }
        if (pluginStatus.status == "unreleased") {
          return true;
        }
        return false;
      },
      false
    );

    const hasInvalidPlugins = fetchInfo.pluginStatuses.reduce(
      (hasUnreleased, pluginStatus) => {
        if (hasUnreleased) {
          return true;
        }
        if (pluginStatus.status == "invalid") {
          return true;
        }
        return false;
      },
      false
    );

    const branchRule = fetchInfo?.settings?.branchRules?.find(
      (b) => b?.branchId == repoState?.branch
    );
    const userHasPermissionToPush = fetchInfo?.settings?.canPushBranches;

    const userCanPush =
      fetchInfo?.settings?.canPushBranches &&
      !branchRule?.directPushingDisabled;
    const remoteBranch = fetchInfo?.branches?.find(
      (b) => b.id == repoState.branch
    );
    const remoteMap = fetchInfo.commits?.reduce((acc, commit) => {
      return {
        ...acc,
        [commit.sha]: commit,
      };
    }, {});

    const localBranch = await datasource?.readBranch(repoId, repoState?.branch);
    const remoteBaseBranch = localBranch.baseBranchId
      ? fetchInfo.branches.find((v) => v.id == localBranch.baseBranchId)
      : null;
    const baseBranchRequiresPush =
      !!localBranch.baseBranchId && !remoteBaseBranch;
      // we should check the rebase list, if it is zero and the remote branch head can merge then whatever
    const branchHeadsDiverge = await checkIfBranchHeadsDiverges(
      datasource,
      repoId,
      fetchInfo?.commits ?? [],
      remoteBranch,
      localBranch
    );

    const { localIdx, remoteIdx } = await getBranchHeadIndices(
      datasource,
      repoId,
      fetchInfo?.commits ?? [],
      remoteBranch,
      localBranch
    );

    const branchHeadLink = !remoteBranch ? null : fetchInfo?.branchHeadLinks?.find(b => b?.id == remoteBranch?.id);
    const pullKv = !branchHeadLink ? null : await getKVStateFromBranchHeadLink(datasource, repoId, remoteBranch.lastCommit, branchHeadLink);
    if (!pullKv && branchHeadLink) {
      return null;
    }
    const divergenceOrigin = await getRemoteBranchDivergenceOrigin(
      datasource,
      repoId,
      fetchInfo.commits,
      remoteBranch,
      localBranch
    );
    if (!divergenceOrigin) {
      return null;
    }
    const originSha = getMergeOriginSha(divergenceOrigin);
    const remoteAhead = remoteIdx > localIdx;
    const nothingToPull = !remoteBranch || !remoteAhead && divergenceOrigin.rebaseShas.length == 0 && localIdx >= remoteIdx;
    const nothingToPush = (!branchHeadsDiverge && localIdx <= remoteIdx) && branchesAreEquivalent(localBranch, remoteBranch);

    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const lastLocalCommitKv = await getCommitState(
      datasource,
      repoId,
      localBranch?.lastCommit
    );
    const originState = await getCommitState(datasource, repoId, originSha);
    const hasPullConflict = originSha != localBranch.lastCommit && !(await canAutoMergeCommitStates(datasource,
          pullKv,
          lastLocalCommitKv,
          originState
      ));

    const hasOpenMergeRequestConflict = fetchInfo?.hasOpenMergeRequest && localBranch?.baseBranchId != remoteBranch?.baseBranchId;

    let currentSha = localBranch.lastCommit;
    let containsDevPlugins = false;
    while (currentSha) {
      const commit = await datasource.readCommit(repoId, currentSha);
      const hasDevPlugins = commitDataContainsDevPlugins(commit);
      if (hasDevPlugins) {
        containsDevPlugins = true;
        break;
      }
      currentSha = commit.parent;
    }

    const hasLastRemoteCommit =
      !!remoteBranch?.lastCommit &&
      !!(await datasource.readCommit(repoId, remoteBranch.lastCommit));
    if (hasLastRemoteCommit) {
      let pullCanMergeWip = false;
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const isWIP = await getIsWip(
        datasource,
        repoId,
        repoState,
        unstagedState,
        currentKVState
      );
      if (!hasPullConflict && isWIP) {
        const mergeState = await getMergedCommitState(
          datasource,
          pullKv,
          lastLocalCommitKv,
          originState
        );
        const isMergeable = await canAutoMergeCommitStates(
          datasource,
          currentKVState,
          mergeState,
          unstagedState
        );
        pullCanMergeWip = isMergeable;
        return {
          canPull:
            !nothingToPull &&
            (!hasPullConflict || !isWIP) &&
            (pullCanMergeWip || !isWIP) &&
            !hasLocalBranchCycle,
          canPushBranch:
            !branchRule?.directPushingDisabled &&
            userCanPush &&
            !containsDevPlugins &&
            !nothingToPush &&
            !baseBranchRequiresPush &&
            !fetchInfo.hasRemoteBranchCycle &&
            !hasUnreleasedPlugins &&
            !hasOpenMergeRequestConflict &&
            !hasInvalidPlugins,
          userHasPermissionToPush,
          userCanPush,
          branchPushDisabled: branchRule?.directPushingDisabled ?? false,
          hasConflict: hasPullConflict,
          accountInGoodStanding: fetchInfo?.settings?.accountInGoodStanding,
          remoteBranch,
          nothingToPush,
          nothingToPull,
          baseBranchRequiresPush,
          containsDevPlugins,
          pullCanMergeWip,
          remoteAhead,
          fetchFailed: false,
          commits: fetchInfo.commits,
          branches: fetchInfo.branches,
          hasRemoteBranchCycle: fetchInfo.hasRemoteBranchCycle,
          hasLocalBranchCycle,
          hasUnreleasedPlugins,
          hasInvalidPlugins,
          hasOpenMergeRequestConflict
        };
      }
    }
    if (
      !!remoteBranch &&
      !!remoteBranch?.lastCommit &&
      remoteMap[remoteBranch.lastCommit]
    ) {
      let pullCanMergeWip = false;
      let firstRemoteCommit = remoteMap[remoteBranch.lastCommit];
      while (
        firstRemoteCommit?.parent &&
        remoteMap[firstRemoteCommit?.parent]
      ) {
        firstRemoteCommit = remoteMap[firstRemoteCommit?.parent];
      }
      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const isWIP = await getIsWip(
        datasource,
        repoId,
        repoState,
        unstagedState,
        currentKVState
      );

      if (!hasPullConflict && isWIP) {
        const remoteBranchHead = fetchInfo?.branchHeadLinks?.find(
          (bh) => bh.id == repoState?.branch
        );
        const localLastCommit = await datasource?.readCommit(
          repoId,
          remoteBranchHead?.lastCommit
        );
        if (localLastCommit) {
          const kvState = await getCommitState(
            datasource,
            repoId,
            localLastCommit.sha
          );
          if (kvState) {
            const isMergeable = await canAutoMergeCommitStates(
              datasource,
              currentKVState,
              kvState,
              unstagedState
            );
            pullCanMergeWip = isMergeable;
          }
        } else if (remoteBranchHead?.kvLink) {
          const kvState = await fetchRemoteKvState(remoteBranchHead.kvLink);
          if (kvState) {
            const isMergeable = await canAutoMergeCommitStates(
              datasource,
              currentKVState,
              kvState,
              unstagedState
            );
            pullCanMergeWip = isMergeable;
          }
        }
      }

      return {
        canPull:
          !nothingToPull &&
          (!hasPullConflict || !isWIP) &&
          (pullCanMergeWip || !isWIP) &&
          !hasLocalBranchCycle,
        canPushBranch:
          !branchRule?.directPushingDisabled &&
          userCanPush &&
          !containsDevPlugins &&
          !nothingToPush &&
          !baseBranchRequiresPush &&
          !fetchInfo.hasRemoteBranchCycle &&
          !hasUnreleasedPlugins &&
          !hasOpenMergeRequestConflict &&
          !hasInvalidPlugins,
        userHasPermissionToPush,
        userCanPush,
        branchPushDisabled: branchRule?.directPushingDisabled ?? false,
        hasConflict: hasPullConflict,
        accountInGoodStanding: fetchInfo?.settings?.accountInGoodStanding,
        remoteBranch,
        nothingToPush,
        nothingToPull,
        baseBranchRequiresPush,
        containsDevPlugins,
        pullCanMergeWip,
        remoteAhead,
        fetchFailed: false,
        commits: fetchInfo.commits,
        branches: fetchInfo.branches,
        hasRemoteBranchCycle: fetchInfo.hasRemoteBranchCycle,
        hasLocalBranchCycle,
        hasUnreleasedPlugins,
        hasInvalidPlugins,
        hasOpenMergeRequestConflict
      };
    }
    return {
      canPull: !nothingToPull && !hasLocalBranchCycle,
      canPushBranch:
        !branchRule?.directPushingDisabled &&
        userCanPush &&
        !containsDevPlugins &&
        !nothingToPush &&
        !baseBranchRequiresPush &&
        !fetchInfo.hasRemoteBranchCycle &&
        !hasUnreleasedPlugins &&
        !hasOpenMergeRequestConflict &&
        !hasInvalidPlugins,
      userHasPermissionToPush,
      userCanPush,
      branchPushDisabled: branchRule?.directPushingDisabled ?? false,
      hasConflict: hasPullConflict,
      accountInGoodStanding: fetchInfo?.settings?.accountInGoodStanding,
      remoteBranch,
      nothingToPush,
      nothingToPull,
      baseBranchRequiresPush,
      containsDevPlugins,
      pullCanMergeWip: true,
      remoteAhead,
      fetchFailed: false,
      commits: fetchInfo.commits,
      branches: fetchInfo.branches,
      hasRemoteBranchCycle: fetchInfo.hasRemoteBranchCycle,
      hasLocalBranchCycle,
      hasUnreleasedPlugins,
      hasInvalidPlugins,
      hasOpenMergeRequestConflict
    };
  } catch (e) {
    console.log("Error", e);
    return null;
  }
};

export const pull = async (
  datasource: DataSource,
  repoId: string
): Promise<boolean> => {
  const repoState = await datasource.readCurrentRepoState(repoId);
  const fetchInfo = await getFetchInfo(datasource, repoId);
  if (!fetchInfo) {
    return false;
  }
  if (!fetchInfo.canPull) {
    return false;
  }

  const commitsToFetch = fetchInfo.commits.sort((a, b) => a.idx - b.idx);
  for (const commit of commitsToFetch) {
    const didPullCommmit = await saveRemoteSha(datasource, repoId, commit.sha);
    if (!didPullCommmit) {
      return false;
    }
  }
  // now iterate over branches
  const branchesMetaState = await datasource.readBranchesMetaState(repoId);
  const userLocalBranchIds = new Set(
    branchesMetaState?.userBranches.map((b) => b.branchId)
  );

  const remoteBranchIds = new Set(fetchInfo?.branches.map((b) => b.id));

  const remoteSettings = await datasource?.readRemoteSettings(repoId);
  const protectedBranchIds = new Set(
    remoteSettings?.branchRules?.map((b) => b.branchId)
  );
  protectedBranchIds.add(remoteSettings?.defaultBranchId);

  const localAllBranchIds = new Set(
    branchesMetaState?.allBranches.map((b) => b.branchId)
  );

  // 1) remove no longer needed branches
  // 2) add new branches/updates
  let branchIdsToEvict = [];
  branchesMetaState.allBranches = branchesMetaState.allBranches.filter((b) => {
    if (
      userLocalBranchIds.has(b.branchId) ||
      remoteBranchIds.has(b.branchId) ||
      protectedBranchIds.has(b.branchId)
    ) {
      return true;
    }
    branchIdsToEvict.push(b.branchId);
    return false;
  });
  const branchesToAdd = [];
  const branchesToUpdate = [];
  for (const branch of fetchInfo?.branches) {
    if (!localAllBranchIds.has(branch.id)) {
      const currentBranches = await datasource.readBranches(repoId);
      const isCyclic = branchIdIsCyclic(branch.id, [
        ...currentBranches.filter((b) => b.id != branch.id),
        branch,
      ]);
      if (isCyclic) {
        continue;
      }
      branchesToAdd.push(branch);
      branchesMetaState.allBranches.push({
        branchId: branch.id,
        lastLocalCommit: branch.lastCommit,
        lastRemoteCommit: branch.lastCommit,
      });
    } else {
      // TEST IF CYCLIC
      const currentBranches = await datasource.readBranches(repoId);

      const combinedBranches = combineBranches(currentBranches, [
        ...branchesToAdd,
        ...branchesToUpdate,
      ]);
      const isCyclic = branchIdIsCyclic(branch.id, combinedBranches);
      if (branch?.id == repoState.branch) {
        if (isCyclic) {
          return false;
        }
        const branchMetaData = branchesMetaState.allBranches.find(
          (b) => b.branchId == branch.id
        );
        branchMetaData.lastRemoteCommit = branch.lastCommit;
        // update branch
        // check if need to merge, then merge
        const unstagedState = await getUnstagedCommitState(datasource, repoId);
        const currentAppState = await getApplicationState(datasource, repoId);
        const currentKVState = await convertRenderedCommitStateToKv(
          datasource,
          currentAppState
        );
        const isWIP = await getIsWip(
          datasource,
          repoId,
          repoState,
          unstagedState,
          currentKVState
        );
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const pullKv = await getCommitState(
          datasource,
          repoId,
          branch.lastCommit
        );

        const { fromCommitState, originCommit, intoCommitState } = await getMergeCommitStates(
          datasource,
          repoId,
          branch.lastCommit,
          currentRepoState.commit
        );

        const divergenceOrigin = await getDivergenceOrigin(
          datasource,
          repoId,
          currentRepoState.commit,
          branch.lastCommit,
        );

        const isCurrentInMergeHistory = divergenceOrigin.rebaseShas.length == 0;

        const canAutoMergeLastCommitState = isCurrentInMergeHistory ? true : await canAutoMergeCommitStates(
          datasource,
          pullKv,
          unstagedState,
          originCommit
        );


        if (isWIP) {
          const canAutoMergePullState = await canAutoMergeCommitStates(
            datasource,
            currentKVState,
            pullKv,
            unstagedState
          );
          if (canAutoMergePullState && canAutoMergeLastCommitState) {
            const fromSha = branch.lastCommit;

            const user = await getUserAsync();
            if (!user?.id) {
              return false;
            }

            const rebaseList = await getMergeRebaseCommitList(
              datasource,
              repoId,
              fromSha,
              user
            );

            if (rebaseList == null) {
              return false;
            }

            const finalCommit =
              rebaseList[rebaseList.length - 1] ??
              (await datasource.readCommit(
                repoId,
                divergenceOrigin?.basedOn == "from"
                  ? fromSha
                  : currentRepoState.commit
              ));

            for (let commitData of rebaseList) {
              const result = await datasource.saveCommit(
                repoId,
                commitData.sha,
                commitData
              );
              if (!result) {
                return null;
              }
            }

            const finalCommitState = await getCommitState(
              datasource,
              repoId,
              finalCommit.sha
            );

            branch.lastCommit = finalCommit.sha;
            branchesToUpdate.push(branch);
            branchMetaData.lastLocalCommit = finalCommit.sha;

            const updated = {
              ...currentRepoState,
              commit: finalCommit.sha,
              branch: branch.id,
            };
            branchMetaData.lastLocalCommit = finalCommit.sha;
            const currentMergeState = await getMergedCommitState(
              datasource,
              currentKVState,
              finalCommitState,
              unstagedState
            );
            const renderedState = await convertCommitStateToRenderedState(
              datasource,
              currentMergeState
            );
            const sanitizedRenderedState = await sanitizeApplicationKV(
              datasource,
              renderedState
            );
            await datasource.saveRenderedState(repoId, sanitizedRenderedState);
            await datasource.saveCurrentRepoState(repoId, updated);
          } else {
            return false;
          }
        } else {
          if (isCyclic) {
            continue;
          }
          const fromSha = branch.lastCommit;
          // NOT WIP
          if (!canAutoMergeLastCommitState) {
            // CREATE CONFLICT
            const direction = "yours";
            const mergeState = await getMergedCommitState(
              datasource,
              fromCommitState,
              intoCommitState,
              originCommit,
              direction
            );
            const originSha = getMergeOriginSha(divergenceOrigin);

            const conflictList = await getConflictList(
              datasource,
              repoId,
              fromSha,
              currentRepoState.commit,
              originSha,
              direction
            );

            const updated: RepoState = {
              ...currentRepoState,
              isInMergeConflict: true,
              merge: {
                originSha,
                fromSha,
                intoSha: currentRepoState.commit,
                direction,
                mergeState,
                conflictList,
                returnCommandMode: "view"
              },
              commandMode: "compare",
              comparison: {
                against: "merge",
                comparisonDirection: "forward",
                branch: null,
                commit: null,
                same: true,
              },
            };
            await datasource.saveCurrentRepoState(repoId, updated);
            const renderedState = await convertCommitStateToRenderedState(
              datasource,
              mergeState
            );
            const sanitizedRenderedState = await sanitizeApplicationKV(
              datasource,
              renderedState
            );
            await datasource.saveRenderedState(repoId, sanitizedRenderedState);
            // need to update branch data here
            return true;
          } else {
            // NO CONFLICT
            const user = await getUserAsync();
            if (!user?.id) {
              return false;
            }
            const originSha = getMergeOriginSha(divergenceOrigin);
            if (originSha == currentRepoState.commit) {

              branchMetaData.lastRemoteCommit = branch.lastCommit;
              branchesToUpdate.push(branch);
              branchMetaData.lastLocalCommit = branch.lastCommit;
              const updated = {
                ...currentRepoState,
                commit: branch.lastCommit,
                branch: branch.id,
              };
              const renderedState = await convertCommitStateToRenderedState(
                datasource,
                pullKv
              );
              const sanitizedRenderedState = await sanitizeApplicationKV(
                datasource,
                renderedState
              );
              await datasource.saveRenderedState(repoId, sanitizedRenderedState);
              await datasource.saveCurrentRepoState(repoId, updated);
              continue;
            }

            const rebaseList = await getMergeRebaseCommitList(
              datasource,
              repoId,
              fromSha,
              user
            );

            if (rebaseList == null) {
              return false;
            }

            const finalCommit =
              rebaseList[rebaseList.length - 1] ??
              (await datasource.readCommit(
                repoId,
                divergenceOrigin?.basedOn == "from"
                  ? fromSha
                  : currentRepoState.commit
              ));


            for (let commitData of rebaseList) {
              const result = await datasource.saveCommit(
                repoId,
                commitData.sha,
                commitData
              );
              if (!result) {
                return null;
              }
            }
            const finalCommitState = await getCommitState(
              datasource,
              repoId,
              finalCommit.sha
            );
            branchMetaData.lastRemoteCommit = branch.lastCommit;
            branch.lastCommit = finalCommit.sha;
            branchesToUpdate.push(branch);
            branchMetaData.lastLocalCommit = finalCommit.sha;
            const updated = {
              ...currentRepoState,
              commit: finalCommit.sha,
              branch: branch.id,
            };
            const renderedState = await convertCommitStateToRenderedState(
              datasource,
              finalCommitState
            );
            const sanitizedRenderedState = await sanitizeApplicationKV(
              datasource,
              renderedState
            );
            await datasource.saveRenderedState(repoId, sanitizedRenderedState);
            await datasource.saveCurrentRepoState(repoId, updated);
          }
        }
      } else {
        // not current branch
        if (isCyclic) {
          continue;
        }
        const isUserBranch = !!branchesMetaState?.userBranches?.find?.(
          (b) => b.branchId == branch.id
        );

        const branchMetaData = branchesMetaState.allBranches.find(
          (b) => b.branchId == branch.id
        );

        if (!isUserBranch) {
          branchesToUpdate.push(branch);
          branchMetaData.lastLocalCommit = branch.lastCommit;
          branchMetaData.lastRemoteCommit = branch.lastCommit;
          continue;
        }
        branchMetaData.lastRemoteCommit = branch.lastCommit;
      }
    }
  }
  branchesMetaState.userBranches = branchesMetaState.userBranches.map((v) => {
    return branchesMetaState.allBranches.find((b) => b.branchId == v.branchId);
  });
  for (const branchIdToEvict of branchIdsToEvict) {
    await datasource.deleteBranch(repoId, branchIdToEvict);
  }

  const currentBranches = await datasource.readBranches(repoId);
  const combinedBranches = combineBranches(currentBranches, [
    ...branchesToAdd,
    ...branchesToUpdate,
  ]);
  for (const branch of branchesToAdd) {
    const isCyclic = branchIdIsCyclic(branch.id, combinedBranches);
    if (isCyclic) {
      continue;
    }
    const nextBranch = await datasource.saveBranch(repoId, branch.id, branch);
    webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);
  }

  for (const branch of branchesToUpdate) {
    const isCyclic = branchIdIsCyclic(branch.id, combinedBranches);
    if (isCyclic) {
      continue;
    }
    const nextBranch = await datasource.saveBranch(repoId, branch.id, branch);
    webhookQueue.addBranchUpdate(datasource, repoId, nextBranch);
  }

  await datasource.saveBranchesMetaState(repoId, branchesMetaState);

  return true;
};

export const push = async (
  datasource: DataSource,
  repoId: string
): Promise<boolean> => {
  const repoState = await datasource.readCurrentRepoState(repoId);
  const pushInfo = await getFetchInfo(datasource, repoId);
  if (!pushInfo) {
    return null;
  }
  const canPush = pushInfo.canPushBranch && pushInfo.accountInGoodStanding;
  if (!canPush) {
    return null;
  }

  const localBranch = await datasource?.readBranch(repoId, repoState?.branch);
  const pushList: Array<CommitData> = [];
  let currentSha = localBranch.lastCommit;
  while (
    currentSha &&
    (await checkRemoteShaExistence(repoId, currentSha)) === false
  ) {
    const commit = await datasource.readCommit(repoId, currentSha);
    pushList.unshift(commit);
    currentSha = commit.parent;
  }
  for (const commitData of pushList) {
    const didPush = await pushCommit(datasource, repoId, commitData);
    if (!didPush) {
      return false;
    }
  }

  const branch = await datasource.readBranch(repoId, repoState.branch);
  const pushedBranchResult = await pushBranch(repoId, branch);
  if (!pushedBranchResult) {
    return false;
  }
  // update branch meta state here
  const branchesMetaState = await datasource.readBranchesMetaState(repoId);
  branchesMetaState.allBranches = branchesMetaState.allBranches.map((b) => {
    if (b.branchId == branch.id) {
      return {
        branchId: b.branchId,
        lastLocalCommit: branch.lastCommit,
        lastRemoteCommit: branch.lastCommit,
      };
    }
    return b;
  });

  branchesMetaState.userBranches = branchesMetaState.userBranches.map((b) => {
    if (b.branchId == branch.id) {
      return {
        branchId: b.branchId,
        lastLocalCommit: branch.lastCommit,
        lastRemoteCommit: branch.lastCommit,
      };
    }
    return b;
  });

  await datasource.saveBranchesMetaState(repoId, branchesMetaState);
  return true;
};

const pushCommit = async (
  datasource: DataSource,
  repoId: string,
  commitData: CommitData
): Promise<boolean> => {
  try {
    const repoState = await datasource.readCurrentRepoState(repoId);
    const commitExists = await checkRemoteShaExistence(repoId, commitData.sha);
    if (commitExists === null) {
      return false;
    }
    if (commitExists) {
      return true;
    }
    const binariesInCommit = Object.values(commitData?.diff?.binaries?.add);
    for (const binaryRef of binariesInCommit) {
      const exists = await checkRemoteBinaryExistence(repoId, binaryRef);
      if (exists === null) {
        return false;
      }
      if (!exists) {
        const binaryPushResult = await pushBinary(
          repoId,
          binaryRef,
          repoState.branch
        );
        if (!binaryPushResult) {
          return false;
        }
      }
    }

    const commitPushResult = await pushCommitData(
      repoId,
      commitData,
      repoState.branch
    );
    if (!commitPushResult) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
};

export const commitDataContainsDevPlugins = (
  commitData: CommitData
): boolean => {
  const addedPlugins = Object.values(commitData.diff.plugins.add);
  for (let addedPlugin of addedPlugins) {
    if (addedPlugin.value?.startsWith("dev")) {
      return true;
    }
  }
  return false;
};

export const branchesAreEquivalent = (branchA?: Branch, branchB?: Branch) => {
  return (
    branchA?.id == branchB?.id &&
    branchA?.createdBy == branchB?.createdBy &&
    branchA?.baseBranchId == branchB?.baseBranchId &&
    branchA?.createdByUsername == branchB?.createdByUsername &&
    branchA?.lastCommit == branchB?.lastCommit &&
    branchA?.name == branchB?.name
  );
};

export const getCheckoutBranchIds = async (
  datasource: DataSource,
  repoId: string
): Promise<string[]> => {
  try {
    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    const branches = await datasource.readBranches(repoId);
    const remoteSettings = await datasource.readRemoteSettings(repoId);
    const branchRuleIds = new Set([
      ...remoteSettings?.branchRules?.map(
        (br) => br.branchId,
        remoteSettings.defaultBranchId
      ),
    ]);
    const userBranchIds = new Set(
      branchMetaState.userBranches.map((b) => b.branchId)
    );
    const useBaseBranchIds = new Set(
      branches
        ?.filter?.((b) => userBranchIds.has(b.id))
        ?.map?.((b) => b.baseBranchId)
        ?.filter((v) => !!v) ?? []
    );
    return branches
      ?.filter((b) => {
        if (!b.id) {
          return false;
        }
        return (
          branchRuleIds.has(b.id) ||
          userBranchIds.has(b.id) ||
          useBaseBranchIds.has(b.id)
        );
      })
      ?.map((v) => v.id);
  } catch (e) {
    return [];
  }
};
