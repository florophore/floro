#!/usr/bin/env node

import pm2 from "pm2";
import prompts from "prompts";
import { buildFloroFilestructure } from "./filestructure";
import commandLineArgs from "command-line-args";
import { startDaemon, killDaemon } from "./daemon";

/* first - parse the main command */
const mainDefinitions = [{ name: "command", defaultOption: true }];
const mainOptions = commandLineArgs(mainDefinitions, {
  stopAtFirstUnknown: true,
});
const argv = mainOptions._unknown || [];

buildFloroFilestructure();

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
    await startDaemon();
    return;
  }
  if (mainOptions.command == "kill") {
    await killDaemon();
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
