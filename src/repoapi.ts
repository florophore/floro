import path from "path";
import {
  existsAsync,
  vReposPath,
  getUserAsync,
} from "./filestructure";
import {
  getLocalBranches,
  getRepoSettings,
  getCurrentBranch,
  getRepoState,
  saveDiffListToCurrent,
  getCurrentState,
  getUnstagedCommitState,
  buildStateStore,
  writeCommit,
  getLocalBranch,
  updateLocalBranch,
  updateCurrentCommitSHA,
  getCurrentCommitSha,
  getHistory,
  readCommit,
  getCommitState,
  Branch,
  updateCurrentWithNewBranch,
  updateCurrentWithSHA,
  deleteLocalBranch,
  canCommit,
  getAddedDeps,
  getRemovedDeps,
  getPluginsToRunUpdatesOn,
  getProposedStateFromDiffListOnCurrent,
  applyStateDiffToCommitState,
  convertStateStoreToKV,
  renderCommitState,
  getMergeCommitStates,
  canAutoMergeCommitStates,
  uniqueKV,
  canAutoMergeOnTopCurrentState,
  diffIsEmpty,
  getMergedCommitState,
  getDivergenceOriginSha,
  getCommitStateDiffList,
  renderDiffList,
  getBaseDivergenceSha
} from "./repo";
import {
  applyDiff,
  CommitData,
  DiffElement,
  getDiff,
  getDiffHash,
  getTextDiff,
} from "./versioncontrol";
import {
  getStateFromKVForPlugin,
  getKVStateForPlugin,
  getRootSchemaForPlugin,
  hasPlugin,
  PluginElement,
  pluginManifestsAreCompatibleForUpdate,
  readPluginManifest,
  Manifest,
  getSchemaMapForManifest,
  getPluginManifests,
  getManifestMapFromManifestList,
  getDownstreamDepsInSchemaMap,
  getUpstreamDepsInSchemaMap,
  pluginListToMap,
  pluginMapToList,
  topSortManifests,
  manifestListToPluginList,
  cascadePluginState,
} from "./plugins";
import { LicenseCodes } from "./licensecodes";

export const repoExists = async (repoId?: string): Promise<boolean> => {
  if (!repoId) {
    return false;
  }
  return await existsAsync(path.join(vReposPath, repoId));
};

export const writeRepoDescription = async (repoId?: string, description?: string) => {
    if (!repoId) {
      return null;
    }
    if (!description) {
      return null;
    }
    const exists = await repoExists(repoId);
    if (!exists) {
      return null;
    }

    try {
      const unstagedState = await getUnstagedCommitState(repoId, getCurrentState);
      const diff = getTextDiff(unstagedState.description?.join(""), description);
      const state = await saveDiffListToCurrent(repoId, [
        {
          diff,
          namespace: "description",
        },
      ],
      getCurrentState);

      const nextState = await applyStateDiffToCommitState(unstagedState, state.diff);
      return nextState;
    } catch (e) {
      return null;
    }
}

export const writeRepoLicenses = async (
  repoId?: string,
  licensesInput?: Array<{ key: string; value: string }>
) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
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

    const unstagedState = await getUnstagedCommitState(repoId, getCurrentState);
    const diff = getDiff(unstagedState.licenses, licenses);
    const state = await saveDiffListToCurrent(repoId, [
      {
        diff,
        namespace: "licenses",
      },
    ],
    getCurrentState);
    const nextState = await applyStateDiffToCommitState(unstagedState, state.diff);
    return nextState;
  } catch (e) {
    return null;
  }
};

export const readRepoLicenses = async (repoId?: string): Promise<Array<{key: string, value: string}>> => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const state = await getRepoState(repoId, getCurrentState);
    return state.licenses;
  } catch (e) {
    return null;
  }
}

export const readRepoDescription = async (repoId?: string) => {
    if (!repoId) {
      return null;
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      return;
    }
    const state = await getRepoState(repoId, getCurrentState);
    return state.description;
}

export const getCurrentRepoBranch = async (repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await getCurrentBranch(repoId, getCurrentState);
    return branch;
  } catch (e) {
    return null;
  }
};
export const getRepoBranches = async (repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branches = await getLocalBranches(repoId);
    return branches;
  } catch (e) {
    return null;
  }
};

