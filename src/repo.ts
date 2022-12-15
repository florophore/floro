import axios from "axios";
import fs, { createWriteStream, existsSync } from "fs";
import path from "path";
import tar from "tar";
import { existsAsync, getRemoteHostAsync, getUserSession, removeUser, vReposPath, vTMPPath } from "./filestructure";
import { broadcastAllDevices } from "./multiplexer";

export const cloneRepo = async (repoId: string): Promise<boolean> => {
  try {
    const remote = await getRemoteHostAsync();
    const session = getUserSession();
    const repoPath = path.join(vReposPath, repoId);
    const downloadPath = path.join(vTMPPath, `${repoId}.tar.gz`);
    await axios({
      method: "get",
      url: `${remote}/api/repo/${repoId}/clone`,
      headers: {
        ["session_key"]: session?.clientKey,
      },
      onDownloadProgress: (progressEvent) => {
        broadcastAllDevices(`repo:${repoId}:clone-progress`, progressEvent)
      },
      responseType: "stream",
    })
    .then((response) => {
      const exists = existsSync(downloadPath);
      if (exists) {
        return true;
      }
      const writer = createWriteStream(downloadPath);
      return new Promise((resolve, reject) => {
        response.data.pipe(writer);
        let error = null;
        writer.on("error", (err) => {
          error = err;
          writer.close();
          reject(err);
        });
        writer.on("close", () => {
          if (!error) {
            resolve(true);
          }
        });
      });
    });
    const exists = await existsAsync(repoPath);
    if (!exists) {
        await fs.promises.mkdir(repoPath);
        await fs.promises.chmod(repoPath, 0o755);
        await tar.x({
            file: downloadPath,
            cwd: repoPath
        })
    }
    const downloadExists = await existsAsync(downloadPath);
    if (downloadExists) {
      await fs.promises.rm(downloadPath);
    }
    return true;
  } catch (e) {
    return false;
  }
};
