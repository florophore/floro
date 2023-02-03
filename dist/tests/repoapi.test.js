"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memfs_1 = require("memfs");
const filestructure_1 = require("../src/filestructure");
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
            let description = (await (0, repoapi_1.readRepoDescription)("abc")).join("");
            expect(description).toEqual("");
            description = "Initial description.";
            description = (await (0, repoapi_1.writeRepoDescription)("abc", description)).join("");
            expect(description).toEqual("Initial description.");
            description = (await (0, repoapi_1.readRepoDescription)("abc")).join("");
            expect(description).toEqual("Initial description.");
            description = "Initial description. Updated";
            description = (await (0, repoapi_1.writeRepoDescription)("abc", description)).join("");
            expect(description).toEqual("Initial description. Updated");
            description = (await (0, repoapi_1.readRepoDescription)("abc")).join("");
            expect(description).toEqual("Initial description. Updated");
        });
    });
    describe("licenses", () => {
        test("updates repo licenses", async () => {
            let licenses = await (0, repoapi_1.readRepoLicenses)("abc");
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
            licenses = await (0, repoapi_1.writeRepoLicenses)("abc", licenses);
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
            licenses = await (0, repoapi_1.readRepoLicenses)("abc");
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
            licenses = await (0, repoapi_1.writeRepoLicenses)("abc", licenses);
            expect(licenses).toEqual([
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
            licenses = await (0, repoapi_1.readRepoLicenses)("abc");
            expect(licenses).toEqual([
                {
                    key: "mit",
                    value: "MIT License",
                },
            ]);
        });
    });
    describe("update plugins", () => {
        test.only("adds upstream plugins", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "1.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    mainKey: {
                        isKey: true,
                        type: "string",
                    },
                    secondKey: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                icon: "",
                imports: {},
                types: {},
                store: {
                    bnKey: {
                        isKey: true,
                        type: "string",
                    },
                    aRef: {
                        type: "ref<$(A).store.values>",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            let plugins = [
                {
                    key: "B",
                    value: "0.0.0"
                }
            ];
            const result = await (0, repoapi_1.updatePlugins)("abc", plugins);
            console.log(JSON.stringify(result, null, 2));
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
});
//# sourceMappingURL=repoapi.test.js.map