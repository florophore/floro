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

export class SourceGraph {

    private roots: Array<SourceCommitNode> = [];
    private pointers: {[sha: string]: SourceCommitNode} = {};
    private commits: Array<SourceCommitNode>;
    private branchesMetaState: BranchesMetaState;
    private repoState?: RepoState;

    constructor(
        commits: Array<SourceCommitNode>,
        branchesMetaState: BranchesMetaState,
        repoState?: RepoState,
    ) {
        this.commits = commits;
        this.branchesMetaState = branchesMetaState;
        this.repoState = repoState;
        this.buildGraph();
    }

    private buildGraph() {
        const commits = this.commits.sort(
          (a, b) => {
            return a.idx - b.idx;
          }
        );
        this.roots = commits.filter(v => v.idx == 0);
        for (const commit of commits) {
            if (commit.sha) {
                this.pointers[commit.sha] = commit;
            }
        }
        for (const commit of commits) {
            if (commit.idx == 0) {
                continue;
            }

            if (commit.sha && commit.parent) {
                if (!this.pointers[commit.sha]?.children?.includes(commit)) {
                    this.pointers?.[commit.parent]?.children?.push(commit);
                }
            }
        }
        for (const branch of this.branchesMetaState.allBranches) {
            if (branch.lastLocalCommit) {

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
                        node.branchIds?.push(branch.branchId);
                    }
                }
            }
        }

        for (const branch of this.branchesMetaState.userBranches) {
            if (branch.lastLocalCommit) {
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
        }
        if (this?.repoState?.commit) {
            const currentNode = this.pointers[this.repoState.commit];
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
    return branches.filter?.(b => !b.lastCommit) ?? [];
  }
  let firstCommitWithBranchIds = pointerMap[sha];
  while(firstCommitWithBranchIds?.parent && firstCommitWithBranchIds?.branchIds?.length == 0) {
    firstCommitWithBranchIds = pointerMap[firstCommitWithBranchIds.parent];
  }

  const sourceCommit = pointerMap[firstCommitWithBranchIds?.sha as string];
  if (!sourceCommit) {
    return branches.filter?.(b => !b.lastCommit) ?? [];
  }
  const visitedBranches = new Set<string>([]);
  const branchMap = getBranchMap(branches);
  const topologicalBranchMap = getTopologicalBranchMap(branches);
  const order: {[key: string]: number} = {};
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
  for (let i = 0; i < Object.keys(order).length; ++i) {
    out.push();
  }
  for (const branchId in order) {
    out[order[branchId]] = branchMap[branchId];
  }
  return out;
}

export const getTargetBranchId = (
  branches: Array<Branch>,
  branchIds: Array<string>
): string | null => {
  const topologicalBranchMap = getTopologicalBranchMap(branches);
  let longestTopOrder: [string, number] | null = null;
  let shortestTopOrder: [string, number] | null = null;
  for (const branchId of branchIds) {
    const topOrder = getBranchTopOrder(branchId, topologicalBranchMap);
    if (!longestTopOrder || !shortestTopOrder) {
      longestTopOrder = [branchId, topOrder.length];
      shortestTopOrder = [branchId, topOrder.length];
      continue;
    }
    if (topOrder.length > longestTopOrder[1]) {
      longestTopOrder = [branchId, topOrder.length];
      continue;
    }
    if (topOrder.length < shortestTopOrder[1]) {
      shortestTopOrder = [branchId, topOrder.length];
      continue;
    }
  }
  if (!longestTopOrder || !shortestTopOrder) {
    return null;
  }
  if (longestTopOrder[1] == shortestTopOrder[1]) {
    return null;
  }
  return shortestTopOrder[0];
};