export const switchRepoBranch = async (
  repoId?: string,
  branchName?: string
) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentBranches = await getLocalBranches(repoId);
    if (
      currentBranches
        .map((v) => v.name.toLowerCase())
        .includes(branchName.toLowerCase())
    ) {
      return null;
    }
    const sha = await getCurrentCommitSha(repoId, getCurrentState);
    if (!sha) {
      return null;
    }
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
    const branchData = await updateLocalBranch(repoId, branchName, branch);
    if (!branchData) {
      return null;
    }
    return await updateCurrentWithNewBranch(repoId, branchName, getCurrentState);
  } catch (e) {
    return null;
  }
};

export const deleteBranch = async (repoId?: string, branchName?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentBranches = await getLocalBranches(repoId);
    if (
      !currentBranches
        .map((v) => v.name.toLowerCase())
        .includes(branchName.toLowerCase())
    ) {
      return null;
    }
    const current = await getCurrentState(repoId);
    // ADD CAN DELETE
    if (
      current.branch &&
      current.branch.toLowerCase() == branchName.toLocaleLowerCase()
    ) {
      await deleteLocalBranch(repoId, branchName);
    }
    const branches = await getLocalBranches(repoId);
    return branches;
  } catch (e) {
    return null;
  }
}

export const readSettings = async (repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const settings = await getRepoSettings(repoId);
    if (!settings) {
      return null;
    }
    return settings;
  } catch (e) {
    return null;
  }
};

export const readLastCommit = async (repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const sha = await getCurrentCommitSha(repoId, getCurrentState);
    if (!sha) {
      return null;
    }
    const commit = await readCommit(repoId, sha);
    if (!commit) {
      return null;
    }
    return commit;
  } catch (e) {
    return null;
  }
};


export const readRepoCommit = async (repoId?: string, sha?: string) => {
  if (!repoId) {
    return null;
  }
  if (!sha) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const commit = await readCommit(repoId, sha);
    if (!commit) {
      return null;
    }
    return commit;
  } catch (e) {
    return null;
  }
};

export const readCurrentHistory = async (repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const sha = await getCurrentCommitSha(repoId, getCurrentState);
    if (!sha) {
      return [];
    }
    const history = await getHistory(repoId, sha);
    if (!history) {
      return null;
    }
    return history;
  } catch(e) {
    return null;
  }
};

export const readBranchHistory = async (repoId?: string, branchName?: string) => {
  if (!repoId) {
    return null;
  }
  if (!branchName) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await getLocalBranch(repoId, branchName);
    if (!branch) {
      return null;
    }
    const history = await getHistory(repoId, branch.lastCommit);
    if (!history) {
      return null;
    }
    return history;
  } catch(e) {
    return null;
  }
};

export const readCommitHistory = async (repoId?: string, sha?: string) => {
  if (!repoId) {
    return null;
  }
  if (!sha) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const commit = await readCommit(repoId, sha);
    if (!commit) {
      return null;
    }
    const history = await getHistory(repoId, sha);
    if (!history) {
      return null;
    }
    return history;
  } catch (e) {
    return null;
  }
};

export const readCurrentState = async (repoId?: string) => {
  if (!repoId) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const state = await getRepoState(repoId, getCurrentState);
    return await renderCommitState(state, readPluginManifest);
  } catch (e) {
    return null;
  }
}

export const readCommitState = async (repoId?: string, sha?: string) => {
  if (!repoId) {
    return null;
  }
  if (!sha) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const state = await getCommitState(repoId, sha);
    if (!state) {
      return null;
    }
    return await renderCommitState(state, readPluginManifest);
  } catch (e) {
    return null;
  }
};

export const readBranchState = async (repoId?: string, branchName?: string) => {
  if (!repoId) {
    return null;
  }
  if (!branchName) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const branch = await getLocalBranch(repoId, branchName);
    if (!branch) {
      return null;
    }
    const state = await getCommitState(repoId, branch.lastCommit);
    if (!state) {
      return null;
    }
    return renderCommitState(state, readPluginManifest)
  } catch (e) {
    return null;
  }
};

