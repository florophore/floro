import express from "express";
import path from "path";
import http from "http";
import cors from "cors";
import {
  existsAsync,
  getRemoteHostSync,
  getPluginsJson,
  writeUserSession,
  writeUser,
  removeUserSession,
  removeUser,
  vReposPath,
} from "./filestructure";
import { Server } from "socket.io";
import { createProxyMiddleware } from "http-proxy-middleware";
import multiplexer, {
  broadcastAllDevices,
  broadcastToClient,
} from "./multiplexer";
import { startSessionJob } from "./cron";
import macaddres from "macaddress";
import sha256 from "crypto-js/sha256";
import HexEncode from "crypto-js/enc-hex";
import {
  cloneRepo,
  getLocalRepos,
} from "./repo";
import {
  getCurrentRepoBranch,
  getRepoBranches,
  readBranchHistory,
  readBranchState,
  readCommitHistory,
  readCommitState,
  readCurrentHistory,
  readCurrentState,
  readLastCommit,
  readRepoCommit,
  repoExists,
  switchRepoBranch,
  readSettings,
  writeRepoCommit,
  writeRepoDescription,
  readRepoDescription,
  writeRepoLicenses,
  readRepoLicenses,
  checkoutBranch,
  updatePluginState,
  updatePlugins,
  deleteBranch,
} from "./repoapi";

const remoteHost = getRemoteHostSync();

const app = express();
const server = http.createServer(app);

const pluginsJSON = getPluginsJson();

const pluginGuardedSafeOrginRegex =
  /([A-Z])\w+^(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)(\/(((?!plugins).)*))$/;
const safeOriginRegex =
  /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/;
const corsOptionsDelegate = (req, callback) => {
  if (
    pluginGuardedSafeOrginRegex.test(req.connection.remoteAddress) ||
    req.connection.remoteAddress == "127.0.0.1"
  ) {
    callback(null, {
      origin: true,
    });
  } else {
    // TODO: fix this
    callback("sorry", {
      origin: false,
    });
  }
};

const remoteHostCors = {
  origin: pluginGuardedSafeOrginRegex,
};

const io = new Server(server, {
  cors: {
    origin: safeOriginRegex,
  },
});

const DEFAULT_PORT = 63403;
const DEFAULT_HOST = "127.0.0.1";
const port = !!process.env.FLORO_VCDN_PORT
  ? parseInt(process.env.FLORO_VCDN_PORT)
  : DEFAULT_PORT;
const host = !!process.env.FLORO_VCDN_HOST
  ? process.env.FLORO_VCDN_HOST
  : DEFAULT_HOST;

io.on("connection", (socket) => {
  if (
    socket?.handshake?.headers?.referer &&
    !safeOriginRegex.test(socket?.handshake?.headers?.referer)
  ) {
    socket.disconnect();
    return;
  }
  const client = socket?.handshake?.query?.["client"] as
    | undefined
    | ("web" | "desktop" | "cli");
  if (["web", "desktop", "cli"].includes(client)) {
    multiplexer[client].push(socket);
    socket.on("disconnect", () => {
      multiplexer[client] = multiplexer[client].filter((s) => s !== socket);
    });
  }
});

app.use(express.json());

app.use(function (_req, res, next) {
  res.header("Access-Control-Allow-Origin", remoteHost);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get(
  "/ping",
  cors(corsOptionsDelegate),
  async (_req, res): Promise<void> => {
    res.send("PONG");
  }
);

app.get(
  "/repos",
  cors(corsOptionsDelegate),
  async (_req, res): Promise<void> => {
    const repos = await getLocalRepos();
    res.send({
      repos,
    });
  }
);

app.get(
  "/repo/:repoId/exists",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const exists = await repoExists(repoId);
    res.send({ exists });
  }
);

app.get(
  "/repo/:repoId/branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branch = await getCurrentRepoBranch(repoId);
    if (!branch) {
      res.sendStatus(404);
      return;
    }
    res.send({ branch });
  }
);

app.post(
  "/repo/:repoId/branch/:branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const branch = await switchRepoBranch(repoId, branchName);
    if (!branch) {
      res.sendStatus(400);
      return;
    }
    res.send(branch);
  }
);

app.get(
  "/repo/:repoId/settings",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const settings = await readSettings(repoId);
    if (!settings) {
      res.sendStatus(400);
      return;
    }
    res.send(settings);
  }
);

app.post(
  "/repo/:repoId/checkout/branch/:branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const state = await checkoutBranch(repoId, branchName);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.post(
  "/repo/:repoId/checkout/commit/:sha",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const state = await checkoutBranch(repoId, sha);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.get(
  "/repo/:repoId/branches",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branches = await getRepoBranches(repoId);
    if (!branches) {
      res.sendStatus(400);
      return;
    }
    res.send(branches);
  }
);

app.post(
  "/repo/:repoId/delete/branch/:branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const branches = await deleteBranch(repoId, branchName);
    if (!branches) {
      res.sendStatus(400);
      return;
    }
    res.send(branches);
  }
);

app.post(
  "/repo/:repoId/description",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const description = await writeRepoDescription(
      repoId,
      req.body?.["description"] ?? ""
    );
    if (!description) {
      res.sendStatus(400);
      return;
    }
    res.send(description);
  }
);

