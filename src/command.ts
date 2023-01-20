#!/usr/bin/env node

import pm2 from "pm2";
import { buildFloroFilestructure, reset, userHome, vConfigCORSPath, vConfigPluginsPath, vConfigRemotePath } from "./filestructure";
import commandLineArgs from "command-line-args";
import { startDaemon, killDaemon } from "./daemon";
import inquirer from 'inquirer';
import { logout, promptEmail } from './login';
const { exec, spawn } = require('child_process');

/* first - parse the main command */
const mainDefinitions = [{ name: "command", defaultOption: true }];
const mainOptions = commandLineArgs(mainDefinitions, {
  stopAtFirstUnknown: true,
});
const argv = mainOptions._unknown || [];

buildFloroFilestructure();

(async function main() {
  const args = process.argv.splice(2);
  const arg = args[0];

  if (mainOptions.command == "start") {
    await startDaemon();
    return;
  }

  if (mainOptions.command == "kill") {
    await killDaemon();
    return;
  }

  if (mainOptions.command == "restart") {
    await killDaemon();
    await startDaemon();
    return;
  }

  if (mainOptions.command == "plugin") {
    console.log("test");
    return;
  }

  if (mainOptions.command == "config") {
    const response = await inquirer.prompt([
      {
        type: "list",
        name: "config",
        message: "Choose a configuration option",
        choices: ["cors", "remote", "plugins", "reset", "quit"],
      },
    ]);
    if (response.config == "cors") {
        const vim = spawn('vi', [vConfigCORSPath], {stdio: 'inherit'})
        vim.on('exit', () => {
            console.log("done");
        })
        return;
    }
    if (response.config == "remote") {
        const vim = spawn('vi', [vConfigRemotePath], {stdio: 'inherit'})
        vim.on('exit', () => {
            console.log("done");
        })
        return;
    }
    if (response.config == "plugins") {
        const vim = spawn('vi', [vConfigPluginsPath], {stdio: 'inherit'})
        vim.on('exit', () => {
            console.log("done");
        })
        return;
    }
    if (response.config == "reset") {
        console.log("resetting");
        reset();
        return;
    }
  }

  if (mainOptions.command == "login") {
    await promptEmail();
    return;
  }
  if (mainOptions.command == "logout") {
    await logout();
    return;
  }


  console.log(
    !arg
      ? "please enter either `floro-server start` or `floro-server kill`"
      : "unknown command: " +
          arg +
          " please enter either `floro-server start` or `floro-server kill`"
  );
  pm2.disconnect();
  return;
})();
