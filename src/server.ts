import express from "express";
import path from "path";
import fs from 'fs';
import http from "http";
import cors from "cors";
import mime from 'mime-types';
import {
  existsAsync,
  getRemoteHostSync,
  getPluginsJson,
  writeUserSession,
  writeUser,
  removeUserSession,
  removeUser,
  vReposPath,
  vDEVPath,
  vBinariesPath,
  vPluginsPath,
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
  changeCommandMode,
  cloneRepo,
  convertRenderedCommitStateToKv,
  getApplicationState,
  renderApiReponse,
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
  switchRepoBranch,
  readSettings,
  writeRepoCommit,
  writeRepoDescription,
  readRepoDescription,
  writeRepoLicenses,
  readRepoLicenses,
  checkoutSha,
  updatePlugins,
  //deleteBranch,
} from "./repoapi";
import { makeMemoizedDataSource, readDevPluginManifest } from "./datasource";
import busboy from 'connect-busboy';
import { hashBinary } from "./versioncontrol";
import { LicenseCodesList } from "./licensecodes";
import {
  getDependenciesForManifest,
  manifestListToSchemaMap,
  getPluginManifests,
  pluginManifestIsSubsetOfManifest,
  getDownstreamDepsInSchemaMap,
  getUpstreamDependencyManifests,
} from "./plugins";

const remoteHost = getRemoteHostSync();

const app = express();
const server = http.createServer(app);
const datasource = makeMemoizedDataSource();

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

app.use(busboy());

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
    const repos = await datasource.readRepos();
    res.send({
      repos,
    });
  }
);

app.get(
  "/licenses",
  cors(corsOptionsDelegate),
  async (_req, res): Promise<void> => {
    res.send(LicenseCodesList);
  }
);

app.get(
  "/repo/:repoId/exists",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const exists = await datasource.repoExists(repoId);
    res.send({ exists });
  }
);

app.get(
  "/repo/:repoId/current",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    // will iterate on this
    const [repoState, renderedState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      getApplicationState(datasource, repoId),
    ]);
    const applicationState = await convertRenderedCommitStateToKv(
      datasource,
      renderedState
    );
    const apiResponse = await renderApiReponse(
      datasource,
      renderedState,
      applicationState,
      repoState
    );
    if (!apiResponse) {
      res.sendStatus(404);
      return;
    }
    res.send(apiResponse);
  }
);

app.post(
  "/repo/:repoId/command",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const repoState = await changeCommandMode(datasource, repoId, req.body.commandMode);
    const renderedState = await getApplicationState(datasource, repoId);
    const applicationState = await convertRenderedCommitStateToKv(
      datasource,
      renderedState
    );
    const apiResponse = await renderApiReponse(
      datasource,
      renderedState,
      applicationState,
      repoState
    );
    if (!apiResponse) {
      res.sendStatus(404);
      return;
    }
    res.send(apiResponse);
  }
);

app.get(
  "/repo/:repoId/branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const branch = await getCurrentRepoBranch(datasource, repoId);
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
    const branch = await switchRepoBranch(datasource, repoId, branchName);
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
    const settings = await readSettings(datasource, repoId);
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
    const state = await switchRepoBranch(datasource, repoId, branchName);
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
    const state = await checkoutSha(datasource, repoId, sha);
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
    const branches = await getRepoBranches(datasource, repoId);
    if (!branches) {
      res.sendStatus(400);
      return;
    }
    res.send(branches);
  }
);

//app.post(
//  "/repo/:repoId/delete/branch/:branch",
//  cors(corsOptionsDelegate),
//  async (req, res): Promise<void> => {
//    const repoId = req.params["repoId"];
//    const branchName = req.params["branch"];
//    const branches = await deleteBranch(datasource, repoId, branchName);
//    if (!branches) {
//      res.sendStatus(400);
//      return;
//    }
//    res.send(branches);
//  }
//);

app.post(
  "/repo/:repoId/description",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await writeRepoDescription(
      datasource,
      repoId,
      req.body?.["description"] ?? ""
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      datasource,
      renderedState,
      applicationState,
      repoState
    );
    if (!apiResponse) {
      res.sendStatus(404);
      return;
    }
    res.send(apiResponse);
  }
);

//app.get(
//  "/repo/:repoId/description",
//  cors(corsOptionsDelegate),
//  async (req, res): Promise<void> => {
//    const repoId = req.params["repoId"];
//    const description = await readRepoDescription(datasource, repoId);
//    if (!description) {
//      res.sendStatus(400);
//      return;
//    }
//    res.send(description);
//  }
//);

app.post(
  "/repo/:repoId/licenses",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await writeRepoLicenses(
      datasource,
      repoId,
      req.body?.["licenses"] ?? []
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      datasource,
      renderedState,
      applicationState,
      repoState
    );
    if (!apiResponse) {
      res.sendStatus(404);
      return;
    }
    res.send(apiResponse);
  }
);

