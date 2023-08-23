import express from "express";
import path from "path";
import fs from "fs";
import http from "http";
import cors from "cors";
import mime from "mime-types";
import { isBinaryFile } from "arraybuffer-isbinary";
import {
  existsAsync,
  getRemoteHostSync,
  getPluginsJson,
  writeUserSession,
  writeUser,
  removeUserSession,
  removeUser,
  vDEVPath,
  vBinariesPath,
  vPluginsPath,
  getPluginsJsonAsync,
  getUserAsync,
  getUserSessionAsync,
  getRemoteHostAsync,
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
import { createHmac } from "crypto";
import { cloneRepo, getCommitState, uniqueKVList, getUnstagedCommitState, getLastCommitFromRepoState, readComparisonState, FetchInfo, getRepoInfo, uniqueStrings } from "./repo";
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
  getFetchInfo,
  push,
  pull,
  getRepoCloneState,
  checkIsBranchProtected,
  getCanRevert,
  getIsMerged,
  sanitizeApplicationKV,
  readCurrentState
} from "./repoapi";
import {
  makeMemoizedDataSource,
  readDevPluginManifest,
  readDevPlugins,
  readDevPluginVersions,
} from "./datasource";
import busboy from "connect-busboy";
import { DiffElement, hashBinary } from "./sequenceoperations";
import { LicenseCodesList } from "./licensecodes";
import {
  getDependenciesForManifest,
  manifestListToSchemaMap,
  getPluginManifests,
  pluginManifestIsSubsetOfManifest,
  getDownstreamDepsInSchemaMap,
  getUpstreamDependencyManifests,
  PluginElement,
  CopyInstructions,
  copyState,
  Manifest,
  collectFileRefs,
  enforceBoundedSets,
  cascadePluginState,
  nullifyMissingFileRefs
} from "./plugins";

import binarySession from "./binary_session";
import { Session } from "inspector";
import axios from "axios";
import {
  addApiKey,
  addWebhookKey,
  updateWebhookKey,
  getApiKeys,
  getWebhookKeys,
  removeApiKey,
  removeWebhookKey,
  updateApiKeySecret,
  updateWebhookKeySecret,
  addRepoEnabledApiKey,
  removeRepoEnabledApiKey,
  addRepoEnabledWebhookKey,
  updateRepoEnabledWebhookKey,
  removeRepoEnabledWebhookKey,
  getWebhookUrl,
  getWebhookKey,
  getWebhookSecret,
} from "./apikeys";

const remoteHost = getRemoteHostSync();

const app = express();
const server = http.createServer(app);
const datasource = makeMemoizedDataSource();

const pluginsJSON = getPluginsJson();

const safeOriginRegex =
  /^(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro\.io)/;

const corsNoNullOriginDelegate = (req, callback) => {
  const origin = req.headers?.origin;
  if (
    origin != 'null' && (
      safeOriginRegex.test(req.connection.remoteAddress) ||
      req.connection.remoteAddress == "127.0.0.1"
    )
  ) {
    callback(null, {
      origin: true,
    });
  } else {
    callback("Invalid origin", {
      origin: false,
    });
  }
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

app.use(express.json({ limit: "20mb" }));

app.use(function (_req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get(
  "/ping",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    res.send("PONG");
  }
);

app.get(
  "/session",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    const session = await getUserSessionAsync();
    res.send(session);
  }
);

app.post(
  "/session",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const session = await getUserSessionAsync();
    const postedSession: { clientKey: string}|null = req.body.session;
    const postedUser: any|null = req.body.user;
    if (postedSession?.clientKey) {
      if (!session || session?.clientKey != postedSession?.clientKey) {
        await writeUserSession(postedSession);
        await writeUser(postedUser);
        res.send({
          status: "ok"
        })
        return;
      } else {
        if (session && session?.clientKey == postedSession?.clientKey) {
          res.send({
            status: "ok"
          })
          return;
        }
      }
    }
    res.sendStatus(400);
    return;
  }
);

app.get("/api_keys",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    const apiKeys = await getApiKeys(datasource);
    res.send({
      apiKeys,
    });
  }
);

app.post("/api_keys",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const name =  req.body["name"] as string;
    const apiKey = await addApiKey(datasource, { name });
    if (!apiKey) {
      res.sendStatus(400);
      return;
    }
    const apiKeys = await getApiKeys(datasource);
    res.send({
      apiKeys,
    });
  }
);

app.post("/api_keys/:id/regenerate",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const id = req.params["id"];
    const apiKey = await updateApiKeySecret(datasource, id);
    if (!apiKey) {
      res.sendStatus(400);
      return;
    }
    const apiKeys = await getApiKeys(datasource);
    res.send({
      apiKeys,
    });
  }
);

app.post("/api_keys/:id/delete",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const id = req.params["id"];
    const result = await removeApiKey(datasource, id);
    if (!result) {
      res.sendStatus(400);
      return;
    }
    const apiKeys = await getApiKeys(datasource);
    res.send({
      apiKeys,
    });
  }
);

app.get("/webhook_keys",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    const webhookKeys = await getWebhookKeys(datasource);
    res.send({
      webhookKeys,
    });
  }
);

