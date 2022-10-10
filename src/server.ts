import express from "express";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import http from "http";
import cors from "cors";
import { vCachePath, existsAsync, getRemoteHostSync, getPluginsJson} from "./filestructure";
import { Server } from 'socket.io';
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const server = http.createServer(app);
const remoteHost = getRemoteHostSync();

const pluginsJSON = getPluginsJson();
console.log(pluginsJSON);

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
const DEFAULT_HOST = "0.0.0.0";
const port = !!process.env.FLORO_VCDN_PORT
  ? parseInt(process.env.FLORO_VCDN_PORT)
  : DEFAULT_PORT;
const host = !!process.env.FLORO_VCDN_HOST
  ? process.env.FLORO_VCDN_HOST
  : DEFAULT_HOST;


io.on("connection", (socket) => {
  console.log("CONNECTED");
  // send a message to the client
  socket.emit("hello", {"boom": "boom"});

  // receive a message from the client
  socket.on("hello from client", (...args) => {
    // ...
  });
});
  

app.get("/ping", cors(openCors), async (req, res): Promise<void> => {
  res.send("PONG");
});

app.get("/login", cors(remoteHostCors), async (req, res): Promise<void> => {
  res.send("CORS ONLY");
});

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