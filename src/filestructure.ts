import path from "path";
import os from 'os';
import fs from 'fs';
import { Manifest } from "./plugins";

// ~/
export const userHome = os.homedir();
// ~/.floro_env
export const floroEnvPath = path.join(userHome, ".floro_env");
let floroEnv: "production" | "staging" | "dev" =
  fs.existsSync(floroEnvPath) ? (fs.readFileSync(floroEnvPath, { encoding: "utf-8" })?.trim?.() as
    | "production"
    | "staging"
    | "dev") ?? "production" : "production";

export const setFloroEnv = (env: "production"|"staging"|"dev") => {
    fs.writeFileSync(floroEnvPath, env);
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(floroEnvPath, 0o755);
    }
    floroEnv = env;
}

const getEnvHomeName = () => {
  if (floroEnv == "staging") {
    return `.floro_staging`;
  }
  if (floroEnv == "dev") {
    return `.floro_dev`;
  }
  return ".floro";
}

export const getNoramlizedEnv = () => {
  if (floroEnv == "staging") {
    return `staging`;
  }
  if (floroEnv == "dev") {
    return `development`;
  }
  return "production";
}

const getEnvRemoteHostName = () => {
  if (floroEnv == "staging") {
    return `https://floro-staging.com`;
  }
  if (floroEnv == "dev") {
    return `http://localhost:9000`;
  }
  return "https://floro.io";
}

// DIRECTORIES
// ~/.floro|~/.floro_dev|~/.floro_staging
export const homePath = () => path.join(userHome, getEnvHomeName());
// ~/.floro/config
export const vConfigPath = () => path.join(homePath(), "config");
// ~/.floro/cache
export const vCachePath = () => path.join(homePath(), "cache");
// ~/.floro/user
export const vUserPath = () => path.join(homePath(), "user");
// ~/.floro/repos
export const vReposPath = () => path.join(homePath(), "repos");
// ~/.floro/plugins
export const vPluginsPath = () => path.join(homePath(), "plugins");
// ~/.floro/tmp
export const vTMPPath = () => path.join(homePath(), "tmp");
// ~/.floro/dev
export const vDEVPath = () => path.join(homePath(), "dev");
// ~/.floro/keys
export const vKeysPath = () => path.join(homePath(), "keys");
// ~/.floro/binaries
export const vBinariesPath = () => path.join(homePath(), "binaries");
// ~/.floro/keys/api_keys.json
export const apiKeysJSON = () => path.join(vKeysPath(), "api_keys.json");
// ~/.floro/keys/webhook_keys.json
export const webhookKeysJSON = () => path.join(vKeysPath(), "webhook_keys.json");

// FILES
// CONFIG
// ~/.floro/config/cors.txt
export const vConfigCORSPath = () =>  path.join(vConfigPath(), "cors.txt");
// ~/.floro/config/remote.txt
export const vConfigRemotePath = () => path.join(vConfigPath(), "remote.txt");
// ~/.floro/config/plugins.json
export const vConfigPluginsPath = () => path.join(vConfigPath(), "plugins.json");

// ~/.floro/config/dev_manifest_cache.json
export const vDevManifestCachePath = () => path.join(vCachePath(), "dev_manifest_cache.json");
// USER
// ~/.floro/user/session.json
export const userSessionPath = () => path.join(vUserPath(), "session.json");
// ~/.floro/user/user.json
export const userPath = () => path.join(vUserPath(), "user.json");

const NODE_ENV = process.env.NODE_ENV;

