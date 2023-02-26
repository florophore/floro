"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCommitState = exports.canAutoMergeOnTopCurrentState = exports.getMergedCommitState = exports.canAutoMergeCommitStates = exports.getMergeCommitStates = exports.renderDiffList = exports.getCommitStateDiffList = exports.uniqueKV = exports.mergeTokenStores = exports.detokenizeStore = exports.tokenizeCommitState = exports.convertStateStoreToKV = exports.buildStateStore = exports.getPluginsToRunUpdatesOn = exports.updateCurrentBranch = exports.updateCurrentWithNewBranch = exports.updateCurrentWithSHA = exports.updateCurrentCommitSHA = exports.saveDiffListToCurrent = exports.getProposedStateFromDiffListOnCurrent = exports.getRepoState = exports.getUnstagedCommitState = exports.getCurrentBranch = exports.applyStateDiffToCommitState = exports.getCommitState = exports.updateLocalBranch = exports.deleteLocalBranch = exports.getLocalBranch = exports.getDivergenceOriginSha = exports.getBaseDivergenceSha = exports.getHistory = exports.writeCommit = exports.buildCommitData = exports.readCommit = exports.canCommit = exports.diffIsEmpty = exports.getCommitDirPath = exports.getLocalBranches = exports.getCurrentCommitSha = exports.getCurrentState = exports.getRepoSettings = exports.cloneRepo = exports.getRemovedDeps = exports.getAddedDeps = exports.getLocalRepos = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const multiplexer_1 = require("./multiplexer");
const plugins_1 = require("./plugins");
const versioncontrol_1 = require("./versioncontrol");
const EMPTY_COMMIT_STATE = {
    description: [],
    licenses: [],
    plugins: [],
    store: {},
    binaries: [],
};
const EMPTY_COMMIT_DIFF = {
    description: { add: {}, remove: {} },
    licenses: { add: {}, remove: {} },
    plugins: { add: {}, remove: {} },
    store: {},
    binaries: { add: {}, remove: {} },
};
const EMPTY_COMMIT_DIFF_STRING = JSON.stringify(EMPTY_COMMIT_DIFF);
const getLocalRepos = async () => {
    const repoDir = await fs_1.default.promises.readdir(filestructure_1.vReposPath);
    return repoDir?.filter((repoName) => {
        return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(repoName);
    });
};
exports.getLocalRepos = getLocalRepos;
const getAddedDeps = (oldPlugins, newPlugins) => {
    const oldPluginMap = (0, plugins_1.pluginListToMap)(oldPlugins);
    const out = [];
    for (const plugin of newPlugins) {
        if (!oldPluginMap[plugin.key] || oldPluginMap[plugin.key] != plugin.value) {
            out.push(plugin);
        }
    }
    return out;
};
exports.getAddedDeps = getAddedDeps;
const getRemovedDeps = (oldPlugins, newPlugins) => {
    const newPluginMap = (0, plugins_1.pluginListToMap)(newPlugins);
    const out = [];
    for (const plugin of oldPlugins) {
        if (!newPluginMap[plugin.key] || newPluginMap[plugin.key] != plugin.value) {
            out.push(plugin);
        }
    }
    return out;
};
exports.getRemovedDeps = getRemovedDeps;
const cloneRepo = async (repoId) => {
    try {
        const remote = await (0, filestructure_1.getRemoteHostAsync)();
        const session = (0, filestructure_1.getUserSession)();
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const downloadPath = path_1.default.join(filestructure_1.vTMPPath, `${repoId}.tar.gz`);
        await (0, axios_1.default)({
            method: "get",
            url: `${remote}/api/repo/${repoId}/clone`,
            headers: {
                ["session_key"]: session?.clientKey,
            },
            onDownloadProgress: (progressEvent) => {
                (0, multiplexer_1.broadcastAllDevices)(`repo:${repoId}:clone-progress`, progressEvent);
            },
            responseType: "stream",
        }).then((response) => {
            const exists = (0, fs_1.existsSync)(downloadPath);
            if (exists) {
                return true;
            }
            const writer = (0, fs_1.createWriteStream)(downloadPath);
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
        const exists = await (0, filestructure_1.existsAsync)(repoPath);
        if (!exists) {
            await fs_1.default.promises.mkdir(repoPath);
            if (process.env.NODE_ENV != "test") {
                await fs_1.default.promises.chmod(repoPath, 0o755);
            }
            await tar_1.default.x({
                file: downloadPath,
                cwd: repoPath,
            });
        }
        const downloadExists = await (0, filestructure_1.existsAsync)(downloadPath);
        if (downloadExists) {
            await fs_1.default.promises.rm(downloadPath);
        }
        return true;
    }
    catch (e) {
        return false;
    }
};
exports.cloneRepo = cloneRepo;
//CHECK
const getRepoSettings = async (repoId) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const settingsPath = path_1.default.join(repoPath, `settings.json`);
        const settings = await fs_1.default.promises.readFile(settingsPath);
        return JSON.parse(settings.toString());
    }
    catch (e) {
        return null;
    }
};
exports.getRepoSettings = getRepoSettings;
//CHECK
const getCurrentState = async (repoId) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await fs_1.default.promises.readFile(currentPath);
        return JSON.parse(current.toString());
    }
    catch (e) {
        return null;
    }
};
exports.getCurrentState = getCurrentState;
//CHECK
const getCurrentCommitSha = async (repoId, fetchCurrentState) => {
    try {
        const current = await fetchCurrentState(repoId);
        if (current.commit) {
            return current.commit;
        }
        if (current.branch) {
            const branch = await (0, exports.getLocalBranch)(repoId, current.branch);
            return branch?.lastCommit ?? null;
        }
        return null;
    }
    catch (e) {
        return null;
    }
};
exports.getCurrentCommitSha = getCurrentCommitSha;
const getLocalBranches = async (repoId) => {
    const branchesPath = path_1.default.join(filestructure_1.vReposPath, repoId, "branches");
    const branchesDir = await fs_1.default.promises.readdir(branchesPath);
    const branches = await Promise.all(branchesDir
        ?.filter((branchName) => {
        return /.*\.json$/.test(branchName);
    })
        ?.map((branchFileName) => {
        const branchName = branchFileName.substring(0, branchFileName.length - 5);
        return (0, exports.getLocalBranch)(repoId, branchName);
    }));
    return branches.filter((branch) => branch != null);
};
exports.getLocalBranches = getLocalBranches;
const getCommitDirPath = (repoId, commitSha) => {
    return path_1.default.join(filestructure_1.vReposPath, repoId, "commits", commitSha.substring(0, 2));
};
exports.getCommitDirPath = getCommitDirPath;
const diffIsEmpty = (stateDiff) => {
    return JSON.stringify(stateDiff) == EMPTY_COMMIT_DIFF_STRING;
};
exports.diffIsEmpty = diffIsEmpty;
const canCommit = async (repoId, user, message, fetchCurrentState) => {
    if (!user || !user.id) {
        return false;
    }
    if ((message ?? "").length == 0) {
        return false;
    }
    const currentSha = await (0, exports.getCurrentCommitSha)(repoId, fetchCurrentState);
    const commit = await (0, exports.readCommit)(repoId, currentSha);
    if (commit) {
        // ensure safe
    }
    const currentState = await fetchCurrentState(repoId);
    if (!currentState) {
        return false;
    }
    if ((0, exports.diffIsEmpty)(currentState.diff)) {
        return false;
    }
    return true;
};
exports.canCommit = canCommit;
const readCommit = async (repoId, commitSha) => {
    try {
        const commitDir = (0, exports.getCommitDirPath)(repoId, commitSha);
        const commitPath = path_1.default.join(commitDir, `${commitSha.substring(2)}.json`);
        const commitDataString = await fs_1.default.promises.readFile(commitPath);
        return JSON.parse(commitDataString.toString());
    }
    catch (e) {
        return null;
    }
};
exports.readCommit = readCommit;
const buildCommitData = (parentSha, historicalParent, idx, diff, userId, timestamp, message) => {
    const commitData = {
        parent: parentSha,
        historicalParent: historicalParent,
        idx: idx,
        diff,
        timestamp,
        userId,
        message,
    };
    const sha = (0, versioncontrol_1.getDiffHash)(commitData);
    return {
        ...commitData,
        sha,
    };
};
exports.buildCommitData = buildCommitData;
const writeCommit = async (repoId, commitSha, commitData) => {
    try {
        const commitDir = (0, exports.getCommitDirPath)(repoId, commitSha);
        const commitDirExists = await (0, filestructure_1.existsAsync)(commitDir);
        if (!commitDirExists) {
            await fs_1.default.promises.mkdir(commitDir, 0o755);
        }
        const commitPath = path_1.default.join(commitDir, `${commitSha.substring(2)}.json`);
        await fs_1.default.promises.writeFile(commitPath, Buffer.from(JSON.stringify(commitData, null, 2)));
        return commitData;
    }
    catch (e) {
        return null;
    }
};
exports.writeCommit = writeCommit;
const getHistory = async (repoId, sha) => {
    if (sha == null) {
        return [];
    }
    const commit = await (0, exports.readCommit)(repoId, sha);
    if (commit == null) {
        return null;
    }
    const history = await (0, exports.getHistory)(repoId, commit.parent);
    return [
        {
            sha,
            idx: commit.idx,
            message: commit.message,
        },
        ...history,
    ];
};
exports.getHistory = getHistory;
const getBaseDivergenceSha = (history, origin) => {
    const baseIdx = origin.idx + 1;
    for (const commit of history) {
        if (commit.idx == baseIdx) {
            return commit;
        }
    }
    return null;
};
exports.getBaseDivergenceSha = getBaseDivergenceSha;
const getDivergenceOriginSha = async (repoId, sha1, sha2) => {
    const history1 = await (0, exports.getHistory)(repoId, sha1);
    if (!history1) {
        throw "missing history";
    }
    const history2 = await (0, exports.getHistory)(repoId, sha2);
    if (!history2) {
        throw "missing history";
    }
    const longerHistory = history1.length >= history2.length ? history1 : history2;
    const shorterHistory = history1.length < history2.length ? history1 : history2;
    const visited = new Set();
    for (let historyObj of shorterHistory) {
        visited.add(historyObj.sha);
    }
    for (let historyObj of longerHistory) {
        if (visited.has(historyObj.sha)) {
            return historyObj.sha;
        }
    }
    return null;
};
exports.getDivergenceOriginSha = getDivergenceOriginSha;
const getLocalBranch = async (repoId, branchName) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const branchPath = path_1.default.join(repoPath, "branches", `${branchName}.json`);
        const branchData = await fs_1.default.promises.readFile(branchPath);
        const branch = JSON.parse(branchData.toString());
        return {
            ...branch,
            name: branchName,
        };
    }
    catch (e) {
        return null;
    }
};
exports.getLocalBranch = getLocalBranch;
const deleteLocalBranch = async (repoId, branchName) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const branchPath = path_1.default.join(repoPath, "branches", `${branchName}.json`);
        await fs_1.default.promises.rm(branchPath);
        return true;
    }
    catch (e) {
        return false;
    }
};
exports.deleteLocalBranch = deleteLocalBranch;
const updateLocalBranch = async (repoId, branchName, branchData) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const branchPath = path_1.default.join(repoPath, "branches", `${branchName}.json`);
        await fs_1.default.promises.writeFile(branchPath, Buffer.from(JSON.stringify(branchData, null, 2)));
        return branchData;
    }
    catch (e) {
        return null;
    }
};
exports.updateLocalBranch = updateLocalBranch;
const getCommitState = async (repoId, sha) => {
    if (!sha) {
        return EMPTY_COMMIT_STATE;
    }
    const commitData = await (0, exports.readCommit)(repoId, sha);
    if (commitData == null) {
        return null;
    }
    const state = await (0, exports.getCommitState)(repoId, commitData.parent);
    return Object.keys(commitData.diff).reduce((acc, namespace) => {
        if (namespace == "store") {
            const store = Object.keys(commitData?.diff?.store ?? {}).reduce((storeAcc, pluginName) => {
                return {
                    ...storeAcc,
                    [pluginName]: (0, versioncontrol_1.applyDiff)(commitData.diff?.store?.[pluginName] ?? { add: {}, remove: {} }, storeAcc?.[pluginName] ?? []),
                };
            }, state?.store ?? {});
            return {
                ...acc,
                store,
            };
        }
        return {
            ...acc,
            [namespace]: (0, versioncontrol_1.applyDiff)(commitData.diff[namespace], state[namespace]),
        };
    }, {});
};
exports.getCommitState = getCommitState;
/**
 *  REFACTOR ABOVE WITH FOLLOWINg
 *  */
