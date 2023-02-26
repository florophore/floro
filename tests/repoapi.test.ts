import { fs, vol } from "memfs";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import { Manifest, PluginElement, readPluginManifest } from "../src/plugins";
import { buildStateStore, getCurrentBranch, getCurrentState, getMergedCommitState, getRepoState, updateCurrentWithNewBranch } from "../src/repo";
import {
  checkoutBranch,
  checkoutSha,
  mergeCommit,
  readBranchHistory,
  readCommitState,
  readCurrentHistory,
  readCurrentState,
  readRepoCommit,
  readRepoDescription,
  readRepoLicenses,
  repoExists,
  switchRepoBranch,
  updatePlugins,
  updatePluginState,
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
      let description = (await getRepoState("abc", getCurrentState)).description.join("");
      expect(description).toEqual("");
      description = "Initial description.";
      description = (await writeRepoDescription("abc", description)).description.join("");
      expect(description).toEqual("Initial description.");
      description = (await readCurrentState("abc")).description.join("");
      expect(description).toEqual("Initial description.");
      description = "Initial description. Updated";
      description = (await writeRepoDescription("abc", description)).description.join("");
      expect(description).toEqual("Initial description. Updated");
      description = (await readCurrentState("abc")).description.join("");
      expect(description).toEqual("Initial description. Updated");
    });
  });

  describe("licenses", () => {
    test("updates repo licenses", async () => {
      let licenses = await (await readCurrentState("abc")).licenses;
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
      licenses = (await writeRepoLicenses("abc", licenses)).licenses;
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
      licenses = (await readCurrentState("abc")).licenses;
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
      licenses = (await writeRepoLicenses("abc", licenses)).licenses;
      expect(licenses).toEqual([
        {
          key: "mit",
          value: "MIT License",
        },
      ]);
      licenses = (await readCurrentState("abc")).licenses;
      expect(licenses).toEqual([
        {
          key: "mit",
          value: "MIT License",
        },
      ]);
    });
  });

  describe("update plugins", () => {
    test("adds upstream plugins", async () => {
      const PLUGIN_A_MANIFEST: Manifest = {
        name: "A",
        version: "1.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          aSet: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "string",
              },
              secondKey: {
                type: "string",
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
        name: "B",
        version: "0.0.0",
        displayName: "B",
        icon: "",
        imports: {
          "A": "1.0.0"
        },
        types: {},
        store: {
          aSet: {
            type: "set",
            values: {
              bnKey: {
                isKey: true,
                type: "string",
              },
              aRef: {
                type: "ref<$(A).store.values>",
              },
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_B_MANIFEST);
      let plugins: PluginElement[] = [
        {
          key: "B",
          value: "0.0.0"
        }
      ];
      const result = await updatePlugins("abc", plugins, readPluginManifest);
      expect(result).toEqual({
        description: [],
        licenses: [],
        plugins: [
          {
            key: "A",
            value: "1.0.0",
          },
          {
            key: "B",
            value: "0.0.0",
          },
        ],
        store: {
          A: {},
          B: {},
        },
        binaries: [],
      });
    });

    test("reject upstream plugins when schemas are incompatible", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          aSet: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "string",
              },
              oldProp: {
                type: "string",
              },
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);

      const PLUGIN_A_1_MANIFEST: Manifest = {
        name: "A",
        version: "1.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          aSet: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "string",
              },
              replacementProp: {
                type: "int",
              },
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
        name: "B",
        version: "0.0.0",
        displayName: "B",
        icon: "",
        imports: {
          "A": "0.0.0"
        },
        types: {},
        store: {
          bSet: {
            type: "set",
            values: {
              bnKey: {
                isKey: true,
                type: "string",
              },
              aRef: {
                type: "ref<$(A).aSet.values>",
              },
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_B_MANIFEST);
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "1.0.0"
        },
        {
          key: "B",
          value: "0.0.0"
        }
      ];
      const result = await updatePlugins("abc", plugins, readPluginManifest);
      expect(result).toEqual(null);
    });
  });

  describe("update plugin state", () => {
    test("can update plugin state", async () => {
      const PLUGIN_A_0_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          aSet: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "string",
              },
              someProp: {
                type: "int",
              },
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state = {
        aSet: [
          {
            mainKey: "key1",
            someProp: 1,
          },
          {
            mainKey: "key2",
            someProp: 2,
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0"
        },
      ];
      await updatePlugins("abc", plugins, readPluginManifest);
      const result = await updatePluginState(
        "abc",
        "A",
        state,
        readPluginManifest
      );
      expect(result).toEqual({
        description: [],
        licenses: [],
        plugins: [
          {
            key: "A",
            value: "0.0.0",
          },
        ],
        store: {
          A: {
            aSet: [
              {
                mainKey: "key1",
                someProp: 1,
              },
              {
                mainKey: "key2",
                someProp: 2,
              },
            ],
          },
        },
        binaries: [],
      });
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

  describe("merge", () => {

    test.only("creates a new commit if can automerge", async () => {
      let description = (await readRepoDescription("abc")).join("");
      expect(description).toEqual("");
      const PLUGIN_A_0_MANIFEST: Manifest = {
        name: "A",
        version: "0.0.0",
        displayName: "A",
        icon: "",
        imports: {},
        types: {},
        store: {
          aSet: {
            type: "set",
            values: {
              mainKey: {
                isKey: true,
                type: "string",
              },
              someProp: {
                value: {
                  type: "int",
                }
              },
            }
          }
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state1 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4
            },
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0"
        },
      ];
      await updatePlugins("abc", plugins, readPluginManifest);
      await updatePluginState(
        "abc",
        "A",
        state1,
        readPluginManifest
      );
      await writeRepoDescription("abc", "Testing the waters");
      const commitA = await writeRepoCommit("abc", "A");
      console.log("CA", commitA);

      const state2 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4
            },
          },
        ],
      };
      await updatePluginState(
        "abc",
        "A",
        state2,
        readPluginManifest
      );
      const commitB = await writeRepoCommit("abc", "B");
      await checkoutSha("abc", commitA.sha);
      await switchRepoBranch("abc", "new-branch");

      const state3 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36
            },
          },
          {
            mainKey: "key5",
            someProp: {
              value: 5
            },
          },
        ],
      };
      await updatePluginState(
        "abc",
        "A",
        state3,
        readPluginManifest,
      );
      const commitC = await writeRepoCommit("abc", "C");

      const state4 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36
            },
          },
        ],
      };
      await updatePluginState(
        "abc",
        "A",
        state4,
        readPluginManifest,
      );
      const commitD = await writeRepoCommit("abc", "D");

      const state5 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36
            },
          },
          {
            mainKey: "key7",
            someProp: {
              value: 7
            },
          },
        ],
      };
      await updatePluginState(
        "abc",
        "A",
        state5,
        readPluginManifest,
      );
      console.log("WTF", commitB.sha)
      const out = await mergeCommit(
        "abc",
        commitB.sha,
        readPluginManifest,
      );
      console.log("OUT", JSON.stringify(out, null, 2));
      //const canAutoMergeWithCS = await canAutoMergeOnTopCurrentState(
      //  "abc",
      //  commitB.sha,
      //  readPluginManifest
      //);
      //const yourMergeState = await getMergedCommitState(
      //  "abc",
      //  commitB.sha,
      //  commitC.sha,
      //  readPluginManifest,
      //  "yours"
      //);
      //const theirMergeState = await getMergedCommitState(
      //  "abc",
      //  commitB.sha,
      //  commitC.sha,
      //  readPluginManifest,
      //  "theirs"
      //);

      //const isAutoMergeable = await canAutoMergeShas(
      //  "abc",
      //  commitB.sha,
      //  commitC.sha,
      //  readPluginManifest
      //);
      //console.log("IS AUTO MERGEABLE", isAutoMergeable)
      //console.log("WTF 0", JSON.stringify(state1, null, 2));
      //console.log("WTF 2", JSON.stringify(state2, null, 2));
      //console.log("WTF 3", JSON.stringify(state3, null, 2));
      //console.log("Y", JSON.stringify(await buildStateStore(yourMergeState, readPluginManifest), null, 2));
      //console.log("T", JSON.stringify(await buildStateStore(theirMergeState, readPluginManifest), null, 2));
    });

  });
});
