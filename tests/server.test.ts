import path from 'path';
import { fs, vol } from 'memfs'; 

const MOCK_ICON =`
<?xml version="1.0" encoding="UTF-8"?>
<svg width="200px" height="200px" viewBox="0 0 200 200" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <polygon points="100,10 40,198 190,78 10,78 160,198" style="fill:lime;stroke:purple;stroke-width:5;fill-rule:nonzero;"/>
</svg>
`

import { 
    buildFloroFilestructure,
    userHome,
    vCachePath,
} from '../src/filestructure';

import server from '../src/server';
import supertest from 'supertest';
const request = supertest(server);

jest.mock('fs');
jest.mock('fs/promises');

describe('server', () => {

    beforeAll(() => {
       fs.mkdirSync(userHome, { recursive: true });
       buildFloroFilestructure();
       fs.writeFileSync(path.join(vCachePath, "star.svg"), MOCK_ICON, {
         encoding: "utf8",
       });
    });

    afterAll(() => {
       vol.reset();
    });

    test('/ping returns PONG', async () => {
        const response = await request.get('/ping');
        expect(response.status).toEqual(200);
        expect(response.text).toEqual("PONG")
    });

    test('/star.svg returns MOCK_ICON', async () => {
        const response = await request.get('/star.svg');
        expect(response.status).toEqual(200);
        expect(response.body.toString()).toEqual(MOCK_ICON);
    });
});