export const writeRepoCommit = async (repoId?: string, message?: string) => {
  if (!repoId) {
    return null;
  }
  if (!message) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const user = await getUserAsync();
    if (!user.id) {
      return null;
    }
    const commitIsValid = await canCommit(repoId, user, message, getCurrentState);
    if (!commitIsValid) {
      return null;
    }
    const currentState = await getCurrentState(repoId);
    const currentSha = await getCurrentCommitSha(repoId, getCurrentState);
    const parent = currentSha ? await readCommit(repoId, currentSha) : null;
    const idx = parent ? parent.idx + 1 : 0;
    const timestamp = (new Date()).toString();
    const commitData: CommitData = {
      parent: parent ? parent.sha : null,
      historicalParent: parent ? parent.sha : null,
      idx: idx,
      diff: currentState.diff,
      timestamp,
      userId: user.id,
      message
    };
    const sha = getDiffHash(commitData);
    const commit = await writeCommit(repoId, sha, {sha, ...commitData});
    if (!commit) {
      return null;
    }
    if (currentState.branch) {
      const branchState = await getLocalBranch(repoId, currentState.branch);
      // be careful
      if (!branchState) {
        //TODO: FIX THIS
        return null;
      }
      await updateLocalBranch(repoId, currentState.branch, {
        ...branchState,
        lastCommit: sha
      });
      await updateCurrentCommitSHA(repoId, sha, false, getCurrentState);
    } else {
      await updateCurrentCommitSHA(repoId, sha, false, getCurrentState);
    }
    return commit;
  } catch (e) {
    return null;
  }
}

export const checkoutBranch = async (repoId?: string, branchName?: string) => {
  if (!repoId) {
    return null;
  }
  if (!branchName) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const currentBranches = await getLocalBranches(repoId);
    const user = await getUserAsync();
    if (!user) {
      return null;
    }
    if (!currentBranches.map(v => v.name.toLowerCase()).includes(branchName.toLowerCase())) {
      return null;
    }

    const branchData = await getLocalBranch(repoId, branchName);
    if (!branchData) {
      return null;
    }
    return await updateCurrentWithNewBranch(repoId, branchName, getCurrentState);
  } catch (e) {
    return null;
  }
}

export const checkoutSha = async (repoId?: string, sha?: string) => {
  if (!repoId) {
    return null;
  }
  if (!sha) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const commit = await readCommit(repoId, sha);
    if (!commit) {
      return null;
    }

    const current = await updateCurrentWithSHA(repoId, sha, false, getCurrentState);
    if (!current) {
      return null;
    }
    return current;
  } catch (e) {
    return null;
  }
}

