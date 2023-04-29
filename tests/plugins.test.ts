import { fs, vol } from "memfs";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import {
  getStateFromKVForPlugin,
  getRootSchemaMap,
  getKVStateForPlugin,
  pluginManifestIsSubsetOfManifest,
  cascadePluginState,
  Manifest,
  validatePluginState,
  isTopologicalSubsetValid,
  reIndexSchemaArrays,
  getPluginInvalidStateIndices,
  nullifyMissingFileRefs,
  collectFileRefs,
  getInvalidRootStates,
  enforceBoundedSets,
  defaultVoidedState,
} from "../src/plugins";
import { makeSignedInUser, makeTestPlugin } from "./helpers/fsmocks";
import { SIMPLE_PLUGIN_MANIFEST } from "./helpers/pluginmocks";
import { DataSource, makeMemoizedDataSource } from "../src/datasource";

jest.mock("fs");
jest.mock("fs/promises");

describe("plugins", () => {
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

  describe("readPluginManifest", () => {
    test("returns dev manifest", async () => {
      makeTestPlugin(SIMPLE_PLUGIN_MANIFEST, true);
      const manifest = await datasource.getPluginManifest(
        "simple",
        "dev@0.0.0"
      );
      expect(manifest).toEqual({
        ...SIMPLE_PLUGIN_MANIFEST,
        version: "dev@0.0.0",
      });
    });

    test("returns non-dev manifest", async () => {
      makeTestPlugin(SIMPLE_PLUGIN_MANIFEST);
      const manifest = await datasource.getPluginManifest("simple", "0.0.0");
      expect(manifest).toEqual(SIMPLE_PLUGIN_MANIFEST);
    });
  });

  describe("getKVStateForPlugin", () => {
    test("flatten simple object", async () => {
      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return SIMPLE_PLUGIN_MANIFEST;
          },
        },
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

    test("obeys key lexical order", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          bObjects: {
            type: "set",
            values: {
              zVal: {
                type: "int",
              },
              aKey: {
                isKey: true,
                type: "ref<$(A).aObjects.values>",
              },
            },
          },
          aObjects: {
            type: "set",
            values: {
              yVal: {
                type: "boolean",
              },
              xKey: {
                isKey: true,
                type: "string",
              },
            },
          },
        },
      };
      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return PLUGIN_A_MANIFEST;
          },
        },
        {
          [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST,
        },
        PLUGIN_A_MANIFEST.name,
        {
          [PLUGIN_A_MANIFEST.name]: {
            bObjects: [
              {
                zVal: 1,
                aKey: "$(A).aObjects.xKey<abc>",
              },
              {
                zVal: 2,
                aKey: "$(A).aObjects.xKey<def>",
              },
            ],
            aObjects: [
              {
                yVal: true,
                xKey: "abc",
              },
              {
                yVal: false,
                xKey: "def",
              },
            ],
          },
        }
      );
      const s1 = getStateFromKVForPlugin(
        { [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST },
        kvs,
        PLUGIN_A_MANIFEST.name
      );
      expect(s1).toEqual({
        aObjects: [
          {
            xKey: "abc",
            yVal: true,
          },
          {
            xKey: "def",
            yVal: false,
          },
        ],
        bObjects: [
          {
            aKey: "$(A).aObjects.xKey<abc>",
            zVal: 1,
          },
          {
            aKey: "$(A).aObjects.xKey<def>",
            zVal: 2,
          },
        ],
      });
    });

    test("can handle references that are key types", async () => {
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
              name: {
                isKey: true,
                type: "string",
              },
            },
          },
          bObjects: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "ref<$(A).aObjects.values>",
              },
            },
          },
          cObjects: {
            type: "set",
            values: {
              cVal: {
                isKey: true,
                type: "ref<$(A).bObjects.values>",
              },
            },
          },
        },
      };
      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return PLUGIN_A_MANIFEST;
          },
        },
        {
          [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST,
        },
        PLUGIN_A_MANIFEST.name,
        {
          [PLUGIN_A_MANIFEST.name]: {
            aObjects: [
              {
                name: "abc",
              },
              {
                name: "def",
              },
            ],
            bObjects: [
              {
                mainKey: "$(A).aObjects.name<abc>",
              },
              {
                mainKey: "$(A).aObjects.name<def>",
              },
            ],
            cObjects: [
              {
                cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<abc>>",
              },
              {
                cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<def>>",
              },
            ],
          },
        }
      );
      const s1 = getStateFromKVForPlugin(
        { [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST },
        kvs,
        PLUGIN_A_MANIFEST.name
      );
      expect(s1).toEqual({
        aObjects: [
          {
            name: "abc",
          },
          {
            name: "def",
          },
        ],
        bObjects: [
          {
            mainKey: "$(A).aObjects.name<abc>",
          },
          {
            mainKey: "$(A).aObjects.name<def>",
          },
        ],
        cObjects: [
          {
            cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<abc>>",
          },
          {
            cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<def>>",
          },
        ],
      });
    });

    test("can serialize array and set primitive array or set state", async () => {
      const ARRAY_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "simple",
        displayName: "Simple",
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
      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return ARRAY_PLUGIN_MANIFEST;
          },
        },
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
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
          },
        }
      );
      const s1 = getStateFromKVForPlugin(
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
        kvs,
        ARRAY_PLUGIN_MANIFEST.name
      );
      const kv2 = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return ARRAY_PLUGIN_MANIFEST;
          },
        },
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
        ARRAY_PLUGIN_MANIFEST.name,
        {
          [ARRAY_PLUGIN_MANIFEST.name]: s1,
        }
      );
      const s2 = getStateFromKVForPlugin(
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
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

    test("serializes and hashes array state and dehashes state", async () => {
      const ARRAY_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "simple",
        displayName: "Simple",
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

      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return ARRAY_PLUGIN_MANIFEST;
          },
        },
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

      const s1 = getStateFromKVForPlugin(
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
        kvs,
        ARRAY_PLUGIN_MANIFEST.name
      );
      const kv2 = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return ARRAY_PLUGIN_MANIFEST;
          },
        },
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
        ARRAY_PLUGIN_MANIFEST.name,
        {
          [ARRAY_PLUGIN_MANIFEST.name]: s1,
        }
      );
      const s2 = getStateFromKVForPlugin(
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
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
  });

  describe("array re-indexing", () => {
    test("can re-index nested arrays", async () => {
      const ARRAY_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "simple",
        displayName: "Simple",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          entity: {
            name: {
              type: "string",
              isKey: true,
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
                  },
                },
              },
            },
          },
        },
        store: {
          objects: {
            type: "set",
            values: "entity",
          },
        },
      };
      const stateMap = {
        [ARRAY_PLUGIN_MANIFEST.name]: {
          objects: [
            {
              name: "abc",
              list: [
                {
                  someProp: "first prop",
                  subList: [
                    {
                      subProp: 1,
                    },
                    {
                      subProp: 2,
                    },
                    {
                      subProp: 2,
                    },
                    {
                      subProp: 1,
                    },
                  ],
                },
                {
                  someProp: "second prop",
                  subList: [
                    {
                      subProp: 1,
                    },
                    {
                      subProp: 2,
                    },
                    {
                      subProp: 2,
                    },
                  ],
                },
                {
                  someProp: "first prop",
                  subList: [
                    {
                      subProp: 1,
                    },
                    {
                      subProp: 2,
                    },
                    {
                      subProp: 2,
                    },
                    {
                      subProp: 1,
                    },
                  ],
                },
              ],
            },
          ],
        },
      };
      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async () => {
            return ARRAY_PLUGIN_MANIFEST;
          },
        },
        { [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST },
        ARRAY_PLUGIN_MANIFEST.name,
        stateMap
      );

      const out = reIndexSchemaArrays(kvs);
      expect(out).toEqual([
        "$(simple)",
        "$(simple).objects.name<abc>",
        "$(simple).objects.name<abc>.list.[0]",
        "$(simple).objects.name<abc>.list.[0].subList.[0]",
        "$(simple).objects.name<abc>.list.[0].subList.[1]",
        "$(simple).objects.name<abc>.list.[0].subList.[2]",
        "$(simple).objects.name<abc>.list.[0].subList.[3]",
        "$(simple).objects.name<abc>.list.[1]",
        "$(simple).objects.name<abc>.list.[1].subList.[0]",
        "$(simple).objects.name<abc>.list.[1].subList.[1]",
        "$(simple).objects.name<abc>.list.[1].subList.[2]",
        "$(simple).objects.name<abc>.list.[2]",
        "$(simple).objects.name<abc>.list.[2].subList.[0]",
        "$(simple).objects.name<abc>.list.[2].subList.[1]",
        "$(simple).objects.name<abc>.list.[2].subList.[2]",
        "$(simple).objects.name<abc>.list.[2].subList.[3]",
      ]);
    });
  });

  describe("can stich schemas", () => {
    test("getRootSchemaForPlugin", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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
      const rootSchemaMap = await getRootSchemaMap(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap
      );
      expect(rootSchemaMap).toEqual({
        "a-plugin": {
          aObjects: {
            bounded: false,
            manualOrdering: false,
            type: "set",
            emptyable: true,
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
            bounded: false,
            manualOrdering: false,
            type: "set",
            emptyable: true,
            values: {
              name: {
                type: "string",
                isKey: true,
              },
              a: {
                type: "ref",
                refType: "a-plugin.typeA",
                refKeyType: "int",
                nullable: false,
                onDelete: "delete",
              },
              nestedSet: {
                bounded: false,
                manualOrdering: false,
                type: "set",
                emptyable: true,
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
            bounded: false,
            manualOrdering: false,
            type: "set",
            emptyable: true,
            values: {
              name: {
                type: "string",
                isKey: true,
              },
              a: {
                nullable: false,
                onDelete: "delete",
                type: "ref",
                refType: "$(a-plugin).aObjects.values",
                refKeyType: "int",
              },
              bNested: {
                nullable: false,
                onDelete: "delete",
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

  describe("pluginManifestIsSubsetOfManifest", () => {
    test("returns true when ordering of rootSchema keys change", async () => {
      const CURRENT_A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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
            a: {
              type: "int",
            },
            z: {
              type: "int",
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

      const NEXT_A_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            z: {
              type: "int",
            },
            name: {
              type: "int",
              isKey: true,
            },
            a: {
              type: "int",
            },
            additionalPropToA: {
              type: "float",
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

      const currentSchemaMap = {
        "a-plugin": CURRENT_A_PLUGIN_MANIFEST,
      };

      const nextSchemaMap = {
        "a-plugin": NEXT_A_PLUGIN_MANIFEST,
      };

      const isSubset = await pluginManifestIsSubsetOfManifest(
        {
          ...datasource,
          getPluginManifest: async (pluginName, pluginVersion) => {
            if (pluginVersion == "0.0.0") {
              return currentSchemaMap[pluginName];
            }
            return nextSchemaMap[pluginName];
          },
        },
        currentSchemaMap,
        nextSchemaMap
      );
      expect(isSubset).toBe(true);
    });

    test("returns true when current rootSchema is subset of next rootSchema", async () => {
      const CURRENT_A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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

      const CURRENT_B_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "b-plugin",
        displayName: "Simple",
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
          },
        },
        store: {
          bObjects: {
            type: "set",
            values: "typeB",
          },
        },
      };

      const NEXT_A_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "a-plugin",
        displayName: "A",
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
            additionalPropToA: {
              type: "float",
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

      const NEXT_B_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "b-plugin",
        displayName: "Simple",
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
            newProp: {
              type: "int",
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

      const currentSchemaMap = {
        "a-plugin": CURRENT_A_PLUGIN_MANIFEST,
        "b-plugin": CURRENT_B_PLUGIN_MANIFEST,
      };

      const nextSchemaMap = {
        "a-plugin": NEXT_A_PLUGIN_MANIFEST,
        "b-plugin": NEXT_B_PLUGIN_MANIFEST,
      };

      const isSubset = await pluginManifestIsSubsetOfManifest(
        {
          ...datasource,
          getPluginManifest: async (pluginName, pluginVersion) => {
            if (pluginVersion == "0.0.0") {
              return currentSchemaMap[pluginName];
            }
            return nextSchemaMap[pluginName];
          },
        },
        currentSchemaMap,
        nextSchemaMap
      );
      expect(isSubset).toBe(true);
    });

    test("returns false when current rootSchema is NOT subset of next rootSchema", async () => {
      const CURRENT_A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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
            oldFeature: {
              type: "string",
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
      const NEXT_A_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "a-plugin",
        displayName: "A",
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
            oldFeature: {
              type: "float", // changed from string
            },
            additionalPropToA: {
              type: "float",
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

      const currentSchemaMap = {
        "a-plugin": CURRENT_A_PLUGIN_MANIFEST,
      };

      const nextSchemaMap = {
        "a-plugin": NEXT_A_PLUGIN_MANIFEST,
      };

      const isSubset = await pluginManifestIsSubsetOfManifest(
        {
          ...datasource,
          getPluginManifest: async (pluginName, pluginVersion) => {
            if (pluginVersion == "0.0.0") {
              return currentSchemaMap[pluginName];
            }
            return nextSchemaMap[pluginName];
          },
        },
        currentSchemaMap,
        nextSchemaMap
      );
      expect(isSubset).toBe(false);
    });
  });

  describe("nullify missing file refs", () => {
    test("nullifies missing file refs", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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
            file: {
              type: "file",
            },
            nestedProp: {
              nestedFile: {
                type: "file",
              },
              nestedFiles: {
                type: "array",
                values: "file",
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

      const schemaMap = {
        "a-plugin": A_PLUGIN_MANIFEST,
      };

      const stateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: 1,
              file: "A",
              nestedProp: {
                nestedFile: "B",
                nestedFiles: ["A", "B", "A"],
              },
            },
            {
              name: 3,
              file: "B",
              nestedProp: {
                nestedFile: "B",
                nestedFiles: ["B", "A", "B", "B"],
              },
            },
          ],
        },
      };
      const beforeFiles = await collectFileRefs(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "B") {
              return true;
            }
            return false;
          },
        },
        schemaMap,
        stateMap
      );

      expect(beforeFiles).toEqual(["A", "B"]);
      const result = await nullifyMissingFileRefs(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "B") {
              return true;
            }
            return false;
          },
        },
        schemaMap,
        stateMap
      );

      const afterFiles = await collectFileRefs(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "B") {
              return true;
            }
            return false;
          },
        },
        schemaMap,
        stateMap
      );

      expect(afterFiles).toEqual(["B"]);
      expect(result).toEqual({
        "a-plugin": {
          aObjects: [
            {
              name: 1,
              file: null,
              nestedProp: {
                nestedFile: "B",
                nestedFiles: ["B"],
              },
            },
            {
              name: 3,
              file: "B",
              nestedProp: {
                nestedFile: "B",
                nestedFiles: ["B", "B", "B"],
              },
            },
          ],
        },
      });
    });
  });

  describe("cascading", () => {
    test("cascades deletions down plugin chain", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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
            selfRef: {
              type: "ref<a-plugin.typeA>",
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
            innerValue: {
              someValue: {
                type: "int",
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

      const schemaMap = {
        "a-plugin": A_PLUGIN_MANIFEST,
        "b-plugin": B_PLUGIN_MANIFEST,
      };

      const stateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: 1,
              selfRef: "$(a-plugin).aObjects.name<1>",
            },
            {
              name: 3,
              selfRef: "$(a-plugin).aObjects.name<2>",
            },
          ],
        },
        [B_PLUGIN_MANIFEST.name]: {
          bObjects: [
            {
              name: "a",
              a: "$(a-plugin).aObjects.name<1>",
              innerValue: {
                someValue: 5,
              },
            },
            {
              name: "b",
              a: "$(a-plugin).aObjects.name<2>",
              innerValue: {
                someValue: 4,
              },
            },
            {
              name: "c",
              a: "$(a-plugin).aObjects.name<3>",
              innerValue: {
                someValue: 5,
              },
            },
          ],
        },
      };
      const cascadedAState = await cascadePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        stateMap
      );
      expect(cascadedAState).toEqual({
        "a-plugin": {
          aObjects: [
            {
              name: 1,
              selfRef: "$(a-plugin).aObjects.name<1>",
            },
          ],
        },
        "b-plugin": {
          bObjects: [
            {
              name: "a",
              a: "$(a-plugin).aObjects.name<1>",
              innerValue: {
                someValue: 5,
              },
            },
          ],
        },
      });
    });

    test("respects nullify", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
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
            selfRef: {
              type: "ref<a-plugin.typeA>",
              onDelete: "nullify",
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
              onDelete: "nullify",
            },
            innerValue: {
              someValue: {
                type: "int",
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

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
        "b-plugin": B_PLUGIN_MANIFEST as Manifest,
      };

      const stateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: 1,
              selfRef: "$(a-plugin).aObjects.name<1>",
            },
            {
              name: 3,
              selfRef: "$(a-plugin).aObjects.name<2>",
            },
          ],
        },
        [B_PLUGIN_MANIFEST.name]: {
          bObjects: [
            {
              name: "a",
              a: "$(a-plugin).aObjects.name<1>",
              innerValue: {
                someValue: 5,
              },
            },
            {
              name: "b",
              a: "$(a-plugin).aObjects.name<2>",
              innerValue: {
                someValue: 4,
              },
            },
            {
              name: "c",
              a: "$(a-plugin).aObjects.name<3>",
              innerValue: {
                someValue: 5,
              },
            },
          ],
        },
      };
      const cascadedAState = await cascadePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        stateMap
      );
      expect(cascadedAState).toEqual({
        "a-plugin": {
          aObjects: [
            {
              name: 1,
              selfRef: "$(a-plugin).aObjects.name<1>",
            },
            {
              name: 3,
              selfRef: null,
            },
          ],
        },
        "b-plugin": {
          bObjects: [
            {
              name: "a",
              a: "$(a-plugin).aObjects.name<1>",
              innerValue: {
                someValue: 5,
              },
            },
            {
              name: "b",
              a: null,
              innerValue: {
                someValue: 4,
              },
            },
            {
              name: "c",
              a: "$(a-plugin).aObjects.name<3>",
              innerValue: {
                someValue: 5,
              },
            },
          ],
        },
      });
    });

    test("can cascade multi chained references", async () => {
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
              name: {
                isKey: true,
                type: "string",
              },
            },
          },
          bObjects: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "ref<$(A).aObjects.values>",
              },
            },
          },
          cObjects: {
            type: "set",
            values: {
              cVal: {
                isKey: true,
                type: "ref<$(A).bObjects.values>",
              },
            },
          },
        },
      };

      const schemaMap: { [key: string]: Manifest } = {
        [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST as Manifest,
      };

      const stateMap = {
        [PLUGIN_A_MANIFEST.name]: {
          aObjects: [
            {
              name: "def",
            },
          ],
          bObjects: [
            {
              mainKey: "$(A).aObjects.name<abc>",
            },
            {
              mainKey: "$(A).aObjects.name<def>",
            },
          ],
          cObjects: [
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<abc>>",
            },
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<def>>",
            },
          ],
        },
      };

      const cascadedAState = await cascadePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        stateMap
      );
      expect(cascadedAState).toEqual({
        A: {
          aObjects: [
            {
              name: "def",
            },
          ],
          bObjects: [
            {
              mainKey: "$(A).aObjects.name<def>",
            },
          ],
          cObjects: [
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<def>>",
            },
          ],
        },
      });
    });

    test("cascades nested refs", async () => {
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
              name: {
                isKey: true,
                type: "string",
              },
            },
          },
          bObjects: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "ref<$(A).aObjects.values>",
              },
              otherThings: {
                type: "set",
                values: {
                  pKey: {
                    type: "int",
                    isKey: true,
                  },
                  someRef: {
                    type: "ref<$(A).cObjects.values>",
                  },
                  nested: {
                    nestedRef: {
                      type: "ref<$(A).cObjects.values>",
                      onDelete: "nullify",
                    },
                    nestedSet: {
                      type: "set",
                      values: {
                        dKey: {
                          isKey: true,
                          type: "string",
                        },
                        randomRef: {
                          type: "ref<$(A).cObjects.values>",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          cObjects: {
            type: "set",
            values: {
              cVal: {
                isKey: true,
                type: "ref<$(A).bObjects.values>",
              },
            },
          },
        },
      };

      const schemaMap: { [key: string]: Manifest } = {
        [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST as Manifest,
      };

      const stateMap = {
        [PLUGIN_A_MANIFEST.name]: {
          aObjects: [
            {
              name: "abc",
            },
            {
              name: "def",
            },
            //{
            //  name: "xyz",
            //},
          ],
          bObjects: [
            {
              mainKey: "$(A).aObjects.name<abc>",
              someRef:
                "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
              otherThings: [
                {
                  pKey: 1,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "b",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                      },
                    ],
                  },
                },
                {
                  pKey: 2,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "b",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                      },
                    ],
                  },
                },
              ],
            },
            {
              mainKey: "$(A).aObjects.name<def>",
              otherThings: [
                {
                  pKey: 1,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "x",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<xyz>>>",
                      },
                    ],
                  },
                },
                {
                  pKey: 2,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<xyz>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "x",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<xyz>>>",
                      },
                      {
                        dKey: "b",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                      },
                    ],
                  },
                },
              ],
            },
          ],
          cObjects: [
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<abc>>",
            },
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<def>>",
            },
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<xyz>>",
            },
          ],
        },
      };

      const cascadedAState = await cascadePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        stateMap
      );
      expect(cascadedAState).toEqual({
        A: {
          aObjects: [
            {
              name: "abc",
            },
            {
              name: "def",
            },
          ],
          bObjects: [
            {
              mainKey: "$(A).aObjects.name<abc>",
              someRef:
                "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
              otherThings: [
                {
                  pKey: 1,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "b",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                      },
                    ],
                  },
                },
                {
                  pKey: 2,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "b",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                      },
                    ],
                  },
                },
              ],
            },
            {
              mainKey: "$(A).aObjects.name<def>",
              otherThings: [
                {
                  pKey: 1,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                  nested: {
                    nestedRef:
                      "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                    ],
                  },
                },
                {
                  pKey: 2,
                  someRef:
                    "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                  nested: {
                    nestedRef: null,
                    nestedSet: [
                      {
                        dKey: "a",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<abc>>>",
                      },
                      {
                        dKey: "b",
                        randomRef:
                          "$(A).cObjects.cVal<$(A).bObjects.mainKey<$(A).aObjects.name<def>>>",
                      },
                    ],
                  },
                },
              ],
            },
          ],
          cObjects: [
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<abc>>",
            },
            {
              cVal: "$(A).bObjects.mainKey<$(A).aObjects.name<def>>",
            },
          ],
        },
      });
    });
  });

  describe("enforceBoundedSets", () => {
    test("sucessfully enforces bounded sets", async () => {
      const PLUGIN_PALETTE_MANIFEST: Manifest = {
        name: "palette",
        version: "0.0.0",
        displayName: "palette",
        icon: "",
        imports: {},
        types: {
          Color: {
            colorId: {
              type: "string",
              isKey: true,
            },
            name: {
              type: "string",
            },
          },
          Shade: {
            shadeId: {
              type: "string",
              isKey: true,
            },
            name: {
              type: "string",
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
            values: "Shade",
          },
          palette: {
            type: "set",
            bounded: true,
            values: {
              id: {
                type: "ref<$.colors.values>",
                isKey: true,
              },
              paletteColors: {
                type: "set",
                bounded: true,
                values: {
                  id: {
                    type: "ref<$.shades.values>",
                    isKey: true,
                  },
                  hexcode: {
                    type: "string",
                  },
                  alpha: {
                    type: "int",
                    default: 255,
                  },
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_PALETTE_MANIFEST);

      const unenforcedUnboundedState = {
        shades: [
          {
            shadeId: "light",
            name: "Light",
          },
          {
            shadeId: "regular",
            name: "Regular",
          },
          {
            shadeId: "dark",
            name: "Dark",
          },
        ],
        colors: [
          {
            colorId: "white",
            name: "White",
          },
          {
            colorId: "red",
            name: "Red",
          },
        ],
        palette: [
          {
            paletteColors: [
              {
                alpha: 255,
                hexcode: "#AA2227",
                id: "$(palette).shades.shadeId<dark>",
              },
              {
                alpha: 255,
                hexcode: "#CC2F35",
                id: "$(palette).shades.shadeId<regular>",
              },
            ],
            id: "$(palette).colors.colorId<red>",
          },
          {
            paletteColors: [
              {
                alpha: 255,
                id: "$(palette).shades.shadeId<dark>",
              },
              {
                alpha: 255,
                id: "$(palette).shades.shadeId<light>",
              },
              {
                alpha: 255,
                hexcode: "#FFFFFF",
                id: "$(palette).shades.shadeId<regular>",
              },
            ],
            id: "$(palette).colors.colorId<white>",
          },
        ],
      };

      const schemaMap: { [key: string]: Manifest } = {
        [PLUGIN_PALETTE_MANIFEST.name]: PLUGIN_PALETTE_MANIFEST as Manifest,
      };

      const stateMap = {
        [PLUGIN_PALETTE_MANIFEST.name]: unenforcedUnboundedState,
      };

      const sanitizedState = await defaultVoidedState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        stateMap
      );
      await enforceBoundedSets(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        sanitizedState
      );
      expect(sanitizedState).toEqual({
        palette: {
          colors: [
            {
              colorId: "white",
              name: "White",
            },
            {
              colorId: "red",
              name: "Red",
            },
          ],
          palette: [
            {
              id: "$(palette).colors.colorId<white>",
              paletteColors: [
                {
                  alpha: 255,
                  hexcode: null,
                  id: "$(palette).shades.shadeId<light>",
                },
                {
                  alpha: 255,
                  hexcode: "#FFFFFF",
                  id: "$(palette).shades.shadeId<regular>",
                },
                {
                  alpha: 255,
                  hexcode: null,
                  id: "$(palette).shades.shadeId<dark>",
                },
              ],
            },
            {
              id: "$(palette).colors.colorId<red>",
              paletteColors: [
                {
                  alpha: 255,
                  hexcode: null,
                  id: "$(palette).shades.shadeId<light>",
                },
                {
                  alpha: 255,
                  hexcode: "#CC2F35",
                  id: "$(palette).shades.shadeId<regular>",
                },
                {
                  alpha: 255,
                  hexcode: "#AA2227",
                  id: "$(palette).shades.shadeId<dark>",
                },
              ],
            },
          ],
          shades: [
            {
              name: "Light",
              shadeId: "light",
            },
            {
              name: "Regular",
              shadeId: "regular",
            },
            {
              name: "Dark",
              shadeId: "dark",
            },
          ],
        },
      });
    });

    test("sucessfully enforces bounded sets but does not reorder manual ordered bounded sets", async () => {
      const PLUGIN_PALETTE_MANIFEST: Manifest = {
        name: "palette",
        version: "0.0.0",
        displayName: "palette",
        icon: "",
        imports: {},
        types: {
          Color: {
            colorId: {
              type: "string",
              isKey: true,
            },
            name: {
              type: "string",
            },
          },
          Shade: {
            shadeId: {
              type: "string",
              isKey: true,
            },
            name: {
              type: "string",
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
            values: "Shade",
          },
          palette: {
            type: "set",
            bounded: true,
            values: {
              id: {
                type: "ref<$.colors.values>",
                isKey: true,
              },
              paletteColors: {
                type: "set",
                bounded: true,
                manualOrdering: true,
                values: {
                  id: {
                    type: "ref<$.shades.values>",
                    isKey: true,
                  },
                  hexcode: {
                    type: "string",
                  },
                  alpha: {
                    type: "int",
                    default: 255,
                  },
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_PALETTE_MANIFEST);

      const unenforcedUnboundedState = {
        shades: [
          {
            shadeId: "light",
            name: "Light",
          },
          {
            shadeId: "regular",
            name: "Regular",
          },
          {
            shadeId: "dark",
            name: "Dark",
          },
        ],
        colors: [
          {
            colorId: "white",
            name: "White",
          },
          {
            colorId: "red",
            name: "Red",
          },
        ],
        palette: [
          {
            paletteColors: [
              {
                alpha: 255,
                hexcode: "#AA2227",
                id: "$(palette).shades.shadeId<dark>",
              },
              {
                alpha: 255,
                hexcode: "#CC2F35",
                id: "$(palette).shades.shadeId<regular>",
              },
            ],
            id: "$(palette).colors.colorId<red>",
          },
          {
            paletteColors: [
              {
                alpha: 255,
                id: "$(palette).shades.shadeId<dark>",
              },
              {
                alpha: 255,
                id: "$(palette).shades.shadeId<light>",
              },
              {
                alpha: 255,
                hexcode: "#FFFFFF",
                id: "$(palette).shades.shadeId<regular>",
              },
            ],
            id: "$(palette).colors.colorId<white>",
          },
        ],
      };

      const schemaMap: { [key: string]: Manifest } = {
        [PLUGIN_PALETTE_MANIFEST.name]: PLUGIN_PALETTE_MANIFEST as Manifest,
      };

      const stateMap = {
        [PLUGIN_PALETTE_MANIFEST.name]: unenforcedUnboundedState,
      };

      const sanitizedState = await defaultVoidedState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        stateMap
      );
      await enforceBoundedSets(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        sanitizedState
      );
      expect(sanitizedState).toEqual({
        palette: {
          colors: [
            {
              colorId: "white",
              name: "White",
            },
            {
              colorId: "red",
              name: "Red",
            },
          ],
          palette: [
            {
              id: "$(palette).colors.colorId<white>",
              paletteColors: [
                {
                  alpha: 255,
                  hexcode: null,
                  id: "$(palette).shades.shadeId<dark>",
                },
                {
                  alpha: 255,
                  hexcode: null,
                  id: "$(palette).shades.shadeId<light>",
                },
                {
                  alpha: 255,
                  hexcode: "#FFFFFF",
                  id: "$(palette).shades.shadeId<regular>",
                },
              ],
            },
            {
              id: "$(palette).colors.colorId<red>",
              paletteColors: [
                {
                  alpha: 255,
                  hexcode: "#AA2227",
                  id: "$(palette).shades.shadeId<dark>",
                },
                {
                  alpha: 255,
                  hexcode: "#CC2F35",
                  id: "$(palette).shades.shadeId<regular>",
                },
                {
                  alpha: 255,
                  hexcode: null,
                  id: "$(palette).shades.shadeId<light>",
                },
              ],
            },
          ],
          shades: [
            {
              name: "Light",
              shadeId: "light",
            },
            {
              name: "Regular",
              shadeId: "regular",
            },
            {
              name: "Dark",
              shadeId: "dark",
            },
          ],
        },
      });
    });
  });

  describe("state validation", () => {
    test("returns true when state is valid", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            nullableProp: {
              type: "int",
              nullable: true,
            },
            nonNullableProp: {
              type: "int",
              nullable: false,
            },
            list: {
              type: "array",
              values: "string",
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

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
      };
      const validStateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "test",
              nonNullableProp: 5,
            },
          ],
        },
      };

      const validState = await validatePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        validStateMap,
        A_PLUGIN_MANIFEST.name
      );
      expect(validState).toEqual(true);
    });

    test("collects invalid references", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            nullableProp: {
              type: "int",
              nullable: true,
            },
            nonNullableProp: {
              type: "int",
              nullable: false,
            },
            list: {
              type: "array",
              values: "string",
            },
            subList: {
              type: "array",
              values: {
                someProp: {
                  type: "string",
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
          files: {
            type: "set",
            values: {
              file: {
                type: "file",
                isKey: true,
              },
            },
          },
        },
      };

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
      };

      const invalidStateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "test",
              nonNullableProp: 3.14,
              nullableProp: 13,
              list: ["ok", "1"],
              subList: [
                {
                  someProp: 1,
                },
                {
                  someProp: "abc",
                },
                {
                  someProp: 3,
                },
              ],
            },
          ],
          files: [
            {
              file: "A",
            },
            {
              file: "B",
            },
          ],
        },
      };

      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        A_PLUGIN_MANIFEST.name,
        invalidStateMap
      );
      const invalidStates = await getPluginInvalidStateIndices(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "A") {
              return true;
            }
            return false;
          },
        },
        schemaMap,
        kvs,
        A_PLUGIN_MANIFEST.name
      );
      expect(invalidStates).toEqual([2, 4, 6]);
    });

    test("collects invalid references for emptyable", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            nullableProp: {
              type: "int",
              nullable: true,
            },
            nonNullableProp: {
              type: "int",
              nullable: false,
            },
            list: {
              type: "array",
              values: "string",
            },
            subList: {
              type: "array",
              emptyable: false,
              values: {
                someProp: {
                  type: "string",
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
          files: {
            type: "set",
            emptyable: false,
            values: {
              file: {
                type: "file",
                isKey: true,
              },
            },
          },
        },
      };

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
      };

      const invalidStateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "test",
              nonNullableProp: 3.14,
              nullableProp: 13,
              list: ["ok", "1"],
              subList: [],
            },
            {
              name: "test2",
              nonNullableProp: 3.14,
              nullableProp: 13,
              list: ["ok", "1"],
              subList: [
                {
                  someProp: "I'M OKAy",
                },
              ],
            },
            {
              name: "test3",
              nonNullableProp: 3.14,
              nullableProp: 13,
              list: ["ok", "1"],
              subList: [],
            },
          ],
          files: [],
        },
      };

      const kvs = await getKVStateForPlugin(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        A_PLUGIN_MANIFEST.name,
        invalidStateMap
      );
      const invalidStates = await getPluginInvalidStateIndices(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "A") {
              return true;
            }
            return false;
          },
        },
        schemaMap,
        kvs,
        A_PLUGIN_MANIFEST.name
      );
      const invalidRootStates = await getInvalidRootStates(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "A") {
              return true;
            }
            return false;
          },
        },
        schemaMap,
        kvs,
        A_PLUGIN_MANIFEST.name
      );
      expect(invalidRootStates).toEqual(["$(a-plugin).files"]);
      expect(invalidStates).toEqual([1, 4]);
    });

    test("returns false when state is invalid", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            nullableProp: {
              type: "int",
              nullable: true,
            },
            nonNullableProp: {
              type: "int",
              nullable: false,
            },
            list: {
              type: "array",
              values: "string",
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

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
      };

      const invalidStateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "test",
              nullableProp: 2,
            },
          ],
        },
      };

      const invalidState = await validatePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        invalidStateMap,
        A_PLUGIN_MANIFEST.name
      );
      expect(invalidState).toEqual(false);
    });

    test("returns true when empty array is emptyable", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            list: {
              type: "array",
              values: {
                name: {
                  type: "string",
                },
              },
              emptyable: false,
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

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
      };

      const validStateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "test",
              list: [
                {
                  name: "something",
                },
              ],
            },
          ],
        },
      };

      const validState = await validatePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        validStateMap,
        A_PLUGIN_MANIFEST.name
      );
      expect(validState).toEqual(true);
    });

    test("returns false when empty array is not emptyable", async () => {
      const A_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            list: {
              type: "array",
              values: {
                name: {
                  type: "string",
                },
              },
              emptyable: false,
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

      const schemaMap: { [key: string]: Manifest } = {
        "a-plugin": A_PLUGIN_MANIFEST as Manifest,
      };

      const invalidStateMap = {
        [A_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "test",
              list: [],
            },
          ],
        },
      };

      const invalidState = await validatePluginState(
        {
          ...datasource,
          getPluginManifest: async (pluginName) => {
            return schemaMap[pluginName];
          },
        },
        schemaMap,
        invalidStateMap,
        A_PLUGIN_MANIFEST.name
      );
      expect(invalidState).toEqual(false);
    });
  });

  describe("topological subset", () => {
    test("returns true when is not a valid subset", async () => {
      const BEFORE_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            someProp: {
              type: "int",
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

      const beforeSchemaMap: { [key: string]: Manifest } = {
        "a-plugin": BEFORE_PLUGIN_MANIFEST as Manifest,
      };
      const beforeStateMap = {
        [BEFORE_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "a",
              someProp: 1,
            },
            {
              name: "b",
              someProp: 2,
            },
          ],
        },
      };

      const AFTER_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            someProp: {
              type: "int",
            },
            newProp: {
              type: "float",
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

      const afterSchemaMap: { [key: string]: Manifest } = {
        "a-plugin": AFTER_PLUGIN_MANIFEST as Manifest,
      };
      const afterStateMap = {
        [AFTER_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "a",
              someProp: 15,
              newProp: 0.5,
            },
            {
              name: "b",
              someProp: 20,
              newProp: 1.5,
            },
            {
              name: "c",
              someProp: 3,
              newProp: 2.5,
            },
          ],
        },
      };
      const isTopSubset = await isTopologicalSubsetValid(
        {
          ...datasource,
          getPluginManifest: async (pluginName, pluginVersion) => {
            if (pluginVersion == "0.0.0") {
              return beforeSchemaMap[pluginName];
            }
            return afterSchemaMap[pluginName];
          },
        },
        beforeSchemaMap,
        beforeStateMap,
        afterSchemaMap,
        afterStateMap,
        BEFORE_PLUGIN_MANIFEST.name
      );
      expect(isTopSubset).toEqual(true);
    });

    test("returns false when is NOT a valid subset", async () => {
      const BEFORE_PLUGIN_MANIFEST = {
        version: "0.0.0",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            someProp: {
              type: "int",
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

      const beforeSchemaMap: { [key: string]: Manifest } = {
        "a-plugin": BEFORE_PLUGIN_MANIFEST as Manifest,
      };
      const beforeStateMap = {
        [BEFORE_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "a",
              someProp: 1,
            },
            {
              name: "b",
              someProp: 2,
            },
          ],
        },
      };

      const AFTER_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            someProp: {
              type: "int",
            },
            newProp: {
              type: "float",
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

      const afterSchemaMap: { [key: string]: Manifest } = {
        "a-plugin": AFTER_PLUGIN_MANIFEST as Manifest,
      };
      const afterStateMap = {
        [AFTER_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "a",
              someProp: 15,
              newProp: 0.5,
            },
            {
              name: "c",
              someProp: 3,
              newProp: 2.5,
            },
          ],
        },
      };
      const isTopSubset = await isTopologicalSubsetValid(
        {
          ...datasource,
          getPluginManifest: async (pluginName, pluginVersion) => {
            if (pluginVersion == "0.0.0") {
              return beforeSchemaMap[pluginName];
            }
            return afterSchemaMap[pluginName];
          },
        },
        beforeSchemaMap,
        beforeStateMap,
        afterSchemaMap,
        afterStateMap,
        BEFORE_PLUGIN_MANIFEST.name
      );
      expect(isTopSubset).toEqual(false);
      const B_AFTER_PLUGIN_MANIFEST = {
        version: "0.0.1",
        name: "a-plugin",
        displayName: "A",
        icon: {
          light: "./palette-plugin-icon.svg",
          dark: "./palette-plugin-icon.svg",
        },
        imports: {},
        types: {
          typeA: {
            name: {
              type: "string",
              isKey: true,
            },
            someProp: {
              type: "int",
              nullable: true,
            },
            newProp: {
              type: "float",
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

      const bAfterSchemaMap: { [key: string]: Manifest } = {
        "a-plugin": B_AFTER_PLUGIN_MANIFEST as Manifest,
      };
      const bAfterStateMap = {
        [AFTER_PLUGIN_MANIFEST.name]: {
          aObjects: [
            {
              name: "a",
              someProp: 15,
              newProp: 0.5,
            },
            {
              name: "b",
              newProp: 0.5,
            },
            {
              name: "c",
              someProp: 3,
              newProp: 2.5,
            },
          ],
        },
      };
      expect(
        await validatePluginState(
          {
            ...datasource,
            getPluginManifest: async (pluginName, pluginVersion) => {
              if (pluginVersion == "0.0.0") {
                return beforeSchemaMap[pluginName];
              }
              return afterSchemaMap[pluginName];
            },
          },
          bAfterSchemaMap,
          bAfterStateMap,
          BEFORE_PLUGIN_MANIFEST.name
        )
      ).toBe(true);
      const bIsTopSubset = await isTopologicalSubsetValid(
        {
          ...datasource,
          getPluginManifest: async (pluginName, pluginVersion) => {
            if (pluginVersion == "0.0.0") {
              return beforeSchemaMap[pluginName];
            }
            return afterSchemaMap[pluginName];
          },
        },
        beforeSchemaMap,
        beforeStateMap,
        bAfterSchemaMap,
        bAfterStateMap,
        BEFORE_PLUGIN_MANIFEST.name
      );
      expect(bIsTopSubset).toEqual(false);
    });
  });
});
