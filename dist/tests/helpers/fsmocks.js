"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlankRepo = exports.getPluginCreationDirectoryRoot = exports.makeTestPlugin = exports.makePluginCreationDirectory = exports.makeSignedInUser = void 0;
const filestructure_1 = require("../../src/filestructure");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const USER_SESSION = JSON.parse(`
{
    "id": "HhKRVzGInm/9BhJ4saHuvCjcShdTlF9eKLHaZBLc/Po=",
    "clientKey": "3edbc450-7e78-40db-895e-5eed8de73fcf:HhKRVzGInm/9BhJ4saHuvCjcShdTlF9eKLHaZBLc/Po=",
    "userId": "3edbc450-7e78-40db-895e-5eed8de73fcf",
    "user": {
      "id": "3edbc450-7e78-40db-895e-5eed8de73fcf",
      "createdAt": "2022-11-07T16:35:44.739Z",
      "updatedAt": "2022-12-21T15:10:46.497Z",
      "firstName": "jamie",
      "lastName": "sunderland",
      "username": "jamiesunderland",
      "freeDiskSpaceBytes": "37580963840",
      "diskSpaceLimitBytes": "21474836480",
      "utilizedDiskSpaceBytes": "0",
      "profilePhotoId": "f02b59a9-2fb6-4477-89ef-98b36f82972d",
      "profilePhoto": {
        "id": "f02b59a9-2fb6-4477-89ef-98b36f82972d",
        "createdAt": "2022-12-21T15:10:46.481Z",
        "updatedAt": "2022-12-21T15:10:46.481Z",
        "hash": "ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737",
        "path": "/users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737.png",
        "thumbnailHash": "754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe",
        "thumbnailPath": "/users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe.png",
        "mimeType": "png",
        "uploadedByUserId": "3edbc450-7e78-40db-895e-5eed8de73fcf",
        "url": "http://localhost:9000/cdn/users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737.png",
        "thumbnailUrl": "http://localhost:9000/cdn/users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe.png"
      }
    },
    "authenticationCredentials": [
      {
        "id": "a57f501f-3295-4479-acb6-38aa5fb4f7b5",
        "createdAt": "2022-11-30T22:14:48.679Z",
        "updatedAt": "2022-12-30T17:44:00.220Z",
        "credentialType": "email_pass",
        "isSignupCredential": false,
        "email": "test@gmail.com",
        "normalizedEmail": "test@gmail.com",
        "emailHash": "5BqJH9ef6kkcV2vdTmcV6A==",
        "isVerified": true,
        "isThirdPartyVerified": false,
        "isDisabled": false,
        "hasThirdPartyTwoFactorEnabled": null,
        "accessToken": null,
        "googleId": null,
        "googleGivenName": null,
        "googleFamilyName": null,
        "googleLocale": null,
        "githubId": null,
        "githubNodeId": null,
        "githubLogin": null,
        "githubName": null,
        "githubCompany": null,
        "userId": "3edbc450-7e78-40db-895e-5eed8de73fcf"
      }
    ],
    "expiresAt": "2023-01-20T20:00:00.000Z",
    "createdAt": "2022-12-30T20:45:35.058Z",
    "exchangedAt": "2023-01-06T20:00:00.995Z",
    "exchangeHistory": [
    ]
  }
 `);
const USER = JSON.parse(`{
    "id": "3edbc450-7e78-40db-895e-5eed8de73fcf",
    "createdAt": "2022-11-07T16:35:44.739Z",
    "updatedAt": "2022-12-21T15:10:46.497Z",
    "firstName": "jamie",
    "lastName": "sunderland",
    "username": "jamiesunderland",
    "freeDiskSpaceBytes": "37580963840",
    "diskSpaceLimitBytes": "21474836480",
    "utilizedDiskSpaceBytes": "0",
    "profilePhotoId": "f02b59a9-2fb6-4477-89ef-98b36f82972d",
    "profilePhoto": {
      "id": "f02b59a9-2fb6-4477-89ef-98b36f82972d",
      "createdAt": "2022-12-21T15:10:46.481Z",
      "updatedAt": "2022-12-21T15:10:46.481Z",
      "hash": "ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737",
      "path": "/users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737.png",
      "thumbnailHash": "754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe",
      "thumbnailPath": "/users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe.png",
      "mimeType": "png",
      "uploadedByUserId": "3edbc450-7e78-40db-895e-5eed8de73fcf",
      "url": "http://localhost:9000/cdn//users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737.png",
      "thumbnailUrl": "http://localhost:9000/cdn//users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe.png"
    }
  }
`);
const REPO_CURRENT = `
{
    "branch": "main",
    "commit": null,
    "diff": {
      "description": {
        "add": {},
        "remove": {}
      },
      "licenses": {
        "add": {},
        "remove": {}
      },
      "plugins": {
        "add": {},
        "remove": {}
      },
      "store": {},
      "binaries": {
        "add": {},
        "remove": {}
      }
    }
  }
`;
const REPO_SETTINGS = `
    {"mainBranch":"main"}
`;
const MAIN_BRANCH = `
{
    "lastCommit": null,
    "firstCommit": null,
    "stashes": [],
    "createdBy": "3edbc450-7e78-40db-895e-5eed8de73fcf",
    "createdAt": "Wed Dec 21 2022 15:59:50 GMT-0500 (Eastern Standard Time)",
    "name": "main"
  }
`;
const DIST_INDEX_HTML = (pluginName) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script type="module" crossorigin src="/plugins/${pluginName}/assets/index.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>