app.get(
  "/repo/:repoId/plugin/:pluginName/:version/compatability",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return null;
    }

    const pluginName = req.params?.["pluginName"];
    const pluginVersion = req.params?.["version"];
    const renderedState = await datasource.readRenderedState(repoId);
    if (!renderedState) {
      res.sendStatus(400);
      return null;
    }
    if (!pluginName || !pluginVersion) {
      res.sendStatus(400);
      return null;
    }
    const manifest = await datasource.getPluginManifest(
      pluginName,
      pluginVersion,
      true
    );
    if (!manifest) {
      res.sendStatus(400);
      return null;
    }
    const depFetch = await getDependenciesForManifest(datasource, manifest, true);
    if (depFetch.status == "error") {
      return null;
    }
    const fetchedDeps = depFetch.deps.filter(depManifest => {
      return manifest.imports[depManifest.name] == depManifest.version;
    });
    const proposedSchemaMap =  manifestListToSchemaMap([manifest, ...depFetch.deps]);
    const currentManifests = await getPluginManifests(datasource, renderedState.plugins, true);
    const currentSchemaMap = manifestListToSchemaMap(currentManifests);
    const isCompatible = await pluginManifestIsSubsetOfManifest(
      datasource,
      currentSchemaMap,
      {
        ...currentSchemaMap,
        ...proposedSchemaMap
      }
    );
    if (isCompatible) {
      const dependencies = fetchedDeps.map(manifest => {
        return {
          pluginName: manifest.name,
          pluginVersion: manifest.version,
          isCompatible: true
        }

      });
      res.send({
        pluginName,
        pluginVersion,
        isCompatible,
        dependencies
      });
      return;
    }
    const dependencies = [];
    for (const depManifest of fetchedDeps) {
      const depFetch = await getDependenciesForManifest(datasource, depManifest, true);
      const proposedSchemaMap =  manifestListToSchemaMap([depManifest, ...depFetch.deps]);
      const isCompatible = await pluginManifestIsSubsetOfManifest(
        datasource,
        currentSchemaMap,
        {
          ...currentSchemaMap,
          ...proposedSchemaMap
        }
      );
      dependencies.push({
          pluginName: depManifest.name,
          pluginVersion: depManifest.version,
          isCompatible
      });
    }
    res.send({
      pluginName,
      pluginVersion,
      isCompatible,
      dependencies
    });
  }
);

app.get(
  "/repo/:repoId/plugin/:pluginName/:version/canuninstall",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return null;
    }

    const pluginName = req.params?.["pluginName"];
    const pluginVersion = req.params?.["version"];
    const renderedState = await datasource.readRenderedState(repoId);
    if (!renderedState) {
      res.sendStatus(400);
      return null;
    }
    if (!pluginName || !pluginVersion) {
      res.sendStatus(400);
      return null;
    }

    const currentManifests = await getPluginManifests(
      datasource,
      renderedState.plugins
    );
    const currentSchemaMap = manifestListToSchemaMap(currentManifests);
    const downstreamDeps = getDownstreamDepsInSchemaMap(currentSchemaMap, pluginName);
    res.send({
      canUninstall: downstreamDeps.length == 0,
      downstreamDeps,
      manifestList: currentManifests
    })
  }
);

app.post(
  "/repo/:repoId/plugin/:pluginName/canupdate",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return null;
    }

    const pluginName = req.params?.["pluginName"];
    const versions: Array<string> = req.body?.["versions"];

    if (!pluginName) {
      res.sendStatus(400);
      return null;
    }

    const renderedState = await datasource.readRenderedState(repoId);
    if (!renderedState) {
      res.sendStatus(400);
      return null;
    }

    const currentManifests = await getPluginManifests(
      datasource,
      renderedState.plugins
    );
    const currentSchemaMap = manifestListToSchemaMap(currentManifests);

    for (let version of versions) {
      const manifest = await datasource.getPluginManifest(pluginName, version, true);
      if (!manifest) {
        continue;
      }

      const depFetch = await getDependenciesForManifest(datasource, manifest, true);
      if (depFetch.status == "error") {
        continue;
      }

      const proposedSchemaMap =  manifestListToSchemaMap([manifest, ...depFetch.deps]);
      const isCompatible = await pluginManifestIsSubsetOfManifest(
        datasource,
        currentSchemaMap,
        {
          ...currentSchemaMap,
          ...proposedSchemaMap
        }
      );
      if (isCompatible) {
        res.send({
          canUpdate: true
        })
        return;
      }
    }
    res.send({
      canUpdate: false
    })
  }
);

