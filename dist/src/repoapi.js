"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyStashedChange = exports.popStashedChanges = exports.canPopStashedChanges = exports.getStashSize = exports.stashChanges = exports.canStash = exports.rollbackCommit = exports.canCherryPickRevision = exports.cherryPickRevision = exports.autofixReversion = exports.canAutofxReversion = exports.revertCommit = exports.hasMergeConflictDiff = exports.getMergeConflictDiff = exports.resolveMerge = exports.abortMerge = exports.updateMergeDirection = exports.mergeCommit = exports.updatePluginState = exports.updatePlugins = exports.checkoutSha = exports.writeRepoCommit = exports.readBranchState = exports.readCommitState = exports.readCurrentState = exports.readCommitHistory = exports.readBranchHistory = exports.readCurrentHistory = exports.readRepoCommit = exports.readLastCommit = exports.readSettings = exports.deleteUserBranch = exports.switchRepoBranch = exports.createRepoBranch = exports.getRepoBranches = exports.getCurrentRepoBranch = exports.readRepoDescription = exports.readRepoLicenses = exports.writeRepoLicenses = exports.writeRepoDescription = void 0;
const path_1 = __importDefault(require("path"));
const filestructure_1 = require("./filestructure");
const repo_1 = require("./repo");
const versioncontrol_1 = require("./versioncontrol");
const plugins_1 = require("./plugins");
const licensecodes_1 = require("./licensecodes");
const writeRepoDescription = async (datasource, repoId, description) => {
    if (!repoId) {
        return null;
    }
    if (!description) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const renderedState = await datasource.readRenderedState(repoId);
        renderedState.description = (0, versioncontrol_1.splitTextForDiff)(description);
        await datasource.saveRenderedState(repoId, renderedState);
        return renderedState;
    }
    catch (e) {
        return null;
    }
};
exports.writeRepoDescription = writeRepoDescription;
const writeRepoLicenses = async (datasource, repoId, licensesInput) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
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
        const renderedState = await datasource.readRenderedState(repoId);
        renderedState.licenses = licenses;
        await datasource.saveRenderedState(repoId, renderedState);
        return renderedState;
    }
    catch (e) {
        return null;
    }
};
exports.writeRepoLicenses = writeRepoLicenses;
const readRepoLicenses = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const renderedState = await datasource.readRenderedState(repoId);
        return renderedState.licenses;
    }
    catch (e) {
        return null;
    }
};
exports.readRepoLicenses = readRepoLicenses;
const readRepoDescription = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        return;
    }
    const renderedState = await datasource.readRenderedState(repoId);
    return renderedState.description;
};
exports.readRepoDescription = readRepoDescription;
const getCurrentRepoBranch = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branch = await (0, repo_1.getCurrentBranch)(datasource, repoId);
        return branch;
    }
    catch (e) {
        return null;
    }
};
exports.getCurrentRepoBranch = getCurrentRepoBranch;
const getRepoBranches = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branches = await datasource.readBranches(repoId);
        return branches;
    }
    catch (e) {
        return null;
    }
};
exports.getRepoBranches = getRepoBranches;
// add create branch
const createRepoBranch = async (datasource, repoId, branchName, baseBranchId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const sha = await (0, repo_1.getCurrentCommitSha)(datasource, repoId);
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user) {
            return null;
        }
        if (!repo_1.BRANCH_NAME_REGEX.test(branchName)) {
            return null;
        }
        const branchId = (0, repo_1.getBranchIdFromName)(branchName);
        const basedOffOf = baseBranchId ?? currentRepoState?.branch;
        const branch = {
            id: branchId,
            lastCommit: sha,
            createdBy: user.id,
            createdAt: new Date().toString(),
            name: branchName,
            baseBranchId: basedOffOf,
        };
        const currentBranches = await datasource.readBranches(repoId);
        const branchAlreadyExists = currentBranches
            .map((v) => v.id)
            .includes(branchId);
        if (branchAlreadyExists) {
            return null;
        }
        const branchData = await datasource.saveBranch(repoId, branchName, branch);
        const branchMetaState = await datasource.readBranchesMetaState(repoId);
        branchMetaState.allBranches.push({
            branchId: branchData.id,
            lastLocalCommit: sha,
            lastRemoteCommit: null,
        });
        branchMetaState.userBranches.push({
            branchId: branchData.id,
            lastLocalCommit: sha,
            lastRemoteCommit: null,
        });
        await datasource.saveBranchesMetaState(repoId, branchMetaState);
        return await (0, repo_1.updateCurrentWithNewBranch)(datasource, repoId, branchId);
    }
    catch (e) {
        return null;
    }
};
exports.createRepoBranch = createRepoBranch;
const switchRepoBranch = async (datasource, repoId, branchId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentBranches = await datasource.readBranches(repoId);
        if (!currentBranches.map((v) => v.id).includes(branchId)) {
            return null;
        }
        const branchMetaState = await datasource.readBranchesMetaState(repoId);
        const branchMeta = branchMetaState.allBranches.find((bm) => bm.branchId == branchId);
        const userBranchMeta = branchMetaState.allBranches.find((bm) => bm.branchId == branchId);
        if (branchMeta && !userBranchMeta) {
            branchMetaState.userBranches.push(branchMeta);
        }
        await datasource.saveBranchesMetaState(repoId, branchMetaState);
        return await (0, repo_1.updateCurrentBranch)(datasource, repoId, branchId);
    }
    catch (e) {
        return null;
    }
};
exports.switchRepoBranch = switchRepoBranch;
const deleteUserBranch = async (datasource, repoId, branchId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (currentRepoState.branch == branchId) {
            return null;
        }
        const currentBranches = await datasource.readBranches(repoId);
        if (!currentBranches.map((v) => v.id).includes(branchId)) {
            return null;
        }
        const branchMetaState = await datasource.readBranchesMetaState(repoId);
        const branchMeta = branchMetaState.allBranches.find((bm) => bm.branchId == branchId);
        branchMetaState.userBranches = branchMetaState.userBranches.filter((bm) => bm.branchId != branchId);
        if (branchMeta.lastRemoteCommit) {
            branchMetaState.allBranches = branchMetaState.allBranches.filter((bm) => bm.branchId != branchId);
        }
        await datasource.saveBranchesMetaState(repoId, branchMetaState);
        return await datasource.readRenderedState(repoId);
    }
    catch (e) {
        return null;
    }
};
exports.deleteUserBranch = deleteUserBranch;
const readSettings = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const settings = await datasource.readRepoSettings(repoId);
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
const readLastCommit = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const sha = await (0, repo_1.getCurrentCommitSha)(datasource, repoId);
        if (!sha) {
            return null;
        }
        const commit = await datasource.readCommit(repoId, sha);
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
const readRepoCommit = async (datasource, repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (sha === undefined) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const commit = await datasource.readCommit(repoId, sha);
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
const readCurrentHistory = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const sha = await (0, repo_1.getCurrentCommitSha)(datasource, repoId);
        if (!sha) {
            return [];
        }
        const history = await (0, repo_1.getHistory)(datasource, repoId, sha);
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
const readBranchHistory = async (datasource, repoId, branchId) => {
    if (!repoId) {
        return null;
    }
    if (!branchId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branch = await datasource.readBranch(repoId, branchId);
        if (!branch) {
            return null;
        }
        const history = await (0, repo_1.getHistory)(datasource, repoId, branch.lastCommit);
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
const readCommitHistory = async (datasource, repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (sha === undefined) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const commit = await datasource.readCommit(repoId, sha);
        if (!commit) {
            return null;
        }
        const history = await (0, repo_1.getHistory)(datasource, repoId, sha);
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
const readCurrentState = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const state = await (0, repo_1.getApplicationState)(datasource, repoId);
        return state;
    }
    catch (e) {
        return null;
    }
};
exports.readCurrentState = readCurrentState;
const readCommitState = async (datasource, repoId, sha) => {
    if (!repoId) {
        return null;
    }
    if (!sha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const state = await (0, repo_1.getCommitState)(datasource, repoId, sha);
        if (!state) {
            return null;
        }
        return (0, repo_1.convertCommitStateToRenderedState)(datasource, state);
    }
    catch (e) {
        return null;
    }
};
exports.readCommitState = readCommitState;
const readBranchState = async (datasource, repoId, branchId) => {
    if (!repoId) {
        return null;
    }
    if (!branchId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const branch = await datasource.readBranch(repoId, branchId);
        if (!branch) {
            return null;
        }
        const state = await (0, repo_1.getCommitState)(datasource, repoId, branch.lastCommit);
        if (!state) {
            return null;
        }
        return state;
    }
    catch (e) {
        return null;
    }
};
exports.readBranchState = readBranchState;
const writeRepoCommit = async (datasource, repoId, message) => {
    if (!repoId) {
        return null;
    }
    if (!message) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user.id) {
            return null;
        }
        const currentRenderedState = await datasource.readRenderedState(repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentRenderedState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const diff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        const commitIsValid = await (0, repo_1.canCommit)(datasource, repoId, user, message, diff);
        if (!commitIsValid) {
            return null;
        }
        const currentState = await datasource.readCurrentRepoState(repoId);
        const currentSha = await (0, repo_1.getCurrentCommitSha)(datasource, repoId);
        const parent = currentSha
            ? await datasource.readCommit(repoId, currentSha)
            : null;
        const idx = parent ? parent.idx + 1 : 0;
        const timestamp = new Date().toString();
        const commitData = {
            parent: parent ? parent.sha : null,
            historicalParent: parent ? parent.sha : null,
            idx: idx,
            diff,
            timestamp,
            userId: user.id,
            message,
        };
        const sha = (0, versioncontrol_1.getDiffHash)(commitData);
        const commit = await datasource.saveCommit(repoId, sha, {
            sha,
            ...commitData,
        });
        if (!commit) {
            return null;
        }
        if (currentState.branch) {
            const branchState = await datasource.readBranch(repoId, currentState.branch);
            await datasource.saveBranch(repoId, currentState.branch, {
                ...branchState,
                lastCommit: sha,
            });
            const branchMetaState = await datasource.readBranchesMetaState(repoId);
            branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = sha;
                }
                return branch;
            });
            branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = sha;
                }
                return branch;
            });
            await datasource.saveBranchesMetaState(repoId, branchMetaState);
            await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, sha, false);
        }
        else {
            await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, sha, false);
        }
        await datasource.saveHotCheckpoint(repoId, sha, currentKVState);
        return commit;
    }
    catch (e) {
        return null;
    }
};
exports.writeRepoCommit = writeRepoCommit;
const checkoutSha = async (datasource, repoId, sha) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        if (sha) {
            const commit = await datasource.readCommit(repoId, sha);
            if (!commit) {
                return null;
            }
        }
        const current = await (0, repo_1.updateCurrentWithSHA)(datasource, repoId, sha, false);
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
const updatePlugins = async (datasource, repoId, plugins) => {
    if (!repoId) {
        return null;
    }
    if (!plugins) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const addedPlugins = (0, repo_1.getAddedDeps)(unstagedState.plugins, plugins);
        const removedPlugins = (0, repo_1.getRemovedDeps)(unstagedState.plugins, plugins);
        const oldManifests = await (0, plugins_1.getPluginManifests)(datasource, unstagedState.plugins);
        const newManifests = await (0, plugins_1.getPluginManifests)(datasource, plugins);
        const oldManifestMap = (0, plugins_1.getManifestMapFromManifestList)(oldManifests);
        const newManifestMap = (0, plugins_1.getManifestMapFromManifestList)(newManifests);
        for (const removedManifest of removedPlugins) {
            const downstreamDeps = (0, plugins_1.getDownstreamDepsInSchemaMap)(oldManifestMap, removedManifest.key);
            for (const downstreamDep of downstreamDeps) {
                // checks the dep is truly deleted and not updated
                // ensure any downstream dependencies are no longer present
                // otherwise they have to be removed first in a separate request
                if (newManifestMap[downstreamDep] &&
                    !newManifestMap[removedManifest.key]) {
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
            const addedDepImportManifests = await (0, plugins_1.getPluginManifests)(datasource, addedDepImportsList);
            const addedDepImportsManifestMap = (0, plugins_1.getManifestMapFromManifestList)([
                newManifestMap[addedDep.key],
                ...addedDepImportManifests,
            ]);
            // need to construct deps from imports
            const upstreamDeps = (0, plugins_1.getUpstreamDepsInSchemaMap)(addedDepImportsManifestMap, addedDep.key);
            for (const upstreamDep of upstreamDeps) {
                const upstreamManifest = await datasource.getPluginManifest(upstreamDep, addedDepImportsManifestMap[upstreamDep].version);
                if (newManifestMap[upstreamDep]) {
                    if (newManifestMap[upstreamDep].version != upstreamManifest.version) {
                        const areCompatible = await (0, plugins_1.pluginManifestsAreCompatibleForUpdate)(datasource, upstreamManifest, newManifestMap[upstreamDep]);
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
        const updatedManifests = await (0, plugins_1.getPluginManifests)(datasource, updatedPlugins);
        const updatedManifestMap = (0, plugins_1.getManifestMapFromManifestList)(updatedManifests);
        for (let updatedPlugin of updatedManifests) {
            const upstreamDeps = (0, plugins_1.getUpstreamDepsInSchemaMap)(updatedManifestMap, updatedPlugin.name);
            for (const upstreamDep of upstreamDeps) {
                const upstreamManifest = await datasource.getPluginManifest(upstreamDep, updatedPlugin.imports[upstreamDep]);
                if (upstreamManifest.version != updatedManifestMap[upstreamDep].version) {
                    // we need to know that the depended upon version is subset of the version
                    // being used by the app to ensure read safety
                    const areCompatible = await (0, plugins_1.pluginManifestsAreCompatibleForUpdate)(datasource, upstreamManifest, updatedManifestMap[upstreamDep]);
                    if (!areCompatible) {
                        return null;
                    }
                }
            }
        }
        const sortedUpdatedManifests = (0, plugins_1.topSortManifests)(updatedManifests);
        const sortedUpdatedPlugins = (0, plugins_1.manifestListToPluginList)(sortedUpdatedManifests);
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
        const rootDependencies = updatedManifests.filter((m) => Object.keys(m.imports).length == 0);
        const currentRenderedState = await datasource.readRenderedState(repoId);
        const lexicallyOrderedPlugins = updatedPlugins.sort((a, b) => {
            if (a.key == b.key)
                return 0;
            return a.key > b.key ? 1 : -1;
        });
        let store = currentRenderedState.store;
        for (let { key } of lexicallyOrderedPlugins) {
            if (!store[key]) {
                store[key] = {};
            }
        }
        for (const rootManifest of rootDependencies) {
            const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(datasource, rootManifest);
            store = await (0, plugins_1.cascadePluginState)(datasource, schemaMap, store);
        }
        currentRenderedState.store = store;
        currentRenderedState.plugins = sortedUpdatedPlugins;
        await datasource.saveRenderedState(repoId, currentRenderedState);
        return currentRenderedState;
    }
    catch (e) {
        return null;
    }
};
exports.updatePlugins = updatePlugins;
const updatePluginState = async (datasource, repoId, pluginName, updatedState) => {
    if (!repoId) {
        return null;
    }
    if (!pluginName) {
        return null;
    }
    if (!updatedState) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const current = await (0, repo_1.getApplicationState)(datasource, repoId);
        if (current == null) {
            return null;
        }
        const pluginVersion = (current?.plugins ?? []).find((v) => v.key == pluginName)?.value;
        if (!pluginVersion) {
            return null;
        }
        const manifests = await (0, plugins_1.getPluginManifests)(datasource, current.plugins);
        const manifest = manifests.find((p) => p.name == pluginName);
        const schemaMap = await (0, plugins_1.getSchemaMapForManifest)(datasource, manifest);
        const renderedState = await datasource.readRenderedState(repoId);
        const stateStore = renderedState.store;
        stateStore[pluginName] = updatedState;
        renderedState.store = await (0, plugins_1.cascadePluginState)(datasource, schemaMap, stateStore);
        await datasource.saveRenderedState(repoId, renderedState);
        return renderedState;
    }
    catch (e) {
        return null;
    }
};
exports.updatePluginState = updatePluginState;
const mergeCommit = async (datasource, repoId, fromSha) => {
    if (!repoId) {
        return null;
    }
    if (!fromSha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    const user = await (0, filestructure_1.getUserAsync)();
    if (!user.id) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (currentRepoState.isInMergeConflict) {
            return null;
        }
        const commitStateResult = await (0, repo_1.getMergeCommitStates)(datasource, repoId, fromSha, currentRepoState.commit);
        if (!commitStateResult) {
            return null;
        }
        const { fromCommitState, intoCommitState, originCommit } = commitStateResult;
        const canAutoCommitMergeStates = await (0, repo_1.canAutoMergeCommitStates)(datasource, fromCommitState, intoCommitState, originCommit);
        if (canAutoCommitMergeStates) {
            const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
            const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
            const canAutoMergeOnTopOfCurrentState = await (0, repo_1.canAutoMergeOnTopCurrentState)(datasource, repoId, fromSha);
            const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
            const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
            const originSha = await (0, repo_1.getDivergenceOriginSha)(datasource, repoId, fromSha, currentRepoState.commit);
            const history = await (0, repo_1.getHistory)(datasource, repoId, currentRepoState.commit);
            const mergeState = await (0, repo_1.getMergedCommitState)(datasource, fromCommitState, intoCommitState, originCommit);
            if (originSha == currentRepoState.commit) {
                const currentCommit = await datasource.readCommit(repoId, currentRepoState.commit);
                const fromCommit = await datasource.readCommit(repoId, fromSha);
                // NEED TO ADD BASE SHA HERE FOR ROLLBACK
                const mergeCommit = {
                    parent: fromSha,
                    historicalParent: fromSha,
                    idx: fromCommit.idx + 1,
                    message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
                    mergeBase: currentCommit.sha,
                    userId: user.id,
                    timestamp: new Date().toString(),
                    diff: repo_1.EMPTY_COMMIT_DIFF,
                };
                mergeCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeCommit);
                await datasource.saveCommit(repoId, mergeCommit.sha, mergeCommit);
                if (currentRepoState.branch) {
                    const branchState = await datasource.readBranch(repoId, currentRepoState.branch);
                    const o = await datasource.saveBranch(repoId, currentRepoState.branch, {
                        ...branchState,
                        lastCommit: mergeCommit.sha,
                    });
                    const branchMetaState = await datasource.readBranchesMetaState(repoId);
                    branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                        if (branch.branchId == branchState.id) {
                            branch.lastLocalCommit = mergeCommit.sha;
                        }
                        return branch;
                    });
                    branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                        if (branch.branchId == branchState.id) {
                            branch.lastLocalCommit = mergeCommit.sha;
                        }
                        return branch;
                    });
                    await datasource.saveBranchesMetaState(repoId, branchMetaState);
                    await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, mergeCommit.sha, false);
                }
                else {
                    await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, mergeCommit.sha, false);
                }
                if (!(0, repo_1.diffIsEmpty)(currentDiff) && canAutoMergeOnTopOfCurrentState) {
                    const mergeCurrState = await (0, repo_1.getMergedCommitState)(datasource, mergeState, currentKVState, intoCommitState);
                    const currentAfterRestorationRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mergeCurrState);
                    const state = await datasource.saveRenderedState(repoId, currentAfterRestorationRendered);
                    return state;
                }
                else {
                    const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mergeState);
                    const state = await datasource.saveRenderedState(repoId, renderedState);
                    return state;
                }
            }
            const origin = originSha
                ? await datasource.readCommit(repoId, originSha)
                : null;
            const { sha: baseSha, idx: baseIdx } = !origin
                ? history[history.length - 1]
                : (0, repo_1.getBaseDivergenceSha)(history, origin);
            const mergeDiff = (0, repo_1.getStateDiffFromCommitStates)(fromCommitState, mergeState);
            const baseCommit = await (0, repo_1.getCommitState)(datasource, repoId, baseSha);
            const baseDiff = (0, repo_1.getStateDiffFromCommitStates)(intoCommitState, baseCommit);
            const baseCommitData = await datasource.readCommit(repoId, baseSha);
            const mergeCommitData = await datasource.readCommit(repoId, fromSha);
            const mergeBaseCommit = {
                ...baseCommitData,
                diff: baseDiff,
                idx: mergeCommitData.idx + 1,
                historicalParent: originSha,
                authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
                userId: user.id,
                parent: fromSha,
            };
            mergeBaseCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeBaseCommit);
            const rebaseList = [mergeBaseCommit];
            for (let idx = baseIdx + 1; idx < history.length; idx++) {
                const commitToRebase = await datasource.readCommit(repoId, history[history.length - idx - 1].sha);
                commitToRebase.authorUserId =
                    rebaseList[rebaseList.length - 1].authorUserId ??
                        rebaseList[rebaseList.length - 1].userId;
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
                message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
                mergeBase: mergeBaseCommit.sha,
                userId: user.id,
                timestamp: new Date().toString(),
                diff: mergeDiff,
            };
            mergeCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeCommit);
            rebaseList.push(mergeCommit);
            for (let commitData of rebaseList) {
                const result = await datasource.saveCommit(repoId, commitData.sha, commitData);
                if (!result) {
                    return null;
                }
            }
            if (currentRepoState.branch) {
                const branchState = await datasource.readBranch(repoId, currentRepoState.branch);
                await datasource.saveBranch(repoId, currentRepoState.branch, {
                    ...branchState,
                    lastCommit: mergeCommit.sha,
                });
                const branchMetaState = await datasource.readBranchesMetaState(repoId);
                branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                    if (branch.branchId == branchState.id) {
                        branch.lastLocalCommit = mergeCommit.sha;
                    }
                    return branch;
                });
                branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                    if (branch.branchId == branchState.id) {
                        branch.lastLocalCommit = mergeCommit.sha;
                    }
                    return branch;
                });
                await datasource.saveBranchesMetaState(repoId, branchMetaState);
            }
            await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, mergeCommit.sha, false);
            if (!(0, repo_1.diffIsEmpty)(currentDiff) && canAutoMergeOnTopOfCurrentState) {
                const mergeCurrState = await (0, repo_1.getMergedCommitState)(datasource, mergeState, currentKVState, intoCommitState);
                const currentAfterRestorationRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mergeCurrState);
                const state = await datasource.saveRenderedState(repoId, currentAfterRestorationRendered);
                return state;
            }
            else {
                const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mergeState);
                const state = await datasource.saveRenderedState(repoId, renderedState);
                return state;
            }
        }
        else {
            // CANT AUTO MERGE
            const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
            const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
            const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
            const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
            if (!(0, repo_1.diffIsEmpty)(currentDiff)) {
                return null;
            }
            const originSha = await (0, repo_1.getDivergenceOriginSha)(datasource, repoId, currentRepoState.commit, fromSha);
            const direction = "yours";
            const mergeState = await (0, repo_1.getMergedCommitState)(datasource, fromCommitState, intoCommitState, originCommit, direction);
            const updated = {
                ...currentRepoState,
                isInMergeConflict: true,
                merge: {
                    originSha,
                    fromSha,
                    intoSha: currentRepoState.commit,
                    direction,
                },
            };
            await datasource.saveCurrentRepoState(repoId, updated);
            const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mergeState);
            await datasource.saveRenderedState(repoId, renderedState);
            return renderedState;
        }
    }
    catch (e) {
        return null;
    }
};
exports.mergeCommit = mergeCommit;
const updateMergeDirection = async (datasource, repoId, direction) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (!currentRepoState.isInMergeConflict) {
            return null;
        }
        const fromCommitState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.merge.fromSha);
        const intoCommitState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.merge.intoSha);
        const originCommitState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.merge.originSha);
        const mergeState = await (0, repo_1.getMergedCommitState)(datasource, fromCommitState, intoCommitState, originCommitState, direction);
        const updated = {
            ...currentRepoState,
            isInMergeConflict: true,
            merge: {
                ...currentRepoState.merge,
                direction,
            },
        };
        await datasource.saveCurrentRepoState(repoId, updated);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mergeState);
        await datasource.saveRenderedState(repoId, renderedState);
        return renderedState;
    }
    catch (e) {
        return null;
    }
};
exports.updateMergeDirection = updateMergeDirection;
const abortMerge = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (!currentRepoState.isInMergeConflict) {
            return null;
        }
        const updated = {
            ...currentRepoState,
            isInMergeConflict: false,
            merge: null,
        };
        await datasource.saveCurrentRepoState(repoId, updated);
        const appState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.commit);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, appState);
        await datasource.saveRenderedState(repoId, renderedState);
        return renderedState;
    }
    catch (e) {
        return null;
    }
};
exports.abortMerge = abortMerge;
const resolveMerge = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user.id) {
            return null;
        }
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (!currentRepoState.isInMergeConflict) {
            return null;
        }
        const originSha = currentRepoState.merge.originSha;
        const intoSha = currentRepoState.merge.intoSha;
        const fromSha = currentRepoState.merge.fromSha;
        const intoCommitState = await (0, repo_1.getCommitState)(datasource, repoId, intoSha);
        const history = await (0, repo_1.getHistory)(datasource, repoId, currentRepoState.commit);
        const origin = originSha
            ? await datasource.readCommit(repoId, originSha)
            : null;
        const { sha: baseSha, idx: baseIdx } = !origin
            ? history[history.length - 1]
            : (0, repo_1.getBaseDivergenceSha)(history, origin);
        const baseCommit = await (0, repo_1.getCommitState)(datasource, repoId, baseSha);
        // m2
        const baseDiff = (0, repo_1.getStateDiffFromCommitStates)(intoCommitState, baseCommit);
        const baseCommitData = await datasource.readCommit(repoId, baseSha);
        const mergeCommitData = await datasource.readCommit(repoId, fromSha);
        const mergeBaseCommit = {
            ...baseCommitData,
            diff: baseDiff,
            idx: mergeCommitData.idx + 1,
            historicalParent: originSha,
            authorUserId: baseCommitData.authorUserId ?? baseCommitData.userId,
            userId: user.id,
            parent: fromSha,
        };
        mergeBaseCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeBaseCommit);
        const rebaseList = [mergeBaseCommit];
        for (let idx = baseIdx + 1; idx < history.length; idx++) {
            const commitToRebase = await datasource.readCommit(repoId, history[history.length - idx - 1].sha);
            commitToRebase.authorUserId =
                rebaseList[rebaseList.length - 1].authorUserId ??
                    rebaseList[rebaseList.length - 1].userId;
            commitToRebase.userId = user.id;
            commitToRebase.parent = rebaseList[rebaseList.length - 1].sha;
            commitToRebase.historicalParent = rebaseList[rebaseList.length - 1].sha;
            commitToRebase.idx = rebaseList[rebaseList.length - 1].idx + 1;
            commitToRebase.sha = (0, versioncontrol_1.getDiffHash)(commitToRebase);
            rebaseList.push(commitToRebase);
        }
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const mergeDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        const mergeCommit = {
            parent: rebaseList[rebaseList.length - 1].sha,
            historicalParent: rebaseList[rebaseList.length - 1].sha,
            idx: rebaseList[rebaseList.length - 1].idx,
            message: `Merge [${fromSha}] into [${currentRepoState.commit}]`,
            mergeBase: mergeBaseCommit.sha,
            userId: user.id,
            timestamp: new Date().toString(),
            diff: mergeDiff,
        };
        mergeCommit.sha = (0, versioncontrol_1.getDiffHash)(mergeCommit);
        rebaseList.push(mergeCommit);
        for (let commitData of rebaseList) {
            const result = await datasource.saveCommit(repoId, commitData.sha, commitData);
            if (!result) {
                return null;
            }
        }
        if (currentRepoState.branch) {
            const branchState = await datasource.readBranch(repoId, currentRepoState.branch);
            await datasource.saveBranch(repoId, currentRepoState.branch, {
                ...branchState,
                lastCommit: mergeCommit.sha,
            });
            const branchMetaState = await datasource.readBranchesMetaState(repoId);
            branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = mergeCommit.sha;
                }
                return branch;
            });
            branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = mergeCommit.sha;
                }
                return branch;
            });
            await datasource.saveBranchesMetaState(repoId, branchMetaState);
        }
        await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, mergeCommit.sha, false);
        return currentAppState;
    }
    catch (e) {
        return null;
    }
};
exports.resolveMerge = resolveMerge;
const getMergeConflictDiff = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (!currentRepoState.isInMergeConflict) {
            return null;
        }
        const fromCommitState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.merge.fromSha);
        const intoCommitState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.merge.intoSha);
        const originCommitState = await (0, repo_1.getCommitState)(datasource, repoId, currentRepoState.merge.originSha);
        const mergeState = await (0, repo_1.getMergedCommitState)(datasource, fromCommitState, intoCommitState, originCommitState, currentRepoState.merge.direction);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        return (0, repo_1.getStateDiffFromCommitStates)(mergeState, currentKVState);
    }
    catch (e) {
        return null;
    }
};
exports.getMergeConflictDiff = getMergeConflictDiff;
const hasMergeConflictDiff = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const mergeDiff = await (0, exports.getMergeConflictDiff)(datasource, repoId);
        if (!mergeDiff) {
            return false;
        }
        return !(0, repo_1.diffIsEmpty)(mergeDiff);
    }
    catch (e) {
        return null;
    }
};
exports.hasMergeConflictDiff = hasMergeConflictDiff;
const revertCommit = async (datasource, repoId, reversionSha) => {
    if (!repoId) {
        return null;
    }
    if (!reversionSha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user.id) {
            return null;
        }
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (currentRepoState.isInMergeConflict) {
            return null;
        }
        if (!currentRepoState.commit) {
            return null;
        }
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        if (!(0, repo_1.diffIsEmpty)(currentDiff)) {
            return null;
        }
        const history = await (0, repo_1.getHistory)(datasource, repoId, currentRepoState.commit);
        const commitToRevert = await datasource.readCommit(repoId, reversionSha);
        if (!commitToRevert || history[commitToRevert.idx].sha != reversionSha) {
            return null;
        }
        let shaBeforeReversion = history[commitToRevert.idx + 1]?.sha ?? null;
        const reversionState = await (0, repo_1.getCommitState)(datasource, repoId, shaBeforeReversion);
        const currentCommit = await datasource.readCommit(repoId, currentRepoState.commit);
        const reversionDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, reversionState);
        const revertCommit = {
            parent: currentCommit.sha,
            historicalParent: currentCommit.sha,
            idx: currentCommit.idx + 1,
            message: `Revert [${reversionSha}]: (message) ${commitToRevert.message}`,
            userId: user.id,
            authorUserId: commitToRevert.authorUserId,
            timestamp: new Date().toString(),
            diff: reversionDiff,
        };
        revertCommit.sha = (0, versioncontrol_1.getDiffHash)(revertCommit);
        await datasource.saveCommit(repoId, revertCommit.sha, revertCommit);
        if (currentRepoState.branch) {
            const branchState = await datasource.readBranch(repoId, currentRepoState.branch);
            await datasource.saveBranch(repoId, currentRepoState.branch, {
                ...branchState,
                lastCommit: revertCommit.sha,
            });
            const branchMetaState = await datasource.readBranchesMetaState(repoId);
            branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = reversionSha;
                }
                return branch;
            });
            branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = reversionSha;
                }
                return branch;
            });
            await datasource.saveBranchesMetaState(repoId, branchMetaState);
        }
        await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, revertCommit.sha, false);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, reversionState);
        const state = await datasource.saveRenderedState(repoId, renderedState);
        return state;
    }
    catch (e) {
        return null;
    }
};
exports.revertCommit = revertCommit;
const canAutofxReversion = async (datasource, repoId, reversionSha) => {
    if (!repoId) {
        return null;
    }
    if (!reversionSha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user.id) {
            return null;
        }
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (currentRepoState.isInMergeConflict) {
            return null;
        }
        if (!currentRepoState.commit) {
            return null;
        }
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        if (!(0, repo_1.diffIsEmpty)(currentDiff)) {
            return false;
        }
        const history = await (0, repo_1.getHistory)(datasource, repoId, currentRepoState.commit);
        const commitToRevert = await datasource.readCommit(repoId, reversionSha);
        if (!commitToRevert || history[commitToRevert.idx].sha != reversionSha) {
            return false;
        }
        let shaBeforeReversion = history[commitToRevert.idx + 1]?.sha ?? null;
        const beforeReversionState = await (0, repo_1.getCommitState)(datasource, repoId, shaBeforeReversion);
        const reversionState = await (0, repo_1.getCommitState)(datasource, repoId, reversionSha);
        const canAutoFix = await (0, repo_1.canAutoMergeCommitStates)(datasource, currentKVState, // yours
        beforeReversionState, // theirs
        reversionState // origin
        );
        return canAutoFix;
    }
    catch (e) {
        return null;
    }
};
exports.canAutofxReversion = canAutofxReversion;
const autofixReversion = async (datasource, repoId, reversionSha) => {
    if (!repoId) {
        return null;
    }
    if (!reversionSha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const user = await (0, filestructure_1.getUserAsync)();
        if (!user.id) {
            return null;
        }
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        if (currentRepoState.isInMergeConflict) {
            return null;
        }
        if (!currentRepoState.commit) {
            return null;
        }
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        if (!(0, repo_1.diffIsEmpty)(currentDiff)) {
            return null;
        }
        const history = await (0, repo_1.getHistory)(datasource, repoId, currentRepoState.commit);
        const commitToRevert = await datasource.readCommit(repoId, reversionSha);
        if (!commitToRevert || history[commitToRevert.idx].sha != reversionSha) {
            return null;
        }
        let shaBeforeReversion = history[commitToRevert.idx + 1]?.sha ?? null;
        const beforeReversionState = await (0, repo_1.getCommitState)(datasource, repoId, shaBeforeReversion);
        const reversionState = await (0, repo_1.getCommitState)(datasource, repoId, reversionSha);
        const canAutoFix = await (0, repo_1.canAutoMergeCommitStates)(datasource, currentKVState, //theirs
        beforeReversionState, //yours
        reversionState //origin
        );
        if (!canAutoFix) {
            return null;
        }
        const autoFixState = await (0, repo_1.getMergedCommitState)(datasource, currentKVState, //theirs
        beforeReversionState, //yours
        reversionState //origin
        );
        const currentCommit = await datasource.readCommit(repoId, currentRepoState.commit);
        const autofixDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, autoFixState);
        const autofixCommit = {
            parent: currentCommit.sha,
            historicalParent: currentCommit.sha,
            idx: currentCommit.idx + 1,
            message: `Autofix [${reversionSha}]: (message) ${commitToRevert.message}`,
            userId: user.id,
            authorUserId: commitToRevert.authorUserId,
            timestamp: new Date().toString(),
            diff: autofixDiff,
        };
        autofixCommit.sha = (0, versioncontrol_1.getDiffHash)(autofixCommit);
        await datasource.saveCommit(repoId, autofixCommit.sha, autofixCommit);
        if (currentRepoState.branch) {
            const branchState = await datasource.readBranch(repoId, currentRepoState.branch);
            await datasource.saveBranch(repoId, currentRepoState.branch, {
                ...branchState,
                lastCommit: autofixCommit.sha,
            });
            const branchMetaState = await datasource.readBranchesMetaState(repoId);
            branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = reversionSha;
                }
                return branch;
            });
            branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = reversionSha;
                }
                return branch;
            });
            await datasource.saveBranchesMetaState(repoId, branchMetaState);
        }
        await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, autofixCommit.sha, false);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, autoFixState);
        const state = await datasource.saveRenderedState(repoId, renderedState);
        return state;
    }
    catch (e) {
        return null;
    }
};
exports.autofixReversion = autofixReversion;
const cherryPickRevision = async (datasource, repoId, cherryPickedSha) => {
    if (!repoId) {
        return null;
    }
    if (!cherryPickedSha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const cherryPickedCommit = await datasource.readCommit(repoId, cherryPickedSha);
        if (!cherryPickedCommit) {
            return null;
        }
        const beforeCherryPickedSha = cherryPickedCommit?.parent ?? null;
        const cherryPickedState = await (0, repo_1.getCommitState)(datasource, repoId, cherryPickedSha);
        const beforeCherryPickedState = await (0, repo_1.getCommitState)(datasource, repoId, beforeCherryPickedSha);
        const canCherryPick = await (0, repo_1.canAutoMergeCommitStates)(datasource, cherryPickedState, currentKVState, beforeCherryPickedState);
        if (!canCherryPick) {
            return null;
        }
        const updatedState = await (0, repo_1.getMergedCommitState)(datasource, cherryPickedState, // yours
        currentKVState, // theirs
        beforeCherryPickedState // origin
        );
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, updatedState);
        return await datasource.saveRenderedState(repoId, renderedState);
    }
    catch (e) {
        return null;
    }
};
exports.cherryPickRevision = cherryPickRevision;
const canCherryPickRevision = async (datasource, repoId, cherryPickedSha) => {
    if (!repoId) {
        return null;
    }
    if (!cherryPickedSha) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const cherryPickedCommit = await datasource.readCommit(repoId, cherryPickedSha);
        if (!cherryPickedCommit) {
            return false;
        }
        const beforeCherryPickedSha = cherryPickedCommit?.parent ?? null;
        const cherryPickedState = await (0, repo_1.getCommitState)(datasource, repoId, cherryPickedSha);
        const beforeCherryPickedState = await (0, repo_1.getCommitState)(datasource, repoId, beforeCherryPickedSha);
        const canCherryPick = await (0, repo_1.canAutoMergeCommitStates)(datasource, cherryPickedState, // yours
        currentKVState, // theirs
        beforeCherryPickedState // origin
        );
        return canCherryPick;
    }
    catch (e) {
        return null;
    }
};
exports.canCherryPickRevision = canCherryPickRevision;
const rollbackCommit = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        if (!(0, repo_1.diffIsEmpty)(currentDiff)) {
            return null;
        }
        const currentCommit = await datasource.readCommit(repoId, currentRepoState.commit);
        const rollbackSha = currentCommit?.mergeBase ?? currentCommit?.parent ?? null;
        const parentKVState = await (0, repo_1.getCommitState)(datasource, repoId, rollbackSha);
        if (currentRepoState.branch) {
            const branchState = await datasource.readBranch(repoId, currentRepoState.branch);
            await datasource.saveBranch(repoId, currentRepoState.branch, {
                ...branchState,
                lastCommit: rollbackSha,
            });
            const branchMetaState = await datasource.readBranchesMetaState(repoId);
            branchMetaState.allBranches = branchMetaState.allBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = rollbackSha;
                }
                return branch;
            });
            branchMetaState.userBranches = branchMetaState.userBranches.map((branch) => {
                if (branch.branchId == branchState.id) {
                    branch.lastLocalCommit = rollbackSha;
                }
                return branch;
            });
            await datasource.saveBranchesMetaState(repoId, branchMetaState);
        }
        await (0, repo_1.updateCurrentCommitSHA)(datasource, repoId, rollbackSha, false);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, parentKVState);
        return await datasource.saveRenderedState(repoId, renderedState);
    }
    catch (e) {
        return null;
    }
};
exports.rollbackCommit = rollbackCommit;
const canStash = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        if ((0, repo_1.diffIsEmpty)(currentDiff)) {
            return false;
        }
        return true;
    }
    catch (e) {
        return null;
    }
};
exports.canStash = canStash;
const stashChanges = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const currentDiff = (0, repo_1.getStateDiffFromCommitStates)(unstagedState, currentKVState);
        if ((0, repo_1.diffIsEmpty)(currentDiff)) {
            return null;
        }
        const stashList = await datasource.readStash(repoId, currentRepoState.commit);
        stashList.push(currentKVState);
        await datasource.saveStash(repoId, currentRepoState.commit, stashList);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, unstagedState);
        return await datasource.saveRenderedState(repoId, renderedState);
    }
    catch (e) {
        return null;
    }
};
exports.stashChanges = stashChanges;
const getStashSize = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const stashList = await datasource.readStash(repoId, currentRepoState.commit);
        return stashList.length;
    }
    catch (e) {
        return null;
    }
};
exports.getStashSize = getStashSize;
const canPopStashedChanges = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const stashList = await datasource.readStash(repoId, currentRepoState.commit);
        if (stashList.length == 0) {
            return false;
        }
        const topChanges = stashList.pop();
        const canPop = await (0, repo_1.canAutoMergeCommitStates)(datasource, topChanges, // theirs
        currentKVState, // yours
        unstagedState // origin
        );
        return canPop;
    }
    catch (e) {
        return null;
    }
};
exports.canPopStashedChanges = canPopStashedChanges;
const popStashedChanges = async (datasource, repoId) => {
    if (!repoId) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const stashList = await datasource.readStash(repoId, currentRepoState.commit);
        if (stashList.length == 0) {
            return null;
        }
        const topChanges = stashList.pop();
        const canPop = await (0, repo_1.canAutoMergeCommitStates)(datasource, topChanges, // theirs
        currentKVState, // yours
        unstagedState // origin
        );
        if (!canPop) {
            return null;
        }
        const appliedStash = await (0, repo_1.getMergedCommitState)(datasource, topChanges, // theirs
        currentKVState, // yours
        unstagedState // origin
        );
        await datasource.saveStash(repoId, currentRepoState.commit, stashList);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, appliedStash);
        return await datasource.saveRenderedState(repoId, renderedState);
    }
    catch (e) {
        return null;
    }
};
exports.popStashedChanges = popStashedChanges;
const applyStashedChange = async (datasource, repoId, index) => {
    if (!repoId) {
        return null;
    }
    if (index === undefined) {
        return null;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
        return null;
    }
    try {
        const currentRepoState = await datasource.readCurrentRepoState(repoId);
        const currentAppState = await (0, repo_1.getApplicationState)(datasource, repoId);
        const currentKVState = await (0, repo_1.convertRenderedCommitStateToKv)(datasource, currentAppState);
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(datasource, repoId);
        const stashList = await datasource.readStash(repoId, currentRepoState.commit);
        if (stashList.length == 0) {
            return null;
        }
        const change = stashList[index];
        if (!change) {
            {
                return null;
            }
        }
        stashList.splice(index, 1);
        const canPop = await (0, repo_1.canAutoMergeCommitStates)(datasource, change, // theirs
        currentKVState, // yours
        unstagedState // origin
        );
        if (!canPop) {
            return null;
        }
        const appliedStash = await (0, repo_1.getMergedCommitState)(datasource, change, // theirs
        currentKVState, // yours
        unstagedState // origin
        );
        await datasource.saveStash(repoId, currentRepoState.commit, stashList);
        const renderedState = await (0, repo_1.convertCommitStateToRenderedState)(datasource, appliedStash);
        return await datasource.saveRenderedState(repoId, renderedState);
    }
    catch (e) {
        return null;
    }
};
exports.applyStashedChange = applyStashedChange;
//# sourceMappingURL=repoapi.js.map