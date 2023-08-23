import { DataSource } from "./datasource";
import { randomBytes, randomUUID } from "crypto";

export interface ApiKey {
  id: string;
  name: string;
  secret: string;
}

export interface WebhookKey {
  id: string;
  domain: string;
  defaultPort?: number;
  defaultProtocol?: "http"|"https";
  defaultSubdomain?: string;
  secret: string;
}

export interface RepoEnabledApiKey {
  apiKeyId: string;
  repositoryId: string;
}

export interface RepoEnabledWebhookKey {
  id: string;
  webhookKeyId: string;
  repositoryId: string;
  port?: number|undefined;
  protocol?: "http"|"https"|undefined;
  subdomain?: string|undefined;
  uri?: string|undefined;
}

export const getApiKeys = async (
  datasource: DataSource
): Promise<Array<ApiKey>> => {
  return await datasource.readApiKeys();
};

export const getApiKey = async (
  datasource: DataSource,
  id: string
): Promise<ApiKey | null> => {
  const keys = await getApiKeys(datasource);
  return keys.find((key) => key.id == id) ?? null;
};

export const addApiKey = async (
  datasource: DataSource,
  attrs: { name: string }
): Promise<ApiKey | null> => {
  const keys = await getApiKeys(datasource);
  const conflictingKey = keys.find((key) => key.name == attrs.name) ?? null;
  if (conflictingKey) {
    return null;
  }
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64");
  const key = {
    ...attrs,
    id,
    secret,
  };
  keys.push(key);
  const result = await datasource.writeApiKeys(keys);
  if (result) {
    return key;
  }
  return null;
};

export const updateApiKeySecret = async (
  datasource: DataSource,
  id: string
): Promise<ApiKey | null> => {
  const keys = await getApiKeys(datasource);
  const key = keys.find((key) => key.id == id) ?? null;
  if (!key) {
    return null;
  }
  const secret = randomBytes(32).toString("base64");
  const nextKeys = keys.map((k) => {
    if (k.id == id) {
      return {
        ...k,
        secret,
      };
    }
    return k;
  });
  const newKey = {
    ...key,
    secret,
  };
  const result = await datasource.writeApiKeys(nextKeys);
  if (result) {
    return newKey;
  }
  return null;
};

export const removeApiKey = async (
  datasource: DataSource,
  id: string
): Promise<Array<ApiKey>> => {
  const keys = await getApiKeys(datasource);
  const repoIds = await datasource.readRepos();
  for (const repoId of repoIds) {
    await removeRepoEnabledApiKey(datasource, repoId, id);
  }
  const nextKeys = keys.filter((k) => k.id != id);
  const result = await datasource.writeApiKeys(nextKeys);
  if (result) {
    return nextKeys;
  }
  return null;
};

export const getWebhookKeys = async (
  datasource: DataSource
): Promise<Array<WebhookKey>> => {
  return await datasource.readWebhookKeys();
};

export const getWebhookKey = async (
  datasource: DataSource,
  id: string
): Promise<WebhookKey | null> => {
  const keys = await getWebhookKeys(datasource);
  return keys.find((key) => key.id == id) ?? null;
};

export const addWebhookKey = async (
  datasource: DataSource,
  attrs: { domain: string, defaultPort?: number, defaultProtocol?: "http"|"https", defaultSubdomain?: string }
): Promise<WebhookKey | null> => {
  const keys = await getWebhookKeys(datasource);
  const conflictingKey = keys.find((key) => key.domain == attrs.domain) ?? null;
  if (conflictingKey) {
    return null;
  }
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64");
  const key = {
    ...attrs,
    id,
    secret,
  };
  keys.push(key);
  const result = await datasource.writeWebhookKeys(keys);
  if (result) {
    return key;
  }
  return null;
};

