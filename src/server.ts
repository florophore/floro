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
  getUser,
  getUserAsync,
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
  writeCommit,
  getLocalBranch,
  updateLocalBranch,
  updateCurrentCommitSHA,
  getCurrentCommitSha,
  getHistory,
  readCommit,
  getCommitState,
  Branch,
  updateCurrentBranch,
  updateCurrentWithNewBranch,
  updateCurrentWithSHA,
  deleteLocalBranch,
  canCommit,
} from "./repo";
import { applyDiff, CommitData, DiffElement, getDiff, getDiffHash, getTextDiff } from "./versioncontrol";
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
import { getCurrentRepoBranch, getRepoBranches, getSettings, readBranchHistory, readBranchState, readCommitHistory, readCurrentHistory, readCurrentState, readLastCommit, readRepoCommit, repoExists, switchRepoBranch } from "./repoapi";
import { restart } from "pm2";

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
    const settings = await getSettings(repoId);
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
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const currentBranches = await getLocalBranches(repoId);
    if (!currentBranches.map(v => v.name.toLowerCase()).includes(branchName.toLowerCase())) {
      res.sendStatus(400);
      return;
    }

    const branchData = await getLocalBranch(repoId, branchName);
    if (!branchData) {
      res.sendStatus(400);
      return;
    }
    const current = await updateCurrentWithNewBranch(repoId, branchName);
    res.send(current);
  }
);

app.post(
  "/repo/:repoId/checkout/commit/:sha",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    try {
      const commit = await readCommit(repoId, sha);
      if (!commit) {
        res.sendStatus(400);
        return;
      }

      const current = await updateCurrentWithSHA(repoId, sha);
      if (!current) {
        res.sendStatus(400);
        return;
      }
      res.send(current);
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
)


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
    res.send({ branches });
  }
);

app.post(
  "/repo/:repoId/delete/branch/:branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    if (!repoId) {
      res.sendStatus(404);
    }
    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const currentBranches = await getLocalBranches(repoId);
    if (!currentBranches.map(v => v.name.toLowerCase()).includes(branchName.toLowerCase())) {
      res.sendStatus(400);
      return;
    }
    const current = await getCurrentState(repoId);
    if (current.branch && current.branch.toLowerCase() == branchName.toLocaleLowerCase()) {
      await deleteLocalBranch(repoId, branchName);
    }
    const branches = await getLocalBranches(repoId);
    res.send(branches);
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
  "/repo/:repoId/current",
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
    const current = await getCurrentState(repoId);
    res.send(current);
  }
);

/**
 * STATE 
 */

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
      res.sendStatus(404);
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
      res.sendStatus(404);
      return;
    }
    res.send(state);
  }
);


/**
 * HISTORY 
 */

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
});

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

/** 
 * GRAPH
 * draw commit history against branches
 * /branches - total history
 * /branch - branch history
 * / - current branch history (if on branch)
*/

/**
 * CHANGES 
 */

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
    res.send(commit)
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
    res.send(commit)
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

app.post(
  "/repo/:repoId/commit",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const message = req.body?.["message"];

    const exists = await existsAsync(path.join(vReposPath, repoId));
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    if (!message) {
      res.sendStatus(400);
      return;
    }
    const user = await getUserAsync();
    if (!user.id) {
      res.sendStatus(400);
      return;
    }
    if (!canCommit(repoId, user, message)) {
      res.sendStatus(400);
      return;
    }
    const currentState = await getCurrentState(repoId);
    const currentSha = await getCurrentCommitSha(repoId);
    const timestamp = (new Date()).toString();
    const commitData: CommitData = {
      parent: currentSha,
      historicalParent: currentSha,
      diff: currentState.diff,
      timestamp,
      userId: user.id,
      message
    };
    const sha = getDiffHash(commitData);
    const commit = await writeCommit(repoId, sha, {sha, ...commitData});
    if (!commit) {
      res.sendStatus(400);
      return;
    }
    if (currentState.branch) {
      const branchState = await getLocalBranch(repoId, currentState.branch); 
      if (!branchState) {
        res.sendStatus(400);
        return;
      }
      await updateLocalBranch(repoId, currentState.branch, {
        ...branchState,
        lastCommit: sha
      });
      await updateCurrentCommitSHA(repoId, null);
    } else {
      await updateCurrentCommitSHA(repoId, sha);
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

server.listen(port, host, () =>
  console.log("floro server started on " + host + ":" + port)
);
startSessionJob();

export default server;

