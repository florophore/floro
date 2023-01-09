import express from "express";
import path from "path";
import http from "http";
import cors from "cors";
import {
  existsAsync,
  getRemoteHostSync,
  getPluginsJson,
  writeUserSession,
  writeUser,
  removeUserSession,
  removeUser,
  vReposPath,
  getUser,
  getUserAsync,
} from "./filestructure";
import { Server } from "socket.io";
import { createProxyMiddleware } from "http-proxy-middleware";
import multiplexer, {
  broadcastAllDevices,
  broadcastToClient,
} from "./multiplexer";
import { startSessionJob } from "./cron";
import macaddres from "macaddress";
import sha256 from "crypto-js/sha256";
import HexEncode from "crypto-js/enc-hex";
import {
  cloneRepo,
  getLocalBranches,
  getLocalRepos,
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
  updateCurrentBranch,
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

export const getSettings = async (repoId?: string) => {
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
      return null;
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