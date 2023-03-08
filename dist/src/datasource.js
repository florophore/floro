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
exports.makeMemoizedDataSource = exports.makeDataSource = exports.readRepos = exports.getPluginManifest = exports.downloadPlugin = exports.readDevPluginManifest = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importStar(require("fs"));
const filestructure_1 = require("./filestructure");
const axios_1 = __importDefault(require("axios"));
const multiplexer_1 = require("./multiplexer");
const tar_1 = __importDefault(require("tar"));
axios_1.default.defaults.validateStatus = function () {
    return true;
};
/* PLUGINS */
/**
 * We need to export readDevPluginManifest for the daemon server
 * all other methods not in datasource should remain internal to
 * this file.
 */
const readDevPluginManifest = async (pluginName, pluginVersion) => {
    const pluginsJSON = await (0, filestructure_1.getPluginsJsonAsync)();
    if (!pluginsJSON) {
        return null;
    }
    if (pluginsJSON.plugins?.[pluginName]?.proxy &&
        !pluginVersion.startsWith("dev@")) {
        try {
            const uri = `http://127.0.0.1:63403/plugins/${pluginName}/dev/floro/floro.manifest.json`;
            const res = await axios_1.default.get(uri);
            return res.data;
        }
        catch (e) {
            return null;
        }
    }
    try {
        const pluginManifestPath = path_1.default.join(filestructure_1.vDEVPath, pluginName, pluginVersion.split("@")?.[1] ?? "none", "floro", "floro.manifest.json");
        const manifestString = await fs_1.default.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
    }
    catch (e) {
        return null;
    }
};
exports.readDevPluginManifest = readDevPluginManifest;
const pullPluginTar = async (name, version, link, hash) => {
    const downloadPath = path_1.default.join(filestructure_1.vTMPPath, `${hash}.tar.gz`);
    const pluginPath = path_1.default.join(filestructure_1.vPluginsPath, name, version);
    const didWrite = await axios_1.default.get(link);
    await (0, axios_1.default)({
        method: "get",
        url: link,
        onDownloadProgress: (progressEvent) => {
            (0, multiplexer_1.broadcastAllDevices)(`plugin:${name}@${version}:download-progress`, progressEvent);
        },
        responseType: "stream",
    }).then((response) => {
        const exists = fs_1.default.existsSync(downloadPath);
        if (exists) {
            return true;
        }
        const writer = (0, fs_1.createWriteStream)(downloadPath);
        return new Promise((resolve) => {
            response.data.pipe(writer);
            let error = null;
            writer.on("error", (err) => {
                error = err;
                writer.close();
                resolve(false);
            });
            writer.on("close", () => {
                if (!error) {
                    resolve(true);
                }
            });
        });
    });
    const exists = await (0, filestructure_1.existsAsync)(pluginPath);
    if (!exists && didWrite) {
        await fs_1.default.promises.mkdir(pluginPath, { recursive: true });
        if (process.env.NODE_ENV != "test") {
            await fs_1.default.promises.chmod(pluginPath, 0o755);
        }
        await tar_1.default.x({
            file: downloadPath,
            cwd: pluginPath,
        });
    }
    if (exists && didWrite) {
        await tar_1.default.x({
            file: downloadPath,
            cwd: pluginPath,
        });
    }
    const downloadExists = await (0, filestructure_1.existsAsync)(downloadPath);
    if (downloadExists) {
        await fs_1.default.promises.rm(downloadPath);
    }
    if (didWrite) {
        const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, name, version, "floro", "floro.manifest.json");
        const manifestString = await fs_1.default.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
    }
    return null;
};
const downloadPlugin = async (pluginName, pluginVersion) => {
    const remote = await (0, filestructure_1.getRemoteHostAsync)();
    const session = await (0, filestructure_1.getUserSessionAsync)();
    const request = await axios_1.default.get(`${remote}/api/plugin/${pluginName}/${pluginVersion}/install`, {
        headers: {
            ["session_key"]: session?.clientKey,
        },
    });
    if (request.status == 200) {
        const installResponse = request.data;
        for (const dependency of installResponse.dependencies) {
            const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, dependency.name, dependency.version, "floro", "floro.manifest.json");
            const existsLocallly = await (0, filestructure_1.existsAsync)(pluginManifestPath);
            if (existsLocallly) {
                continue;
            }
            const dependencyManifest = await pullPluginTar(dependency.name, dependency.version, dependency.link, dependency.hash);
            if (!dependencyManifest) {
                return null;
            }
            const stillExistsLocallly = await (0, filestructure_1.existsAsync)(pluginManifestPath);
            if (!stillExistsLocallly) {
                return null;
            }
        }
        return await pullPluginTar(installResponse.name, installResponse.version, installResponse.link, installResponse.hash);
    }
    return null;
};
exports.downloadPlugin = downloadPlugin;
const getPluginManifest = async (pluginName, pluginValue) => {
    if (pluginValue.startsWith("dev")) {
        return await (0, exports.readDevPluginManifest)(pluginName, pluginValue);
    }
    if (!pluginValue) {
        return null;
    }
    const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, pluginName, pluginValue, "floro", "floro.manifest.json");
    const existsLocallly = await (0, filestructure_1.existsAsync)(pluginManifestPath);
    if (existsLocallly) {
        const manifestString = await fs_1.default.promises.readFile(pluginManifestPath);
        return JSON.parse(manifestString.toString());
    }
    return await (0, exports.downloadPlugin)(pluginName, pluginValue);
};
exports.getPluginManifest = getPluginManifest;
const pluginManifestExists = async (pluginName, pluginVersion) => {
    const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, pluginName, pluginVersion, "floro", "floro.manifest.json");
    return await (0, filestructure_1.existsAsync)(pluginManifestPath);
};
/* REPOS */
const readRepos = async () => {
    const repoDir = await fs_1.default.promises.readdir(filestructure_1.vReposPath);
    return repoDir?.filter((repoName) => {
        return /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/.test(repoName);
    });
};
exports.readRepos = readRepos;
const repoExists = async (repoId) => {
    if (!repoId) {
        return false;
    }
    return await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
};
const readRepoSettings = async (repoId) => {
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
const readRenderedState = async (repoId) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const statePath = path_1.default.join(repoPath, `state.json`);
        const state = await fs_1.default.promises.readFile(statePath);
        return JSON.parse(state.toString());
    }
    catch (e) {
        return null;
    }
};
const saveRenderedState = async (repoId, state) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const statePath = path_1.default.join(repoPath, `state.json`);
        await fs_1.default.promises.writeFile(statePath, JSON.stringify(state), "utf-8");
        return state;
    }
    catch (e) {
        return null;
    }
};
const readCurrentRepoState = async (repoId) => {
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
const saveCurrentRepoState = async (repoId, state) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const currentPath = path_1.default.join(repoPath, `current.json`);
        await fs_1.default.promises.writeFile(currentPath, Buffer.from(JSON.stringify(state, null, 2)), "utf-8");
        return state;
    }
    catch (e) {
        return null;
    }
};
const readBranch = async (repoId, branchId) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const branchPath = path_1.default.join(repoPath, "branches", `${branchId}.json`);
        const branchData = await fs_1.default.promises.readFile(branchPath);
        const branch = JSON.parse(branchData.toString());
        return {
            ...branch,
            name: branchId,
        };
    }
    catch (e) {
        return null;
    }
};
const readBranches = async (repoId) => {
    const branchesPath = path_1.default.join(filestructure_1.vReposPath, repoId, "branches");
    const branchesDir = await fs_1.default.promises.readdir(branchesPath);
    const branches = await Promise.all(branchesDir
        ?.filter((branchId) => {
        return /.*\.json$/.test(branchId);
    })
        ?.map((branchFileName) => {
        const branchName = branchFileName.substring(0, branchFileName.length - 5);
        return readBranch(repoId, branchName);
    }));
    return branches.filter((branch) => branch != null);
};
const deleteBranch = async (repoId, branchId) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const branchPath = path_1.default.join(repoPath, "branches", `${branchId}.json`);
        await fs_1.default.promises.rm(branchPath);
        return true;
    }
    catch (e) {
        return false;
    }
};
const saveBranch = async (repoId, branchId, branchData) => {
    try {
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const branchPath = path_1.default.join(repoPath, "branches", `${branchId}.json`);
        await fs_1.default.promises.writeFile(branchPath, Buffer.from(JSON.stringify(branchData, null, 2)));
        return branchData;
    }
    catch (e) {
        return null;
    }
};
const getCommitDirPath = (repoId, commitSha) => {
    return path_1.default.join(filestructure_1.vReposPath, repoId, "commits", commitSha.substring(0, 2));
};
const saveCommit = async (repoId, sha, commitData) => {
    try {
        const commitDir = getCommitDirPath(repoId, sha);
        const commitDirExists = await (0, filestructure_1.existsAsync)(commitDir);
        if (!commitDirExists) {
            await fs_1.default.promises.mkdir(commitDir, 0o755);
        }
        const commitPath = path_1.default.join(commitDir, `${sha.substring(2)}.json`);
        await fs_1.default.promises.writeFile(commitPath, Buffer.from(JSON.stringify(commitData, null, 2)));
        return commitData;
    }
    catch (e) {
        return null;
    }
};
const readCommit = async (repoId, sha) => {
    try {
        if (!sha) {
            return null;
        }
        const commitDir = getCommitDirPath(repoId, sha);
        const commitPath = path_1.default.join(commitDir, `${sha.substring(2)}.json`);
        const commitDataString = await fs_1.default.promises.readFile(commitPath);
        return JSON.parse(commitDataString.toString());
    }
    catch (e) {
        return null;
    }
};
const readHotCheckpoint = async (repoId) => {
    try {
        const hotPath = path_1.default.join(filestructure_1.vReposPath, repoId, "hotcheckpoint.json");
        const hotPointExists = await (0, filestructure_1.existsAsync)(hotPath);
        if (!hotPointExists) {
            return null;
        }
        const hotpointString = await fs_1.default.promises.readFile(hotPath, "utf8");
        const hotpoint = JSON.parse(hotpointString);
        return hotpoint;
    }
    catch (e) {
        return null;
    }
};
const saveHotCheckpoint = async (repoId, sha, commitState) => {
    try {
        const hotPath = path_1.default.join(filestructure_1.vReposPath, repoId, "hotcheckpoint.json");
        await fs_1.default.promises.writeFile(hotPath, JSON.stringify([sha, commitState]), "utf8");
        return [sha, commitState];
    }
    catch (e) {
        return null;
    }
};
const deleteHotCheckpoint = async (repoId) => {
    try {
        const hotPath = path_1.default.join(filestructure_1.vReposPath, repoId, "hotcheckpoint.json");
        const hotPointExists = await (0, filestructure_1.existsAsync)(hotPath);
        if (!hotPointExists) {
            return false;
        }
        await fs_1.default.promises.rm(hotPath);
        return true;
    }
    catch (e) {
        return false;
    }
};
/**
 *
 * CHECKPOINTS
 */
