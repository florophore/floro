import express from "express";
import path from "path";
import fs from 'fs';
import http from "http";
import cors from "cors";
import mime from 'mime-types';
import { isBinaryFile } from "arraybuffer-isbinary"
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
  getPluginsJsonAsync,
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
} from "./repo";
import {
  convertRenderedCommitStateToKv,
  getApplicationState,
  updateComparison,
  getCurrentRepoBranch,
  getRepoBranches,
  switchRepoBranch,
  readSettings,
  writeRepoCommit,
  writeRepoDescription,
  writeRepoLicenses,
  updatePlugins,
  updatePluginState,
  canSwitchShasWithWIP,
  createRepoBranch,
  deleteLocalBranch,
  stashChanges,
  popStashedChanges,
  discardCurrentChanges,
  updateLocalBranch,
  getCanAutoMergeOnTopCurrentState,
  getCanAutoMergeOnUnStagedState,
  mergeCommit,
  updateMergeDirection,
  abortMerge,
  resolveMerge,
  updateCurrentWithSHA,
  renderApiReponse,
  renderSourceGraphInputs,
  getCanCherryPickRevision,
  getCanAmendRevision,
  getCanAutofixReversion,
  cherryPickRevision,
  revertCommit,
  amendRevision,
  autofixReversion,
  changeCommandMode,
} from "./repoapi";
import { makeMemoizedDataSource, readDevPluginManifest, readDevPlugins, readDevPluginVersions } from "./datasource";
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

const localPlugin = {
  origin: safeOriginRegex,
}

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

