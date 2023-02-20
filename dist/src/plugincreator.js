"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTypeScriptAPI = exports.getSchemaMapForCreationManifest = exports.uploadPluginTar = exports.tarCreationPlugin = exports.exportPluginToDev = exports.canExportPlugin = exports.isCreationDistDirectoryValid = exports.buildFloroTemplate = exports.checkDirectoryIsPluginWorkingDirectory = exports.PLUGIN_REGEX = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const plugins_1 = require("./plugins");
const cli_color_1 = __importDefault(require("cli-color"));
const semver_1 = __importDefault(require("semver"));
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const buffer_1 = require("buffer");
const inquirer_1 = __importDefault(require("inquirer"));
exports.PLUGIN_REGEX = /^[a-z0-9-][a-z0-9-_]{2,20}$/;
const checkDirectoryIsPluginWorkingDirectory = async (cwd) => {
    const floroManifestPath = path_1.default.join(cwd, "floro", "floro.manifest.json");
    return await (0, filestructure_1.existsAsync)(floroManifestPath);
};
exports.checkDirectoryIsPluginWorkingDirectory = checkDirectoryIsPluginWorkingDirectory;
const buildFloroTemplate = async (cwd, name) => {
    if (!name || !exports.PLUGIN_REGEX.test(name)) {
        console.log(cli_color_1.default.redBright.bgBlack.underline("Invalid plugin name"));
        return;
    }
    const defaultBuiltPath = path_1.default.join(cwd, name);
    const defaultExists = await (0, filestructure_1.existsAsync)(defaultBuiltPath);
    if (defaultExists) {
        console.log(cli_color_1.default.redBright.bgBlack.underline("cannot build in this directory. " +
            defaultBuiltPath +
            " already exists."));
        return;
    }
    const defaultDisplayName = name[0].toUpperCase() + name.substring(1);
    const { displayName } = await inquirer_1.default.prompt({
        type: "input",
        name: "displayName",
        message: "What should the display name of your plugin be?",
        default: defaultDisplayName,
    });
    const pluginsJSON = await (0, filestructure_1.getPluginsJsonAsync)();
    let defaultPort = 2000;
    let maxPort = Math.max(...(Object.keys(pluginsJSON.plugins)
        .map((k) => pluginsJSON.plugins?.[k]?.host)
        ?.filter((v) => !!v)
        ?.map((v) => v?.split?.(":")?.[(v?.split?.(":").length ?? 0) - 1])
        ?.filter((v) => !!v)
        ?.map((v) => parseInt(v)) ?? [defaultPort]));
    for (let pluginName in pluginsJSON.plugins) {
        if (pluginsJSON.plugins[pluginName]?.host?.endsWith?.(":" + defaultPort)) {
            defaultPort = maxPort + 1;
            break;
        }
    }
    const { port } = await inquirer_1.default.prompt({
        type: "number",
        name: "port",
        message: "What port will you run your plugin on during development?",
        default: defaultPort,
    });
    for (let pluginName in pluginsJSON.plugins) {
        if (pluginsJSON.plugins[pluginName]?.host?.endsWith?.(":" + port)) {
            console.log(cli_color_1.default.redBright.bgBlack.underline("port already in use by " + pluginName));
            return;
        }
    }
    let { description } = await inquirer_1.default.prompt({
        type: "input",
        name: "description",
        message: "Write a description for what your plugin does.",
        default: "Will add later.",
    });
    if (!description) {
        description = "";
    }
    const templatePath = path_1.default.join(__dirname, "..", "..", "plugin_template");
    const templateSrcPath = path_1.default.join(templatePath, "src");
    const templateFloroPath = path_1.default.join(templatePath, "floro");
    const files = await Promise.all([
        ...(await fs_1.default.promises.readdir(templatePath)),
        ...(await fs_1.default.promises.readdir(templateSrcPath)).map((p) => path_1.default.join("src", p)),
        ...(await fs_1.default.promises.readdir(templateFloroPath)).map((p) => path_1.default.join("floro", p)),
    ]);
    await fs_1.default.promises.mkdir(defaultBuiltPath);
    for (const fname of files) {
        const templateFilePath = path_1.default.join(templatePath, fname);
        const lstat = await fs_1.default.promises.lstat(templateFilePath);
        const writePath = path_1.default
            .join(defaultBuiltPath, fname)
            .replace(".template", "");
        if (lstat.isDirectory()) {
            await fs_1.default.promises.mkdir(writePath);
        }
        else {
            const contents = await fs_1.default.promises.readFile(templateFilePath, "utf-8");
            const replaced = contents
                .replaceAll("PLUGIN_NAME", name)
                .replaceAll("PLUGIN_PORT", port)
                .replaceAll("PLUGIN_DISPLAY_NAME", displayName)
                .replaceAll("PLUGIN_DESCRIPTION", description);
            await fs_1.default.promises.writeFile(writePath, replaced);
        }
    }
    pluginsJSON.plugins[name] = {
        proxy: true,
        host: "http://localhost:" + defaultPort,
    };
    await (0, filestructure_1.writePluginsJsonAsync)(pluginsJSON);
    console.log(cli_color_1.default.cyanBright.bgBlack.underline("Successfully added " + name));
    console.log(cli_color_1.default.cyanBright.bgBlack.underline("Restarting daemon."));
};
exports.buildFloroTemplate = buildFloroTemplate;
const isCreationDistDirectoryValid = async (cwd) => {
    const indexHTMLPath = path_1.default.join(cwd, "dist", "index.html");
    const indexHTMLExists = await (0, filestructure_1.existsAsync)(indexHTMLPath);
    if (!indexHTMLExists) {
        return false;
    }
    const assetsPath = path_1.default.join(cwd, "dist", "assets");
    const assetsExists = await (0, filestructure_1.existsAsync)(assetsPath);
    if (!assetsExists) {
        return false;
    }
    return true;
};
exports.isCreationDistDirectoryValid = isCreationDistDirectoryValid;
const canExportPlugin = async (cwd) => {
    const isPluginDir = await (0, exports.checkDirectoryIsPluginWorkingDirectory)(cwd);
    if (!isPluginDir) {
        return false;
    }
    const isValid = await (0, exports.isCreationDistDirectoryValid)(cwd);
    if (!isValid) {
        return false;
    }
    return true;
};
exports.canExportPlugin = canExportPlugin;
const exportPluginToDev = async (cwd) => {
    const canExport = (0, exports.canExportPlugin)(cwd);
    if (!canExport) {
        return false;
    }
    try {
        await new Promise((resolve, reject) => {
            console.log("packaging plugin...");
            if (process.env.NODE_ENV == "test") {
                resolve("testing");
                return;
            }
            (0, child_process_1.exec)("CDN_HOST=http://localhost:63403 npm run build", { cwd }, (err, stdout) => {
                if (err) {
                    console.error("something went wrong while packaging!");
                    reject(err);
                    return;
                }
                console.log(stdout);
                resolve(stdout);
            });
        });
        console.log("done packaging");
        const floroManifestPath = path_1.default.join(cwd, "floro", "floro.manifest.json");
        const floroManifestString = await fs_1.default.promises.readFile(floroManifestPath);
        const floroManifest = JSON.parse(floroManifestString.toString());
        const pluginName = floroManifest.name;
        const pluginVersion = floroManifest.version;
        const devPathDir = path_1.default.join(filestructure_1.vDEVPath, pluginName);
        const devVersionPathDir = path_1.default.join(devPathDir, pluginVersion);
        const devVersionPathExists = await (0, filestructure_1.existsAsync)(devVersionPathDir);
        if (devVersionPathExists) {
            await fs_1.default.promises.rm(devVersionPathDir, { recursive: true });
        }
        await fs_1.default.promises.mkdir(devVersionPathDir, { recursive: true });
        const sourceManifestDirPath = path_1.default.join(cwd, "floro");
        const destManifestDirPath = path_1.default.join(devVersionPathDir, "floro");
        const sourceIndexHTMLPath = path_1.default.join(cwd, "dist", "index.html");
        const destIndexHTMLPath = path_1.default.join(devVersionPathDir, "index.html");
        const sourceAssetsPath = path_1.default.join(cwd, "dist", "assets");
        const destAssetsPath = path_1.default.join(devVersionPathDir, "assets");
        await (0, filestructure_1.copyDirectory)(sourceManifestDirPath, destManifestDirPath);
        await fs_1.default.promises.copyFile(sourceIndexHTMLPath, destIndexHTMLPath);
        await (0, filestructure_1.copyDirectory)(sourceAssetsPath, destAssetsPath);
        return true;
    }
    catch (e) {
        return false;
    }
};
exports.exportPluginToDev = exportPluginToDev;
const tarCreationPlugin = async (cwd) => {
    const canExport = (0, exports.canExportPlugin)(cwd);
    if (!canExport) {
        return null;
    }
    try {
        await new Promise((resolve, reject) => {
            console.log("packaging plugin...");
            if (process.env.NODE_ENV == "test") {
                resolve("testing");
                return;
            }
            (0, child_process_1.exec)("CDN_HOST=http://localhost:63403 npm run build", { cwd }, (err, stdout) => {
                if (err) {
                    console.error("something went wrong while packaging!");
                    reject(err);
                    return;
                }
                console.log(stdout);
                resolve(stdout);
            });
        });
        console.log("done packaging");
        const floroManifestPath = path_1.default.join(cwd, "floro", "floro.manifest.json");
        const floroManifestString = await fs_1.default.promises.readFile(floroManifestPath);
        const floroManifest = JSON.parse(floroManifestString.toString());
        const pluginName = floroManifest.name;
        const pluginVersion = floroManifest.version;
        const buildPathDir = path_1.default.join(filestructure_1.vTMPPath, "build", `${pluginName}@${pluginVersion}`);
        const outPathDir = path_1.default.join(filestructure_1.vTMPPath, "out");
        const buildPathExists = await (0, filestructure_1.existsAsync)(buildPathDir);
        const outPathExists = await (0, filestructure_1.existsAsync)(buildPathDir);
        if (!outPathExists) {
            await fs_1.default.promises.mkdir(outPathDir, { recursive: true });
        }
        if (buildPathExists) {
            await fs_1.default.promises.rm(buildPathDir, { recursive: true });
        }
        await fs_1.default.promises.mkdir(buildPathDir, { recursive: true });
        const sourceManifestDirPath = path_1.default.join(cwd, "floro");
        const destManifestDirPath = path_1.default.join(buildPathDir, "floro");
        const sourceIndexHTMLPath = path_1.default.join(cwd, "dist", "index.html");
        const destIndexHTMLPath = path_1.default.join(buildPathDir, "index.html");
        const sourceAssetsPath = path_1.default.join(cwd, "dist", "assets");
        const destAssetsPath = path_1.default.join(buildPathDir, "assets");
        await (0, filestructure_1.copyDirectory)(sourceManifestDirPath, destManifestDirPath);
        await fs_1.default.promises.copyFile(sourceIndexHTMLPath, destIndexHTMLPath);
        await (0, filestructure_1.copyDirectory)(sourceAssetsPath, destAssetsPath);
        const tarFile = path_1.default.join(filestructure_1.vTMPPath, "out", `${pluginName}@${pluginVersion}.tar.gz`);
        const tarExists = await (0, filestructure_1.existsAsync)(tarFile);
        if (tarExists) {
            await fs_1.default.promises.rm(tarFile);
        }
        await tar_1.default.create({
            gzip: true,
            file: tarFile,
            C: buildPathDir,
            portable: true,
        }, await fs_1.default.promises.readdir(buildPathDir));
        return tarFile;
    }
    catch (e) {
        return null;
    }
};
exports.tarCreationPlugin = tarCreationPlugin;
const uploadPluginTar = async (tarPath) => {
    try {
        const remote = await (0, filestructure_1.getRemoteHostAsync)();
        const session = await (0, filestructure_1.getUserSessionAsync)();
        const formData = new form_data_1.default();
        const buffer = await fs_1.default.promises.readFile(tarPath);
        const blob = new buffer_1.Blob([Uint8Array.from(buffer)]);
        formData.append("file", fs_1.default.createReadStream(tarPath));
        await axios_1.default.post(`${remote}/api/plugin/upload`, formData, {
            headers: {
                ["session_key"]: session?.clientKey,
                "Content-Type": "multipart/form-data",
            },
        });
        console.log("HERE");
        ///reader.readAsBinaryString(new Blob([await fs.promises.readFile(tarPath)]))
    }
    catch (e) {
        console.log("e", e);
    }
};
exports.uploadPluginTar = uploadPluginTar;
const coalesceDependencyVersions = (deps) => {
    try {
        return deps.reduce((acc, manifest) => {
            if (acc[manifest.name]) {
                const semList = [manifest.version, ...acc[manifest.name]].sort((a, b) => {
                    if (semver_1.default.eq(a, b)) {
                        return 0;
                    }
                    return semver_1.default.gt(a, b) ? 1 : -1;
                });
                return {
                    ...acc,
                    [manifest.name]: semList,
                };
            }
            return {
                ...acc,
                [manifest.name]: [manifest.version],
            };
        }, {});
    }
    catch (e) {
        return null;
    }
};
const getSchemaMapForCreationManifest = async (manifest, pluginFetch) => {
    // switch to getUpstreamDependencies
    const depResult = await (0, plugins_1.getDependenciesForManifest)(manifest, pluginFetch);
    if (depResult.status == "error") {
        return null;
    }
    const areValid = await (0, plugins_1.verifyPluginDependencyCompatability)(depResult.deps, pluginFetch);
    if (!areValid.isValid) {
        return null;
    }
    const depsMap = coalesceDependencyVersions(depResult.deps);
    let out = {};
    for (let pluginName in depsMap) {
        const maxVersion = depsMap[pluginName][depsMap[pluginName].length - 1];
        const depManifest = depResult.deps.find((v) => v.version == maxVersion);
        out[depManifest.name] = depManifest;
    }
    out[manifest.name] = manifest;
    return out;
};
exports.getSchemaMapForCreationManifest = getSchemaMapForCreationManifest;
const generateTypeScriptAPI = async (manifest, useReact = true, pluginFetch) => {
    const schemaMap = await (0, exports.getSchemaMapForCreationManifest)(manifest, pluginFetch);
    const rootSchemaMap = (0, plugins_1.getRootSchemaMap)(schemaMap);
    const referenceKeys = (0, plugins_1.collectKeyRefs)(rootSchemaMap);
    const expandedTypes = (0, plugins_1.getExpandedTypesForPlugin)(schemaMap, manifest.name);
    const referenceReturnTypeMap = (0, plugins_1.buildPointerReturnTypeMap)(rootSchemaMap, expandedTypes, referenceKeys);
    const referenceArgsMap = (0, plugins_1.buildPointerArgsMap)(referenceReturnTypeMap);
    let code = useReact ? "import { useMemo } from 'react';\n\n" : "";
    const queryTypesCode = (0, plugins_1.drawMakeQueryRef)(referenceArgsMap, useReact);
    code += queryTypesCode + "\n\n";
    const schemaRootCode = (0, plugins_1.drawSchemaRoot)(rootSchemaMap, referenceReturnTypeMap);
    code += schemaRootCode + "\n\n";
    const refReturnTypesCode = (0, plugins_1.drawRefReturnTypes)(rootSchemaMap, referenceReturnTypeMap);
    code += refReturnTypesCode;
    const getReferenceObjectCode = (0, plugins_1.drawGetReferencedObject)(referenceArgsMap, useReact);
    code += getReferenceObjectCode + "\n\n";
    const getReferencePluginStoreCode = (0, plugins_1.drawGetPluginStore)(rootSchemaMap, useReact);
    code += getReferencePluginStoreCode;
    return code;
};
exports.generateTypeScriptAPI = generateTypeScriptAPI;
//# sourceMappingURL=plugincreator.js.map