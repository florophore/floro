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
const repo_1 = require("./repo");
const versioncontrol_1 = require("./versioncontrol");
const plugins_1 = require("./plugins");
const licensecodes_1 = require("./licensecodes");
const remoteHost = (0, filestructure_1.getRemoteHostSync)();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
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
    const repos = await (0, repo_1.getLocalRepos)();
    res.send({
        repos,
    });
});
app.get("/repo/:repoId/exists", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.send({ exists: false });
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    res.send({ exists });
});
app.get("/repo/:repoId/branch", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const branch = await (0, repo_1.getCurrentBranch)(repoId);
    res.send({ branch });
});
app.get("/repo/:repoId/settings", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const settings = await (0, repo_1.getRepoSettings)(repoId);
    res.send({ settings });
});
app.get("/repo/:repoId/branches", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const branches = await (0, repo_1.getLocalBranches)(repoId);
    res.send({ branches });
});
app.post("/repo/:repoId/description", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const description = req.body?.["description"] ?? "";
    const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
    const diff = (0, versioncontrol_1.getTextDiff)(unstagedState.description?.join(""), description);
    const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
        {
            diff,
            namespace: "description",
        },
    ]);
    const nextDescription = (0, versioncontrol_1.applyDiff)(state.diff.description, unstagedState.description);
    res.send({ description: nextDescription });
});
app.get("/repo/:repoId/description", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const state = await (0, repo_1.getRepoState)(repoId);
    res.send({ description: state.description });
});
app.post("/repo/:repoId/licenses", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    try {
        const licenses = (req.body?.["licenses"] ?? [])?.map((rawLicense) => {
            if (!licensecodes_1.LicenseCodes?.[rawLicense?.key]) {
                return null;
            }
            return {
                key: rawLicense.key,
                value: licensecodes_1.LicenseCodes[rawLicense.key],
            };
        });
        if (licenses.includes(null)) {
            res.sendStatus(400);
            return;
        }
        const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
        const diff = (0, versioncontrol_1.getDiff)(unstagedState.licenses, licenses);
        const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
            {
                diff,
                namespace: "licenses",
            },
        ]);
        const nextLicenses = (0, versioncontrol_1.applyDiff)(state.diff.licenses, unstagedState.licenses);
        res.send({ licenses: nextLicenses });
    }
    catch (e) {
        res.sendStatus(400);
    }
});
app.get("/repo/:repoId/licenses", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const state = await (0, repo_1.getRepoState)(repoId);
    res.send({ licenses: state.licenses });
});
app.get("/repo/:repoId/state", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const state = await (0, repo_1.getRepoState)(repoId);
    const store = await (0, repo_1.buildStateStore)(state);
    res.send({ state: { ...state, store } });
});
app.post("/repo/:repoId/plugins", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    // TODO: VALIDATE PLUGINS
    const { plugins } = req.body;
    // perform compat check
    // fetch upstream plugins
    const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
    const pluginsDiff = (0, versioncontrol_1.getDiff)(unstagedState.plugins, plugins);
    const nextPluginState = (0, versioncontrol_1.applyDiff)(pluginsDiff, unstagedState.plugins);
    const pluginAdditions = [];
    for (let plugin of nextPluginState) {
        if (!(0, plugins_1.hasPlugin)(plugin.key, unstagedState.plugins)) {
            pluginAdditions.push({
                namespace: "store",
                pluginName: plugin.key,
                diff: {
                    add: {},
                    remove: {},
                },
            });
        }
    }
    // TRANSFORM store and binaries
    // run migrations
    //const state = await saveDiffToCurrent(repoId, pluginsDiff, 'plugins');
    const state = await (0, repo_1.saveDiffListToCurrent)(repoId, [
        {
            diff: pluginsDiff,
            namespace: "plugins",
        },
        ...pluginAdditions,
    ]);
    res.send({ state });
});
app.post("/repo/:repoId/plugins/:plugin/state", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const pluginName = req.params["plugin"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const unstagedState = await (0, repo_1.getUnstagedCommitState)(repoId);
    const current = await (0, repo_1.getRepoState)(repoId);
    if (current == null) {
        res.sendStatus(404);
        return;
    }
    // TODO MOVE THIS LOGIC TO HANDLE DOWNSTREAM
    const manifest = await (0, plugins_1.getPluginManifest)(pluginName, current?.plugins ?? []);
    if (manifest == null) {
        res.sendStatus(404);
        return;
    }
    const upstreamDependencies = await (0, plugins_1.getUpstreamDependencyList)(pluginName, manifest, current?.plugins ?? []);
    const upsteamSchema = await (0, plugins_1.constructDependencySchema)(upstreamDependencies);
    const rootSchema = (0, plugins_1.getRootSchemaForPlugin)(upsteamSchema, manifest, pluginName);
    const kvState = (0, plugins_1.getKVStateForPlugin)(upsteamSchema, manifest, pluginName, req.body ?? {});
    const diff = (0, versioncontrol_1.getDiff)(unstagedState.store?.[pluginName] ?? [], kvState);
    // needs to be looped through for each plugin in downstream deps
    const nextState = (0, versioncontrol_1.applyDiff)(diff, unstagedState?.store?.[pluginName] ?? []);
    // END TODO
    const commitState = await (0, repo_1.saveDiffListToCurrent)(repoId, [
        {
            diff,
            namespace: "store",
            pluginName,
        },
    ]);
    const state = (0, plugins_1.generateStateFromKV)(manifest, nextState, pluginName);
    // run cascade next
    // find downstream plugins
    // run cascades on downstream schemas
    // save all diffs against respective manifests
    // return constructed kv state of plugin and upstreams
    res.send({ [pluginName]: state });
});
app.get("/repo/:repoId/plugins/:plugin/state", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const pluginName = req.params["plugin"];
    if (!repoId) {
        res.sendStatus(404);
    }
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const current = await (0, repo_1.getRepoState)(repoId);
    const manifest = await (0, plugins_1.getPluginManifest)(pluginName, current?.plugins ?? []);
    if (manifest == null) {
        res.sendStatus(404);
        return;
    }
    const state = (0, plugins_1.generateStateFromKV)(manifest, current?.store?.[pluginName] ?? [], pluginName);
    res.send({ [pluginName]: state });
});
app.post("/repo/:repoId/stash", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const currentState = await (0, repo_1.getCurrentState)(repoId);
    res.send({ ok: true });
});
app.get("/repo/:repoId/stash/status", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const exists = await (0, filestructure_1.existsAsync)(path_1.default.join(filestructure_1.vReposPath, repoId));
    if (!exists) {
        res.sendStatus(404);
        return;
    }
    const currentState = await (0, repo_1.getCurrentState)(repoId);
    res.send({ ok: true });
});
app.post("/repo/:repoId/stash/pop", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => { });
app.get("/repo/:repoId/plugins/:plugin/validate", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => { });
app.get("/repo/:repoId/current/diff", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
});
app.post("/repo/:repoId/checkout", (0, cors_1.default)(corsOptionsDelegate), async (req, res) => {
    const repoId = req.params["repoId"];
    const branch = req.params["branch"];
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
for (let plugin in pluginsJSON.plugins) {
    let pluginInfo = pluginsJSON.plugins[plugin];
    if (pluginInfo["proxy"]) {
        const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)("/plugins/" + plugin, {
            target: pluginInfo["host"],
            secure: true,
            ws: false,
            changeOrigin: false,
        });
        app.use(proxy);
    }
}
server.listen(port, host, () => console.log("floro server started on " + host + ":" + port));
(0, cron_1.startSessionJob)();
exports.default = server;
//# sourceMappingURL=server.js.map