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
const inquirer_1 = __importDefault(require("inquirer"));
const login_1 = require("./login");
const { exec, spawn } = require('child_process');
/* first - parse the main command */
const mainDefinitions = [{ name: "command", defaultOption: true }];
const mainOptions = (0, command_line_args_1.default)(mainDefinitions, {
    stopAtFirstUnknown: true,
});
const argv = mainOptions._unknown || [];
(0, filestructure_1.buildFloroFilestructure)();
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
    if (mainOptions.command == "restart") {
        await (0, daemon_1.killDaemon)();
        await (0, daemon_1.startDaemon)();
        return;
    }
    if (mainOptions.command == "plugin") {
        const subCommand = mainOptions[0];
        if (subCommand == 'install') {
            const pluginName = mainOptions[1];
            console.log("download", pluginName);
        }
        if (subCommand == 'uninstall') {
        }
        return;
    }
    if (mainOptions.command == "config") {
        const response = await inquirer_1.default.prompt([
            {
                type: "list",
                name: "config",
                message: "Choose a configuration option",
                choices: ["cors", "remote", "plugins", "reset", "quit"],
            },
        ]);
        if (response.config == "cors") {
            const vim = spawn('vi', [filestructure_1.vConfigCORSPath], { stdio: 'inherit' });
            vim.on('exit', () => {
                console.log("done");
            });
            return;
        }
        if (response.config == "remote") {
            const vim = spawn('vi', [filestructure_1.vConfigRemotePath], { stdio: 'inherit' });
            vim.on('exit', () => {
                console.log("done");
            });
            return;
        }
        if (response.config == "plugins") {
            const vim = spawn('vi', [filestructure_1.vConfigPluginsPath], { stdio: 'inherit' });
            vim.on('exit', () => {
                console.log("done");
            });
            return;
        }
        if (response.config == "reset") {
            console.log("resetting");
            (0, filestructure_1.reset)();
            return;
        }
    }
    if (mainOptions.command == "login") {
        await (0, login_1.promptEmail)();
        return;
    }
    if (mainOptions.command == "logout") {
        console.log("login");
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