"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTypeScriptAPI = exports.validatePluginManifest = exports.getSchemaMapForCreationManifest = exports.verifyPluginDependencyCompatability = exports.getDependenciesForManifest = exports.uploadPluginTar = exports.tarCreationPlugin = exports.exportPluginToDev = exports.canExportPlugin = exports.isCreationDistDirectoryValid = exports.checkDirectoryIsPluginWorkingDirectory = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const plugins_1 = require("./plugins");
const semver_1 = __importDefault(require("semver"));
const child_process_1 = require("child_process");
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const buffer_1 = require("buffer");
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
        await new Promise((resolve, reject) => {
            console.log("packaging plugin...");
            if (process.env.NODE_ENV == "test") {
                resolve("testing");
                return;
            }
            (0, child_process_1.exec)('CDN_HOST=http://localhost:63403 npm run build', { cwd }, (err, stdout) => {
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
            (0, child_process_1.exec)('CDN_HOST=http://localhost:63403 npm run build', { cwd }, (err, stdout) => {
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
            portable: true
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
        formData.append('file', fs_1.default.createReadStream(tarPath));
        await axios_1.default.post(`${remote}/api/plugin/upload`, formData, {
            headers: {
                ["session_key"]: session?.clientKey,
                "Content-Type": "multipart/form-data"
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
            // check if is dev plug
            // if dev do nothing
            // if not dev, see if exists locally
            // if not exists local, then download
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
const getSchemaMapForCreationManifest = async (manifest) => {
    // switch to getUpstreamDependencies
    const depResult = await (0, exports.getDependenciesForManifest)(manifest);
    if (depResult.status == "error") {
        return null;
    }
    const areValid = await (0, exports.verifyPluginDependencyCompatability)(depResult.deps);
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
const validatePluginManifest = async (manifest) => {
    try {
        if ((0, plugins_1.containsCyclicTypes)(manifest, manifest.store)) {
            return {
                status: "error",
                message: `${manifest.name}'s schema contains cyclic types, consider using references`,
            };
        }
        // switch to getUpstreamDependencies (must for this one)
        const depResult = await (0, exports.getDependenciesForManifest)(manifest);
        if (depResult.status == "error") {
            return {
                status: "error",
                message: depResult.reason,
            };
        }
        const areValid = await (0, exports.verifyPluginDependencyCompatability)(depResult.deps);
        if (!areValid.isValid) {
            if (areValid.reason == "dep_fetch") {
                return {
                    status: "error",
                    message: `failed to fetch dependency ${areValid.pluginName}@${areValid.pluginVersion}`,
                };
            }
            if (areValid.reason == "incompatible") {
                return {
                    status: "error",
                    message: `incompatible dependency versions for ${areValid.pluginName} between version ${areValid.lastVersion} and ${areValid.nextVersion}`,
                };
            }
        }
        const schemaMap = await (0, exports.getSchemaMapForCreationManifest)(manifest);
        const expandedTypes = (0, plugins_1.getExpandedTypesForPlugin)(schemaMap, manifest.name);
        const rootSchemaMap = (0, plugins_1.getRootSchemaMap)(schemaMap);
        const hasValidPropsType = (0, plugins_1.invalidSchemaPropsCheck)(schemaMap[manifest.name].store, rootSchemaMap[manifest.name], [`$(${manifest.name})`]);
        if (hasValidPropsType.status == "error") {
            return hasValidPropsType;
        }
        return (0, plugins_1.isSchemaValid)(rootSchemaMap, schemaMap, rootSchemaMap, expandedTypes);
    }
    catch (e) {
        return {
            status: "error",
            message: e?.toString?.() ?? "unknown error",
        };
    }
};
exports.validatePluginManifest = validatePluginManifest;
const generateTypeScriptAPI = async (manifest, useReact = true) => {
    const schemaMap = await (0, exports.getSchemaMapForCreationManifest)(manifest);
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