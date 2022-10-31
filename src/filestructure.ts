import path from "path";
import os from 'os';
import fs from 'fs';

// DIRECTORIES
// ~/
export const userHome = os.homedir();
// ~/.floro
export const homePath = path.join(userHome, ".floro");
// ~/.floro/config
export const vConfigPath = path.join(homePath, "config");
// ~/.floro/cache
export const vCachePath = path.join(homePath, "cache");
// ~/.floro/user
export const vUserPath = path.join(homePath, "user");
// ~/.floro/projects
export const vProjectsPath = path.join(homePath, "projects");
// ~/.floro/plugins
export const vPluginsPath = path.join(homePath, "plugins");

// FILES
// CONFIG
// ~/.floro/config/cors.txt
export const vConfigCORSPath = path.join(vConfigPath, "cors.txt");
// ~/.floro/config/remote.txt
export const vConfigRemotePath = path.join(vConfigPath, "remote.txt");
// ~/.floro/config/plugins.json
export const vConfigPluginsPath = path.join(vConfigPath, "plugins.json");
// USER
// ~/.floro/user/session.json
export const userSessionPath = path.join(vUserPath, "session.json");
// ~/.floro/user/user.json
export const userPath = path.join(vUserPath, "user.json");

const writeDefaultFiles = (isReset = false) => {
  // ~/.floro/config/cors.txt
  if (isReset || !fs.existsSync(vConfigCORSPath)) {
    fs.writeFileSync(vConfigCORSPath, `
    # Add origins with CORS access to the floro server.
    # Separate each origin by a new line, a '#' ignores a line

    # Default allow any application on localhost or 127.0.0.1
    https?:\/\/(localhost|127.0.0.1):[0-9]{1,5}
    `.split(os.EOL).map(s => s.trimStart()).slice(1).join(os.EOL));
  }

  // FILES
  // ~/.floro/config/cors.txt
  if (isReset || !fs.existsSync(vConfigRemotePath)) { 
    fs.writeFileSync(vConfigRemotePath, `
    # Add the remote origin against which to run floro.
    https://floro.io
    `.split(os.EOL).map(s => s.trimStart()).slice(1).join(os.EOL));
  }

  // FILES
  // ~/.floro/config/plugins.json
  if (isReset || !fs.existsSync(vConfigPluginsPath)) { 
    fs.writeFileSync(vConfigPluginsPath, JSON.stringify({ plugins: {}}, null, 2));
  }
}

export const buildFloroFilestructure = (): void => {
  if (!fs.existsSync(homePath)) {
    fs.mkdirSync(homePath, 744);
  }
  if (!fs.existsSync(vConfigPath)) {
    fs.mkdirSync(vConfigPath, 744);
  }

  if (!fs.existsSync(vCachePath)) {
    fs.mkdirSync(vCachePath, 744);
  }

  if (!fs.existsSync(vUserPath)) {
    fs.mkdirSync(vUserPath, 744);
  }

  if (!fs.existsSync(vProjectsPath)) {
    fs.mkdirSync(vProjectsPath, 744);
  }

  if (!fs.existsSync(vPluginsPath)) {
    fs.mkdirSync(vPluginsPath, 744);
  }

  writeDefaultFiles();
}

export const clean = (): void => {

} 

export const reset = (): void => {

  // FILES
  // ~/.floro/config/cors.txt
  writeDefaultFiles(true);
}

export const writeUserSession = (session) => {
  return fs.promises.writeFile(userSessionPath, JSON.stringify(session, null, 2))
}

export const getUserSession = () => {
  try {
    const userSessionJSON = fs.readFileSync(userSessionPath, { encoding: 'utf-8' });
    return JSON.parse(userSessionJSON);
  } catch(e) {
    return null;
  }
}

export const writeUser = (user) => {
  return fs.promises.writeFile(userPath, JSON.stringify(user, null, 2))
}

export const getUser = () => {
  try {
    const userJSON = fs.readFileSync(userPath, { encoding: 'utf-8' });
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

export const getPluginsJson = (): {plugins: {[key: string]: string}} => {
  try {
    const remotePluginsJSON = fs.readFileSync(vConfigPluginsPath, { encoding: 'utf-8' });
    return JSON.parse(remotePluginsJSON);
  } catch(e) {
    return {plugins: {}};
  }
}

export const getRemoteHostSync = (): string => {
  try {
    const remoteHostTxt = fs.readFileSync(vConfigRemotePath);
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
    const remoteHostTxt = await fs.promises.readFile(vConfigRemotePath);
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