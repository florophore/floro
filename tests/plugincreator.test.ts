import { fs, vol } from "memfs";
import path from "path";
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
  getDependenciesForManifest,
  tarCreationPlugin,
  verifyPluginDependencyCompatability,
} from "../src/plugincreator";
import { Manifest } from "../src/plugins";
import {
  makePluginCreationDirectory,
  makeSignedInUser,
  makeTestPlugin,
} from "./helpers/fsmocks";
import { SIMPLE_PLUGIN_MANIFEST } from "./helpers/pluginmocks";

jest.mock("fs");
jest.mock("fs/promises");

describe("plugincreator", () => {
  beforeEach(async () => {
    fs.mkdirSync(userHome, { recursive: true });
    buildFloroFilestructure();
    await makeSignedInUser();
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
        SIMPLE_PLUGIN_MANIFEST.name + "@" + SIMPLE_PLUGIN_MANIFEST.version,
        "index.html"
      );
      const indexHTMLCWDPath = path.join(cwd, "dist", "index.html");
      const indexHTMLDev = fs.readFileSync(indexHTMLDevPath);
      const indexHTMLCWD = fs.readFileSync(indexHTMLCWDPath);
      expect(indexHTMLDev).toEqual(indexHTMLCWD);
      const indexJSDevPath = path.join(
        vDEVPath,
        SIMPLE_PLUGIN_MANIFEST.name + "@" + SIMPLE_PLUGIN_MANIFEST.version,
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

      expect(didTar).toBe(true);

      const tarOutPath = path.join(
        vTMPPath,
        "out",
        SIMPLE_PLUGIN_MANIFEST.name +
          "@" +
          SIMPLE_PLUGIN_MANIFEST.version +
          ".tar.gz"
      );
      const files = new Set();

      tar.t({
        file: tarOutPath,
        sync: true,
        onentry: (entry) => {
          if (entry.path[entry.path.length - 1] == "/") {
            files.add(entry.path.substring(0, entry.path.length - 1));
          } else {
            files.add(entry.path);
          }
        },
      });

      const buildPathDir = path
        .join(
          vTMPPath,
          "build",
          `${SIMPLE_PLUGIN_MANIFEST.name}@${SIMPLE_PLUGIN_MANIFEST.version}`
        )
        .substring(1);
      const buildAssetsPathDir = path.join(buildPathDir, "assets");
      const buildFloroPathDir = path.join(buildPathDir, "floro");
      const buildIndexHTMLPathDir = path.join(buildPathDir, "index.html");
      const buildIndexJSPathDir = path.join(buildPathDir, "assets", "index.js");
      const buildFloroManifestPathDir = path.join(
        buildPathDir,
        "floro",
        "floro.manifest.json"
      );

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
      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        publisher: "@jamiesunderland",
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
        publisher: "@jamiesunderland",
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
        publisher: "@jamiesunderland",
        icon: "",
        imports: {
          B: "dev@0.0.0",
        },
        types: {},
        store: {},
      };
      makeTestPlugin(PLUGIN_C_MANIFEST, true);
      const bDeps = await getDependenciesForManifest(PLUGIN_B_MANIFEST);
      expect(bDeps.deps).toEqual([PLUGIN_A_MANIFEST]);
      const cDeps = await getDependenciesForManifest(PLUGIN_C_MANIFEST);
      expect(cDeps.deps).toEqual([PLUGIN_B_MANIFEST, PLUGIN_A_MANIFEST]);
    });

    test("discovers cyclic dependency errors", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getDependenciesForManifest(
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getDependenciesForManifest(
        PLUGIN_C_MANIFEST
      );
      const validationResponse = await verifyPluginDependencyCompatability(
        depListResponse.deps
      );
      expect(validationResponse.isValid).toEqual(true);
    });

    test("discovers compatability errors when manifests are incompatabile", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
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

      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_B_MANIFEST);

      const PLUGIN_C_MANIFEST: Manifest = {
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
      makeTestPlugin(PLUGIN_C_MANIFEST);

      const depListResponse = await getDependenciesForManifest(
        PLUGIN_C_MANIFEST
      );
      const validationResponse = await verifyPluginDependencyCompatability(
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
});
