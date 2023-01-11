import { fs, vol } from "memfs";
import { toEditorSettings } from "typescript";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import {
  cleanArrayIDFromState,
  constructRootSchema,
  generateKVFromState,
  generateStateFromKV,
  getPluginManifest,
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
    test("testing", () => {
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

    test("array root schema test", () => {
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

  test.only("properly hashes array state", () => {
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
    expect(cleanArrayIDFromState(s1 as object)).toEqual(
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
        ],
      },
    )
    expect(s1).toEqual(s2);
  });
});
