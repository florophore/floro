import path from "path";
import { existsAsync, vReposPath, getUserAsync } from "./filestructure";
import {
  getCurrentBranch,
  getUnstagedCommitState,
  updateCurrentCommitSHA,
  getCurrentCommitSha,
  getHistory,
  getCommitState,
  Branch,
  updateCurrentWithNewBranch,
  updateCurrentWithSHA,
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
  convertRenderedCommitStateToKv,
  getStateDiffFromCommitStates,
  getApplicationState,
  RenderedApplicationState,
  convertCommitStateToRenderedState,
  canAutoMergeOnTopCurrentState,
  RepoState,
  EMPTY_COMMIT_DIFF,
  getBranchIdFromName,
  BRANCH_NAME_REGEX,
  updateCurrentBranch,
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
} from "./plugins";
import { LicenseCodes } from "./licensecodes";
import { DataSource } from "./datasource";

export const writeRepoDescription = async (
  datasource: DataSource,
  repoId?: string,
  description?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!description) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }

  try {
    const renderedState = await datasource.readRenderedState(repoId);
    renderedState.description = splitTextForDiff(description);
    await datasource.saveRenderedState(repoId, renderedState);
    return renderedState;
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
    await datasource.saveRenderedState(repoId, renderedState);
    return renderedState;
  } catch (e) {
    return null;
  }
};

export const readRepoLicenses = async (
  datasource: DataSource,
  repoId?: string
): Promise<Array<{ key: string; value: string }>> => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const renderedState = await datasource.readRenderedState(repoId);
    return renderedState.licenses;
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

export const createRepoBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchName?: string,
  baseBranchId?: string
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
    const sha = await getCurrentCommitSha(datasource, repoId);
    const user = await getUserAsync();

    if (!user) {
      return null;
    }

    if (!BRANCH_NAME_REGEX.test(branchName)) {
      return null;
    }

    const branchId = getBranchIdFromName(branchName);
    const basedOffOf = baseBranchId ?? currentRepoState?.branch;
    const branch: Branch = {
      id: branchId,
      lastCommit: sha,
      createdBy: user.id,
      createdAt: new Date().toString(),
      name: branchName,
      baseBranchId: basedOffOf,
    };

    const currentBranches = await datasource.readBranches(repoId);
    const branchAlreadyExists = currentBranches
      .map((v) => v.id)
      .includes(branchId);
    if (branchAlreadyExists) {
      return null;
    }
    const branchData = await datasource.saveBranch(repoId, branchName, branch);

    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    branchMetaState.allBranches.push({
      branchId: branchData.id,
      lastLocalCommit: sha,
      lastRemoteCommit: null,
    });
    branchMetaState.userBranches.push({
      branchId: branchData.id,
      lastLocalCommit: sha,
      lastRemoteCommit: null,
    });

    await datasource.saveBranchesMetaState(repoId, branchMetaState);

    return await updateCurrentWithNewBranch(datasource, repoId, branchId);
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
    const currentBranches = await datasource.readBranches(repoId);
    if (!currentBranches.map((v) => v.id).includes(branchId)) {
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
    return await updateCurrentBranch(datasource, repoId, branchId);
  } catch (e) {
    return null;
  }
};

export const deleteUserBranch = async (
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
    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState.branch == branchId) {
      return null;
    }
    const currentBranches = await datasource.readBranches(repoId);
    if (!currentBranches.map((v) => v.id).includes(branchId)) {
      return null;
    }

    const branchMetaState = await datasource.readBranchesMetaState(repoId);
    const branchMeta = branchMetaState.allBranches.find(
      (bm) => bm.branchId == branchId
    );
    branchMetaState.userBranches = branchMetaState.userBranches.filter(
      (bm) => bm.branchId != branchId
    );
    if (branchMeta.lastRemoteCommit) {
      branchMetaState.allBranches = branchMetaState.allBranches.filter(
        (bm) => bm.branchId != branchId
      );
    }
    await datasource.saveBranchesMetaState(repoId, branchMetaState);
    return await datasource.readRenderedState(repoId);
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
  sha: string|null
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
  sha: string|null
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

    const currentState = await datasource.readCurrentRepoState(repoId);
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
      await updateCurrentCommitSHA(datasource, repoId, sha, false);
    } else {
      await updateCurrentCommitSHA(datasource, repoId, sha, false);
    }
    await datasource.saveHotCheckpoint(repoId, sha, currentKVState);
    return commit;
  } catch (e) {
    return null;
  }
};

