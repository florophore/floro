import axios from "axios";
import fs, { createWriteStream, existsSync } from "fs";
import path from "path";
import tar from "tar";
import {
  existsAsync,
  getRemoteHostAsync,
  getUserSession,
  vReposPath,
  vTMPPath,
} from "./filestructure";
import { broadcastAllDevices } from "./multiplexer";
import { generateStateFromKV, getPluginManifest } from "./plugins";
import { applyDiff, Diff, TextDiff } from "./versioncontrol";

export interface RawStore {
    [name: string]: Array<{key: string, value: string}>
};

export interface CommitState {
  description: Array<string>,
  licenses: Array<{key: string, value: string}>,
  plugins: Array<{key: string, value: string}>,
  store: RawStore,
  binaries: Array<{key: string, value: string}>,
};

export interface StoreStateDiff {
    [pluginName: string]: Diff
};

export interface StateDiff {
  plugins: Diff, 
  binaries: Diff, 
  store: StoreStateDiff, 
  licenses: Diff,
  description: TextDiff
};

export interface State {
  diff: StateDiff,
  branch: string|null,
  commit: string|null,
};

export interface Branch {
  firstCommit: null|string,
  lastCommit: null|string,
  createdBy: string,
  createdAt: string,
}

const EMPTY_COMMIT_STATE: CommitState = {
  description: [],
  licenses: [],
  plugins: [],
  store: {},
  binaries: [],
};

export const getLocalRepos = async (): Promise<string[]> => {
  const repoDir = await fs.promises.readdir(vReposPath);
  return repoDir?.filter((repoName) => {
    return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(
      repoName
    );
  });
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
      await fs.promises.chmod(repoPath, 0o755);
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

export const getRepoSettings = async (repoId: string) => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const settingsPath = path.join(repoPath, `settings.json`);
    const settings = await fs.promises.readFile(settingsPath);
    return JSON.parse(settings.toString());
  } catch (e) {
    return null;
  }
};
export const getCurrentState = async (repoId: string): Promise<State> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const current = await fs.promises.readFile(currentPath);
    return JSON.parse(current.toString());
  } catch (e) {
    return null;
  }
};


export const getLocalBranches = async (repoId: string): Promise<Array<Branch>> => {
  const branchesPath = path.join(vReposPath, repoId, "branches");
  const branchesDir = await fs.promises.readdir(branchesPath);
  const branches = await Promise.all(
    branchesDir
      ?.filter((branchName) => {
        return /.*\.json$/.test(branchName);
      })
      ?.map((branchFileName) => {
        const branchName = branchFileName.substring(
          0,
          branchFileName.length - 5
        );
        return getLocalBranch(repoId, branchName);
      })
  );
  return branches.filter((branch) => branch != null);
};

export const getLocalBranch = async (repoId: string, branchName: string): Promise<Branch> => {
  try {
    const repoPath = path.join(vReposPath, repoId);
    const branchPath = path.join(repoPath, "branches", `${branchName}.json`);
    const branchData = await fs.promises.readFile(branchPath);
    const branch = JSON.parse(branchData.toString());
    return {
      ...branch,
      name: branchName,
    };
  } catch (e) {
    return null;
  }
};
export const getCommitState = async (
  repoId: string,
  sha?: string
): Promise<CommitState> => {
  if (!sha) {
    return EMPTY_COMMIT_STATE;
  }
  // replay here
};

export const getCurrentBranch = async (repoId: string) => {
  const current = await getCurrentState(repoId);
  if (current.branch) {
    const branch = await getLocalBranch(repoId, current.branch);
    return branch;
  }
  return null;
};

export const getUnstagedCommitState = async (repoId: string): Promise<CommitState> => {
  const current = await getCurrentState(repoId);
  if (current.branch) {
    const branch = await getLocalBranch(repoId, current.branch);
    const commitState = await getCommitState(repoId, branch.lastCommit);
    return commitState;
  }
  const commitState = await getCommitState(repoId, current.commit);
  return commitState;
};

export const getRepoState = async (
  repoId: string
): Promise<CommitState> => {
  const current = await getCurrentState(repoId);
  const state = await getUnstagedCommitState(repoId);
  return Object.keys(current.diff).reduce((acc, namespace): CommitState => {
    if (namespace == "store") {
      const store: RawStore = Object.keys(current?.diff?.store ?? {}).reduce(
        (storeAcc, pluginName) => {
          return {
            ...storeAcc,
            [pluginName]: applyDiff(
              current.diff?.store?.[pluginName] ?? { add: {}, remove: {} },
              state?.[pluginName] ?? []
            ),
          };
        },
        state?.store ?? {} as RawStore
      );

      return {
        ...acc,
        store,
      };
    }
    return {
      ...acc,
      [namespace]: applyDiff(current.diff[namespace], state[namespace]),
    };
  }, {} as CommitState);
};

export const saveDiffListToCurrent = async (
  repoId: string,
  diffList: Array<{ diff: Diff|TextDiff; namespace: string; pluginName?: string }>
): Promise<State> => {
  const current = await getCurrentState(repoId);
  const commitState = await getCommitState(repoId)
  try {
    const repoPath = path.join(vReposPath, repoId);
    const currentPath = path.join(repoPath, `current.json`);
    const updated = diffList.reduce((acc, { namespace, diff, pluginName }) => {
      if (namespace != "store") {
        return {
          ...acc,
          diff: {
            ...current.diff,
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
    // PRUNE DANGLING PLUGINS FROM STORE
    const nextPlugins = applyDiff(updated.diff.plugins, commitState.plugins);
    const pluginNameSet = new Set(nextPlugins.map((p) => p.key));
    for (let pluginName in updated.diff.store) {
      if (!pluginNameSet.has(pluginName)) {
        delete updated.diff.store[pluginName];
      }
    }
    await fs.promises.writeFile(
      currentPath,
      Buffer.from(JSON.stringify(updated, null, 2))
    );
    return updated as State;
  } catch (e) {
    return current;
  }
};

export const buildStateStore = async (state: CommitState): Promise<{[key: string]: unknown}> => {
  let out = {};
  for (let pluginName in state.store) {
    const kv = state.store[pluginName] ?? [];
    const manifest = await getPluginManifest(
      pluginName,
      state?.plugins ?? []
    );
    const pluginState = generateStateFromKV(manifest, kv, pluginName);
    out[pluginName] = pluginState;
  } 
  return out;
}
