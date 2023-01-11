import fs from 'fs';
import path from 'path';
import { getPluginsJson, vDEVPath, vPluginsPath } from '../../src/filestructure';
import { Manifest } from "../../src/plugins";

export const SIMPLE_PLUGIN_MANIFEST: Manifest = {
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

export const createPlugin = (manifest: Manifest, isDev: boolean = false) => {
  const pluginDirName = `${manifest.name.toLowerCase()}@${manifest.version}`
  const pluginDir = path.join(isDev ? vDEVPath : vPluginsPath, pluginDirName);
  const pluginFloroDir = path.join(pluginDir, 'floro');
  fs.mkdirSync(pluginDir);
  fs.mkdirSync(pluginFloroDir);
  const manifestString = JSON.stringify(manifest, null, 2);
  const manifestPath = path.join(pluginFloroDir, 'floro.manifest.json');
  fs.writeFileSync(manifestPath, manifestString);
} 
