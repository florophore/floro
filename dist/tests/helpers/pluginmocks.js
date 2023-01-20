"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIMPLE_PLUGIN_MANIFEST = void 0;
exports.SIMPLE_PLUGIN_MANIFEST = {
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
                isKey: true,
            },
            value: {
                type: "string",
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
//# sourceMappingURL=pluginmocks.js.map