const getCheckpointDirPath = (repoId, commitSha) => {
    return path_1.default.join(filestructure_1.vReposPath, repoId, "checkpoints", commitSha.substring(0, 2));
};
const readCheckpoint = async (repoId, sha) => {
    try {
        const checkpointDirPath = getCheckpointDirPath(repoId, sha);
        const checkpointPath = path_1.default.join(checkpointDirPath, sha + ".json");
        const checkpointExists = await (0, filestructure_1.existsAsync)(checkpointPath);
        if (!checkpointExists) {
            return null;
        }
        const checkpointString = await fs_1.default.promises.readFile(checkpointPath, "utf8");
        return JSON.parse(checkpointString);
    }
    catch (e) {
        return null;
    }
};
const saveCheckpoint = async (repoId, sha, commitState) => {
    try {
        const baseCheckpoint = path_1.default.join(filestructure_1.vReposPath, repoId, "checkpoints");
        const baseCheckpointDirExists = await (0, filestructure_1.existsAsync)(baseCheckpoint);
        if (!baseCheckpointDirExists) {
            await fs_1.default.promises.mkdir(baseCheckpoint);
        }
        const checkpointDirPath = getCheckpointDirPath(repoId, sha);
        const checkpointDirExists = await (0, filestructure_1.existsAsync)(checkpointDirPath);
        if (!checkpointDirExists) {
            await fs_1.default.promises.mkdir(checkpointDirPath);
        }
        const checkpointPath = path_1.default.join(checkpointDirPath, sha + ".json");
        const checkpointString = JSON.stringify(commitState);
        await fs_1.default.promises.writeFile(checkpointPath, checkpointString, "utf-8");
        return commitState;
    }
    catch (e) {
        return null;
    }
};
/**
 * STASH
 */
