import path from "path";
import pm2 from "pm2";

const DAEMON_PROCESS_NAME = "floro-server-process";

export const startDaemon = async (): Promise<void> => {
  return new Promise(resolve => {
    pm2.connect(function (err) {
      if (err) {
        console.error(err);
        resolve();
        process.exit(2);
      }

      pm2.start(
        {
          script: path.join(__dirname, "server.js"),
          name: DAEMON_PROCESS_NAME,
        },
        function (err, apps) {
          if (err) {
            console.error(err);
            pm2.disconnect();
            resolve();
            return;
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
          resolve();
        }
      );
    });
  })
};

export const killDaemon = async (): Promise<void> => {
  return new Promise(resolve => {
    pm2.connect(function (err) {
      if (err) {
        console.error(err);
        process.exit(2);
      }
      pm2.stop(DAEMON_PROCESS_NAME, (err) => {
        if (err) {
          console.error("floro daemon error", err);
          pm2.disconnect();
          resolve();
          return;
        }
        console.log("killed floro server");
        pm2.disconnect();
        resolve();
        return;
      });
    });
  })
};