export const updateWebhookKeySecret = async (
  datasource: DataSource,
  id: string
): Promise<WebhookKey | null> => {
  const keys = await getWebhookKeys(datasource);
  const key = keys.find((key) => key.id == id) ?? null;
  if (!key) {
    return null;
  }
  const secret = randomBytes(32).toString("base64");
  const nextKeys = keys.map((k) => {
    if (k.id == id) {
      return {
        ...k,
        secret,
      };
    }
    return k;
  });
  const newKey = {
    ...key,
    secret,
  };
  const result = await datasource.writeWebhookKeys(nextKeys);
  if (result) {
    return newKey;
  }
  return null;
};

export const updateWebhookKey = async (
  datasource: DataSource,
  id: string,
  attrs: { defaultPort?: number, defaultProtocol?: "http"|"https", defaultSubdomain?: string }
): Promise<WebhookKey | null> => {
  const keys = await getWebhookKeys(datasource);
  const key = keys.find((key) => key.id == id) ?? null;
  if (!key) {
    return null;
  }
  const nextKeys = keys.map((k) => {
    if (k.id == id) {
      return {
        ...k,
        ...attrs,
      };
    }
    return k;
  });
  const newKey = {
    ...key,
    ...attrs,
  };
  const result = await datasource.writeWebhookKeys(nextKeys);
  if (result) {
    return newKey;
  }
  return null;
};

export const removeWebhookKey = async (
  datasource: DataSource,
  id: string
): Promise<Array<WebhookKey>> => {
  const keys = await getWebhookKeys(datasource);
  const repoIds = await datasource.readRepos();
  for (const repoId of repoIds) {
    await removeRepoEnabledWebhookKeyByWebhookKeyId(datasource, repoId, id);
  }
  const nextKeys = keys.filter((k) => k.id != id);
  const result = await datasource.writeWebhookKeys(nextKeys);
  if (result) {
    return nextKeys;
  }
  return null;
};

// REPO ENABLED
export const addRepoEnabledApiKey = async (datasource: DataSource, repoId: string, apiKeyId: string): Promise<Array<RepoEnabledApiKey>> => {
  try {
    const apiKeys = await datasource.readApiKeys();
    const enabledApiKeys = await datasource.readRepoEnabledApiKeys(repoId);
    const apiKey = apiKeys.find(ak => ak.id == apiKeyId);
    if (!apiKey) {
      return enabledApiKeys
    }
    const hasKeyAlready = !!enabledApiKeys.find(ek => ek.apiKeyId == apiKeyId);
    if (hasKeyAlready) {
      return enabledApiKeys;
    }
    enabledApiKeys.push({
      repositoryId: repoId,
      apiKeyId,
    });
    await datasource.writeRepoEnabledApiKeys(repoId, enabledApiKeys);
    return enabledApiKeys;
  } catch(e) {
    return null;
  }
}

export const removeRepoEnabledApiKey = async (datasource: DataSource, repoId: string, apiKeyId: string) => {
  try {
    const apiKeys = await datasource.readApiKeys();
    const enabledApiKeys = await datasource.readRepoEnabledApiKeys(repoId);
    const apiKey = apiKeys.find(ak => ak.id == apiKeyId);
    if (!apiKey) {
      return enabledApiKeys
    }
    const hasKeyAlready = !!enabledApiKeys.find(ek => ek.apiKeyId == apiKeyId);
    if (!hasKeyAlready) {
      return enabledApiKeys;
    }
    const nextEnabledApiKeys = enabledApiKeys.filter(enabledKey => {
      return enabledKey.apiKeyId != apiKeyId;
    });
    await datasource.writeRepoEnabledApiKeys(repoId, nextEnabledApiKeys);
    return nextEnabledApiKeys;
  } catch(e) {
    return null;
  }
}

export const addRepoEnabledWebhookKey = async (
  datasource: DataSource,
  repoId: string,
  webookArgs: {
    webhookKeyId: string;
    port?: number | undefined;
    protocol?: "http" | "https" | undefined;
    subdomain?: string | undefined;
    uri?: string | undefined;
  }
): Promise<Array<RepoEnabledWebhookKey>> => {
  try {
    const webhookKeys = await datasource.readWebhookKeys();
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(
      repoId
    );
    const webhookKey = webhookKeys.find((wk) => wk.id == webookArgs.webhookKeyId);
    if (!webhookKey) {
      return enabledWebhookKeys;
    }
    const id = randomUUID();
    enabledWebhookKeys.push({
      id,
      repositoryId: repoId,
      webhookKeyId: webookArgs.webhookKeyId,
      port: webookArgs.port,
      protocol: webookArgs.protocol,
      subdomain: webookArgs.subdomain,
      uri: webookArgs.uri,

    });
    await datasource.writeRepoEnabledWebhookKeys(repoId, enabledWebhookKeys);
    return enabledWebhookKeys;
  } catch (e) {
    return null;
  }
};

