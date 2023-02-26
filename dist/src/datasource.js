"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMemoizedDataSource = exports.makeDataSource = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const filestructure_1 = require("./filestructure");
const repoExists = async (repoId) => {
    if (!repoId) {
        return false;
    }
    return await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
};
/* PLUGINS */
const getPluginManifest = async (pluginName, pluginVersion) => {
    const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, pluginName, pluginVersion, "floro", "floro.manifest.json");
    const manifestString = await fs_1.default.promises.readFile(pluginManifestPath);
    return JSON.parse(manifestString.toString());
};
const pluginManifestExists = async (pluginName, pluginVersion) => {
    const pluginManifestPath = path_1.default.join(filestructure_1.vPluginsPath, pluginName, pluginVersion, "floro", "floro.manifest.json");
    return await (0, filestructure_1.existsAsync)(pluginManifestPath);
};
/* REPOS */
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
const getBranch = async (repoId, branchName) => {
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
const getBranches = async (repoId) => {
    const branchesPath = path_1.default.join(filestructure_1.vReposPath, repoId, "branches");
    const branchesDir = await fs_1.default.promises.readdir(branchesPath);
    const branches = await Promise.all(branchesDir
        ?.filter((branchName) => {
        return /.*\.json$/.test(branchName);
    })
        ?.map((branchFileName) => {
        const branchName = branchFileName.substring(0, branchFileName.length - 5);
        return getBranch(repoId, branchName);
    }));
    return branches.filter((branch) => branch != null);
};
const deleteBranch = async (repoId, branchName) => {
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
const saveBranch = async (repoId, branchName, branchData) => {
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
const saveCurrentState = async (repoId, state) => {
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
        const commitDir = getCommitDirPath(repoId, sha);
        const commitPath = path_1.default.join(commitDir, `${sha.substring(2)}.json`);
        const commitDataString = await fs_1.default.promises.readFile(commitPath);
        return JSON.parse(commitDataString.toString());
    }
    catch (e) {
        return null;
    }
};
const makeDataSource = (datasource = {
    repoExists,
    getPluginManifest,
    pluginManifestExists,
    getRepoSettings,
    getCurrentState,
    saveCurrentState,
    getBranch,
    getBranches,
    deleteBranch,
    saveBranch,
    saveCommit,
    readCommit,
}) => {
    const defaultDataSource = {
        repoExists,
        getPluginManifest,
        pluginManifestExists,
        getRepoSettings,
        getCurrentState,
        saveCurrentState,
        getBranch,
        getBranches,
        deleteBranch,
        saveBranch,
        saveCommit,
        readCommit,
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
        if (memoizedPluginManifestExistence.has(pluginName)) {
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
        if (manifestMemo[memoString]) {
            return manifestMemo[memoString];
        }
        const result = await dataSource.getPluginManifest(pluginName, pluginVersion);
        if (result) {
            manifestMemo[memoString] = result;
        }
        return result;
    };
    const memoizedSettings = {};
    const _getRepoSettings = async (repoId) => {
        if (memoizedSettings[repoId]) {
            return memoizedSettings[repoId];
        }
        const result = await dataSource.getRepoSettings(repoId);
        if (result) {
            memoizedSettings[repoId] = result;
        }
        return result;
    };
    const memoizedCurrentState = {};
    const _getCurrentState = async (repoId) => {
        if (memoizedCurrentState[repoId]) {
            return memoizedCurrentState[repoId];
        }
        const result = await dataSource.getCurrentState(repoId);
        if (result) {
            memoizedCurrentState[repoId] = result;
        }
        return result;
    };
    const _saveCurrentState = async (repoId, state) => {
        const result = await dataSource.saveCurrentState(repoId, state);
        if (result) {
            memoizedCurrentState[repoId] = result;
        }
        console.log("MCS", memoizedCurrentState);
        return result;
    };
    const branchMemo = {};
    const branchesMemo = {};
    const _getBranch = async (repoId, branchName) => {
        const branchMemoString = repoId + "-" + branchName;
        if (branchMemo[branchMemoString]) {
            return branchMemo[branchMemoString];
        }
        const result = await dataSource.getBranch(repoId, branchName);
        if (result) {
            branchMemo[branchMemoString] = result;
        }
        return result;
    };
    const _getBranches = async (repoId) => {
        if (branchesMemo[repoId]) {
            return branchesMemo[repoId];
        }
        const result = await dataSource.getBranches(repoId);
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
    const defaultDataSource = {
        repoExists: _repoExists,
        pluginManifestExists: _pluginManifestExists,
        getPluginManifest: _getPluginManifest,
        getRepoSettings: _getRepoSettings,
        getCurrentState: _getCurrentState,
        saveCurrentState: _saveCurrentState,
        getBranch: _getBranch,
        getBranches: _getBranches,
        saveBranch: _saveBranch,
        deleteBranch: _deleteBranch,
        saveCommit: _saveCommit,
        readCommit: _readCommit,
    };
    return {
        ...dataSource,
        ...defaultDataSource,
        ...dataSourceOverride,
    };
};
exports.makeMemoizedDataSource = makeMemoizedDataSource;
exports.default = (0, exports.makeDataSource)();
//# sourceMappingURL=datasource.js.map