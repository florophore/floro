import { fs, vol } from "memfs";
import { makeMemoizedDataSource } from "../src/datasource";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import { Manifest, PluginElement, readPluginManifest } from "../src/plugins";
import { buildStateStore, getCurrentBranch, getMergedCommitState, getRepoState, updateCurrentWithNewBranch } from "../src/repo";
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

  describe("description", () => {
    test("updates repo description", async () => {
      const datasource = makeMemoizedDataSource();
      let description = (await getRepoState(datasource, "abc")).description.join("");
      expect(description).toEqual("");
      description = "Initial description.";
      description = (await writeRepoDescription(datasource, "abc", description)).description.join("");
      expect(description).toEqual("Initial description.");
      description = (await readCurrentState(datasource, "abc")).description.join("");
      expect(description).toEqual("Initial description.");
      description = "Initial description. Updated";
      description = (await writeRepoDescription(datasource, "abc", description)).description.join("");
      expect(description).toEqual("Initial description. Updated");
      description = (await readCurrentState(datasource, "abc")).description.join("");
      expect(description).toEqual("Initial description. Updated");
    });
  });

  describe("licenses", () => {
    test("updates repo licenses", async () => {
      const datasource = makeMemoizedDataSource();
      let licenses = await (await readCurrentState(datasource, "abc")).licenses;
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
      licenses = (await writeRepoLicenses(datasource, "abc", licenses)).licenses;
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
      licenses = (await readCurrentState(datasource, "abc")).licenses;
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
      licenses = (await writeRepoLicenses(datasource, "abc", licenses)).licenses;
      expect(licenses).toEqual([
        {
          key: "mit",
          value: "MIT License",
        },
      ]);
      licenses = (await readCurrentState(datasource, "abc")).licenses;
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
      const datasource = makeMemoizedDataSource();
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
      const result = await updatePlugins(datasource, "abc", plugins);
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
      const datasource = makeMemoizedDataSource();
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
      const result = await updatePlugins(datasource, "abc", plugins);
      expect(result).toEqual(null);
    });
  });

  describe("update plugin state", () => {
    test("can update plugin state", async () => {
      const datasource = makeMemoizedDataSource();
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
      await updatePlugins(datasource, "abc", plugins);
      const result = await updatePluginState(
        datasource,
        "abc",
        "A",
        state
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
      const datasource = makeMemoizedDataSource();
      let description = (await readRepoDescription(datasource, "abc")).join("");
      expect(description).toEqual("");
      const descriptionA = "Initial description.";
      await writeRepoDescription(datasource,"abc", descriptionA);
      const commitA = await writeRepoCommit(datasource, "abc", "A");
      const descriptionB = "Another description. Initial description. Description 2!";
      await writeRepoDescription(datasource,"abc", descriptionB);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      const readCommitA = await readCommitState(datasource, 'abc', commitA.sha);
      const readCommitB = await readCommitState(datasource, 'abc', commitB.sha);
      expect(descriptionA).toEqual(readCommitA.description.join(""));
      expect(descriptionB).toEqual(readCommitB.description.join(""));
    });

    test("refuses empty commit", async () => {
      const datasource = makeMemoizedDataSource();
      let description = (await readRepoDescription(datasource, "abc")).join("");
      expect(description).toEqual("");
      const descriptionA = "Initial description.";
      await writeRepoDescription(datasource, "abc", descriptionA);
      await writeRepoCommit(datasource, "abc", "A");
      const descriptionB = "Initial description.";
      await writeRepoDescription(datasource, "abc", descriptionB);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      expect(commitB).toEqual(null);
    });

  });

  describe("merge", () => {

    test("creates a new commit if can automerge", async () => {
      const datasource = makeMemoizedDataSource();
      let description = (await readRepoDescription(datasource, "abc")).join("");
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
      await updatePlugins(datasource, "abc", plugins);
      await updatePluginState(
        datasource,
        "abc",
        "A",
        state1
      );
      await writeRepoDescription(datasource, "abc", "Testing the waters");
      const commitA = await writeRepoCommit(datasource, "abc", "A");

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
        datasource,
        "abc",
        "A",
        state2
      );
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      await checkoutSha(datasource, "abc", commitA.sha);
      await switchRepoBranch(datasource, "abc", "new-branch");

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
        datasource,
        "abc",
        "A",
        state3
      );
      const commitC = await writeRepoCommit(datasource, "abc", "C");

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
        datasource,
        "abc",
        "A",
        state4
      );
      const commitD = await writeRepoCommit(datasource, "abc", "D");

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
        datasource,
        "abc",
        "A",
        state5,
      );
      console.log("WTF", commitB.sha)
      const out = await mergeCommit(
        datasource,
        "abc",
        commitB.sha
      );
      console.log("OUT", JSON.stringify(out, null, 2));
    });

  });
});
