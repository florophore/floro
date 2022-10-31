"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const trpcExpress = __importStar(require("@trpc/server/adapters/express"));
const multiplexer_1 = __importStar(require("./multiplexer"));
const router_1 = __importDefault(require("./router"));
const protectedrouter_1 = __importDefault(require("./protectedrouter"));
const cron_1 = require("./cron");
const createContext = ({}) => ({});
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const pluginsJSON = (0, filestructure_1.getPluginsJson)();
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
const DEFAULT_HOST = "127.0.0.1";
const port = !!process.env.FLORO_VCDN_PORT
    ? parseInt(process.env.FLORO_VCDN_PORT)
    : DEFAULT_PORT;
const host = !!process.env.FLORO_VCDN_HOST
    ? process.env.FLORO_VCDN_HOST
    : DEFAULT_HOST;
io.on("connection", (socket) => {
    const client = socket?.handshake?.query?.['client'];
    if (['web', 'desktop', 'cli'].includes(client)) {
        multiplexer_1.default[client].push(socket);
        socket.on("disconnect", () => {
            multiplexer_1.default[client] = multiplexer_1.default[client].filter(s => s !== socket);
        });
    }
});
app.use(express_1.default.json());
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.get("/ping", (0, cors_1.default)(remoteHostCors), async (_req, res) => {
    res.send("PONG");
});
app.post('/login', (0, cors_1.default)(remoteHostCors), async (req, res) => {
    if (req?.body?.__typename == "PassedLoginAction" || req?.body?.__typename == "AccountCreationSuccessAction") {
        await (0, filestructure_1.writeUserSession)(req.body.session);
        await (0, filestructure_1.writeUser)(req.body.user);
        (0, multiplexer_1.broadcastAllDevices)("login", req.body);
        (0, multiplexer_1.broadcastToClient)('desktop', 'bring-to-front', null);
        res.send({ message: "ok" });
    }
    else {
        res.send({ message: "error" });
    }
});
app.post('/logout', (0, cors_1.default)(remoteHostCors), async (req, res) => {
    try {
        await (0, filestructure_1.removeUserSession)();
        await (0, filestructure_1.removeUser)();
        (0, multiplexer_1.broadcastAllDevices)("logout", null);
    }
    catch (e) {
        // dont log
    }
    res.send({ message: "ok" });
});
app.post('/complete_signup', (0, cors_1.default)(remoteHostCors), async (req, res) => {
    if (req?.body?.__typename == "CompleteSignupAction") {
        (0, multiplexer_1.broadcastAllDevices)("complete_signup", req.body);
        (0, multiplexer_1.broadcastToClient)('desktop', 'bring-to-front', null);
        res.send({ message: "ok" });
    }
    else {
        res.send({ message: "error" });
    }
});
app.use('/protectedtrpc', (0, cors_1.default)(remoteHostCors), trpcExpress.createExpressMiddleware({
    router: protectedrouter_1.default,
    createContext,
}));
app.use('/trpc', (0, cors_1.default)(remoteHostCors), trpcExpress.createExpressMiddleware({
    router: router_1.default,
    createContext,
}));
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
(0, cron_1.startSessionJob)();
exports.default = server;
//# sourceMappingURL=server.js.map