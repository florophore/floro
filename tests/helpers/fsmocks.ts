import {
  writeUserSession,
  writeUser,
  vReposPath,
  userHome,
  vDEVPath,
  vPluginsPath,
} from "../../src/filestructure";
import path from "path";
import fs from "fs";
import { Manifest } from "../../src/plugins";
import { EMPTY_RENDERED_APPLICATION_STATE } from "../../src/repo";

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
      "profilePhotoId": null,
      "profilePhoto": null
    },
    "authenticationCredentials": [
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
    "profilePhotoId": null,
    "profilePhoto": null
  }
`);

const REPO_CURRENT = `
{
    "branch": "main",
    "commit": null,
    "isInMergeConflict": false,
    "merge": null,
    "commandMode": "view",
    "comparison": null
  }
`;

const REPO_SETTINGS = `
    {"mainBranch":"main"}
`;

const META_BRANCHES_JSON = JSON.stringify(
  {
    userBranches: [
      {
        branchId: "main",
        lastLocalCommit: null,
        lastRemoteCommit: null,
      },
    ],
    allBranches: [
      {
        branchId: "main",
        lastLocalCommit: null,
        lastRemoteCommit: null,
      },
    ],
  },
  null,
  2
);

const MAIN_BRANCH = `
{
    "lastCommit": null,
    "id": "main",
    "stashes": [],
    "createdBy": "3edbc450-7e78-40db-895e-5eed8de73fcf",
    "createdAt": "Wed Dec 21 2022 15:59:50 GMT-0500 (Eastern Standard Time)",
    "name": "main"
  }
`;

const EMPTY_STATE = JSON.stringify(EMPTY_RENDERED_APPLICATION_STATE, null, 2);

const DIST_INDEX_HTML = (pluginName: string) => `
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

const DIST_ASSETS_INDEX_JS = (pluginName: string) => `
console.log("hello world from ${pluginName}");
`;
export const makeSignedInUser = async () => {
  await writeUserSession(USER_SESSION);
  await writeUser(USER);
};

export const makePluginCreationDirectory = (
  name: string,
  manifest: Manifest
) => {
  const projectsPath = path.join(userHome, "projects");
  const projectPath = path.join(projectsPath, name);
  fs.mkdirSync(projectPath, { recursive: true });
  const floroCreationPath = path.join(projectPath, "floro");
  fs.mkdirSync(floroCreationPath, { recursive: true });
  const floroManifestPath = path.join(floroCreationPath, "floro.manifest.json");
  fs.writeFileSync(floroManifestPath, JSON.stringify(manifest));
  const distPath = path.join(projectPath, "dist");
  fs.mkdirSync(distPath, { recursive: true });
  const assetsPath = path.join(distPath, "assets");
  fs.mkdirSync(assetsPath, { recursive: true });
  const indexHTMLPath = path.join(distPath, "index.html");
  fs.writeFileSync(indexHTMLPath, DIST_INDEX_HTML(name));
  const indexJSPath = path.join(assetsPath, "index.js");
  fs.writeFileSync(indexJSPath, DIST_ASSETS_INDEX_JS(name));
  return projectPath;
};

export const makeTestPlugin = (manifest: Manifest, isDev = false) => {
  const pluginName = manifest.name;
  const pluginVersion = manifest.version;
  const pluginDir = path.join(
    isDev ? vDEVPath : vPluginsPath,
    pluginName,
    pluginVersion
  );
  fs.mkdirSync(pluginDir, { recursive: true });
  const floroCreationPath = path.join(pluginDir, "floro");
  fs.mkdirSync(floroCreationPath, { recursive: true });
  const floroManifestPath = path.join(floroCreationPath, "floro.manifest.json");
  fs.writeFileSync(floroManifestPath, JSON.stringify(manifest));
  const assetsPath = path.join(pluginDir, "assets");
  fs.mkdirSync(assetsPath, { recursive: true });
  const indexHTMLPath = path.join(pluginDir, "index.html");
  fs.writeFileSync(indexHTMLPath, DIST_INDEX_HTML(pluginName));
  const indexJSPath = path.join(assetsPath, "index.js");
  fs.writeFileSync(indexJSPath, DIST_ASSETS_INDEX_JS(pluginName));
  return pluginDir;
};

export const getPluginCreationDirectoryRoot = async (name: string) => {
  const projectsPath = path.join(userHome, "projects");
  return path.join(projectsPath, name);
};

export const createBlankRepo = (repoId: string) => {
  const repoPath = path.join(vReposPath, repoId);
  if (!fs.existsSync(repoPath)) {
    const binariesPath = path.join(repoPath, "binaries");
    const branchesPath = path.join(repoPath, "branches");
    const commitsPath = path.join(repoPath, "commits");
    const stashesPath = path.join(repoPath, "stash");
    fs.mkdirSync(repoPath);
    fs.mkdirSync(binariesPath);
    fs.mkdirSync(branchesPath);
    fs.mkdirSync(commitsPath);
    fs.mkdirSync(stashesPath);
    const repoSettingsPath = path.join(repoPath, "settings.json");
    const repoStatePath = path.join(repoPath, "state.json");
    const currentPath = path.join(repoPath, "current.json");
    const branchesJsonPath = path.join(repoPath, "branches.json");
    const mainBranchPath = path.join(branchesPath, "main.json");
    fs.writeFileSync(repoSettingsPath, REPO_SETTINGS, "utf-8");
    fs.writeFileSync(repoStatePath, EMPTY_STATE, "utf-8");
    fs.writeFileSync(currentPath, REPO_CURRENT, "utf-8");
    fs.writeFileSync(mainBranchPath, MAIN_BRANCH, "utf-8");
    fs.writeFileSync(branchesJsonPath, META_BRANCHES_JSON, "utf-8");
  }
};
