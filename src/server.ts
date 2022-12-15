import express from "express";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import http from "http";
import cors from "cors";
import { vCachePath, existsAsync, getRemoteHostSync, getPluginsJson, writeUserSession, writeUser, removeUserSession, removeUser, vPluginsPath, vReposPath} from "./filestructure";
import { Server } from 'socket.io';
import { createProxyMiddleware } from "http-proxy-middleware";
import multiplexer, { broadcastAllDevices, broadcastToClient } from "./multiplexer";
import { startSessionJob } from "./cron";
import macaddres from 'macaddress';
import sha256 from 'crypto-js/sha256';
import HexEncode from 'crypto-js/enc-hex';
import { cloneRepo } from "./repo";

const remoteHost = getRemoteHostSync();

const app = express();
const server = http.createServer(app);

const pluginsJSON = getPluginsJson();

const openCors = {
  origin: "*"
}

const pluginGuardedSafeOrginRegex = /([A-Z])\w+^(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)(\/(((?!plugins).)*))$/;
const safeOriginRegex = /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/
const corsOptionsDelegate = (req, callback) => {
  if (pluginGuardedSafeOrginRegex.test(req.connection.remoteAddress) || req.connection.remoteAddress == '127.0.0.1') {
    callback(null, {
      origin: true
    });
  } else {
    // TODO: fix this
    callback("sorry", {
      origin: false
    });
  }
}

const remoteHostCors = {
  origin: pluginGuardedSafeOrginRegex
}

const io = new Server(server, {
  cors: {
    origin: safeOriginRegex
  }
})

const DEFAULT_PORT = 63403;
const DEFAULT_HOST = "127.0.0.1";
const port = !!process.env.FLORO_VCDN_PORT
  ? parseInt(process.env.FLORO_VCDN_PORT)
  : DEFAULT_PORT;
const host = !!process.env.FLORO_VCDN_HOST
  ? process.env.FLORO_VCDN_HOST
  : DEFAULT_HOST;

io.on("connection", (socket) => {
  if (socket?.handshake?.headers?.referer && !safeOriginRegex.test(socket?.handshake?.headers?.referer)) {
    socket.disconnect();
    return;
  }
  const client = socket?.handshake?.query?.['client'] as undefined|('web'|'desktop'|'cli');
  if (['web', 'desktop', 'cli'].includes(client)) {
    multiplexer[client].push(socket);
    socket.on("disconnect", () => {
      multiplexer[client] = multiplexer[client].filter(s => s !== socket);
    });
  }
});

app.use(express.json());

app.use(function(_req, res, next) {
  res.header("Access-Control-Allow-Origin", remoteHost);
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/ping", cors(corsOptionsDelegate), async (_req, res): Promise<void> => {
  res.send("PONG");
});

app.get("/repo/:repoId/exists", cors(corsOptionsDelegate), async (req, res): Promise<void> => {
  const repoId = req.params['repoId'];
  if (!repoId) {
    res.send({exists: false})
  }
  const exists = await existsAsync(path.join(vReposPath, repoId))
  res.send({exists})
});

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

app.post('/login', cors(remoteHostCors), async (req, res) => {
  if (req?.body?.__typename == "PassedLoginAction" || req?.body?.__typename == "AccountCreationSuccessAction") {
    await writeUserSession(req.body.session);
    await writeUser(req.body.user);
    broadcastAllDevices("login", req.body);
    broadcastToClient('desktop', 'bring-to-front', null);
    res.send({message: "ok"});
  } else {
    res.send({message: "error"});
  }
});

app.post('/logout', cors(remoteHostCors), async (req, res) => {
  try {
    await removeUserSession();
    await removeUser();
  } catch (e) {
    // dont log this
  }
  broadcastAllDevices("logout", {});
  res.send({message: "ok"});
});

app.get('/device', cors(remoteHostCors), async (req, res) => {
  const mac = await macaddres.one();
  const hash = sha256(mac);
  const id = HexEncode.stringify(hash);
  res.send({id});
});

app.post('/complete_signup', cors(remoteHostCors), async (req, res) => {
  if (req?.body?.__typename == "CompleteSignupAction") {
    broadcastAllDevices("complete_signup", req.body);
    broadcastToClient('desktop', 'bring-to-front', null);
    res.send({message: "ok"});
  } else {
    res.send({message: "error"});
  }
});

for(let plugin in pluginsJSON.plugins) {
  let pluginInfo = pluginsJSON.plugins[plugin];
  if (pluginInfo['proxy']) {
    const proxy = createProxyMiddleware("/plugins/" + plugin, {
      target: pluginInfo['host'],
      secure: true,
      ws: false,
      changeOrigin: false
    });
    app.use(proxy);
  }
}

server.listen(port, host, () => console.log("floro server started on " + host + ":" + port));
startSessionJob();

export default server;