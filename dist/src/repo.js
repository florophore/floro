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
exports.getLastCommitFromRepoState = exports.getBaseBranchFromBranch = exports.getBranchFromRepoState = exports.getIsWip = exports.getInvalidStates = exports.getApiDiff = exports.getCanAutoMergeOnTopCurrentState = exports.getCanAutoMergeOnUnStagedState = exports.getMergedCommitState = exports.canAutoMergeCommitStates = exports.getMergeCommitStates = exports.getStateDiffFromCommitStates = exports.uniqueStrings = exports.uniqueKV = exports.mergeTokenStores = exports.detokenizeStore = exports.tokenizeCommitState = exports.convertCommitStateToRenderedState = exports.convertRenderedStateStoreToKV = exports.convertStateStoreToKV = exports.buildStateStore = exports.updateComparison = exports.changeCommandMode = exports.getPluginsToRunUpdatesOn = exports.updateCurrentBranch = exports.updateCurrentWithNewBranch = exports.updateCurrentWithSHA = exports.updateCurrentCommitSHA = exports.convertRenderedCommitStateToKv = exports.getApplicationState = exports.getUnstagedCommitState = exports.getCurrentBranch = exports.applyStateDiffToCommitState = exports.getCommitState = exports.getDivergenceOriginSha = exports.getBaseDivergenceSha = exports.getHistory = exports.buildCommitData = exports.canCommit = exports.diffIsEmpty = exports.getCurrentCommitSha = exports.cloneRepo = exports.getRemovedDeps = exports.getAddedDeps = exports.getBranchIdFromName = exports.getRepos = exports.BRANCH_NAME_REGEX = exports.EMPTY_COMMIT_DIFF = exports.EMPTY_RENDERED_APPLICATION_STATE = exports.EMPTY_COMMIT_STATE = void 0;
exports.renderSourceGraph = exports.renderApiReponse = exports.getApiDiffFromComparisonState = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const multiplexer_1 = require("./multiplexer");
const plugins_1 = require("./plugins");
const versioncontrol_1 = require("./versioncontrol");
const sourcegraph_1 = require("./sourcegraph");
const repoapi_1 = require("./repoapi");
;
exports.EMPTY_COMMIT_STATE = {
    description: [],
    licenses: [],
    plugins: [],
    store: {},
    binaries: [],
};
exports.EMPTY_RENDERED_APPLICATION_STATE = {
    description: [],
    licenses: [],
    plugins: [],
    store: {},
    binaries: [],
};
exports.EMPTY_COMMIT_DIFF = {
    description: { add: {}, remove: {} },
    licenses: { add: {}, remove: {} },
    plugins: { add: {}, remove: {} },
    store: {},
    binaries: { add: {}, remove: {} },
};
const CHECKPOINT_MODULO = 50;
exports.BRANCH_NAME_REGEX = /^[-_ ()[\]'"|a-zA-Z0-9]{3,100}$/;
const getRepos = async () => {
    const repoDir = await fs_1.default.promises.readdir(filestructure_1.vReposPath);
    return repoDir?.filter((repoName) => {
        return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(repoName);
    });
};
exports.getRepos = getRepos;
const getBranchIdFromName = (name) => {
    return name.toLowerCase().replaceAll(" ", "-").replaceAll(/[[\]'"]/g, "");
};
exports.getBranchIdFromName = getBranchIdFromName;
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
const getCurrentCommitSha = async (datasource, repoId) => {
    try {
        const current = await datasource.readCurrentRepoState(repoId);
        if (current.branch) {
            const branch = await datasource.readBranch(repoId, current.branch);
            return branch?.lastCommit ?? null;
        }
        if (current.commit) {
            return current.commit;
        }
        return null;
    }
    catch (e) {
        return null;
    }
};
exports.getCurrentCommitSha = getCurrentCommitSha;
const diffIsEmpty = (stateDiff) => {
    for (const prop in stateDiff) {
        if (prop == "store" && Object.keys(stateDiff?.store ?? {}).length != 0) {
            for (const pluginName in stateDiff.store) {
                if (Object.keys(stateDiff?.store?.[pluginName]?.add ?? {}).length != 0 ||
                    Object.keys(stateDiff?.store?.[pluginName]?.remove ?? {}).length != 0) {
                    return false;
                }
            }
        }
        if (Object.keys(stateDiff?.[prop]?.add ?? {}).length != 0) {
            return false;
        }
        if (Object.keys(stateDiff?.[prop]?.remove ?? {}).length != 0) {
            return false;
        }
    }
    return true;
};
exports.diffIsEmpty = diffIsEmpty;
const canCommit = async (datasource, repoId, user, message, diff) => {
    if (!user || !user.id) {
        return false;
    }
    if ((message ?? "").length == 0) {
        return false;
    }
    const currentSha = await (0, exports.getCurrentCommitSha)(datasource, repoId);
    const commit = await datasource.readCommit(repoId, currentSha);
    if (commit) {
        // ensure safe
    }
    const currentState = await datasource.readCurrentRepoState(repoId);
    if (!currentState) {
        return false;
    }
    if ((0, exports.diffIsEmpty)(diff)) {
        return false;
    }
    return true;
};
exports.canCommit = canCommit;
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
const getHistory = async (datasource, repoId, sha) => {
    if (sha == null) {
        return [];
    }
    const commit = await datasource.readCommit(repoId, sha);
    if (commit == null) {
        return null;
    }
    const history = await (0, exports.getHistory)(datasource, repoId, commit.parent);
    return [
        {
            sha,
            idx: commit.idx,
            message: commit.message,
            mergeBase: commit.mergeBase,
            parent: commit.parent,
            historicalParent: commit.historicalParent,
        },
        ...history,
    ];
};
exports.getHistory = getHistory;
const getBaseDivergenceSha = (history, origin) => {
    if (!origin) {
        return null;
    }
    const baseIdx = origin.idx + 1;
    for (const commit of history) {
        if (commit.idx == baseIdx) {
            return commit;
        }
    }
    return null;
};
exports.getBaseDivergenceSha = getBaseDivergenceSha;
const getDivergenceOriginSha = async (datasource, repoId, fromSha, intoSha) => {
    const fromHistory = await (0, exports.getHistory)(datasource, repoId, fromSha);
    if (!fromHistory) {
        throw "missing history";
    }
    const intoHistory = await (0, exports.getHistory)(datasource, repoId, intoSha);
    if (!fromHistory) {
        throw "missing history";
    }
    const longerHistory = fromHistory.length >= intoHistory.length ? fromHistory : intoHistory;
    const shorterHistory = fromHistory.length < intoHistory.length ? fromHistory : intoHistory;
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
const getCommitState = async (datasource, repoId, sha, historyLength, checkedHot, hotCheckpoint) => {
    if (!sha) {
        return exports.EMPTY_COMMIT_STATE;
    }
    if (checkedHot && hotCheckpoint) {
        if (hotCheckpoint[0] == sha) {
            return hotCheckpoint[1];
        }
    }
    if (!checkedHot) {
        checkedHot = true;
        hotCheckpoint = await datasource.readHotCheckpoint(repoId);
        if (hotCheckpoint && hotCheckpoint?.[0] == sha) {
            return hotCheckpoint[1];
        }
    }
    const commitData = await datasource.readCommit(repoId, sha);
    if (!historyLength) {
        historyLength = commitData.idx + 1;
    }
    if (commitData.idx % CHECKPOINT_MODULO == 0) {
        const checkpointState = await datasource.readCheckpoint(repoId, sha);
        if (checkpointState) {
            return checkpointState;
        }
    }
    const state = await (0, exports.getCommitState)(datasource, repoId, commitData.parent, historyLength, checkedHot, hotCheckpoint);
    const out = (0, exports.applyStateDiffToCommitState)(state, commitData.diff);
    if (commitData.idx % CHECKPOINT_MODULO == 0 &&
        commitData.idx < historyLength - CHECKPOINT_MODULO) {
        await datasource.saveCheckpoint(repoId, sha, out);
    }
    return out;
};
exports.getCommitState = getCommitState;
const applyStateDiffToCommitState = (applicationKVState, stateDiff) => {
    return Object.keys(stateDiff).reduce((acc, namespace) => {
        if (namespace == "store") {
            const store = Object.keys(stateDiff?.store ?? {}).reduce((storeAcc, pluginName) => {
                return {
                    ...storeAcc,
                    [pluginName]: (0, versioncontrol_1.applyDiff)(stateDiff?.store?.[pluginName] ?? { add: {}, remove: {} }, storeAcc?.[pluginName] ?? []),
                };
            }, applicationKVState?.store ?? {});
            return {
                ...acc,
                store,
            };
        }
        return {
            ...acc,
            [namespace]: (0, versioncontrol_1.applyDiff)(stateDiff[namespace], applicationKVState[namespace]),
        };
    }, applicationKVState);
};
exports.applyStateDiffToCommitState = applyStateDiffToCommitState;
const getCurrentBranch = async (datasource, repoId) => {
    const current = await datasource.readCurrentRepoState(repoId);
    if (current.branch) {
        const branch = await datasource.readBranch(repoId, current.branch);
        return branch;
    }
    return null;
};
exports.getCurrentBranch = getCurrentBranch;
const getUnstagedCommitState = async (datasource, repoId) => {
    const current = await datasource.readCurrentRepoState(repoId);
    const hotCheckpoint = await datasource.readHotCheckpoint(repoId);
    if (hotCheckpoint && current.commit) {
        if (hotCheckpoint[0] == current.commit) {
            return hotCheckpoint[1];
        }
    }
    const commitState = await (0, exports.getCommitState)(datasource, repoId, current.commit);
    if (current.commit) {
        await datasource.saveHotCheckpoint(repoId, current.commit, commitState);
    }
    return commitState;
};
exports.getUnstagedCommitState = getUnstagedCommitState;
const getApplicationState = async (datasource, repoId) => {
    return await datasource.readRenderedState(repoId);
};
exports.getApplicationState = getApplicationState;
const convertRenderedCommitStateToKv = async (datasource, renderedAppState) => {
    const out = {
        description: [],
        licenses: [],
        plugins: [],
        store: undefined,
        binaries: [],
    };
    for (const prop in renderedAppState) {
        if (prop == "store") {
            out[prop] = await (0, exports.convertRenderedStateStoreToKV)(datasource, renderedAppState);
            continue;
        }
        out[prop] = renderedAppState[prop];
    }
    return out;
};
exports.convertRenderedCommitStateToKv = convertRenderedCommitStateToKv;
/**
 * MAINTAINS BRANCH
 */
const updateCurrentCommitSHA = async (datasource, repoId, sha, isResolvingMerge) => {
    try {
        const current = await datasource.readCurrentRepoState(repoId);
        if (current.isInMergeConflict && !isResolvingMerge) {
            return null;
        }
        const updated = {
            ...current,
            commit: sha,
            isInMergeConflict: false,
            merge: null,
        };
        const nextState = await datasource.saveCurrentRepoState(repoId, updated);
        const unrenderedState = await (0, exports.getCommitState)(datasource, repoId, sha);
        const renderedState = await (0, exports.convertCommitStateToRenderedState)(datasource, unrenderedState);
        await datasource.saveRenderedState(repoId, renderedState);
        return nextState;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentCommitSHA = updateCurrentCommitSHA;
/**
 * DETACHES HEAD FROM BRANCH
 */
const updateCurrentWithSHA = async (datasource, repoId, sha, isResolvingMerge) => {
    try {
        const current = await datasource.readCurrentRepoState(repoId);
        if (current.isInMergeConflict && !isResolvingMerge) {
            return null;
        }
        const updated = {
            ...current,
            commit: sha,
            branch: null,
            isInMergeConflict: false,
            merge: null,
        };
        const nextState = await datasource.saveCurrentRepoState(repoId, updated);
        const unrenderedState = await (0, exports.getCommitState)(datasource, repoId, sha);
        const renderedState = await (0, exports.convertCommitStateToRenderedState)(datasource, unrenderedState);
        await datasource.saveRenderedState(repoId, renderedState);
        return nextState;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentWithSHA = updateCurrentWithSHA;
const updateCurrentWithNewBranch = async (datasource, repoId, branch) => {
    try {
        const current = await datasource.readCurrentRepoState(repoId);
        if (current.isInMergeConflict) {
            return null;
        }
        const updated = {
            ...current,
            commit: branch?.lastCommit,
            branch: branch.id,
        };
        await datasource.saveCurrentRepoState(repoId, updated);
        const unrenderedState = await (0, exports.getCommitState)(datasource, repoId, branch?.lastCommit);
        const renderedState = await (0, exports.convertCommitStateToRenderedState)(datasource, unrenderedState);
        await datasource.saveRenderedState(repoId, renderedState);
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentWithNewBranch = updateCurrentWithNewBranch;
const updateCurrentBranch = async (datasource, repoId, branchId) => {
    try {
        const current = await datasource.readCurrentRepoState(repoId);
        if (current.isInMergeConflict) {
            return null;
        }
        const branch = await datasource.readBranch(repoId, branchId);
        const updated = {
            ...current,
            commit: branch.lastCommit,
            branch: branchId,
        };
        await datasource.saveBranch(repoId, branchId, branch);
        return await datasource.saveCurrentRepoState(repoId, updated);
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
const getDefaultComparison = async (datasource, repoId, repoState) => {
    const renderedState = await (0, exports.getApplicationState)(datasource, repoId);
    const applicationKVState = await (0, exports.convertRenderedCommitStateToKv)(datasource, renderedState);
    const unstagedState = await (0, exports.getUnstagedCommitState)(datasource, repoId);
    const isWIP = unstagedState && (0, exports.getIsWip)(unstagedState, applicationKVState);
    if (isWIP) {
        return {
            against: "wip",
            branch: null,
            commit: null,
        };
    }
    if (repoState?.branch) {
        const currentBranch = await datasource?.readBranch(repoId, repoState?.branch);
        if (currentBranch && currentBranch?.baseBranchId) {
            const baseBranch = currentBranch?.baseBranchId
                ? await datasource?.readBranch(repoId, currentBranch?.baseBranchId)
                : null;
            if (baseBranch?.id) {
                return {
                    against: "branch",
                    branch: baseBranch?.id,
                    commit: null,
                };
            }
        }
    }
    if (repoState?.commit) {
        const currentCommit = await datasource?.readCommit(repoId, repoState?.commit);
        if (currentCommit && currentCommit?.parent) {
            const previousCommit = currentCommit?.parent
                ? await datasource?.readCommit(repoId, currentCommit?.parent)
                : null;
            if (previousCommit?.sha) {
                return {
                    against: "sha",
                    branch: null,
                    commit: previousCommit.sha,
                };
            }
        }
    }
    return {
        against: "wip",
        branch: null,
        commit: null,
    };
};
const changeCommandMode = async (datasource, repoId, commandMode) => {
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const nextRepoState = {
            ...currentRepoState,
            commandMode,
            comparison: commandMode == "compare"
                ? await getDefaultComparison(datasource, repoId, currentRepoState)
                : null,
        };
        await datasource.saveCurrentRepoState(repoId, nextRepoState);
        return nextRepoState;
    }
    catch (e) {
        return null;
    }
};
exports.changeCommandMode = changeCommandMode;
const updateComparison = async (datasource, repoId, against, branchId, sha) => {
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (!currentRepoState || currentRepoState?.commandMode != "compare") {
            return null;
        }
        if (against == "wip") {
            const nextRepoState = {
                ...currentRepoState,
                comparison: {
                    against,
                    branch: null,
                    commit: null,
                }
            };
            return await datasource.saveCurrentRepoState(repoId, nextRepoState);
        }
        if (against == "branch") {
            const nextRepoState = {
                ...currentRepoState,
                comparison: {
                    against,
                    branch: branchId ?? null,
                    commit: null,
                }
            };
            return await datasource.saveCurrentRepoState(repoId, nextRepoState);
        }
        if (against == "sha") {
            const nextRepoState = {
                ...currentRepoState,
                comparison: {
                    against,
                    branch: null,
                    commit: sha ?? null,
                }
            };
            return await datasource.saveCurrentRepoState(repoId, nextRepoState);
        }
        return null;
    }
    catch (e) {
        return null;
    }
};
exports.updateComparison = updateComparison;
const buildStateStore = async (datasource, appKvState) => {
    let out = {};
    const manifests = await (0, plugins_1.getPluginManifests)(datasource, appKvState.plugins);
    for (const pluginManifest of manifests) {
        const kv = appKvState?.store?.[pluginManifest.name] ?? [];
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(datasource, pluginManifest);
        const pluginState = (0, plugins_1.getStateFromKVForPlugin)(schemaMap, kv, pluginManifest.name);
        out[pluginManifest.name] = pluginState;
    }
    return out;
};
exports.buildStateStore = buildStateStore;
const convertStateStoreToKV = async (datasource, appKVState, stateStore) => {
    let out = {};
    const manifests = await (0, plugins_1.getPluginManifests)(datasource, appKVState.plugins);
    for (const pluginManifest of manifests) {
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(datasource, pluginManifest);
        const kv = await (0, plugins_1.getKVStateForPlugin)(datasource, schemaMap, pluginManifest.name, stateStore);
        out[pluginManifest.name] = kv;
    }
    return out;
};
exports.convertStateStoreToKV = convertStateStoreToKV;
const convertRenderedStateStoreToKV = async (datasource, renderedAppState) => {
    let out = {};
    const manifests = await (0, plugins_1.getPluginManifests)(datasource, renderedAppState.plugins);
    for (const pluginManifest of manifests) {
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(datasource, pluginManifest);
        const kv = await (0, plugins_1.getKVStateForPlugin)(datasource, schemaMap, pluginManifest.name, renderedAppState.store);
        out[pluginManifest.name] = kv;
    }
    return out;
};
exports.convertRenderedStateStoreToKV = convertRenderedStateStoreToKV;
const convertCommitStateToRenderedState = async (datasource, appKVState) => {
    const store = await (0, exports.buildStateStore)(datasource, appKVState);
    return {
        ...appKVState,
        store,
    };
};
exports.convertCommitStateToRenderedState = convertCommitStateToRenderedState;
const tokenizeCommitState = (appKVState) => {
    const tokenStore = {};
    const description = appKVState.description.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.hashString)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const licenses = appKVState.licenses.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.getKVHash)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const plugins = appKVState.plugins.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.getKVHash)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const binaries = appKVState.binaries.reduce((acc, value) => {
        const hash = (0, versioncontrol_1.hashString)(value);
        tokenStore[hash] = value;
        return [...acc, hash];
    }, []);
    const store = Object.keys(appKVState.store).reduce((acc, key) => {
        const pluginStore = appKVState.store[key].reduce((storeAcc, value) => {
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
const mergeTokenStores = (fromStore, intoStore) => {
    return {
        ...fromStore,
        ...intoStore,
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
const uniqueStrings = (strings) => {
    let out = [];
    let seen = new Set();
    for (let str of strings) {
        if (!seen.has(str)) {
            seen.add(str);
            out.push(str);
        }
    }
    return out.sort();
};
exports.uniqueStrings = uniqueStrings;
const getStateDiffFromCommitStates = (beforeKVState, afterKVState) => {
    const stateDiff = {
        plugins: {
            add: {},
            remove: {},
        },
        binaries: {
            add: {},
            remove: {},
        },
        store: {},
        licenses: {
            add: {},
            remove: {},
        },
        description: {
            add: {},
            remove: {},
        },
    };
    const pluginsToTraverse = Array.from([
        ...Object.keys(beforeKVState.store),
        ...Object.keys(afterKVState.store),
    ]);
    for (const prop in afterKVState) {
        if (prop == "store") {
            for (const pluginName of pluginsToTraverse) {
                const diff = (0, versioncontrol_1.getDiff)(beforeKVState?.store?.[pluginName] ?? [], afterKVState?.store?.[pluginName] ?? []);
                stateDiff.store[pluginName] = diff;
            }
            continue;
        }
        if (prop == "description" || prop == "binaries") {
            const diff = (0, versioncontrol_1.getArrayStringDiff)((beforeKVState?.[prop] ?? []), (afterKVState?.[prop] ?? []));
            stateDiff[prop] = diff;
            continue;
        }
        const diff = (0, versioncontrol_1.getDiff)(beforeKVState?.[prop] ?? [], afterKVState?.[prop] ?? []);
        stateDiff[prop] = diff;
    }
    return stateDiff;
};
exports.getStateDiffFromCommitStates = getStateDiffFromCommitStates;
const getMergeCommitStates = async (datasource, repoId, fromSha, intoSha) => {
    try {
        const originSha = await (0, exports.getDivergenceOriginSha)(datasource, repoId, fromSha, intoSha);
        const fromCommitState = await (0, exports.getCommitState)(datasource, repoId, fromSha);
        const intoCommitState = await (0, exports.getCommitState)(datasource, repoId, intoSha);
        const originCommit = !!originSha
            ? await (0, exports.getCommitState)(datasource, repoId, originSha)
            : exports.EMPTY_COMMIT_STATE;
        return {
            fromCommitState,
            intoCommitState,
            originCommit,
        };
    }
    catch (e) {
        return null;
    }
};
exports.getMergeCommitStates = getMergeCommitStates;
const canAutoMergeCommitStates = async (datasource, fromCommitState, intoCommitState, originCommitState) => {
    try {
        const yourMerge = await (0, exports.getMergedCommitState)(datasource, fromCommitState, intoCommitState, originCommitState, "yours");
        const theirMerge = await (0, exports.getMergedCommitState)(datasource, fromCommitState, intoCommitState, originCommitState, "theirs");
        return JSON.stringify(yourMerge) == JSON.stringify(theirMerge);
    }
    catch (e) {
        return null;
    }
};
exports.canAutoMergeCommitStates = canAutoMergeCommitStates;
const getMergedCommitState = async (datasource, fromState, intoState, originCommit, direction = "yours") => {
    try {
        const [tokenizedCommitFrom, tokenizedStoreFrom] = (0, exports.tokenizeCommitState)(fromState);
        const [tokenizedCommitInto, tokenizedStoreInto] = (0, exports.tokenizeCommitState)(intoState);
        const [tokenizedOrigin] = (0, exports.tokenizeCommitState)(originCommit);
        const tokenizedDescription = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.description, tokenizedCommitFrom.description, tokenizedCommitInto.description, direction);
        const tokenizedLicenses = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.licenses, tokenizedCommitFrom.licenses, tokenizedCommitInto.licenses, direction);
        const tokenizedPlugins = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.plugins, tokenizedCommitFrom.plugins, tokenizedCommitInto.plugins, direction);
        const tokenizedBinaries = (0, versioncontrol_1.getMergeSequence)(tokenizedOrigin.binaries, tokenizedCommitFrom.binaries, tokenizedCommitInto.binaries, direction);
        const pluginsToTraverse = Array.from([
            ...Object.keys(tokenizedCommitFrom.store),
            ...Object.keys(tokenizedCommitInto.store),
        ]);
        const tokenizedStore = {};
        for (const pluginName of pluginsToTraverse) {
            const pluginKVsFrom = tokenizedCommitFrom?.store?.[pluginName] ?? [];
            const pluginKVsInto = tokenizedCommitInto?.store?.[pluginName] ?? [];
            const orignKVs = tokenizedOrigin?.store?.[pluginName] ?? [];
            const pluginStoreSequence = (0, versioncontrol_1.getMergeSequence)(orignKVs, pluginKVsFrom, pluginKVsInto, direction);
            tokenizedStore[pluginName] = pluginStoreSequence;
        }
        const tokenStore = (0, exports.mergeTokenStores)(tokenizedStoreFrom, tokenizedStoreInto);
        const tokenizedState = {
            description: tokenizedDescription,
            licenses: tokenizedLicenses,
            plugins: tokenizedPlugins,
            store: tokenizedStore,
            binaries: tokenizedBinaries,
        };
        const mergeState = (0, exports.detokenizeStore)(tokenizedState, tokenStore);
        mergeState.plugins = (0, exports.uniqueKV)(mergeState.plugins);
        mergeState.licenses = (0, exports.uniqueKV)(mergeState.licenses);
        let stateStore = await (0, exports.buildStateStore)(datasource, mergeState);
        const manifests = await (0, plugins_1.getPluginManifests)(datasource, mergeState.plugins);
        const schemaMap = (0, plugins_1.manifestListToSchemaMap)(manifests);
        stateStore = await (0, plugins_1.cascadePluginState)(datasource, schemaMap, stateStore);
        stateStore = await (0, plugins_1.nullifyMissingFileRefs)(datasource, schemaMap, stateStore);
        const binaries = await (0, plugins_1.collectFileRefs)(datasource, schemaMap, stateStore);
        mergeState.store = await (0, exports.convertStateStoreToKV)(datasource, mergeState, stateStore);
        mergeState.binaries = (0, exports.uniqueStrings)(binaries);
        return mergeState;
    }
    catch (e) {
        return null;
    }
};
exports.getMergedCommitState = getMergedCommitState;
const getCanAutoMergeOnUnStagedState = async (datasource, repoId, mergeSha) => {
    try {
        const unstagedState = await (0, exports.getUnstagedCommitState)(datasource, repoId);
        const repoState = await datasource.readCurrentRepoState(repoId);
        const mergeState = await (0, exports.getCommitState)(datasource, repoId, mergeSha);
        const { originCommit } = await (0, exports.getMergeCommitStates)(datasource, repoId, repoState.commit, mergeSha);
        return await (0, exports.canAutoMergeCommitStates)(datasource, unstagedState, mergeState, originCommit);
    }
    catch (e) {
        return null;
    }
};
exports.getCanAutoMergeOnUnStagedState = getCanAutoMergeOnUnStagedState;
const getCanAutoMergeOnTopCurrentState = async (datasource, repoId, mergeSha) => {
    try {
        const currentRenderedState = await datasource.readRenderedState(repoId);
        const currentAppKVstate = await (0, exports.convertRenderedCommitStateToKv)(datasource, currentRenderedState);
        const repoState = await datasource.readCurrentRepoState(repoId);
        const mergeState = await (0, exports.getCommitState)(datasource, repoId, mergeSha);
        const { originCommit } = await (0, exports.getMergeCommitStates)(datasource, repoId, repoState.commit, mergeSha);
        return await (0, exports.canAutoMergeCommitStates)(datasource, currentAppKVstate, mergeState, originCommit);
    }
    catch (e) {
        return null;
    }
};
exports.getCanAutoMergeOnTopCurrentState = getCanAutoMergeOnTopCurrentState;
const getApiDiff = (beforeState, afterState, stateDiff) => {
    const description = {
        added: Object.keys(stateDiff.description.add).map((v) => parseInt(v)),
        removed: Object.keys(stateDiff.description.remove).map((v) => parseInt(v)),
    };
    const licenses = {
        added: Object.keys(stateDiff.licenses.add).map((v) => parseInt(v)),
        removed: Object.keys(stateDiff.licenses.remove).map((v) => parseInt(v)),
    };
    const plugins = {
        added: Object.keys(stateDiff.plugins.add).map((v) => parseInt(v)),
        removed: Object.keys(stateDiff.plugins.remove).map((v) => parseInt(v)),
    };
    let store = {};
    for (const pluginName in (stateDiff?.store ?? {})) {
        if (!beforeState?.store?.[pluginName]) {
            // show only added state
            const afterIndexedKvs = (0, plugins_1.reIndexSchemaArrays)(afterState?.store?.[pluginName] ?? []);
            const added = Object.keys(stateDiff?.store?.[pluginName]?.add ?? {})
                .map((v) => parseInt(v))
                .map((i) => afterIndexedKvs[i]);
            store[pluginName] = {
                added,
                removed: [],
            };
            continue;
        }
        if (!afterState?.store?.[pluginName]) {
            // show only removed state
            const beforeIndexedKvs = (0, plugins_1.reIndexSchemaArrays)(beforeState?.store?.[pluginName] ?? []);
            const removed = Object.keys(stateDiff?.store?.[pluginName]?.remove ?? {})
                .map((v) => parseInt(v))
                .map((i) => beforeIndexedKvs[i]);
            store[pluginName] = {
                added: [],
                removed,
            };
            continue;
        }
        const afterIndexedKvs = (0, plugins_1.reIndexSchemaArrays)(afterState?.store?.[pluginName] ?? []);
        const added = Object.keys(stateDiff?.store?.[pluginName]?.add ?? {})
            .map((v) => parseInt(v))
            .map((i) => afterIndexedKvs[i]);
        const beforeIndexedKvs = (0, plugins_1.reIndexSchemaArrays)(beforeState?.store?.[pluginName] ?? []);
        const removed = Object.keys(stateDiff?.store?.[pluginName]?.remove ?? {})
            .map((v) => parseInt(v))
            .map((i) => beforeIndexedKvs[i]);
        store[pluginName] = {
            added,
            removed,
        };
    }
    return {
        description,
        licenses,
        plugins,
        store,
    };
};
exports.getApiDiff = getApiDiff;
const getInvalidStates = async (datasource, appKvState) => {
    const manifests = await (0, plugins_1.getPluginManifests)(datasource, appKvState.plugins);
    const schemaMap = (0, plugins_1.manifestListToSchemaMap)(manifests);
    const store = {};
    for (let pluginName in appKvState.store) {
        const invalidStateIndices = await (0, plugins_1.getPluginInvalidStateIndices)(datasource, schemaMap, appKvState.store[pluginName], pluginName);
        const indexedKvs = (0, plugins_1.reIndexSchemaArrays)(appKvState?.store?.[pluginName] ?? []);
        store[pluginName] = invalidStateIndices.map(i => indexedKvs[i]);
    }
    return store;
};
exports.getInvalidStates = getInvalidStates;
const getIsWip = (unstagedState, applicationKVState) => {
    const diff = (0, exports.getStateDiffFromCommitStates)(unstagedState, applicationKVState);
    return !(0, exports.diffIsEmpty)(diff);
};
exports.getIsWip = getIsWip;
const getBranchFromRepoState = async (repoId, datasource, repoState) => {
    if (!repoState?.branch) {
        return null;
    }
    return (await datasource.readBranch(repoId, repoState?.branch)) ?? null;
};
exports.getBranchFromRepoState = getBranchFromRepoState;
const getBaseBranchFromBranch = async (repoId, datasource, branch) => {
    if (!branch) {
        return null;
    }
    if (!branch?.baseBranchId) {
        return null;
    }
    return (await datasource.readBranch(repoId, branch?.baseBranchId)) ?? null;
};
exports.getBaseBranchFromBranch = getBaseBranchFromBranch;
const getLastCommitFromRepoState = async (repoId, datasource, repoState) => {
    if (!repoState?.commit) {
        return null;
    }
    return (await datasource.readCommit(repoId, repoState?.commit)) ?? null;
};
exports.getLastCommitFromRepoState = getLastCommitFromRepoState;
const getApiDiffFromComparisonState = async (repoId, datasource, repoState, applicationKVState) => {
    if (repoState.comparison?.against == "branch") {
        const comparatorBranch = repoState?.comparison?.branch
            ? await datasource.readBranch(repoId, repoState?.comparison?.branch)
            : null;
        const branchState = await (0, exports.getCommitState)(datasource, repoId, comparatorBranch?.lastCommit);
        const diff = (0, exports.getStateDiffFromCommitStates)(branchState, applicationKVState);
        const beforeState = await (0, exports.convertCommitStateToRenderedState)(datasource, branchState);
        const beforeApiStoreInvalidity = await (0, exports.getInvalidStates)(datasource, branchState);
        const beforeManifests = await (0, plugins_1.getPluginManifests)(datasource, branchState.plugins);
        const beforeSchemaMap = (0, plugins_1.manifestListToSchemaMap)(beforeManifests);
        return {
            beforeState,
            beforeApiStoreInvalidity,
            beforeManifests,
            beforeSchemaMap,
            apiDiff: (0, exports.getApiDiff)(branchState, applicationKVState, diff)
        };
    }
    if (repoState.comparison?.against == "sha") {
        const commitState = await (0, exports.getCommitState)(datasource, repoId, repoState.comparison?.commit);
        const diff = (0, exports.getStateDiffFromCommitStates)(commitState, applicationKVState);
        const beforeState = await (0, exports.convertCommitStateToRenderedState)(datasource, commitState);
        const beforeApiStoreInvalidity = await (0, exports.getInvalidStates)(datasource, commitState);
        const beforeManifests = await (0, plugins_1.getPluginManifests)(datasource, commitState.plugins);
        const beforeSchemaMap = (0, plugins_1.manifestListToSchemaMap)(beforeManifests);
        return {
            beforeState,
            beforeApiStoreInvalidity,
            beforeManifests,
            beforeSchemaMap,
            apiDiff: (0, exports.getApiDiff)(commitState, applicationKVState, diff)
        };
    }
    // "WIP"
    const unstagedState = await (0, exports.getUnstagedCommitState)(datasource, repoId);
    const diff = (0, exports.getStateDiffFromCommitStates)(unstagedState, applicationKVState);
    const beforeState = await (0, exports.convertCommitStateToRenderedState)(datasource, unstagedState);
    const beforeApiStoreInvalidity = await (0, exports.getInvalidStates)(datasource, unstagedState);
    const beforeManifests = await (0, plugins_1.getPluginManifests)(datasource, unstagedState.plugins);
    const beforeSchemaMap = (0, plugins_1.manifestListToSchemaMap)(beforeManifests);
    return {
        beforeState,
        beforeApiStoreInvalidity,
        beforeManifests,
        beforeSchemaMap,
        apiDiff: (0, exports.getApiDiff)(unstagedState, applicationKVState, diff)
    };
};
exports.getApiDiffFromComparisonState = getApiDiffFromComparisonState;
const renderApiReponse = async (repoId, datasource, renderedApplicationState, applicationKVState, repoState) => {
    const apiStoreInvalidity = await (0, exports.getInvalidStates)(datasource, applicationKVState);
    const manifests = await (0, plugins_1.getPluginManifests)(datasource, renderedApplicationState.plugins);
    const schemaMap = (0, plugins_1.manifestListToSchemaMap)(manifests);
    const branch = await (0, exports.getBranchFromRepoState)(repoId, datasource, repoState);
    const baseBranch = await (0, exports.getBaseBranchFromBranch)(repoId, datasource, branch);
    const lastCommit = await (0, exports.getLastCommitFromRepoState)(repoId, datasource, repoState);
    if (repoState.commandMode == "edit") {
        const unstagedState = await (0, exports.getUnstagedCommitState)(datasource, repoId);
        const isWIP = unstagedState && (0, exports.getIsWip)(unstagedState, applicationKVState);
        const [canPopStashedChanges, stashSize] = await Promise.all([
            (0, repoapi_1.getCanPopStashedChanges)(datasource, repoId),
            (0, repoapi_1.getStashSize)(datasource, repoId)
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
            stashSize
        };
    }
    if (repoState.commandMode == "view") {
        const unstagedState = await (0, exports.getUnstagedCommitState)(datasource, repoId);
        const isWIP = unstagedState && (0, exports.getIsWip)(unstagedState, applicationKVState);
        return {
            apiStoreInvalidity,
            repoState,
            applicationState: renderedApplicationState,
            schemaMap,
            branch,
            baseBranch,
            lastCommit,
            isWIP
        };
    }
    if (repoState.commandMode == "compare") {
        const unstagedState = await (0, exports.getUnstagedCommitState)(datasource, repoId);
        const isWIP = unstagedState && (0, exports.getIsWip)(unstagedState, applicationKVState);
        const { apiDiff, beforeState, beforeApiStoreInvalidity, beforeManifests, beforeSchemaMap } = await (0, exports.getApiDiffFromComparisonState)(repoId, datasource, repoState, applicationKVState);
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
        };
    }
    return null;
};
exports.renderApiReponse = renderApiReponse;
const renderSourceGraph = async (repoId, datasource) => {
    try {
        const sourcegraph = new sourcegraph_1.SourceGraph(datasource, repoId);
        const [, branches, branchesMetaState] = await Promise.all([
            sourcegraph.buildGraph(),
            datasource.readBranches(repoId),
            datasource.readBranchesMetaState(repoId),
        ]);
        return {
            rootNodes: sourcegraph.getGraph(),
            pointers: sourcegraph.getPointers(),
            branches,
            branchesMetaState,
        };
    }
    catch (e) {
        console.log("E", e);
        return null;
    }
};
exports.renderSourceGraph = renderSourceGraph;
//# sourceMappingURL=repo.js.map