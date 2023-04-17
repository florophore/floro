"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPotentialBaseBranchesForSha = exports.getBranchMap = exports.getTopologicalBranchMap = exports.SourceGraph = void 0;
class SourceGraph {
    datasource;
    roots = [];
    pointers = {};
    repoId;
    constructor(datasource, repoId) {
        this.datasource = datasource;
        this.repoId = repoId;
    }
    async buildGraph() {
        const commits = (await this.datasource.readCommits(this.repoId)).sort((a, b) => {
            return a.idx - b.idx;
        });
        this.roots = commits.filter(v => v.idx == 0);
        for (const commit of commits) {
            this.pointers[commit.sha] = commit;
        }
        for (const commit of commits) {
            if (commit.idx == 0) {
                continue;
            }
            if (!this.pointers[commit.sha]?.children?.includes(commit)) {
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
            for (let i = node.idx - 1; i >= 0; i--) {
                if (node.parent) {
                    node = this.pointers[node.parent];
                    node.isInBranchLineage = true;
                    node.branchIds.push(branch.branchId);
                }
            }
        }
        for (let branch of branchesMetaState.userBranches) {
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
        const currentRepoState = await this.datasource.readCurrentRepoState(this.repoId);
        if (currentRepoState.commit) {
            const currentNode = this.pointers[currentRepoState.commit];
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
//# sourceMappingURL=sourcegraph.js.map