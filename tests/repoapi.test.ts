import { fs, vol } from 'memfs'; 
import { 
    buildFloroFilestructure,
    userHome,
    homePath,
    vConfigPath,
    vCachePath,
    vUserPath,
    vReposPath,
    vPluginsPath,
    vTMPPath,
    vConfigCORSPath,
    vConfigRemotePath,
    getUserAsync
} from '../src/filestructure';
import { getRepoBranches, readRepoDescription, readRepoLicenses, repoExists, writeRepoDescription, writeRepoLicenses } from '../src/repoapi';
import { createBlankRepo, makeSignedInUser } from './helpers/fsmocks';

jest.mock('fs');
jest.mock('fs/promises');

describe('repoapi', () => {

    beforeEach(async () => {
       fs.mkdirSync(userHome, { recursive: true });
       buildFloroFilestructure();
       await makeSignedInUser();
       createBlankRepo('abc');
    });

    afterEach(() => {
       vol.reset();
    });

    describe('repoExists', () => {
        test('returns true when exists', async () => {
            const exist = await repoExists('abc');
            expect(exist).toBe(true);
        });

        test('returns false when does not exists', async () => {
            const exist = await repoExists('def');
            expect(exist).toBe(false);
        });
    });

    describe('description', () => {

        test('updates repo description', async () => {
            let description = (await readRepoDescription('abc')).join("");
            expect(description).toEqual("");
            description = 'Initial description.'
            description = (await writeRepoDescription('abc', description)).join("");
            expect(description).toEqual('Initial description.');
            description = (await readRepoDescription('abc')).join("");
            expect(description).toEqual('Initial description.');
            description = 'Initial description. Updated'
            description = (await writeRepoDescription('abc', description)).join("");
            expect(description).toEqual('Initial description. Updated');
            description = (await readRepoDescription('abc')).join("");
            expect(description).toEqual('Initial description. Updated');
        });
    });

    describe('licenses', () => {

        test('updates repo licenses', async () => {
            let licenses = (await readRepoLicenses('abc'));
            expect(licenses).toEqual([])
            licenses = [
              {
                key: "gnu_general_public_3",
                value: "GNU General Public License v3.0",
              },
              {
                key: "mit",
                value: "MIT License",
              },
            ];
            licenses = (await writeRepoLicenses('abc', licenses));
            expect(licenses).toEqual([
              {
                key: "gnu_general_public_3",
                value: "GNU General Public License v3.0",
              },
              {
                key: "mit",
                value: "MIT License",
              },
            ]);
            licenses = (await readRepoLicenses('abc'));
            expect(licenses).toEqual([
              {
                key: "gnu_general_public_3",
                value: "GNU General Public License v3.0",
              },
              {
                key: "mit",
                value: "MIT License",
              },
            ]);
            licenses = [
              {
                key: "mit",
                value: "MIT License",
              },
            ];
            licenses = (await writeRepoLicenses('abc', licenses));
            expect(licenses).toEqual([
              {
                key: "mit",
                value: "MIT License",
              },
            ]);
            licenses = (await readRepoLicenses('abc'));
            expect(licenses).toEqual([
              {
                key: "mit",
                value: "MIT License",
              },
            ]);
        });
    });
});