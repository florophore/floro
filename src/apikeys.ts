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
  const nextKeys = keys.filter((k) => k.id != id);
  const result = await datasource.writeWebhookKeys(nextKeys);
  if (result) {
    return nextKeys;
  }
  return null;
};
