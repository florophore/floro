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
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const mime_types_1 = __importDefault(require("mime-types"));
const filestructure_1 = require("./filestructure");
const socket_io_1 = require("socket.io");
const http_proxy_middleware_1 = require("http-proxy-middleware");
const multiplexer_1 = __importStar(require("./multiplexer"));
const cron_1 = require("./cron");
const macaddress_1 = __importDefault(require("macaddress"));
const sha256_1 = __importDefault(require("crypto-js/sha256"));
const enc_hex_1 = __importDefault(require("crypto-js/enc-hex"));
const repo_1 = require("./repo");
const repoapi_1 = require("./repoapi");
const datasource_1 = require("./datasource");
const remoteHost = (0, filestructure_1.getRemoteHostSync)();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const datasource = (0, datasource_1.makeMemoizedDataSource)();
const pluginsJSON = (0, filestructure_1.getPluginsJson)();
const pluginGuardedSafeOrginRegex = /([A-Z])\w+^(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)(\/(((?!plugins).)*))$/;
const safeOriginRegex = /(https?:\/\/(localhost|127\.0\.0\.1):\d{1,5})|(https:\/\/floro.io)/;
const corsOptionsDelegate = (req, callback) => {
    if (pluginGuardedSafeOrginRegex.test(req.connection.remoteAddress) ||
        req.connection.remoteAddress == "127.0.0.1") {
        callback(null, {
            origin: true,
        });
    }
    else {
        // TODO: fix this
        callback("sorry", {
            origin: false,
        });
    }
};
const remoteHostCors = {
    origin: pluginGuardedSafeOrginRegex,
};
const io = new socket_io_1.Server(server, {
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
    if (socket?.handshake?.headers?.referer &&
        !safeOriginRegex.test(socket?.handshake?.headers?.referer)) {
        socket.disconnect();
        return;
    }
    const client = socket?.handshake?.query?.["client"];
    if (["web", "desktop", "cli"].includes(client)) {
        multiplexer_1.default[client].push(socket);
        socket.on("disconnect", () => {
            multiplexer_1.default[client] = multiplexer_1.default[client].filter((s) => s !== socket);
        });
    }
});
app.use(express_1.default.json());
app.use(function (_req, res, next) {
    res.header("Access-Control-Allow-Origin", remoteHost);
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
app.get("/ping", (0, cors_1.default)(corsOptionsDelegate), async (_req, res) => {
    res.send("PONG");
});
app.get("/repos", (0, cors_1.default)(corsOptionsDelegate), async (_req, res) => {
    const repos = await datasource.readRepos();
    res.send({
        repos,
    });
});
app.get("/repo/:repoId/exists", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const exists = await datasource.repoExists(repoId);
    res.send({ exists });
});
app.get("/repo/:repoId/branch", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branch = await (0, repoapi_1.getCurrentRepoBranch)(datasource, repoId);
    if (!branch) {
        res.sendStatus(404);
        return;
    }
    res.send({ branch });
});
app.post("/repo/:repoId/branch/:branch", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const branch = await (0, repoapi_1.switchRepoBranch)(datasource, repoId, branchName);
    if (!branch) {
        res.sendStatus(400);
        return;
    }
    res.send(branch);
});
app.get("/repo/:repoId/settings", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const settings = await (0, repoapi_1.readSettings)(datasource, repoId);
    if (!settings) {
        res.sendStatus(400);
        return;
    }
    res.send(settings);
});
app.post("/repo/:repoId/checkout/branch/:branch", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const state = await (0, repoapi_1.switchRepoBranch)(datasource, repoId, branchName);
    if (!state) {
        res.sendStatus(400);
        return;
    }
    res.send(state);
});
app.post("/repo/:repoId/checkout/commit/:sha", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const state = await (0, repoapi_1.checkoutSha)(datasource, repoId, sha);
    if (!state) {
        res.sendStatus(400);
        return;
    }
    res.send(state);
});
app.get("/repo/:repoId/branches", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branches = await (0, repoapi_1.getRepoBranches)(datasource, repoId);
    if (!branches) {
        res.sendStatus(400);
        return;
    }
    res.send(branches);
});
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
app.post("/repo/:repoId/description", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const description = await (0, repoapi_1.writeRepoDescription)(datasource, repoId, req.body?.["description"] ?? "");
    if (!description) {
        res.sendStatus(400);
        return;
    }
    res.send(description);
});
app.get("/repo/:repoId/description", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const description = await (0, repoapi_1.readRepoDescription)(datasource, repoId);
    if (!description) {
        res.sendStatus(400);
        return;
    }
    res.send(description);
});
app.post("/repo/:repoId/licenses", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const licenses = await (0, repoapi_1.writeRepoLicenses)(datasource, repoId, req.body?.["licenses"]);
    if (!licenses) {
        res.sendStatus(400);
        return;
    }
    res.send(licenses);
});
app.get("/repo/:repoId/licenses", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const licenses = await (0, repoapi_1.readRepoLicenses)(datasource, repoId);
    if (!licenses) {
        res.sendStatus(400);
        return;
    }
    res.send(licenses);
});
app.get("/repo/:repoId/state", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const state = await (0, repoapi_1.readCurrentState)(datasource, repoId);
    if (!state) {
        res.sendStatus(400);
        return;
    }
    res.send(state);
});
app.get("/repo/:repoId/commit/:sha/state", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const state = (0, repoapi_1.readCommitState)(datasource, repoId);
    if (!state) {
        res.sendStatus(400);
        return;
    }
    res.send(state);
});
app.get("/repo/:repoId/branch/:branch/state", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const state = (0, repoapi_1.readBranchState)(datasource, repoId, branchName);
    if (!state) {
        res.sendStatus(400);
        return;
    }
    res.send(state);
});
app.get("/repo/:repoId/history", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const history = (0, repoapi_1.readCurrentHistory)(datasource, repoId);
    if (!history) {
        res.sendStatus(400);
        return;
    }
    res.send(history);
});
app.get("/repo/:repoId/branch/:branch/history", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branchName = req.params["branch"];
    const history = (0, repoapi_1.readBranchHistory)(datasource, repoId, branchName);
    if (!history) {
        res.sendStatus(400);
        return;
    }
    res.send(history);
});
app.get("/repo/:repoId/commit/:sha/history", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const history = (0, repoapi_1.readCommitHistory)(datasource, repoId, sha);
    if (!history) {
        res.sendStatus(400);
        return;
    }
    res.send(history);
});
app.get("/repo/:repoId/lastcommit", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const commit = await (0, repoapi_1.readLastCommit)(datasource, repoId);
    if (!commit) {
        res.sendStatus(400);
        return;
    }
    res.send(commit);
});
app.get("/repo/:repoId/commit/:sha", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const sha = req.params["sha"];
    const commit = await (0, repoapi_1.readRepoCommit)(datasource, repoId, sha);
    if (!commit) {
        res.sendStatus(400);
        return;
    }
    res.send(commit);
});
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
app.post("/repo/:repoId/commit", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const message = req.body?.["message"];
    const commit = await (0, repoapi_1.writeRepoCommit)(datasource, repoId, message);
    if (!commit) {
        res.sendStatus(400);
        return;
    }
    res.send(commit);
});
app.get("/repo/:repoId/clone", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.send({ status: "failed" });
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (exists) {
        res.send({ status: "already_exists" });
        return;
    }
    const didSucceed = await (0, repo_1.cloneRepo)(repoId);
    if (didSucceed) {
        res.send({ status: "success" });
    }
    else {
        res.send({ status: "failed" });
    }
});
app.post("/login", (0, cors_1.default)(remoteHostCors), async (req, res) => {
    if (req?.body?.__typename == "PassedLoginAction" ||
        req?.body?.__typename == "AccountCreationSuccessAction") {
        await (0, filestructure_1.writeUserSession)(req.body.session);
        await (0, filestructure_1.writeUser)(req.body.user);
        (0, multiplexer_1.broadcastAllDevices)("login", req.body);
        (0, multiplexer_1.broadcastToClient)("desktop", "bring-to-front", null);
        res.send({ message: "ok" });
    }
    else {
        res.send({ message: "error" });
    }
});
app.post("/logout", (0, cors_1.default)(remoteHostCors), async (req, res) => {
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
app.get("/device", (0, cors_1.default)(remoteHostCors), async (req, res) => {
    const mac = await macaddress_1.default.one();
    const hash = (0, sha256_1.default)(mac);
    const id = enc_hex_1.default.stringify(hash);
    res.send({ id });
});
app.post("/complete_signup", (0, cors_1.default)(remoteHostCors), async (req, res) => {
    if (req?.body?.__typename == "CompleteSignupAction") {
        (0, multiplexer_1.broadcastAllDevices)("complete_signup", req.body);
        (0, multiplexer_1.broadcastToClient)("desktop", "bring-to-front", null);
        res.send({ message: "ok" });
    }
    else {
        res.send({ message: "error" });
    }
});
app.get("/plugins/:pluginName/dev@*", async (req, res) => {
    const pluginName = req?.params?.['pluginName'];
    const pluginVersion = req.path.split("/")[3];
    const [, version] = pluginVersion.split("@");
    if (!version) {
        res.sendStatus(404);
        return;
    }
    const manifest = await (0, datasource_1.readDevPluginManifest)(pluginName, pluginVersion);
    if (!manifest) {
        res.sendStatus(404);
        return;
    }
    const prodPath = `/plugins/${pluginName}/${version}`;
    const basePath = `/plugins/${pluginName}/${pluginVersion}`;
    const pathRemainer = req.path.substring(basePath.length)?.split('?')[0];
    if (!pathRemainer || pathRemainer == "/" || pathRemainer == "/write" || pathRemainer == "/write/") {
        const filePath = path_1.default.join(filestructure_1.vDEVPath, pluginName, version, 'index.html');
        const exists = await (0, filestructure_1.existsAsync)(filePath);
        if (!exists) {
            res.sendStatus(404);
            return;
        }
        const indexHtml = await fs_1.default.promises.readFile(filePath);
        res.type('html');
        res.send(indexHtml.toString().replaceAll(prodPath, basePath));
        return;
    }
    const filePath = path_1.default.join(filestructure_1.vDEVPath, pluginName, version, ...pathRemainer.split("/"));
    const exists = await (0, filestructure_1.existsAsync)(filePath);
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const file = await fs_1.default.promises.readFile(filePath);
    const contentType = mime_types_1.default.contentType(path_1.default.extname(filePath));
    res.setHeader('content-type', contentType);
    res.send(file.toString().replaceAll(prodPath, basePath));
});
for (let plugin in pluginsJSON.plugins) {
    let pluginInfo = pluginsJSON.plugins[plugin];
    if (pluginInfo["proxy"]) {
        const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)("/plugins/" + plugin + "/dev", {
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
    console.log("PN", pluginName);
    console.log("V", pluginVersion);
    console.log("path", req.path);
    // finsish this
    res.send({ ok: true });
});
server.listen(port, host, () => console.log("floro server started on " + host + ":" + port));
(0, cron_1.startSessionJob)();
exports.default = server;
//# sourceMappingURL=server.js.map