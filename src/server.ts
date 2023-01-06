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
  getLocalBranches,
  getLocalRepos,
  getRepoSettings,
  getCurrentBranch,
  getRepoState,
  saveDiffListToCurrent,
  getCurrentState,
  getUnstagedCommitState,
  buildStateStore,
} from "./repo";
import { applyDiff, DiffElement, getDiff, getTextDiff } from "./versioncontrol";
import {
  constructDependencySchema,
  generateStateFromKV,
  getKVStateForPlugin,
  getPluginManifest,
  getRootSchemaForPlugin,
  getUpstreamDependencyList,
  hasPlugin,
} from "./plugins";
import { LicenseCodes } from "./licensecodes";

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
    if (!repoId) {
      res.send({ exists: false });
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    res.send({ exists });
  }
);

app.get(
  "/repo/:repoId/branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const branch = await getCurrentBranch(repoId);
    res.send({ branch });
  }
);

app.get(
  "/repo/:repoId/settings",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const settings = await getRepoSettings(repoId);
    res.send({ settings });
  }
);

app.get(
  "/repo/:repoId/branches",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const branches = await getLocalBranches(repoId);
    res.send({ branches });
  }
);

app.post(
  "/repo/:repoId/description",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const description = req.body?.["description"] ?? "";

    const unstagedState = await getUnstagedCommitState(repoId);
    const diff = getTextDiff(unstagedState.description?.join(""), description);
    const state = await saveDiffListToCurrent(repoId, [
      {
        diff,
        namespace: "description",
      },
    ]);
    const nextDescription = applyDiff(
      state.diff.description,
      unstagedState.description
    );
    res.send({ description: nextDescription });
  }
);

app.get(
  "/repo/:repoId/description",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const state = await getRepoState(repoId);
    res.send({ description: state.description });
  }
);

app.post(
  "/repo/:repoId/licenses",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    try {
      const licenses: Array<DiffElement> = (req.body?.["licenses"] ?? [])?.map(
        (rawLicense: DiffElement) => {
          if (!LicenseCodes?.[rawLicense?.key]) {
            return null;
          }
          return {
            key: rawLicense.key,
            value: LicenseCodes[rawLicense.key],
          };
        }
      );
      if (licenses.includes(null)) {
        res.sendStatus(400);
        return;
      }

      const unstagedState = await getUnstagedCommitState(repoId);
      const diff = getDiff(unstagedState.licenses, licenses);
      const state = await saveDiffListToCurrent(repoId, [
        {
          diff,
          namespace: "licenses",
        },
      ]);
      const nextLicenses = applyDiff(
        state.diff.licenses,
        unstagedState.licenses
      );
      res.send({ licenses: nextLicenses });
    } catch (e) {
      res.sendStatus(400);
    }
  }
);

app.get(
  "/repo/:repoId/licenses",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const state = await getRepoState(repoId);
    res.send({ licenses: state.licenses });
  }
);

app.get(
  "/repo/:repoId/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const state = await getRepoState(repoId);
    const store = await buildStateStore(state);
    res.send({ state: { ...state, store } });
  }
);

app.post(
  "/repo/:repoId/plugins",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    // TODO: VALIDATE PLUGINS
    const { plugins } = req.body;
    // perform compat check
    // fetch upstream plugins
    const unstagedState = await getUnstagedCommitState(repoId);
    const pluginsDiff = getDiff(unstagedState.plugins, plugins);
    const nextPluginState = applyDiff(pluginsDiff, unstagedState.plugins);
    const pluginAdditions = [];
    for (let plugin of nextPluginState) {
      if (!hasPlugin(plugin.key, unstagedState.plugins)) {
        pluginAdditions.push({
          namespace: "store",
          pluginName: plugin.key,
          diff: {
            add: {},
            remove: {},
          },
        });
      }
    }

    // TRANSFORM store and binaries
    // run migrations
    //const state = await saveDiffToCurrent(repoId, pluginsDiff, 'plugins');
    const state = await saveDiffListToCurrent(repoId, [
      {
        diff: pluginsDiff,
        namespace: "plugins",
      },
      ...pluginAdditions,
    ]);
    res.send({ state });
  }
);

app.post(
  "/repo/:repoId/plugins/:plugin/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const pluginName = req.params["plugin"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const unstagedState = await getUnstagedCommitState(repoId);
    const current = await getRepoState(repoId);
    if (current == null) {
      res.sendStatus(404);
      return;
    }
    // TODO MOVE THIS LOGIC TO HANDLE DOWNSTREAM
    const manifest = await getPluginManifest(
      pluginName,
      current?.plugins ?? []
    );
    if (manifest == null) {
      res.sendStatus(404);
      return;
    }
    const upstreamDependencies = await getUpstreamDependencyList(
      pluginName,
      manifest,
      current?.plugins ?? []
    );
    const upsteamSchema = await constructDependencySchema(upstreamDependencies);
    const rootSchema = getRootSchemaForPlugin(
      upsteamSchema,
      manifest,
      pluginName
    );
    const kvState = getKVStateForPlugin(
      upsteamSchema,
      manifest,
      pluginName,
      req.body ?? {}
    );
    const diff = getDiff(unstagedState.store?.[pluginName] ?? [], kvState);

    // needs to be looped through for each plugin in downstream deps
    const nextState = applyDiff(diff, unstagedState?.store?.[pluginName] ?? []);
    // END TODO

    const commitState = await saveDiffListToCurrent(repoId, [
      {
        diff,
        namespace: "store",
        pluginName,
      },
    ]);

    const state = generateStateFromKV(manifest, nextState, pluginName);

    // run cascade next
    // find downstream plugins
    // run cascades on downstream schemas
    // save all diffs against respective manifests

    // return constructed kv state of plugin and upstreams
    res.send({ [pluginName]: state });
  }
);
app.get(
  "/repo/:repoId/plugins/:plugin/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const pluginName = req.params["plugin"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const current = await getRepoState(repoId);

    const manifest = await getPluginManifest(
      pluginName,
      current?.plugins ?? []
    );
    if (manifest == null) {
      res.sendStatus(404);
      return;
    }

    const state = generateStateFromKV(
      manifest,
      current?.store?.[pluginName] ?? [],
      pluginName
    );
    res.send({ [pluginName]: state });
  }
);

app.post(
  "/repo/:repoId/stash",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];

    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const currentState = await getCurrentState(repoId);
    res.send({ ok: true });
  }
);

app.get(
  "/repo/:repoId/stash/status",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];

    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const currentState = await getCurrentState(repoId);
    res.send({ ok: true });
  }
);

app.post(
  "/repo/:repoId/stash/pop",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {}
);

app.get(
  "/repo/:repoId/plugins/:plugin/validate",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {}
);

app.get(
  "/repo/:repoId/current/diff",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
  }
);

app.post(
  "/repo/:repoId/checkout",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branch = req.params["branch"];
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

server.listen(port, host, () =>
  console.log("floro server started on " + host + ":" + port)
);
startSessionJob();

export default server;