export const checkoutSha = async (
  datasource: DataSource,
  repoId: string,
  sha: string | null
) => {
  if (!repoId) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    if (sha) {
      const commit = await datasource.readCommit(repoId, sha);
      if (!commit) {
        return null;
      }
    }

    const current = await updateCurrentWithSHA(datasource, repoId, sha, false);
    if (!current) {
      return null;
    }
    return current;
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

    const rootDependencies = updatedManifests.filter(
      (m) => Object.keys(m.imports).length == 0
    );
    const currentRenderedState = await datasource.readRenderedState(repoId);
    const lexicallyOrderedPlugins = updatedPlugins.sort((a, b) => {
      if (a.key == b.key) return 0;
      return a.key > b.key ? 1 : -1;
    });
    let store = currentRenderedState.store;
    for (let { key } of lexicallyOrderedPlugins) {
      if (!store[key]) {
        store[key] = {};
      }
    }
    for (const rootManifest of rootDependencies) {
      const schemaMap = await getSchemaMapForManifest(datasource, rootManifest);
      store = await cascadePluginState(datasource, schemaMap, store);
    }
    currentRenderedState.store = store;
    currentRenderedState.plugins = sortedUpdatedPlugins;
    await datasource.saveRenderedState(repoId, currentRenderedState);
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
    renderedState.store = await cascadePluginState(
      datasource,
      schemaMap,
      stateStore
    );
    await datasource.saveRenderedState(repoId, renderedState);
    return renderedState;
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
    if (canAutoCommitMergeStates) {
      const currentAppState = await getApplicationState(datasource, repoId);
      const currentKVState = await convertRenderedCommitStateToKv(
        datasource,
        currentAppState
      );
      const canAutoMergeOnTopOfCurrentState =
        await canAutoMergeOnTopCurrentState(datasource, repoId, fromSha);

      const unstagedState = await getUnstagedCommitState(datasource, repoId);
      const currentDiff = getStateDiffFromCommitStates(
        unstagedState,
        currentKVState
      );

      const originSha = await getDivergenceOriginSha(
        datasource,
        repoId,
        fromSha,
        currentRepoState.commit
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

      if (originSha == currentRepoState.commit) {
        const currentCommit = await datasource.readCommit(
          repoId,
          currentRepoState.commit
        );
        const fromCommit = await datasource.readCommit(repoId, fromSha);
        // NEED TO ADD BASE SHA HERE FOR ROLLBACK
        const mergeCommit: CommitData = {
          parent: fromSha,
          historicalParent: fromSha,
          idx: fromCommit.idx + 1,
          message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
          mergeBase: currentCommit.sha,
          userId: user.id,
          timestamp: new Date().toString(),
          diff: EMPTY_COMMIT_DIFF,
        };

        mergeCommit.sha = getDiffHash(mergeCommit);
        await datasource.saveCommit(repoId, mergeCommit.sha, mergeCommit);

        if (currentRepoState.branch) {
          const branchState = await datasource.readBranch(
            repoId,
            currentRepoState.branch
          );
          const o = await datasource.saveBranch(repoId, currentRepoState.branch, {
            ...branchState,
            lastCommit: mergeCommit.sha,
          });

          const branchMetaState = await datasource.readBranchesMetaState(
            repoId
          );
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

          await updateCurrentCommitSHA(
            datasource,
            repoId,
            mergeCommit.sha,
            false
          );
        } else {
          await updateCurrentCommitSHA(
            datasource,
            repoId,
            mergeCommit.sha,
            false
          );
        }
        if (!diffIsEmpty(currentDiff) && canAutoMergeOnTopOfCurrentState) {
          const mergeCurrState = await getMergedCommitState(
            datasource,
            mergeState,
            currentKVState,
            intoCommitState
          );
          const currentAfterRestorationRendered =
            await convertCommitStateToRenderedState(datasource, mergeCurrState);
          const state = await datasource.saveRenderedState(
            repoId,
            currentAfterRestorationRendered
          );
          return state;
        } else {
          const renderedState = await convertCommitStateToRenderedState(
            datasource,
            mergeState
          );
          const state = await datasource.saveRenderedState(
            repoId,
            renderedState
          );
          return state;
        }
      }

      const origin = originSha
        ? await datasource.readCommit(repoId, originSha)
        : null;
      const { sha: baseSha, idx: baseIdx } = !origin
        ? history[history.length - 1]
        : getBaseDivergenceSha(history, origin);

      const mergeDiff = getStateDiffFromCommitStates(
        fromCommitState,
        mergeState
      );
      const baseCommit = await getCommitState(datasource, repoId, baseSha);
      const baseDiff = getStateDiffFromCommitStates(
        intoCommitState,
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
        idx: rebaseList[rebaseList.length - 1].idx,
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
      await updateCurrentCommitSHA(datasource, repoId, mergeCommit.sha, false);
      if (!diffIsEmpty(currentDiff) && canAutoMergeOnTopOfCurrentState) {
        const mergeCurrState = await getMergedCommitState(
          datasource,
          mergeState,
          currentKVState,
          intoCommitState
        );
        const currentAfterRestorationRendered =
          await convertCommitStateToRenderedState(datasource, mergeCurrState);
        const state = await datasource.saveRenderedState(
          repoId,
          currentAfterRestorationRendered
        );
        return state;
      } else {
        const renderedState = await convertCommitStateToRenderedState(
          datasource,
          mergeState
        );
        const state = await datasource.saveRenderedState(repoId, renderedState);
        return state;
      }
    } else {
      // CANT AUTO MERGE
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

      const updated: RepoState = {
        ...currentRepoState,
        isInMergeConflict: true,
        merge: {
          originSha,
          fromSha,
          intoSha: currentRepoState.commit,
          direction,
        },
      };
      await datasource.saveCurrentRepoState(repoId, updated);
      const renderedState = await convertCommitStateToRenderedState(
        datasource,
        mergeState
      );
      await datasource.saveRenderedState(repoId, renderedState);
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
    const updated: RepoState = {
      ...currentRepoState,
      isInMergeConflict: true,
      merge: {
        ...currentRepoState.merge,
        direction,
      },
    };
    await datasource.saveCurrentRepoState(repoId, updated);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      mergeState
    );
    await datasource.saveRenderedState(repoId, renderedState);
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
    await datasource.saveRenderedState(repoId, renderedState);
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
    // m2
    const baseDiff = getStateDiffFromCommitStates(intoCommitState, baseCommit);
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
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const mergeDiff = getStateDiffFromCommitStates(
      unstagedState,
      currentKVState
    );
    const mergeCommit: CommitData = {
      parent: rebaseList[rebaseList.length - 1].sha,
      historicalParent: rebaseList[rebaseList.length - 1].sha,
      idx: rebaseList[rebaseList.length - 1].idx,
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
    await updateCurrentCommitSHA(datasource, repoId, mergeCommit.sha, false);
    return currentAppState;
  } catch (e) {
    return null;
  }
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
    const currentAppState = await getApplicationState(datasource, repoId);
    const currentKVState = await convertRenderedCommitStateToKv(
      datasource,
      currentAppState
    );
    return getStateDiffFromCommitStates(mergeState, currentKVState);
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
    if (!commitToRevert || history[commitToRevert.idx].sha != reversionSha) {
      return null;
    }
    let shaBeforeReversion = history[commitToRevert.idx + 1]?.sha ?? null;
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
            branch.lastLocalCommit = reversionSha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = reversionSha;
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
    const state = await datasource.saveRenderedState(repoId, renderedState);
    return state;
  } catch (e) {
    return null;
  }
};

export const canAutofxReversion = async (
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
    if (!commitToRevert || history[commitToRevert.idx].sha != reversionSha) {
      return false;
    }
    let shaBeforeReversion = history[commitToRevert.idx + 1]?.sha ?? null;
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
    if (!commitToRevert || history[commitToRevert.idx].sha != reversionSha) {
      return null;
    }
    let shaBeforeReversion = history[commitToRevert.idx + 1]?.sha ?? null;
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
      message: `Autofix [${reversionSha}]: (message) ${commitToRevert.message}`,
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
            branch.lastLocalCommit = reversionSha;
          }
          return branch;
        }
      );

      branchMetaState.userBranches = branchMetaState.userBranches.map(
        (branch) => {
          if (branch.branchId == branchState.id) {
            branch.lastLocalCommit = reversionSha;
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
    const state = await datasource.saveRenderedState(repoId, renderedState);
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
    return await datasource.saveRenderedState(repoId, renderedState);
  } catch (e) {
    return null;
  }
};

export const canCherryPickRevision = async (
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

    return canCherryPick;
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
    return await datasource.saveRenderedState(repoId, renderedState);
  } catch (e) {
    return null;
  }
};

