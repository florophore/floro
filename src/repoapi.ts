import path from "path";
import { existsAsync, vReposPath, getUserAsync } from "./filestructure";
import {
  getCurrentBranch,
  getRepoState,
  saveDiffListToCurrent,
  getUnstagedCommitState,
  buildStateStore,
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
  getBaseDivergenceSha,
} from "./repo";
import {
  CommitData,
  DiffElement,
  getDiff,
  getDiffHash,
  getTextDiff,
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
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const diff = getTextDiff(unstagedState.description?.join(""), description);
    const state = await saveDiffListToCurrent(datasource, repoId, [
      {
        diff,
        namespace: "description",
      },
    ]);

    const nextState = await applyStateDiffToCommitState(
      unstagedState,
      state.diff
    );
    return nextState;
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

    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const diff = getDiff(unstagedState.licenses, licenses);
    const state = await saveDiffListToCurrent(datasource, repoId, [
      {
        diff,
        namespace: "licenses",
      },
    ]);
    const nextState = await applyStateDiffToCommitState(
      unstagedState,
      state.diff
    );
    return nextState;
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
    const state = await getRepoState(datasource, repoId);
    return state.licenses;
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
  const state = await getRepoState(datasource, repoId);
  return state.description;
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
    const branches = await datasource.getBranches(repoId);
    return branches;
  } catch (e) {
    return null;
  }
};

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
    const currentBranches = await datasource.getBranches(repoId);
    if (
      currentBranches
        .map((v) => v.name.toLowerCase())
        .includes(branchName.toLowerCase())
    ) {
      return null;
    }
    const sha = await getCurrentCommitSha(datasource, repoId);
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
    const branchData = await datasource.saveBranch(repoId, branchName, branch);
    if (!branchData) {
      return null;
    }
    return await updateCurrentWithNewBranch(datasource, repoId, branchName);
  } catch (e) {
    return null;
  }
};

export const deleteBranch = async (
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
    const currentBranches = await datasource.getBranches(repoId);
    if (
      !currentBranches
        .map((v) => v.name.toLowerCase())
        .includes(branchName.toLowerCase())
    ) {
      return null;
    }
    const current = await datasource.getCurrentState(repoId);
    // ADD CAN DELETE
    if (
      current.branch &&
      current.branch.toLowerCase() == branchName.toLocaleLowerCase()
    ) {
      // check is just localf
      await datasource.deleteBranch(repoId, branchName);
    }
    const branches = await datasource.getBranches(repoId);
    return branches;
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
    const settings = await datasource.getRepoSettings(repoId);
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
    const branch = await datasource.getBranch(repoId, branchName);
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
    const state = await getRepoState(datasource, repoId);
    return await renderCommitState(datasource, state);
  } catch (e) {
    return null;
  }
};

export const readCommitState = async (
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
    const state = await getCommitState(datasource, repoId, sha);
    if (!state) {
      return null;
    }
    return await renderCommitState(datasource, state);
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
    const branch = await datasource.getBranch(repoId, branchName);
    if (!branch) {
      return null;
    }
    const state = await getCommitState(datasource, repoId, branch.lastCommit);
    if (!state) {
      return null;
    }
    return renderCommitState(datasource, state);
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
    const commitIsValid = await canCommit(datasource, repoId, user, message);
    if (!commitIsValid) {
      return null;
    }
    const currentState = await datasource.getCurrentState(repoId);
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
      diff: currentState.diff,
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
      const branchState = await datasource.getBranch(
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
    const currentBranches = await datasource.getBranches(repoId);
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

    const branchData = await datasource.getBranch(repoId, branchName);
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
      unstagedState.plugins,
    );
    const newManifests = await getPluginManifests(
      datasource,
      plugins,
    );

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
        addedDepImportsList,
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
      updatedPlugins,
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

    const pluginsDiff = getDiff(unstagedState.plugins, sortedUpdatedPlugins);
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

    const diffList = [
      {
        diff: pluginsDiff,
        namespace: "plugins",
      },
      ...pluginAdditions,
    ];
    const proposedState = await getProposedStateFromDiffListOnCurrent(
      datasource,
      repoId,
      diffList
    );
    const proposedCommitState = await applyStateDiffToCommitState(
      unstagedState,
      proposedState.diff
    );
    let stateStore = await buildStateStore(datasource, proposedCommitState);
    const rootDependencies = updatedManifests.filter(
      (m) => Object.keys(m.imports).length == 0
    );
    for (const rootManifest of rootDependencies) {
      const schemaMap = await getSchemaMapForManifest(
        datasource,
        rootManifest
      );
      stateStore = await cascadePluginState(
        datasource,
        schemaMap,
        stateStore,
        rootManifest.name
      );
    }
    const kvState = await convertStateStoreToKV(
      datasource,
      proposedCommitState,
      stateStore
    );
    const lexicallyOrderedPlugins = updatedPlugins.sort((a, b) => {
      if (a.key == b.key) return 0;
      return a.key > b.key ? 1 : -1;
    });
    for (const { key } of lexicallyOrderedPlugins) {
      const diff = getDiff(unstagedState.store?.[key] ?? [], kvState[key]);
      diffList.push({
        diff,
        namespace: "store",
        pluginName: key,
      });
    }
    const state = await saveDiffListToCurrent(datasource, repoId, diffList);
    const nextState = await applyStateDiffToCommitState(
      unstagedState,
      state.diff
    );
    return await renderCommitState(datasource, nextState);
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
    const unstagedState = await getUnstagedCommitState(datasource, repoId);
    const current = await getRepoState(datasource, repoId);
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
      datasource,
      current.plugins,
    );

    const manifest = manifests.find((p) => p.name == pluginName);
    const schemaMap = await getSchemaMapForManifest(
      datasource,
      manifest
    );
    let stateStore = await buildStateStore(datasource, current);
    stateStore[pluginName] = updatedState;
    stateStore = await cascadePluginState(
      datasource,
      schemaMap,
      stateStore,
      pluginName
    );

    const kvState = await convertStateStoreToKV(
      datasource,
      current,
      stateStore
    );
    const diffList = [];
    for (const pluginName in schemaMap) {
      const diff = getDiff(
        unstagedState.store?.[pluginName] ?? [],
        kvState[pluginName]
      );
      diffList.push({
        diff,
        namespace: "store",
        pluginName,
      });
    }

    const state = await saveDiffListToCurrent(datasource, repoId, diffList);
    const nextState = await applyStateDiffToCommitState(
      unstagedState,
      state.diff
    );
    const out = await renderCommitState(datasource, nextState);
    return out;
  } catch (e) {
    return null;
  }
};

