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
export interface ApplicationKVState {
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
export interface RenderedApplicationState {
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
export interface RepoState {
    branch: string | null;
    commit: string | null;
    isInMergeConflict: boolean;
    merge: null | {
        fromSha: string;
        intoSha: string;
        originSha: string;
        direction: "yours" | "theirs";
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
export interface CheckpointMap {
    [sha: string]: ApplicationKVState;
}
export declare const EMPTY_COMMIT_STATE: ApplicationKVState;
export declare const EMPTY_RENDERED_APPLICATION_STATE: RenderedApplicationState;
export declare const EMPTY_COMMIT_DIFF: StateDiff;
export declare const getRepos: () => Promise<string[]>;
export declare const getAddedDeps: (oldPlugins: Array<PluginElement>, newPlugins: Array<PluginElement>) => Array<PluginElement>;
export declare const getRemovedDeps: (oldPlugins: Array<PluginElement>, newPlugins: Array<PluginElement>) => Array<PluginElement>;
export declare const cloneRepo: (repoId: string) => Promise<boolean>;
export declare const getCurrentCommitSha: (datasource: DataSource, repoId: string) => Promise<string | null>;
export declare const diffIsEmpty: (stateDiff: StateDiff) => boolean;
export declare const canCommit: (datasource: DataSource, repoId: string, user: User, message: string, diff: StateDiff) => Promise<boolean>;
export declare const buildCommitData: (parentSha: string, historicalParent: string, idx: number, diff: StateDiff, userId: string, timestamp: string, message: string) => CommitData;
export declare const getHistory: (datasource: DataSource, repoId: string, sha: string | null) => Promise<Array<CommitHistory> | null>;
export declare const getBaseDivergenceSha: (history: Array<CommitHistory>, origin: CommitData) => CommitHistory;
export declare const getDivergenceOriginSha: (datasource: DataSource, repoId: string, fromSha: string, intoSha: string) => Promise<string>;
export declare const getCommitState: (datasource: DataSource, repoId: string, sha: string | null, historyLength?: number, checkedHot?: boolean, hotCheckpoint?: [string, ApplicationKVState]) => Promise<ApplicationKVState | null>;
export declare const applyStateDiffToCommitState: (applicationKVState: ApplicationKVState, stateDiff: StateDiff) => ApplicationKVState;
export declare const getCurrentBranch: (datasource: DataSource, repoId: string) => Promise<Branch | null>;
export declare const getUnstagedCommitState: (datasource: DataSource, repoId: string) => Promise<ApplicationKVState>;
export declare const getApplicationState: (datasource: DataSource, repoId: string) => Promise<RenderedApplicationState>;
export declare const convertRenderedCommitStateToKv: (datasource: DataSource, renderedAppState: RenderedApplicationState) => Promise<ApplicationKVState>;
/**
 * use when committing against branch or sha
 */
export declare const updateCurrentCommitSHA: (datasource: DataSource, repoId: string, sha: string, isResolvingMerge: boolean) => Promise<RepoState | null>;
/**
 * use when HEAD is detached
 */
export declare const updateCurrentWithSHA: (datasource: DataSource, repoId: string, sha: string, isResolvingMerge: boolean) => Promise<RepoState | null>;
export declare const updateCurrentWithNewBranch: (datasource: DataSource, repoId: string, branchName: string) => Promise<RepoState | null>;
export declare const updateCurrentBranch: (datasource: DataSource, repoId: string, branchName: string) => Promise<RepoState | null>;
export declare const getPluginsToRunUpdatesOn: (pastPlugins: Array<PluginElement>, nextPlugins: Array<PluginElement>) => PluginElement[];
export declare const buildStateStore: (datasource: DataSource, appKvState: ApplicationKVState) => Promise<{
    [key: string]: object;
}>;
export declare const convertStateStoreToKV: (datasource: DataSource, appKVState: ApplicationKVState, stateStore: {
    [key: string]: object;
}) => Promise<RawStore>;
export declare const convertRenderedStateStoreToKV: (datasource: DataSource, renderedAppState: RenderedApplicationState) => Promise<RawStore>;
export declare const convertCommitStateToRenderedState: (datasource: DataSource, appKVState: ApplicationKVState) => Promise<RenderedApplicationState>;
export declare const tokenizeCommitState: (appKVState: ApplicationKVState) => [TokenizedState, {
    [key: string]: unknown;
}];
export declare const detokenizeStore: (tokenizedState: TokenizedState, tokenStore: {
    [key: string]: unknown;
}) => ApplicationKVState;
export declare const mergeTokenStores: (fromStore: {
    [key: string]: unknown;
}, intoStore: {
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
export declare const getStateDiffFromCommitStates: (beforeKVState: ApplicationKVState, afterKVState: ApplicationKVState) => StateDiff;
export declare const getCommitStateDiffList: (beforeKVState: ApplicationKVState, afterKVState: ApplicationKVState) => Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>;
export declare const renderDiffList: (diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>) => StateDiff;
export declare const getMergeCommitStates: (datasource: DataSource, repoId: string, fromSha: string, intoSha: string) => Promise<{
    fromCommitState: ApplicationKVState;
    intoCommitState: ApplicationKVState;
    originCommit: ApplicationKVState;
}>;
export declare const canAutoMergeCommitStates: (datasource: DataSource, fromCommitState: ApplicationKVState, intoCommitState: ApplicationKVState, originCommitState: ApplicationKVState) => Promise<boolean>;
export declare const getMergedCommitState: (datasource: DataSource, fromState: ApplicationKVState, intoState: ApplicationKVState, originCommit: ApplicationKVState, direction?: "yours" | "theirs") => Promise<ApplicationKVState>;
export declare const canAutoMergeOnTopCurrentState: (datasource: DataSource, repoId: string, mergeSha: string) => Promise<boolean>;
