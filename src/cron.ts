import {
  getRemoteHostAsync,
  getUserSessionAsync,
  writeUser,
  writeUserSession,
} from "./filestructure";
import axios from "axios";
import { broadcastAllDevices } from "./multiplexer";

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
const HOUR_MS = 1000 * 60;

export const startSessionJob = () => {
  const sessionTest = async () => {
    try {
      const currentSession = await getUserSessionAsync();
      if (!currentSession) {
        return;
      }
      const expiresAt = new Date(currentSession.expiresAt);
      const expiresAtMS = expiresAt.getTime();
      const nowMS = new Date().getTime();
      const delta = expiresAtMS - nowMS;
      if (delta > ONE_WEEK) {
        const remote = await getRemoteHostAsync();
        const response = await axios.post(
          `${remote}/api/session/exchange`,
          {},
          {
            headers: {
              ["session_key"]: currentSession?.clientKey,
            },
          }
        );
        if (response.status == 200) {
          await writeUserSession(response.data.exchangeSession);
          await writeUser(response.data.exchangeSession.user);
          broadcastAllDevices("session_updated", response.data);
        }
      }
    } catch (e) {
      //log nothing
    }
  }
  setInterval(sessionTest, HOUR_MS);
  sessionTest();
};
