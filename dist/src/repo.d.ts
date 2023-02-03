import { User } from "./filestructure";
import { PluginElement } from "./plugins";
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
    message: string;
}
export declare const getLocalRepos: () => Promise<string[]>;
export declare const cloneRepo: (repoId: string) => Promise<boolean>;
export declare const getRepoSettings: (repoId: string) => Promise<any>;
export declare const getCurrentState: (repoId: string) => Promise<State>;
export declare const getCurrentCommitSha: (repoId: string) => Promise<string | null>;
export declare const getLocalBranches: (repoId: string) => Promise<Array<Branch>>;
export declare const getCommitDirPath: (repoId: string, commitSha: string) => string;
export declare const diffIsEmpty: (stateDiff: StateDiff) => boolean;
export declare const canCommit: (repoId: string, user: User, message: string) => Promise<boolean>;
export declare const readCommit: (repoId: string, commitSha: string) => Promise<CommitData | null>;
export declare const writeCommit: (repoId: string, commitSha: string, commitData: CommitData) => Promise<CommitData>;
export declare const getHistory: (repoId: string, sha: string | null) => Promise<Array<CommitHistory> | null>;
export declare const getLocalBranch: (repoId: string, branchName: string) => Promise<Branch>;
export declare const deleteLocalBranch: (repoId: string, branchName: string) => Promise<boolean>;
export declare const updateLocalBranch: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch | null>;
export declare const getCommitState: (repoId: string, sha?: string) => Promise<CommitState | null>;
export declare const getCurrentBranch: (repoId: string) => Promise<Branch | null>;
export declare const getUnstagedCommitState: (repoId: string) => Promise<CommitState>;
export declare const getRepoState: (repoId: string) => Promise<CommitState>;
export declare const saveDiffListToCurrent: (repoId: string, diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>) => Promise<State>;
/**
 *
 * use when committing gainst branch or sha
 */
export declare const updateCurrentCommitSHA: (repoId: string, sha: string) => Promise<State | null>;
/**
 *
 * use when HEAD is detached
 */
export declare const updateCurrentWithSHA: (repoId: string, sha: string) => Promise<State | null>;
export declare const updateCurrentWithNewBranch: (repoId: string, branchName: string) => Promise<State | null>;
export declare const updateCurrentBranch: (repoId: string, branchName: string) => Promise<State | null>;
export declare const getPluginsToRunUpdatesOn: (pastPlugins: Array<PluginElement>, nextPlugins: Array<PluginElement>) => PluginElement[];
export declare const buildStateStore: (state: CommitState) => Promise<{
    [key: string]: unknown;
}>;
