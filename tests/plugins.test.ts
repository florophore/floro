import { fs, vol } from "memfs";
import { toEditorSettings } from "typescript";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import {
  constructRootSchema,
  generateKVFromState,
  generateStateFromKV,
  getPluginManifest,
  indexArrayDuplicates,
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

  describe("constructRootSchema", () => {
    test("can construct set types", () => {
      const rs = constructRootSchema(
        SIMPLE_PLUGIN_MANIFEST,
        SIMPLE_PLUGIN_MANIFEST.store,
        SIMPLE_PLUGIN_MANIFEST.name
      );
      expect(rs).toEqual({
        objects: {
          type: "set",
          values: {
            name: {
              type: "string",
              isKey: true,
            },
            value: {
              type: "string",
            },
          },
        },
      });
    });

    test("can construct array types", () => {
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
          },
        },
        store: {
          objects: {
            type: "array",
            values: "entity",
          },
        },
      }
      const rs = constructRootSchema(
        ARRAY_PLUGIN_MANIFEST,
        ARRAY_PLUGIN_MANIFEST.store,
        ARRAY_PLUGIN_MANIFEST.name
      );
      expect(rs).toEqual({
        objects: {
          type: "array",
          values: {
            "(id)": {
              type: "string",
              isKey: true
            },
            name: {
              type: "string",
            },
            value: {
              type: "string",
            },
          },
        },
      });
    });
  });

  describe("generateKVFromState", () => {
    test("flatten simple object", () => {
        const kvs = generateKVFromState(
          SIMPLE_PLUGIN_MANIFEST,
          {
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
          SIMPLE_PLUGIN_MANIFEST.name
        );
        expect(kvs[0].key).toEqual("$(simple)")
        expect(kvs[0].value).toEqual({})
        expect(kvs[1].key).toEqual("$(simple).objects.name<abc>")
        expect(kvs[1].value).toEqual({
          name: "abc",
          value: "first",
        });
        expect(kvs[2].key).toEqual("$(simple).objects.name<def>")
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
            values:  "int",
          }
        },
      },
      store: {
        objects: {
          type: "array",
          values: "entity",
        },
      },
    };
    const kvs = generateKVFromState(
      ARRAY_PLUGIN_MANIFEST,
      {
        objects: [
          {
            name: "abc",
            list: [1, 2 , 3]
          },
          {
            name: "def",
            list: [4, 5]
          },
          {
            name: "abc",
            list: [1, 2 , 3]
          },
        ],
      },
      ARRAY_PLUGIN_MANIFEST.name
    );
    const s1 = generateStateFromKV(ARRAY_PLUGIN_MANIFEST, kvs, ARRAY_PLUGIN_MANIFEST.name);
    const kv2 = generateKVFromState(
      ARRAY_PLUGIN_MANIFEST,
      s1,
      ARRAY_PLUGIN_MANIFEST.name
    );
    const s2 = generateStateFromKV(ARRAY_PLUGIN_MANIFEST, kv2, ARRAY_PLUGIN_MANIFEST.name);
    expect(s2).toEqual(
      {
        objects: [
          {
            name: "abc",
            list: [1, 2 , 3]
          },
          {
            name: "def",
            list: [4, 5]
          },
          {
            name: "abc",
            list: [1, 2 , 3]
          },
        ],
      },
    )
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
              type: "int"
            }
          }
        },
      },
      store: {
        objects: {
          type: "array",
          values: "entity",
        },
      },
    }

    const kvs = generateKVFromState(
      ARRAY_PLUGIN_MANIFEST,
      {
        objects: [
          {
            name: "abc",
            value: "first",
            other: {
              someProp: 1
            }
          },
          {
            name: "def",
            value: "second",
            other: {
              someProp: 2
            }
          },
          {
            name: "abc",
            value: "first",
            other: {
              someProp: 1
            }
          },
        ],
      },
      ARRAY_PLUGIN_MANIFEST.name
    );
    const s1 = generateStateFromKV(ARRAY_PLUGIN_MANIFEST, kvs, ARRAY_PLUGIN_MANIFEST.name);
    const kv2 = generateKVFromState(
      ARRAY_PLUGIN_MANIFEST,
      s1,
      ARRAY_PLUGIN_MANIFEST.name
    );
    const s2 = generateStateFromKV(ARRAY_PLUGIN_MANIFEST, kv2, ARRAY_PLUGIN_MANIFEST.name);
    expect(s1).toEqual(
      {
        objects: [
          {
            name: "abc",
            value: "first",
            other: {
              someProp: 1
            }
          },
          {
            name: "def",
            value: "second",
            other: {
              someProp: 2
            }
          },
          {
            name: "abc",
            value: "first",
            other: {
              someProp: 1
            }
          },
        ],
      },
    )
    expect(s1).toEqual(s2);
  });
});