export const updateRepoEnabledWebhookKey = async (
  datasource: DataSource,
  repoId: string,
  id: string,
  webookArgs: {
    webhookKeyId: string;
    port?: number | undefined;
    protocol?: "http" | "https" | undefined;
    subdomain?: string | undefined;
    uri?: string | undefined;
  }
): Promise<Array<RepoEnabledWebhookKey>> => {
  try {
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(
      repoId
    );
    const nextEnabledApiKeys = enabledWebhookKeys.map(key => {
      if (key.id == id) {
        return {
          ...key,
          webhookKeyId: webookArgs?.webhookKeyId ?? key?.webhookKeyId,
          port: webookArgs.port,
          protocol: webookArgs.protocol,
          subdomain: webookArgs.subdomain,
          uri: webookArgs.uri,
        }
      }
      return key;
    })
    await datasource.writeRepoEnabledWebhookKeys(repoId, nextEnabledApiKeys);
    return nextEnabledApiKeys;
  } catch (e) {
    return null;
  }
};

export const removeRepoEnabledWebhookKeyByWebhookKeyId = async (datasource: DataSource, repoId: string, webhookKeyId: string) => {
  try {
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(
      repoId
    );
    const nextEnabledApiKeys = enabledWebhookKeys.filter(enabledKey => {
      return enabledKey.webhookKeyId != webhookKeyId;
    });
    await datasource.writeRepoEnabledWebhookKeys(repoId, nextEnabledApiKeys);
    return nextEnabledApiKeys;
  } catch(e) {
    return null;
  }
}

export const removeRepoEnabledWebhookKey = async (datasource: DataSource, repoId: string, id: string) => {
  try {
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(
      repoId
    );
    const nextEnabledApiKeys = enabledWebhookKeys.filter(enabledKey => {
      return enabledKey.id != id;
    });
    await datasource.writeRepoEnabledWebhookKeys(repoId, nextEnabledApiKeys);
    return nextEnabledApiKeys;
  } catch(e) {
    return null;
  }
}

export const IP_REGEX = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const getWebhookUrl = async (datasource: DataSource, repoId: string, id: string) => {
  try {
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(
      repoId
    );
    const webhook = enabledWebhookKeys.find(key => key.id == id);
    if (!webhook) {
      return null;
    }
    const webhookKeys = await datasource.readWebhookKeys();
    const webhookKey = webhookKeys?.find?.(key => key.id == webhook.webhookKeyId);
    if (!webhookKey) {
      return null;
    }

    let str = `${webhook?.protocol ?? "http"}://`;
    if (webhook.subdomain && !IP_REGEX.test(webhookKey?.domain)) {
      str += webhook.subdomain + ".";
    }
    str += webhookKey?.domain;
    if (webhook?.port) {
      str += ":" + webhook?.port;
    }
    return str + (webhook?.uri ?? "");
  } catch(e) {
    return null;
  }
}

export const getWebhookSecret = async (datasource: DataSource, repoId: string, id: string) => {
  try {
    const enabledWebhookKeys = await datasource.readRepoEnabledWebhookKeys(
      repoId
    );
    const webhook = enabledWebhookKeys.find(key => key.id == id);
    if (!webhook) {
      return null;
    }
    const webhookKeys = await datasource.readWebhookKeys();
    const webhookKey = webhookKeys?.find?.(key => key.id == webhook.webhookKeyId);
    if (!webhookKey) {
      return null;
    }
    return webhookKey.secret;
  } catch(e) {
    return null;
  }
}