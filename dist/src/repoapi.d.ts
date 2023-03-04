import { Branch, RenderedApplicationState, RepoState } from "./repo";
import { CommitData } from "./versioncontrol";
import { PluginElement } from "./plugins";
import { DataSource } from "./datasource";
export declare const writeRepoDescription: (datasource: DataSource, repoId?: string, description?: string) => Promise<RenderedApplicationState>;
export declare const writeRepoLicenses: (datasource: DataSource, repoId?: string, licensesInput?: Array<{
    key: string;
    value: string;
}>) => Promise<RenderedApplicationState>;
export declare const readRepoLicenses: (datasource: DataSource, repoId?: string) => Promise<Array<{
    key: string;
    value: string;
}>>;
export declare const readRepoDescription: (datasource: DataSource, repoId?: string) => Promise<string[]>;
export declare const getCurrentRepoBranch: (datasource: DataSource, repoId?: string) => Promise<Branch>;
export declare const getRepoBranches: (datasource: DataSource, repoId?: string) => Promise<Branch[]>;
export declare const switchRepoBranch: (datasource: DataSource, repoId?: string, branchName?: string) => Promise<RepoState>;
export declare const readSettings: (datasource: DataSource, repoId?: string) => Promise<import("./repo").RepoSetting>;
export declare const readLastCommit: (datasource: DataSource, repoId?: string) => Promise<CommitData>;
export declare const readRepoCommit: (datasource: DataSource, repoId?: string, sha?: string) => Promise<CommitData>;
export declare const readCurrentHistory: (datasource: DataSource, repoId?: string) => Promise<import("./repo").CommitHistory[]>;
export declare const readBranchHistory: (datasource: DataSource, repoId?: string, branchName?: string) => Promise<import("./repo").CommitHistory[]>;
export declare const readCommitHistory: (datasource: DataSource, repoId?: string, sha?: string) => Promise<import("./repo").CommitHistory[]>;
export declare const readCurrentState: (datasource: DataSource, repoId?: string) => Promise<RenderedApplicationState>;
export declare const readCommitState: (datasource: DataSource, repoId?: string, sha?: string) => Promise<RenderedApplicationState>;
export declare const readBranchState: (datasource: DataSource, repoId?: string, branchName?: string) => Promise<import("./repo").ApplicationKVState>;
export declare const writeRepoCommit: (datasource: DataSource, repoId?: string, message?: string) => Promise<CommitData>;
export declare const checkoutBranch: (datasource: DataSource, repoId?: string, branchName?: string) => Promise<RepoState>;
export declare const checkoutSha: (datasource: DataSource, repoId: string, sha: string | null) => Promise<RepoState>;
export declare const updatePlugins: (datasource: DataSource, repoId: string, plugins: Array<PluginElement>) => Promise<RenderedApplicationState>;
export declare const updatePluginState: (datasource: DataSource, repoId: string, pluginName: string, updatedState: object) => Promise<RenderedApplicationState>;
export declare const mergeCommit: (datasource: DataSource, repoId: string, fromSha: string) => Promise<RenderedApplicationState>;
export declare const updateMergeDirection: (datasource: DataSource, repoId: string, direction: "yours" | "theirs") => Promise<RenderedApplicationState>;
export declare const abortMerge: (datasource: DataSource, repoId: string) => Promise<RenderedApplicationState>;
export declare const resolveMerge: (datasource: DataSource, repoId: string) => Promise<RenderedApplicationState>;
export declare const getMergeConflictDiff: (datasource: DataSource, repoId: string) => Promise<import("./repo").StateDiff>;
export declare const hasMergeConclictDiff: (datasource: DataSource, repoId: string) => Promise<boolean>;
export declare const revertCommit: (datasource: DataSource, repoId: string, reversionSha: string) => Promise<RenderedApplicationState>;
export declare const canAutofxReversion: (datasource: DataSource, repoId: string, reversionSha: string) => Promise<boolean>;
export declare const autofixReversion: (datasource: DataSource, repoId: string, reversionSha: string) => Promise<RenderedApplicationState>;
export declare const cherryPickRevision: (datasource: DataSource, repoId: string, cherryPickedSha: string) => Promise<RenderedApplicationState>;
export declare const canCherryPickRevision: (datasource: DataSource, repoId: string, cherryPickedSha: string) => Promise<boolean>;
export declare const rollbackCommit: (datasource: DataSource, repoId: string) => Promise<RenderedApplicationState>;
