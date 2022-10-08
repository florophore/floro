import path from "path";
import pm2 from "pm2";

const DAEMON_PROCESS_NAME = "floro-server-process";

export const startDaemon = async (): Promise<void> => {
  pm2.connect(function (err) {
    if (err) {
      console.error(err);
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
  });
};

export const killDaemon = async (): Promise<void> => {
  pm2.connect(function (err) {
    if (err) {
      console.error(err);
      process.exit(2);
    }
    pm2.stop(DAEMON_PROCESS_NAME, (err) => {
      if (err) {
        console.error("floro daemon error", err);
        pm2.disconnect();
        return;
      }
      console.log("killed floro server");
      pm2.disconnect();
      return;
    });
  });
};
