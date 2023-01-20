"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const memfs_1 = require("memfs");
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("../src/filestructure");
const plugincreator_1 = require("../src/plugincreator");
const fsmocks_1 = require("./helpers/fsmocks");
const pluginmocks_1 = require("./helpers/pluginmocks");
jest.mock("fs");
jest.mock("fs/promises");
describe("plugincreator", () => {
    beforeEach(async () => {
        memfs_1.fs.mkdirSync(filestructure_1.userHome, { recursive: true });
        (0, filestructure_1.buildFloroFilestructure)();
        await (0, fsmocks_1.makeSignedInUser)();
    });
    afterEach(() => {
        memfs_1.vol.reset();
    });
    describe("checkDirectoryIsPluginWorkingDirectory", () => {
        test("returns true when manifest is present", async () => {
            const cwd = (0, fsmocks_1.makePluginCreationDirectory)("simple", pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
            const isPluginPath = await (0, plugincreator_1.checkDirectoryIsPluginWorkingDirectory)(cwd);
            expect(isPluginPath).toBe(true);
        });
        test("returns false when manifest is not present", async () => {
            (0, fsmocks_1.makePluginCreationDirectory)("simple", pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
            const isPluginPath = await (0, plugincreator_1.checkDirectoryIsPluginWorkingDirectory)(filestructure_1.homePath);
            expect(isPluginPath).toBe(false);
        });
    });
    describe("exportPluginToDev", () => {
        test("successfully exports plugin code to dev dir", async () => {
            const cwd = (0, fsmocks_1.makePluginCreationDirectory)("simple", pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
            const created = await (0, plugincreator_1.exportPluginToDev)(cwd);
            expect(created).toEqual(true);
            const indexHTMLDevPath = path_1.default.join(filestructure_1.vDEVPath, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name + "@" + pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version, "index.html");
            const indexHTMLCWDPath = path_1.default.join(cwd, "dist", "index.html");
            const indexHTMLDev = memfs_1.fs.readFileSync(indexHTMLDevPath);
            const indexHTMLCWD = memfs_1.fs.readFileSync(indexHTMLCWDPath);
            expect(indexHTMLDev).toEqual(indexHTMLCWD);
            const indexJSDevPath = path_1.default.join(filestructure_1.vDEVPath, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name + "@" + pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version, "assets", "index.js");
            const indexJSCWDPath = path_1.default.join(cwd, "dist", "assets", "index.js");
            const indexJSDev = memfs_1.fs.readFileSync(indexJSDevPath);
            const indexJSCWD = memfs_1.fs.readFileSync(indexJSCWDPath);
            expect(indexJSDev).toEqual(indexJSCWD);
        });
    });
    describe("tarCreationPlugin", () => {
        test("can tar plugin", async () => {
            const cwd = (0, fsmocks_1.makePluginCreationDirectory)("simple", pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
            const didTar = await (0, plugincreator_1.tarCreationPlugin)(cwd);
            expect(didTar).toBe(true);
            const tarOutPath = path_1.default.join(filestructure_1.vTMPPath, "out", pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name +
                "@" +
                pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version +
                ".tar.gz");
            const files = new Set();
            tar_1.default.t({
                file: tarOutPath,
                sync: true,
                onentry: (entry) => {
                    if (entry.path[entry.path.length - 1] == "/") {
                        files.add(entry.path.substring(0, entry.path.length - 1));
                    }
                    else {
                        files.add(entry.path);
                    }
                },
            });
            const buildPathDir = path_1.default
                .join(filestructure_1.vTMPPath, "build", `${pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name}@${pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version}`)
                .substring(1);
            const buildAssetsPathDir = path_1.default.join(buildPathDir, "assets");
            const buildFloroPathDir = path_1.default.join(buildPathDir, "floro");
            const buildIndexHTMLPathDir = path_1.default.join(buildPathDir, "index.html");
            const buildIndexJSPathDir = path_1.default.join(buildPathDir, "assets", "index.js");
            const buildFloroManifestPathDir = path_1.default.join(buildPathDir, "floro", "floro.manifest.json");
            expect(files.has(buildPathDir)).toEqual(true);
            expect(files.has(buildAssetsPathDir)).toEqual(true);
            expect(files.has(buildFloroPathDir)).toEqual(true);
            expect(files.has(buildFloroPathDir)).toEqual(true);
            expect(files.has(buildIndexHTMLPathDir)).toEqual(true);
            expect(files.has(buildIndexJSPathDir)).toEqual(true);
            expect(files.has(buildFloroManifestPathDir)).toEqual(true);
        });
    });
    describe("getDependenciesForManifest", () => {
        test("fetches local dependencies", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {},
                types: {},
                store: {},
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    A: "0.0.0",
                },
                types: {},
                store: {},
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST, true);
            const PLUGIN_C_MANIFEST = {
                name: "C",
                version: "0.0.0",
                displayName: "C",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    B: "dev@0.0.0",
                },
                types: {},
                store: {},
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_C_MANIFEST, true);
            const bDeps = await (0, plugincreator_1.getDependenciesForManifest)(PLUGIN_B_MANIFEST);
            expect(bDeps.deps).toEqual([PLUGIN_A_MANIFEST]);
            const cDeps = await (0, plugincreator_1.getDependenciesForManifest)(PLUGIN_C_MANIFEST);
            expect(cDeps.deps).toEqual([PLUGIN_B_MANIFEST, PLUGIN_A_MANIFEST]);
        });
        test("discovers cyclic dependency errors", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {},
                types: {},
                store: {
                    someType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    A: "0.0.0",
                },
                types: {},
                store: {
                    bType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            const PLUGIN_A_1_MANIFEST = {
                name: "A",
                version: "1.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    B: "0.0.0",
                },
                types: {},
                store: {
                    someType: {
                        type: "string",
                    },
                    someOtherType: {
                        type: "int",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_1_MANIFEST);
            const PLUGIN_C_MANIFEST = {
                name: "C",
                version: "0.0.0",
                displayName: "C",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    A: "1.0.0",
                    B: "0.0.0",
                },
                types: {},
                store: {
                    cType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_C_MANIFEST);
            const depListResponse = await (0, plugincreator_1.getDependenciesForManifest)(PLUGIN_C_MANIFEST);
            expect(depListResponse).toEqual({
                status: "error",
                reason: "cyclic dependency imports in A",
            });
        });
    });
    describe("version validation", () => {
        test("allows for compatible versions", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {},
                types: {},
                store: {
                    someType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const PLUGIN_A_1_MANIFEST = {
                name: "A",
                version: "1.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    B: "0.0.0",
                },
                types: {},
                store: {
                    someType: {
                        type: "string",
                    },
                    someOtherType: {
                        type: "int",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_1_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {},
                types: {},
                store: {
                    bType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            const PLUGIN_C_MANIFEST = {
                name: "C",
                version: "0.0.0",
                displayName: "C",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    A: "1.0.0",
                    B: "0.0.0",
                },
                types: {},
                store: {
                    cType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_C_MANIFEST);
            const depListResponse = await (0, plugincreator_1.getDependenciesForManifest)(PLUGIN_C_MANIFEST);
            const validationResponse = await (0, plugincreator_1.verifyPluginDependencyCompatability)(depListResponse.deps);
            expect(validationResponse.isValid).toEqual(true);
        });
        test("discovers compatability errors when manifests are incompatabile", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {},
                types: {},
                store: {
                    someType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
            const PLUGIN_A_1_MANIFEST = {
                name: "A",
                version: "1.0.0",
                displayName: "A",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {},
                types: {},
                store: {
                    // omitted someType
                    someOtherType: {
                        type: "int",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_1_MANIFEST);
            const PLUGIN_B_MANIFEST = {
                name: "B",
                version: "0.0.0",
                displayName: "B",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    A: "0.0.0",
                },
                types: {},
                store: {
                    bType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            const PLUGIN_C_MANIFEST = {
                name: "C",
                version: "0.0.0",
                displayName: "C",
                publisher: "@jamiesunderland",
                icon: "",
                imports: {
                    A: "1.0.0",
                    B: "0.0.0",
                },
                types: {},
                store: {
                    cType: {
                        type: "string",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_C_MANIFEST);
            const depListResponse = await (0, plugincreator_1.getDependenciesForManifest)(PLUGIN_C_MANIFEST);
            const validationResponse = await (0, plugincreator_1.verifyPluginDependencyCompatability)(depListResponse.deps);
            expect(validationResponse).toEqual({
                isValid: false,
                status: "error",
                reason: "incompatible",
                pluginName: "A",
                lastVersion: "0.0.0",
                nextVersion: "1.0.0",
            });
        });
    });
});
//# sourceMappingURL=plugincreator.test.js.map