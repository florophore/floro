"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTargetBranchId = exports.getPotentialBaseBranchesForSha = exports.getBranchMap = exports.getTopologicalBranchMap = exports.SourceGraph = void 0;
class SourceGraph {
    roots = [];
    pointers = {};
    commits;
    branchesMetaState;
    repoState;
    constructor(commits, branchesMetaState, repoState) {
        this.commits = commits;
        this.branchesMetaState = branchesMetaState;
        this.repoState = repoState;
        this.buildGraph();
    }
    buildGraph() {
        const commits = this.commits.sort((a, b) => {
            return a.idx - b.idx;
        });
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
                for (let i = node.idx - 1; i >= 0; i--) {
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
                for (let i = node.idx - 1; i >= 0; i--) {
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
    getGraph() {
        return this.roots;
    }
    getPointers() {
        return this.pointers;
    }
}
exports.SourceGraph = SourceGraph;
const getTopologicalBranchMap = (branches) => {
    return branches.reduce((acc, branch) => {
        return {
            ...acc,
            [branch.id]: branch.baseBranchId,
        };
    }, {});
};
exports.getTopologicalBranchMap = getTopologicalBranchMap;
const getBranchMap = (branches) => {
    return branches.reduce((acc, branch) => {
        return {
            ...acc,
            [branch.id]: branch,
        };
    }, {});
};
exports.getBranchMap = getBranchMap;
const getBranchTopOrder = (branchId, branchMap, out = []) => {
    if (!branchMap?.[branchId]) {
        return out;
    }
    return getBranchTopOrder(branchMap[branchId], branchMap, [
        ...out,
        branchMap[branchId],
    ]);
};
const getPotentialBaseBranchesForSha = (sha, branches, pointerMap = {}) => {
    if (!sha) {
        return branches.filter?.(b => !b.lastCommit) ?? [];
    }
    let firstCommitWithBranchIds = pointerMap[sha];
    while (firstCommitWithBranchIds?.parent && firstCommitWithBranchIds?.branchIds?.length == 0) {
        firstCommitWithBranchIds = pointerMap[firstCommitWithBranchIds.parent];
    }
    const sourceCommit = pointerMap[firstCommitWithBranchIds?.sha];
    if (!sourceCommit) {
        return branches.filter?.(b => !b.lastCommit) ?? [];
    }
    const visitedBranches = new Set([]);
    const branchMap = (0, exports.getBranchMap)(branches);
    const topologicalBranchMap = (0, exports.getTopologicalBranchMap)(branches);
    const order = {};
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
    const out = [];
    for (let i = 0; i < Object.keys(order).length; ++i) {
        out.push();
    }
    for (const branchId in order) {
        out[order[branchId]] = branchMap[branchId];
    }
    return out;
};
exports.getPotentialBaseBranchesForSha = getPotentialBaseBranchesForSha;
const getTargetBranchId = (branches, branchIds) => {
    const topologicalBranchMap = (0, exports.getTopologicalBranchMap)(branches);
    let longestTopOrder = null;
    let shortestTopOrder = null;
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
exports.getTargetBranchId = getTargetBranchId;
//# sourceMappingURL=sourcegraph.js.map