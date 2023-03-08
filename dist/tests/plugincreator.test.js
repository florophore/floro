"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const memfs_1 = require("memfs");
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("../src/filestructure");
const plugincreator_1 = require("../src/plugincreator");
const plugins_1 = require("../src/plugins");
const fsmocks_1 = require("./helpers/fsmocks");
const pluginmocks_1 = require("./helpers/pluginmocks");
const datasource_1 = require("../src/datasource");
const realFS = jest.requireActual("fs");
const SNAPSHOT_1_WITH_REACT = realFS.readFileSync(path_1.default.join(__dirname, "snapshots", "codegen.1.with_react.snapshot"), "utf-8");
jest.mock("fs");
jest.mock("fs/promises");
describe("plugincreator", () => {
    let datasource;
    beforeEach(async () => {
        memfs_1.fs.mkdirSync(filestructure_1.userHome, { recursive: true });
        (0, filestructure_1.buildFloroFilestructure)();
        await (0, fsmocks_1.makeSignedInUser)();
        datasource = (0, datasource_1.makeMemoizedDataSource)();
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
            const indexHTMLDevPath = path_1.default.join(filestructure_1.vDEVPath, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version, "index.html");
            const indexHTMLCWDPath = path_1.default.join(cwd, "dist", "index.html");
            const indexHTMLDev = memfs_1.fs.readFileSync(indexHTMLDevPath);
            const indexHTMLCWD = memfs_1.fs.readFileSync(indexHTMLCWDPath);
            expect(indexHTMLDev).toEqual(indexHTMLCWD);
            const indexJSDevPath = path_1.default.join(filestructure_1.vDEVPath, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version, "assets", "index.js");
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
            const tarOutPath = path_1.default.join(filestructure_1.vTMPPath, "out", pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name +
                "@" +
                pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.version +
                ".tar.gz");
            expect(didTar).toBe(tarOutPath);
            const files = [];
            tar_1.default.t({
                file: tarOutPath,
                sync: true,
                onentry: (entry) => {
                    if (entry.path[entry.path.length - 1] == "/") {
                        files.push(entry.path.substring(0, entry.path.length - 1));
                    }
                    else {
                        files.push(entry.path);
                    }
                },
            });
            expect(files.includes("floro")).toEqual(true);
            expect(files.includes("assets")).toEqual(true);
            expect(files.includes("index.html")).toEqual(true);
            expect(files.includes("assets/index.js")).toEqual(true);
            expect(files.includes("floro/floro.manifest.json")).toEqual(true);
        });
    });
    describe("getDependenciesForManifest", () => {
        test("fetches local dependencies", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
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
                icon: "",
                imports: {
                    B: "dev@0.0.0",
                },
                types: {},
                store: {},
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_C_MANIFEST, true);
            const bDeps = await (0, plugins_1.getDependenciesForManifest)(datasource, PLUGIN_B_MANIFEST);
            expect(bDeps.deps).toEqual([PLUGIN_A_MANIFEST]);
            const cDeps = await (0, plugins_1.getDependenciesForManifest)(datasource, PLUGIN_C_MANIFEST);
            expect(cDeps.deps).toEqual([PLUGIN_B_MANIFEST, PLUGIN_A_MANIFEST]);
        });
        test("discovers cyclic dependency errors", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
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
            const depListResponse = await (0, plugins_1.getDependenciesForManifest)(datasource, PLUGIN_C_MANIFEST);
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
            const depListResponse = await (0, plugins_1.getDependenciesForManifest)(datasource, PLUGIN_C_MANIFEST);
            const validationResponse = await (0, plugins_1.verifyPluginDependencyCompatability)(datasource, depListResponse.deps);
            expect(validationResponse.isValid).toEqual(true);
        });
        test("discovers compatability errors when manifests are incompatabile", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
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
            const depListResponse = await (0, plugins_1.getDependenciesForManifest)(datasource, PLUGIN_C_MANIFEST);
            const validationResponse = await (0, plugins_1.verifyPluginDependencyCompatability)(datasource, depListResponse.deps);
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
    describe("get schema map for creation plugin", () => {
        test("returns max versions when compatable", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
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
            const depListResponse = await (0, plugincreator_1.getSchemaMapForCreationManifest)(datasource, PLUGIN_C_MANIFEST);
            expect(depListResponse).toEqual({
                A: PLUGIN_A_1_MANIFEST,
                B: PLUGIN_B_MANIFEST,
                C: PLUGIN_C_MANIFEST,
            });
        });
    });
    describe("validate schema", () => {
        test("refuses validation on an invalid schema", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {
                    SubSetObj: {
                        key: {
                            isKey: true,
                            type: "string",
                        },
                        nested: {
                            thing: "string",
                        },
                    },
                },
                store: {
                    a: {
                        objSet: {
                            type: "set",
                            values: {
                                id: {
                                    isKey: true,
                                    type: "string",
                                },
                                subSet: {
                                    type: "set",
                                    values: "SubSetObj",
                                },
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "thing in \n" +
                    "{\n" +
                    '  "thing": "string"\n' +
                    "}\n" +
                    ' canot be a string value, found "string". Perhaps try changing to type \n' +
                    "{\n" +
                    '  "thing": {\n' +
                    '    "type": "string"\n' +
                    "  }\n" +
                    "}",
            });
        });
        test("validates a valid schema", async () => {
            const PLUGIN_A_0_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {
                    typeA: {
                        aKey: {
                            type: "string",
                            isKey: true,
                        },
                    },
                },
                store: {
                    aObjects: {
                        type: "set",
                        values: "typeA",
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_0_MANIFEST);
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
                    bObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                type: "string",
                                isKey: true,
                            },
                            aRef: {
                                type: "ref<A.typeA>",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_B_MANIFEST);
            expect(result).toEqual({ status: "ok" });
        });
        test("throws multi key exception on sets", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                            secondKey: {
                                isKey: true,
                                type: "string",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Sets cannot contain multiple key types. Multiple key types found at '$(A).aObjects.values'.",
            });
        });
        test("throws no key exception on sets", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aObjects: {
                        type: "set",
                        values: {
                            mainKey: {
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
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Sets must contain one (and only one) key type. No key type found at '$(A).aObjects.values'.",
            });
        });
        test("throws no nested sets exception on arrays", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aArray: {
                        type: "array",
                        values: {
                            aObjects: {
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
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Arrays cannot contain keyed set descendents. Found at '$(A).aArray.values'.",
            });
        });
        test("throws no keyed values exception on arrays", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aArray: {
                        type: "array",
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
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Arrays cannot contain keyed values. Found at '$(A).aArray.values'.",
            });
        });
        test("throws no keys on non-sets exception", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
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
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Only sets may contain key types. Invalid key type found at '$(A)'.",
            });
        });
        test("throws keys cannot be nullable if key is marked nullable ", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                                nullable: true,
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Invalid key 'mainKey'. Key types cannot be nullable. Found at '$(A).aObjects.mainKey'.",
            });
        });
        test("throws ref keys cannot be nullify onDelete ", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "ref<$(A).aSetObjects.values>",
                                onDelete: "nullify",
                            },
                        },
                    },
                    aSetObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "string",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Invalid key 'mainKey'. Key types that are refs cannot have a cascaded onDelete values of nullify. Found at '$(A).aObjects.mainKey'.",
            });
        });
        test("throws constrained ref keys cannot be self referential", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                isKey: true,
                                type: "ref<$(A).aObjects.values>",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Invalid reference pointer '$(A).aObjects.values'. Keys that are constrained ref types cannot be schematically self-referential. Found at '$(A).aObjects.mainKey'."
            });
        });
        test("throws no invalid property type when prop type isn't supported", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {},
                store: {
                    aObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                type: "string",
                                isKey: true,
                            },
                        },
                        nullable: true,
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_A_MANIFEST);
            const result = await (0, plugins_1.validatePluginManifest)(datasource, PLUGIN_A_MANIFEST);
            expect(result).toEqual({
                status: "error",
                message: "Invalid prop in schema. Remove or change 'nullable=true' from '$(A).aObjects'. Found at '$(A).aObjects.nullable'.",
            });
        });
    });
    describe("codegen", () => {
        test("generates react snapshot", async () => {
            const PLUGIN_A_MANIFEST = {
                name: "A",
                version: "0.0.0",
                displayName: "A",
                icon: "",
                imports: {},
                types: {
                    subA: {
                        someRef: {
                            type: "ref<typeA>",
                        },
                    },
                    typeA: {
                        aKey: {
                            type: "int",
                            isKey: true,
                        },
                        something: {
                            type: "subA",
                        },
                        nestedValue: {
                            nestedSet: {
                                type: "set",
                                values: {
                                    nestedSetKey: {
                                        type: "ref<typeA>",
                                        isKey: true,
                                        onDelete: "nullify",
                                    },
                                },
                            },
                        },
                    },
                },
                store: {
                    aObjects: {
                        type: "set",
                        values: "typeA",
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
                    A: "0.0.0",
                },
                types: {},
                store: {
                    bObjects: {
                        type: "set",
                        values: {
                            mainKey: {
                                type: "string",
                                isKey: true,
                            },
                            attachedFile: {
                                type: "file"
                            },
                            aRef: {
                                type: "ref<A.typeA>",
                            },
                            aConstrainedRef: {
                                type: "ref<$(A).aObjects.values.nestedValue.nestedSet.values>",
                            },
                        },
                    },
                },
            };
            (0, fsmocks_1.makeTestPlugin)(PLUGIN_B_MANIFEST);
            const code = await (0, plugincreator_1.generateTypeScriptAPI)(datasource, PLUGIN_B_MANIFEST, true);
            expect(code).toEqual(SNAPSHOT_1_WITH_REACT);
        });
    });
});
//# sourceMappingURL=plugincreator.test.js.map