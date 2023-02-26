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
  canExportPlugin,
  checkDirectoryIsPluginWorkingDirectory,
  exportPluginToDev,
  generateLocalTypescriptAPI,
  generateTypeScriptAPI,
  getLocalManifestReadFunction,
  inspectLocalManifest,
  installDependency,
  pullLocalDeps,
  tarCreationPlugin,
  uploadPluginTar,
  validateLocalManifest,
} from "./plugincreator";
import clc from "cli-color";
import yargs from "yargs";
import { render } from 'prettyjson';

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
    describe: "Generates floro plugin scaffolding",
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
              const isValid = await validateLocalManifest(process.cwd());
              if (isValid) {
                const didSucceed = await uploadPluginTar(tarPath);
                if (didSucceed) {
                  console.log(
                    clc.cyanBright.bgBlack.underline(
                      "Successfully pushed to production!"
                    )
                  );
                  return;
                }
              }
              console.log(
                clc.redBright.bgBlack.underline(
                  "Failed to push to production..."
                )
              );
              return;
            }
          },
        })
        .command({
          command: "pull-deps",
          describe: "Installs dependies from floro.manifest.json",
          handler: async () => {
            const readFunction = await getLocalManifestReadFunction(process.cwd());
            if (!readFunction) {
              return;
            }
            const didSucceed = await pullLocalDeps(process.cwd(), readFunction);
            if (didSucceed) {
              console.log(
                clc.cyanBright.bgBlack.underline(
                  "Successfully pulled dependencies!"
                )
              );
              return;
            }
            console.log(
              clc.redBright.bgBlack.underline(
                "Failed to pull dependencies"
              )
            );
          },
        })
        .command({
          command: "install [dependency]",
          describe:
            "Installs remote dependency and saves into floro.manifest.json",
          builder: (yargs) => {
            return yargs.positional("dependency", {
              type: "string",
            });
          },
          handler: async (options) => {
            const readFunction = await getLocalManifestReadFunction(process.cwd());
            if (!readFunction) {
              return;
            }
            if (!options.dependency) {
              console.log(
                clc.redBright.bgBlack.underline("No dependency specified")
              );
              return;
            }
            const isValidCWD = await checkDirectoryIsPluginWorkingDirectory(
              process.cwd()
            );
            if (!isValidCWD) {
              console.log(
                clc.redBright.bgBlack.underline(
                  "Invalid working directory: " + process.cwd()
                )
              );
              console.log(
                clc.redBright.bgBlack.underline(
                  "Please try again from your floro plugin's root directory."
                )
              );
              return;
            }
            const updatedManifest = await installDependency(
              process.cwd(),
              options.dependency,
              readFunction
            );
            if (!updatedManifest) {
              console.log(clc.redBright.bgBlack.underline("Install failed"));
              return;
            }
            const [depName] = options.dependency.split("@");
            console.log(
              clc.cyanBright.bgBlack.underline(
                "Successfully installed " +
                  depName +
                  "@" +
                  updatedManifest.imports[depName] +
                  " to " +
                  updatedManifest.name +
                  "!"
              )
            );
          },
        })
        .command({
          command: "validate",
          describe: "Validates schema from floro.manifest.json",
          handler: async () => {
            const didSucceed = await validateLocalManifest(process.cwd());
            if (didSucceed) {
              console.log(
                clc.cyanBright.bgBlack.underline(
                  "Manifest is valid."
                )
              );
              return;
            }
            console.log(
              clc.redBright.bgBlack.underline(
                "Manifest has manifest errors."
              )
            );
          },
        })
        .command({
          command: "inspect",
          describe: "Validates schema from floro.manifest.json",
          builder: yargs => {
            return yargs.option('expanded', {
              alias: 'e',
              type: "boolean"
            })
          },
          handler: async (options) => {
            const readFunction = await getLocalManifestReadFunction(process.cwd());
            if (readFunction != null) {
              const out = await inspectLocalManifest(process.cwd(), options?.expanded ?? false, readFunction);
              if (out) {
                console.log(
                  render(
                    out,
                    {
                      keysColor: "brightCyan",
                      dashColor: "magenta",
                      stringColor: "blue",
                      multilineStringColor: "cyan",
                    }
                  )
                );
                return;
              }
            }
            console.log(
              clc.redBright.bgBlack.underline(
                "Manifest inspect failed."
              )
            );
          },
        })
        .command({
          command: "gen-api",
          describe: "Generates Typescript API from floro.manifest.json schema",
          handler: async (options) => {
            const readFunction = await getLocalManifestReadFunction(process.cwd());
            if (!readFunction) {
              return;
            }
            const didSucceed = await validateLocalManifest(process.cwd());
            if (!didSucceed) {
              console.log(
                clc.cyanBright.bgBlack.underline(
                  "Manifest is invalid."
                )
              );
              return;
            }
            const apiGenSucceed = await generateLocalTypescriptAPI(process.cwd(), true, readFunction);
            if (apiGenSucceed) {
              console.log(
                clc.cyanBright.bgBlack.underline(
                  "Generated API successfully."
                )
              );
              return;
            }
            console.log(
              clc.redBright.bgBlack.underline(
                "Failed to generate API."
              )
            );
          },
        })
    },
    handler: null,
  })
  .help().argv;