const applyStateDiffToCommitState = async (commitState, stateDiff) => {
    return Object.keys(stateDiff).reduce((acc, namespace) => {
        if (namespace == "store") {
            const store = Object.keys(stateDiff?.store ?? {}).reduce((storeAcc, pluginName) => {
                return {
                    ...storeAcc,
                    [pluginName]: (0, versioncontrol_1.applyDiff)(stateDiff?.store?.[pluginName] ?? { add: {}, remove: {} }, storeAcc?.[pluginName] ?? []),
                };
            }, commitState?.store ?? {});
            return {
                ...acc,
                store,
            };
        }
        return {
            ...acc,
            [namespace]: (0, versioncontrol_1.applyDiff)(stateDiff[namespace], commitState[namespace]),
        };
    }, commitState);
};
exports.applyStateDiffToCommitState = applyStateDiffToCommitState;
const getCurrentBranch = async (repoId, fetchCurrentState) => {
    const current = await fetchCurrentState(repoId);
    if (current.branch) {
        const branch = await (0, exports.getLocalBranch)(repoId, current.branch);
        return branch;
    }
    return null;
};
exports.getCurrentBranch = getCurrentBranch;
const getUnstagedCommitState = async (repoId, fetchCurrentState) => {
    const current = await fetchCurrentState(repoId);
    if (current.branch) {
        const branch = await (0, exports.getLocalBranch)(repoId, current.branch);
        const commitState = await (0, exports.getCommitState)(repoId, branch.lastCommit);
        return commitState;
    }
    const commitState = await (0, exports.getCommitState)(repoId, current.commit);
    return commitState;
};
exports.getUnstagedCommitState = getUnstagedCommitState;
const getRepoState = async (repoId, fetchCurrentState) => {
    const current = await fetchCurrentState(repoId);
    const state = await (0, exports.getUnstagedCommitState)(repoId, fetchCurrentState);
    return Object.keys(current.diff).reduce((acc, namespace) => {
        if (namespace == "store") {
            const store = Object.keys(current.diff?.store ?? {}).reduce((storeAcc, pluginName) => {
                return {
                    ...storeAcc,
                    [pluginName]: (0, versioncontrol_1.applyDiff)(current.diff?.store?.[pluginName] ?? { add: {}, remove: {} }, storeAcc?.[pluginName] ?? []),
                };
            }, acc?.store ?? {});
            return {
                ...acc,
                store,
            };
        }
        return {
            ...acc,
            [namespace]: (0, versioncontrol_1.applyDiff)(current.diff[namespace], state[namespace]),
        };
    }, state);
};
exports.getRepoState = getRepoState;
const getProposedStateFromDiffListOnCurrent = async (repoId, diffList, fetchCurrentState) => {
    const current = await fetchCurrentState(repoId);
    const commitState = await (0, exports.getCommitState)(repoId, current.commit);
    try {
        const updated = diffList.reduce((acc, { namespace, diff, pluginName }) => {
            if (namespace != "store") {
                return {
                    ...acc,
                    diff: {
                        ...acc.diff,
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
        const nextPlugins = (0, versioncontrol_1.applyDiff)(updated.diff.plugins, commitState.plugins);
        const pluginNameSet = new Set(nextPlugins.map((p) => p.key));
        for (let pluginName in updated.diff.store) {
            if (!pluginNameSet.has(pluginName)) {
                delete updated.diff.store[pluginName];
            }
        }
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.getProposedStateFromDiffListOnCurrent = getProposedStateFromDiffListOnCurrent;
const saveDiffListToCurrent = async (repoId, diffList, fetchCurrentState) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const proposedChanges = await (0, exports.getProposedStateFromDiffListOnCurrent)(repoId, diffList, fetchCurrentState);
        if (!proposedChanges) {
            return null;
        }
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(proposedChanges, null, 2)), "utf-8");
        return proposedChanges;
    }
    catch (e) {
        return null;
    }
};
exports.saveDiffListToCurrent = saveDiffListToCurrent;
/**
 *
 * use when committing against branch or sha
 */
const updateCurrentCommitSHA = async (repoId, sha, isResolvingMerge, fetchCurrentState) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await fetchCurrentState(repoId);
        if (current.isMerge && !isResolvingMerge) {
            return null;
        }
        const updated = {
            ...current,
            commit: sha,
            diff: EMPTY_COMMIT_DIFF,
            isMerge: false,
            merge: null,
        };
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentCommitSHA = updateCurrentCommitSHA;
/**
 *
 * use when HEAD is detached
 */
const updateCurrentWithSHA = async (repoId, sha, isResolvingMerge, fetchCurrentState) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await fetchCurrentState(repoId);
        if (current.isMerge && !isResolvingMerge) {
            return null;
        }
        const updated = {
            ...current,
            commit: sha,
            branch: null,
            diff: EMPTY_COMMIT_DIFF,
            isMerge: false,
            merge: null,
        };
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentWithSHA = updateCurrentWithSHA;
const updateCurrentWithNewBranch = async (repoId, branchName, fetchCurrentState) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await fetchCurrentState(repoId);
        if (current.isMerge) {
            return null;
        }
        const updated = {
            ...current,
            //commit: null,
            branch: branchName,
        };
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentWithNewBranch = updateCurrentWithNewBranch;
const updateCurrentBranch = async (repoId, branchName, fetchCurrentState) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await fetchCurrentState(repoId);
        if (current.isMerge) {
            return null;
        }
        const updated = {
            ...current,
            commit: null,
            branch: branchName,
            diff: EMPTY_COMMIT_DIFF,
        };
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentBranch = updateCurrentBranch;
const getPluginsToRunUpdatesOn = (pastPlugins, nextPlugins) => {
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
exports.getPluginsToRunUpdatesOn = getPluginsToRunUpdatesOn;
const buildStateStore = async (state, pluginFetch) => {
    let out = {};
    const manifests = await (0, plugins_1.getPluginManifests)(state.plugins, pluginFetch);
    for (const pluginManifest of manifests) {
        const kv = state?.store?.[pluginManifest.name] ?? [];
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(pluginManifest, pluginFetch);
        const pluginState = (0, plugins_1.getStateFromKVForPlugin)(schemaMap, kv, pluginManifest.name);
        out[pluginManifest.name] = pluginState;
    }
    return out;
};
exports.buildStateStore = buildStateStore;
const convertStateStoreToKV = async (state, stateStore, pluginFetch) => {
    let out = {};
    const manifests = await (0, plugins_1.getPluginManifests)(state.plugins, pluginFetch);
    for (const pluginManifest of manifests) {
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(pluginManifest, pluginFetch);
        const kv = await (0, plugins_1.getKVStateForPlugin)(schemaMap, pluginManifest.name, stateStore, pluginFetch);
        out[pluginManifest.name] = kv;
    }
    return out;
};
exports.convertStateStoreToKV = convertStateStoreToKV;
const tokenizeCommitState = (commitState) => {
    const tokenStore = {};
    const description = commitState.description.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.hashString)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const licenses = commitState.licenses.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.getKVHash)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const plugins = commitState.plugins.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.getKVHash)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const binaries = commitState.binaries.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.getKVHash)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const store = Object.keys(commitState.store).reduce((acc, key) => {
        const pluginStore = commitState.store[key].reduce((storeAcc, value) => {
            const hash = (0, versioncontrol_1.getKVHash)(value);
            tokenStore[hash] = value;
            return [...storeAcc, hash];
        }, []);
        return {
            ...acc,
            [key]: pluginStore,
        };
    }, {});
    return [
        {
            description,
            licenses,
            plugins,
            store,
            binaries,
        },
        tokenStore,
    ];
};
exports.tokenizeCommitState = tokenizeCommitState;
const detokenizeStore = (tokenizedState, tokenStore) => {
    const description = tokenizedState.description.map((token) => {
        return tokenStore[token];
    });
    const licenses = tokenizedState.licenses.map((token) => {
        return tokenStore[token];
    });
    const plugins = tokenizedState.plugins.map((token) => {
        return tokenStore[token];
    });
    const binaries = tokenizedState.binaries.map((token) => {
        return tokenStore[token];
    });
    const store = Object.keys(tokenizedState.store).reduce((acc, pluginName) => {
        return {
            ...acc,
            [pluginName]: tokenizedState.store[pluginName].map((token) => {
                return tokenStore[token];
            }),
        };
    }, {});
    return {
        description,
        licenses,
        plugins,
        store,
        binaries,
    };
};
exports.detokenizeStore = detokenizeStore;
const mergeTokenStores = (tokenStore1, tokenStore2) => {
    return {
        ...tokenStore1,
        ...tokenStore2,
    };
};
exports.mergeTokenStores = mergeTokenStores;
const uniqueKV = (kvList) => {
    let out = [];
    let seen = new Set();
    for (let { key, value } of kvList) {
        if (!seen.has(key)) {
            seen.add(key);
            out.push({ key, value });
        }
    }
    return out;
};
exports.uniqueKV = uniqueKV;
const getCommitStateDiffList = (commit1, commit2) => {
    const diffList = [];
    const pluginsToTraverse = Array.from([
        ...Object.keys(commit1.store),
        ...Object.keys(commit2.store),
    ]);
    for (const prop in commit2) {
        if (prop == "store") {
            for (const pluginName of pluginsToTraverse) {
                const diff = (0, versioncontrol_1.getDiff)(commit1?.store?.[pluginName] ?? [], commit2?.store?.[pluginName] ?? []);
                diffList.push({
                    diff,
                    namespace: "store",
                    pluginName,
                });
            }
            continue;
        }
        if (prop == "description") {
            const diff = (0, versioncontrol_1.getTextDiff)((commit1?.[prop] ?? []).join(""), (commit2?.[prop] ?? [])?.join(""));
            diffList.push({
                diff,
                namespace: prop,
            });
            continue;
        }
        const diff = (0, versioncontrol_1.getDiff)(commit1?.[prop] ?? [], commit2?.[prop] ?? []);
        diffList.push({
            diff,
            namespace: prop,
        });
    }
    return diffList;
};
exports.getCommitStateDiffList = getCommitStateDiffList;
const renderDiffList = (diffList) => {
    return diffList.reduce((acc, { namespace, diff, pluginName }) => {
        if (namespace != "store") {
            return {
                ...acc,
                diff: {
                    ...acc.diff,
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
    }, { diff: EMPTY_COMMIT_DIFF }).diff;
};
exports.renderDiffList = renderDiffList;
const getMergeCommitStates = async (repoId, sha1, sha2) => {
    try {
        const originSha = await (0, exports.getDivergenceOriginSha)(repoId, sha1, sha2);
        const commit1 = await (0, exports.getCommitState)(repoId, sha1);
        const commit2 = await (0, exports.getCommitState)(repoId, sha2);
        const originCommit = !!originSha
            ? await (0, exports.getCommitState)(repoId, originSha)
            : EMPTY_COMMIT_STATE;
        return {
            commit1,
            commit2,
            originCommit,
        };
    }
    catch (e) {
        return null;
    }
};
exports.getMergeCommitStates = getMergeCommitStates;
const canAutoMergeCommitStates = async (commit1, commit2, originCommit, pluginFetch) => {
    try {
        const yourMerge = await (0, exports.getMergedCommitState)(commit1, commit2, originCommit, pluginFetch, "yours");
        const theirMerge = await (0, exports.getMergedCommitState)(commit1, commit2, originCommit, pluginFetch, "theirs");
        return JSON.stringify(yourMerge) == JSON.stringify(theirMerge);
    }
    catch (e) {
        return null;
    }
};
exports.canAutoMergeCommitStates = canAutoMergeCommitStates;
const getMergedCommitState = async (commit1, commit2, originCommit, pluginFetch, whose = "yours") => {
    try {
        const [tokenizedCommit1, tokenizedStore1] = (0, exports.tokenizeCommitState)(commit1);
        const [tokenizedCommit2, tokenizedStore2] = (0, exports.tokenizeCommitState)(commit2);
        const [tokenizedOrigin] = (0, exports.tokenizeCommitState)(originCommit);
        const tokenizedDescription = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.description, tokenizedCommit1.description, tokenizedCommit2.description, whose);
        const tokenizedLicenses = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.licenses, tokenizedCommit1.licenses, tokenizedCommit2.licenses, whose);
        const tokenizedPlugins = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.plugins, tokenizedCommit1.plugins, tokenizedCommit2.plugins, whose);
        const tokenizedBinaries = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.binaries, tokenizedCommit1.binaries, tokenizedCommit2.binaries, whose);
        const pluginsToTraverse = Array.from([
            ...Object.keys(tokenizedCommit1.store),
            ...Object.keys(tokenizedCommit2.store),
        ]);
        const tokenizedStore = {};
        for (const pluginName of pluginsToTraverse) {
            const pluginKVs1 = tokenizedCommit1?.store?.[pluginName] ?? [];
            const pluginKVs2 = tokenizedCommit2?.store?.[pluginName] ?? [];
            const orignKVs = tokenizedOrigin?.store?.[pluginName] ?? [];
            const pluginStoreSequence = (0, versioncontrol_1.getMergeSequence)(orignKVs, pluginKVs1, pluginKVs2, whose);
            tokenizedStore[pluginName] = pluginStoreSequence;
        }
        const tokenStore = (0, exports.mergeTokenStores)(tokenizedStore1, tokenizedStore2);
        const tokenizedState = {
            description: tokenizedDescription,
            licenses: tokenizedLicenses,
            plugins: tokenizedPlugins,
            store: tokenizedStore,
            binaries: tokenizedBinaries,
        };
        const mergeState = (0, exports.detokenizeStore)(tokenizedState, tokenStore);
        mergeState.plugins = (0, exports.uniqueKV)(mergeState.plugins);
        mergeState.binaries = (0, exports.uniqueKV)(mergeState.binaries);
        mergeState.licenses = (0, exports.uniqueKV)(mergeState.licenses);
        let stateStore = await (0, exports.buildStateStore)(mergeState, pluginFetch);
        const manifests = await (0, plugins_1.getPluginManifests)(mergeState.plugins, pluginFetch);
        const rootManifests = manifests.filter((m) => Object.keys(m.imports).length === 0);
        for (const manifest of rootManifests) {
            const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(manifest, pluginFetch);
            stateStore = await (0, plugins_1.cascadePluginState)(schemaMap, stateStore, manifest.name, pluginFetch);
        }
        mergeState.store = await (0, exports.convertStateStoreToKV)(mergeState, stateStore, pluginFetch);
        return mergeState;
    }
    catch (e) {
        return null;
    }
};
exports.getMergedCommitState = getMergedCommitState;
const canAutoMergeOnTopCurrentState = async (repoId, mergeSha, pluginFetch) => {
    try {
        const current = await (0, exports.getCurrentState)(repoId);
        const repoState = await (0, exports.getRepoState)(repoId, exports.getCurrentState);
        const mergeState = await (0, exports.getCommitState)(repoId, mergeSha);
        const { originCommit } = await (0, exports.getMergeCommitStates)(repoId, current.commit, mergeSha);
        return await (0, exports.canAutoMergeCommitStates)(repoState, mergeState, originCommit, pluginFetch);
    }
    catch (e) {
        return null;
    }
};
exports.canAutoMergeOnTopCurrentState = canAutoMergeOnTopCurrentState;
const renderCommitState = async (state, pluginFetch) => {
    const store = await (0, exports.buildStateStore)(state, pluginFetch);
    return {
        ...state,
        store,
    };
};
exports.renderCommitState = renderCommitState;
//# sourceMappingURL=repo.js.map