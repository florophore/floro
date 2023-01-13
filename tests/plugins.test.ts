import { fs, vol } from "memfs";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import {
  generateStateFromKV,
  getPluginManifest,
  getRootSchemaMap,
  getKVStateForPlugin,
} from "../src/plugins";
import { makeSignedInUser } from "./helpers/fsmocks";
import { createPlugin, SIMPLE_PLUGIN_MANIFEST } from "./helpers/pluginmocks";

jest.mock("fs");
jest.mock("fs/promises");

describe("plugins", () => {
  beforeEach(async () => {
    fs.mkdirSync(userHome, { recursive: true });
    buildFloroFilestructure();
    await makeSignedInUser();
  });

  afterEach(() => {
    vol.reset();
  });

  describe("getPluginManifest", () => {
    test("returns dev manifest", async () => {
      createPlugin(SIMPLE_PLUGIN_MANIFEST, true);
      const manifest = await getPluginManifest("simple", [
        {
          key: "simple",
          value: "dev@0.0.0",
        },
      ]);
      expect(manifest).toEqual(SIMPLE_PLUGIN_MANIFEST);
    });

    test("returns non-dev manifest", async () => {
      createPlugin(SIMPLE_PLUGIN_MANIFEST);
      const manifest = await getPluginManifest("simple", [
        {
          key: "simple",
          value: "0.0.0",
        },
      ]);
      expect(manifest).toEqual(SIMPLE_PLUGIN_MANIFEST);
    });
  });

  describe("generateKVFromState", () => {
    test("flatten simple object", () => {
      const kvs = getKVStateForPlugin(
        {
          [SIMPLE_PLUGIN_MANIFEST.name]: SIMPLE_PLUGIN_MANIFEST,
        },
        SIMPLE_PLUGIN_MANIFEST.name,
        {
          [SIMPLE_PLUGIN_MANIFEST.name]: {
            objects: [
              {
                name: "abc",
                value: "first",
              },
              {
                name: "def",
                value: "second",
              },
            ],
          },
        }
      );
      expect(kvs[0].key).toEqual("$(simple)");
      expect(kvs[0].value).toEqual({});
      expect(kvs[1].key).toEqual("$(simple).objects.name<abc>");
      expect(kvs[1].value).toEqual({
        name: "abc",
        value: "first",
      });
      expect(kvs[2].key).toEqual("$(simple).objects.name<def>");
      expect(kvs[2].value).toEqual({
        name: "def",
        value: "second",
      });
    });
  });

  test("can serialize array and set primitive array or set state", () => {
    const ARRAY_PLUGIN_MANIFEST = {
      version: "0.0.0",
      name: "simple",
      displayName: "Simple",
      publisher: "@jamiesunderland",
      icon: {
        light: "./palette-plugin-icon.svg",
        dark: "./palette-plugin-icon.svg",
      },
      imports: {},
      types: {
        entity: {
          name: {
            type: "string",
          },
          list: {
            type: "array",
            values: "int",
          },
        },
      },
      store: {
        objects: {
          type: "array",
          values: "entity",
        },
      },
    };
    const kvs = getKVStateForPlugin(
      {[ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST},
      ARRAY_PLUGIN_MANIFEST.name,
      {
        [ARRAY_PLUGIN_MANIFEST.name]: {
          objects: [
            {
              name: "abc",
              list: [1, 2, 3],
            },
            {
              name: "def",
              list: [4, 5],
            },
            {
              name: "abc",
              list: [1, 2, 3],
            },
          ],
        }
      }
    );
    const s1 = generateStateFromKV(
      ARRAY_PLUGIN_MANIFEST,
      kvs,
      ARRAY_PLUGIN_MANIFEST.name
    );
    const kv2 = getKVStateForPlugin(
      {[ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST},
      ARRAY_PLUGIN_MANIFEST.name,
      {
        [ARRAY_PLUGIN_MANIFEST.name]: s1
      }
    );
    const s2 = generateStateFromKV(
      ARRAY_PLUGIN_MANIFEST,
      kv2,
      ARRAY_PLUGIN_MANIFEST.name
    );
    expect(s1).toEqual(s2);
    expect(s2).toEqual({
      objects: [
        {
          name: "abc",
          list: [1, 2, 3],
        },
        {
          name: "def",
          list: [4, 5],
        },
        {
          name: "abc",
          list: [1, 2, 3],
        },
      ],
    });
  });

  test("serializes and hashes array state and dehashes state", () => {
    const ARRAY_PLUGIN_MANIFEST = {
      version: "0.0.0",
      name: "simple",
      displayName: "Simple",
      publisher: "@jamiesunderland",
      icon: {
        light: "./palette-plugin-icon.svg",
        dark: "./palette-plugin-icon.svg",
      },
      imports: {},
      types: {
        entity: {
          name: {
            type: "string",
          },
          value: {
            type: "string",
          },
          other: {
            someProp: {
              type: "int",
            },
          },
        },
      },
      store: {
        objects: {
          type: "array",
          values: "entity",
        },
      },
    };

    const kvs = getKVStateForPlugin(
      { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
      ARRAY_PLUGIN_MANIFEST.name,
      {
        [ARRAY_PLUGIN_MANIFEST.name]: {
          objects: [
            {
              name: "abc",
              value: "first",
              other: {
                someProp: 1,
              },
            },
            {
              name: "def",
              value: "second",
              other: {
                someProp: 2,
              },
            },
            {
              name: "abc",
              value: "first",
              other: {
                someProp: 1,
              },
            },
          ],
        },
      }
    );
    const s1 = generateStateFromKV(
      ARRAY_PLUGIN_MANIFEST,
      kvs,
      ARRAY_PLUGIN_MANIFEST.name
    );
    const kv2 = getKVStateForPlugin(
      {[ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST},
      ARRAY_PLUGIN_MANIFEST.name,
      {
        [ARRAY_PLUGIN_MANIFEST.name]: s1
      }
    );
    const s2 = generateStateFromKV(
      ARRAY_PLUGIN_MANIFEST,
      kv2,
      ARRAY_PLUGIN_MANIFEST.name
    );
    expect(kv2).toEqual(kvs);
    expect(s1).toEqual(s2);
    expect(s2).toEqual({
      objects: [
        {
          name: "abc",
          value: "first",
          other: {
            someProp: 1,
          },
        },
        {
          name: "def",
          value: "second",
          other: {
            someProp: 2,
          },
        },
        {
          name: "abc",
          value: "first",
          other: {
            someProp: 1,
          },
        },
      ],
    });
  });

  describe("can stich schemas", () => {
    test("getRootSchemaForPlugin", () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        publisher: "@jamiesunderland",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "int",
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

      const B_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "b-plugin",
        displayName: "Simple",
        publisher: "@jamiesunderland",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {
          "a-plugin": "~0.0.0",
        },
        types: {
          typeB: {
            name: {
              type: "string",
              isKey: true,
            },
            a: {
              type: "ref<a-plugin.typeA>",
            },
            nestedSet: {
              type: "set",
              values: {
                mainKey: {
                  type: "float",
                  isKey: true,
                },
              },
            },
          },
        },
        store: {
          bObjects: {
            type: "set",
            values: "typeB",
          },
        },
      };

      const C_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "c-plugin",
        displayName: "Simple",
        publisher: "@jamiesunderland",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {
          "b-plugin": "~0.0.0",
        },
        types: {
          typeC: {
            name: {
              type: "string",
              isKey: true,
            },
            a: {
              type: "ref<$(a-plugin).aObjects.values>",
            },
            bNested: {
              type: "ref<$(b-plugin).bObjects.values.nestedSet.values>",
            },
          },
        },
        store: {
          cObjects: {
            type: "set",
            values: "typeC",
          },
        },
      };

      const schemaMap = {
        "a-plugin": A_PLUGIN_MANIFEST,
        "b-plugin": B_PLUGIN_MANIFEST,
        "c-plugin": C_PLUGIN_MANIFEST,
      };
      const rootSchemaMap = getRootSchemaMap(schemaMap);
      expect(rootSchemaMap).toEqual({
        "a-plugin": {
          aObjects: {
            type: "set",
            values: {
              name: {
                type: "int",
                isKey: true,
              },
            },
          },
        },
        "b-plugin": {
          bObjects: {
            type: "set",
            values: {
              name: {
                type: "string",
                isKey: true,
              },
              a: {
                type: "ref",
                refType: "a-plugin.typeA",
                refKeyType: "int",
              },
              nestedSet: {
                type: "set",
                values: {
                  mainKey: {
                    type: "float",
                    isKey: true,
                  },
                },
              },
            },
          },
        },
        "c-plugin": {
          cObjects: {
            type: "set",
            values: {
              name: {
                type: "string",
                isKey: true,
              },
              a: {
                type: "ref",
                refType: "$(a-plugin).aObjects.values",
                refKeyType: "int",
              },
              bNested: {
                type: "ref",
                refType: "$(b-plugin).bObjects.values.nestedSet.values",
                refKeyType: "float",
              },
            },
          },
        },
      });
    });
  });
});
