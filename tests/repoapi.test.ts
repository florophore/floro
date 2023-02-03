import { fs, vol } from "memfs";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import { Manifest, PluginElement } from "../src/plugins";
import {
  readCommitState,
  readCurrentHistory,
  readRepoCommit,
  readRepoDescription,
  readRepoLicenses,
  repoExists,
  updatePlugins,
  writeRepoCommit,
  writeRepoDescription,
  writeRepoLicenses,
} from "../src/repoapi";
import { createBlankRepo, makeSignedInUser, makeTestPlugin } from "./helpers/fsmocks";

jest.mock("fs");
jest.mock("fs/promises");

describe("repoapi", () => {
  beforeEach(async () => {
    fs.mkdirSync(userHome, { recursive: true });
    buildFloroFilestructure();
    await makeSignedInUser();
    createBlankRepo("abc");
  });

  afterEach(() => {
    vol.reset();
  });

  describe("repoExists", () => {
    test("returns true when exists", async () => {
      const exist = await repoExists("abc");
      expect(exist).toBe(true);
    });

    test("returns false when does not exists", async () => {
      const exist = await repoExists("def");
      expect(exist).toBe(false);
    });
  });

  describe("description", () => {
    test("updates repo description", async () => {
      let description = (await readRepoDescription("abc")).join("");
      expect(description).toEqual("");
      description = "Initial description.";
      description = (await writeRepoDescription("abc", description)).join("");
      expect(description).toEqual("Initial description.");
      description = (await readRepoDescription("abc")).join("");
      expect(description).toEqual("Initial description.");
      description = "Initial description. Updated";
      description = (await writeRepoDescription("abc", description)).join("");
      expect(description).toEqual("Initial description. Updated");
      description = (await readRepoDescription("abc")).join("");
      expect(description).toEqual("Initial description. Updated");
    });
  });

  describe("licenses", () => {
    test("updates repo licenses", async () => {
      let licenses = await readRepoLicenses("abc");
      expect(licenses).toEqual([]);
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
      licenses = await writeRepoLicenses("abc", licenses);
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
      licenses = await readRepoLicenses("abc");
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
      licenses = await writeRepoLicenses("abc", licenses);
      expect(licenses).toEqual([
        {
          key: "mit",
          value: "MIT License",
        },
      ]);
      licenses = await readRepoLicenses("abc");
      expect(licenses).toEqual([
        {
          key: "mit",
          value: "MIT License",
        },
      ]);
    });
  });

  describe("update plugins", () => {
    test.only("adds upstream plugins", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "1.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          mainKey: {
            isKey: true,
            type: "string",
          },
          secondKey: {
            type: "string",
          },
        },
      };
      makeTestPlugin(PLUGIN_A_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
        name: "B",
        version: "0.0.0",
        displayName: "B",
        icon: "",
        imports: {},
        types: {},
        store: {
          bnKey: {
            isKey: true,
            type: "string",
          },
          aRef: {
            type: "ref<$(A).store.values>",
          },
        },
      };
      makeTestPlugin(PLUGIN_B_MANIFEST);
      let plugins: PluginElement[] = [
        {
          key: "B",
          value: "0.0.0"
        }
      ];
      const result = await updatePlugins("abc", plugins);
      console.log(JSON.stringify(result, null, 2));
    });
  });

  describe("commits", () => {
    test("description can commit", async () => {
      let description = (await readRepoDescription("abc")).join("");
      expect(description).toEqual("");
      const descriptionA = "Initial description.";
      await writeRepoDescription("abc", descriptionA);
      const commitA = await writeRepoCommit("abc", "A");
      const descriptionB = "Another description. Initial description. Description 2!";
      await writeRepoDescription("abc", descriptionB);
      const commitB = await writeRepoCommit("abc", "B");
      const readCommitA = await readCommitState('abc', commitA.sha);
      const readCommitB = await readCommitState('abc', commitB.sha);
      expect(descriptionA).toEqual(readCommitA.description.join(""));
      expect(descriptionB).toEqual(readCommitB.description.join(""));
    });

    test("refuses empty commit", async () => {
      let description = (await readRepoDescription("abc")).join("");
      expect(description).toEqual("");
      const descriptionA = "Initial description.";
      await writeRepoDescription("abc", descriptionA);
      await writeRepoCommit("abc", "A");
      const descriptionB = "Initial description.";
      await writeRepoDescription("abc", descriptionB);
      const commitB = await writeRepoCommit("abc", "B");
      expect(commitB).toEqual(null);
    });
  });
});
