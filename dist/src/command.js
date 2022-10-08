#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pm2_1 = __importDefault(require("pm2"));
const filestructure_1 = require("./filestructure");
const command_line_args_1 = __importDefault(require("command-line-args"));
const daemon_1 = require("./daemon");
/* first - parse the main command */
const mainDefinitions = [{ name: "command", defaultOption: true }];
const mainOptions = (0, command_line_args_1.default)(mainDefinitions, {
    stopAtFirstUnknown: true,
});
const argv = mainOptions._unknown || [];
(0, filestructure_1.buildFloroFilestructure)();
const commands = [
    "start",
    "kill",
    "login",
    "info",
    "version",
    "logout"
];
(async function main() {
    const args = process.argv.splice(2);
    const arg = args[0];
    if (mainOptions.command == "start") {
        await (0, daemon_1.startDaemon)();
        return;
    }
    if (mainOptions.command == "kill") {
        await (0, daemon_1.killDaemon)();
        return;
    }
    console.log(!arg
        ? "please enter either `floro-server start` or `floro-server kill`"
        : "unknown command: " +
            arg +
            " please enter either `floro-server start` or `floro-server kill`");
    pm2_1.default.disconnect();
    return;
})();
//# sourceMappingURL=command.js.map