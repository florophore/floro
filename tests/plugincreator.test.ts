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
      expect(cDeps.deps).toEqual([{
        name: "B",
        version: "dev@0.0.0",
        displayName: "B",
        icon: "",
        imports: {
          A: "0.0.0",
        },
        types: {},
        store: {},
      }, PLUGIN_A_MANIFEST]);
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
            emptyable: false,
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
          "Invalid key 'mainKey'. Key types cannot be nullable. Found at '$(A).aObjects.values.mainKey'.",
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
          "Invalid key 'mainKey'. Key types that are refs cannot have a cascaded onDelete values of nullify. Found at '$(A).aObjects.values.mainKey'.",
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
          "Invalid reference pointer '$(A).aObjects.values'. Keys that are constrained ref types cannot be schematically self-referential. Found at '$(A).aObjects.values.mainKey'."
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

    test("validates valid bounded sets", async () => {

      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {
          Color: {
            name: {
              type: "string",
              isKey: true,
            },
          },
          Shade: {
            name: {
              type: "string",
              isKey: true,
            },
          },
        },
        store: {
          colors: {
            type: "set",
            values: "Color",
          },
          shades: {
            type: "set",
            values: "Color",
          },
          palette: {
            type: "set",
            bounded: true,
            values: {
              id: {
                type: "ref<$.colors.values>",
                isKey: true,
              },
              name: {
                type: "string",
              },
              paletteColors: {
                type: "set",
                bounded: true,
                values: {
                  id: {
                    type: "ref<$.shades.values>",
                    isKey: true,
                  },
                  value: {
                    type: "string",
                  }
                }
              }
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_A_MANIFEST);
      const result = await validatePluginManifest(
        datasource,
        PLUGIN_A_MANIFEST
      );
      expect(result).toEqual({
        status: "ok",
      });
    });

    test("prevents unconstrained refs on bounded sets", async () => {

      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {
          Color: {
            name: {
              type: "string",
              isKey: true,
            },
          }
        },
        store: {
          colors: {
            type: "set",
            values: {
              name: {
                type: "string",
                isKey: true,
              },
            },
          },
          shades: {
            type: "set",
            values: {
              name: {
                type: "string",
                isKey: true,
              },
            },
          },
          palette: {
            type: "set",
            bounded: true,
            values: {
              id: {
                type: "ref<Color>",
                isKey: true,
              },
              name: {
                type: "string",
              },
              paletteColors: {
                type: "set",
                bounded: true,
                values: {
                  id: {
                    type: "ref<$.shades.values>",
                    isKey: true,
                  },
                  value: {
                    type: "string",
                  }
                }
              }
            }
          }
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
          "Invalid bounded set unconstrainted reference key 'A.Color'. Unconstrained references cannot be keys of a bounded set. Found at '$(A).palette.values.id'.",
      });
    });

    describe("defaults", () => {
      test("throw error on null default", async () => {
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
                thing: {
                  type: "string",
                  default: null,
                },
              }
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
            "Invalid default value type for prop 'thing'. Default values can not be null or undefined. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("valid on ok int", async () => {
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
                thing: {
                  type: "int",
                  default: 2,
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad int", async () => {
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
                thing: {
                  type: "int",
                  default: 2.5,
                },
              }
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
            "Invalid default value type for prop 'thing'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '$(A).aObjects.values.thing'.",
        });
      });


      test("valid on ok float", async () => {
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
                thing: {
                  type: "float",
                  default: 3.14,
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad float", async () => {
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
                thing: {
                  type: "float",
                  default: "3.14",
                },
              }
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
            "Invalid default value type for prop 'thing'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("valid on ok boolean", async () => {
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
                thing: {
                  type: "boolean",
                  default: false,
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad boolean", async () => {
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
                thing: {
                  type: "boolean",
                  default: "TRUE"
                },
              }
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
            "Invalid default value type for prop 'thing'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("valid on ok string", async () => {
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
                thing: {
                  type: "string",
                  default: "this is a string",
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad string", async () => {
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
                thing: {
                  type: "string",
                  default: 1234
                },
              }
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
            "Invalid default value type for prop 'thing'. Defaults can only be used for int, float, boolean, string, and arrays and sets of those types, as well as refs. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("valid on ok set of string", async () => {
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
                thing: {
                  type: "set",
                  values: "string",
                  default: ["a", "b", "c"],
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad set of string", async () => {
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
                thing: {
                  type: "set",
                  values: "string",
                  default: ["a", "b", 789],
                },
              }
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
            "Invalid default value type for element in default set of 'thing'. Not a string. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("valid on ok set of int", async () => {
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
                thing: {
                  type: "set",
                  values: "int",
                  default: [1, 2, 3],
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad set of int", async () => {
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
                thing: {
                  type: "set",
                  values: "int",
                  default: [0, 2.4, 789],
                },
              }
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
            "Invalid default value type for element in default set of 'thing'. Not an int. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("throw error on null element in set", async () => {
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
                thing: {
                  type: "set",
                  values: "int",
                  default: [0, null, 789],
                },
              }
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
            "Invalid default value type for prop 'thing'. Default value elements can not be null or undefined. Found at '$(A).aObjects.values.thing'.",
        });
      });

      test("valid on ok set of boolean", async () => {
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
                thing: {
                  type: "set",
                  values: "boolean",
                  default: [true, false, true],
                },
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw error on bad set of boolean", async () => {
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
                thing: {
                  type: "set",
                  values: "boolean",
                  default: [true, "FALSE"],
                },
              }
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
            "Invalid default value type for element in default set of 'thing'. Not a boolean. Found at '$(A).aObjects.values.thing'.",
        });
      });


      test("allow for a valid constrained reference default", async () => {
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
              }
            },
            bObjects: {
              type: "set",
              values: {
                bKey: {
                  type: "string",
                  isKey: true,
                },
                aRef: {
                  type: "ref<$.aObjects.values>",
                  default: "$(A).aObjects.mainKey<test>"
                }
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });


      test("allow for a valid unconstrained reference default", async () => {
        const PLUGIN_A_MANIFEST: Manifest = {
          name: "A",
          version: "0.0.0",
          displayName: "A",
          icon: "",
          imports: {},
          types: {
            AType: {
              mainKey: {
                type: "string",
                isKey: true,
              },
            }
          },
          store: {
            aObjects: {
              type: "set",
              values: "AType"
            },
            bObjects: {
              type: "set",
              values: {
                bKey: {
                  type: "string",
                  isKey: true,
                },
                aRef: {
                  type: "ref<AType>",
                  default: "$(A).aObjects.mainKey<test>"
                }
              }
            },
          },
        };
        makeTestPlugin(PLUGIN_A_MANIFEST);
        const result = await validatePluginManifest(
          datasource,
          PLUGIN_A_MANIFEST
        );
        expect(result).toEqual({
          status: "ok",
        });
      });

      test("throw on invalid unconstrained reference default", async () => {
        const PLUGIN_A_MANIFEST: Manifest = {
          name: "A",
          version: "0.0.0",
          displayName: "A",
          icon: "",
          imports: {},
          types: {
            AType: {
              mainKey: {
                type: "string",
                isKey: true,
              },
            }
          },
          store: {
            aObjects: {
              type: "set",
              values: "AType"
            },
            bObjects: {
              type: "set",
              values: {
                bKey: {
                  type: "string",
                  isKey: true,
                },
                aRef: {
                  type: "ref<AType>",
                  default: "$(A).bObjects.bKey<fail>"
                }
              }
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
            "Invalid default referenced pointer type 'A.AType'. Corresponding pointer type does not match, found at '$(A).bObjects.values.aRef'.",
        });
      });
    });

  });

  describe("codegen", () => {
    test.skip("generates react snapshot", async () => {
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
              type: "file",
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
              list: {
                type: "array",
                values: {
                  someProp: {
                    type: "string",
                  },
                  subList: {
                    type: "array",
                    values: {
                      subProp: {
                        type: "int",
                      },
                      primitiveSet: {
                        type: "set",
                        values: "string"
                      },
                      someNestedThing: {
                        innerMostString: {
                          type: "string"
                        }
                      }
                    },
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
      console.log(code);
      //expect(code).toEqual(SNAPSHOT_1_WITH_REACT);
    });
  });
});