app.use(express.json({limit: '1gb'}));

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
    const [repoState, renderedState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      getApplicationState(datasource, repoId),
    ]);
    const applicationState = await convertRenderedCommitStateToKv(
      datasource,
      renderedState
    );
    const apiResponse = await renderApiReponse(
      repoId,
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
  "/repo/:repoId/sourcegraph",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    try {
      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      if (!sourceGraphResponse) {
        res.sendStatus(404);
        return;
      }
      res.send(sourceGraphResponse);
    } catch(e) {
      res.sendStatus(400);
    }
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
      repoId,
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
  "/repo/:repoId/comparison",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const against = req.body["against"] as "wip"|"branch"|"sha";
    const branch = req.body["branch"] as string ?? null;
    const sha = req.body["sha"] as string ?? null;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    if (!against) {
      res.sendStatus(400);
      return;
    }
    const repoState = await updateComparison(
      datasource,
      repoId,
      against,
      branch,
      sha
    );

    if (!repoState) {
      res.sendStatus(400);
      return;
    }
    const renderedState = await getApplicationState(datasource, repoId);
    const applicationState = await convertRenderedCommitStateToKv(
      datasource,
      renderedState
    );
    const apiResponse = await renderApiReponse(
      repoId,
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
  "/repo/:repoId/commit",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const message = req.body["message"];

    if (!repoId) {
      res.sendStatus(404);
      return;
    }

    if (!message) {
      res.sendStatus(400);
      return;
    }

    const commitData = await writeRepoCommit(
      datasource,
      repoId,
      message
    );
    if (!commitData) {
      res.sendStatus(400);
      return;
    }
    const [repoState, renderedState] = await Promise.all([
      changeCommandMode(datasource, repoId, "view"),
      getApplicationState(datasource, repoId),
    ]);
    const applicationState = await convertRenderedCommitStateToKv(
      datasource,
      renderedState
    );
    const apiResponse = await renderApiReponse(
      repoId,
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


app.get(
  "/repo/:repoId/sha/:sha/canswitchwip",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const canSwitch = await canSwitchShasWithWIP(
        datasource,
        repoId,
        sha
      );
      if (canSwitch == null) {
        res.sendStatus(400);
        return;
      }
      res.send({ canSwitch });
    } catch(e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canautomerge",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const [
        canAutoMergeOnTopOfCurrentState,
        canAutoMergeOnUnStagedState,
      ] = await Promise.all([
        getCanAutoMergeOnTopCurrentState(datasource, repoId, sha),
        getCanAutoMergeOnUnStagedState(datasource, repoId, sha),
      ]);
      if (canAutoMergeOnTopOfCurrentState == null || canAutoMergeOnUnStagedState == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canAutoMergeOnTopOfCurrentState,
        canAutoMergeOnUnStagedState,
       });
    } catch(e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/cancherrypick",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const canCherryPick = await getCanCherryPickRevision(datasource, repoId, sha);
      if (canCherryPick == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canCherryPick,
       });
    } catch(e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canamend",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const canAmend = await getCanAmendRevision(datasource, repoId, sha);
      if (canAmend == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canAmend,
       });
    } catch(e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canautofix",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const canAutoFix = await getCanAutofixReversion(datasource, repoId, sha);
      if (canAutoFix == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canAutoFix,
       });
    } catch(e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/merge",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    if (!repoId || !sha) {
      res.sendStatus(404);
      return;
    }
    try {
      const renderedState = await mergeCommit(datasource, repoId, sha);
      const repoState = await datasource.readCurrentRepoState(repoId);
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/merge/abort",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    try {
      const renderedState = await abortMerge(datasource, repoId);
      const repoState = await datasource.readCurrentRepoState(repoId);
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );
      res.send(apiResponse);
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/merge/resolve",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    try {
      const renderedState = await resolveMerge(datasource, repoId);
      const repoState = await datasource.readCurrentRepoState(repoId);
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );
      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/merge/direction/:direction",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const direction = req.params["direction"];
    if (!repoId || !direction || (direction != "yours" && direction != "theirs")) {
      res.sendStatus(404);
      return;
    }
    try {
      const initRepoState = await datasource.readCurrentRepoState(repoId);
      if (!initRepoState.isInMergeConflict || initRepoState.merge.direction == direction) {
        return null;
      }
      const renderedState = await updateMergeDirection(datasource, repoId, direction);
      const repoState = await datasource.readCurrentRepoState(repoId);
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      res.send(apiResponse);
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/cherrypick",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    if (!repoId || !sha) {
      res.sendStatus(404);
      return;
    }
    try {

      const renderedState = await cherryPickRevision(datasource, repoId, sha);
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      const repoState =await changeCommandMode(datasource, repoId, "compare");
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/revert",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    if (!repoId || !sha) {
      res.sendStatus(404);
      return;
    }
    try {

      const currentRepoState = await datasource?.readCurrentRepoState(repoId);
      const renderedState = await revertCommit(datasource, repoId, sha);
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      await changeCommandMode(datasource, repoId, "compare");
      const repoState = await updateComparison(
        datasource,
        repoId,
        "sha",
        null,
        currentRepoState.commit
      );
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);