const writeDefaultFiles = (isReset = false) => {
  let defaultCorsRegex = `https?:\/\/(localhost|127.0.0.1):[0-9]{1,5}`;
  // ~/.floro/config/cors.txt
  if (isReset || !fs.existsSync(vConfigCORSPath())) {
    fs.writeFileSync(vConfigCORSPath(), `
    # Add origins with CORS access to the floro server.
    # Separate each origin by a new line, a '#' ignores a line

    # Default allow any application on localhost or 127.0.0.1
    ${defaultCorsRegex}
    `.split(os.EOL).map(s => s.trimStart()).slice(1).join(os.EOL));
  }

  // FILES
  // ~/.floro/config/cors.txt
  if (isReset || !fs.existsSync(vConfigRemotePath())) {
    let defaultHost = getEnvRemoteHostName();
    fs.writeFileSync(vConfigRemotePath(), `
    # Add the remote origin against which to run floro.
    ${defaultHost}
    `.split(os.EOL).map(s => s.trimStart()).slice(1).join(os.EOL));
  }

  // FILES
  // ~/.floro/config/plugins.json
  if (isReset || !fs.existsSync(vConfigPluginsPath())) {
    fs.writeFileSync(vConfigPluginsPath(), JSON.stringify({ plugins: {}}, null, 2));
  }

  // FILES
  // ~/.floro/config/plugins.json
  if (isReset || !fs.existsSync(vDevManifestCachePath())) {
    fs.writeFileSync(vDevManifestCachePath(), JSON.stringify({}, null, 2));
  }

  if (isReset || !fs.existsSync(apiKeysJSON())) {
    fs.writeFileSync(apiKeysJSON(), JSON.stringify([], null, 2));
  }

  if (isReset || !fs.existsSync(webhookKeysJSON())) {
    fs.writeFileSync(webhookKeysJSON(), JSON.stringify([], null, 2));
  }
}

export const buildFloroFilestructure = (): void => {
  if (!fs.existsSync(homePath())) {
    fs.mkdirSync(homePath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(homePath(), 0o755);
    }
  }

  if (!fs.existsSync(vConfigPath())) {
    fs.mkdirSync(vConfigPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vConfigPath(), 0o755);
    }
  }

  if (!fs.existsSync(vCachePath())) {
    fs.mkdirSync(vCachePath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vCachePath(), 0o755);
    }
  }

  if (!fs.existsSync(vUserPath())) {
    fs.mkdirSync(vUserPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vUserPath(), 0o755);
    }
  }

  if (!fs.existsSync(vBinariesPath())) {
    fs.mkdirSync(vBinariesPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vBinariesPath(), 0o755);
    }
  }

  if (!fs.existsSync(vReposPath()) && os.platform() != "win32") {
    fs.mkdirSync(vReposPath());
    if (NODE_ENV != "test") {
      fs.chmodSync(vReposPath(), 0o755);
    }
  }

  if (!fs.existsSync(vPluginsPath())) {
    fs.mkdirSync(vPluginsPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vPluginsPath(), 0o755);
    }
  }

  if (!fs.existsSync(vTMPPath())) {
    fs.mkdirSync(vTMPPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vTMPPath(), 0o755);
    }
  }

  if (!fs.existsSync(vDEVPath())) {
    fs.mkdirSync(vDEVPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vDEVPath(), 0o755);
    }
  }

  if (!fs.existsSync(vKeysPath())) {
    fs.mkdirSync(vKeysPath());
    if (NODE_ENV != "test" && os.platform() != "win32") {
      fs.chmodSync(vKeysPath(), 0o755);
    }
  }

  writeDefaultFiles();
}

export const reset = async (): Promise<void> => {

  // FILES
  // ~/.floro/config/cors.txt
  writeDefaultFiles(true);
}

export const writeUserSession = (session) => {
  return fs.promises.writeFile(userSessionPath(), JSON.stringify(session, null, 2))
}

export const removeUserSession = () => {
  return fs.promises.rm(userSessionPath());
}

export const getUserSession = (): {clientKey: string, expiresAt: string, user: User}|null => {
  try {
    const userSessionJSON = fs.readFileSync(userSessionPath(), { encoding: 'utf-8' });
    return JSON.parse(userSessionJSON);
  } catch(e) {
    return null;
  }
}

export const getUserSessionAsync = async (): Promise<{clientKey: string, expiresAt: string, user: User}|null> => {
  try {
    const userSessionJSON = await fs.promises.readFile(userSessionPath(), { encoding: 'utf-8' });
    return JSON.parse(userSessionJSON);
  } catch(e) {
    return null;
  }
}

export const writeUser = (user) => {
  return fs.promises.writeFile(userPath(), JSON.stringify(user, null, 2))
}