const readStash = async (repoId, sha) => {
    try {
        const stashDir = path_1.default.join(filestructure_1.vReposPath, repoId, "stash");
        const stashName = sha ? `${sha}.json` : `null_stash.json`;
        const stashPath = path_1.default.join(stashDir, stashName);
        const existsStash = await (0, filestructure_1.existsAsync)(stashPath);
        let stash = [];
        if (existsStash) {
            const rawStash = await fs_1.default.promises.readFile(stashPath, "utf8");
            stash = JSON.parse(rawStash);
        }
        return stash;
    }
    catch (e) {
        return null;
    }
};
const saveStash = async (repoId, sha, stashState) => {
    try {
        const stashDir = path_1.default.join(filestructure_1.vReposPath, repoId, "stash");
        const stashName = sha ? `${sha}.json` : `null_stash.json`;
        const stashPath = path_1.default.join(stashDir, stashName);
        await fs_1.default.promises.writeFile(stashPath, JSON.stringify(stashState));
        return stashState;
    }
    catch (e) {
        return null;
    }
};
const readBranchesMetaState = async (repoId) => {
    try {
        const branchesPath = path_1.default.join(filestructure_1.vReposPath, repoId, "branches.json");
        const branchesMetaStateString = await fs_1.default.promises.readFile(branchesPath, "utf8");
        const branchesMetaState = JSON.parse(branchesMetaStateString);
        return branchesMetaState;
    }
    catch (e) {
        return null;
    }
};
const saveBranchesMetaState = async (repoId, branchesMetaState) => {
    try {
        const branchesPath = path_1.default.join(filestructure_1.vReposPath, repoId, "branches.json");
        await fs_1.default.promises.writeFile(branchesPath, JSON.stringify(branchesMetaState), "utf8");
        return branchesMetaState;
    }
    catch (e) {
        return null;
    }
};
const checkBinary = async (binaryId) => {
    try {
        const binDir = path_1.default.join(filestructure_1.vBinariesPath, binaryId.substring(0, 2));
        const binPath = path_1.default.join(binDir, binaryId);
        return await (0, filestructure_1.existsAsync)(binaryId);
    }
    catch (e) {
        return null;
    }
};
const makeDataSource = (datasource = {}) => {
    const defaultDataSource = {
        readRepos: exports.readRepos,
        repoExists,
        getPluginManifest: exports.getPluginManifest,
        pluginManifestExists,
        readRepoSettings,
        readCurrentRepoState,
        saveCurrentRepoState,
        readBranch,
        readBranches,
        deleteBranch,
        saveBranch,
        saveCommit,
        readCommit,
        readCheckpoint,
        saveCheckpoint,
        readHotCheckpoint,
        deleteHotCheckpoint,
        saveHotCheckpoint,
        readRenderedState,
        saveRenderedState,
        readStash,
        saveStash,
        readBranchesMetaState,
        saveBranchesMetaState,
        checkBinary
    };
    return {
        ...defaultDataSource,
        ...datasource,
    };
};
exports.makeDataSource = makeDataSource;
const makeMemoizedDataSource = (dataSourceOverride = {}) => {
    const dataSource = (0, exports.makeDataSource)();
    const memoizedRepoExistence = new Set();
    const _repoExists = async (repoId) => {
        if (memoizedRepoExistence.has(repoId)) {
            return true;
        }
        const result = await dataSource.repoExists(repoId);
        if (result) {
            memoizedRepoExistence.add(repoId);
        }
        return result;
    };
    const memoizedPluginManifestExistence = new Set();
    const _pluginManifestExists = async (pluginName, pluginVersion) => {
        const pluginString = pluginName + "-" + pluginVersion;
        if (memoizedPluginManifestExistence.has(pluginName) &&
            !pluginVersion.startsWith("dev")) {
            return true;
        }
        const result = await dataSource.pluginManifestExists(pluginName, pluginVersion);
        if (result) {
            memoizedRepoExistence.add(pluginString);
        }
        return result;
    };
    const manifestMemo = {};
    const _getPluginManifest = async (pluginName, pluginVersion) => {
        const memoString = pluginName + "-" + pluginVersion;
        if (manifestMemo[memoString] && !pluginVersion.startsWith("dev")) {
            return manifestMemo[memoString];
        }
        const result = await dataSource.getPluginManifest(pluginName, pluginVersion);
        if (result) {
            manifestMemo[memoString] = result;
        }
        return result;
    };
    const memoizedSettings = {};
    const _readRepoSettings = async (repoId) => {
        if (memoizedSettings[repoId]) {
            return memoizedSettings[repoId];
        }
        const result = await dataSource.readRepoSettings(repoId);
        if (result) {
            memoizedSettings[repoId] = result;
        }
        return result;
    };
    const memoizedCurrentState = {};
    const _readCurrentRepoState = async (repoId) => {
        if (memoizedCurrentState[repoId]) {
            return memoizedCurrentState[repoId];
        }
        const result = await dataSource.readCurrentRepoState(repoId);
        if (result) {
            memoizedCurrentState[repoId] = result;
        }
        return result;
    };
    const _saveCurrentRepoState = async (repoId, state) => {
        const result = await dataSource.saveCurrentRepoState(repoId, state);
        if (result) {
            memoizedCurrentState[repoId] = result;
        }
        return result;
    };
    const branchMemo = {};
    const branchesMemo = {};
    const _readBranch = async (repoId, branchName) => {
        const branchMemoString = repoId + "-" + branchName;
        if (branchMemo[branchMemoString]) {
            return branchMemo[branchMemoString];
        }
        const result = await dataSource.readBranch(repoId, branchName);
        if (result) {
            branchMemo[branchMemoString] = result;
        }
        return result;
    };
    const _readBranches = async (repoId) => {
        if (branchesMemo[repoId]) {
            return branchesMemo[repoId];
        }
        const result = await dataSource.readBranches(repoId);
        if (result) {
            branchesMemo[repoId] = result;
        }
        return result;
    };
    const _saveBranch = async (repoId, branchName, branchData) => {
        const branchMemoString = repoId + "-" + branchName;
        const result = await dataSource.saveBranch(repoId, branchName, branchData);
        if (result) {
            branchMemo[branchMemoString] = result;
            delete branchesMemo[repoId];
        }
        return result;
    };
    const _deleteBranch = async (repoId, branchName) => {
        const result = await dataSource.deleteBranch(repoId, branchName);
        if (result) {
            delete branchMemo[repoId];
            delete branchesMemo[repoId];
        }
        return result;
    };
    const commitMemo = {};
    const _saveCommit = async (repoId, sha, commitData) => {
        const commitString = repoId + "-" + sha;
        const result = await dataSource.saveCommit(repoId, sha, commitData);
        if (result) {
            commitMemo[commitString] = result;
        }
        return result;
    };
    const _readCommit = async (repoId, sha) => {
        const commitString = repoId + "-" + sha;
        if (commitMemo[commitString]) {
            return commitMemo[commitString];
        }
        const result = await dataSource.readCommit(repoId, sha);
        if (result) {
            commitMemo[commitString] = result;
        }
        return result;
    };
    const checkpointMemo = {};
    const _readCheckpoint = async (repoId, sha) => {
        const checkpointString = repoId + "-" + sha;
        if (checkpointMemo[checkpointString]) {
            return checkpointMemo[checkpointString];
        }
        const result = await dataSource.readCheckpoint(repoId, sha);
        if (result) {
            checkpointMemo[checkpointString] = result;
        }
        return result;
    };
    const _saveCheckpoint = async (repoId, sha, commitState) => {
        const checkpointString = repoId + "-" + sha;
        const result = await dataSource.saveCheckpoint(repoId, sha, commitState);
        if (result) {
            checkpointMemo[checkpointString] = result;
        }
        return result;
    };
    const hotCheckpointMemo = {};
    const _readHotCheckpoint = async (repoId) => {
        if (hotCheckpointMemo[repoId]) {
            return hotCheckpointMemo[repoId];
        }
        const result = await dataSource.readHotCheckpoint(repoId);
        if (result) {
            hotCheckpointMemo[repoId] = result;
        }
        return result;
    };
    const _saveHotCheckpoint = async (repoId, sha, checkpoint) => {
        const result = await dataSource.saveHotCheckpoint(repoId, sha, checkpoint);
        if (result) {
            hotCheckpointMemo[repoId] = result;
        }
        return result;
    };
    const _deleteHotCheckpoint = async (repoId) => {
        const result = await dataSource.deleteHotCheckpoint(repoId);
        if (result) {
            delete hotCheckpointMemo[repoId];
        }
        return result;
    };
    const stateMemo = {};
    const _saveRenderedState = async (repoId, state) => {
        const result = await dataSource.saveRenderedState(repoId, state);
        if (result) {
            stateMemo[repoId] = result;
        }
        return result;
    };
    const _readRenderedState = async (repoId) => {
        if (stateMemo[repoId]) {
            return stateMemo[repoId];
        }
        const result = await dataSource.readRenderedState(repoId);
        return result;
    };
    const branchesMetaStateMemo = {};
    const _readBranchesMetaState = async (repoId) => {
        if (branchesMetaStateMemo[repoId]) {
            return branchesMetaStateMemo[repoId];
        }
        const result = await dataSource.readBranchesMetaState(repoId);
        branchesMetaStateMemo[repoId] = result;
        return result;
    };
    const _saveBranchesMetaState = async (repoId, branchesMetaState) => {
        const result = await dataSource.saveBranchesMetaState(repoId, branchesMetaState);
        branchesMetaStateMemo[repoId] = result;
        return result;
    };
    const seenBinaries = new Set();
    const _checkBinary = async (binaryId) => {
        if (seenBinaries.has(binaryId)) {
            return true;
        }
        const exists = await dataSource.checkBinary(binaryId);
        if (exists) {
            seenBinaries.add(binaryId);
        }
        return exists;
    };
    const defaultDataSource = {
        repoExists: _repoExists,
        pluginManifestExists: _pluginManifestExists,
        getPluginManifest: _getPluginManifest,
        readRepoSettings: _readRepoSettings,
        readCurrentRepoState: _readCurrentRepoState,
        saveCurrentRepoState: _saveCurrentRepoState,
        readBranch: _readBranch,
        readBranches: _readBranches,
        saveBranch: _saveBranch,
        deleteBranch: _deleteBranch,
        saveCommit: _saveCommit,
        readCommit: _readCommit,
        readCheckpoint: _readCheckpoint,
        saveCheckpoint: _saveCheckpoint,
        readHotCheckpoint: _readHotCheckpoint,
        saveHotCheckpoint: _saveHotCheckpoint,
        deleteHotCheckpoint: _deleteHotCheckpoint,
        readRenderedState: _readRenderedState,
        saveRenderedState: _saveRenderedState,
        readBranchesMetaState: _readBranchesMetaState,
        saveBranchesMetaState: _saveBranchesMetaState,
        checkBinary: _checkBinary
    };
    return {
        ...dataSource,
        ...defaultDataSource,
        ...dataSourceOverride,
    };
};
exports.makeMemoizedDataSource = makeMemoizedDataSource;
//# sourceMappingURL=datasource.js.map