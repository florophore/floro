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
exports.logout = exports.login = exports.promptEmail = void 0;
const axios_1 = __importDefault(require("axios"));
const inquirer_1 = __importDefault(require("inquirer"));
const EmailValidator = __importStar(require("email-validator"));
const filestructure_1 = require("./filestructure");
const socket_1 = require("./socket");
const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
const promptEmail = async () => {
    const loggedInUser = (0, filestructure_1.getUser)();
    const session = (0, filestructure_1.getUserSession)();
    if (loggedInUser && session) {
        const expiresAt = new Date(session.expiresAt);
        const expiresAtMS = expiresAt.getTime();
        const nowMS = new Date().getTime();
        const delta = expiresAtMS - nowMS;
        if (delta > ONE_WEEK) {
            console.log("Signed in to floro as: " + loggedInUser.username);
            console.log("Please logout first. You can logout via the cli by running \"floro logout\"");
            process.exit();
            return;
        }
    }
    const { email: untrimmedEmail } = await inquirer_1.default.prompt({
        name: "email",
        type: "input",
        message: "Enter your email to login or sign up:",
        validate: (input) => EmailValidator.validate(input.trim()),
    });
    const email = untrimmedEmail.trim();
    if (!await (0, exports.login)(email)) {
        return;
    }
    const socket = (0, socket_1.createSocket)('cli');
    console.log("Please finish authentication by opening the email sent to " + email);
    console.log("Leave this terminal prompt running...");
    await (0, socket_1.waitForEvent)(socket, "login");
    const user = await (0, filestructure_1.getUser)();
    console.log("Signed in to floro as: " + user.username);
    process.exit();
};
exports.promptEmail = promptEmail;
const login = async (email) => {
    try {
        const host = await (0, filestructure_1.getRemoteHostAsync)();
        const response = await axios_1.default.post(host + "/api/authenticate", {
            email,
        });
        if (response?.data?.message != "ok") {
            console.error("Something went wrong. Please check that your email is correct and try again.");
            return false;
        }
        return true;
    }
    catch (e) {
        console.error("Something went wrong. Please check your internet connection and try again.");
        return false;
    }
};
exports.login = login;
const logout = async () => {
    try {
        await axios_1.default.post("http://localhost:63403/logout");
        console.log("logged out");
    }
    catch (e) {
        console.log("please make sure the floro server is running");
    }
    process.exit();
};
exports.logout = logout;
//# sourceMappingURL=login.js.map