import { Manifest } from "./plugins";
import { Branch, RepoSetting, State } from "./repo";
import { CommitData } from "./versioncontrol";
export interface DataSource {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
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
export declare const makeDataSource: (datasource?: DataSource) => {
    getPluginManifest?: (pluginName: string, pluginVersion: string) => Promise<Manifest>;
    pluginManifestExists?: (pluginName: string, pluginVersion: string) => Promise<boolean>;
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