app.get(
  "/repo/:repoId/description",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const description = await readRepoDescription(repoId);
    if (!description) {
      res.sendStatus(400);
      return;
    }
    res.send(description);
  }
);

app.post(
  "/repo/:repoId/licenses",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const licenses = await writeRepoLicenses(repoId, req.body?.["licenses"]);
    if (!licenses) {
      res.sendStatus(400);
      return;
    }
    res.send(licenses);
  }
);

app.get(
  "/repo/:repoId/licenses",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const licenses = await readRepoLicenses(repoId);
    if (!licenses) {
      res.sendStatus(400);
      return;
    }
    res.send(licenses);
  }
);

app.get(
  "/repo/:repoId/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const state = await readCurrentState(repoId);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.get(
  "/repo/:repoId/commit/:sha/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const state = readCommitState(repoId);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.get(
  "/repo/:repoId/branch/:branch/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const state = readBranchState(repoId, branchName);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.get(
  "/repo/:repoId/history",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const history = readCurrentHistory(repoId);
    if (!history) {
      res.sendStatus(400);
      return;
    }
    res.send(history);
  }
);

app.get(
  "/repo/:repoId/branch/:branch/history",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const history = readBranchHistory(repoId, branchName);
    if (!history) {
      res.sendStatus(400);
      return;
    }
    res.send(history);
  }
);

app.get(
  "/repo/:repoId/commit/:sha/history",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const history = readCommitHistory(repoId, sha);
    if (!history) {
      res.sendStatus(400);
      return;
    }
    res.send(history);
  }
);

app.get(
  "/repo/:repoId/lastcommit",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const commit = await readLastCommit(repoId);
    if (!commit) {
      res.sendStatus(400);
      return;
    }
    res.send(commit);
  }
);

app.get(
  "/repo/:repoId/commit/:sha",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const commit = await readRepoCommit(repoId, sha);
    if (!commit) {
      res.sendStatus(400);
      return;
    }
    res.send(commit);
  }
);

app.post(
  "/repo/:repoId/plugins",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const plugins = req.body;
    const state = await updatePlugins(repoId, plugins);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.post(
  "/repo/:repoId/plugins/:plugin/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const pluginName = req.params["plugin"];
    const updateState = req.body;
    const state = await updatePluginState(repoId, pluginName, updateState);
    if (!state) {
      res.sendStatus(400);
      return;
    }
    res.send(state);
  }
);

app.post(
  "/repo/:repoId/commit",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const message = req.body?.["message"];
    const commit = await writeRepoCommit(repoId, message);
    if (!commit) {
      res.sendStatus(400);
      return;
    }
    res.send(commit);
  }
);

app.get(
  "/repo/:repoId/clone",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.send({ status: "failed" });
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (exists) {
      res.send({ status: "already_exists" });
      return;
    }
    const didSucceed = await cloneRepo(repoId);
    if (didSucceed) {
      res.send({ status: "success" });
    } else {
      res.send({ status: "failed" });
    }
  }
);

app.post("/login", cors(remoteHostCors), async (req, res) => {
  if (
    req?.body?.__typename == "PassedLoginAction" ||
    req?.body?.__typename == "AccountCreationSuccessAction"
  ) {
    await writeUserSession(req.body.session);
    await writeUser(req.body.user);
    broadcastAllDevices("login", req.body);
    broadcastToClient("desktop", "bring-to-front", null);
    res.send({ message: "ok" });
  } else {
    res.send({ message: "error" });
  }
});

app.post("/logout", cors(remoteHostCors), async (req, res) => {
  try {
    await removeUserSession();
    await removeUser();
  } catch (e) {
    // dont log this
  }
  broadcastAllDevices("logout", {});
  res.send({ message: "ok" });
});

app.get("/device", cors(remoteHostCors), async (req, res) => {
  const mac = await macaddres.one();
  const hash = sha256(mac);
  const id = HexEncode.stringify(hash);
  res.send({ id });
});

app.post("/complete_signup", cors(remoteHostCors), async (req, res) => {
  if (req?.body?.__typename == "CompleteSignupAction") {
    broadcastAllDevices("complete_signup", req.body);
    broadcastToClient("desktop", "bring-to-front", null);
    res.send({ message: "ok" });
  } else {
    res.send({ message: "error" });
  }
});

for (let plugin in pluginsJSON.plugins) {
  let pluginInfo = pluginsJSON.plugins[plugin];
  if (pluginInfo["proxy"]) {
    const proxy = createProxyMiddleware("/plugins/" + plugin, {
      target: pluginInfo["host"],
      secure: true,
      ws: false,
      changeOrigin: false,
    });
    app.use(proxy);
  }
}

app.get("/plugins/:pluginName*", async (req, res) => {
  const pluginName = req?.params?.['pluginName'];
  const version = req?.query?.['v'];
  console.log("PN", pluginName);
  console.log("V", version);
  console.log("path", req.path);
  // finsish this
  res.send({ok: true});
});

server.listen(port, host, () =>
  console.log("floro server started on " + host + ":" + port)
);
startSessionJob();

export default server;