export const canStash = async (datasource: DataSource, repoId: string) => {
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
    const stashList = await datasource.readStash(
      repoId,
      currentRepoState.commit
    );
    stashList.push(currentKVState);
    await datasource.saveStash(repoId, currentRepoState.commit, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      unstagedState
    );
    return await datasource.saveRenderedState(repoId, renderedState);
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
    const stashList = await datasource.readStash(
      repoId,
      currentRepoState.commit
    );
    return stashList.length;
  } catch (e) {
    return null;
  }
};

export const canPopStashedChanges = async (
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

    const stashList = await datasource.readStash(
      repoId,
      currentRepoState.commit
    );
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

    const stashList = await datasource.readStash(
      repoId,
      currentRepoState.commit
    );
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
    await datasource.saveStash(repoId, currentRepoState.commit, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      appliedStash
    );
    return await datasource.saveRenderedState(repoId, renderedState);
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
    const unstagedState = await getUnstagedCommitState(datasource, repoId);

    const stashList = await datasource.readStash(
      repoId,
      currentRepoState.commit
    );
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
    await datasource.saveStash(repoId, currentRepoState.commit, stashList);
    const renderedState = await convertCommitStateToRenderedState(
      datasource,
      appliedStash
    );
    return await datasource.saveRenderedState(repoId, renderedState);
  } catch (e) {
    return null;
  }
};