app.post("/webhook_keys",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const domain =  req.body["domain"] as string;
    const defaultPort =  req.body["defaultPort"] as number;
    const defaultSubdomain =  req.body["defaultSubdomain"] as string;
    const defaultProtocol =  req.body["defaultProtocol"] as "http"|"https";
    const webhookKey = await addWebhookKey(datasource, {
      domain,
      defaultPort,
      defaultProtocol,
      defaultSubdomain,
    });
    if (!webhookKey) {
      res.sendStatus(400);
      return;
    }
    const webhookKeys = await getWebhookKeys(datasource);
    res.send({
      webhookKeys,
    });
  }
);

app.post("/webhook_keys/:id/regenerate",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const id = req.params["id"];
    const webhookKey = await updateWebhookKeySecret(datasource, id);
    if (!webhookKey) {
      res.sendStatus(400);
      return;
    }
    const webhookKeys = await getWebhookKeys(datasource);
    res.send({
      webhookKeys,
    });
  }
);


app.post("/webhook_keys/:id/update",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const id = req.params["id"];
    const defaultPort =  req.body["defaultPort"] as number;
    const defaultSubdomain =  req.body["defaultSubdomain"] as string;
    const defaultProtocol =  req.body["defaultProtocol"] as "http"|"https";
    const webhookKey = await updateWebhookKey(datasource, id, {
      defaultPort,
      defaultProtocol,
      defaultSubdomain,
    });
    if (!webhookKey) {
      res.sendStatus(400);
      return;
    }
    const webhookKeys = await getWebhookKeys(datasource);
    res.send({
      webhookKeys,
    });
  }
);

app.post("/webhook_keys/:id/delete",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const id = req.params["id"];
    const result = await removeWebhookKey(datasource, id);
    if (!result) {
      res.sendStatus(400);
      return;
    }
    const webhookKeys = await getWebhookKeys(datasource);
    res.send({
      webhookKeys,
    });
  }
);

app.get(
  "/repo/:repoId/enabled_api_keys",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const enabledApiKeys = await datasource.readRepoEnabledApiKeys(repoId);
    res.send({
      enabledApiKeys
    })
  }
);

app.post(
  "/repo/:repoId/enabled_api_keys/create",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const apiKeyId = (req.body["apiKeyId"] as string) ?? null;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    if (!apiKeyId) {
      res.sendStatus(400);
      return;
    }
    const enabledApiKeys = await addRepoEnabledApiKey(datasource, repoId, apiKeyId);
    res.send({
      enabledApiKeys
    })
  }
);


app.post(
  "/repo/:repoId/enabled_api_keys/delete",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const apiKeyId = (req.body["apiKeyId"] as string) ?? null;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    if (!apiKeyId) {
      res.sendStatus(400);
      return;
    }
    const enabledApiKeys = await removeRepoEnabledApiKey(datasource, repoId, apiKeyId);
    res.send({
      enabledApiKeys
    })
  }
);


app.get(
  "/repo/:repoId/enabled_webhook_keys",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(repoId);
    res.send({
      enabledWebhookKeys
    })
  }
);

app.post(
  "/repo/:repoId/enabled_webhook_keys/create",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const webhookKeyId = (req.body["webhookKeyId"] as string) ?? null;
    const port = (req.body["port"] as number) ?? null;
    const protocol = (req.body["protocol"] as "http"|"https") ?? null;
    const subdomain = (req.body["subdomain"] as string) ?? null;
    const uri = (req.body["uri"] as string) ?? null;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    if (!webhookKeyId) {
      res.sendStatus(400);
      return;
    }
    const enabledWebhookKeys = await addRepoEnabledWebhookKey(datasource, repoId, {
      webhookKeyId,
      port,
      protocol,
      subdomain,
      uri
    });
    res.send({
      enabledWebhookKeys
    })
  }
);

app.post(
  "/repo/:repoId/enabled_webhook_keys/:id/update",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const id = req.params["id"] as string;
    const webhookKeyId = (req.body["webhookKeyId"] as string) ?? null;
    const port = (req.body["port"] as number) ?? null;
    const protocol = (req.body["protocol"] as "http"|"https") ?? null;
    const subdomain = (req.body["subdomain"] as string) ?? null;
    const uri = (req.body["uri"] as string) ?? null;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    if (!webhookKeyId) {
      res.sendStatus(400);
      return;
    }
    const enabledWebhookKeys = await updateRepoEnabledWebhookKey(datasource, repoId, id, {
      webhookKeyId,
      port,
      protocol,
      subdomain,
      uri
    });
    res.send({
      enabledWebhookKeys
    })
  }
);

app.post(
  "/repo/:repoId/enabled_webhook_keys/:id/delete",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const id = req.params["id"] as string;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    if (!id) {
      res.sendStatus(400);
      return;
    }
    const enabledWebhookKeys = await removeRepoEnabledWebhookKey(datasource, repoId, id);
    res.send({
      enabledWebhookKeys
    })
  }
);


