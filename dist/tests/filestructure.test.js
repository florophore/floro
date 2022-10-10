"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const memfs_1 = require("memfs");
const filestructure_1 = require("../src/filestructure");
jest.mock('fs');
describe('buildFloroFilestructure', () => {
    beforeEach(() => {
        memfs_1.fs.mkdirSync(filestructure_1.userHome, { recursive: true });
    });
    afterEach(() => {
        memfs_1.vol.reset();
    });
    test('it creates floro file structure', async () => {
        memfs_1.vol.fromJSON({}, filestructure_1.userHome);
        expect(memfs_1.fs.existsSync(filestructure_1.homePath)).toBe(false);
        expect(memfs_1.fs.existsSync(filestructure_1.vConfigPath)).toBe(false);
        expect(memfs_1.fs.existsSync(filestructure_1.vCachePath)).toBe(false);
        expect(memfs_1.fs.existsSync(filestructure_1.vUserPath)).toBe(false);
        expect(memfs_1.fs.existsSync(filestructure_1.vProjectsPath)).toBe(false);
        await (0, filestructure_1.buildFloroFilestructure)();
        expect(memfs_1.fs.existsSync(filestructure_1.homePath)).toBe(true);
        expect(memfs_1.fs.existsSync(filestructure_1.vConfigPath)).toBe(true);
        expect(memfs_1.fs.existsSync(filestructure_1.vCachePath)).toBe(true);
        expect(memfs_1.fs.existsSync(filestructure_1.vUserPath)).toBe(true);
        expect(memfs_1.fs.existsSync(filestructure_1.vProjectsPath)).toBe(true);
    });
});
//# sourceMappingURL=filestructure.test.js.map