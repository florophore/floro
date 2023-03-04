import { Manifest } from "./plugins";
import { ApplicationKVState, Branch, RenderedApplicationState, RepoSetting, RepoState } from "./repo";
import { CommitData } from "./versioncontrol";
export interface DataSource {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    readRepos?(): Promise<Array<string>>;
    repoExists?(repoId?: string): Promise<boolean>;
    readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
    saveCurrentRepoState?: (repoId: string, state: RepoState) => Promise<RepoState>;
    readBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    readBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
    readCheckpoint?(repoId: string, sha: string): Promise<ApplicationKVState>;
    saveCheckpoint?(repoId: string, sha: string, commitState: ApplicationKVState): Promise<ApplicationKVState>;
    readHotCheckpoint?(repoId: string): Promise<[string, ApplicationKVState]>;
    saveHotCheckpoint?(repoId: string, sha: string, commitState: ApplicationKVState): Promise<[string, ApplicationKVState]>;
    deleteHotCheckpoint?(repoId: string): Promise<boolean>;
    readRenderedState?(repoId: string): Promise<RenderedApplicationState>;
    saveRenderedState?(repoId: string, commitState: RenderedApplicationState): Promise<RenderedApplicationState>;
    readStash?(repoId: string, sha: string | null): Promise<Array<ApplicationKVState>>;
    saveStash?(repoId: string, sha: string | null, stashState: Array<ApplicationKVState>): Promise<Array<ApplicationKVState>>;
}
/**
 * We need to export readDevPluginManifest for the daemon server
 * all other methods not in datasource should remain internal to
 * this file.
 */
export declare const readDevPluginManifest: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const downloadPlugin: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const getPluginManifest: (pluginName: string, pluginValue: string) => Promise<Manifest>;
export declare const readRepos: () => Promise<string[]>;
export declare const makeDataSource: (datasource?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    readRepos?: () => Promise<Array<string>>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
    saveCurrentRepoState?: (repoId: string, state: RepoState) => Promise<RepoState>;
    readBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    readBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
    readCheckpoint?: (repoId: string, sha: string) => Promise<ApplicationKVState>;
    saveCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<ApplicationKVState>;
    readHotCheckpoint?: (repoId: string) => Promise<[string, ApplicationKVState]>;
    saveHotCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<[string, ApplicationKVState]>;
    deleteHotCheckpoint?: (repoId: string) => Promise<boolean>;
    readRenderedState?: (repoId: string) => Promise<RenderedApplicationState>;
    saveRenderedState?: (repoId: string, commitState: RenderedApplicationState) => Promise<RenderedApplicationState>;
    readStash?: (repoId: string, sha: string | null) => Promise<Array<ApplicationKVState>>;
    saveStash?: (repoId: string, sha: string | null, stashState: Array<ApplicationKVState>) => Promise<Array<ApplicationKVState>>;
};
export declare const makeMemoizedDataSource: (dataSourceOverride?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    readRepos?: () => Promise<Array<string>>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    readRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    readCurrentRepoState?: (repoId: string) => Promise<RepoState>;
    saveCurrentRepoState?: (repoId: string, state: RepoState) => Promise<RepoState>;
    readBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    readBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
    readCheckpoint?: (repoId: string, sha: string) => Promise<ApplicationKVState>;
    saveCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<ApplicationKVState>;
    readHotCheckpoint?: (repoId: string) => Promise<[string, ApplicationKVState]>;
    saveHotCheckpoint?: (repoId: string, sha: string, commitState: ApplicationKVState) => Promise<[string, ApplicationKVState]>;
    deleteHotCheckpoint?: (repoId: string) => Promise<boolean>;
    readRenderedState?: (repoId: string) => Promise<RenderedApplicationState>;
    saveRenderedState?: (repoId: string, commitState: RenderedApplicationState) => Promise<RenderedApplicationState>;
    readStash?: (repoId: string, sha: string | null) => Promise<Array<ApplicationKVState>>;
    saveStash?: (repoId: string, sha: string | null, stashState: Array<ApplicationKVState>) => Promise<Array<ApplicationKVState>>;
};