app.post(
  "/repo/:repoId/enabled_webhook_keys/:id/test",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const id = req.params["id"] as string;
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const url = await getWebhookUrl(datasource, repoId, id);
    if (!url) {
      res.sendStatus(404);
      return;
    }
    const secret = await getWebhookSecret(datasource, repoId, id);
    let responseOkay = false;
    try {
      const jsonPayload = JSON.stringify(
        {
          event: "test",
          repositoryId: repoId,
          payload: {},
        },
      );
      const hmac = createHmac('sha256', secret);
      const signature = 'sha256=' + hmac.update(jsonPayload).digest('hex');
      const result = await axios({
        method: "post",
        url,
        headers: {
          'Content-Type': "application/json",
          'Floro-Signature-256': signature
        },
        data: jsonPayload,
        timeout: 5000
      })
      responseOkay = result.status >= 200 && result.status < 300;
    } catch(e) {
      responseOkay = false;
    }
    res.send({
      responseOkay
    })
  }
);

app.get(
  "/repos",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    const repos = await datasource.readRepos();
    res.send({
      repos,
    });
  }
);

app.get(
  "/repos/info",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    const repoIds = await datasource.readRepos();
    const unfilteredRepoInfos = await Promise.all(
      repoIds.filter(id => !!id).map(async (id) => {
        const cloneFile = await datasource.readCloneFile(id);
        if (cloneFile) {
          return null;
        }
        return await getRepoInfo(datasource, id);
      })
    )
    const repoInfos = unfilteredRepoInfos.filter(info => !!info);
    res.send({
      repoInfos,
    });
  }
);

app.get(
  "/licenses",
  cors(corsNoNullOriginDelegate),
  async (_req, res): Promise<void> => {
    res.send(LicenseCodesList);
  }
);

app.get(
  "/repo/:repoId/exists",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const exists = await datasource.repoExists(repoId);
    res.send({ exists });
  }
);

app.get(
  "/repo/:repoId/fetchinfo",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    try {
      const fetchInfo = await getFetchInfo(datasource, repoId);
      if (!fetchInfo) {
        res.send({
          canPull: false,
          canPushBranch: false,
          userHasPermissionToPush: false,
          branchPushDisabled: false,
          hasConflict: false,
          nothingToPush: true,
          nothingToPull: true,
          containsDevPlugins: false,
          baseBranchRequiresPush: false,
          accountInGoodStanding: true,
          pullCanMergeWip: false,
          fetchFailed: true,
          remoteAhead: false,
          hasOpenMergeRequestConflict: false,
          commits: [],
          branches: [],
        } as FetchInfo);
        return;
      }
      res.send(fetchInfo);
    } catch (e) {
      res.sendStatus(400);
    }
  }
);

app.post(
  "/repo/:repoId/push",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    try {
      const pushResponse = await push(datasource, repoId);
      if (!pushResponse) {
        res.sendStatus(400);
        return;
      }
      const fetchInfo = await getFetchInfo(datasource, repoId);
      if (!fetchInfo) {
        res.sendStatus(400);
        return;
      }
      res.send(fetchInfo);
    } catch (e) {
      res.sendStatus(400);
    }
  }
)
app.post(
  "/repo/:repoId/pull",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const exists = await datasource.repoExists(repoId);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    try {
      const pullResponse = await pull(datasource, repoId);
      if (!pullResponse) {
        res.sendStatus(400);
        return;
      }
      const fetchInfo = await getFetchInfo(datasource, repoId);

      if (!fetchInfo) {
        res.sendStatus(400);
        return;
      }

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
      res.send({
        fetchInfo,
        apiResponse
      });
    } catch (e) {
      res.sendStatus(400);
    }
  }
)

app.get(
  "/repo/:repoId/current",
  cors(corsNoNullOriginDelegate),
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
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    try {
      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      if (!sourceGraphResponse) {
        res.sendStatus(404);
        return;
      }
      res.send(sourceGraphResponse);
    } catch (e) {
      res.sendStatus(400);
    }
  }
);

