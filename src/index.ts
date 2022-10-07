#!/usr/bin/env node

import path from "path";
import pm2 from "pm2";
import prompts from "prompts";

require("./filestructure");

(async function main() {
  const args = process.argv.splice(2);
  const arg = args[0];

  pm2.connect(function (err) {
    if (err) {
      console.error(err);
      process.exit(2);
    }

    if (arg == "start") {
      pm2.start(
        {
          script: path.join(__dirname, "server.js"),
          name: "floro-server-process",
        },
        function (err, apps) {
          if (err) {
            console.error(err);
            return pm2.disconnect();
          }

          const DEFAULT_PORT = 63403;
          const port = process.env.FLORO_VCDN_PORT;
          console.log(`starting floro server on ${port ?? DEFAULT_PORT}...`);

          pm2.list((err, list) => {

            pm2.restart("floro-server-process", (err, proc) => {
              // Disconnects from PM2
              pm2.disconnect();
            });
          });
        }
      );
    } else if (arg == "kill") {
        pm2.stop('floro-server-process', (err) => {
            if (err) {
                console.log("no floro server running...");
                pm2.disconnect();
                return;
            }
            console.log("killed floro server");
            pm2.disconnect();
            return;
        });
    }
    else {
        console.log(!arg ? "please enter either `floro-server start` or `floro-server kill`" : 'unknown command: ' + arg + ' please enter either `floro-server start` or `floro-server kill`');
        pm2.disconnect();
        return;
    }
  });
})();