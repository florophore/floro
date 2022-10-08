import { fs, vol } from 'memfs'; 

import { 
    buildFloroFilestructure,
    userHome,
    homePath,
    vCachePath,
    vUserPath,
    vProjectsPath
} from '../src/filestructure';

jest.mock('fs');

describe('buildFloroFilestructure', () => {

    beforeEach(() => {
       fs.mkdirSync(userHome, { recursive: true });
    });

    afterEach(() => {
       vol.reset();
    });

    test('it creates floro file structure', async () => {
        vol.fromJSON(
            {},
            userHome
        );
        expect(fs.existsSync(homePath)).toBe(false);
        expect(fs.existsSync(vCachePath)).toBe(false);
        expect(fs.existsSync(vUserPath)).toBe(false);
        expect(fs.existsSync(vProjectsPath)).toBe(false);

        await buildFloroFilestructure();

        expect(fs.existsSync(homePath)).toBe(true);
        expect(fs.existsSync(vCachePath)).toBe(true);
        expect(fs.existsSync(vUserPath)).toBe(true);
        expect(fs.existsSync(vProjectsPath)).toBe(true);
    });
})