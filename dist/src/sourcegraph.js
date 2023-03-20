"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceGraph = void 0;
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
        for (const rootNode of this.roots) {
            this.pointers[rootNode.sha] = rootNode;
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
            node.branchId = branch.branchId;
            node.isInBranchLineage = true;
            for (let i = node.idx - 1; i >= 0; i--) {
                if (node.parent) {
                    node = this.pointers[node.parent];
                    node.isInBranchLineage = true;
                }
            }
        }
        for (let branch of branchesMetaState.userBranches) {
            let node = this.pointers[branch.lastLocalCommit];
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
}
exports.SourceGraph = SourceGraph;
//# sourceMappingURL=sourcegraph.js.map