"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSessionJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const filestructure_1 = require("./filestructure");
const axios_1 = __importDefault(require("axios"));
const multiplexer_1 = require("./multiplexer");
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
const HOUR_CRON = "0 * * * *";
const startSessionJob = () => {
    node_cron_1.default.schedule(HOUR_CRON, async () => {
        try {
            const currentSession = await (0, filestructure_1.getUserSessionAsync)();
            if (!currentSession) {
                return;
            }
            const expiresAt = new Date(currentSession.expiresAt);
            const expiresAtMS = expiresAt.getTime();
            const nowMS = (new Date()).getTime();
            const delta = (expiresAtMS - nowMS);
            if (delta > ONE_WEEK) {
                const remote = await (0, filestructure_1.getRemoteHostAsync)();
                const response = await axios_1.default.post(`${remote}/api/session/exchange`, {}, {
                    headers: {
                        ['session_key']: currentSession?.clientKey
                    }
                });
                if (response.status == 200) {
                    await (0, filestructure_1.writeUserSession)(response.data.exchangeSession);
                    await (0, filestructure_1.writeUser)(response.data.exchangeSession.user);
                    (0, multiplexer_1.broadcastAllDevices)("session_updated", response.data);
                }
            }
        }
        catch (e) {
            //log nothing
        }
    });
};
exports.startSessionJob = startSessionJob;
//# sourceMappingURL=cron.js.map