import { Manifest } from "./plugins";
import { Branch, RepoSetting, State } from "./repo";
import { CommitData } from "./versioncontrol";
export interface DataSource {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    getRepos?(): Promise<Array<string>>;
    repoExists?(repoId?: string): Promise<boolean>;
    getRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    getCurrentState?: (repoId: string) => Promise<State>;
    saveCurrentState?: (repoId: string, state: State) => Promise<State>;
    getBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    getBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
}
/**
 * We need to export readDevPluginManifest for the daemon server
 * all other methods not in datasource should remain internal to
 * this file.
 */
export declare const readDevPluginManifest: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const downloadPlugin: (pluginName: string, pluginVersion: string) => Promise<Manifest | null>;
export declare const getPluginManifest: (pluginName: string, pluginValue: string) => Promise<Manifest>;
export declare const getRepos: () => Promise<string[]>;
export declare const makeDataSource: (datasource?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    getRepos?: () => Promise<Array<string>>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    getRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    getCurrentState?: (repoId: string) => Promise<State>;
    saveCurrentState?: (repoId: string, state: State) => Promise<State>;
    getBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    getBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
};
export declare const makeMemoizedDataSource: (dataSourceOverride?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    getRepos?: () => Promise<Array<string>>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    getRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    getCurrentState?: (repoId: string) => Promise<State>;
    saveCurrentState?: (repoId: string, state: State) => Promise<State>;
    getBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    getBranches?: (repoId: string) => Promise<Array<Branch>>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
};
declare const _default: {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
    getRepos?: () => Promise<string[]>;
    repoExists?: (repoId?: string) => Promise<boolean>;
    getRepoSettings?: (repoId: string) => Promise<RepoSetting>;
    getCurrentState?: (repoId: string) => Promise<State>;
    saveCurrentState?: (repoId: string, state: State) => Promise<State>;
    getBranch?: (repoId: string, branchName: string) => Promise<Branch>;
    getBranches?: (repoId: string) => Promise<Branch[]>;
    deleteBranch?: (repoId: string, branchName: string) => Promise<boolean>;
    saveBranch?: (repoId: string, branchName: string, branchData: Branch) => Promise<Branch>;
    saveCommit?: (repoId: string, sha: string, commitData: CommitData) => Promise<CommitData>;
    readCommit?: (repoId: string, sha: string) => Promise<CommitData>;
};
export default _default;
