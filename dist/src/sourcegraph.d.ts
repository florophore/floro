import { DataSource } from "./datasource";
import { CommitHistory } from "./repo";
export interface SourceCommitNode extends CommitHistory {
    message: string;
    userId: string;
    authorUserId: string;
    timestamp: string;
    isBranchHead?: boolean;
    isInBranchLineage?: boolean;
    isInUserBranchLineage?: boolean;
    isCurrent?: boolean;
    isUserBranch?: boolean;
    branchId?: string;
    children?: Array<SourceCommitNode>;
}
export declare class SourceGraph {
    private datasource;
    private roots;
    private pointers;
    private repoId;
    constructor(datasource: DataSource, repoId: string);
    buildGraph(): Promise<void>;
    getGraph(): Array<SourceCommitNode>;
}
