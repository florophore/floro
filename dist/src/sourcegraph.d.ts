import { Branch, BranchesMetaState, CommitHistory, RepoState } from "./repo";
export interface SourceCommitNode extends CommitHistory {
    children?: Array<SourceCommitNode>;
    message: string;
    userId: string;
    authorUserId: string;
    timestamp: string;
    isBranchHead?: boolean;
    isInBranchLineage?: boolean;
    isInUserBranchLineage?: boolean;
    isCurrent?: boolean;
    isUserBranch?: boolean;
    branchIds?: Array<string>;
}
export declare class SourceGraph {
    private roots;
    private pointers;
    private commits;
    private branchesMetaState;
    private repoState?;
    constructor(commits: Array<SourceCommitNode>, branchesMetaState: BranchesMetaState, repoState?: RepoState);
    private buildGraph;
    getGraph(): Array<SourceCommitNode>;
    getPointers(): {
        [sha: string]: SourceCommitNode;
    };
}
export declare const getTopologicalBranchMap: (branches: Array<Branch>) => {
    [key: string]: string;
};
export declare const getBranchMap: (branches: Array<Branch>) => {
    [key: string]: Branch;
};
export declare const getPotentialBaseBranchesForSha: (sha: string | undefined | null, branches: Array<Branch>, pointerMap?: {
    [sha: string]: SourceCommitNode;
}) => Array<Branch>;
export declare const getTargetBranchId: (branches: Array<Branch>, branchIds: Array<string>) => string | null;
