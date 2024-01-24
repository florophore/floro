import fs, { FSWatcher } from "fs";
import path from "path";
import { existsAsync, vReposPath } from "./filestructure";
import { DataSource } from "./datasource";
import { broadcastToClient } from "./multiplexer";
import binarySession from "./binary_session";
let repos: Array<{
  repoId: string;
  filePath: string;
  watcher: FSWatcher;
}> = [];

export const watchStateFiles = async (datasource: DataSource) => {
  while (repos.length > 0) {
    const repo = repos.pop();
    repo.watcher.close();
  }
  const repoIds = await datasource.readRepos();

  for (const repoId of repoIds) {
    const filePath = path.join(vReposPath(), repoId, "state.json");
    const doesExist = await existsAsync(filePath);
    if (!doesExist) {
      continue;
    }
    let debounce: NodeJS.Timeout;
    const watcher = fs.watch(filePath, () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        try {
          broadcastToClient("cli", "state:changed", {
            repoId,
          });
          const renderedState = await datasource.readRenderedState(repoId);
          const binaries = await Promise?.all?.(
            renderedState?.binaries?.map?.(async (binaryRef) => {
              const hash = binaryRef?.split?.(".")?.[0];
              const url = `http://localhost:63403/binary/${binaryRef}?token=${binarySession.token}`;
              return {
                hash,
                url,
                fileName: binaryRef,
              };
            }) ?? []
          ) ?? [];
          broadcastToClient("extension", "state:changed", {
            repoId,
            store: renderedState?.store ?? {},
            binaries,
          });
          broadcastToClient("external", "state:changed", {
            repoId,
            store: renderedState?.store ?? {},
            binaries,
          });
        } catch(e) {
          console.log("Error", e);
        }
      }, 100);
    });
    repos.push({
      repoId,
      filePath,
      watcher,
    });
  }
};

export const watchRepos = async (datasource: DataSource) => {
  await watchStateFiles(datasource);
  const repos = await datasource.readRepos();
  broadcastToClient("extension", "update:repos", {
    repos
  });

  fs.watch(vReposPath(), async () => {
    await watchStateFiles(datasource);
  });
};

export const triggerExtensionStateUpdate = async (datasource: DataSource, repoId: string) => {
  try {
    const renderedState = await datasource.readRenderedState(repoId);
    const binaries = await Promise?.all?.(
      renderedState?.binaries?.map?.(async (binaryRef) => {
        const hash = binaryRef?.split?.(".")?.[0];
        const url = `http://localhost:63403/binary/${binaryRef}?token=${binarySession.token}`;
        return {
          hash,
          url,
          fileName: binaryRef,
        };
      }) ?? []
    ) ?? [];
    broadcastToClient("extension", "state:changed", {
      repoId,
      store: renderedState?.store ?? {},
      binaries,
    });
    broadcastToClient("external", "state:changed", {
      repoId,
      store: renderedState?.store ?? {},
      binaries,
    });
  } catch(e) {
    console.log("Error", e);
  }
};