app.post(
  "/repo/:repoId/command",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const repoState = await changeCommandMode(
      datasource,
      repoId,
      req.body.commandMode
    );
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
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const against = req.body["against"] as "wip" | "branch" | "sha";
    const branch = (req.body["branch"] as string) ?? null;
    const sha = (req.body["sha"] as string) ?? null;
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
  cors(corsNoNullOriginDelegate),
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

    const commitData = await writeRepoCommit(datasource, repoId, message);
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
  cors(corsNoNullOriginDelegate),
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
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const canSwitch = await canSwitchShasWithWIP(datasource, repoId, sha);
      if (canSwitch == null) {
        res.sendStatus(400);
        return;
      }
      res.send({ canSwitch });
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canautomerge",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const fromSha = req.params["sha"];

    const repoState = await datasource.readCurrentRepoState(repoId);
    if (!repoState) {
      res.sendStatus(400);
      return;
    }
    try {
      const lastCommit = await getLastCommitFromRepoState(repoId, datasource, repoState);
      const [canAutoMergeOnTopOfCurrentState, canAutoMergeOnUnStagedState, isMerged] =
        await Promise.all([
          getCanAutoMergeOnTopCurrentState(datasource, repoId, fromSha),
          getCanAutoMergeOnUnStagedState(datasource, repoId, fromSha),
          getIsMerged(datasource, repoId, lastCommit?.sha, fromSha)
        ]);
      if (
        canAutoMergeOnTopOfCurrentState == null ||
        canAutoMergeOnUnStagedState == null ||
        isMerged == null
      ) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canAutoMergeOnTopOfCurrentState,
        canAutoMergeOnUnStagedState,
        isMerged
      });
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/cancherrypick",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const canCherryPick = await getCanCherryPickRevision(
        datasource,
        repoId,
        sha
      );
      if (canCherryPick == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canCherryPick,
      });
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canamend",
  cors(corsNoNullOriginDelegate),
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
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canrevert",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const user = await getUserAsync();
      const canRevert = await getCanRevert(datasource, repoId, sha, user);
      if (canRevert == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canRevert,
      });
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.get(
  "/repo/:repoId/sha/:sha/canautofix",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const sha = req.params["sha"];
    try {
      const user = await getUserAsync();
      const canAutoFix = await getCanAutofixReversion(datasource, repoId, sha, user);
      if (canAutoFix == null) {
        res.sendStatus(400);
        return;
      }
      res.send({
        canAutoFix,
      });
    } catch (e) {
      res.sendStatus(400);
      return;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/merge",
  cors(corsNoNullOriginDelegate),
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/merge/abort",
  cors(corsNoNullOriginDelegate),
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
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/merge/resolve",
  cors(corsNoNullOriginDelegate),
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
      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/merge/direction/:direction",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const direction = req.params["direction"];
    if (
      !repoId ||
      !direction ||
      (direction != "yours" && direction != "theirs")
    ) {
      res.sendStatus(404);
      return;
    }
    try {
      const initRepoState = await datasource.readCurrentRepoState(repoId);
      if (
        !initRepoState.isInMergeConflict ||
        initRepoState.merge.direction == direction
      ) {
        return null;
      }
      const renderedState = await updateMergeDirection(
        datasource,
        repoId,
        direction
      );
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
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/cherrypick",
  cors(corsNoNullOriginDelegate),
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
      const repoState = await changeCommandMode(datasource, repoId, "compare");
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/revert",
  cors(corsNoNullOriginDelegate),
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/amend",
  cors(corsNoNullOriginDelegate),
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/sha/:sha/autofix",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    if (!repoId || !sha) {
      res.sendStatus(404);
      return;
    }
    try {
      const currentRepoState = await datasource.readCurrentRepoState(repoId);
      const renderedState = await autofixReversion(datasource, repoId, sha);
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/stash",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await stashChanges(datasource, repoId);
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
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await popStashedChanges(datasource, repoId);
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
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const renderedState = await discardCurrentChanges(datasource, repoId);
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
  cors(corsNoNullOriginDelegate),
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
        const canSwitch = await canSwitchShasWithWIP(
          datasource,
          repoId,
          branchHead
        );
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/branch/update",
  cors(corsNoNullOriginDelegate),
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.post(
  "/repo/:repoId/branch/switch",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchId = req.body["branchId"] ?? "";
    const branch = branchId
      ? await datasource.readBranch(repoId, branchId)
      : null;
    try {
      const canSwitch = await canSwitchShasWithWIP(
        datasource,
        repoId,
        branch?.lastCommit
      );
      if (!canSwitch) {
        res.sendStatus(400);
        return;
      }
      const repoState = await switchRepoBranch(datasource, repoId, branch?.id);

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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.get(
  "/repo/:repoId/branch/:branchId/is_protected",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchId = req.params["branchId"] ?? "";
    if (!branchId) {
      res.sendStatus(404);
      return;
    }

    const isProtected = await checkIsBranchProtected(
      datasource,
      repoId,
      branchId
    );
    res.send({
      isProtected
    });
  }
);


app.post(
  "/repo/:repoId/branch/:branchId/delete",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return;
    }
    const branchId = req.body["branchId"] ?? "";
    const branch = branchId
      ? await datasource.readBranch(repoId, branchId)
      : null;
    try {
      if (!branch) {
        res.sendStatus(400);
        return;
      }
      const repoState = await deleteLocalBranch(datasource, repoId, branch?.id);

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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.get(
  "/repo/:repoId/settings",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    const settings = await datasource.readRemoteSettings(repoId);
    if (!settings) {
      res.sendStatus(400);
      return;
    }
    res.send(settings);
  }
);

app.post(
  "/repo/:repoId/checkout/commit/:sha",
  cors(corsNoNullOriginDelegate),
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

      const sourceGraphResponse = await renderSourceGraphInputs(
        repoId,
        datasource
      );
      res.send({
        apiResponse,
        sourceGraphResponse,
      });
    } catch (e) {
      res.sendStatus(400);
      return null;
    }
  }
);

app.get(
  "/repo/:repoId/branches",
  cors(corsNoNullOriginDelegate),
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
  cors(corsNoNullOriginDelegate),
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
  cors(corsNoNullOriginDelegate),
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
  cors(corsNoNullOriginDelegate),
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
    const depFetch = await getDependenciesForManifest(
      datasource,
      manifest,
      true
    );
    if (depFetch.status == "error") {
      return null;
    }
    const fetchedDeps = depFetch.deps.filter((depManifest) => {
      return manifest.imports[depManifest.name] == depManifest.version;
    });
    const proposedSchemaMap = manifestListToSchemaMap([
      manifest,
      ...depFetch.deps,
    ]);
    const currentManifests = await getPluginManifests(
      datasource,
      renderedState.plugins,
      true
    );
    const currentSchemaMap = manifestListToSchemaMap(currentManifests);
    const isCompatible = await pluginManifestIsSubsetOfManifest(
      datasource,
      currentSchemaMap,
      {
        ...currentSchemaMap,
        ...proposedSchemaMap,
      },
      true
    );
    if (isCompatible) {
      const dependencies = fetchedDeps.map((manifest) => {
        return {
          pluginName: manifest.name,
          pluginVersion: manifest.version,
          isCompatible: true,
        };
      });
      res.send({
        pluginName,
        pluginVersion,
        isCompatible,
        dependencies,
      });
      return;
    }
    const dependencies = [];
    for (const depManifest of fetchedDeps) {
      const depFetch = await getDependenciesForManifest(
        datasource,
        depManifest,
        true
      );
      const proposedSchemaMap = manifestListToSchemaMap([
        depManifest,
        ...depFetch.deps,
      ]);
      const isCompatible = await pluginManifestIsSubsetOfManifest(
        datasource,
        currentSchemaMap,
        {
          ...currentSchemaMap,
          ...proposedSchemaMap,
        },
        true
      );
      dependencies.push({
        pluginName: depManifest.name,
        pluginVersion: depManifest.version,
        isCompatible,
      });
    }
    res.send({
      pluginName,
      pluginVersion,
      isCompatible,
      dependencies,
    });
  }
);

app.get(
  "/repo/:repoId/plugin/:pluginName/:version/canuninstall",
  cors(corsNoNullOriginDelegate),
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
    const downstreamDeps = getDownstreamDepsInSchemaMap(
      currentSchemaMap,
      pluginName
    );
    res.send({
      canUninstall: downstreamDeps.length == 0,
      downstreamDeps,
      manifestList: currentManifests,
    });
  }
);

