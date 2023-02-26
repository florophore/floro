"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memfs_1 = require("memfs");
const filestructure_1 = require("../src/filestructure");
const plugins_1 = require("../src/plugins");
const repo_1 = require("../src/repo");
const repoapi_1 = require("../src/repoapi");
const fsmocks_1 = require("./helpers/fsmocks");
jest.mock("fs");
jest.mock("fs/promises");
describe("repoapi", () => {
    beforeEach(async () => {
        memfs_1.fs.mkdirSync(filestructure_1.userHome, { recursive: true });
        (0, filestructure_1.buildFloroFilestructure)();
        await (0, fsmocks_1.makeSignedInUser)();
        (0, fsmocks_1.createBlankRepo)("abc");
    });
    afterEach(() => {
        memfs_1.vol.reset();
    });
    describe("repoExists", () => {
        test("returns true when exists", async () => {
            const exist = await (0, repoapi_1.repoExists)("abc");
            expect(exist).toBe(true);
        });
        test("returns false when does not exists", async () => {
            const exist = await (0, repoapi_1.repoExists)("def");
            expect(exist).toBe(false);
        });
    });
    describe("description", () => {
        test("updates repo description", async () => {
            let description = (await (0, repo_1.getRepoState)("abc", repo_1.getCurrentState)).description.join("");
            expect(description).toEqual("");
            description = "Initial description.";
            description = (await (0, repoapi_1.writeRepoDescription)("abc", description)).description.join("");
            expect(description).toEqual("Initial description.");
            description = (await (0, repoapi_1.readCurrentState)("abc")).description.join("");
            expect(description).toEqual("Initial description.");
            description = "Initial description. Updated";
            description = (await (0, repoapi_1.writeRepoDescription)("abc", description)).description.join("");
            expect(description).toEqual("Initial description. Updated");
            description = (await (0, repoapi_1.readCurrentState)("abc")).description.join("");
            expect(description).toEqual("Initial description. Updated");
        });
    });
    describe("licenses", () => {
        test("updates repo licenses", async () => {
            let licenses = await (await (0, repoapi_1.readCurrentState)("abc")).licenses;
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
            licenses = (await (0, repoapi_1.writeRepoLicenses)("abc", licenses)).licenses;
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
            licenses = (await (0, repoapi_1.readCurrentState)("abc")).licenses;
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
            licenses = (await (0, repoapi_1.writeRepoLicenses)("abc", licenses)).licenses;
            expect(licenses).toEqual([
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
            licenses = (await (0, repoapi_1.readCurrentState)("abc")).licenses;
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
                    "A": "1.0.0"
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
                        }
                    }
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            let plugins = [
                {
                    key: "B",
                    value: "0.0.0"
                }
            ];
            const result = await (0, repoapi_1.updatePlugins)("abc", plugins, plugins_1.readPluginManifest);
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
                        }
                    }
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
                        }
                    }
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_1_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                icon: "",
                imports: {
                    "A": "0.0.0"
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
                        }
                    }
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            let plugins = [
                {
                    key: "A",
                    value: "1.0.0"
                },
                {
                    key: "B",
                    value: "0.0.0"
                }
            ];
            const result = await (0, repoapi_1.updatePlugins)("abc", plugins, plugins_1.readPluginManifest);
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
                        }
                    }
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
                    value: "0.0.0"
                },
            ];
            await (0, repoapi_1.updatePlugins)("abc", plugins, plugins_1.readPluginManifest);
            const result = await (0, repoapi_1.updatePluginState)("abc", "A", state, plugins_1.readPluginManifest);
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
            let description = (await (0, repoapi_1.readRepoDescription)("abc")).join("");
            expect(description).toEqual("");
            const descriptionA = "Initial description.";
            await (0, repoapi_1.writeRepoDescription)("abc", descriptionA);
            const commitA = await (0, repoapi_1.writeRepoCommit)("abc", "A");
            const descriptionB = "Another description. Initial description. Description 2!";
            await (0, repoapi_1.writeRepoDescription)("abc", descriptionB);
            const commitB = await (0, repoapi_1.writeRepoCommit)("abc", "B");
            const readCommitA = await (0, repoapi_1.readCommitState)('abc', commitA.sha);
            const readCommitB = await (0, repoapi_1.readCommitState)('abc', commitB.sha);
            expect(descriptionA).toEqual(readCommitA.description.join(""));
            expect(descriptionB).toEqual(readCommitB.description.join(""));
        });
        test("refuses empty commit", async () => {
            let description = (await (0, repoapi_1.readRepoDescription)("abc")).join("");
            expect(description).toEqual("");
            const descriptionA = "Initial description.";
            await (0, repoapi_1.writeRepoDescription)("abc", descriptionA);
            await (0, repoapi_1.writeRepoCommit)("abc", "A");
            const descriptionB = "Initial description.";
            await (0, repoapi_1.writeRepoDescription)("abc", descriptionB);
            const commitB = await (0, repoapi_1.writeRepoCommit)("abc", "B");
            expect(commitB).toEqual(null);
        });
    });
    describe("merge", () => {
        test.only("creates a new commit if can automerge", async () => {
            let description = (await (0, repoapi_1.readRepoDescription)("abc")).join("");
            expect(description).toEqual("");
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
                                }
                            },
                        }
                    }
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const state1 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4
                        },
                    },
                ],
            };
            let plugins = [
                {
                    key: "A",
                    value: "0.0.0"
                },
            ];
            await (0, repoapi_1.updatePlugins)("abc", plugins, plugins_1.readPluginManifest);
            await (0, repoapi_1.updatePluginState)("abc", "A", state1, plugins_1.readPluginManifest);
            await (0, repoapi_1.writeRepoDescription)("abc", "Testing the waters");
            const commitA = await (0, repoapi_1.writeRepoCommit)("abc", "A");
            console.log("CA", commitA);
            const state2 = {
                aSet: [
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1
                        },
                    },
                    {
                        mainKey: "key1a",
                        someProp: {
                            value: 11
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 3
                        },
                    },
                    {
                        mainKey: "key4",
                        someProp: {
                            value: 4
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)("abc", "A", state2, plugins_1.readPluginManifest);
            const commitB = await (0, repoapi_1.writeRepoCommit)("abc", "B");
            await (0, repoapi_1.checkoutSha)("abc", commitA.sha);
            await (0, repoapi_1.switchRepoBranch)("abc", "new-branch");
            const state3 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36
                        },
                    },
                    {
                        mainKey: "key5",
                        someProp: {
                            value: 5
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)("abc", "A", state3, plugins_1.readPluginManifest);
            const commitC = await (0, repoapi_1.writeRepoCommit)("abc", "C");
            const state4 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)("abc", "A", state4, plugins_1.readPluginManifest);
            const commitD = await (0, repoapi_1.writeRepoCommit)("abc", "D");
            const state5 = {
                aSet: [
                    {
                        mainKey: "key0",
                        someProp: {
                            value: 0
                        },
                    },
                    {
                        mainKey: "key1",
                        someProp: {
                            value: 1
                        },
                    },
                    {
                        mainKey: "key2",
                        someProp: {
                            value: 2
                        },
                    },
                    {
                        mainKey: "key3",
                        someProp: {
                            value: 36
                        },
                    },
                    {
                        mainKey: "key7",
                        someProp: {
                            value: 7
                        },
                    },
                ],
            };
            await (0, repoapi_1.updatePluginState)("abc", "A", state5, plugins_1.readPluginManifest);
            console.log("WTF", commitB.sha);
            const out = await (0, repoapi_1.mergeCommit)("abc", commitB.sha, plugins_1.readPluginManifest);
            console.log("OUT", JSON.stringify(out, null, 2));
            //const canAutoMergeWithCS = await canAutoMergeOnTopCurrentState(
            //  "abc",
            //  commitB.sha,
            //  readPluginManifest
            //);
            //const yourMergeState = await getMergedCommitState(
            //  "abc",
            //  commitB.sha,
            //  commitC.sha,
            //  readPluginManifest,
            //  "yours"
            //);
            //const theirMergeState = await getMergedCommitState(
            //  "abc",
            //  commitB.sha,
            //  commitC.sha,
            //  readPluginManifest,
            //  "theirs"
            //);
            //const isAutoMergeable = await canAutoMergeShas(
            //  "abc",
            //  commitB.sha,
            //  commitC.sha,
            //  readPluginManifest
            //);
            //console.log("IS AUTO MERGEABLE", isAutoMergeable)
            //console.log("WTF 0", JSON.stringify(state1, null, 2));
            //console.log("WTF 2", JSON.stringify(state2, null, 2));
            //console.log("WTF 3", JSON.stringify(state3, null, 2));
            //console.log("Y", JSON.stringify(await buildStateStore(yourMergeState, readPluginManifest), null, 2));
            //console.log("T", JSON.stringify(await buildStateStore(theirMergeState, readPluginManifest), null, 2));
        });
    });
});
//# sourceMappingURL=repoapi.test.js.map