#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pm2_1 = __importDefault(require("pm2"));
const filestructure_1 = require("./filestructure");
const daemon_1 = require("./daemon");
const login_1 = require("./login");
const plugincreator_1 = require("./plugincreator");
const cli_color_1 = __importDefault(require("cli-color"));
const yargs_1 = __importDefault(require("yargs"));
(0, filestructure_1.buildFloroFilestructure)();
yargs_1.default
    .command({
    command: "start",
    describe: "Start the floro daemon",
    handler: async () => {
        await (0, daemon_1.startDaemon)();
        pm2_1.default.disconnect();
    },
})
    .command({
    command: "kill",
    describe: "Kill the floro daemon",
    handler: async () => {
        await (0, daemon_1.killDaemon)();
        pm2_1.default.disconnect();
    },
})
    .command({
    command: "restart",
    describe: "Restart the floro daemon",
    handler: async () => {
        await (0, daemon_1.killDaemon)();
        await (0, daemon_1.startDaemon)();
        pm2_1.default.disconnect();
    },
})
    .command({
    command: "reset-disk",
    describe: "Removes local .floro from disk (Caution)",
    handler: async () => {
        await (0, login_1.logout)();
        await (0, daemon_1.killDaemon)();
        await (0, filestructure_1.reset)();
        pm2_1.default.disconnect();
    },
})
    .command({
    command: "login",
    describe: "Login to floro via cli",
    handler: async () => {
        await (0, login_1.promptEmail)();
    },
})
    .command({
    command: "logout",
    describe: "Logout from floro via cli",
    handler: async () => {
        await (0, login_1.logout)();
    },
})
    .command({
    command: "create-plugin [plugin]",
    describe: "Local plugin development commands",
    builder: (yargs) => {
        return yargs.positional('plugin', {
            type: 'string'
        });
    },
    handler: async (options) => {
        await (0, plugincreator_1.buildFloroTemplate)(process.cwd(), options.plugin);
        await (0, daemon_1.killDaemon)();
        await (0, daemon_1.startDaemon)();
        pm2_1.default.disconnect();
        console.log(cli_color_1.default.cyanBright.bgBlack.underline("Done"));
    },
})
    .command({
    command: "plugin",
    describe: "Local plugin development commands",
    builder: (yargs) => {
        return yargs
            .command({
            command: "push",
            describe: "Builds and pushes plugin to environment",
            builder: (yargs) => {
                return yargs.options({
                    staging: {
                        alias: "s",
                        describe: `Push build to local staging`,
                    },
                    production: {
                        alias: "p",
                        describe: `Push build to production review`,
                    },
                });
            },
            handler: async (options) => {
                if (!options?.staging && !options.production) {
                    console.log(cli_color_1.default.redBright.bgBlack.underline("Please specify the environment to push to by specifying staging (-s) or production (-p)"));
                    return;
                }
                if (options?.staging && options.production) {
                    console.log(cli_color_1.default.redBright.bgBlack.underline("Please specify only one environment to push to"));
                    return;
                }
                if (options?.staging) {
                    const didSucceed = await (0, plugincreator_1.exportPluginToDev)(process.cwd());
                    if (didSucceed) {
                        console.log(cli_color_1.default.cyanBright.bgBlack.underline("Successfully pushed to staging!"));
                        return;
                    }
                    console.log(cli_color_1.default.redBright.bgBlack.underline("Failed to push to staging..."));
                    return;
                }
                if (options?.production) {
                    const tarPath = await (0, plugincreator_1.tarCreationPlugin)(process.cwd());
                    if (!tarPath) {
                    }
                    console.log(`tar created at ${tarPath}`);
                    const didSucceed = (0, plugincreator_1.uploadPluginTar)(tarPath);
                    if (didSucceed) {
                        console.log(cli_color_1.default.cyanBright.bgBlack.underline("Successfully pushed to production!"));
                        return;
                    }
                    console.log(cli_color_1.default.redBright.bgBlack.underline("Failed to push to staging..."));
                    return;
                }
            },
        })
            .command({
            command: "pull",
            describe: "Installs dependies from floro.manifest.json",
            handler: () => {
                console.log("Handle deps");
            },
        })
            .command({
            command: "install",
            describe: "Installs remote dependency and saves into floro.manifest.json",
            handler: () => {
                console.log("Handle install");
            },
        });
    },
    handler: null,
})
    .help().argv;
//# sourceMappingURL=command.js.map