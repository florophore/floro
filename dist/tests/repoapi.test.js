"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memfs_1 = require("memfs");
const datasource_1 = require("../src/datasource");
const filestructure_1 = require("../src/filestructure");
const repo_1 = require("../src/repo");
const repoapi_1 = require("../src/repoapi");
const fsmocks_1 = require("./helpers/fsmocks");
jest.mock("fs");
jest.mock("fs/promises");
describe("repoapi", () => {
    let datasource;
    beforeEach(async () => {
        memfs_1.fs.mkdirSync(filestructure_1.userHome, { recursive: true });
        (0, filestructure_1.buildFloroFilestructure)();
        await (0, fsmocks_1.makeSignedInUser)();
        (0, fsmocks_1.createBlankRepo)("abc");
        datasource = (0, datasource_1.makeMemoizedDataSource)();
    });
    afterEach(() => {
        memfs_1.vol.reset();
    });
    describe("description", () => {
        test("updates repo description", async () => {
            let description = (await (0, repo_1.getApplicationState)(datasource, "abc")).description.join("");
            expect(description).toEqual("");
            description = "Initial description.";
            description = (await (0, repoapi_1.writeRepoDescription)(datasource, "abc", description)).description.join("");
            expect(description).toEqual("Initial description.");
            description = (await (0, repoapi_1.readCurrentState)(datasource, "abc")).description.join("");
            expect(description).toEqual("Initial description.");
            description = "Initial description. Updated";
            description = (await (0, repoapi_1.writeRepoDescription)(datasource, "abc", description)).description.join("");
            expect(description).toEqual("Initial description. Updated");
            description = (await (0, repoapi_1.readCurrentState)(datasource, "abc")).description.join("");
            expect(description).toEqual("Initial description. Updated");
        });
    });
    describe("licenses", () => {
        test("updates repo licenses", async () => {
            let licenses = await (await (0, repoapi_1.readCurrentState)(datasource, "abc")).licenses;
            expect(licenses).toEqual([]);
            licenses = [
                {
                    key: "gnu_general_public_3",
                    value: "GNU General Public License v3.0",
                },
                {
                    key: "mit",
                    value: "MIT License",
                },
            ];
            licenses = (await (0, repoapi_1.writeRepoLicenses)(datasource, "abc", licenses))
                .licenses;
            expect(licenses).toEqual([
                {
                    key: "gnu_general_public_3",
                    value: "GNU General Public License v3.0",
                },
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
            licenses = (await (0, repoapi_1.readCurrentState)(datasource, "abc")).licenses;
            expect(licenses).toEqual([
                {
                    key: "gnu_general_public_3",
                    value: "GNU General Public License v3.0",
                },
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
            licenses = [
                {
                    key: "mit",
                    value: "MIT License",
                },
            ];
            licenses = (await (0, repoapi_1.writeRepoLicenses)(datasource, "abc", licenses))
                .licenses;
            expect(licenses).toEqual([
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
            licenses = (await (0, repoapi_1.readCurrentState)(datasource, "abc")).licenses;
            expect(licenses).toEqual([
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
        });
    });
    describe("update plugins", () => {
        test("adds upstream plugins", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "1.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            secondKey: {
                                type: "string",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                icon: "",
                imports: {
                    A: "1.0.0",
                },
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            bnKey: {
                                isKey: true,
                                type: "string",
                            },
                            aRef: {
                                type: "ref<$(A).store.values>",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            let plugins = [
                {
                    key: "B",
                    value: "0.0.0",
                },
            ];
            const result = await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            expect(result).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "1.0.0",
                    },
                    {
                        key: "B",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {},
                    B: {},
                },
                binaries: [],
            });
        });
        test("reject upstream plugins when schemas are incompatible", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            oldProp: {
                                type: "string",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const PLUGIN_A_1_MANIFEST = {
                name: "A",
                version: "1.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            replacementProp: {
                                type: "int",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_1_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                icon: "",
                imports: {
                    A: "0.0.0",
                },
                types: {},
                store: {
                    bSet: {
                        type: "set",
                        values: {
                            bnKey: {
                                isKey: true,
                                type: "string",
                            },
                            aRef: {
                                type: "ref<$(A).aSet.values>",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            let plugins = [
                {
                    key: "A",
                    value: "1.0.0",
                },
                {
                    key: "B",
                    value: "0.0.0",
                },
            ];
            const result = await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            expect(result).toEqual(null);
        });
    });
    describe("update plugin state", () => {
        test("can update plugin state", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                type: "int",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: 1,
                    },
                    {
                        mainKey: "key2",
                        someProp: 2,
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            const result = await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state);
            expect(result).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key1",
                                someProp: 1,
                            },
                            {
                                mainKey: "key2",
                                someProp: 2,
                            },
                        ],
                    },
                },
                binaries: [],
            });
        });
    });
    describe("commits", () => {
        test("description can commit", async () => {
            let description = (await (0, repoapi_1.readRepoDescription)(datasource, "abc")).join("");
            expect(description).toEqual("");
            const descriptionA = "Initial description.";
            await (0, repoapi_1.writeRepoDescription)(datasource, "abc", descriptionA);
            const commitA = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const descriptionB = "Another description. Initial description. Description 2!";
            await (0, repoapi_1.writeRepoDescription)(datasource, "abc", descriptionB);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            const readCommitA = await (0, repoapi_1.readCommitState)(datasource, "abc", commitA.sha);
            const readCommitB = await (0, repoapi_1.readCommitState)(datasource, "abc", commitB.sha);
            expect(descriptionA).toEqual(readCommitA.description.join(""));
            expect(descriptionB).toEqual(readCommitB.description.join(""));
        });
        test("refuses empty commit", async () => {
            let description = (await (0, repoapi_1.readRepoDescription)(datasource, "abc")).join("");
            expect(description).toEqual("");
            const descriptionA = "Initial description.";
            await (0, repoapi_1.writeRepoDescription)(datasource, "abc", descriptionA);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const descriptionB = "Initial description.";
            await (0, repoapi_1.writeRepoDescription)(datasource, "abc", descriptionB);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            expect(commitB).toEqual(null);
        });
    });
    describe("merge", () => {
        test("creates a new commit if can automerge", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                value: {
                                    type: "int",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state1);
            const commitA = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state2);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            await (0, repoapi_1.checkoutSha)(datasource, "abc", commitA.sha);
            await (0, repoapi_1.switchRepoBranch)(datasource, "abc", "feature-branch");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state3);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "C");
            const state4 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state4);
            const commitD = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "D");
            const state5 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36,
                        },
                    },
                    {
                        mainKey: "key7",
                        someProp: {
                            value: 7,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state5);
            const mergeStateOut = await (0, repoapi_1.mergeCommit)(datasource, "abc", commitB.sha);
            const mergeSha = await (0, repo_1.getCurrentCommitSha)(datasource, "abc");
            const commitE = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "E");
            const eState = await (0, repo_1.getCommitState)(datasource, "abc", commitE.sha);
            const eStateRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, eState);
            await (0, repoapi_1.switchRepoBranch)(datasource, "abc", "main");
            const mainMergeOut = await (0, repoapi_1.mergeCommit)(datasource, "abc", mergeSha);
            const mainMergedSha = await (0, repo_1.getCurrentCommitSha)(datasource, "abc");
            expect(eStateRendered).toEqual(mergeStateOut);
            const mainMergeState = await (0, repo_1.getCommitState)(datasource, "abc", mainMergedSha);
            const mainMergeRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, mainMergeState);
            expect(mainMergeOut).toEqual(mainMergeRendered);
        });
        test("creates a conflict if cant automerge and aborts", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                value: {
                                    type: "int",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state1);
            const commitA = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state2);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            await (0, repoapi_1.checkoutSha)(datasource, "abc", commitA.sha);
            await (0, repoapi_1.switchRepoBranch)(datasource, "abc", "feature-branch");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 12,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state3);
            const commitC = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "C");
            const originalStateOut = await (0, repoapi_1.mergeCommit)(datasource, "abc", commitB.sha);
            const theirStateOut = await (0, repoapi_1.updateMergeDirection)(datasource, "abc", "theirs");
            const yourStateOut = await (0, repoapi_1.updateMergeDirection)(datasource, "abc", "yours");
            expect(originalStateOut).toEqual(yourStateOut);
            expect(yourStateOut).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key0",
                                someProp: {
                                    value: 0,
                                },
                            },
                            {
                                mainKey: "key1",
                                someProp: {
                                    value: 1,
                                },
                            },
                            {
                                mainKey: "key1a",
                                someProp: {
                                    value: 12,
                                },
                            },
                            {
                                mainKey: "key3",
                                someProp: {
                                    value: 3,
                                },
                            },
                            {
                                mainKey: "key4",
                                someProp: {
                                    value: 4,
                                },
                            },
                            {
                                mainKey: "key5",
                                someProp: {
                                    value: 5,
                                },
                            },
                        ],
                    },
                },
                binaries: [],
            });
            expect(theirStateOut).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key0",
                                someProp: {
                                    value: 0,
                                },
                            },
                            {
                                mainKey: "key1",
                                someProp: {
                                    value: 1,
                                },
                            },
                            {
                                mainKey: "key1a",
                                someProp: {
                                    value: 11,
                                },
                            },
                            {
                                mainKey: "key3",
                                someProp: {
                                    value: 3,
                                },
                            },
                            {
                                mainKey: "key4",
                                someProp: {
                                    value: 4,
                                },
                            },
                            {
                                mainKey: "key5",
                                someProp: {
                                    value: 5,
                                },
                            },
                        ],
                    },
                },
                binaries: [],
            });
            const abortedMerge = await (0, repoapi_1.abortMerge)(datasource, "abc");
            const cState = await (0, repo_1.getCommitState)(datasource, "abc", commitC.sha);
            const cStateRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, cState);
            expect(cStateRendered).toEqual(abortedMerge);
        });
        test("creates a conflict and can resolve", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                value: {
                                    type: "int",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state1);
            const commitA = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state2);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            await (0, repoapi_1.checkoutSha)(datasource, "abc", commitA.sha);
            await (0, repoapi_1.switchRepoBranch)(datasource, "abc", "feature-branch");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 12,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state3);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "C");
            await (0, repoapi_1.mergeCommit)(datasource, "abc", commitB.sha);
            await (0, repoapi_1.updateMergeDirection)(datasource, "abc", "theirs");
            const resolvedOut = await (0, repoapi_1.resolveMerge)(datasource, "abc");
            expect(resolvedOut).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key0",
                                someProp: {
                                    value: 0,
                                },
                            },
                            {
                                mainKey: "key1",
                                someProp: {
                                    value: 1,
                                },
                            },
                            {
                                mainKey: "key1a",
                                someProp: {
                                    value: 11,
                                },
                            },
                            {
                                mainKey: "key3",
                                someProp: {
                                    value: 3,
                                },
                            },
                            {
                                mainKey: "key4",
                                someProp: {
                                    value: 4,
                                },
                            },
                            {
                                mainKey: "key5",
                                someProp: {
                                    value: 5,
                                },
                            },
                        ],
                    },
                },
                binaries: [],
            });
        });
    });
    describe("reversion", () => {
        test("can revert past changes", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                value: {
                                    type: "int",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state1);
            const commitA = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const aCommitState = await (0, repo_1.getCommitState)(datasource, "abc", commitA.sha);
            const aStateRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, aCommitState);
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state2);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state3);
            const commitC = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "C");
            const cCommitState = await (0, repo_1.getCommitState)(datasource, "abc", commitC.sha);
            const cStateRendered = await (0, repo_1.convertCommitStateToRenderedState)(datasource, cCommitState);
            expect(await (0, repo_1.getApplicationState)(datasource, "abc")).toEqual(cStateRendered);
            const reversionState = await (0, repoapi_1.revertCommit)(datasource, "abc", commitB.sha);
            expect(reversionState).toEqual(aStateRendered);
        });
    });
    describe("autofix", () => {
        test("auto fixes reversion when it can", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                value: {
                                    type: "int",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state1);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state2);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state3);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "C");
            const autoReversionState = await (0, repoapi_1.autofixReversion)(datasource, "abc", commitB.sha);
            expect(autoReversionState).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key0",
                                someProp: {
                                    value: 0,
                                },
                            },
                            {
                                mainKey: "key1",
                                someProp: {
                                    value: 1,
                                },
                            },
                            {
                                mainKey: "key2",
                                someProp: {
                                    value: 2,
                                },
                            },
                            {
                                mainKey: "key3",
                                someProp: {
                                    value: 36,
                                },
                            },
                            {
                                mainKey: "key5",
                                someProp: {
                                    value: 5,
                                },
                            },
                        ],
                    },
                },
                binaries: [],
            });
            expect(autoReversionState).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key0",
                                someProp: {
                                    value: 0,
                                },
                            },
                            {
                                mainKey: "key1",
                                someProp: {
                                    value: 1,
                                },
                            },
                            {
                                mainKey: "key2",
                                someProp: {
                                    value: 2,
                                },
                            },
                            {
                                mainKey: "key3",
                                someProp: {
                                    value: 36,
                                },
                            },
                            {
                                mainKey: "key5",
                                someProp: {
                                    value: 5,
                                },
                            },
                        ],
                    },
                },
                binaries: [],
            });
        });
    });
    describe("cherrypick", () => {
        test("auto fixes reversion when it can", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aSet: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            someProp: {
                                value: {
                                    type: "int",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0",
                },
            ];
            await (0, repoapi_1.updatePlugins)(datasource, "abc", plugins);
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state1);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "A");
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                    {
                        mainKey: "key6",
                        someProp: {
                            value: 6,
                        },
                    },
                    {
                        mainKey: "key7",
                        someProp: {
                            value: 7,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state2);
            const commitB = await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "B");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state3);
            await (0, repoapi_1.writeRepoCommit)(datasource, "abc", "C");
            const state4 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0,
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1,
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3,
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4,
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5,
                        },
                    },
                    {
                        mainKey: "key6",
                        someProp: {
                            value: 6,
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)(datasource, "abc", "A", state4);
            const cherryPickedState = await (0, repoapi_1.cherryPickRevision)(datasource, "abc", commitB.sha);
            expect(cherryPickedState).toEqual({
                description: [],
                licenses: [],
                plugins: [
                    {
                        key: "A",
                        value: "0.0.0",
                    },
                ],
                store: {
                    A: {
                        aSet: [
                            {
                                mainKey: "key0",
                                someProp: {
                                    value: 0,
                                },
                            },
                            {
                                mainKey: "key1",
                                someProp: {
                                    value: 1,
                                },
                            },
                            {
                                mainKey: "key2",
                                someProp: {
                                    value: 2,
                                },
                            },
                            {
                                mainKey: "key4",
                                someProp: {
                                    value: 4,
                                },
                            },
                            {
                                mainKey: "key5",
                                someProp: {
                                    value: 5,
                                },
                            },
                            {
                                mainKey: "key6",
                                someProp: {
                                    value: 6,
                                },
                            },
                            {
                                mainKey: "key7",
                                someProp: {
                                    value: 7,
                                },
                            },
                        ],
                    },
                },
                binaries: [],
            });
        });
    });
});
//# sourceMappingURL=repoapi.test.js.map