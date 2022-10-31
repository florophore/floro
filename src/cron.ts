import cron from 'node-cron';
import { getRemoteHostAsync, getUserSession, getUserSessionAsync, writeUser, writeUserSession } from './filestructure';
import axios from 'axios';
import { broadcastAllDevices } from './multiplexer';

const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
// use for debugging
const MINUTE_CRON = "* * * * *"; 
const HOUR_CRON = "0 * * * *"; 

export const startSessionJob = () => {
    cron.schedule(HOUR_CRON, async () => {
        try {
            const currentSession = await getUserSessionAsync();
            if (!currentSession) {
                return;
            }
            const expiresAt = new Date(currentSession.expiresAt);
            const expiresAtMS = expiresAt.getTime();
            const nowMS = (new Date()).getTime();
            const delta = (expiresAtMS - nowMS);
            if (delta > ONE_WEEK || true) {
                const remote = await getRemoteHostAsync();
                const response = await axios.post(`${remote}/api/session/exchange`, {}, {
                    headers: {
                        ['session_key']: currentSession?.clientKey
                    }
                });
                if (response.status == 200) {
                    await writeUserSession(response.data.session);
                    await writeUser(response.data.user);
                    broadcastAllDevices("session_updated", response.data);
                }
            }
        } catch (e) {
            //log nothing
        }
    });
}