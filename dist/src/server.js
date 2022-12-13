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
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const filestructure_1 = require("./filestructure");
const socket_io_1 = require("socket.io");
const http_proxy_middleware_1 = require("http-proxy-middleware");
const multiplexer_1 = __importStar(require("./multiplexer"));
const cron_1 = require("./cron");
const macaddress_1 = __importDefault(require("macaddress"));
const sha256_1 = __importDefault(require("crypto-js/sha256"));
const enc_hex_1 = __importDefault(require("crypto-js/enc-hex"));
const remoteHost = (0, filestructure_1.getRemoteHostSync)();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const pluginsJSON = (0, filestructure_1.getPluginsJson)();
const openCors = {
    origin: "*"
};
const pluginGuardedSafeOrginRegex = /([A-Z])\w+^(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)(\/(((?!plugins).)*))$/;
const safeOriginRegex = /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/;
const corsOptionsDelegate = (req, callback) => {
    if (pluginGuardedSafeOrginRegex.test(req.connection.remoteAddress) || req.connection.remoteAddress == '127.0.0.1') {
        callback(null, {
            origin: true
        });
    }
    else {
        callback("sorry", {
            origin: false
        });
    }
};
const remoteHostCors = {
    origin: pluginGuardedSafeOrginRegex
};
const io = new socket_io_1.Server(server, {
    cors: {
        origin: safeOriginRegex
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
    if (socket?.handshake?.headers?.referer && !safeOriginRegex.test(socket?.handshake?.headers?.referer)) {
        socket.disconnect();
        return;
    }
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
    res.header("Access-Control-Allow-Origin", remoteHost);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.get("/ping", (0, cors_1.default)(corsOptionsDelegate), async (_req, res) => {
    res.send("PONG");
});
app.get("/repo/exists/:repoId", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params['repoId'];
    if (!repoId) {
        res.send({ exists: false });
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    res.send({ exists });
});
app.post("/repo/clone/:repoId", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    console.log("GO IT");
    res.send({ test: "ok" });
    //const repoId = req.params['repoId'];
    //if (!repoId) {
    //  res.send({exists: false})
    //}
    //const exists = await existsAsync(path.join(vReposPath, repoId))
    //res.send({exists})
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
    }
    catch (e) {
        // dont log this
    }
    (0, multiplexer_1.broadcastAllDevices)("logout", {});
    res.send({ message: "ok" });
});
app.get('/device', (0, cors_1.default)(remoteHostCors), async (req, res) => {
    const mac = await macaddress_1.default.one();
    const hash = (0, sha256_1.default)(mac);
    const id = enc_hex_1.default.stringify(hash);
    res.send({ id });
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
for (let plugin in pluginsJSON.plugins) {
    let pluginInfo = pluginsJSON.plugins[plugin];
    if (pluginInfo['proxy']) {
        const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)("/plugins/" + plugin, {
            target: pluginInfo['host'],
            secure: true,
            ws: false,
            changeOrigin: false
        });
        app.use(proxy);
    }
}
server.listen(port, host, () => console.log("floro server started on " + host + ":" + port));
(0, cron_1.startSessionJob)();
exports.default = server;
//# sourceMappingURL=server.js.map