app.post(
  "/repo/:repoId/developmentplugins",
  cors(corsNoNullOriginDelegate),
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
        const depFetch = await getDependenciesForManifest(
          datasource,
          devManifest
        );
        if (depFetch.status == "error") {
          continue;
        }
        const proposedSchemaMap = manifestListToSchemaMap([
          devManifest,
          ...depFetch.deps,
        ]);

        const isCompatible = await pluginManifestIsSubsetOfManifest(
          datasource,
          currentSchemaMap,
          {
            ...currentSchemaMap,
            ...proposedSchemaMap,
          }
        );

        out[availablePluginName][devManifest.version] = {
          manifest: devManifest,
          isCompatible,
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

        const depFetch = await getDependenciesForManifest(
          datasource,
          devManifest,
          true
        );
        if (depFetch.status == "error") {
          continue;
        }
        const proposedSchemaMap = manifestListToSchemaMap([
          devManifest,
          ...depFetch.deps,
        ]);

        const isCompatible = await pluginManifestIsSubsetOfManifest(
          datasource,
          currentSchemaMap,
          {
            ...currentSchemaMap,
            ...proposedSchemaMap,
          },
          true
        );
        out[pluginName]["dev"] = {
          manifest: devManifest,
          isCompatible,
        };
      }
    }
    res.send(out);
  }
);

app.post(
  "/repo/:repoId/plugin/:pluginName/canupdate",
  cors(corsNoNullOriginDelegate),
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
      const manifest = await datasource.getPluginManifest(
        pluginName,
        version,
        true
      );
      if (!manifest) {
        continue;
      }

      const depFetch = await getDependenciesForManifest(
        datasource,
        manifest,
        true
      );
      if (depFetch.status == "error") {
        continue;
      }

      const proposedSchemaMap = manifestListToSchemaMap([
        manifest,
        ...depFetch.deps,
      ]);
      const isCompatible = await pluginManifestIsSubsetOfManifest(
        datasource,
        currentSchemaMap,
        {
          ...currentSchemaMap,
          ...proposedSchemaMap,
        },
        true
      );
      if (isCompatible) {
        res.send({
          canUpdate: true,
        });
        return;
      }
    }
    res.send({
      canUpdate: false,
    });
  }
);