export const updatePlugins = async (
  repoId: string,
  plugins: Array<PluginElement>,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
  ) => {
  if (!repoId) {
    return null;
  }
  if (!plugins) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const unstagedState = await getUnstagedCommitState(repoId, getCurrentState);
    const addedPlugins = getAddedDeps(unstagedState.plugins, plugins);
    const removedPlugins = getRemovedDeps(unstagedState.plugins, plugins);
    const oldManifests = await getPluginManifests(unstagedState.plugins, pluginFetch);
    const newManifests = await getPluginManifests(plugins, pluginFetch);
    const oldManifestMap = getManifestMapFromManifestList(oldManifests);
    const newManifestMap = getManifestMapFromManifestList(newManifests);
    for (const removedManifest of removedPlugins) {
      const downstreamDeps = getDownstreamDepsInSchemaMap(oldManifestMap, removedManifest.key);
      for(const downstreamDep of downstreamDeps) {
        // checks the dep is truly deleted and not updated
        // ensure any downstream dependencies are no longer present
        // otherwise they have to be removed first in a separate request
        if (newManifestMap[downstreamDep] && !newManifestMap[removedManifest.key]) {
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
      const addedDepImportsList = pluginMapToList(newManifestMap[addedDep.key].imports);
      const addedDepImportManifests = await getPluginManifests(addedDepImportsList, pluginFetch);
      const addedDepImportsManifestMap = getManifestMapFromManifestList([
        newManifestMap[addedDep.key],
        ...addedDepImportManifests,
      ]);
      // need to construct deps from imports
      const upstreamDeps = getUpstreamDepsInSchemaMap(addedDepImportsManifestMap, addedDep.key);
      for (const upstreamDep of upstreamDeps) {
        const upstreamManifest = await pluginFetch(upstreamDep, addedDepImportsManifestMap[upstreamDep].version);
        if (newManifestMap[upstreamDep]) {
          if (newManifestMap[upstreamDep].version != upstreamManifest.version) {
            const areCompatible = await pluginManifestsAreCompatibleForUpdate(
              upstreamManifest,
              newManifestMap[upstreamDep],
              pluginFetch
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
          })
        }
      }
    }
    // do top sort
    const updatedPlugins = uniqueKV([...plugins, ...pluginsToAppend]);
    const updatedManifests = await getPluginManifests(updatedPlugins, pluginFetch);
    const updatedManifestMap =  getManifestMapFromManifestList(updatedManifests);
    for (let updatedPlugin of updatedManifests) {
      const upstreamDeps = getUpstreamDepsInSchemaMap(updatedManifestMap, updatedPlugin.name);
      for (const upstreamDep of upstreamDeps) {
        const upstreamManifest = await pluginFetch(upstreamDep, updatedPlugin.imports[upstreamDep]);
        if (upstreamManifest.version != updatedManifestMap[upstreamDep].version) {
          // we need to know that the depended upon version is subset of the version
          // being used by the app to ensure read safety
          const areCompatible = await pluginManifestsAreCompatibleForUpdate(
            upstreamManifest,
            updatedManifestMap[upstreamDep],
            pluginFetch
          )
          if (!areCompatible) {
            return null;
          }
        }
      }
    }
    const sortedUpdatedManifests = topSortManifests(updatedManifests);
    const sortedUpdatedPlugins = manifestListToPluginList(sortedUpdatedManifests);

    const pluginsDiff = getDiff(unstagedState.plugins, sortedUpdatedPlugins);
    const pluginsToBeAddedToStore = getAddedDeps(unstagedState.plugins, sortedUpdatedPlugins);
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

    const diffList = [
      {
        diff: pluginsDiff,
        namespace: "plugins",
      },
      ...pluginAdditions,
    ];
    const proposedState = await getProposedStateFromDiffListOnCurrent(repoId, diffList, getCurrentState);
    const proposedCommitState = await applyStateDiffToCommitState(unstagedState, proposedState.diff);
    let stateStore = await buildStateStore(proposedCommitState, pluginFetch);
    const rootDependencies = updatedManifests.filter(m => Object.keys(m.imports).length == 0);
    for (const rootManifest of rootDependencies) {
      const schemaMap = await getSchemaMapForManifest(rootManifest, pluginFetch);
      stateStore = await cascadePluginState(schemaMap, stateStore, rootManifest.name, pluginFetch)
    }
    const kvState =  await convertStateStoreToKV(proposedCommitState, stateStore, pluginFetch);
    const lexicallyOrderedPlugins = updatedPlugins.sort((a, b) => {
      if (a.key == b.key) return 0;
      return a.key > b.key ? 1 : -1;
    })
    for (const {key} of lexicallyOrderedPlugins) {
       const diff = getDiff(unstagedState.store?.[key] ?? [], kvState[key]);
        diffList.push({
          diff,
          namespace: "store",
          pluginName: key
        })
    }
    const state = await saveDiffListToCurrent(repoId, diffList, getCurrentState);
    const nextState = await applyStateDiffToCommitState(unstagedState, state.diff);
    return await renderCommitState(nextState, pluginFetch);
  } catch (e) {
    return null;
  }
}

export const updatePluginState = async (
  repoId: string,
  pluginName: string,
  updatedState: object,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
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
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const unstagedState = await getUnstagedCommitState(repoId, getCurrentState);
    const current = await getRepoState(repoId, getCurrentState);
    if (current == null) {
      return null;
    }
    const pluginVersion = (current?.plugins ?? []).find(
      (v) => v.key == pluginName
    )?.value;
    if (!pluginVersion) {
      return null;
    }

    const manifests = await getPluginManifests(
      current.plugins,
      pluginFetch
    );

    const manifest = manifests.find(p => p.name == pluginName);
    const schemaMap = await getSchemaMapForManifest(manifest, pluginFetch);
    let stateStore = await buildStateStore(current, pluginFetch);
    stateStore[pluginName] = updatedState
    stateStore = await cascadePluginState(
      schemaMap,
      stateStore,
      pluginName,
      pluginFetch
    );

    const kvState =  await convertStateStoreToKV(current, stateStore, pluginFetch);
    const diffList = [];
    for (const pluginName in schemaMap) {
      const diff = getDiff(unstagedState.store?.[pluginName] ?? [], kvState[pluginName]);
      diffList.push({
        diff,
        namespace: "store",
        pluginName
      });
    }

    const state = await saveDiffListToCurrent(repoId, diffList, getCurrentState);
    const nextState = await applyStateDiffToCommitState(unstagedState, state.diff);
    return await renderCommitState(nextState, pluginFetch);
  } catch (e) {
    return null;
  }
};

