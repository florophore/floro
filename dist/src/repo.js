"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneRepo = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importStar(require("fs"));
const path_1 = __importDefault(require("path"));
const tar_1 = __importDefault(require("tar"));
const filestructure_1 = require("./filestructure");
const multiplexer_1 = require("./multiplexer");
const cloneRepo = async (repoId) => {
    try {
        const remote = await (0, filestructure_1.getRemoteHostAsync)();
        const session = (0, filestructure_1.getUserSession)();
        const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
        const downloadPath = path_1.default.join(filestructure_1.vTMPPath, `${repoId}.tar.gz`);
        await (0, axios_1.default)({
            method: "get",
            url: `${remote}/api/repo/${repoId}/clone`,
            headers: {
                ["session_key"]: session?.clientKey,
            },
            onDownloadProgress: (progressEvent) => {
                (0, multiplexer_1.broadcastAllDevices)(`repo:${repoId}:clone-progress`, progressEvent);
            },
            responseType: "stream",
        })
            .then((response) => {
            const exists = (0, fs_1.existsSync)(downloadPath);
            if (exists) {
                return true;
            }
            const writer = (0, fs_1.createWriteStream)(downloadPath);
            return new Promise((resolve, reject) => {
                response.data.pipe(writer);
                let error = null;
                writer.on("error", (err) => {
                    error = err;
                    writer.close();
                    reject(err);
                });
                writer.on("close", () => {
                    if (!error) {
                        resolve(true);
                    }
                });
            });
        });
        const exists = await (0, filestructure_1.existsAsync)(repoPath);
        if (!exists) {
            await fs_1.default.promises.mkdir(repoPath);
            await fs_1.default.promises.chmod(repoPath, 0o755);
            await tar_1.default.x({
                file: downloadPath,
                cwd: repoPath
            });
        }
        const downloadExists = await (0, filestructure_1.existsAsync)(downloadPath);
        if (downloadExists) {
            await fs_1.default.promises.rm(downloadPath);
        }
        return true;
    }
    catch (e) {
        return false;
    }
};
exports.cloneRepo = cloneRepo;
//# sourceMappingURL=repo.js.map