export const removeUser = () => {
  return fs.promises.rm(userPath());
}

export interface User {
  id: string;
  username: string;
}

export const getUser = (): User|null => {
  try {
    const userJSON = fs.readFileSync(userPath(), { encoding: 'utf-8' });
    return JSON.parse(userJSON);
  } catch(e) {
    return null;
  }
}

export const getUserAsync = async (): Promise<User|null> => {
  try {
    const userJSON = await fs.promises.readFile(userPath(), { encoding: 'utf-8' });
    return JSON.parse(userJSON);
  } catch(e) {
    return null;
  }
}

export const existsAsync = (file): Promise<boolean> => {
  return fs.promises
    .access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}

export const copyDirectory = async (src: string, dest: string): Promise<void> => {
  const [entries] = await Promise.all([
    fs.promises.readdir(src, { withFileTypes: true }),
    fs.promises.mkdir(dest, { recursive: true }),
  ])

  await Promise.all(
    entries.map((entry) => {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      return entry.isDirectory()
        ? copyDirectory(srcPath, destPath)
        : fs.promises.copyFile(srcPath, destPath)
    })
  )
}

export const getPluginsJson = (): {plugins: {[key: string]: { proxy?: boolean, version?: string, host?: string}}} => {
  try {
    const remotePluginsJSON = fs.readFileSync(vConfigPluginsPath(), { encoding: 'utf-8' });
    return JSON.parse(remotePluginsJSON);
  } catch(e) {
    return {plugins: {}};
  }
}

export const getPluginsJsonAsync = async (): Promise<{plugins: {[key: string]: { proxy?: boolean, host?: string}}}> => {
  try {
    const remotePluginsJSON = await fs.promises.readFile(vConfigPluginsPath(), { encoding: 'utf-8' });
    return JSON.parse(remotePluginsJSON);
  } catch(e) {
    return {plugins: {}};
  }
}
export const writePluginsJsonAsync = async (plugins: {[key: string]: { proxy?: boolean, host?: string}}): Promise<void> => {
  try {
    const str = JSON.stringify(plugins, null, 2);
    await fs.promises.writeFile(vConfigPluginsPath(), str);
    return;
  } catch(e) {
    return;
  }
}

export const getRemoteHostSync = (): string => {
  try {
    const remoteHostTxt = fs.readFileSync(vConfigRemotePath(), { encoding: 'utf-8'});
    return remoteHostTxt.toString().split(os.EOL).find(s => {
      if (s.trimStart()[0] == '#') {
        return false
      }
      if(s.trim() == '') {
        return false;
      }
      return s.trim();
    })
  } catch(e) {
    return 'https://floro.io';
  }

}

export const getRemoteHostAsync = async (): Promise<string> => {
  try {
    const remoteHostTxt = await fs.promises.readFile(vConfigRemotePath(), { encoding: 'utf-8'});
    return remoteHostTxt.toString().split(os.EOL).find(s => {
      if (s.trimStart()[0] == '#') {
        return false
      }
      if(s.trim() == '') {
        return false;
      }
      return s.trim();
    })
  } catch(e) {
    return 'https://floro.io';
  }
}

export const writeToDevManifestCache = async (
  pluginName: string,
  manifest: Manifest
): Promise<{ [key: string]: Manifest }> => {
  try {
    const manifestCacheString = await fs.promises.readFile(
      vDevManifestCachePath(),
      { encoding: "utf-8" }
    );
    const cache = JSON.parse(
      (manifestCacheString.toString() ?? "") == ""
        ? "{}"
        : manifestCacheString.toString()
    );
    cache[pluginName] = manifest;
    await fs.promises.writeFile(
      vDevManifestCachePath(),
      JSON.stringify(cache, null, 2)
    );
    return cache;
  } catch (e) {
    return {};
  }
};

export const getDevManifestCache = async (): Promise<{
  [key: string]: Manifest;
}> => {
  try {
    const manifestCache = await fs.promises.readFile(
      vDevManifestCachePath()
    );
    return JSON.parse(manifestCache.toString());
  } catch (e) {
    return null;
  }
};