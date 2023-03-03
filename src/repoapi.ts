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
import sizeof from "object-sizeof";

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

export const switchRepoBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchName?: string
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
    if (
      currentBranches
        .map((v) => v.name.toLowerCase())
        .includes(branchName.toLowerCase())
    ) {
      return await updateCurrentWithNewBranch(datasource, repoId, branchName);
    }
    const sha = await getCurrentCommitSha(datasource, repoId);
    const user = await getUserAsync();
    if (!user) {
      return null;
    }

    const branch: Branch = {
      firstCommit: sha,
      lastCommit: sha,
      createdBy: user.id,
      createdAt: new Date().toString(),
      name: branchName,
    };
    const branchData = await datasource.saveBranch(repoId, branchName, branch);
    if (!branchData) {
      return null;
    }
    return await updateCurrentWithNewBranch(datasource, repoId, branchName);
  } catch (e) {
    return null;
  }
};

//export const deleteBranch = async (
//  datasource: DataSource,
//  repoId?: string,
//  branchName?: string
//) => {
//  if (!repoId) {
//    return null;
//  }
//  const exists = await datasource.repoExists(repoId);
//  if (!exists) {
//    return null;
//  }
//  try {
//    const currentBranches = await datasource.getBranches(repoId);
//    if (
//      !currentBranches
//        .map((v) => v.name.toLowerCase())
//        .includes(branchName.toLowerCase())
//    ) {
//      return null;
//    }
//    const current = await datasource.getCurrentState(repoId);
//    // ADD CAN DELETE
//    if (
//      current.branch &&
//      current.branch.toLowerCase() == branchName.toLocaleLowerCase()
//    ) {
//      // check is just localf
//      await datasource.deleteBranch(repoId, branchName);
//    }
//    const branches = await datasource.getBranches(repoId);
//    return branches;
//  } catch (e) {
//    return null;
//  }
//};

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
  repoId?: string,
  sha?: string
) => {
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
  branchName?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!branchName) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await datasource.readBranch(repoId, branchName);
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
  repoId?: string,
  sha?: string
) => {
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
  branchName?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!branchName) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await datasource.readBranch(repoId, branchName);
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
      // be careful
      if (!branchState) {
        //TODO: FIX THIS
        return null;
      }
      await datasource.saveBranch(repoId, currentState.branch, {
        ...branchState,
        lastCommit: sha,
      });
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

export const checkoutBranch = async (
  datasource: DataSource,
  repoId?: string,
  branchName?: string
) => {
  if (!repoId) {
    return null;
  }
  if (!branchName) {
    return null;
  }
  const exists = await datasource.repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentBranches = await datasource.readBranches(repoId);
    const user = await getUserAsync();
    if (!user) {
      return null;
    }
    if (
      !currentBranches
        .map((v) => v.name.toLowerCase())
        .includes(branchName.toLowerCase())
    ) {
      return null;
    }

    const branchData = await datasource.readBranch(repoId, branchName);
    if (!branchData) {
      return null;
    }
    return await updateCurrentWithNewBranch(datasource, repoId, branchName);
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
    if (currentRepoState.isMerge) {
      return null;
    }
    const commitStateResult = await getMergeCommitStates(
      datasource,
      repoId,
      fromSha,
      currentRepoState.commit, // PROBLEM CHILD
    );
    if (!commitStateResult) {
      return null;
    }
    const { fromCommitState, intoCommitState, originCommit } = commitStateResult;
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
        originCommit,
      );

      if (originSha == currentRepoState.commit) {
        await updateCurrentCommitSHA(datasource, repoId, fromSha, false);

        if (currentRepoState.branch) {
          const branchState = await datasource.readBranch(
            repoId,
            currentRepoState.branch
          );
          await updateCurrentCommitSHA(datasource, repoId, fromSha, false);
          await datasource.saveBranch(repoId, currentRepoState.branch, {
            ...branchState,
            lastCommit: fromSha,
          });
        } else {
          await updateCurrentCommitSHA(datasource, repoId, fromSha, false);
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

      const mergeDiff = getStateDiffFromCommitStates(fromCommitState, mergeState);
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

      const mergeState = await getMergedCommitState(
        datasource,
        fromCommitState,
        intoCommitState,
        originCommit,
        "yours"
      );

      const updated: RepoState = {
        ...currentRepoState,
        isMerge: true,
        merge: {
          originSha,
          fromSha,
          intoSha: currentRepoState.commit,
          direction: "yours"
        },
      };
      await datasource.saveCurrentRepoState(repoId, updated);
      const renderedState = await convertCommitStateToRenderedState(datasource, mergeState);
      await datasource.saveRenderedState(repoId, renderedState);
      return renderedState;
    }

  } catch (e) {
    console.log("E", e);
    return null;
  }
};
