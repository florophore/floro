import express from "express";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import http from "http";
import cors from "cors";
import { vCachePath, existsAsync, getRemoteHostSync, getPluginsJson, writeUserSession, writeUser} from "./filestructure";
import { Server } from 'socket.io';
import { createProxyMiddleware } from "http-proxy-middleware";
import * as trpcExpress from '@trpc/server/adapters/express';
import multiplexer, { broadcastAllDevices, broadcastToClient } from "./multiplexer";
import trpcRouter from "./router";
import protectedRouter from "./protectedrouter";

const createContext = ({}: trpcExpress.CreateExpressContextOptions) => ({})

const app = express();
const server = http.createServer(app);

const pluginsJSON = getPluginsJson();

const openCors = {
  origin: "*"
}

const remoteHostCors = {
  origin: /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/
}

const io = new Server(server, {
  cors: {
    origin: /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/
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
  const client = socket?.handshake?.query?.['client'] as undefined|('web'|'desktop'|'cli');
  if (['web', 'desktop', 'cli'].includes(client)) {
    multiplexer[client].push(socket);
    socket.on("disconnect", () => {
      multiplexer[client] = multiplexer[client].filter(s => s !== socket);
    });
  }
});

app.use(express.json());

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get("/ping", cors(remoteHostCors), async (_req, res): Promise<void> => {
  res.send("PONG");
});

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

app.post('/complete_signup', cors(remoteHostCors), async (req, res) => {
  if (req?.body?.__typename == "CompleteSignupAction") {
    broadcastAllDevices("complete_signup", req.body);
    broadcastToClient('desktop', 'bring-to-front', null);
    res.send({message: "ok"});
  } else {
    res.send({message: "error"});
  }
});

app.use(
  '/protectedtrpc',
  cors(remoteHostCors),
  trpcExpress.createExpressMiddleware({
      router: protectedRouter,
      createContext,
  }),
);

app.use(
  '/trpc',
  cors(remoteHostCors),
  trpcExpress.createExpressMiddleware({
      router: trpcRouter,
      createContext,
  }),
);

for(let plugin in pluginsJSON.plugins) {
  let pluginInfo = pluginsJSON.plugins[plugin];
  if (pluginInfo['proxy']) {
    const proxy = createProxyMiddleware("/plugins/" + plugin, {
      target: pluginInfo['host'],
      ws: true,
      changeOrigin: true
    });
    app.use(proxy);
  }
}

app.get("/*.svg", cors(openCors), async (req, res) => {
  const imagePath = path.join(vCachePath, req.path);
  if (await existsAsync(imagePath)) {
    const svg = await fs.promises.readFile(imagePath, { encoding: "utf8", flag: "r" });
    res.status(200).setHeader("Content-Type", "image/svg+xml").send(svg);
  } else {
    res.status(404).send("No Image Found");
  }
});

app.get("/*.png", cors(openCors), async (req, res) => {
  const width = req.query["w"];
  const height = req.query["h"];
  const svgPath = req.path.substring(0, req.path.length - 3) + "svg";
  const imagePath = path.join(vCachePath, svgPath);
  if (await existsAsync(imagePath)) {
    if (width) {
      const buffer = await sharp(imagePath)
        .resize({ width: parseInt(width) })
        .png()
        .toBuffer();
      res.status(200).setHeader("Content-Type", "image/png").send(buffer);
      return;
    }
    if (height) {
      const buffer = await sharp(imagePath)
        .resize({ height: parseInt(height) })
        .png()
        .toBuffer();
      res.status(200).setHeader("Content-Type", "image/png").send(buffer);
      return;
    }
    const buffer = await sharp(imagePath).png().toBuffer();
    res.status(200).setHeader("Content-Type", "image/png").send(buffer);
    return;
  } else {
    res.status(404).send("No Image Found");
  }
});

server.listen(port, host, () => console.log("floro server started on " + host + ":" + port));

export default server;