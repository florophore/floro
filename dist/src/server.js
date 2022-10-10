"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const filestructure_1 = require("./filestructure");
const socket_io_1 = require("socket.io");
const http_proxy_middleware_1 = require("http-proxy-middleware");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const remoteHost = (0, filestructure_1.getRemoteHostSync)();
const pluginsJSON = (0, filestructure_1.getPluginsJson)();
console.log(pluginsJSON);
const openCors = {
    origin: "*"
};
const remoteHostCors = {
    origin: /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/
};
const io = new socket_io_1.Server(server, {
    cors: {
        origin: /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/
    }
});
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
    socket.emit("hello", { "boom": "boom" });
    // receive a message from the client
    socket.on("hello from client", (...args) => {
        // ...
    });
});
app.get("/ping", (0, cors_1.default)(openCors), async (req, res) => {
    res.send("PONG");
});
app.get("/login", (0, cors_1.default)(remoteHostCors), async (req, res) => {
    res.send("CORS ONLY");
});
for (let plugin in pluginsJSON.plugins) {
    let pluginInfo = pluginsJSON.plugins[plugin];
    if (pluginInfo['proxy']) {
        const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)("/plugins/" + plugin, {
            target: pluginInfo['host'],
            ws: true,
            changeOrigin: true
        });
        app.use(proxy);
    }
}
app.get("/*.svg", (0, cors_1.default)(openCors), async (req, res) => {
    const imagePath = path_1.default.join(filestructure_1.vCachePath, req.path);
    if (await (0, filestructure_1.existsAsync)(imagePath)) {
        const svg = await fs_1.default.promises.readFile(imagePath, { encoding: "utf8", flag: "r" });
        res.status(200).setHeader("Content-Type", "image/svg+xml").send(svg);
    }
    else {
        res.status(404).send("No Image Found");
    }
});
app.get("/*.png", (0, cors_1.default)(openCors), async (req, res) => {
    const width = req.query["w"];
    const height = req.query["h"];
    const svgPath = req.path.substring(0, req.path.length - 3) + "svg";
    const imagePath = path_1.default.join(filestructure_1.vCachePath, svgPath);
    if (await (0, filestructure_1.existsAsync)(imagePath)) {
        if (width) {
            const buffer = await (0, sharp_1.default)(imagePath)
                .resize({ width: parseInt(width) })
                .png()
                .toBuffer();
            res.status(200).setHeader("Content-Type", "image/png").send(buffer);
            return;
        }
        if (height) {
            const buffer = await (0, sharp_1.default)(imagePath)
                .resize({ height: parseInt(height) })
                .png()
                .toBuffer();
            res.status(200).setHeader("Content-Type", "image/png").send(buffer);
            return;
        }
        const buffer = await (0, sharp_1.default)(imagePath).png().toBuffer();
        res.status(200).setHeader("Content-Type", "image/png").send(buffer);
        return;
    }
    else {
        res.status(404).send("No Image Found");
    }
});
server.listen(port, host, () => console.log("floro server started on " + host + ":" + port));
exports.default = server;
//# sourceMappingURL=server.js.map