`;
const DIST_ASSETS_INDEX_JS = (pluginName) => `
console.log("hello world from ${pluginName}");
`;
const makeSignedInUser = async () => {
    await (0, filestructure_1.writeUserSession)(USER_SESSION);
    await (0, filestructure_1.writeUser)(USER);
};
exports.makeSignedInUser = makeSignedInUser;
const makePluginCreationDirectory = (name, manifest) => {
    const projectsPath = path_1.default.join(filestructure_1.userHome, "projects");
    const projectPath = path_1.default.join(projectsPath, name);
    fs_1.default.mkdirSync(projectPath, { recursive: true });
    const floroCreationPath = path_1.default.join(projectPath, "floro");
    fs_1.default.mkdirSync(floroCreationPath, { recursive: true });
    const floroManifestPath = path_1.default.join(floroCreationPath, "floro.manifest.json");
    fs_1.default.writeFileSync(floroManifestPath, JSON.stringify(manifest));
    const distPath = path_1.default.join(projectPath, "dist");
    fs_1.default.mkdirSync(distPath, { recursive: true });
    const assetsPath = path_1.default.join(distPath, "assets");
    fs_1.default.mkdirSync(assetsPath, { recursive: true });
    const indexHTMLPath = path_1.default.join(distPath, "index.html");
    fs_1.default.writeFileSync(indexHTMLPath, DIST_INDEX_HTML(name));
    const indexJSPath = path_1.default.join(assetsPath, "index.js");
    fs_1.default.writeFileSync(indexJSPath, DIST_ASSETS_INDEX_JS(name));
    return projectPath;
};
exports.makePluginCreationDirectory = makePluginCreationDirectory;
const makeTestPlugin = (manifest, isDev = false) => {
    const pluginName = manifest.name;
    const pluginVersion = manifest.version;
    const pluginDir = path_1.default.join(isDev ? filestructure_1.vDEVPath : filestructure_1.vPluginsPath, `${pluginName}@${pluginVersion}`);
    fs_1.default.mkdirSync(pluginDir, { recursive: true });
    const floroCreationPath = path_1.default.join(pluginDir, "floro");
    fs_1.default.mkdirSync(floroCreationPath, { recursive: true });
    const floroManifestPath = path_1.default.join(floroCreationPath, "floro.manifest.json");
    fs_1.default.writeFileSync(floroManifestPath, JSON.stringify(manifest));
    const assetsPath = path_1.default.join(pluginDir, "assets");
    fs_1.default.mkdirSync(assetsPath, { recursive: true });
    const indexHTMLPath = path_1.default.join(pluginDir, "index.html");
    fs_1.default.writeFileSync(indexHTMLPath, DIST_INDEX_HTML(pluginName));
    const indexJSPath = path_1.default.join(assetsPath, "index.js");
    fs_1.default.writeFileSync(indexJSPath, DIST_ASSETS_INDEX_JS(pluginName));
    return pluginDir;
};
exports.makeTestPlugin = makeTestPlugin;
const getPluginCreationDirectoryRoot = async (name) => {
    const projectsPath = path_1.default.join(filestructure_1.userHome, "projects");
    return path_1.default.join(projectsPath, name);
};
exports.getPluginCreationDirectoryRoot = getPluginCreationDirectoryRoot;
const createBlankRepo = (repoId) => {
    const repoPath = path_1.default.join(filestructure_1.vReposPath, repoId);
    if (!fs_1.default.existsSync(repoPath)) {
        const binariesPath = path_1.default.join(repoPath, 'binaries');
        const branchesPath = path_1.default.join(repoPath, 'branches');
        const commitsPath = path_1.default.join(repoPath, 'commits');
        const stashesPath = path_1.default.join(repoPath, 'stash');
        fs_1.default.mkdirSync(repoPath);
        fs_1.default.mkdirSync(binariesPath);
        fs_1.default.mkdirSync(branchesPath);
        fs_1.default.mkdirSync(commitsPath);
        fs_1.default.mkdirSync(stashesPath);
        const repoSettingsPath = path_1.default.join(repoPath, 'settings.json');
        const currentPath = path_1.default.join(repoPath, 'current.json');
        const mainBranchPath = path_1.default.join(branchesPath, 'main.json');
        fs_1.default.writeFileSync(repoSettingsPath, REPO_SETTINGS, 'utf-8');
        fs_1.default.writeFileSync(currentPath, REPO_CURRENT, 'utf-8');
        fs_1.default.writeFileSync(mainBranchPath, MAIN_BRANCH, 'utf-8');
    }
};
exports.createBlankRepo = createBlankRepo;
//# sourceMappingURL=fsmocks.js.map