app.get(
  "/repo/:repoId/manifestlist",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(404);
      return null;
    }

    const currentRepoState = await datasource.readCurrentRepoState(repoId);
    const renderedState = await datasource.readRenderedState(repoId);
    if (!renderedState) {
      res.sendStatus(400);
      return null;
    }

    let pluginList = renderedState.plugins;
    const repoState = await datasource.readCurrentRepoState(repoId);
    if (currentRepoState?.commandMode == "compare") {
      const comparisonState = await readComparisonState(repoId, datasource, currentRepoState);
      pluginList = uniqueKVList([...pluginList, ...comparisonState.plugins]);
    }
    if (repoState?.commandMode == "compare") {

      if (repoState.comparison?.against == "branch") {
        const comparatorBranch = repoState?.comparison?.branch
          ? await datasource.readBranch(repoId, repoState?.comparison?.branch)
          : null;
        const branchState = await getCommitState(
          datasource,
          repoId,
          comparatorBranch?.lastCommit
        );
        pluginList = uniqueKVList([...pluginList, ...branchState.plugins]);
      }
      if (repoState.comparison?.against == "sha") {
        const commitState = await getCommitState(
          datasource,
          repoId,
          repoState.comparison?.commit
        );
        pluginList = uniqueKVList([...pluginList, ...commitState.plugins]);
      }
      if (repoState.comparison?.against == "wip") {
          const unstagedState = await getUnstagedCommitState(datasource, repoId);
          pluginList = uniqueKVList([...pluginList, ...unstagedState.plugins]);
      }
    }

    const currentManifests = await getPluginManifests(
      datasource,
      pluginList
    );
    for (let manifest of currentManifests) {
      const upstreamDeps = await getUpstreamDependencyManifests(
        datasource,
        manifest,
        true
      );
      for (const upstreamDep of upstreamDeps) {
        const seen = !!currentManifests?.find(
          (m) => m.name == upstreamDep.name && m.version == upstreamDep.version
        );
        if (!seen) {
          currentManifests.push(upstreamDep);
        }
      }
    }
    res.send(currentManifests);
  }
);

app.get(
  "/repo/:repoId/plugin/:pluginName/:version/manifestlist",
  cors(corsNoNullOriginDelegate),
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

    const manifest = await datasource.getPluginManifest(
      pluginName,
      pluginVersion,
      true
    );
    const upstreamDeps = await getUpstreamDependencyManifests(
      datasource,
      manifest,
      true
    );
    const manifestList = currentManifests;
    for (const upstreamDep of upstreamDeps) {
      const seen = !!manifestList?.find(
        (m) => m.name == upstreamDep.name && m.version == upstreamDep.version
      );
      if (!seen) {
        manifestList.push(upstreamDep);
      }
    }
    res.send(manifestList);
  }
);

