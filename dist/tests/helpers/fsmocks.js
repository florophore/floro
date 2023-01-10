"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBlankRepo = exports.makeSignedInUser = void 0;
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
        "url": "http://localhost:9000/cdn//users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/ebc4833518254cbdbedd4b7d71d06c67e4c3787468c597f1c30c3a4df7c07737.png",
        "thumbnailUrl": "http://localhost:9000/cdn//users/3edbc450-7e78-40db-895e-5eed8de73fcf/photos/754e4f180522390c003ff9f3add7236cb7001758dd4f8e041f261b8ed02c55fe.png"
      }
    },
    "authenticationCredentials": [
      {
        "id": "a57f501f-3295-4479-acb6-38aa5fb4f7b5",
        "createdAt": "2022-11-30T22:14:48.679Z",
        "updatedAt": "2022-12-30T17:44:00.220Z",
        "credentialType": "email_pass",
        "isSignupCredential": false,
        "email": "james.rainer.sunderland@gmail.com",
        "normalizedEmail": "jamesrainersunderland@gmail.com",
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
      "GvU6JkmsnQNtFe2HHjKbvNU1ub1Uh68zt1rFqBNc7Ao=",
      "C6vWVNbzvqpiyjN1OwFoUjtYCH+L9Im9TnW2oOo9yqk=",
      "C232nvJULazDfdK+LQbJdwMGD31S6tzyg2D9tt1yzRE=",
      "vEgOFODZepqjRNUcPCO0nsZAgEfNtvrh3+WfHp+D9/M=",
      "ei1Eb2VQ0IUZzapBmBLy52HEGO8yYOCnlPxCQvjIDEw=",
      "LK3gDT9HSrQuedzkDnuMnxMkGAgdrhhbCey2HtjnRzA=",
      "Rg0TM0JPFmojiDW8IlDYQtNGB/bqc+vX+P3o9OOTju0=",
      "PkJo1hDNmPlfQvguIa/aW7w0ekKpOe2FgOEIUiZtmQg=",
      "9ciVxT6+oKlh6p+B1nhCE1+/E8SJ0tGklDPKdFwGkD8=",
      "1iPDY4JT2oi28I8MpXHqXYjyI0szlTLEPW0treu9UzI=",
      "QHoQekgYWHEk3BPRI0/H8+bluCh96OY9hL99WSMBPAo=",
      "V8vZGgYocYCft4oCuEFGm+XRfDrfYvkCbeJmmK7WZBo=",
      "f1xIBjkB8z0YO93C97UHmHTuzLovor6tcFPWUFllkwg=",
      "I/Dosm0Zp5I2rzyk1+M7ZU8OVdYf+Bufm3ORJNZGPaA=",
      "w/RccIHvVN3zwfd4T9sPvZvCh12ZkMBmDChkURimhxk=",
      "4BYNwD+Mbc0MerusIDru4d7XR/gtHNGMFV9+EX59wjQ=",
      "D/6fh1BaE/AMtu1evt7mhE1HQuAkzk7gv9lLLIIhQ3Q=",
      "2YGuOo/KXpcgNxogfMGU6NjzoSjCBQ5EwttoJBFVZk0=",
      "hZ+XFqaXnAvnB7acwgghC+Ka1sPfkhgYo5Z2N2kuIK8=",
      "pdCOSbmR7VUZN0wnHJTrnCY8YLJVQjzv5WEpqj1ZKhU=",
      "p6NVNcaSvz04+zi/sjVBFRJhpCbT240Ba+s6F8YQJKA=",
      "bZEwqV4Exfx/2RqtxSMDcj9PJ1W38AM2a7n6B3Vivgk=",
      "wggkvTIkHfGp2qNBDNp9Bv4q52epW4TNF81Zn9Wlsj0=",
      "8tGThvsfTjXkptKaHO44VE5jwN9iD0AcKNnpgoMqeWg="
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
const makeSignedInUser = async () => {
    await (0, filestructure_1.writeUserSession)(USER_SESSION);
    await (0, filestructure_1.writeUser)(USER);
};
exports.makeSignedInUser = makeSignedInUser;
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