export const mergeCommit = async (
  repoId: string,
  mergeSha: string,
  pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>
) => {
  if (!repoId) {
    return null;
  }
  if (!mergeSha) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }

  const user = await getUserAsync();
  if (!user.id) {
    return null;
  }
  try {

    const current = await getCurrentState(repoId);
    const commitStateResult = await getMergeCommitStates(
      repoId,
      current.commit,
      mergeSha
    );
    if (!commitStateResult) {
      return null;
    }
    const { commit1, commit2, originCommit} = commitStateResult;
    const canAutoCommitMergeStates = await canAutoMergeCommitStates(
      commit1,
      commit2,
      originCommit,
      pluginFetch
    );
    if (canAutoCommitMergeStates) {

      const canAutoMergeOnTopOfCurrentState = await canAutoMergeOnTopCurrentState(
        repoId,
        mergeSha,
        pluginFetch
      );

      if (!diffIsEmpty(current.diff) && canAutoMergeOnTopOfCurrentState) {
        const mergeState = await getMergedCommitState(commit1, commit2, originCommit, pluginFetch);
        const repoState = await getRepoState(repoId, getCurrentState);
        const mergeCurrState = await getMergedCommitState(mergeState, repoState, commit1, pluginFetch);

        const mergeDiffList = getCommitStateDiffList(commit1, mergeState);
        const restoreCurrDiffList = getCommitStateDiffList(mergeState, mergeCurrState);
        // need to add commit2 to list
        const mergeDiff = renderDiffList(mergeDiffList);
        const originSha = await getDivergenceOriginSha(repoId, current.commit, mergeSha);
        const origin = originSha ? await readCommit(repoId, originSha) : null;
        if (!origin) {
          //this is a full history rebase, (this is bad)
          return;
        }
        if (originSha == mergeSha) {
          //this is no-op, since no data merging is required
          // just switch the head
          return;
        }

        const history = await getHistory(repoId, current.commit);
        const { sha: baseSha, idx: baseIdx} = getBaseDivergenceSha(history, origin);
        const baseCommit = await getCommitState(repoId, baseSha);
        const baseDiffList = getCommitStateDiffList(commit2, baseCommit);
        const baseCommitData = await readCommit(repoId, baseSha);
        const mergeCommitData = await readCommit(repoId, mergeSha);
        const mergeBaseCommit: CommitData = {
          ...baseCommitData,
          diff: renderDiffList(baseDiffList),
          idx: mergeCommitData.idx + 1,
          historicalParent: originSha,
          authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
          userId: user.id,
          parent: mergeSha
        };
        mergeBaseCommit.sha = getDiffHash(mergeBaseCommit)
        const rebaseList = [mergeBaseCommit];
        for (let idx = baseIdx + 1; idx < history.length; idx++) {
          const commitToRebase = await readCommit(repoId, history[history.length - idx - 1].sha);
          commitToRebase.authorUserId = rebaseList[rebaseList.length - 1].authorUserId ?? rebaseList[rebaseList.length - 1].userId;
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
          message: `Merge [${mergeSha}] into [${current.commit}]`,
          mergeBase: mergeBaseCommit.sha,
          userId: user.id,
          timestamp: (new Date()).toString(),
          diff: mergeDiff
        }
        mergeCommit.sha = getDiffHash(mergeCommit);
        rebaseList.push(mergeCommit);
        for (let commitData of rebaseList) {
          const result = await writeCommit(repoId, commitData.sha, commitData);
          if (!result) {
            return null;
          }
        }

        if (current.branch) {
          const branchState = await getLocalBranch(repoId, current.branch);
          await updateLocalBranch(repoId, current.branch, {
            ...branchState,
            lastCommit: mergeCommit.sha
          });
          await updateCurrentCommitSHA(repoId, mergeCommit.sha, false, getCurrentState);
          const state = await saveDiffListToCurrent(repoId, restoreCurrDiffList, getCurrentState);
          const unstagedState = await getUnstagedCommitState(repoId, getCurrentState);
          const nextState = await applyStateDiffToCommitState(unstagedState, state.diff);
          return await renderCommitState(nextState, pluginFetch);
        }

        // in this case just update the sha, not need to update the branch state
        await updateCurrentCommitSHA(repoId, mergeCommit.sha, false, getCurrentState);
        const state = await saveDiffListToCurrent(repoId, restoreCurrDiffList, getCurrentState);
        const unstagedState = await getUnstagedCommitState(repoId, getCurrentState);
        const nextState = await applyStateDiffToCommitState(unstagedState, state.diff);
        return await renderCommitState(nextState, pluginFetch);
      }


      return;
    }
    // since it cant auto merge update current to isMerge: true


  } catch (e) {
    console.log("E", e);
    return null;
  }
}