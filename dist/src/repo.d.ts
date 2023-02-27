import { DataSource } from "./datasource";
import { User } from "./filestructure";
import { PluginElement } from "./plugins";
import { CommitData, Diff, TextDiff } from "./versioncontrol";
export interface RepoSetting {
    mainBranch: string;
}
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
export declare const getRepos: () => Promise<string[]>;
export declare const getAddedDeps: (oldPlugins: Array<PluginElement>, newPlugins: Array<PluginElement>) => Array<PluginElement>;
export declare const getRemovedDeps: (oldPlugins: Array<PluginElement>, newPlugins: Array<PluginElement>) => Array<PluginElement>;
export declare const cloneRepo: (repoId: string) => Promise<boolean>;
export declare const getCurrentCommitSha: (datasource: DataSource, repoId: string) => Promise<string | null>;
export declare const diffIsEmpty: (stateDiff: StateDiff) => boolean;
export declare const canCommit: (datasource: DataSource, repoId: string, user: User, message: string) => Promise<boolean>;
export declare const buildCommitData: (parentSha: string, historicalParent: string, idx: number, diff: StateDiff, userId: string, timestamp: string, message: string) => CommitData;
export declare const getHistory: (datasource: DataSource, repoId: string, sha: string | null) => Promise<Array<CommitHistory> | null>;
export declare const getBaseDivergenceSha: (history: Array<CommitHistory>, origin: CommitData) => CommitHistory;
export declare const getDivergenceOriginSha: (datasource: DataSource, repoId: string, sha1: string, sha2: string) => Promise<string>;
export declare const getCommitState: (datasource: DataSource, repoId: string, sha?: string) => Promise<CommitState | null>;
/**
 *  REFACTOR ABOVE WITH FOLLOWINg
 *  */
export declare const applyStateDiffToCommitState: (commitState: CommitState, stateDiff: StateDiff) => Promise<CommitState>;
export declare const getCurrentBranch: (datasource: DataSource, repoId: string) => Promise<Branch | null>;
export declare const getUnstagedCommitState: (datasource: DataSource, repoId: string) => Promise<CommitState>;
export declare const getRepoState: (datasource: DataSource, repoId: string) => Promise<CommitState>;
export declare const getProposedStateFromDiffListOnCurrent: (datasource: DataSource, repoId: string, diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>) => Promise<State | null>;
export declare const saveDiffListToCurrent: (datasource: DataSource, repoId: string, diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>) => Promise<State | null>;
/**
 * use when committing against branch or sha
 */
export declare const updateCurrentCommitSHA: (datasource: DataSource, repoId: string, sha: string, isResolvingMerge: boolean) => Promise<State | null>;
/**
 * use when HEAD is detached
 */
export declare const updateCurrentWithSHA: (datasource: DataSource, repoId: string, sha: string, isResolvingMerge: boolean) => Promise<State | null>;
export declare const updateCurrentWithNewBranch: (datasource: DataSource, repoId: string, branchName: string) => Promise<State | null>;
export declare const updateCurrentBranch: (datasource: DataSource, repoId: string, branchName: string) => Promise<State | null>;
export declare const getPluginsToRunUpdatesOn: (pastPlugins: Array<PluginElement>, nextPlugins: Array<PluginElement>) => PluginElement[];
export declare const buildStateStore: (datasource: DataSource, state: CommitState) => Promise<{
    [key: string]: object;
}>;
export declare const convertStateStoreToKV: (datasource: DataSource, state: CommitState, stateStore: {
    [key: string]: object;
}) => Promise<RawStore>;
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
export declare const getMergeCommitStates: (datasource: DataSource, repoId: string, sha1: string, sha2: string) => Promise<{
    commit1: CommitState;
    commit2: CommitState;
    originCommit: CommitState;
}>;
export declare const canAutoMergeCommitStates: (datasource: DataSource, commit1: CommitState, commit2: CommitState, originCommit: CommitState) => Promise<boolean>;
export declare const getMergedCommitState: (datasource: DataSource, commit1: CommitState, commit2: CommitState, originCommit: CommitState, whose?: "yours" | "theirs") => Promise<CommitState>;
export declare const canAutoMergeOnTopCurrentState: (datasource: DataSource, repoId: string, mergeSha: string) => Promise<boolean>;
export declare const renderCommitState: (datasource: DataSource, state: CommitState) => Promise<RenderedCommitState>;