app.post(
  "/repo/:repoId/sha/:sha/amend",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const message = req.body["message"] ?? "";
    if (!repoId || !sha) {
      res.sendStatus(404);
      return;
    }
    try {
      const renderedState = await amendRevision(
        datasource,
        repoId,
        sha,
        message
      );
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      const repoState = await datasource.readCurrentRepoState(repoId);
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/autofix",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    if (!repoId || !sha) {
      res.sendStatus(404);
      return;
    }
    try {
      const currentRepoState = await datasource.readCurrentRepoState(repoId);
      const renderedState = await autofixReversion(
        datasource,
        repoId,
        sha
      );
      if (!renderedState) {
        res.sendStatus(400);
        return;
      }
      await changeCommandMode(datasource, repoId, "compare");
      const repoState = await updateComparison(
        datasource,
        repoId,
        "sha",
        null,
        currentRepoState.commit
      );
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/stash",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await stashChanges(
      datasource,
      repoId
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      repoId,
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
  "/repo/:repoId/popstash",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await popStashedChanges(
      datasource,
      repoId
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      repoId,
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
  "/repo/:repoId/discard",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await discardCurrentChanges(
      datasource,
      repoId
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      repoId,
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
  "/repo/:repoId/branch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchName = req.body["branchName"] ?? "";
    const branchHead = req.body["branchHead"] ?? null;
    const baseBranchId = req.body["baseBranchId"] ?? null;
    const switchBranchOnCreate = req.body["switchBranchOnCreate"] ?? true;
    try {
      if (switchBranchOnCreate && branchHead) {
        const canSwitch = await canSwitchShasWithWIP(datasource, repoId, branchHead)
        if (!canSwitch) {
          res.sendStatus(400);
          return;
        }
      }
      const repoState = await createRepoBranch(
        datasource,
        repoId,
        branchName,
        branchHead,
        baseBranchId,
        switchBranchOnCreate
      );

      if (repoState == null) {
        res.sendStatus(400);
        return;
      }

      const renderedState = await getApplicationState(datasource, repoId);
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/branch/update",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchName = req.body["branchName"] ?? "";
    const branchHead = req.body["branchHead"] ?? null;
    const baseBranchId = req.body["baseBranchId"] ?? null;
    try {
      const repoState = await updateLocalBranch(
        datasource,
        repoId,
        branchName,
        branchHead,
        baseBranchId
      );

      if (repoState == null) {
        res.sendStatus(400);
        return;
      }

      const renderedState = await getApplicationState(datasource, repoId);
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/branch/switch",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchId = req.body["branchId"] ?? "";
    const branch = branchId ? await datasource.readBranch(repoId, branchId) : null;
    try {
      const canSwitch = await canSwitchShasWithWIP(datasource, repoId, branch?.lastCommit)
      if (!canSwitch) {
        res.sendStatus(400);
        return;
      }
      const repoState = await switchRepoBranch(
        datasource,
        repoId,
        branch?.id
      );

      if (repoState == null) {
        res.sendStatus(400);
        return;
      }

      const renderedState = await getApplicationState(datasource, repoId);
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/branch/:branchId/delete",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchId = req.body["branchId"] ?? "";
    const branch = branchId ? await datasource.readBranch(repoId, branchId) : null;
    try {
      if (!branch) {
        res.sendStatus(400);
        return;
      }
      const repoState = await deleteLocalBranch(
        datasource,
        repoId,
        branch?.id
      );

      if (repoState == null) {
        res.sendStatus(400);
        return;
      }

      const renderedState = await getApplicationState(datasource, repoId);
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
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
  "/repo/:repoId/checkout/commit/:sha",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    const commit = sha ? await datasource.readCommit(repoId, sha) : null;
    try {
      if (!commit) {
        res.sendStatus(400);
        return;
      }
      const repoState = await updateCurrentWithSHA(
        datasource,
        repoId,
        sha,
        false
      );

      if (repoState == null) {
        res.sendStatus(400);
        return;
      }

      const renderedState = await getApplicationState(datasource, repoId);
      const applicationState = await convertRenderedCommitStateToKv(
        datasource,
        renderedState
      );
      const apiResponse = await renderApiReponse(
        repoId,
        datasource,
        renderedState,
        applicationState,
        repoState
      );

      const sourceGraphResponse = await renderSourceGraphInputs(repoId, datasource);
      res.send({
        apiResponse,
        sourceGraphResponse
      });
    } catch(e) {
      res.sendStatus(400);
      return null;
    }
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
      repoId,
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
      repoId,
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
      },
      true
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
        },
        true
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
  "/repo/:repoId/developmentplugins",
  cors(corsOptionsDelegate),
  async (req, res) => {
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

    const repoPluginNames = req?.body?.["pluginNames"] ?? [];
    if (repoPluginNames.length == 0) {
      res.send({});
      return;
    }

    const currentManifests = await getPluginManifests(
      datasource,
      renderedState.plugins
    );
    const currentSchemaMap = manifestListToSchemaMap(currentManifests);

    const repoPluginSet = new Set(repoPluginNames);

    const developmentPlugins = await readDevPlugins();
    const availableDevPlugins = developmentPlugins.filter((d) =>
      repoPluginSet.has(d)
    );
    let out = {};
    for (const availablePluginName of availableDevPlugins) {
      const availableDevVersions = await readDevPluginVersions(
        availablePluginName
      );
      if (availableDevPlugins.length > 0) {
        out[availablePluginName] = {};
      }
      for (let pluginVersion of availableDevVersions) {
        const devManifest = await readDevPluginManifest(
          availablePluginName,
          `dev@${pluginVersion}`
        );
        devManifest.version = `dev@${pluginVersion}`;
        const depFetch = await getDependenciesForManifest(datasource, devManifest);
        if (depFetch.status == "error") {
          continue;
        }
        const proposedSchemaMap =  manifestListToSchemaMap([devManifest, ...depFetch.deps]);

        const isCompatible = await pluginManifestIsSubsetOfManifest(
          datasource,
          currentSchemaMap,
          {
            ...currentSchemaMap,
            ...proposedSchemaMap
          },
        );

        out[availablePluginName][devManifest.version] = {
          manifest: devManifest,
          isCompatible
        };
      }
    }
    const pluginsJSON = await getPluginsJsonAsync();
    for (let pluginName in pluginsJSON ? pluginsJSON?.plugins ?? {} : {}) {
      if (!repoPluginSet.has(pluginName)) {
        continue;
      }

      const devManifest = await readDevPluginManifest(pluginName, "dev");
      if (devManifest) {
        devManifest.version = "dev";
        if (!out[pluginName]) {
          out[pluginName] = {};
        }

        const depFetch = await getDependenciesForManifest(datasource, devManifest, true);
        if (depFetch.status == "error") {
          continue;
        }
        const proposedSchemaMap =  manifestListToSchemaMap([devManifest, ...depFetch.deps]);

        const isCompatible = await pluginManifestIsSubsetOfManifest(
          datasource,
          currentSchemaMap,
          {
            ...currentSchemaMap,
            ...proposedSchemaMap
          },
          true
        );
        out[pluginName]["dev"] = {
          manifest: devManifest,
          isCompatible
        };
      }
    }
    res.send(out)
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
        },
        true
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
      const upstreamDeps = await getUpstreamDependencyManifests(datasource, manifest, true);
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

    const manifest = await datasource.getPluginManifest(pluginName, pluginVersion, true);
    const upstreamDeps = await getUpstreamDependencyManifests(datasource, manifest, true);
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
      repoId,
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
  "/repo/:repoId/plugin/:pluginName/state",
  cors(corsOptionsDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const pluginName = req.params["pluginName"];
    const state = req.body["state"];
    const pluginNameToUpdate = req.body["pluginName"];
    if (!pluginName || !state || !pluginNameToUpdate) {
      res.sendStatus(400);
      return;
    }
    const currentRenderedState = await datasource.readRenderedState(repoId);
    const pluginElement = currentRenderedState?.plugins?.find(v => v.key == pluginName);
    if (!pluginElement) {
      res.sendStatus(400);
      return;
    }
    const manifest = await datasource.getPluginManifest(
      pluginElement.key,
      pluginElement.value,
      true
    );
    if (!manifest) {
      res.sendStatus(400);
      return;
    }
    if (pluginName != pluginNameToUpdate && !manifest.imports[pluginNameToUpdate]) {
      res.sendStatus(400);
      return;
    }
    const renderedState = await updatePluginState(
      datasource,
      repoId,
      pluginNameToUpdate,
      state
    );
    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, renderedState),
    ]);
    const apiResponse = await renderApiReponse(
      repoId,
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

app.post("/binary/upload", async (req, res) => {
  try {
    // fix this
    res.header("Access-Control-Allow-Origin", "*");

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
              if (isBinaryFile(fileData)) {
                await fs.promises.writeFile(fullPath, fileData);
              } else {
                await fs.promises.writeFile(fullPath, fileData.toString(), 'utf8');
              }
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
  } catch(e) {
        res.sendStatus(400);
  }
});

app.get("/binary/:binaryRef", async (req, res) => {

  res.header("Access-Control-Allow-Origin", "*");
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
  const mimeType = mime.contentType(path.extname(fullPath));
  res.setHeader('Content-Type', mimeType);
  const readStream = fs.createReadStream(fullPath);
  readStream.on('data', data => res.send(data));
  readStream.on('close', () => res.end());
});

app.get("/plugins/:pluginName/dev@*",
  cors(corsOptionsDelegate),
async (req, res) => {
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
  if (isBinaryFile(file)) {
    res.send(file);
    return;
  }
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
      logLevel: "silent"
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