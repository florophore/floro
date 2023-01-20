"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPluginDependencyCompatability = exports.getDependenciesForManifest = exports.tarCreationPlugin = exports.exportPluginToDev = exports.canExportPlugin = exports.isCreationDistDirectoryValid = exports.checkDirectoryIsPluginWorkingDirectory = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const plugins_1 = require("./plugins");
const semver_1 = __importDefault(require("semver"));
const checkDirectoryIsPluginWorkingDirectory = async (cwd) => {
    const floroManifestPath = path_1.default.join(cwd, "floro", "floro.manifest.json");
    return await (0, filestructure_1.existsAsync)(floroManifestPath);
};
exports.checkDirectoryIsPluginWorkingDirectory = checkDirectoryIsPluginWorkingDirectory;
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
        const floroManifestPath = path_1.default.join(cwd, "floro", "floro.manifest.json");
        const floroManifestString = await fs_1.default.promises.readFile(floroManifestPath);
        const floroManifest = JSON.parse(floroManifestString.toString());
        const pluginName = floroManifest.name;
        const pluginVersion = floroManifest.version;
        const devPathDir = path_1.default.join(filestructure_1.vDEVPath, `${pluginName}@${pluginVersion}`);
        const devPathExists = await (0, filestructure_1.existsAsync)(devPathDir);
        if (devPathExists) {
            await fs_1.default.promises.rmdir(devPathDir);
        }
        await fs_1.default.promises.mkdir(devPathDir, { recursive: true });
        const sourceManifestDirPath = path_1.default.join(cwd, "floro");
        const destManifestDirPath = path_1.default.join(devPathDir, "floro");
        const sourceIndexHTMLPath = path_1.default.join(cwd, "dist", "index.html");
        const destIndexHTMLPath = path_1.default.join(devPathDir, "index.html");
        const sourceAssetsPath = path_1.default.join(cwd, "dist", "assets");
        const destAssetsPath = path_1.default.join(devPathDir, "assets");
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
        return false;
    }
    try {
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
            await fs_1.default.promises.rmdir(buildPathDir);
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
        }, [buildPathDir]);
        return true;
    }
    catch (e) {
        return false;
    }
};
exports.tarCreationPlugin = tarCreationPlugin;
const getDependenciesForManifest = async (manifest, seen = {}) => {
    let deps = [];
    const pluginList = (0, plugins_1.pluginMapToList)(manifest.imports);
    for (let pluginName in manifest.imports) {
        if (seen[pluginName]) {
            return {
                status: "error",
                reason: `cyclic dependency imports in ${pluginName}`,
            };
        }
        try {
            const pluginManifest = await (0, plugins_1.getPluginManifest)(pluginName, pluginList);
            const depResult = await (0, exports.getDependenciesForManifest)(pluginManifest, {
                ...seen,
                [manifest.name]: true,
            });
            if (depResult.status == "error") {
                return depResult;
            }
            deps.push(pluginManifest, ...depResult.deps);
        }
        catch (e) {
            return {
                status: "error",
                reason: `cannot fetch manifest for ${pluginName}`,
            };
        }
    }
    return {
        status: "ok",
        deps,
    };
};
exports.getDependenciesForManifest = getDependenciesForManifest;
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
const verifyPluginDependencyCompatability = async (deps) => {
    const depsMap = coalesceDependencyVersions(deps);
    for (let pluginName in depsMap) {
        if (depsMap[pluginName].length == 0) {
            continue;
        }
        for (let i = 1; i < depsMap[pluginName].length; ++i) {
            const lastManifest = await (0, plugins_1.getPluginManifest)(pluginName, [
                {
                    key: pluginName,
                    value: depsMap[pluginName][i - 1],
                },
            ]);
            const nextManifest = await (0, plugins_1.getPluginManifest)(pluginName, [
                {
                    key: pluginName,
                    value: depsMap[pluginName][i],
                },
            ]);
            const lastDeps = await (0, exports.getDependenciesForManifest)(lastManifest);
            if (lastDeps.status == "error") {
                return {
                    isValid: false,
                    status: "error",
                    reason: "dep_fetch",
                    pluginName,
                    pluginVersion: depsMap[pluginName][i - 1],
                };
            }
            const nextDeps = await (0, exports.getDependenciesForManifest)(nextManifest);
            if (nextDeps.status == "error") {
                return {
                    isValid: false,
                    status: "error",
                    reason: "dep_fetch",
                    pluginName,
                    pluginVersion: depsMap[pluginName][i],
                };
            }
            const lastSchemaMap = (0, plugins_1.manifestListToSchemaMap)([
                lastManifest,
                ...lastDeps.deps,
            ]);
            const nextSchemaMap = (0, plugins_1.manifestListToSchemaMap)([
                nextManifest,
                ...nextDeps.deps,
            ]);
            const areCompatible = (0, plugins_1.pluginManifestIsSubsetOfManifest)(lastSchemaMap, nextSchemaMap, pluginName);
            if (!areCompatible) {
                return {
                    isValid: false,
                    status: "error",
                    reason: "incompatible",
                    pluginName,
                    lastVersion: depsMap[pluginName][i - 1],
                    nextVersion: depsMap[pluginName][i],
                };
            }
        }
    }
    return {
        isValid: true,
        status: "ok",
    };
};
exports.verifyPluginDependencyCompatability = verifyPluginDependencyCompatability;
//# sourceMappingURL=plugincreator.js.map