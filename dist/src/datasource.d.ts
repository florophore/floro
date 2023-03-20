import { Manifest } from "./plugins";
import { ApplicationKVState, Branch, BranchesMetaState, RenderedApplicationState, RepoSetting, RepoState } from "./repo";
import { CommitData } from "./versioncontrol";
import { SourceCommitNode } from "./sourcegraph";
export interface DataSource {
    getPluginManifest?: (pluginName: string, pluginVersion: string, disableDownloads?: boolean) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    readRepos?(): Promise<Array<string>>;
    repoExists?(repoId?: string): Promise<boolean>;
    readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
    saveCurrentRepoState?: (repoId: string, state: RepoState) => Promise<RepoState>;
    readBranch?: (repoId: string, branchId: string) => Promise<Branch>;
    readBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchId: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchId: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
    readCheckpoint?(repoId: string, sha: string): Promise<ApplicationKVState>;
    readCommits?: (repoId: string) => Promise<Array<SourceCommitNode>>;
    saveCheckpoint?(repoId: string, sha: string, commitState: ApplicationKVState): Promise<ApplicationKVState>;
    readHotCheckpoint?(repoId: string): Promise<[string, ApplicationKVState]>;
    saveHotCheckpoint?(repoId: string, sha: string, commitState: ApplicationKVState): Promise<[string, ApplicationKVState]>;
    deleteHotCheckpoint?(repoId: string): Promise<boolean>;
    readRenderedState?(repoId: string): Promise<RenderedApplicationState>;
    saveRenderedState?(repoId: string, commitState: RenderedApplicationState): Promise<RenderedApplicationState>;
    readStash?(repoId: string, sha: string | null): Promise<Array<ApplicationKVState>>;
    saveStash?(repoId: string, sha: string | null, stashState: Array<ApplicationKVState>): Promise<Array<ApplicationKVState>>;
    readBranchesMetaState?(repoId: string): Promise<BranchesMetaState>;
    saveBranchesMetaState?(repoId: string, branchesMetaState: BranchesMetaState): Promise<BranchesMetaState>;
    checkBinary?(binaryId: string): Promise<boolean>;
}
/**
 * We need to export readDevPluginManifest for the daemon server
 * all other methods not in datasource should remain internal to
 * this file.
 */
export declare const readDevPluginManifest: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const fetchRemoteManifest: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const downloadPlugin: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const getPluginManifest: (pluginName: string, pluginValue: string, disableDownloads?: boolean) => Promise<Manifest>;
export declare const readRepos: () => Promise<string[]>;
export declare const makeDataSource: (datasource?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string, disableDownloads?: boolean) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    readRepos?: () => Promise<Array<string>>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
    saveCurrentRepoState?: (repoId: string, state: RepoState) => Promise<RepoState>;
    readBranch?: (repoId: string, branchId: string) => Promise<Branch>;
    readBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchId: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchId: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
    readCheckpoint?: (repoId: string, sha: string) => Promise<ApplicationKVState>;
    readCommits?: (repoId: string) => Promise<Array<SourceCommitNode>>;
    saveCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<ApplicationKVState>;
    readHotCheckpoint?: (repoId: string) => Promise<[string, ApplicationKVState]>;
    saveHotCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<[string, ApplicationKVState]>;
    deleteHotCheckpoint?: (repoId: string) => Promise<boolean>;
    readRenderedState?: (repoId: string) => Promise<RenderedApplicationState>;
    saveRenderedState?: (repoId: string, commitState: RenderedApplicationState) => Promise<RenderedApplicationState>;
    readStash?: (repoId: string, sha: string | null) => Promise<Array<ApplicationKVState>>;
    saveStash?: (repoId: string, sha: string | null, stashState: Array<ApplicationKVState>) => Promise<Array<ApplicationKVState>>;
    readBranchesMetaState?: (repoId: string) => Promise<BranchesMetaState>;
    saveBranchesMetaState?: (repoId: string, branchesMetaState: BranchesMetaState) => Promise<BranchesMetaState>;
    checkBinary?: (binaryId: string) => Promise<boolean>;
};
export declare const makeMemoizedDataSource: (dataSourceOverride?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string, disableDownloads?: boolean) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    readRepos?: () => Promise<Array<string>>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
    saveCurrentRepoState?: (repoId: string, state: RepoState) => Promise<RepoState>;
    readBranch?: (repoId: string, branchId: string) => Promise<Branch>;
    readBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchId: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchId: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
    readCheckpoint?: (repoId: string, sha: string) => Promise<ApplicationKVState>;
    readCommits?: (repoId: string) => Promise<Array<SourceCommitNode>>;
    saveCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<ApplicationKVState>;
    readHotCheckpoint?: (repoId: string) => Promise<[string, ApplicationKVState]>;
    saveHotCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<[string, ApplicationKVState]>;
    deleteHotCheckpoint?: (repoId: string) => Promise<boolean>;
    readRenderedState?: (repoId: string) => Promise<RenderedApplicationState>;
    saveRenderedState?: (repoId: string, commitState: RenderedApplicationState) => Promise<RenderedApplicationState>;
    readStash?: (repoId: string, sha: string | null) => Promise<Array<ApplicationKVState>>;
    saveStash?: (repoId: string, sha: string | null, stashState: Array<ApplicationKVState>) => Promise<Array<ApplicationKVState>>;
    readBranchesMetaState?: (repoId: string) => Promise<BranchesMetaState>;
    saveBranchesMetaState?: (repoId: string, branchesMetaState: BranchesMetaState) => Promise<BranchesMetaState>;
    checkBinary?: (binaryId: string) => Promise<boolean>;
};
