"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeCommit = exports.updatePluginState = exports.updatePlugins = exports.checkoutSha = exports.checkoutBranch = exports.writeRepoCommit = exports.readBranchState = exports.readCommitState = exports.readCurrentState = exports.readCommitHistory = exports.readBranchHistory = exports.readCurrentHistory = exports.readRepoCommit = exports.readLastCommit = exports.readSettings = exports.deleteBranch = exports.switchRepoBranch = exports.getRepoBranches = exports.getCurrentRepoBranch = exports.readRepoDescription = exports.readRepoLicenses = exports.writeRepoLicenses = exports.writeRepoDescription = exports.repoExists = void 0;
const path_1 = __importDefault(require("path"));
const filestructure_1 = require("./filestructure");
const repo_1 = require("./repo");
const versioncontrol_1 = require("./versioncontrol");
const plugins_1 = require("./plugins");
const licensecodes_1 = require("./licensecodes");
const repoExists = async (repoId) => {
    if (!repoId) {
        return false;
    }
    return await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
};
exports.repoExists = repoExists;
const writeRepoDescription = async (repoId, description) => {
    if (!repoId) {
        return null;
    }
    if (!description) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId, repo_1.getCurrentState);
        const diff = (0, versioncontrol_1.getTextDiff)(unstagedState.description?.join(""), description);
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
            {
                diff,
                namespace: "description",
            },
        ], repo_1.getCurrentState);
        const nextState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, state.diff);
        return nextState;
    }
    catch (e) {
        return null;
    }
};
exports.writeRepoDescription = writeRepoDescription;
const writeRepoLicenses = async (repoId, licensesInput) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const licenses = (licensesInput ?? [])?.map((rawLicense) => {
            if (!licensecodes_1.LicenseCodes?.[rawLicense?.key]) {
                return null;
            }
            return {
                key: rawLicense.key,
                value: licensecodes_1.LicenseCodes[rawLicense.key],
            };
        });
        if (licenses.includes(null)) {
            return null;
        }
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId, repo_1.getCurrentState);
        const diff = (0, versioncontrol_1.getDiff)(unstagedState.licenses, licenses);
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
            {
                diff,
                namespace: "licenses",
            },
        ], repo_1.getCurrentState);
        const nextState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, state.diff);
        return nextState;
    }
    catch (e) {
        return null;
    }
};
exports.writeRepoLicenses = writeRepoLicenses;
const readRepoLicenses = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const state = await (0, repo_1.getRepoState)(repoId, repo_1.getCurrentState);
        return state.licenses;
    }
    catch (e) {
        return null;
    }
};
exports.readRepoLicenses = readRepoLicenses;
const readRepoDescription = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        return;
    }
    const state = await (0, repo_1.getRepoState)(repoId, repo_1.getCurrentState);
    return state.description;
};
exports.readRepoDescription = readRepoDescription;
const getCurrentRepoBranch = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branch = await (0, repo_1.getCurrentBranch)(repoId, repo_1.getCurrentState);
        return branch;
    }
    catch (e) {
        return null;
    }
};
exports.getCurrentRepoBranch = getCurrentRepoBranch;
const getRepoBranches = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branches = await (0, repo_1.getLocalBranches)(repoId);
        return branches;
    }
    catch (e) {
        return null;
    }
};
exports.getRepoBranches = getRepoBranches;
const switchRepoBranch = async (repoId, branchName) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentBranches = await (0, repo_1.getLocalBranches)(repoId);
        if (currentBranches
            .map((v) => v.name.toLowerCase())
            .includes(branchName.toLowerCase())) {
            return null;
        }
        const sha = await (0, repo_1.getCurrentCommitSha)(repoId, repo_1.getCurrentState);
        if (!sha) {
            return null;
        }
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user) {
            return null;
        }
        const branch = {
            firstCommit: sha,
            lastCommit: sha,
            createdBy: user.id,
            createdAt: new Date().toString(),
            name: branchName,
        };
        const branchData = await (0, repo_1.updateLocalBranch)(repoId, branchName, branch);
        if (!branchData) {
            return null;
        }
        return await (0, repo_1.updateCurrentWithNewBranch)(repoId, branchName, repo_1.getCurrentState);
    }
    catch (e) {
        return null;
    }
};
exports.switchRepoBranch = switchRepoBranch;
const deleteBranch = async (repoId, branchName) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentBranches = await (0, repo_1.getLocalBranches)(repoId);
        if (!currentBranches
            .map((v) => v.name.toLowerCase())
            .includes(branchName.toLowerCase())) {
            return null;
        }
        const current = await (0, repo_1.getCurrentState)(repoId);
        // ADD CAN DELETE
        if (current.branch &&
            current.branch.toLowerCase() == branchName.toLocaleLowerCase()) {
            await (0, repo_1.deleteLocalBranch)(repoId, branchName);
        }
        const branches = await (0, repo_1.getLocalBranches)(repoId);
        return branches;
    }
    catch (e) {
        return null;
    }
};
exports.deleteBranch = deleteBranch;
const readSettings = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const settings = await (0, repo_1.getRepoSettings)(repoId);
        if (!settings) {
            return null;
        }
        return settings;
    }
    catch (e) {
        return null;
    }
};
exports.readSettings = readSettings;
const readLastCommit = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const sha = await (0, repo_1.getCurrentCommitSha)(repoId, repo_1.getCurrentState);
        if (!sha) {
            return null;
        }
        const commit = await (0, repo_1.readCommit)(repoId, sha);
        if (!commit) {
            return null;
        }
        return commit;
    }
    catch (e) {
        return null;
    }
};
exports.readLastCommit = readLastCommit;
const readRepoCommit = async (repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (!sha) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const commit = await (0, repo_1.readCommit)(repoId, sha);
        if (!commit) {
            return null;
        }
        return commit;
    }
    catch (e) {
        return null;
    }
};
exports.readRepoCommit = readRepoCommit;
const readCurrentHistory = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const sha = await (0, repo_1.getCurrentCommitSha)(repoId, repo_1.getCurrentState);
        if (!sha) {
            return [];
        }
        const history = await (0, repo_1.getHistory)(repoId, sha);
        if (!history) {
            return null;
        }
        return history;
    }
    catch (e) {
        return null;
    }
};
exports.readCurrentHistory = readCurrentHistory;
const readBranchHistory = async (repoId, branchName) => {
    if (!repoId) {
        return null;
    }
    if (!branchName) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branch = await (0, repo_1.getLocalBranch)(repoId, branchName);
        if (!branch) {
            return null;
        }
        const history = await (0, repo_1.getHistory)(repoId, branch.lastCommit);
        if (!history) {
            return null;
        }
        return history;
    }
    catch (e) {
        return null;
    }
};
exports.readBranchHistory = readBranchHistory;
const readCommitHistory = async (repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (!sha) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const commit = await (0, repo_1.readCommit)(repoId, sha);
        if (!commit) {
            return null;
        }
        const history = await (0, repo_1.getHistory)(repoId, sha);
        if (!history) {
            return null;
        }
        return history;
    }
    catch (e) {
        return null;
    }
};
exports.readCommitHistory = readCommitHistory;
const readCurrentState = async (repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const state = await (0, repo_1.getRepoState)(repoId, repo_1.getCurrentState);
        return await (0, repo_1.renderCommitState)(state, plugins_1.readPluginManifest);
    }
    catch (e) {
        return null;
    }
};
exports.readCurrentState = readCurrentState;
const readCommitState = async (repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (!sha) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const state = await (0, repo_1.getCommitState)(repoId, sha);
        if (!state) {
            return null;
        }
        return await (0, repo_1.renderCommitState)(state, plugins_1.readPluginManifest);
    }
    catch (e) {
        return null;
    }
};
exports.readCommitState = readCommitState;
const readBranchState = async (repoId, branchName) => {
    if (!repoId) {
        return null;
    }
    if (!branchName) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branch = await (0, repo_1.getLocalBranch)(repoId, branchName);
        if (!branch) {
            return null;
        }
        const state = await (0, repo_1.getCommitState)(repoId, branch.lastCommit);
        if (!state) {
            return null;
        }
        return (0, repo_1.renderCommitState)(state, plugins_1.readPluginManifest);
    }
    catch (e) {
        return null;
    }
};
exports.readBranchState = readBranchState;
const writeRepoCommit = async (repoId, message) => {
    if (!repoId) {
        return null;
    }
    if (!message) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user.id) {
            return null;
        }
        const commitIsValid = await (0, repo_1.canCommit)(repoId, user, message, repo_1.getCurrentState);
        if (!commitIsValid) {
            return null;
        }
        const currentState = await (0, repo_1.getCurrentState)(repoId);
        const currentSha = await (0, repo_1.getCurrentCommitSha)(repoId, repo_1.getCurrentState);
        const parent = currentSha ? await (0, repo_1.readCommit)(repoId, currentSha) : null;
        const idx = parent ? parent.idx + 1 : 0;
        const timestamp = (new Date()).toString();
        const commitData = {
            parent: parent ? parent.sha : null,
            historicalParent: parent ? parent.sha : null,
            idx: idx,
            diff: currentState.diff,
            timestamp,
            userId: user.id,
            message
        };
        const sha = (0, versioncontrol_1.getDiffHash)(commitData);
        const commit = await (0, repo_1.writeCommit)(repoId, sha, { sha, ...commitData });
        if (!commit) {
            return null;
        }
        if (currentState.branch) {
            const branchState = await (0, repo_1.getLocalBranch)(repoId, currentState.branch);
            // be careful
            if (!branchState) {
                //TODO: FIX THIS
                return null;
            }
            await (0, repo_1.updateLocalBranch)(repoId, currentState.branch, {
                ...branchState,
                lastCommit: sha
            });
            await (0, repo_1.updateCurrentCommitSHA)(repoId, sha, false, repo_1.getCurrentState);
        }
        else {
            await (0, repo_1.updateCurrentCommitSHA)(repoId, sha, false, repo_1.getCurrentState);
        }
        return commit;
    }
    catch (e) {
        return null;
    }
};
exports.writeRepoCommit = writeRepoCommit;
const checkoutBranch = async (repoId, branchName) => {
    if (!repoId) {
        return null;
    }
    if (!branchName) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentBranches = await (0, repo_1.getLocalBranches)(repoId);
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user) {
            return null;
        }
        if (!currentBranches.map(v => v.name.toLowerCase()).includes(branchName.toLowerCase())) {
            return null;
        }
        const branchData = await (0, repo_1.getLocalBranch)(repoId, branchName);
        if (!branchData) {
            return null;
        }
        return await (0, repo_1.updateCurrentWithNewBranch)(repoId, branchName, repo_1.getCurrentState);
    }
    catch (e) {
        return null;
    }
};
exports.checkoutBranch = checkoutBranch;
const checkoutSha = async (repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (!sha) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const commit = await (0, repo_1.readCommit)(repoId, sha);
        if (!commit) {
            return null;
        }
        const current = await (0, repo_1.updateCurrentWithSHA)(repoId, sha, false, repo_1.getCurrentState);
        if (!current) {
            return null;
        }
        return current;
    }
    catch (e) {
        return null;
    }
};
exports.checkoutSha = checkoutSha;
const updatePlugins = async (repoId, plugins, pluginFetch) => {
    if (!repoId) {
        return null;
    }
    if (!plugins) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId, repo_1.getCurrentState);
        const addedPlugins = (0, repo_1.getAddedDeps)(unstagedState.plugins, plugins);
        const removedPlugins = (0, repo_1.getRemovedDeps)(unstagedState.plugins, plugins);
        const oldManifests = await (0, plugins_1.getPluginManifests)(unstagedState.plugins, pluginFetch);
        const newManifests = await (0, plugins_1.getPluginManifests)(plugins, pluginFetch);
        const oldManifestMap = (0, plugins_1.getManifestMapFromManifestList)(oldManifests);
        const newManifestMap = (0, plugins_1.getManifestMapFromManifestList)(newManifests);
        for (const removedManifest of removedPlugins) {
            const downstreamDeps = (0, plugins_1.getDownstreamDepsInSchemaMap)(oldManifestMap, removedManifest.key);
            for (const downstreamDep of downstreamDeps) {
                // checks the dep is truly deleted and not updated
                // ensure any downstream dependencies are no longer present
                // otherwise they have to be removed first in a separate request
                if (newManifestMap[downstreamDep] && !newManifestMap[removedManifest.key]) {
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
        const pluginsToAppend = [];
        for (const addedDep of addedPlugins) {
            const addedDepImportsList = (0, plugins_1.pluginMapToList)(newManifestMap[addedDep.key].imports);
            const addedDepImportManifests = await (0, plugins_1.getPluginManifests)(addedDepImportsList, pluginFetch);
            const addedDepImportsManifestMap = (0, plugins_1.getManifestMapFromManifestList)([
                newManifestMap[addedDep.key],
                ...addedDepImportManifests,
            ]);
            // need to construct deps from imports
            const upstreamDeps = (0, plugins_1.getUpstreamDepsInSchemaMap)(addedDepImportsManifestMap, addedDep.key);
            for (const upstreamDep of upstreamDeps) {
                const upstreamManifest = await pluginFetch(upstreamDep, addedDepImportsManifestMap[upstreamDep].version);
                if (newManifestMap[upstreamDep]) {
                    if (newManifestMap[upstreamDep].version != upstreamManifest.version) {
                        const areCompatible = await (0, plugins_1.pluginManifestsAreCompatibleForUpdate)(upstreamManifest, newManifestMap[upstreamDep], pluginFetch);
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
        const updatedPlugins = (0, repo_1.uniqueKV)([...plugins, ...pluginsToAppend]);
        const updatedManifests = await (0, plugins_1.getPluginManifests)(updatedPlugins, pluginFetch);
        const updatedManifestMap = (0, plugins_1.getManifestMapFromManifestList)(updatedManifests);
        for (let updatedPlugin of updatedManifests) {
            const upstreamDeps = (0, plugins_1.getUpstreamDepsInSchemaMap)(updatedManifestMap, updatedPlugin.name);
            for (const upstreamDep of upstreamDeps) {
                const upstreamManifest = await pluginFetch(upstreamDep, updatedPlugin.imports[upstreamDep]);
                if (upstreamManifest.version != updatedManifestMap[upstreamDep].version) {
                    // we need to know that the depended upon version is subset of the version
                    // being used by the app to ensure read safety
                    const areCompatible = await (0, plugins_1.pluginManifestsAreCompatibleForUpdate)(upstreamManifest, updatedManifestMap[upstreamDep], pluginFetch);
                    if (!areCompatible) {
                        return null;
                    }
                }
            }
        }
        const sortedUpdatedManifests = (0, plugins_1.topSortManifests)(updatedManifests);
        const sortedUpdatedPlugins = (0, plugins_1.manifestListToPluginList)(sortedUpdatedManifests);
        const pluginsDiff = (0, versioncontrol_1.getDiff)(unstagedState.plugins, sortedUpdatedPlugins);
        const pluginsToBeAddedToStore = (0, repo_1.getAddedDeps)(unstagedState.plugins, sortedUpdatedPlugins);
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
        const proposedState = await (0, repo_1.getProposedStateFromDiffListOnCurrent)(repoId, diffList, repo_1.getCurrentState);
        const proposedCommitState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, proposedState.diff);
        let stateStore = await (0, repo_1.buildStateStore)(proposedCommitState, pluginFetch);
        const rootDependencies = updatedManifests.filter(m => Object.keys(m.imports).length == 0);
        for (const rootManifest of rootDependencies) {
            const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(rootManifest, pluginFetch);
            stateStore = await (0, plugins_1.cascadePluginState)(schemaMap, stateStore, rootManifest.name, pluginFetch);
        }
        const kvState = await (0, repo_1.convertStateStoreToKV)(proposedCommitState, stateStore, pluginFetch);
        const lexicallyOrderedPlugins = updatedPlugins.sort((a, b) => {
            if (a.key == b.key)
                return 0;
            return a.key > b.key ? 1 : -1;
        });
        for (const { key } of lexicallyOrderedPlugins) {
            const diff = (0, versioncontrol_1.getDiff)(unstagedState.store?.[key] ?? [], kvState[key]);
            diffList.push({
                diff,
                namespace: "store",
                pluginName: key
            });
        }
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, diffList, repo_1.getCurrentState);
        const nextState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, state.diff);
        return await (0, repo_1.renderCommitState)(nextState, pluginFetch);
    }
    catch (e) {
        return null;
    }
};
exports.updatePlugins = updatePlugins;
const updatePluginState = async (repoId, pluginName, updatedState, pluginFetch) => {
    if (!repoId) {
        return null;
    }
    if (!pluginName) {
        return null;
    }
    if (!updatedState) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId, repo_1.getCurrentState);
        const current = await (0, repo_1.getRepoState)(repoId, repo_1.getCurrentState);
        if (current == null) {
            return null;
        }
        const pluginVersion = (current?.plugins ?? []).find((v) => v.key == pluginName)?.value;
        if (!pluginVersion) {
            return null;
        }
        const manifests = await (0, plugins_1.getPluginManifests)(current.plugins, pluginFetch);
        const manifest = manifests.find(p => p.name == pluginName);
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(manifest, pluginFetch);
        let stateStore = await (0, repo_1.buildStateStore)(current, pluginFetch);
        stateStore[pluginName] = updatedState;
        stateStore = await (0, plugins_1.cascadePluginState)(schemaMap, stateStore, pluginName, pluginFetch);
        const kvState = await (0, repo_1.convertStateStoreToKV)(current, stateStore, pluginFetch);
        const diffList = [];
        for (const pluginName in schemaMap) {
            const diff = (0, versioncontrol_1.getDiff)(unstagedState.store?.[pluginName] ?? [], kvState[pluginName]);
            diffList.push({
                diff,
                namespace: "store",
                pluginName
            });
        }
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, diffList, repo_1.getCurrentState);
        const nextState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, state.diff);
        return await (0, repo_1.renderCommitState)(nextState, pluginFetch);
    }
    catch (e) {
        return null;
    }
};
exports.updatePluginState = updatePluginState;
const mergeCommit = async (repoId, mergeSha, pluginFetch) => {
    if (!repoId) {
        return null;
    }
    if (!mergeSha) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    const user = await (0, filestructure_1.getUserAsync)();
    if (!user.id) {
        return null;
    }
    try {
        const current = await (0, repo_1.getCurrentState)(repoId);
        const commitStateResult = await (0, repo_1.getMergeCommitStates)(repoId, current.commit, mergeSha);
        if (!commitStateResult) {
            return null;
        }
        const { commit1, commit2, originCommit } = commitStateResult;
        const canAutoCommitMergeStates = await (0, repo_1.canAutoMergeCommitStates)(commit1, commit2, originCommit, pluginFetch);
        if (canAutoCommitMergeStates) {
            const canAutoMergeOnTopOfCurrentState = await (0, repo_1.canAutoMergeOnTopCurrentState)(repoId, mergeSha, pluginFetch);
            if (!(0, repo_1.diffIsEmpty)(current.diff) && canAutoMergeOnTopOfCurrentState) {
                const mergeState = await (0, repo_1.getMergedCommitState)(commit1, commit2, originCommit, pluginFetch);
                const repoState = await (0, repo_1.getRepoState)(repoId, repo_1.getCurrentState);
                const mergeCurrState = await (0, repo_1.getMergedCommitState)(mergeState, repoState, commit1, pluginFetch);
                const mergeDiffList = (0, repo_1.getCommitStateDiffList)(commit1, mergeState);
                const restoreCurrDiffList = (0, repo_1.getCommitStateDiffList)(mergeState, mergeCurrState);
                // need to add commit2 to list
                const mergeDiff = (0, repo_1.renderDiffList)(mergeDiffList);
                const originSha = await (0, repo_1.getDivergenceOriginSha)(repoId, current.commit, mergeSha);
                const origin = originSha ? await (0, repo_1.readCommit)(repoId, originSha) : null;
                if (!origin) {
                    //this is a full history rebase, (this is bad)
                    return;
                }
                if (originSha == mergeSha) {
                    //this is no-op, since no data merging is required
                    // just switch the head
                    return;
                }
                const history = await (0, repo_1.getHistory)(repoId, current.commit);
                const { sha: baseSha, idx: baseIdx } = (0, repo_1.getBaseDivergenceSha)(history, origin);
                const baseCommit = await (0, repo_1.getCommitState)(repoId, baseSha);
                const baseDiffList = (0, repo_1.getCommitStateDiffList)(commit2, baseCommit);
                const baseCommitData = await (0, repo_1.readCommit)(repoId, baseSha);
                const mergeCommitData = await (0, repo_1.readCommit)(repoId, mergeSha);
                const mergeBaseCommit = {
                    ...baseCommitData,
                    diff: (0, repo_1.renderDiffList)(baseDiffList),
                    idx: mergeCommitData.idx + 1,
                    historicalParent: originSha,
                    authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
                    userId: user.id,
                    parent: mergeSha
                };
                mergeBaseCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeBaseCommit);
                const rebaseList = [mergeBaseCommit];
                for (let idx = baseIdx + 1; idx < history.length; idx++) {
                    const commitToRebase = await (0, repo_1.readCommit)(repoId, history[history.length - idx - 1].sha);
                    commitToRebase.authorUserId = rebaseList[rebaseList.length - 1].authorUserId ?? rebaseList[rebaseList.length - 1].userId;
                    commitToRebase.userId = user.id;
                    commitToRebase.parent = rebaseList[rebaseList.length - 1].sha;
                    commitToRebase.historicalParent = rebaseList[rebaseList.length - 1].sha;
                    commitToRebase.idx = rebaseList[rebaseList.length - 1].idx + 1;
                    commitToRebase.sha = (0, versioncontrol_1.getDiffHash)(commitToRebase);
                    rebaseList.push(commitToRebase);
                }
                const mergeCommit = {
                    parent: rebaseList[rebaseList.length - 1].sha,
                    historicalParent: rebaseList[rebaseList.length - 1].sha,
                    idx: rebaseList[rebaseList.length - 1].idx,
                    message: `Merge [${mergeSha}] into [${current.commit}]`,
                    mergeBase: mergeBaseCommit.sha,
                    userId: user.id,
                    timestamp: (new Date()).toString(),
                    diff: mergeDiff
                };
                mergeCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeCommit);
                rebaseList.push(mergeCommit);
                for (let commitData of rebaseList) {
                    const result = await (0, repo_1.writeCommit)(repoId, commitData.sha, commitData);
                    if (!result) {
                        return null;
                    }
                }
                if (current.branch) {
                    const branchState = await (0, repo_1.getLocalBranch)(repoId, current.branch);
                    await (0, repo_1.updateLocalBranch)(repoId, current.branch, {
                        ...branchState,
                        lastCommit: mergeCommit.sha
                    });
                    await (0, repo_1.updateCurrentCommitSHA)(repoId, mergeCommit.sha, false, repo_1.getCurrentState);
                    const state = await (0, repo_1.saveDiffListToCurrent)(repoId, restoreCurrDiffList, repo_1.getCurrentState);
                    const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId, repo_1.getCurrentState);
                    const nextState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, state.diff);
                    return await (0, repo_1.renderCommitState)(nextState, pluginFetch);
                }
                // in this case just update the sha, not need to update the branch state
                await (0, repo_1.updateCurrentCommitSHA)(repoId, mergeCommit.sha, false, repo_1.getCurrentState);
                const state = await (0, repo_1.saveDiffListToCurrent)(repoId, restoreCurrDiffList, repo_1.getCurrentState);
                const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId, repo_1.getCurrentState);
                const nextState = await (0, repo_1.applyStateDiffToCommitState)(unstagedState, state.diff);
                return await (0, repo_1.renderCommitState)(nextState, pluginFetch);
            }
            return;
        }
        // since it cant auto merge update current to isMerge: true
    }
    catch (e) {
        console.log("E", e);
        return null;
    }
};
exports.mergeCommit = mergeCommit;
//# sourceMappingURL=repoapi.js.map