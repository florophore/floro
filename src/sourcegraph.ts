import { DataSource } from "./datasource";
import { Branch, CommitHistory } from "./repo";

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

export class SourceGraph {

    private datasource: DataSource;
    private roots: Array<SourceCommitNode> = [];
    private pointers: {[sha: string]: SourceCommitNode} = {};
    private repoId: string;

    constructor(
        datasource: DataSource,
        repoId: string
    ) {
        this.datasource = datasource;
        this.repoId = repoId;
    }

    public async buildGraph() {
        const commits = (await this.datasource.readCommits(this.repoId)).sort(
          (a, b) => {
            return a.idx - b.idx;
          }
        );
        this.roots = commits.filter(v => v.idx == 0);
        for (const rootNode of this.roots) {
            this.pointers[rootNode.sha] = rootNode
        }
        for (const commit of commits) {
            if (commit.idx == 0) {
                continue;
            }
            if (!this.pointers[commit.sha]) {
                this.pointers[commit.sha] = commit;
                this.pointers[commit.parent].children.push(commit);
            }
        }
        const branchesMetaState = await this.datasource.readBranchesMetaState(this.repoId);
        for (let branch of branchesMetaState.allBranches) {
            let node = this.pointers[branch.lastLocalCommit];
            if (!node) {
                continue;
            }
            if (!node?.branchIds) {
                node.branchIds = [];
            }
            node.branchIds.push(branch.branchId);
            node.isInBranchLineage = true;
            for (let i = node.idx -1; i >= 0; i--) {
                if (node.parent) {
                    node = this.pointers[node.parent];
                    node.isInBranchLineage = true;
                }
            }
        }

        for (let branch of branchesMetaState.userBranches) {
            let node = this.pointers[branch.lastLocalCommit];
            if (!node) {
                continue;
            }
            node.isInUserBranchLineage = true;
            for (let i = node.idx -1; i >= 0; i--) {
                if (node.parent) {
                    node = this.pointers[node.parent];
                    node.isInUserBranchLineage = true;
                }
            }
        }
        const currentRepoState = await this.datasource.readCurrentRepoState(this.repoId);
        if (currentRepoState.commit) {
            const currentNode = this.pointers[currentRepoState.commit];
            currentNode.isCurrent = true;
        }
    }

    public getGraph(): Array<SourceCommitNode> {
        return this.roots;
    }

    public getPointers(): {[sha: string]: SourceCommitNode} {
        return this.pointers;
    }

}

export const getTopologicalBranchMap = (
  branches: Array<Branch>
): { [key: string]: string } => {
  return branches.reduce((acc, branch) => {
    return {
      ...acc,
      [branch.id]: branch.baseBranchId,
    };
  }, {});
};

export const getBranchMap = (
  branches: Array<Branch>
): { [key: string]: Branch } => {
  return branches.reduce((acc, branch) => {
    return {
      ...acc,
      [branch.id]: branch,
    };
  }, {});
};

const getBranchTopOrder = (
  branchId: string,
  branchMap: { [key: string]: string },
  out: Array<string> = []
): Array<string> => {
  if (!branchMap?.[branchId]) {
    return out;
  }
  return getBranchTopOrder(branchMap[branchId], branchMap, [
    ...out,
    branchMap[branchId],
  ]);
};

export const getPotentialBaseBranchesForSha = (
  sha: string|undefined|null,
  branches: Array<Branch>,
  pointerMap: { [sha: string]: SourceCommitNode } = {}
): Array<Branch> => {
  if (!sha) {
    return branches.filter?.(b => !b?.lastCommit) ?? [];
  }

  const sourceCommit = pointerMap[sha];
  if (!sourceCommit) {
    return branches.filter?.(b => !b?.lastCommit) ?? [];
  }
  const visitedBranches = new Set<string>([]);
  const branchMap = getBranchMap(branches);
  const topologicalBranchMap = getTopologicalBranchMap(branches);
  const order: Array<string> = [];
  let index = 0;
  for (const branchId of sourceCommit?.branchIds ?? []) {
    const upsteamBranches = [branchId, ...getBranchTopOrder(branchId, topologicalBranchMap)];
    for (let bId of upsteamBranches) {
      if (bId && !visitedBranches.has(bId)) {
        visitedBranches.add(bId);
        order[bId] = index++;
      }
    }
  }
  const out: Array<Branch> = [];
  for (const branchId of order) {
    out.push(branchMap[branchId]);
  }
  return out;
}