import path from "path";
import { existsAsync, vReposPath, getUserAsync } from "./filestructure";
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
  getDivergenceOriginSha,
  getBaseDivergenceSha,
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
} from "./repo";
import {
  CommitData,
  DiffElement,
  getDiffHash,
  splitTextForDiff,
} from "./versioncontrol";
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
} from "./plugins";
import { LicenseCodes } from "./licensecodes";
import { DataSource } from "./datasource";
import { SourceGraph, getPotentialBaseBranchesForSha, getTargetBranchId } from "./sourcegraph";

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
    const sanitizedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    const sanitizedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
  const exists = await existsAsync(path.join(vReposPath, repoId));
  if (!exists) {
    return;
  }
  const renderedState = await datasource.readRenderedState(repoId);
  return renderedState.description;
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
    const commits = await datasource.readCommits(repoId);
    const branchesMetaState = await datasource.readBranchesMetaState(repoId);
    const sourcegraph = new SourceGraph(commits, branchesMetaState, repoState);
    const pointers = sourcegraph.getPointers();
    const branches = await datasource.readBranches(repoId);
    const potentialBaseBranches = getPotentialBaseBranchesForSha(
      branchHeadSha,
      branches,
      pointers
    )?.filter((v) => v.id != originalBranch.id);

    const baseBranchIds = potentialBaseBranches?.map((b) => b.id);
    if (baseBranchId && !baseBranchIds.includes(baseBranchId)) {
      return null;
    }

    const branchId = getBranchIdFromName(branchName);
    const branchAlreadyExists = branches
      .filter((v) => v.id != originalBranch.id)
      .map((v) => v.id)
      .includes(branchId);
    if (branchAlreadyExists) {
      return null;
    }

    const currentKVState = await getCommitState(
      datasource,
      repoId,
      originalBranch?.lastCommit
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
      createdAt: new Date().toString(),
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
          oldBranch.baseBranchId = branchData.id;
          await datasource?.saveBranch(repoId, oldBranch.id, oldBranch);
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
    await datasource.saveRenderedState(repoId, newRenderedState);
    const newRepoState = await updateCurrentWithNewBranch(
      datasource,
      repoId,
      branchData
    );
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

      newRenderedState = await convertCommitStateToRenderedState(
        datasource,
        newCurrentKVState
      );
      // save to rendered current after branch change goes through
    }

    const branchId = getBranchIdFromName(branchName);
    const branch: Branch = {
      id: branchId,
      lastCommit: branchHead,
      createdBy: user.id,
      createdAt: new Date().toString(),
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
      const sanitizedRenderedState = await sanitizeApplicationKV(datasource, newRenderedState);
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
    const userBranchMeta = branchMetaState.allBranches.find(
      (bm) => bm.branchId == branchId
    );
    if (branchMeta && !userBranchMeta) {
      branchMetaState.userBranches.push(branchMeta);
    }

    await datasource.saveBranchesMetaState(repoId, branchMetaState);
    const sanitizedRenderedState = await sanitizeApplicationKV(datasource, newRenderedState);
    await datasource.saveRenderedState(repoId, sanitizedRenderedState);
    return await updateCurrentBranch(datasource, repoId, branchId);
  } catch (e) {
    return null;
  }
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
    if (currentRepoState.branch == branchId) {
      const currentBranch = await datasource.readBranch(repoId, branchId);
      finalBranchSha = currentBranch.lastCommit;
      const baseBranch = currentBranch.baseBranchId
        ? await datasource.readBranch(repoId, currentBranch.baseBranchId)
        : null;
      finalBranchId = baseBranch?.id;

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

    let newRenderedState: null | RenderedApplicationState;
    if (finalBranchSha) {
      const headState = await getCommitState(
        datasource,
        repoId,
        finalBranchSha
      );
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

      newRenderedState = await convertCommitStateToRenderedState(
        datasource,
        newCurrentKVState
      );
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
        branch.baseBranchId = finalBranchId;
        await datasource?.saveBranch(repoId, branch.id, branch);
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
      const sanitizedRenderedState = await sanitizeApplicationKV(datasource, newRenderedState);
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
    if (!user.id) {
      return null;
    }
    const currentState = await datasource.readCurrentRepoState(repoId);
    const currentRenderedState = await datasource.readRenderedState(repoId);
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
    const timestamp = new Date().toString();
    const commitData: CommitData = {
      parent: parent ? parent.sha : null,
      historicalParent: parent ? parent.sha : null,
      idx: idx,
      diff,
      timestamp,
      userId: user.id,
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
    if (currentState.branch) {
      const branchState = await datasource.readBranch(
        repoId,
        currentState.branch
      );
      await datasource.saveBranch(repoId, currentState.branch, {
        ...branchState,
        lastCommit: sha,
      });
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
        const manifest = updatedManifests.find(m => m.name == key);
        store[key] = (manifest?.seed as object) ?? {};
      }
    }
    const schemaMap = manifestListToSchemaMap(updatedManifests);
    await enforceBoundedSets(datasource, schemaMap, store)
    store = await cascadePluginState(datasource, schemaMap, store);
    store = await nullifyMissingFileRefs(datasource, schemaMap, store);
    console.log("BRO", JSON.stringify(store, null, 2))
    const binaries = await collectFileRefs(datasource, schemaMap, store);
    currentRenderedState.store = store;
    currentRenderedState.plugins = sortedUpdatedPlugins;
    currentRenderedState.binaries = uniqueStrings(binaries);
    const sanitizedRenderedState = await sanitizeApplicationKV(datasource, currentRenderedState);
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

    const manifest = manifests.find((p) => p.name == pluginName);
    const schemaMap = await getSchemaMapForManifest(datasource, manifest);
    const renderedState = await datasource.readRenderedState(repoId);
    const stateStore = renderedState.store;
    stateStore[pluginName] = updatedState;

    await enforceBoundedSets(datasource, schemaMap, renderedState.store)
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
    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
    await enforceBoundedSets(datasource, schemaMap, sanitiziedRenderedState.store)
    sanitiziedRenderedState.store = await cascadePluginState(
      datasource,
      schemaMap,
      stateStore
    );
    sanitiziedRenderedState.store = await nullifyMissingFileRefs(
      datasource,
      schemaMap,
      renderedState.store
    );
    sanitiziedRenderedState.binaries = uniqueStrings(
      await collectFileRefs(datasource, schemaMap, renderedState.store)
    );
    await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
    return sanitiziedRenderedState;
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
  if (!user.id) {
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
    const canAutoCommitMergeStates = await canAutoMergeCommitStates(
      datasource,
      fromCommitState,
      intoCommitState,
      originCommit
    );

    const originSha = await getDivergenceOriginSha(
      datasource,
      repoId,
      fromSha,
      currentRepoState.commit
    );
    if (originSha == currentRepoState.commit) {
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

      const history = await getHistory(
        datasource,
        repoId,
        currentRepoState.commit
      );

      const mergeState = await getMergedCommitState(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit
      );

      const origin = originSha
        ? await datasource.readCommit(repoId, originSha)
        : null;
      const { sha: baseSha, idx: baseIdx } = !origin
        ? history[history.length - 1]
        : getBaseDivergenceSha(history, origin);

      const mergeDiff = getStateDiffFromCommitStates(
        intoCommitState,
        mergeState
      );
      const baseCommit = await getCommitState(datasource, repoId, baseSha);
      const baseDiff = getStateDiffFromCommitStates(
        fromCommitState,
        baseCommit
      );
      const baseCommitData = await datasource.readCommit(repoId, baseSha);
      const mergeCommitData = await datasource.readCommit(repoId, fromSha);
      const mergeBaseCommit: CommitData = {
        ...baseCommitData,
        diff: baseDiff,
        idx: mergeCommitData.idx + 1,
        historicalParent: originSha,
        authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
        userId: user.id,
        parent: fromSha,
      };
      mergeBaseCommit.sha = getDiffHash(mergeBaseCommit);
      const rebaseList = [mergeBaseCommit];
      for (let idx = baseIdx + 1; idx < history.length; idx++) {
        const commitToRebase = await datasource.readCommit(
          repoId,
          history[history.length - idx - 1].sha
        );
        commitToRebase.authorUserId =
          rebaseList[rebaseList.length - 1].authorUserId ??
          rebaseList[rebaseList.length - 1].userId;
        commitToRebase.userId = user.id;
        commitToRebase.parent = rebaseList[rebaseList.length - 1].sha;
        commitToRebase.historicalParent = rebaseList[rebaseList.length - 1].sha;
        commitToRebase.idx = rebaseList[rebaseList.length - 1].idx + 1;
        commitToRebase.sha = getDiffHash(commitToRebase);
        rebaseList.push(commitToRebase);
      }
      const mergeCommit: CommitData = {
        parent: rebaseList[rebaseList.length - 1].sha,
        historicalParent: rebaseList[rebaseList.length - 1].sha,
        idx: rebaseList[rebaseList.length - 1].idx + 1,
        message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
        mergeBase: mergeBaseCommit.sha,
        userId: user.id,
        timestamp: new Date().toString(),
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
        await datasource.saveBranch(repoId, currentRepoState.branch, {
          ...branchState,
          lastCommit: mergeCommit.sha,
        });

        const branchMetaState = await datasource.readBranchesMetaState(repoId);
        branchMetaState.allBranches = branchMetaState.allBranches.map(
          (branch) => {
            if (branch.branchId == branchState.id) {
              return {
                ...branch,
                lastLocalCommit: mergeCommit.sha,
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
                lastLocalCommit: mergeCommit.sha,
              };
            }
            return branch;
          }
        );

        await datasource.saveBranchesMetaState(repoId, branchMetaState);
      }
      await updateCurrentCommitSHA(datasource, repoId, mergeCommit.sha, false);
      if (!diffIsEmpty(currentDiff)) {
        const mergeCurrState = await getMergedCommitState(
          datasource,
          mergeState,
          currentKVState,
          intoCommitState
        );
        const currentAfterRestorationRendered =
          await convertCommitStateToRenderedState(datasource, mergeCurrState);
        const sanitizedCurrentAfterRestorationRendered = await sanitizeApplicationKV(datasource, currentAfterRestorationRendered);
        const state = await datasource.saveRenderedState(
          repoId,
          sanitizedCurrentAfterRestorationRendered
        );
        return state;
      } else {
        const renderedState = await convertCommitStateToRenderedState(
          datasource,
          mergeState
        );

        const sanitizedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
        const state = await datasource.saveRenderedState(repoId, sanitizedRenderedState);
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

      const originSha = await getDivergenceOriginSha(
        datasource,
        repoId,
        currentRepoState.commit,
        fromSha
      );

      const direction = "yours";

      const mergeState = await getMergedCommitState(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit,
        direction
      );

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
        },
        commandMode: "compare",
        comparison: {
          against: "merge",
          comparisonDirection: "forward",
          branch: null,
          commit: null,
        },
      };
      await datasource.saveCurrentRepoState(repoId, updated);
      const renderedState = await convertCommitStateToRenderedState(
        datasource,
        mergeState
      );
      const sanitizedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    const sanitizedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    const updated: RepoState = {
      ...currentRepoState,
      commandMode: "compare",
      comparison: {
        against: "wip",
        comparisonDirection: "forward",
        branch: null,
        commit: null,
      },
      isInMergeConflict: false,
      merge: null,
    };
    await datasource.saveCurrentRepoState(repoId, updated);
    const appState = await getCommitState(
      datasource,
      repoId,
      currentRepoState.commit
    );
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      appState
    );
    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    if (!user.id) {
      return null;
    }
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (!currentRepoState.isInMergeConflict) {
      return null;
    }
    const originSha = currentRepoState.merge.originSha;
    const intoSha = currentRepoState.merge.intoSha;
    const fromSha = currentRepoState.merge.fromSha;

    const intoCommitState = await getCommitState(datasource, repoId, intoSha);
    const fromCommitState = await getCommitState(datasource, repoId, fromSha);
    const history = await getHistory(
      datasource,
      repoId,
      currentRepoState.commit
    );

    const origin = originSha
      ? await datasource.readCommit(repoId, originSha)
      : null;
    const { sha: baseSha, idx: baseIdx } = !origin
      ? history[history.length - 1]
      : getBaseDivergenceSha(history, origin);

    const baseCommit = await getCommitState(datasource, repoId, baseSha);
    const baseDiff = getStateDiffFromCommitStates(fromCommitState, baseCommit);
    const baseCommitData = await datasource.readCommit(repoId, baseSha);
    const mergeCommitData = await datasource.readCommit(repoId, fromSha);
    const mergeBaseCommit: CommitData = {
      ...baseCommitData,
      diff: baseDiff,
      idx: mergeCommitData.idx + 1,
      historicalParent: originSha,
      authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
      userId: user.id,
      parent: fromSha,
    };
    mergeBaseCommit.sha = getDiffHash(mergeBaseCommit);
    const rebaseList = [mergeBaseCommit];
    for (let idx = baseIdx + 1; idx < history.length; idx++) {
      const commitToRebase = await datasource.readCommit(
        repoId,
        history[history.length - idx - 1].sha
      );
      commitToRebase.authorUserId =
        rebaseList[rebaseList.length - 1].authorUserId ??
        rebaseList[rebaseList.length - 1].userId;
      commitToRebase.userId = user.id;
      commitToRebase.parent = rebaseList[rebaseList.length - 1].sha;
      commitToRebase.historicalParent = rebaseList[rebaseList.length - 1].sha;
      commitToRebase.idx = rebaseList[rebaseList.length - 1].idx + 1;
      commitToRebase.sha = getDiffHash(commitToRebase);
      rebaseList.push(commitToRebase);
    }
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    const mergeDiff = getStateDiffFromCommitStates(
      intoCommitState,
      currentKVState
    );
    const mergeCommit: CommitData = {
      parent: rebaseList[rebaseList.length - 1].sha,
      historicalParent: rebaseList[rebaseList.length - 1].sha,
      idx: rebaseList[rebaseList.length - 1].idx + 1,
      message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
      mergeBase: mergeBaseCommit.sha,
      userId: user.id,
      timestamp: new Date().toString(),
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
      await datasource.saveBranch(repoId, currentRepoState.branch, {
        ...branchState,
        lastCommit: mergeCommit.sha,
      });

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
      },
    };
    await datasource.saveCurrentRepoState(repoId, updated);
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
    const stashList = await datasource.readStash(repoId, currentRepoState) ?? [];
    stashList?.push(currentKVState);
    await datasource.saveStash(repoId, currentRepoState, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unstagedState
    );

    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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

    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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

    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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

    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    if (!user.id) {
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
      return null;
    }
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
      authorUserId: commitToRevert.authorUserId,
      timestamp: new Date().toString(),
      diff: reversionDiff,
    };
    revertCommit.sha = getDiffHash(revertCommit);
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
              lastLocalCommit: revertCommit.sha
            }
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            return {
              ...branch,
              lastLocalCommit: revertCommit.sha
            }
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

    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
    const state = datasource.saveRenderedState(repoId, sanitiziedRenderedState);
    return state;
  } catch (e) {
    return null;
  }
};

