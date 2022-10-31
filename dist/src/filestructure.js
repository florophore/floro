"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRemoteHostAsync = exports.getRemoteHostSync = exports.getPluginsJson = exports.existsAsync = exports.getUserAsync = exports.getUser = exports.removeUser = exports.writeUser = exports.getUserSessionAsync = exports.getUserSession = exports.removeUserSession = exports.writeUserSession = exports.reset = exports.clean = exports.buildFloroFilestructure = exports.userPath = exports.userSessionPath = exports.vConfigPluginsPath = exports.vConfigRemotePath = exports.vConfigCORSPath = exports.vPluginsPath = exports.vProjectsPath = exports.vUserPath = exports.vCachePath = exports.vConfigPath = exports.homePath = exports.userHome = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
// DIRECTORIES
// ~/
exports.userHome = os_1.default.homedir();
// ~/.floro
exports.homePath = path_1.default.join(exports.userHome, ".floro");
// ~/.floro/config
exports.vConfigPath = path_1.default.join(exports.homePath, "config");
// ~/.floro/cache
exports.vCachePath = path_1.default.join(exports.homePath, "cache");
// ~/.floro/user
exports.vUserPath = path_1.default.join(exports.homePath, "user");
// ~/.floro/projects
exports.vProjectsPath = path_1.default.join(exports.homePath, "projects");
// ~/.floro/plugins
exports.vPluginsPath = path_1.default.join(exports.homePath, "plugins");
// FILES
// CONFIG
// ~/.floro/config/cors.txt
exports.vConfigCORSPath = path_1.default.join(exports.vConfigPath, "cors.txt");
// ~/.floro/config/remote.txt
exports.vConfigRemotePath = path_1.default.join(exports.vConfigPath, "remote.txt");
// ~/.floro/config/plugins.json
exports.vConfigPluginsPath = path_1.default.join(exports.vConfigPath, "plugins.json");
// USER
// ~/.floro/user/session.json
exports.userSessionPath = path_1.default.join(exports.vUserPath, "session.json");
// ~/.floro/user/user.json
exports.userPath = path_1.default.join(exports.vUserPath, "user.json");
const writeDefaultFiles = (isReset = false) => {
    // ~/.floro/config/cors.txt
    if (isReset || !fs_1.default.existsSync(exports.vConfigCORSPath)) {
        fs_1.default.writeFileSync(exports.vConfigCORSPath, `
    # Add origins with CORS access to the floro server.
    # Separate each origin by a new line, a '#' ignores a line

    # Default allow any application on localhost or 127.0.0.1
    https?:\/\/(localhost|127.0.0.1):[0-9]{1,5}
    `.split(os_1.default.EOL).map(s => s.trimStart()).slice(1).join(os_1.default.EOL));
    }
    // FILES
    // ~/.floro/config/cors.txt
    if (isReset || !fs_1.default.existsSync(exports.vConfigRemotePath)) {
        fs_1.default.writeFileSync(exports.vConfigRemotePath, `
    # Add the remote origin against which to run floro.
    https://floro.io
    `.split(os_1.default.EOL).map(s => s.trimStart()).slice(1).join(os_1.default.EOL));
    }
    // FILES
    // ~/.floro/config/plugins.json
    if (isReset || !fs_1.default.existsSync(exports.vConfigPluginsPath)) {
        fs_1.default.writeFileSync(exports.vConfigPluginsPath, JSON.stringify({ plugins: {} }, null, 2));
    }
};
const buildFloroFilestructure = () => {
    if (!fs_1.default.existsSync(exports.homePath)) {
        fs_1.default.mkdirSync(exports.homePath, 744);
    }
    if (!fs_1.default.existsSync(exports.vConfigPath)) {
        fs_1.default.mkdirSync(exports.vConfigPath, 744);
    }
    if (!fs_1.default.existsSync(exports.vCachePath)) {
        fs_1.default.mkdirSync(exports.vCachePath, 744);
    }
    if (!fs_1.default.existsSync(exports.vUserPath)) {
        fs_1.default.mkdirSync(exports.vUserPath, 744);
    }
    if (!fs_1.default.existsSync(exports.vProjectsPath)) {
        fs_1.default.mkdirSync(exports.vProjectsPath, 744);
    }
    if (!fs_1.default.existsSync(exports.vPluginsPath)) {
        fs_1.default.mkdirSync(exports.vPluginsPath, 744);
    }
    writeDefaultFiles();
};
exports.buildFloroFilestructure = buildFloroFilestructure;
const clean = () => {
};
exports.clean = clean;
const reset = () => {
    // FILES
    // ~/.floro/config/cors.txt
    writeDefaultFiles(true);
};
exports.reset = reset;
const writeUserSession = (session) => {
    return fs_1.default.promises.writeFile(exports.userSessionPath, JSON.stringify(session, null, 2));
};
exports.writeUserSession = writeUserSession;
const removeUserSession = () => {
    return fs_1.default.promises.rm(exports.userSessionPath);
};
exports.removeUserSession = removeUserSession;
const getUserSession = () => {
    try {
        const userSessionJSON = fs_1.default.readFileSync(exports.userSessionPath, { encoding: 'utf-8' });
        return JSON.parse(userSessionJSON);
    }
    catch (e) {
        return null;
    }
};
exports.getUserSession = getUserSession;
const getUserSessionAsync = async () => {
    try {
        const userSessionJSON = await fs_1.default.promises.readFile(exports.userSessionPath, { encoding: 'utf-8' });
        return JSON.parse(userSessionJSON);
    }
    catch (e) {
        return null;
    }
};
exports.getUserSessionAsync = getUserSessionAsync;
const writeUser = (user) => {
    return fs_1.default.promises.writeFile(exports.userPath, JSON.stringify(user, null, 2));
};
exports.writeUser = writeUser;
const removeUser = () => {
    return fs_1.default.promises.rm(exports.userPath);
};
exports.removeUser = removeUser;
const getUser = () => {
    try {
        const userJSON = fs_1.default.readFileSync(exports.userPath, { encoding: 'utf-8' });
        return JSON.parse(userJSON);
    }
    catch (e) {
        return null;
    }
};
exports.getUser = getUser;
const getUserAsync = async () => {
    try {
        const userJSON = await fs_1.default.promises.readFile(exports.userPath, { encoding: 'utf-8' });
        return JSON.parse(userJSON);
    }
    catch (e) {
        return null;
    }
};
exports.getUserAsync = getUserAsync;
const existsAsync = (file) => {
    return fs_1.default.promises
        .access(file, fs_1.default.constants.F_OK)
        .then(() => true)
        .catch(() => false);
};
exports.existsAsync = existsAsync;
const getPluginsJson = () => {
    try {
        const remotePluginsJSON = fs_1.default.readFileSync(exports.vConfigPluginsPath, { encoding: 'utf-8' });
        return JSON.parse(remotePluginsJSON);
    }
    catch (e) {
        return { plugins: {} };
    }
};
exports.getPluginsJson = getPluginsJson;
const getRemoteHostSync = () => {
    try {
        const remoteHostTxt = fs_1.default.readFileSync(exports.vConfigRemotePath);
        return remoteHostTxt.toString().split(os_1.default.EOL).find(s => {
            if (s.trimStart()[0] == '#') {
                return false;
            }
            if (s.trim() == '') {
                return false;
            }
            return s.trim();
        });
    }
    catch (e) {
        return 'https://floro.io';
    }
};
exports.getRemoteHostSync = getRemoteHostSync;
const getRemoteHostAsync = async () => {
    try {
        const remoteHostTxt = await fs_1.default.promises.readFile(exports.vConfigRemotePath, { encoding: 'utf-8' });
        return remoteHostTxt.toString().split(os_1.default.EOL).find(s => {
            if (s.trimStart()[0] == '#') {
                return false;
            }
            if (s.trim() == '') {
                return false;
            }
            return s.trim();
        });
    }
    catch (e) {
        return 'https://floro.io';
    }
};
exports.getRemoteHostAsync = getRemoteHostAsync;
//# sourceMappingURL=filestructure.js.map