#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFloroFilestructure = exports.vCDNPath = exports.homePath = exports.userHome = void 0;
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
exports.userHome = os_1.default.homedir();
exports.homePath = path_1.default.join(exports.userHome, ".floro");
exports.vCDNPath = path_1.default.join(exports.homePath, "cache");
const buildFloroFilestructure = () => {
    if (!fs_1.default.existsSync(exports.homePath)) {
        fs_1.default.mkdirSync(exports.homePath, 744);
    }
    if (!fs_1.default.existsSync(exports.vCDNPath)) {
        fs_1.default.mkdirSync(exports.vCDNPath, 744);
    }
};
exports.buildFloroFilestructure = buildFloroFilestructure;
//# sourceMappingURL=filestructure.js.map