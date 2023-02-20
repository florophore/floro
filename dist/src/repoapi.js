"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePluginState = exports.updatePlugins = exports.checkoutSha = exports.checkoutBranch = exports.writeRepoCommit = exports.readBranchState = exports.readCommitState = exports.readCurrentState = exports.readCommitHistory = exports.readBranchHistory = exports.readCurrentHistory = exports.readRepoCommit = exports.readLastCommit = exports.readSettings = exports.deleteBranch = exports.switchRepoBranch = exports.getRepoBranches = exports.getCurrentRepoBranch = exports.readRepoDescription = exports.readRepoLicenses = exports.writeRepoLicenses = exports.writeRepoDescription = exports.repoExists = void 0;
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
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
        const diff = (0, versioncontrol_1.getTextDiff)(unstagedState.description?.join(""), description);
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
            {
                diff,
                namespace: "description",
            },
        ]);
        const nextDescription = (0, versioncontrol_1.applyDiff)(state.diff.description, unstagedState.description);
        return nextDescription;
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
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
        const diff = (0, versioncontrol_1.getDiff)(unstagedState.licenses, licenses);
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
            {
                diff,
                namespace: "licenses",
            },
        ]);
        const updatedLicenses = (0, versioncontrol_1.applyDiff)(state.diff.licenses, unstagedState.licenses);
        return updatedLicenses;
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
        const state = await (0, repo_1.getRepoState)(repoId);
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
    const state = await (0, repo_1.getRepoState)(repoId);
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
        const branch = await (0, repo_1.getCurrentBranch)(repoId);
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
        const sha = await (0, repo_1.getCurrentCommitSha)(repoId);
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
        return await (0, repo_1.updateCurrentWithNewBranch)(repoId, branchName);
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
        const sha = await (0, repo_1.getCurrentCommitSha)(repoId);
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
        const sha = await (0, repo_1.getCurrentCommitSha)(repoId);
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
        const state = await (0, repo_1.getRepoState)(repoId);
        const store = await (0, repo_1.buildStateStore)(state);
        return { ...state, store };
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
        const store = await (0, repo_1.buildStateStore)(state);
        return { ...state, store };
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
        const store = await (0, repo_1.buildStateStore)(state);
        return { ...state, store };
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
        const commitIsValid = await (0, repo_1.canCommit)(repoId, user, message);
        if (!commitIsValid) {
            return null;
        }
        const currentState = await (0, repo_1.getCurrentState)(repoId);
        const currentSha = await (0, repo_1.getCurrentCommitSha)(repoId);
        const timestamp = (new Date()).toString();
        const commitData = {
            parent: currentSha,
            historicalParent: currentSha,
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
            if (!branchState) {
                return null;
            }
            await (0, repo_1.updateLocalBranch)(repoId, currentState.branch, {
                ...branchState,
                lastCommit: sha
            });
            await (0, repo_1.updateCurrentCommitSHA)(repoId, null);
        }
        else {
            await (0, repo_1.updateCurrentCommitSHA)(repoId, sha);
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
        if (!currentBranches.map(v => v.name.toLowerCase()).includes(branchName.toLowerCase())) {
            return null;
        }
        const branchData = await (0, repo_1.getLocalBranch)(repoId, branchName);
        if (!branchData) {
            return null;
        }
        return await (0, repo_1.updateCurrentWithNewBranch)(repoId, branchName);
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
        const current = await (0, repo_1.updateCurrentWithSHA)(repoId, sha);
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
const updatePlugins = async (repoId, plugins) => {
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
        // fetch upstream plugins
        // TODO: check each plugin is present in floro
        // TODO COME BACK HERE
        //const unstagedState = await getUnstagedCommitState(repoId);
        //const pluginsToUpdate = getPluginsToRunUpdatesOn(unstagedState.plugins, plugins);
        //// TODO: IMMEDIATELY, update this
        //console.log("er", pluginsToUpdate);
        //const pluginsDiff = getDiff(unstagedState.plugins, plugins);
        //const nextPluginState = applyDiff(pluginsDiff, unstagedState.plugins);
        //// attempt download
        //const areCompatible = await pluginManifestsAreCompatibleForUpdate(unstagedState.plugins, nextPluginState, readPluginManifest);
        //if (!areCompatible) {
        //  return null;
        //}
        ////const nextPluginSchemaMap = getPlugin
        //const pluginAdditions = [];
        //for (let plugin of nextPluginState) {
        //  if (!hasPlugin(plugin.key, unstagedState.plugins)) {
        //    //const initState = getKVStateForPlugin()
        //    pluginAdditions.push({
        //      namespace: "store",
        //      pluginName: plugin.key,
        //      diff: {
        //        add: {},
        //        remove: {},
        //      },
        //    });
        //  }
        //}
        // TRANSFORM store and binaries
        // run migrations
        //const state = await saveDiffToCurrent(repoId, pluginsDiff, 'plugins');
        //const state = await saveDiffListToCurrent(repoId, [
        //  {
        //    diff: pluginsDiff,
        //    namespace: "plugins",
        //  },
        //  ...pluginAdditions,
        //]);
        //return state;
    }
    catch (e) {
        return null;
    }
};
exports.updatePlugins = updatePlugins;
const updatePluginState = async (repoId, pluginName, updateState) => {
    if (!repoId) {
        return null;
    }
    if (!pluginName) {
        return null;
    }
    if (!updateState) {
        return null;
    }
    const exists = await (0, exports.repoExists)(repoId);
    if (!exists) {
        return null;
    }
    try {
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
        const current = await (0, repo_1.getRepoState)(repoId);
        if (current == null) {
            return null;
        }
        // TODO MOVE THIS LOGIC TO HANDLE DOWNSTREAM
        const manifest = await (0, plugins_1.getPluginManifest)(pluginName, current?.plugins ?? [], plugins_1.readPluginManifest);
        if (manifest == null) {
            return null;
        }
        //const upstreamDependencies = await getUpstreamDependencyList(
        //  pluginName,
        //  manifest,
        //  current?.plugins ?? [],
        //  readPluginManifest
        //);
        //const upsteamSchema = await constructDependencySchema(upstreamDependencies, readPluginManifest);
        // TOOD: FIX THIS
        // COME BACK
        //const rootSchema = getRootSchemaForPlugin(
        //  upsteamSchema,
        //  manifest,
        //  pluginName
        //);
        //const kvState = getKVStateForPlugin(
        //  upsteamSchema,
        //  manifest,
        //  pluginName,
        //  updateState ?? {}
        //);
        //const diff = getDiff(unstagedState.store?.[pluginName] ?? [], kvState);
        //// needs to be looped through for each plugin in downstream deps
        //const nextState = applyDiff(diff, unstagedState?.store?.[pluginName] ?? []);
        //// END TODO
        //const commitState = await saveDiffListToCurrent(repoId, [
        //  {
        //    diff,
        //    namespace: "store",
        //    pluginName,
        //  },
        //]);
        //const state = generateStateFromKV(manifest, nextState, pluginName);
        //// run cascade next
        //// find downstream plugins
        //// run cascades on downstream schemas
        //// save all diffs against respective manifests
        //// return constructed kv state of plugin and upstreams
        //return { [pluginName]: state };
    }
    catch (e) {
        return null;
    }
};
exports.updatePluginState = updatePluginState;
//# sourceMappingURL=repoapi.js.map