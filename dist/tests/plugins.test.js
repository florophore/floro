"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memfs_1 = require("memfs");
const filestructure_1 = require("../src/filestructure");
const plugins_1 = require("../src/plugins");
const fsmocks_1 = require("./helpers/fsmocks");
const pluginmocks_1 = require("./helpers/pluginmocks");
jest.mock("fs");
jest.mock("fs/promises");
describe("plugins", () => {
    beforeEach(async () => {
        memfs_1.fs.mkdirSync(filestructure_1.userHome, { recursive: true });
        (0, filestructure_1.buildFloroFilestructure)();
        await (0, fsmocks_1.makeSignedInUser)();
    });
    afterEach(() => {
        memfs_1.vol.reset();
    });
    describe("getPluginManifest", () => {
        test("returns dev manifest", async () => {
            (0, fsmocks_1.makeTestPlugin)(pluginmocks_1.SIMPLE_PLUGIN_MANIFEST, true);
            const manifest = await (0, plugins_1.getPluginManifest)("simple", [
                {
                    key: "simple",
                    value: "dev@0.0.0",
                },
            ], plugins_1.readPluginManifest);
            expect(manifest).toEqual(pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
        });
        test("returns non-dev manifest", async () => {
            (0, fsmocks_1.makeTestPlugin)(pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
            const manifest = await (0, plugins_1.getPluginManifest)("simple", [
                {
                    key: "simple",
                    value: "0.0.0",
                },
            ], plugins_1.readPluginManifest);
            expect(manifest).toEqual(pluginmocks_1.SIMPLE_PLUGIN_MANIFEST);
        });
    });
    describe("getKVStateForPlugin", () => {
        test("flatten simple object", () => {
            const kvs = (0, plugins_1.getKVStateForPlugin)({
                [pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name]: pluginmocks_1.SIMPLE_PLUGIN_MANIFEST,
            }, pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name, {
                [pluginmocks_1.SIMPLE_PLUGIN_MANIFEST.name]: {
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
            });
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
        test("obeys key lexical order", () => {
            const PLUGIN_A_MANIFEST = {
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
            const kvs = (0, plugins_1.getKVStateForPlugin)({
                [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST,
            }, PLUGIN_A_MANIFEST.name, {
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
            });
            const s1 = (0, plugins_1.getStateFromKVForPlugin)({ [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST }, kvs, PLUGIN_A_MANIFEST.name);
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
        test("can handle references that are key types", () => {
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
            const kvs = (0, plugins_1.getKVStateForPlugin)({
                [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST,
            }, PLUGIN_A_MANIFEST.name, {
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
            });
            const s1 = (0, plugins_1.getStateFromKVForPlugin)({ [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST }, kvs, PLUGIN_A_MANIFEST.name);
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
        test("can serialize array and set primitive array or set state", () => {
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
            const kvs = (0, plugins_1.getKVStateForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, ARRAY_PLUGIN_MANIFEST.name, {
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
            });
            const s1 = (0, plugins_1.getStateFromKVForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, kvs, ARRAY_PLUGIN_MANIFEST.name);
            const kv2 = (0, plugins_1.getKVStateForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, ARRAY_PLUGIN_MANIFEST.name, {
                [ARRAY_PLUGIN_MANIFEST.name]: s1,
            });
            const s2 = (0, plugins_1.getStateFromKVForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, kv2, ARRAY_PLUGIN_MANIFEST.name);
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
            const kvs = (0, plugins_1.getKVStateForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, ARRAY_PLUGIN_MANIFEST.name, {
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
            });
            const s1 = (0, plugins_1.getStateFromKVForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, kvs, ARRAY_PLUGIN_MANIFEST.name);
            const kv2 = (0, plugins_1.getKVStateForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, ARRAY_PLUGIN_MANIFEST.name, {
                [ARRAY_PLUGIN_MANIFEST.name]: s1,
            });
            const s2 = (0, plugins_1.getStateFromKVForPlugin)({ [ARRAY_PLUGIN_MANIFEST.name]: ARRAY_PLUGIN_MANIFEST }, kv2, ARRAY_PLUGIN_MANIFEST.name);
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
    describe("can stich schemas", () => {
        test("getRootSchemaForPlugin", () => {
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
            const rootSchemaMap = (0, plugins_1.getRootSchemaMap)(schemaMap);
            expect(rootSchemaMap).toEqual({
                "a-plugin": {
                    aObjects: {
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
        test("returns true when ordering of rootSchema keys change", () => {
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
            const isSubset = (0, plugins_1.pluginManifestIsSubsetOfManifest)(currentSchemaMap, nextSchemaMap, "a-plugin");
            expect(isSubset).toBe(true);
        });
        test("returns true when current rootSchema is subset of next rootSchema", () => {
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
            const isSubset = (0, plugins_1.pluginManifestIsSubsetOfManifest)(currentSchemaMap, nextSchemaMap, "b-plugin");
            expect(isSubset).toBe(true);
        });
        test("returns false when current rootSchema is NOT subset of next rootSchema", () => {
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
            const NEXT_B_PLUGIN_MANIFEST = {
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
            const isSubset = (0, plugins_1.pluginManifestIsSubsetOfManifest)(currentSchemaMap, nextSchemaMap, "b-plugin");
            expect(isSubset).toBe(false);
        });
    });
    describe("cascading", () => {
        test("cascades deletions down plugin chain", () => {
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
            const cascadedAState = (0, plugins_1.cascadePluginState)(schemaMap, stateMap, A_PLUGIN_MANIFEST.name);
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
        test("respects nullify", () => {
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
            const cascadedAState = (0, plugins_1.cascadePluginState)(schemaMap, stateMap, A_PLUGIN_MANIFEST.name);
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
        test("can cascade multi chained references", () => {
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
            const schemaMap = {
                [PLUGIN_A_MANIFEST.name]: PLUGIN_A_MANIFEST,
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
            const cascadedAState = (0, plugins_1.cascadePluginState)(schemaMap, stateMap, PLUGIN_A_MANIFEST.name);
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
    });
    describe("state validation", () => {
        test("returns true when state is valid", () => {
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
            const schemaMap = {
                "a-plugin": A_PLUGIN_MANIFEST,
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
            const validState = (0, plugins_1.validatePluginState)(schemaMap, validStateMap, A_PLUGIN_MANIFEST.name);
            expect(validState).toEqual(true);
        });
        test("returns false when state is invalid", () => {
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
            const schemaMap = {
                "a-plugin": A_PLUGIN_MANIFEST,
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
            const invalidState = (0, plugins_1.validatePluginState)(schemaMap, invalidStateMap, A_PLUGIN_MANIFEST.name);
            expect(invalidState).toEqual(false);
        });
        test("returns true when empty array is emptyable", () => {
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
            const schemaMap = {
                "a-plugin": A_PLUGIN_MANIFEST,
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
            const validState = (0, plugins_1.validatePluginState)(schemaMap, validStateMap, A_PLUGIN_MANIFEST.name);
            expect(validState).toEqual(true);
        });
        test("returns false when empty array is not emptyable", () => {
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
            const schemaMap = {
                "a-plugin": A_PLUGIN_MANIFEST,
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
            const invalidState = (0, plugins_1.validatePluginState)(schemaMap, invalidStateMap, A_PLUGIN_MANIFEST.name);
            expect(invalidState).toEqual(false);
        });
    });
    describe("topological subset", () => {
        test("returns true when is not a valid subset", () => {
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
            const beforeSchemaMap = {
                "a-plugin": BEFORE_PLUGIN_MANIFEST,
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
            const afterSchemaMap = {
                "a-plugin": AFTER_PLUGIN_MANIFEST,
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
            const isTopSubset = (0, plugins_1.isTopologicalSubsetValid)(beforeSchemaMap, beforeStateMap, afterSchemaMap, afterStateMap, BEFORE_PLUGIN_MANIFEST.name);
            expect(isTopSubset).toEqual(true);
        });
        test("returns false when is NOT a valid subset", () => {
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
            const beforeSchemaMap = {
                "a-plugin": BEFORE_PLUGIN_MANIFEST,
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
            const afterSchemaMap = {
                "a-plugin": AFTER_PLUGIN_MANIFEST,
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
            const isTopSubset = (0, plugins_1.isTopologicalSubsetValid)(beforeSchemaMap, beforeStateMap, afterSchemaMap, afterStateMap, BEFORE_PLUGIN_MANIFEST.name);
            expect(isTopSubset).toEqual(false);
            const B_AFTER_PLUGIN_MANIFEST = {
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
            const bAfterSchemaMap = {
                "a-plugin": B_AFTER_PLUGIN_MANIFEST,
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
            expect((0, plugins_1.validatePluginState)(bAfterSchemaMap, bAfterStateMap, BEFORE_PLUGIN_MANIFEST.name)).toBe(true);
            const bIsTopSubset = (0, plugins_1.isTopologicalSubsetValid)(beforeSchemaMap, beforeStateMap, bAfterSchemaMap, bAfterStateMap, BEFORE_PLUGIN_MANIFEST.name);
            expect(bIsTopSubset).toEqual(false);
        });
    });
});
//# sourceMappingURL=plugins.test.js.map