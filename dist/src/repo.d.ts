import { Diff, TextDiff } from "./versioncontrol";
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
    firstCommit: null | string;
    lastCommit: null | string;
    createdBy: string;
    createdAt: string;
}
export declare const getLocalRepos: () => Promise<string[]>;
export declare const cloneRepo: (repoId: string) => Promise<boolean>;
export declare const getRepoSettings: (repoId: string) => Promise<any>;
export declare const getCurrentState: (repoId: string) => Promise<State>;
export declare const getLocalBranches: (repoId: string) => Promise<Array<Branch>>;
export declare const getLocalBranch: (repoId: string, branchName: string) => Promise<Branch>;
export declare const getCommitState: (repoId: string, sha?: string) => Promise<CommitState>;
export declare const getCurrentBranch: (repoId: string) => Promise<Branch>;
export declare const getUnstagedCommitState: (repoId: string) => Promise<CommitState>;
export declare const getRepoState: (repoId: string) => Promise<CommitState>;
export declare const saveDiffListToCurrent: (repoId: string, diffList: Array<{
    diff: Diff | TextDiff;
    namespace: string;
    pluginName?: string;
}>) => Promise<State>;
export declare const buildStateStore: (state: CommitState) => Promise<{
    [key: string]: unknown;
}>;
