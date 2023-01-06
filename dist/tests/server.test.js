"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MOCK_ICON = `
<?xml version="1.0" encoding="UTF-8"?>
<svg width="200px" height="200px" viewBox="0 0 200 200" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <polygon points="100,10 40,198 190,78 10,78 160,198" style="fill:lime;stroke:purple;stroke-width:5;fill-rule:nonzero;"/>
</svg>
`;
const server_1 = __importDefault(require("../src/server"));
const supertest_1 = __importDefault(require("supertest"));
const request = (0, supertest_1.default)(server_1.default);
jest.mock('fs');
jest.mock('fs/promises');
//describe('server', () => {
//
//    beforeAll(() => {
//       fs.mkdirSync(userHome, { recursive: true });
//       buildFloroFilestructure();
//       fs.writeFileSync(path.join(vCachePath, "star.svg"), MOCK_ICON, {
//         encoding: "utf8",
//       });
//    });
//
//    afterAll(() => {
//       vol.reset();
//    });
//
//    test('/ping returns PONG', async () => {
//        const response = await request.get('/ping');
//        expect(response.status).toEqual(200);
//        expect(response.text).toEqual("PONG")
//    });
//
//    test('/star.svg returns MOCK_ICON', async () => {
//        const response = await request.get('/star.svg');
//        expect(response.status).toEqual(200);
//        expect(response.body.toString()).toEqual(MOCK_ICON);
//    });
//    
//    //TODO: figure out how to test png 
//});
//
//# sourceMappingURL=server.test.js.map