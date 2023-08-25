import { Express } from "express";
import { DataSource } from "./datasource";
import {
  convertCommitStateToRenderedState,
  getCommitState,
  getInvalidStates,
  getRepoInfo,
} from "./repo";
import binarySession from "./binary_session";
import {
  getPluginManifests,
  getRootSchemaMap,
  isTopologicalSubset,
  isTopologicalSubsetValid,
  manifestListToSchemaMap,
} from "./plugins";

export interface ApiRepository {
  id: string;
  name: string;
  defaultBranchId: string;
}

export const usePublicApi = (app: Express, datasource: DataSource) => {
  const PREFIX = "/public/api/v0";
  app.get(PREFIX + "/repositories", async (req, res) => {
    const apiKeySecret = req?.headers?.["floro-api-key"];
    if (!apiKeySecret) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const globalApiKeys = await datasource.readApiKeys();
    const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
    if (!apiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const repos = await datasource.readRepos();
    const enabledRepoIds = [];
    for (const repoId of repos) {
      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(repoId);
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (hasApiKey) {
        enabledRepoIds.push(repoId);
      }
    }
    const repositories: Array<ApiRepository> = [];
    for (const repoId of enabledRepoIds) {
      const repoInfo = await getRepoInfo(datasource, repoId);
      const remoteSettings = await datasource.readRemoteSettings(repoId);
      if (repoInfo?.name && remoteSettings) {
        repositories.push({
          id: repoId,
          name: repoInfo.name,
          defaultBranchId: remoteSettings.defaultBranchId,
        });
      }
    }
    res.send({ repositories });
  });

  app.get(PREFIX + "/repository/:repositoryId", async (req, res) => {
    const apiKeySecret = req?.headers?.["floro-api-key"];
    if (!apiKeySecret) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const globalApiKeys = await datasource.readApiKeys();
    const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
    if (!apiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const repositoryId = req?.params?.["repositoryId"];
    if (!repositoryId) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }
    const exists = await datasource.repoExists(repositoryId);
    if (!exists) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }

    const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
      repositoryId
    );
    const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
    if (!hasApiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const repoInfo = await getRepoInfo(datasource, repositoryId);
    const remoteSettings = await datasource.readRemoteSettings(repositoryId);

    if (!repoInfo?.name || !remoteSettings) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }
    const repository = {
      id: repositoryId,
      name: repoInfo.name,
      defaultBranchId: remoteSettings.defaultBranchId,
    };
    res.send({ repository });
  });

  app.get(PREFIX + "/repository/:repositoryId/branches", async (req, res) => {
    const apiKeySecret = req?.headers?.["floro-api-key"];
    if (!apiKeySecret) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const globalApiKeys = await datasource.readApiKeys();
    const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
    if (!apiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const repositoryId = req?.params?.["repositoryId"];
    if (!repositoryId) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }
    const exists = await datasource.repoExists(repositoryId);
    if (!exists) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }

    const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
      repositoryId
    );
    const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
    if (!hasApiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const branches = await datasource?.readBranches(repositoryId);
    res.send({ branches });
  });

  app.get(PREFIX + "/repository/:repositoryId/branch/:branchId", async (req, res) => {
    const apiKeySecret = req?.headers?.["floro-api-key"];
    if (!apiKeySecret) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const globalApiKeys = await datasource.readApiKeys();
    const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
    if (!apiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const repositoryId = req?.params?.["repositoryId"];
    const branchId = req?.params?.["branchId"];
    if (!repositoryId) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }
    if (!branchId) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }
    const exists = await datasource.repoExists(repositoryId);
    if (!exists) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }

    const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
      repositoryId
    );
    const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
    if (!hasApiKey) {
      res.status(403).json({
        message: "forbidden",
      });
      return;
    }
    const branches = await datasource?.readBranches(repositoryId);
    const branch = branches.find(b => b.id == branchId);
    if (!branch) {
      res.status(404).json({
        message: "not found",
      });
      return;
    }
    res.send({ branch });
  });

  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const commitCopy = JSON.parse(JSON.stringify(commit));
      delete commitCopy['diff'];
      res.send({ commit: commitCopy });
    }
  );

  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha/state",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const state = await convertCommitStateToRenderedState(
        datasource,
        kvState
      );
      res.send({ state });
    }
  );
  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha/stateLink",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      res.send({ stateLink: `https://127.0.0.1:63403${PREFIX}/repository/${repositoryId}/commit/${sha}/stateLink` });
    }
  );

  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha/binaries",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const binaries = kvState.binaries.map((binaryRef) => {
        return `http://127.0.0.1:63403/binary/${binaryRef}?token=${binarySession.token}`;
      });
      res.send({ binaries });
    }
  );

  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha/manifests",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const manifests = await getPluginManifests(
        datasource,
        kvState.plugins,
        true
      );
      res.send({ manifests });
    }
  );

  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha/rootSchemaMap",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const manifests = await getPluginManifests(
        datasource,
        kvState.plugins,
        true
      );
      const manifestMap = manifestListToSchemaMap(manifests);
      const rootSchemaMap = await getRootSchemaMap(datasource, manifestMap);
      res.send({ rootSchemaMap });
    }
  );

  app.get(
    PREFIX + "/repository/:repositoryId/commit/:sha/invalidityMap",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const invalidityMap = await getInvalidStates(datasource, kvState);
      res.send({ invalidityMap });
    }
  );

  app.get(
    PREFIX +
      "/repository/:repositoryId/commit/:sha/isTopologicalSubset/:forwardSha/:pluginId",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      const forwardSha = req?.params?.["forwardSha"];
      const pluginName = req?.params?.["pluginId"];
      if (!pluginName) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha || !forwardSha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const forwardCommit = await datasource.readCommit(
        repositoryId,
        forwardSha
      );
      if (!forwardCommit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const state = await convertCommitStateToRenderedState(
        datasource,
        kvState
      );
      const manifests = await getPluginManifests(
        datasource,
        kvState.plugins,
        true
      );
      const manifestMap = manifestListToSchemaMap(manifests);
      const forwardKvState = await getCommitState(
        datasource,
        repositoryId,
        forwardSha
      );
      const forwardState = await convertCommitStateToRenderedState(
        datasource,
        forwardKvState
      );
      const comaprisonManifests = await getPluginManifests(
        datasource,
        forwardKvState.plugins,
        true
      );
      const forwardManifestMap =
        manifestListToSchemaMap(comaprisonManifests);
      if (!manifestMap[pluginName] || !forwardManifestMap[pluginName]) {
        res.send({
          isTopologicalSubset: false,
        });
        return;
      }

      const isTopologicalSubsetResult = await isTopologicalSubset(
        datasource,
        manifestMap,
        state.store,
        forwardManifestMap,
        forwardState.store,
        pluginName
      );
      res.send({
        isTopologicalSubset: isTopologicalSubsetResult,
      });
    }
  );

  app.get(
    PREFIX +
      "/repository/:repositoryId/commit/:sha/isTopologicalSubsetValid/:forwardSha/:pluginId",
    async (req, res) => {
      const apiKeySecret = req?.headers?.["floro-api-key"];
      if (!apiKeySecret) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const globalApiKeys = await datasource.readApiKeys();
      const apiKey = globalApiKeys.find((k) => k.secret == apiKeySecret);
      if (!apiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }
      const repositoryId = req?.params?.["repositoryId"];
      const sha = req?.params?.["sha"];
      const forwardSha = req?.params?.["forwardSha"];
      const pluginName = req?.params?.["pluginId"];
      if (!pluginName) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!repositoryId) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      if (!sha) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const exists = await datasource.repoExists(repositoryId);
      if (!exists) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }

      const enabledApiKeys = await datasource.readRepoEnabledApiKeys(
        repositoryId
      );
      const hasApiKey = enabledApiKeys.find((k) => k.apiKeyId == apiKey.id);
      if (!hasApiKey) {
        res.status(403).json({
          message: "forbidden",
        });
        return;
      }

      const commit = await datasource.readCommit(repositoryId, sha);
      if (!commit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const forwardCommit = await datasource.readCommit(
        repositoryId,
        forwardSha
      );
      if (!forwardCommit) {
        res.status(404).json({
          message: "not found",
        });
        return;
      }
      const kvState = await getCommitState(datasource, repositoryId, sha);
      const state = await convertCommitStateToRenderedState(
        datasource,
        kvState
      );
      const manifests = await getPluginManifests(
        datasource,
        kvState.plugins,
        true
      );
      const manifestMap = manifestListToSchemaMap(manifests);
      const forwardKvState = await getCommitState(
        datasource,
        repositoryId,
        forwardSha
      );
      const forwardState = await convertCommitStateToRenderedState(
        datasource,
        forwardKvState
      );
      const comaprisonManifests = await getPluginManifests(
        datasource,
        forwardKvState.plugins,
        true
      );
      const forwardManifestMap =
        manifestListToSchemaMap(comaprisonManifests);
      if (!manifestMap?.[pluginName] || !forwardManifestMap?.[pluginName]) {
        res.send({
          isTopologicalSubsetValid: false,
        });
        return;
      }

      const isTopologicalSubsetValidResult = await isTopologicalSubsetValid(
        datasource,
        manifestMap,
        state.store,
        forwardManifestMap,
        forwardState.store,
        pluginName
      );
      res.send({
        isTopologicalSubsetValid: isTopologicalSubsetValidResult,
      });
    }
  );
};