app.post(
  "/repo/:repoId/plugins",
  cors(corsNoNullOriginDelegate),
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

app.post("/repo/:repoId/paste", cors(corsNoNullOriginDelegate),async (req, res): Promise<void> => {
  try {
    const repoId = req.params["repoId"] as string;
    const fromRepoId = req.body["fromRepoId"] as string;
    const fromStateMap = req.body["fromStateMap"] as {[pluginName: string]: object};
    const fromSchemaMap = req.body["fromSchemaMap"] as {[pluginName: string]: Manifest};
    const fromPluginsToAdd = req.body["pluginsToAdd"] as Array<PluginElement>;
    const copyInstructions = req.body["copyInstructions"] as CopyInstructions;
    let pluginKeys = new Set<string>([]);
    for ( const {key, value} of fromPluginsToAdd) {
      await datasource.getPluginManifest(key, value, false);
      pluginKeys.add(key);
    }
    const currentRenderedState = await datasource.readRenderedState(repoId);
    if (!currentRenderedState?.plugins) {
      res.sendStatus(400);
      return;
    }
    const nextPlugins = [
      ...currentRenderedState?.plugins.filter((p) => !pluginKeys.has(p.key)),
      ...fromPluginsToAdd,
    ];
    const intoState = await updatePlugins(
      datasource,
      repoId,
      nextPlugins
    );
    for (const pluginToAdd of fromPluginsToAdd) {
      if (!copyInstructions?.[pluginToAdd.key].isManualCopy) {
        intoState.store[pluginToAdd.key] = fromStateMap[pluginToAdd.key];
      }
    }
    const intoManifestList = await getPluginManifests(datasource, nextPlugins, false);
    const intoSchemaMap = manifestListToSchemaMap(intoManifestList)
    const copiedOverRenderedStore = await copyState(
      datasource,
      fromSchemaMap,
      fromStateMap,
      intoSchemaMap,
      intoState.store,
      copyInstructions
    );
    const binaryRefs = await collectFileRefs(datasource, intoSchemaMap, copiedOverRenderedStore);
    const binariesToAdd: Array<string> = [];
    for (const binRef of binaryRefs) {
        const existsAlready = await datasource.checkBinary(
          binRef
        );
        if (!existsAlready && !binariesToAdd.includes(binRef)) {
          binariesToAdd.push(binRef)
        }
    }

    const remote = await getRemoteHostAsync();
    const session = await getUserSessionAsync();
    const binaryLinksRequest = await axios({
      method: "post",
      url: `${remote}/api/repo/${fromRepoId}/binary/links`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
      data: {
        links: binaryRefs,
      },
    });
    if (!binaryLinksRequest.data) {
      res.sendStatus(400);
      return;
    }

    const binDownwloads: Promise<boolean>[] = [];
    const binaryLinks: Array<{ fileName: string; link: string }> =
      binaryLinksRequest.data;
    for (const binaryLink of binaryLinks) {
      binDownwloads.push(
        new Promise(async () => {
          try {
            const existsAlready = await datasource.checkBinary(
              binaryLink.fileName
            );
            if (existsAlready) {
              return true;
            }
            const content = await axios({
              method: "get",
              url: binaryLink.link,
            });
            if (!content?.data) {
              return false;
            }
            await datasource.writeBinary(binaryLink.fileName, content as any);
            return true;
          } catch (e) {
            return false;
          }
        })
      );
    }
    const binResults = await Promise.all(binDownwloads);
    for (let didDownload of binResults) {
      if (!didDownload) {
        res.sendStatus(400);
        return;
      }
    }

    await enforceBoundedSets(datasource, intoSchemaMap, copiedOverRenderedStore);
    let store = await cascadePluginState(datasource, intoSchemaMap, copiedOverRenderedStore);
    store = await nullifyMissingFileRefs(datasource, intoSchemaMap, store);
    const binaries = uniqueStrings(await collectFileRefs(datasource, intoSchemaMap, store));

    intoState.store = store;
    intoState.binaries = binaries;

    const sanitiziedRenderedState = await sanitizeApplicationKV(
      datasource,
      intoState
    );
    await datasource.saveRenderedState(repoId, sanitiziedRenderedState);

    const [repoState, applicationState] = await Promise.all([
      datasource.readCurrentRepoState(repoId),
      convertRenderedCommitStateToKv(datasource, sanitiziedRenderedState),
    ]);
    const apiResponse = await renderApiReponse(
      repoId,
      datasource,
      sanitiziedRenderedState,
      applicationState,
      repoState
    );
    if (!apiResponse) {
      res.sendStatus(404);
      return;
    }
    res.send(apiResponse);
  } catch(e) {
    console.log("E", e)
      res.sendStatus(400);
  }
})

app.post(
  "/repo/:repoId/plugin/:pluginName/state",
  cors(corsNoNullOriginDelegate),
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
    const pluginElement = currentRenderedState?.plugins?.find(
      (v) => v.key == pluginName
    );
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
    if (
      pluginName != pluginNameToUpdate &&
      !manifest.imports[pluginNameToUpdate]
    ) {
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

app.post(
  "/repo/:repoId/plugin/:pluginName/storage",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    try {
      const repoId = req.params["repoId"];
      const pluginName = req.params["pluginName"];
      const storage = req.body["storage"];
      await datasource.savePluginClientStorage(repoId, pluginName, storage)
      const renderedState = await readCurrentState(
        datasource,
        repoId,
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
    } catch(e) {
      res.sendStatus(400);
    }
  }
);

app.post(
  "/repo/:repoId/plugin/:pluginName/storage/clear",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    try {
      const repoId = req.params["repoId"];
      const pluginName = req.params["pluginName"];
      await datasource.clearPluginClientStorage(repoId, pluginName);
      const renderedState = await readCurrentState(
        datasource,
        repoId,
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
    } catch(e) {
      res.sendStatus(400);
    }
  }
);


app.get(
  "/repo/:repoId/clone/state",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.sendStatus(400);
    }
    const state = await getRepoCloneState(datasource, repoId)
    res.send(state);
  }
);

app.get(
  "/repo/:repoId/clone",
  cors(corsNoNullOriginDelegate),
  async (req, res): Promise<void> => {
    const repoId = req.params["repoId"];
    if (!repoId) {
      res.send({ status: "failed" });
    }
    const didSucceed = await cloneRepo(datasource, repoId);
    if (didSucceed) {
      res.send({ status: "success" });
    } else {
      res.send({ status: "failed" });
    }
  }
);

app.post("/kill_oauth", cors(corsNoNullOriginDelegate), async (_req, res) => {
    broadcastToClient("desktop", "kill_oauth", null);
    res.send({ message: "ok" });
});

app.post("/login", cors(corsNoNullOriginDelegate), async (req, res) => {
  if (
    req?.body?.__typename == "PassedLoginAction" ||
    req?.body?.__typename == "AccountCreationSuccessAction"
  ) {
    await writeUserSession(req.body.session);
    await writeUser(req.body.user);
    broadcastAllDevices("login", req.body);
    broadcastToClient("desktop", "bring-to-front", null);
    broadcastAllDevices("kill_oauth", null);
    res.send({ message: "ok" });
  } else {
    res.send({ message: "error" });
  }
});

app.post("/logout", cors(corsNoNullOriginDelegate), async (req, res) => {
  try {
    await removeUserSession();
    await removeUser();
  } catch (e) {
    // dont log this
  }
  broadcastAllDevices("logout", {});
  res.send({ message: "ok" });
});

app.get("/device", cors(corsNoNullOriginDelegate), async (req, res) => {
  const mac = await macaddres.one();
  const hash = sha256(mac);
  const id = HexEncode.stringify(hash);
  res.send({ id });
});

app.post("/complete_signup", cors(corsNoNullOriginDelegate), async (req, res) => {
  if (req?.body?.__typename == "CompleteSignupAction") {
    broadcastAllDevices("complete_signup", req.body);
    broadcastToClient("desktop", "bring-to-front", null);
    broadcastAllDevices("kill_oauth", null);
    res.send({ message: "ok" });
  } else {
    res.send({ message: "error" });
  }
});

app.use(
  "/binary/upload",
  busboy({
    limits: {
      fileSize: 1024 * 1024 * 20, //20MB limit
    },
  })
);

app.post("/binary/upload", async (req, res) => {
  try {
    const token = req?.query?.token ?? ''
    if (token != binarySession.token) {
        res.sendStatus(400);
        return;
    }
    // fix this
    res.header("Access-Control-Allow-Origin", "*");

    let numFiles = 0;
    let didCancel = false;
    let fileRef = null;
    if (req.busboy) {
      req.pipe(req.busboy);
      req.busboy.on("file", (_, file, info) => {
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
        file.on("data", (data, err) => {
          if (err) {
            didCancel = true;
            res.sendStatus(400);
            return;
          }
          if (!didCancel) {
            if (fileData == null) {
              fileData = data;
            } else {
              fileData = Buffer.concat([fileData, data]);
            }
          }
        });
        file.on("end", async (err) => {
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
            const existsBinSubDir = await existsAsync(binSubDir);
            if (!existsBinSubDir) {
              fs.promises.mkdir(binSubDir, { recursive: true });
            }
            const fullPath = path.join(binSubDir, filename);
            const exists = await existsAsync(fullPath);
            if (!exists) {
              if (isBinaryFile(fileData)) {
                await fs.promises.writeFile(fullPath, fileData);
              } else {
                await fs.promises.writeFile(
                  fullPath,
                  fileData.toString(),
                  "utf8"
                );
              }
            }
            fileRef = filename;
            res.send({
              fileRef,
            });
          } catch (e) {
            didCancel = true;
            res.sendStatus(400);
            return;
          }
        });
      });
    }
  } catch (e) {
    res.sendStatus(400);
  }
});

