#!/usr/bin/env node

import pm2 from "pm2";
import {
  buildFloroFilestructure,
  reset,
  userHome,
  vConfigCORSPath,
  vConfigPluginsPath,
  vConfigRemotePath,
} from "./filestructure";
import { startDaemon, killDaemon } from "./daemon";
import { logout, promptEmail } from "./login";
import {
  buildFloroTemplate,
  exportPluginToDev,
  tarCreationPlugin,
  uploadPluginTar,
} from "./plugincreator";
import clc from "cli-color";
import yargs from "yargs";

buildFloroFilestructure();

yargs
  .command({
    command: "start",
    describe: "Start the floro daemon",
    handler: async () => {
      await startDaemon();
      pm2.disconnect();
    },
  })
  .command({
    command: "kill",
    describe: "Kill the floro daemon",
    handler: async () => {
      await killDaemon();
      pm2.disconnect();
    },
  })
  .command({
    command: "restart",
    describe: "Restart the floro daemon",
    handler: async () => {
      await killDaemon();
      await startDaemon();
      pm2.disconnect();
    },
  })
  .command({
    command: "reset-disk",
    describe: "Removes local .floro from disk (Caution)",
    handler: async () => {
      await logout();
      await killDaemon();
      await reset();
      pm2.disconnect();
    },
  })
  .command({
    command: "login",
    describe: "Login to floro via cli",
    handler: async () => {
      await promptEmail();
    },
  })
  .command({
    command: "logout",
    describe: "Logout from floro via cli",
    handler: async () => {
      await logout();
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
      await buildFloroTemplate(process.cwd(), options.plugin);
      await killDaemon();
      await startDaemon();
      pm2.disconnect();
      console.log(
        clc.cyanBright.bgBlack.underline("Done")
      );
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
              console.log(
                clc.redBright.bgBlack.underline(
                  "Please specify the environment to push to by specifying staging (-s) or production (-p)"
                )
              );
              return;
            }
            if (options?.staging && options.production) {
              console.log(
                clc.redBright.bgBlack.underline(
                  "Please specify only one environment to push to"
                )
              );
              return;
            }
            if (options?.staging) {
              const didSucceed = await exportPluginToDev(process.cwd());
              if (didSucceed) {
                console.log(
                  clc.cyanBright.bgBlack.underline(
                    "Successfully pushed to staging!"
                  )
                );
                return;
              }
              console.log(
                clc.redBright.bgBlack.underline("Failed to push to staging...")
              );
              return;
            }

            if (options?.production) {
              const tarPath = await tarCreationPlugin(process.cwd());
              if (!tarPath) {
              }
              console.log(`tar created at ${tarPath}`);
              const didSucceed = uploadPluginTar(tarPath);
              if (didSucceed) {
                console.log(
                  clc.cyanBright.bgBlack.underline(
                    "Successfully pushed to production!"
                  )
                );
                return;
              }
              console.log(
                clc.redBright.bgBlack.underline("Failed to push to staging...")
              );
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
          describe:
            "Installs remote dependency and saves into floro.manifest.json",
          handler: () => {
            console.log("Handle install");
          },
        });
    },
    handler: null,
  })
  .help().argv;
