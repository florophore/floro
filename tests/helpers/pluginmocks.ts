import { Manifest } from "../../src/plugins";

export const SIMPLE_PLUGIN_MANIFEST: Manifest = {
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