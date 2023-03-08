import path from "path";
import { fs, vol } from "memfs";
import tar from "tar";
import {
  buildFloroFilestructure,
  homePath,
  userHome,
  vDEVPath,
  vTMPPath,
} from "../src/filestructure";
import {
  checkDirectoryIsPluginWorkingDirectory,
  exportPluginToDev,
  getSchemaMapForCreationManifest,
  tarCreationPlugin,
  generateTypeScriptAPI,
} from "../src/plugincreator";
import {
  Manifest,
  /** MOVE */
  validatePluginManifest,
  verifyPluginDependencyCompatability,
  getDependenciesForManifest
} from "../src/plugins";
import {
  makePluginCreationDirectory,
  makeSignedInUser,
  makeTestPlugin,
} from "./helpers/fsmocks";
import { SIMPLE_PLUGIN_MANIFEST } from "./helpers/pluginmocks";
import { DataSource, makeMemoizedDataSource } from "../src/datasource";

const realFS = jest.requireActual("fs");
const SNAPSHOT_1_WITH_REACT = realFS.readFileSync(
  path.join(__dirname, "snapshots", "codegen.1.with_react.snapshot"),
  "utf-8"
);

jest.mock("fs");
jest.mock("fs/promises");

describe("plugincreator", () => {
  let datasource: DataSource;
  beforeEach(async () => {
    fs.mkdirSync(userHome, { recursive: true });
    buildFloroFilestructure();
    await makeSignedInUser();
    datasource = makeMemoizedDataSource();
  });

  afterEach(() => {
    vol.reset();
  });

  describe("checkDirectoryIsPluginWorkingDirectory", () => {
    test("returns true when manifest is present", async () => {
      const cwd = makePluginCreationDirectory("simple", SIMPLE_PLUGIN_MANIFEST);
      const isPluginPath = await checkDirectoryIsPluginWorkingDirectory(cwd);
      expect(isPluginPath).toBe(true);
    });
    test("returns false when manifest is not present", async () => {
      makePluginCreationDirectory("simple", SIMPLE_PLUGIN_MANIFEST);
      const isPluginPath = await checkDirectoryIsPluginWorkingDirectory(
        homePath
      );
      expect(isPluginPath).toBe(false);
    });
  });

  describe("exportPluginToDev", () => {
    test("successfully exports plugin code to dev dir", async () => {
      const cwd = makePluginCreationDirectory("simple", SIMPLE_PLUGIN_MANIFEST);
      const created = await exportPluginToDev(cwd);
      expect(created).toEqual(true);
      const indexHTMLDevPath = path.join(
        vDEVPath,
        SIMPLE_PLUGIN_MANIFEST.name,
        SIMPLE_PLUGIN_MANIFEST.version,
        "index.html"
      );
      const indexHTMLCWDPath = path.join(cwd, "dist", "index.html");
      const indexHTMLDev = fs.readFileSync(indexHTMLDevPath);
      const indexHTMLCWD = fs.readFileSync(indexHTMLCWDPath);
      expect(indexHTMLDev).toEqual(indexHTMLCWD);
      const indexJSDevPath = path.join(
        vDEVPath,
        SIMPLE_PLUGIN_MANIFEST.name,
        SIMPLE_PLUGIN_MANIFEST.version,
        "assets",
        "index.js"
      );
      const indexJSCWDPath = path.join(cwd, "dist", "assets", "index.js");
      const indexJSDev = fs.readFileSync(indexJSDevPath);
      const indexJSCWD = fs.readFileSync(indexJSCWDPath);
      expect(indexJSDev).toEqual(indexJSCWD);
    });
  });

  describe("tarCreationPlugin", () => {
    test("can tar plugin", async () => {
      const cwd = makePluginCreationDirectory("simple", SIMPLE_PLUGIN_MANIFEST);
      const didTar = await tarCreationPlugin(cwd);

      const tarOutPath = path.join(
        vTMPPath,
        "out",
        SIMPLE_PLUGIN_MANIFEST.name +
          "@" +
          SIMPLE_PLUGIN_MANIFEST.version +
          ".tar.gz"
      );
      expect(didTar).toBe(tarOutPath);
      const files = [];

      tar.t({
        file: tarOutPath,
        sync: true,
        onentry: (entry) => {
          if (entry.path[entry.path.length - 1] == "/") {
            files.push(entry.path.substring(0, entry.path.length - 1));
          } else {
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
      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {},
      };

      makeTestPlugin(PLUGIN_A_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST, true);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST, true);
      const bDeps = await getDependenciesForManifest(
        datasource,
        PLUGIN_B_MANIFEST
      );
      expect(bDeps.deps).toEqual([PLUGIN_A_MANIFEST]);
      const cDeps = await getDependenciesForManifest(
        datasource,
        PLUGIN_C_MANIFEST,
      );
      expect(cDeps.deps).toEqual([PLUGIN_B_MANIFEST, PLUGIN_A_MANIFEST]);
    });

    test("discovers cyclic dependency errors", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getDependenciesForManifest(
        datasource,
        PLUGIN_C_MANIFEST
      );
      expect(depListResponse).toEqual({
        status: "error",
        reason: "cyclic dependency imports in A",
      });
    });
  });

  describe("version validation", () => {
    test("allows for compatible versions", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getDependenciesForManifest(
        datasource,
        PLUGIN_C_MANIFEST
      );
      const validationResponse = await verifyPluginDependencyCompatability(
        datasource,
        depListResponse.deps
      );
      expect(validationResponse.isValid).toEqual(true);
    });

    test("discovers compatability errors when manifests are incompatabile", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getDependenciesForManifest(
        datasource,
        PLUGIN_C_MANIFEST
      );
      const validationResponse = await verifyPluginDependencyCompatability(
        datasource,
        depListResponse.deps
      );
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
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getSchemaMapForCreationManifest(
        datasource,
        PLUGIN_C_MANIFEST
      );
      expect(depListResponse).toEqual({
        A: PLUGIN_A_1_MANIFEST,
        B: PLUGIN_B_MANIFEST,
        C: PLUGIN_C_MANIFEST,
      });
    });
  });

  describe("validate schema", () => {
    test("refuses validation on an invalid schema", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
              thing: "string" as any,
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

      makeTestPlugin(PLUGIN_A_MANIFEST);

      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "thing in \n" +
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
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const result = await validatePluginManifest(
        datasource,
        PLUGIN_B_MANIFEST
      );
      expect(result).toEqual({ status: "ok" });
    });

    test("throws multi key exception on sets", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Sets cannot contain multiple key types. Multiple key types found at '$(A).aObjects.values'.",
      });
    });

    test("throws no key exception on sets", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Sets must contain one (and only one) key type. No key type found at '$(A).aObjects.values'.",
      });
    });

    test("throws no nested sets exception on arrays", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Arrays cannot contain keyed set descendents. Found at '$(A).aArray.values'.",
      });
    });

    test("throws no keyed values exception on arrays", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message: "Arrays cannot contain keyed values. Found at '$(A).aArray.values'.",
      });
    });

    test("throws no keys on non-sets exception", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Only sets may contain key types. Invalid key type found at '$(A)'.",
      });
    });

    test("throws keys cannot be nullable if key is marked nullable ", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Invalid key 'mainKey'. Key types cannot be nullable. Found at '$(A).aObjects.mainKey'.",
      });
    });

    test("throws ref keys cannot be nullify onDelete ", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Invalid key 'mainKey'. Key types that are refs cannot have a cascaded onDelete values of nullify. Found at '$(A).aObjects.mainKey'.",
      });
    });

    test("throws constrained ref keys cannot be self referential", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Invalid reference pointer '$(A).aObjects.values'. Keys that are constrained ref types cannot be schematically self-referential. Found at '$(A).aObjects.mainKey'."
      });
    });

    test("throws no invalid property type when prop type isn't supported", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "error",
        message:
          "Invalid prop in schema. Remove or change 'nullable=true' from '$(A).aObjects'. Found at '$(A).aObjects.nullable'.",
      });
    });
  });

  describe("codegen", () => {
    test("generates react snapshot", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);
      const code = await generateTypeScriptAPI(
        datasource,
        PLUGIN_B_MANIFEST,
        true
      );
      expect(code).toEqual(SNAPSHOT_1_WITH_REACT);
    });
  });
});