app.get(
  "/repo/:repoId/manifestlist",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return null;
    }

    const renderedState = await datasource.readRenderedState(repoId);
    if (!renderedState) {
      res.sendStatus(400);
      return null;
    }

    const currentManifests = await getPluginManifests(
      datasource,
      renderedState.plugins
    );
    for (let manifest of currentManifests) {
      const upstreamDeps = await getUpstreamDependencyManifests(datasource, manifest);
      for (const upstreamDep of upstreamDeps) {
        const seen = !!currentManifests?.find(
          (m) => m.name == upstreamDep.name && m.version == upstreamDep.version
        );
        if (!seen) {
          currentManifests.push(upstreamDep)
        }
      }

    }
    res.send(currentManifests)
  }
);

app.get(
  "/repo/:repoId/plugin/:pluginName/:version/manifestlist",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return null;
    }

    const pluginName = req.params?.["pluginName"];
    const pluginVersion = req.params?.["version"];
    const renderedState = await datasource.readRenderedState(repoId);
    if (!renderedState) {
      res.sendStatus(400);
      return null;
    }
    if (!pluginName || !pluginVersion) {
      res.sendStatus(400);
      return null;
    }

    const currentManifests = await getPluginManifests(
      datasource,
      renderedState.plugins
    );

    const manifest = await datasource.getPluginManifest(pluginName, pluginVersion);
    const upstreamDeps = await getUpstreamDependencyManifests(datasource, manifest);
    const manifestList = currentManifests;
    for (const upstreamDep of upstreamDeps) {
      const seen = !!manifestList?.find(
        (m) => m.name == upstreamDep.name && m.version == upstreamDep.version
      );
      if (!seen) {
        manifestList.push(upstreamDep)
      }
    }
    res.send(manifestList)
  }
);

app.post(
  "/repo/:repoId/plugins",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await updatePlugins(
      datasource,
      repoId,
      req.body?.["plugins"] ?? []
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      datasource,
      renderedState,
      applicationState,
      repoState
    );
    if (!apiResponse) {
      res.sendStatus(404);
      return;
    }
    res.send(apiResponse);
  }
);

app.get(
  "/repo/:repoId/licenses",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const licenses = await readRepoLicenses(datasource, repoId);
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
    const state = await readCurrentState(datasource, repoId);
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
    const state = readCommitState(datasource, repoId);
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
    const state = readBranchState(datasource, repoId, branchName);
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
    const history = readCurrentHistory(datasource, repoId);
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
    const history = readBranchHistory(datasource, repoId, branchName);
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
    const history = readCommitHistory(datasource, repoId, sha);
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
    const commit = await readLastCommit(datasource, repoId);
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
    const commit = await readRepoCommit(datasource, repoId, sha);
    if (!commit) {
      res.sendStatus(400);
      return;
    }
    res.send(commit);
  }
);

//app.post(
//  "/repo/:repoId/plugins",
//  cors(corsOptionsDelegate),
//  async (req, res): Promise<void> => {
//    const repoId = req.params["repoId"];
//    const plugins = req.body;
//    const state = await updatePlugins(repoId, plugins);
//    if (!state) {
//      res.sendStatus(400);
//      return;
//    }
//    res.send(state);
//  }
//);
//
//app.post(
//  "/repo/:repoId/plugins/:plugin/state",
//  cors(corsOptionsDelegate),
//  async (req, res): Promise<void> => {
//    const repoId = req.params["repoId"];
//    const pluginName = req.params["plugin"];
//    const updateState = req.body;
//    const state = await updatePluginState(repoId, pluginName, updateState);
//    if (!state) {
//      res.sendStatus(400);
//      return;
//    }
//    res.send(state);
//  }
//);

