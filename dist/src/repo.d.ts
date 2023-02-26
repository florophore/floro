import { User } from "./filestructure";
import { Manifest, PluginElement } from "./plugins";
import { CommitData, Diff, TextDiff } from "./versioncontrol";
export interface RawStore {
    [name: string]: Array<{
        key: string;
        value: string;
    }>;
}
export interface CommitState {
    description: Array<string>;
    licenses: Array<{
        key: string;
        value: string;
    }>;
    plugins: Array<{
        key: string;
        value: string;
    }>;
    store: RawStore;
    binaries: Array<{
        key: string;
        value: string;
    }>;
}
export interface RenderedCommitState {
    description: Array<string>;
    licenses: Array<{
        key: string;
        value: string;
    }>;
    plugins: Array<{
        key: string;
        value: string;
    }>;
    store: {
        [key: string]: object;
    };
    binaries: Array<{
        key: string;
        value: string;
    }>;
}
export interface TokenizedState {
    description: Array<string>;
    licenses: Array<string>;
    plugins: Array<string>;
    store: {
        [key: string]: Array<string>;
    };
    binaries: Array<string>;
}
export interface StoreStateDiff {
    [pluginName: string]: Diff;
}
export interface StateDiff {
    plugins: Diff;
    binaries: Diff;
    store: StoreStateDiff;
    licenses: Diff;
    description: TextDiff;
}
export interface State {
    diff: StateDiff;
    branch: string | null;
    commit: string | null;
    isMerge: boolean;
    merge: null | {
        fromSha: string;
        fromBranch: string;
        intoSha: string;
        intoBranch: string;
    };
}
export interface Branch {
    name: string;
    firstCommit: null | string;
    lastCommit: null | string;
    createdBy: string;
    createdAt: string;
}
export interface CommitHistory {
    sha: null | string;
    idx: number;
    message: string;
}
export declare const getLocalRepos: () => Promise<string[]>;
export declare const getAddedDeps: (oldPlugins: Array<PluginElement>, newPlugins: Array<PluginElement>) => Array<PluginElement>;
export declare const getRemovedDeps: (oldPlugins: Array<PluginElement>, newPlugins: Array<PluginElement>) => Array<PluginElement>;
export declare const cloneRepo: (repoId: string) => Promise<boolean>;
export declare const getRepoSettings: (repoId: string) => Promise<any>;
export declare const getCurrentState: (repoId: string) => Promise<State>;
export declare const getCurrentCommitSha: (repoId: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<string | null>;
export declare const getLocalBranches: (repoId: string) => Promise<Array<Branch>>;
export declare const getCommitDirPath: (repoId: string, commitSha: string) => string;
export declare const diffIsEmpty: (stateDiff: StateDiff) => boolean;
export declare const canCommit: (repoId: string, user: User, message: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<boolean>;
export declare const readCommit: (repoId: string, commitSha: string) => Promise<CommitData | null>;
export declare const buildCommitData: (parentSha: string, historicalParent: string, idx: number, diff: StateDiff, userId: string, timestamp: string, message: string) => CommitData;
export declare const writeCommit: (repoId: string, commitSha: string, commitData: CommitData) => Promise<CommitData>;
export declare const getHistory: (repoId: string, sha: string | null) => Promise<Array<CommitHistory> | null>;
export declare const getBaseDivergenceSha: (history: Array<CommitHistory>, origin: CommitData) => CommitHistory;
export declare const getDivergenceOriginSha: (repoId: string, sha1: string, sha2: string) => Promise<string>;
export declare const getLocalBranch: (repoId: string, branchName: string) => Promise<Branch>;
export declare const deleteLocalBranch: (repoId: string, branchName: string) => Promise<boolean>;
export declare const updateLocalBranch: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch | null>;
export declare const getCommitState: (repoId: string, sha?: string) => Promise<CommitState | null>;
/**
 *  REFACTOR ABOVE WITH FOLLOWINg
 *  */
export declare const applyStateDiffToCommitState: (commitState: CommitState, stateDiff: StateDiff) => Promise<CommitState>;
export declare const getCurrentBranch: (repoId: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<Branch | null>;
export declare const getUnstagedCommitState: (repoId: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<CommitState>;
export declare const getRepoState: (repoId: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<CommitState>;
export declare const getProposedStateFromDiffListOnCurrent: (repoId: string, diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<State | null>;
export declare const saveDiffListToCurrent: (repoId: string, diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<State | null>;
/**
 *
 * use when committing against branch or sha
 */
export declare const updateCurrentCommitSHA: (repoId: string, sha: string, isResolvingMerge: boolean, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<State | null>;
/**
 *
 * use when HEAD is detached
 */
export declare const updateCurrentWithSHA: (repoId: string, sha: string, isResolvingMerge: boolean, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<State | null>;
export declare const updateCurrentWithNewBranch: (repoId: string, branchName: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<State | null>;
export declare const updateCurrentBranch: (repoId: string, branchName: string, fetchCurrentState: (repoId: string) => Promise<State>) => Promise<State | null>;
export declare const getPluginsToRunUpdatesOn: (pastPlugins: Array<PluginElement>, nextPlugins: Array<PluginElement>) => PluginElement[];
export declare const buildStateStore: (state: CommitState, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<{
    [key: string]: object;
}>;
export declare const convertStateStoreToKV: (state: CommitState, stateStore: {
    [key: string]: object;
}, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<RawStore>;
export declare const tokenizeCommitState: (commitState: CommitState) => [TokenizedState, {
    [key: string]: unknown;
}];
export declare const detokenizeStore: (tokenizedState: TokenizedState, tokenStore: {
    [key: string]: unknown;
}) => CommitState;
export declare const mergeTokenStores: (tokenStore1: {
    [key: string]: unknown;
}, tokenStore2: {
    [key: string]: unknown;
}) => {
    [x: string]: unknown;
};
export declare const uniqueKV: (kvList: Array<{
    key: string;
    value: string;
}>) => Array<{
    key: string;
    value: string;
}>;
export declare const getCommitStateDiffList: (commit1: CommitState, commit2: CommitState) => Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>;
export declare const renderDiffList: (diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>) => StateDiff;
export declare const getMergeCommitStates: (repoId: string, sha1: string, sha2: string) => Promise<{
    commit1: CommitState;
    commit2: CommitState;
    originCommit: CommitState;
}>;
export declare const canAutoMergeCommitStates: (commit1: CommitState, commit2: CommitState, originCommit: CommitState, pluginFetch: (pluginName: string, version: string) => Promise<Manifest>) => Promise<boolean>;
export declare const getMergedCommitState: (commit1: CommitState, commit2: CommitState, originCommit: CommitState, pluginFetch: (pluginName: string, version: string) => Promise<Manifest>, whose?: "yours" | "theirs") => Promise<CommitState>;
export declare const canAutoMergeOnTopCurrentState: (repoId: string, mergeSha: string, pluginFetch: (pluginName: string, version: string) => Promise<Manifest | null>) => Promise<boolean>;
export declare const renderCommitState: (state: CommitState, pluginFetch: (pluginName: string, version: string) => Promise<Manifest>) => Promise<RenderedCommitState>;
