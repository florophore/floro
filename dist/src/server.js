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
const util_1 = require("util");
const filestructure_1 = require("./filestructure");
const socket_io_1 = require("socket.io");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const corsOptions = {
    origin: "*"
};
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*"
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
app.get("/ping", (0, cors_1.default)(corsOptions), (req, res) => {
    res.send("pong");
});
app.get("/*.svg", async (req, res) => {
    const imagePath = path_1.default.join(filestructure_1.vCDNPath, req.path);
    if (await (0, util_1.promisify)(fs_1.default.exists)(imagePath)) {
        const svg = await (0, util_1.promisify)(fs_1.default.readFile)(imagePath, { encoding: "utf8", flag: "r" });
        res.status(200).setHeader("Content-Type", "image/svg+xml").send(svg);
    }
    else {
        res.status(404).send("No Image Found");
    }
});
app.get("/*.png", async (req, res) => {
    const width = req.query["w"];
    const height = req.query["h"];
    const svgPath = req.path.substring(0, req.path.length - 3) + "svg";
    const imagePath = path_1.default.join(filestructure_1.vCDNPath, svgPath);
    if (await (0, util_1.promisify)(fs_1.default.exists)(imagePath)) {
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
//# sourceMappingURL=server.js.map