app.get("/binary/:binaryRef", async (req, res) => {
  const token = req?.query?.token ?? ''
  if (token != binarySession.token) {
      res.sendStatus(400);
      return;
  }
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
  res.setHeader("Content-Type", mimeType);
  const readStream = fs.createReadStream(fullPath);
  readStream.on("data", (data) => res.send(data));
  readStream.on("close", () => res.end());
});

app.get(
  "/plugins/:pluginName/dev@*",
  async (req, res) => {
    const pluginName = req?.params?.["pluginName"];
    const pluginVersion = req.path.split("/")[3];
    const [, version] = pluginVersion.split("@");
    res.setHeader("Access-Control-Allow-Origin", "null");
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
    const pathRemainer = req.path.substring(basePath.length)?.split("?")[0];
    if (
      !pathRemainer ||
      pathRemainer == "/"
    ) {
      const filePath = path.join(vDEVPath, pluginName, version, "index.html");
      const exists = await existsAsync(filePath);
      if (!exists) {
        res.sendStatus(404);
        return;
      }
      const indexHtml = await fs.promises.readFile(filePath);
      res.type("html");
      res.send(indexHtml.toString().replaceAll(prodPath, basePath));
      return;
    }

    const filePath = path.join(
      vDEVPath,
      pluginName,
      version,
      ...pathRemainer.split("/")
    );
    const exists = await existsAsync(filePath);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const file = await fs.promises.readFile(filePath);
    const contentType = mime.contentType(path.extname(filePath));
    res.setHeader("content-type", contentType);
    if (isBinaryFile(file)) {
      res.send(file);
      return;
    }
    res.send(file.toString().replaceAll(prodPath, basePath));
  }
);

for (let plugin in pluginsJSON.plugins) {
  let pluginInfo = pluginsJSON.plugins[plugin];
  if (pluginInfo["proxy"]) {
    const proxy = createProxyMiddleware("/plugins/" + plugin + "/dev", {
      target: pluginInfo["host"],
      secure: true,
      ws: false,
      changeOrigin: false,
      logLevel: "silent",
    });
    app.use(proxy);
  }
}

app.get(
  "/plugins/:pluginName/:pluginVersion*",
  async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    const pluginName = req?.params?.["pluginName"];
    const pluginVersion = req?.params?.["pluginVersion"];

    if (!pluginVersion) {
      res.sendStatus(404);
      return;
    }
    const manifest = await datasource.getPluginManifest(
      pluginName,
      pluginVersion
    );
    if (!manifest) {
      res.sendStatus(404);
      return;
    }
    const basePath = `/plugins/${pluginName}/${pluginVersion}`;
    const pathRemainer = req.path.substring(basePath.length)?.split("?")[0];
    if (
      !pathRemainer ||
      pathRemainer == "/" ||
      pathRemainer == "/write" ||
      pathRemainer == "/write/"
    ) {
      const filePath = path.join(
        vPluginsPath,
        pluginName,
        pluginVersion,
        "index.html"
      );
      const exists = await existsAsync(filePath);
      if (!exists) {
        res.sendStatus(404);
        return;
      }
      const indexHtml = await fs.promises.readFile(filePath);
      res.type("html");
      res.send(indexHtml.toString().replaceAll(basePath, basePath));
      return;
    }

    const filePath = path.join(
      vPluginsPath,
      pluginName,
      pluginVersion,
      ...pathRemainer.split("/")
    );
    const exists = await existsAsync(filePath);
    if (!exists) {
      res.sendStatus(404);
      return;
    }
    const file = await fs.promises.readFile(filePath);
    const contentType = mime.contentType(path.extname(filePath));
    res.setHeader("content-type", contentType);
    if (isBinaryFile(file)) {
      res.send(file);
      return;
    }
    res.send(file.toString());
  }
);

server.listen(port, host, () =>
  console.log("floro server started on " + host + ":" + port)
);
startSessionJob();

export default server;
