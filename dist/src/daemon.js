"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.killDaemon = exports.startDaemon = void 0;
const path_1 = __importDefault(require("path"));
const pm2_1 = __importDefault(require("pm2"));
const DAEMON_PROCESS_NAME = "floro-server-process";
const startDaemon = async () => {
    return new Promise(resolve => {
        pm2_1.default.connect(function (err) {
            if (err) {
                console.error(err);
                resolve();
                process.exit(2);
            }
            pm2_1.default.start({
                script: path_1.default.join(__dirname, "server.js"),
                name: DAEMON_PROCESS_NAME,
            }, function (err, apps) {
                if (err) {
                    console.error(err);
                    pm2_1.default.disconnect();
                    resolve();
                    return;
                }
                const DEFAULT_PORT = 63403;
                const port = process.env.FLORO_VCDN_PORT;
                console.log(`starting floro server on ${port ?? DEFAULT_PORT}...`);
                pm2_1.default.list((err, list) => {
                    pm2_1.default.restart("floro-server-process", (err, proc) => {
                        // Disconnects from PM2
                        pm2_1.default.disconnect();
                    });
                });
                resolve();
            });
        });
    });
};
exports.startDaemon = startDaemon;
const killDaemon = async () => {
    return new Promise(resolve => {
        pm2_1.default.connect(function (err) {
            if (err) {
                console.error(err);
                process.exit(2);
            }
            pm2_1.default.stop(DAEMON_PROCESS_NAME, (err) => {
                if (err) {
                    console.error("floro daemon error", err);
                    pm2_1.default.disconnect();
                    resolve();
                    return;
                }
                console.log("killed floro server");
                pm2_1.default.disconnect();
                resolve();
                return;
            });
        });
    });
};
exports.killDaemon = killDaemon;
//# sourceMappingURL=daemon.js.map