export const mergeCommit = async (
  datasource: DataSource,
  repoId: string,
  mergeSha: string
) => {
  if (!repoId) {
    return null;
  }
  if (!mergeSha) {
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
    const current = await datasource.getCurrentState(repoId);
    const commitStateResult = await getMergeCommitStates(
      datasource,
      repoId,
      current.commit,
      mergeSha
    );
    if (!commitStateResult) {
      return null;
    }
    const { commit1, commit2, originCommit } = commitStateResult;
    const canAutoCommitMergeStates = await canAutoMergeCommitStates(
      datasource,
      commit1,
      commit2,
      originCommit
    );
    if (canAutoCommitMergeStates) {
      const canAutoMergeOnTopOfCurrentState =
        await canAutoMergeOnTopCurrentState(datasource, repoId, mergeSha);

      if (!diffIsEmpty(current.diff) && canAutoMergeOnTopOfCurrentState) {
        const mergeState = await getMergedCommitState(
          datasource,
          commit1,
          commit2,
          originCommit
        );
        const repoState = await getRepoState(datasource, repoId);
        const mergeCurrState = await getMergedCommitState(
          datasource,
          mergeState,
          repoState,
          commit1
        );

        const mergeDiffList = getCommitStateDiffList(commit1, mergeState);
        const restoreCurrDiffList = getCommitStateDiffList(
          mergeState,
          mergeCurrState
        );
        // need to add commit2 to list
        const mergeDiff = renderDiffList(mergeDiffList);
        const originSha = await getDivergenceOriginSha(
          datasource,
          repoId,
          current.commit,
          mergeSha
        );
        const origin = originSha
          ? await datasource.readCommit(repoId, originSha)
          : null;
        if (!origin) {
          //this is a full history rebase, (this is bad)
          return;
        }
        if (originSha == mergeSha) {
          //this is no-op, since no data merging is required
          // just switch the head
          return;
        }

        const history = await getHistory(datasource, repoId, current.commit);
        const { sha: baseSha, idx: baseIdx } = getBaseDivergenceSha(
          history,
          origin
        );
        const baseCommit = await getCommitState(datasource, repoId, baseSha);
        const baseDiffList = getCommitStateDiffList(commit2, baseCommit);
        const baseCommitData = await datasource.readCommit(repoId, baseSha);
        const mergeCommitData = await datasource.readCommit(repoId, mergeSha);
        const mergeBaseCommit: CommitData = {
          ...baseCommitData,
          diff: renderDiffList(baseDiffList),
          idx: mergeCommitData.idx + 1,
          historicalParent: originSha,
          authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
          userId: user.id,
          parent: mergeSha,
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
          commitToRebase.historicalParent =
            rebaseList[rebaseList.length - 1].sha;
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

        if (current.branch) {
          const branchState = await datasource.getBranch(
            repoId,
            current.branch
          );
          await datasource.saveBranch(repoId, current.branch, {
            ...branchState,
            lastCommit: mergeCommit.sha,
          });
          await updateCurrentCommitSHA(
            datasource,
            repoId,
            mergeCommit.sha,
            false
          );
          const state = await saveDiffListToCurrent(
            datasource,
            repoId,
            restoreCurrDiffList
          );
          const unstagedState = await getUnstagedCommitState(
            datasource,
            repoId
          );
          const nextState = await applyStateDiffToCommitState(
            unstagedState,
            state.diff
          );
          return await renderCommitState(datasource, nextState);
        }

        // in this case just update the sha, not need to update the branch state
        await updateCurrentCommitSHA(
          datasource,
          repoId,
          mergeCommit.sha,
          false
        );
        const state = await saveDiffListToCurrent(
          datasource,
          repoId,
          restoreCurrDiffList
        );
        const unstagedState = await getUnstagedCommitState(datasource, repoId);
        const nextState = await applyStateDiffToCommitState(
          unstagedState,
          state.diff
        );
        return await renderCommitState(datasource, nextState);
      }

      return;
    }
    // since it cant auto merge update current to isMerge: true
  } catch (e) {
    console.log("E", e);
    return null;
  }
};
