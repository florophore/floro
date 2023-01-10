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
exports.buildStateStore = exports.updateCurrentBranch = exports.updateCurrentWithNewBranch = exports.updateCurrentWithSHA = exports.updateCurrentCommitSHA = exports.saveDiffListToCurrent = exports.getRepoState = exports.getUnstagedCommitState = exports.getCurrentBranch = exports.getCommitState = exports.updateLocalBranch = exports.deleteLocalBranch = exports.getLocalBranch = exports.getHistory = exports.writeCommit = exports.readCommit = exports.canCommit = exports.diffIsEmpty = exports.getCommitDirPath = exports.getLocalBranches = exports.getCurrentCommitSha = exports.getCurrentState = exports.getRepoSettings = exports.cloneRepo = exports.getLocalRepos = void 0;
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
const getCurrentCommitSha = async (repoId) => {
    try {
        const current = await (0, exports.getCurrentState)(repoId);
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
const canCommit = async (repoId, user, message) => {
    if (!user || !user.id) {
        return false;
    }
    if ((message ?? "").length == 0) {
        return false;
    }
    const currentSha = await (0, exports.getCurrentCommitSha)(repoId);
    const commit = await (0, exports.readCommit)(repoId, currentSha);
    if (!commit) {
        return false;
    }
    const currentState = await (0, exports.getCurrentState)(repoId);
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
    const history = await (0, exports.getHistory)(repoId, commit.historicalParent);
    return [{
            sha,
            message: commit.message
        }, ...history];
};
exports.getHistory = getHistory;
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
const getCurrentBranch = async (repoId) => {
    const current = await (0, exports.getCurrentState)(repoId);
    if (current.branch) {
        const branch = await (0, exports.getLocalBranch)(repoId, current.branch);
        return branch;
    }
    return null;
};
exports.getCurrentBranch = getCurrentBranch;
const getUnstagedCommitState = async (repoId) => {
    const current = await (0, exports.getCurrentState)(repoId);
    if (current.branch) {
        const branch = await (0, exports.getLocalBranch)(repoId, current.branch);
        const commitState = await (0, exports.getCommitState)(repoId, branch.lastCommit);
        return commitState;
    }
    const commitState = await (0, exports.getCommitState)(repoId, current.commit);
    return commitState;
};
exports.getUnstagedCommitState = getUnstagedCommitState;
const getRepoState = async (repoId) => {
    const current = await (0, exports.getCurrentState)(repoId);
    const state = await (0, exports.getUnstagedCommitState)(repoId);
    return Object.keys(current.diff).reduce((acc, namespace) => {
        if (namespace == "store") {
            const store = Object.keys(acc?.store ?? {}).reduce((storeAcc, pluginName) => {
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
const saveDiffListToCurrent = async (repoId, diffList) => {
    const current = await (0, exports.getCurrentState)(repoId);
    const commitState = await (0, exports.getCommitState)(repoId);
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
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
        const nextPlugins = (0, versioncontrol_1.applyDiff)(updated.diff.plugins, commitState.plugins);
        const pluginNameSet = new Set(nextPlugins.map((p) => p.key));
        for (let pluginName in updated.diff.store) {
            if (!pluginNameSet.has(pluginName)) {
                delete updated.diff.store[pluginName];
            }
        }
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return current;
    }
};
exports.saveDiffListToCurrent = saveDiffListToCurrent;
/**
 *
 * use when committing gainst branch or sha
 */
const updateCurrentCommitSHA = async (repoId, sha) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await (0, exports.getCurrentState)(repoId);
        const updated = {
            ...current,
            commit: sha,
            diff: EMPTY_COMMIT_DIFF,
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
const updateCurrentWithSHA = async (repoId, sha) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await (0, exports.getCurrentState)(repoId);
        const updated = {
            ...current,
            commit: sha,
            branch: null,
            diff: EMPTY_COMMIT_DIFF,
        };
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentWithSHA = updateCurrentWithSHA;
const updateCurrentWithNewBranch = async (repoId, branchName) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await (0, exports.getCurrentState)(repoId);
        const updated = {
            ...current,
            commit: null,
            branch: branchName
        };
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(updated, null, 2)));
        return updated;
    }
    catch (e) {
        return null;
    }
};
exports.updateCurrentWithNewBranch = updateCurrentWithNewBranch;
const updateCurrentBranch = async (repoId, branchName) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        const current = await (0, exports.getCurrentState)(repoId);
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
const buildStateStore = async (state) => {
    let out = {};
    const plugins = new Set(state.plugins.map(v => v.key));
    for (let pluginName in state.store) {
        if (plugins.has(pluginName)) {
            const kv = state?.store?.[pluginName] ?? [];
            const manifest = await (0, plugins_1.getPluginManifest)(pluginName, state?.plugins ?? []);
            const pluginState = (0, plugins_1.generateStateFromKV)(manifest, kv, pluginName);
            out[pluginName] = pluginState;
        }
    }
    return out;
};
exports.buildStateStore = buildStateStore;
//# sourceMappingURL=repo.js.map