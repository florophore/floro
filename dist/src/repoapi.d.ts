import { Branch } from "./repo";
import { CommitData } from "./versioncontrol";
import { PluginElement } from "./plugins";
export declare const repoExists: (repoId?: string) => Promise<boolean>;
export declare const writeRepoDescription: (repoId?: string, description?: string) => Promise<string[]>;
export declare const writeRepoLicenses: (repoId?: string, licensesInput?: Array<{
    key: string;
    value: string;
}>) => Promise<{
    key: string;
    value: string;
}[]>;
export declare const readRepoLicenses: (repoId?: string) => Promise<Array<{
    key: string;
    value: string;
}>>;
export declare const readRepoDescription: (repoId?: string) => Promise<string[]>;
export declare const getCurrentRepoBranch: (repoId?: string) => Promise<Branch>;
export declare const getRepoBranches: (repoId?: string) => Promise<Branch[]>;
export declare const switchRepoBranch: (repoId?: string, branchName?: string) => Promise<import("./repo").State>;
export declare const deleteBranch: (repoId?: string, branchName?: string) => Promise<Branch[]>;
export declare const readSettings: (repoId?: string) => Promise<any>;
export declare const readLastCommit: (repoId?: string) => Promise<CommitData>;
export declare const readRepoCommit: (repoId?: string, sha?: string) => Promise<CommitData>;
export declare const readCurrentHistory: (repoId?: string) => Promise<import("./repo").CommitHistory[]>;
export declare const readBranchHistory: (repoId?: string, branchName?: string) => Promise<import("./repo").CommitHistory[]>;
export declare const readCommitHistory: (repoId?: string, sha?: string) => Promise<import("./repo").CommitHistory[]>;
export declare const readCurrentState: (repoId?: string) => Promise<{
    store: {
        [key: string]: unknown;
    };
    description: string[];
    licenses: {
        key: string;
        value: string;
    }[];
    plugins: {
        key: string;
        value: string;
    }[];
    binaries: {
        key: string;
        value: string;
    }[];
}>;
export declare const readCommitState: (repoId?: string, sha?: string) => Promise<{
    store: {
        [key: string]: unknown;
    };
    description: string[];
    licenses: {
        key: string;
        value: string;
    }[];
    plugins: {
        key: string;
        value: string;
    }[];
    binaries: {
        key: string;
        value: string;
    }[];
}>;
export declare const readBranchState: (repoId?: string, branchName?: string) => Promise<{
    store: {
        [key: string]: unknown;
    };
    description: string[];
    licenses: {
        key: string;
        value: string;
    }[];
    plugins: {
        key: string;
        value: string;
    }[];
    binaries: {
        key: string;
        value: string;
    }[];
}>;
export declare const writeRepoCommit: (repoId?: string, message?: string) => Promise<CommitData>;
export declare const checkoutBranch: (repoId?: string, branchName?: string) => Promise<import("./repo").State>;
export declare const checkoutSha: (repoId?: string, sha?: string) => Promise<import("./repo").State>;
export declare const updatePlugins: (repoId?: string, plugins?: Array<PluginElement>) => Promise<import("./repo").State>;
export declare const updatePluginState: (repoId?: string, pluginName?: string, updateState?: unknown) => Promise<any>;
