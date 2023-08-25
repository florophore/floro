import { createHmac } from "crypto";
import { DataSource } from "./datasource";
import { getWebhookSecret, getWebhookUrl } from "./apikeys";
import axios from "axios";
import { Branch } from "./repo";

const DEBOUNCE_TIME = 300;

export interface WebhookEvent {
  repositoryId: string;
  eventId: string;
  eventName: string;
  payload: object;
}

class WebhookQueue {
  public static instance: WebhookQueue;
  public events: {
    [key: string]: NodeJS.Timer;
  };

  constructor() {
    this.events = {};
  }

  static make() {
    if (this.instance) {
      return this.instance;
    }
    this.instance = new WebhookQueue();
    return this.instance;
  }

  public addEvent(event: WebhookEvent, datasource: DataSource) {
    if (this.events[event.eventId] !== undefined) {
      clearTimeout(this.events[event.eventId]);
      delete this.events[event.eventId];
      this.events[event.eventId] = setTimeout(async () => {
        try {
          delete this.events[event.eventId];
          const webhookKeys = await datasource.readWebhookKeys();
          const enabledWebhooks = await datasource.readRepoEnabledWebhookKeys(
            event.repositoryId
          );
          for (const enabledWebhook of enabledWebhooks) {
            const webhookKey = webhookKeys.find(
              (k) => k.id == enabledWebhook.webhookKeyId
            );
            if (!webhookKey) {
              continue;
            }
            const url = await getWebhookUrl(
              datasource,
              event.repositoryId,
              enabledWebhook.webhookKeyId
            );
            const secret = await getWebhookSecret(
              datasource,
              event.repositoryId,
              enabledWebhook.webhookKeyId
            );

            const jsonPayload = JSON.stringify({
              event: event.eventName,
              repositoryId: event.repositoryId,
              payload: event.payload,
            });
            const hmac = createHmac("sha256", secret);
            const signature =
              "sha256=" + hmac.update(jsonPayload).digest("hex");
            const attempt = async () => {
              try {
                const result = await axios({
                  method: "post",
                  url,
                  headers: {
                    "Content-Type": "application/json",
                    "Floro-Signature-256": signature,
                  },
                  data: jsonPayload,
                  timeout: 5000,
                });
                return result.status >= 200 && result.status < 300;
              } catch (e) {
                return false;
              }
            };

            for (let i = 0; i < 3; ++i) {
              const isOkay = await attempt();
              if (isOkay) {
                break;
              }
              // back off 1s
              await new Promise((resolve) => {
                setTimeout(() => resolve(true), 1000);
              });
            }
            console.error("Failed to send webhook event to " + url);
          }
        } catch (e) {}
      }, DEBOUNCE_TIME);
    }
  }

  public addBranchUpdate(
    datasource: DataSource,
    repositoryId: string,
    branch: Branch
  ) {
    this.addEvent(
      {
        eventId: `${repositoryId}:${branch.id}:branch.updated`,
        eventName: "branch.updated",
        repositoryId,
        payload: {
          branch,
        },
      },
      datasource
    );
  }
}

export default WebhookQueue.make();
