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
  constructDependencySchema,
  generateStateFromKV,
  getKVStateForPlugin,
  getPluginManifest,
  getRootSchemaForPlugin,
  getUpstreamDependencyList,
  hasPlugin,
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
      const unstagedState = await getUnstagedCommitState(repoId);
      const diff = getTextDiff(unstagedState.description?.join(""), description);
      const state = await saveDiffListToCurrent(repoId, [
        {
          diff,
          namespace: "description",
        },
      ]);
      const nextDescription = applyDiff(
        state.diff.description,
        unstagedState.description
      );
      return nextDescription;
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

    const unstagedState = await getUnstagedCommitState(repoId);
    const diff = getDiff(unstagedState.licenses, licenses);
    const state = await saveDiffListToCurrent(repoId, [
      {
        diff,
        namespace: "licenses",
      },
    ]);
    const updatedLicenses = applyDiff(state.diff.licenses, unstagedState.licenses);
    return updatedLicenses;
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
    const state = await getRepoState(repoId);
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
    const state = await getRepoState(repoId);
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
    const branch = await getCurrentBranch(repoId);
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
    const sha = await getCurrentCommitSha(repoId);
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
    return await updateCurrentWithNewBranch(repoId, branchName);
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
    const sha = await getCurrentCommitSha(repoId);
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
    const sha = await getCurrentCommitSha(repoId);
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
    const state = await getRepoState(repoId);
    const store = await buildStateStore(state);
    return { ...state, store };
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
    const store = await buildStateStore(state);
    return { ...state, store };
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
    const store = await buildStateStore(state);
    return { ...state, store };
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
    const commitIsValid = await canCommit(repoId, user, message);
    if (!commitIsValid) {
      return null;
    }
    const currentState = await getCurrentState(repoId);
    const currentSha = await getCurrentCommitSha(repoId);
    const timestamp = (new Date()).toString();
    const commitData: CommitData = {
      parent: currentSha,
      historicalParent: currentSha,
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
      if (!branchState) {
        return null;
      }
      await updateLocalBranch(repoId, currentState.branch, {
        ...branchState,
        lastCommit: sha
      });
      await updateCurrentCommitSHA(repoId, null);
    } else {
      await updateCurrentCommitSHA(repoId, sha);
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
    if (!currentBranches.map(v => v.name.toLowerCase()).includes(branchName.toLowerCase())) {
      return null;
    }

    const branchData = await getLocalBranch(repoId, branchName);
    if (!branchData) {
      return null;
    }
    return await updateCurrentWithNewBranch(repoId, branchName);
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

    const current = await updateCurrentWithSHA(repoId, sha);
    if (!current) {
      return null;
    }
    return current;
  } catch (e) {
    return null;
  }
}

export const updatePlugins = async (repoId?: string, plugins?) => {
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
    // perform compat check
    // fetch upstream plugins
    const unstagedState = await getUnstagedCommitState(repoId);
    const pluginsDiff = getDiff(unstagedState.plugins, plugins);
    const nextPluginState = applyDiff(pluginsDiff, unstagedState.plugins);
    const pluginAdditions = [];
    for (let plugin of nextPluginState) {
      if (!hasPlugin(plugin.key, unstagedState.plugins)) {
        pluginAdditions.push({
          namespace: "store",
          pluginName: plugin.key,
          diff: {
            add: {},
            remove: {},
          },
        });
      }
    }

    // TRANSFORM store and binaries
    // run migrations
    //const state = await saveDiffToCurrent(repoId, pluginsDiff, 'plugins');
    const state = await saveDiffListToCurrent(repoId, [
      {
        diff: pluginsDiff,
        namespace: "plugins",
      },
      ...pluginAdditions,
    ]);
    return state;
  } catch (e) {
    return null;
  }
}

export const updatePluginState = async (repoId?: string, pluginName?: string, updateState?: unknown) => {
  if (!repoId) {
    return null;
  }
  if (!pluginName) {
    return null;
  }
  if (!updateState) {
    return null;
  }
  const exists = await repoExists(repoId);
  if (!exists) {
    return null;
  }
  try {
    const unstagedState = await getUnstagedCommitState(repoId);
    const current = await getRepoState(repoId);
    if (current == null) {
      return null;
    }
    // TODO MOVE THIS LOGIC TO HANDLE DOWNSTREAM
    const manifest = await getPluginManifest(
      pluginName,
      current?.plugins ?? []
    );
    if (manifest == null) {
      return null;
    }
    const upstreamDependencies = await getUpstreamDependencyList(
      pluginName,
      manifest,
      current?.plugins ?? []
    );
    const upsteamSchema = await constructDependencySchema(upstreamDependencies);
    const rootSchema = getRootSchemaForPlugin(
      upsteamSchema,
      manifest,
      pluginName
    );
    const kvState = getKVStateForPlugin(
      upsteamSchema,
      manifest,
      pluginName,
      updateState ?? {}
    );
    const diff = getDiff(unstagedState.store?.[pluginName] ?? [], kvState);

    // needs to be looped through for each plugin in downstream deps
    const nextState = applyDiff(diff, unstagedState?.store?.[pluginName] ?? []);
    // END TODO

    const commitState = await saveDiffListToCurrent(repoId, [
      {
        diff,
        namespace: "store",
        pluginName,
      },
    ]);

    const state = generateStateFromKV(manifest, nextState, pluginName);

    // run cascade next
    // find downstream plugins
    // run cascades on downstream schemas
    // save all diffs against respective manifests

    // return constructed kv state of plugin and upstreams
    return { [pluginName]: state };
  } catch (e) {
    return null;
  }
}