export const getCanAutofixReversion = async (
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
    if (!user.id) {
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
    if (!user.id) {
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

    const currentCommit = await datasource.readCommit(
      repoId,
      currentRepoState.commit
    );

    const autofixDiff = getStateDiffFromCommitStates(
      unstagedState,
      autoFixState
    );

    const autofixCommit: CommitData = {
      parent: currentCommit.sha,
      historicalParent: currentCommit.sha,
      idx: currentCommit.idx + 1,
      message: `Fix-Forward [${reversionSha}]: (message) ${commitToRevert.message}`,
      userId: user.id,
      authorUserId: commitToRevert.authorUserId,
      timestamp: new Date().toString(),
      diff: autofixDiff,
    };
    autofixCommit.sha = getDiffHash(autofixCommit);
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

    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
    const state = await datasource.saveRenderedState(repoId, sanitiziedRenderedState);
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
    const sanitiziedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    if (!user.id) {
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
  if (!user.id) {
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
    const sanitizedRenderedState = await sanitizeApplicationKV(datasource, renderedState);
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
    const updated: RepoState = {
      ...current,
      commit: sha,
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

export const renderApiReponse = async (
  repoId: string,
  datasource: DataSource,
  renderedApplicationState: RenderedApplicationState,
  applicationKVState: ApplicationKVState,
  repoState: RepoState
): Promise<ApiResponse> => {
  const apiStoreInvalidity = await getInvalidStates(
    datasource,
    applicationKVState
  );
  const manifests = await getPluginManifests(
    datasource,
    renderedApplicationState?.plugins
  );
  const schemaMap = manifestListToSchemaMap(manifests);
  const branch = await getBranchFromRepoState(repoId, datasource, repoState);
  const baseBranch = await getBaseBranchFromBranch(repoId, datasource, branch);
  const lastCommit = await getLastCommitFromRepoState(
    repoId,
    datasource,
    repoState
  );
  const mergeCommit = repoState.isInMergeConflict
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
    const [canPopStashedChanges, stashSize] = await Promise.all([
      getCanPopStashedChanges(datasource, repoId),
      getStashSize(datasource, repoId),
    ]);
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
      mergeCommit,
    };
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
      mergeCommit,
    };
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
    const {
      apiDiff,
      diff,
      beforeState,
      beforeApiStoreInvalidity,
      beforeManifests,
      beforeSchemaMap,
    } = await getApiDiffFromComparisonState(
      repoId,
      datasource,
      repoState,
      applicationKVState
    );

    const conflictResolution = repoState?.isInMergeConflict
      ? getConflictResolution(diff, repoState?.merge?.conflictList)
      : null;

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
        mergeCommit,
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
      mergeCommit,
      conflictResolution,
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


export const sanitizeApplicationKV = async (
  datasource: DataSource,
  renderedAppState: RenderedApplicationState
): Promise<RenderedApplicationState> => {
  const unrendered = await convertRenderedCommitStateToKv(datasource, renderedAppState);
  const rendered =  await convertCommitStateToRenderedState(datasource, unrendered);
  rendered.plugins = uniqueKVObj(rendered.plugins);
  rendered.licenses = uniqueKVObj(rendered.licenses);
  rendered.binaries = uniqueStrings(rendered.binaries);
  return rendered;
}

export const getDefaultComparison = async (
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
    if (!currentRepoState?.commit) {
      return "forward";
    }
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
      return getStateDiffFromCommitStates(currentRepoState.merge.mergeState, currentKVState);
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

export const getIsWip = async (
  datasource: DataSource,
  repoId: string,
  repoState: RepoState,
  unstagedState: ApplicationKVState,
  applicationKVState: ApplicationKVState,

) => {
  if (repoState?.isInMergeConflict) {
      const diff = await getMergeConflictDiff(datasource, repoId);
      return !diffIsEmpty(diff);
  }
  const diff = getStateDiffFromCommitStates(unstagedState, applicationKVState);
  return !diffIsEmpty(diff);
}