app.post(
  "/repo/:repoId/commit",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const message = req.body?.["message"];
    const commit = await writeRepoCommit(datasource, repoId, message);
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

app.use("/binary/upload", busboy({
  limits: {
    fileSize: 1024 * 1024 * 1024, //1GB limit
  }
}));

app.post("/binary/upload", cors(remoteHostCors), async (req, res) => {
  let numFiles = 0;
  let didCancel = false;
  let fileRef = null;
  if (req.busboy) {
    req.pipe(req.busboy);
    req.busboy.on('file', (_, file, info) => {
      const extension = mime.extension(info.mimeType);
      if (!extension) {
        didCancel = true;
        res.sendStatus(400);
        return;
      }
      if (!didCancel) {
        numFiles++;
        if (numFiles > 1) {
          didCancel = true;
          res.sendStatus(400);
          return;
        }
      }
      let fileData = null;
      file.on('data', (data, err) => {
        if (err) {
          didCancel = true;
          res.sendStatus(400);
          return;
        }
        if (!didCancel) {
          if (fileData == null) {
            fileData = data
          } else {
            fileData = Buffer.concat([fileData, data]);
          }
        }
      });
      file.on('end', async (err) => {
        try {
          if (didCancel) {
            return;
          }
          if (err) {
            didCancel = true;
            res.sendStatus(400);
            return;
          }
          const sha = hashBinary(fileData);
          const filename = `${sha}.${extension}`;
          const binSubDir = path.join(vBinariesPath, sha.substring(0, 2));
          const existsBinSubDir = await existsAsync(binSubDir)
          if (!existsBinSubDir) {
            fs.promises.mkdir(binSubDir, {recursive: true});
          }
          const fullPath = path.join(binSubDir, filename);
          const exists = await existsAsync(fullPath)
          if (!exists) {
            await fs.promises.writeFile(fullPath, fileData, 'utf8');
          }
          fileRef = filename;
          res.send({
            fileRef
          })
        } catch (e) {
          didCancel = true;
          res.sendStatus(400);
          return;
        }
      })
    });
  }
});

app.get("/binary/:binaryRef", async (req, res) => {
  const binaryRef = req?.params?.["binaryRef"];
  const binSubDir = path.join(vBinariesPath, binaryRef.substring(0, 2));
  const existsBinSubDir = await existsAsync(binSubDir);
  if (!existsBinSubDir) {
    res.sendStatus(404);
    return;
  }
  const fullPath = path.join(binSubDir, binaryRef);
  const exists = await existsAsync(fullPath);
  if (!exists) {
    res.sendStatus(404);
    return;
  }
  fs.createReadStream(fullPath).pipe(res);
});

app.get("/plugins/:pluginName/dev@*", async (req, res) => {
  const pluginName = req?.params?.['pluginName'];
  const pluginVersion = req.path.split("/")[3];
  const [,version] = pluginVersion.split("@")
  if (!version) {
    res.sendStatus(404);
    return;
  }
  const manifest = await readDevPluginManifest(pluginName, pluginVersion);
  if (!manifest) {
    res.sendStatus(404);
    return;
  }
  const prodPath = `/plugins/${pluginName}/${version}`;
  const basePath = `/plugins/${pluginName}/${pluginVersion}`;
  const pathRemainer = req.path.substring(basePath.length)?.split('?')[0];
  if (!pathRemainer || pathRemainer == "/" || pathRemainer == "/write" || pathRemainer == "/write/") {
    const filePath = path.join(vDEVPath, pluginName, version, 'index.html');
    const exists = await existsAsync(filePath)
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const indexHtml = await fs.promises.readFile(filePath);
    res.type('html');
    res.send(indexHtml.toString().replaceAll(prodPath, basePath))
    return;
  }

  const filePath = path.join(vDEVPath, pluginName, version, ...pathRemainer.split("/"));
  const exists = await existsAsync(filePath)
  if (!exists) {
    res.sendStatus(404);
    return;
  }
  const file = await fs.promises.readFile(filePath);
  const contentType = mime.contentType(path.extname(filePath))
  res.setHeader('content-type', contentType);
  res.send(file.toString().replaceAll(prodPath, basePath));
});

for (let plugin in pluginsJSON.plugins) {
  let pluginInfo = pluginsJSON.plugins[plugin];
  if (pluginInfo["proxy"]) {
    const proxy = createProxyMiddleware("/plugins/" + plugin + "/dev", {
      target: pluginInfo["host"],
      secure: true,
      ws: false,
      changeOrigin: false,
    });
    app.use(proxy);
  }
}

app.get("/plugins/:pluginName/:pluginVersion*", async (req, res) => {
  const pluginName = req?.params?.['pluginName'];
  const pluginVersion = req?.params?.['pluginVersion'];

  if (!pluginVersion) {
    res.sendStatus(404);
    return;
  }
  const manifest = await datasource.getPluginManifest(pluginName, pluginVersion);
  if (!manifest) {
    res.sendStatus(404);
    return;
  }
  const basePath = `/plugins/${pluginName}/${pluginVersion}`;
  const pathRemainer = req.path.substring(basePath.length)?.split('?')[0];
  if (!pathRemainer || pathRemainer == "/" || pathRemainer == "/write" || pathRemainer == "/write/") {
    const filePath = path.join(vPluginsPath, pluginName, pluginVersion, 'index.html');
    const exists = await existsAsync(filePath)
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const indexHtml = await fs.promises.readFile(filePath);
    res.type('html');
    res.send(indexHtml.toString().replaceAll(basePath, basePath))
    return;
  }

  const filePath = path.join(vPluginsPath, pluginName, pluginVersion, ...pathRemainer.split("/"));
  const exists = await existsAsync(filePath)
  if (!exists) {
    res.sendStatus(404);
    return;
  }
  const file = await fs.promises.readFile(filePath);
  const contentType = mime.contentType(path.extname(filePath))
  res.setHeader('content-type', contentType);
  res.send(file.toString());
});

server.listen(port, host, () =>
  console.log("floro server started on " + host + ":" + port)
);
startSessionJob();

export default server;