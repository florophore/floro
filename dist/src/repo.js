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
exports.buildStateStore = exports.saveDiffListToCurrent = exports.getRepoState = exports.getUnstagedCommitState = exports.getCurrentBranch = exports.getCommitState = exports.getLocalBranch = exports.getLocalBranches = exports.getCurrentState = exports.getRepoSettings = exports.cloneRepo = exports.getLocalRepos = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const multiplexer_1 = require("./multiplexer");
const plugins_1 = require("./plugins");
const versioncontrol_1 = require("./versioncontrol");
;
;
;
;
;
const EMPTY_COMMIT_STATE = {
    description: [],
    licenses: [],
    plugins: [],
    store: {},
    binaries: [],
};
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
            await fs_1.default.promises.chmod(repoPath, 0o755);
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
const getCommitState = async (repoId, sha) => {
    if (!sha) {
        return EMPTY_COMMIT_STATE;
    }
    // replay here
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
            const store = Object.keys(current?.diff?.store ?? {}).reduce((storeAcc, pluginName) => {
                return {
                    ...storeAcc,
                    [pluginName]: (0, versioncontrol_1.applyDiff)(current.diff?.store?.[pluginName] ?? { add: {}, remove: {} }, state?.[pluginName] ?? []),
                };
            }, state?.store ?? {});
            return {
                ...acc,
                store,
            };
        }
        return {
            ...acc,
            [namespace]: (0, versioncontrol_1.applyDiff)(current.diff[namespace], state[namespace]),
        };
    }, {});
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
const buildStateStore = async (state) => {
    let out = {};
    for (let pluginName in state.store) {
        const kv = state.store[pluginName] ?? [];
        const manifest = await (0, plugins_1.getPluginManifest)(pluginName, state?.plugins ?? []);
        const pluginState = (0, plugins_1.generateStateFromKV)(manifest, kv, pluginName);
        out[pluginName] = pluginState;
    }
    return out;
};
exports.buildStateStore = buildStateStore;
//# sourceMappingURL=repo.js.map