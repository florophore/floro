import { fs, vol } from "memfs";
import sizeof from "object-sizeof";
import {
  DataSource,
  makeDataSource,
  makeMemoizedDataSource,
} from "../src/datasource";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import { Manifest, PluginElement } from "../src/plugins";
import {
  getHistory,
  getApplicationState,
  getCurrentCommitSha,
  getCommitState,
  convertCommitStateToRenderedState,
  convertStateStoreToKV,
} from "../src/repo";
import {
  checkoutSha,
  readCommitState,
  readCurrentState,
  readRepoDescription,
  switchRepoBranch,
  updatePlugins,
  updatePluginState,
  writeRepoCommit,
  writeRepoDescription,
  writeRepoLicenses,
  mergeCommit,
  getCurrentRepoBranch,
  updateMergeDirection,
  abortMerge,
  resolveMerge,
  readLastCommit,
  revertCommit,
  autofixReversion,
} from "../src/repoapi";
import {
  createBlankRepo,
  makeSignedInUser,
  makeTestPlugin,
} from "./helpers/fsmocks";

jest.mock("fs");
jest.mock("fs/promises");

describe("repoapi", () => {
  let datasource: DataSource;
  beforeEach(async () => {
    fs.mkdirSync(userHome, { recursive: true });
    buildFloroFilestructure();
    await makeSignedInUser();
    createBlankRepo("abc");
    datasource = makeDataSource();
  });

  afterEach(() => {
    vol.reset();
  });

  describe("description", () => {
    test("updates repo description", async () => {
      let description = (
        await getApplicationState(datasource, "abc")
      ).description.join("");
      expect(description).toEqual("");
      description = "Initial description.";
      description = (
        await writeRepoDescription(datasource, "abc", description)
      ).description.join("");
      expect(description).toEqual("Initial description.");
      description = (
        await readCurrentState(datasource, "abc")
      ).description.join("");
      expect(description).toEqual("Initial description.");
      description = "Initial description. Updated";
      description = (
        await writeRepoDescription(datasource, "abc", description)
      ).description.join("");
      expect(description).toEqual("Initial description. Updated");
      description = (
        await readCurrentState(datasource, "abc")
      ).description.join("");
      expect(description).toEqual("Initial description. Updated");
    });
  });

  describe("licenses", () => {
    test("updates repo licenses", async () => {
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
      licenses = (await writeRepoLicenses(datasource, "abc", licenses))
        .licenses;
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
      licenses = (await writeRepoLicenses(datasource, "abc", licenses))
        .licenses;
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
          A: "1.0.0",
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
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_B_MANIFEST);
      let plugins: PluginElement[] = [
        {
          key: "B",
          value: "0.0.0",
        },
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
            },
          },
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
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_1_MANIFEST);

      const PLUGIN_B_MANIFEST: Manifest = {
        name: "B",
        version: "0.0.0",
        displayName: "B",
        icon: "",
        imports: {
          A: "0.0.0",
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
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_B_MANIFEST);
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "1.0.0",
        },
        {
          key: "B",
          value: "0.0.0",
        },
      ];
      const result = await updatePlugins(datasource, "abc", plugins);
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
            },
          },
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
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);
      const result = await updatePluginState(datasource, "abc", "A", state);
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
      let description = (await readRepoDescription(datasource, "abc")).join("");
      expect(description).toEqual("");
      const descriptionA = "Initial description.";
      await writeRepoDescription(datasource, "abc", descriptionA);
      const commitA = await writeRepoCommit(datasource, "abc", "A");
      const descriptionB =
        "Another description. Initial description. Description 2!";
      await writeRepoDescription(datasource, "abc", descriptionB);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      const readCommitA = await readCommitState(datasource, "abc", commitA.sha);
      const readCommitB = await readCommitState(datasource, "abc", commitB.sha);
      expect(descriptionA).toEqual(readCommitA.description.join(""));
      expect(descriptionB).toEqual(readCommitB.description.join(""));
    });

    test("refuses empty commit", async () => {
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

  describe("benchmark", () => {
    test.skip("commit benchmark", async () => {
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
                type: "float",
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);

      let lastCom;
      for (let i = 0; i < 3; ++i) {
        const state = {
          aSet: [],
        };
        for (let j = 0; j < 400_000; ++j) {
          state.aSet.push({
            mainKey: "key" + j,
            someProp: 100,
          });
        }
        for (let k = 0; k < 100; ++k) {
          const index = Math.round((400_000 - 1) * Math.random());
          state.aSet[index].someProp = k * 10;
        }

        console.time("UPDATE" + i);
        await updatePluginState(datasource, "abc", "A", state);
        console.timeEnd("UPDATE" + i);
        console.time("COMMIT" + i);
        lastCom = await writeRepoCommit(datasource, "abc", "commit: " + i);
        console.timeEnd("COMMIT" + i);
      }

      console.time("TEST");
      const a = await getApplicationState(datasource, "abc");
      console.timeEnd("TEST");
    });
  });

  describe("merge", () => {
    test("creates a new commit if can automerge", async () => {
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
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state1 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);
      await updatePluginState(datasource, "abc", "A", state1);
      const commitA = await writeRepoCommit(datasource, "abc", "A");

      const state2 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state2);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      await checkoutSha(datasource, "abc", commitA.sha);
      await switchRepoBranch(datasource, "abc", "feature-branch");

      const state3 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36,
            },
          },
          {
            mainKey: "key5",
            someProp: {
              value: 5,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state3);
      await writeRepoCommit(datasource, "abc", "C");
      const state4 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state4);
      await writeRepoCommit(datasource, "abc", "D");

      const state5 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36,
            },
          },
          {
            mainKey: "key7",
            someProp: {
              value: 7,
            },
          },
        ],
      };

      await updatePluginState(datasource, "abc", "A", state5);

      const mergeStateOut = await mergeCommit(datasource, "abc", commitB.sha);
      const mergeSha = await getCurrentCommitSha(datasource, "abc");

      const commitE = await writeRepoCommit(datasource, "abc", "E");
      const eState = await getCommitState(datasource, "abc", commitE.sha);
      const eStateRendered = await convertCommitStateToRenderedState(
        datasource,
        eState
      );

      await switchRepoBranch(datasource, "abc", "main");
      const mainMergeOut = await mergeCommit(datasource, "abc", mergeSha);
      const mainMergedSha = await getCurrentCommitSha(datasource, "abc");

      expect(eStateRendered).toEqual(mergeStateOut);

      const mainMergeState = await getCommitState(
        datasource,
        "abc",
        mainMergedSha
      );
      const mainMergeRendered = await convertCommitStateToRenderedState(
        datasource,
        mainMergeState
      );
      expect(mainMergeOut).toEqual(mainMergeRendered);
    });

    test("creates a conflict if cant automerge and aborts", async () => {
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
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state1 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);
      await updatePluginState(datasource, "abc", "A", state1);
      const commitA = await writeRepoCommit(datasource, "abc", "A");

      const state2 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
          {
            mainKey: "key5",
            someProp: {
              value: 5,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state2);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      await checkoutSha(datasource, "abc", commitA.sha);
      await switchRepoBranch(datasource, "abc", "feature-branch");

      const state3 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 12,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state3);
      const commitC = await writeRepoCommit(datasource, "abc", "C");
      const originalStateOut = await mergeCommit(
        datasource,
        "abc",
        commitB.sha
      );
      const theirStateOut = await updateMergeDirection(
        datasource,
        "abc",
        "theirs"
      );
      const yourStateOut = await updateMergeDirection(
        datasource,
        "abc",
        "yours"
      );
      expect(originalStateOut).toEqual(yourStateOut);
      expect(yourStateOut).toEqual({
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
                mainKey: "key0",
                someProp: {
                  value: 0,
                },
              },
              {
                mainKey: "key1",
                someProp: {
                  value: 1,
                },
              },
              {
                mainKey: "key1a",
                someProp: {
                  value: 12,
                },
              },
              {
                mainKey: "key3",
                someProp: {
                  value: 3,
                },
              },
              {
                mainKey: "key4",
                someProp: {
                  value: 4,
                },
              },
              {
                mainKey: "key5",
                someProp: {
                  value: 5,
                },
              },
            ],
          },
        },
        binaries: [],
      });
      expect(theirStateOut).toEqual({
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
                mainKey: "key0",
                someProp: {
                  value: 0,
                },
              },
              {
                mainKey: "key1",
                someProp: {
                  value: 1,
                },
              },
              {
                mainKey: "key1a",
                someProp: {
                  value: 11,
                },
              },
              {
                mainKey: "key3",
                someProp: {
                  value: 3,
                },
              },
              {
                mainKey: "key4",
                someProp: {
                  value: 4,
                },
              },
              {
                mainKey: "key5",
                someProp: {
                  value: 5,
                },
              },
            ],
          },
        },
        binaries: [],
      });
      const abortedMerge = await abortMerge(datasource, "abc");
      const cState = await getCommitState(datasource, "abc", commitC.sha);
      const cStateRendered = await convertCommitStateToRenderedState(
        datasource,
        cState
      );
      expect(cStateRendered).toEqual(abortedMerge);
    });

    test("creates a conflict and can resolve", async () => {
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
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state1 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);
      await updatePluginState(datasource, "abc", "A", state1);
      const commitA = await writeRepoCommit(datasource, "abc", "A");

      const state2 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
          {
            mainKey: "key5",
            someProp: {
              value: 5,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state2);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      await checkoutSha(datasource, "abc", commitA.sha);
      await switchRepoBranch(datasource, "abc", "feature-branch");

      const state3 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 12,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state3);
      await writeRepoCommit(datasource, "abc", "C");
      await mergeCommit(datasource, "abc", commitB.sha);
      await updateMergeDirection(datasource, "abc", "theirs");
      const resolvedOut = await resolveMerge(datasource, "abc");
      expect(resolvedOut).toEqual({
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
                mainKey: "key0",
                someProp: {
                  value: 0,
                },
              },
              {
                mainKey: "key1",
                someProp: {
                  value: 1,
                },
              },
              {
                mainKey: "key1a",
                someProp: {
                  value: 11,
                },
              },
              {
                mainKey: "key3",
                someProp: {
                  value: 3,
                },
              },
              {
                mainKey: "key4",
                someProp: {
                  value: 4,
                },
              },
              {
                mainKey: "key5",
                someProp: {
                  value: 5,
                },
              },
            ],
          },
        },
        binaries: [],
      });
    });
  });

  describe("reversion", () => {
    test("can revert past changes", async () => {
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
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state1 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);
      await updatePluginState(datasource, "abc", "A", state1);
      const commitA = await writeRepoCommit(datasource, "abc", "A");
      const aCommitState = await getCommitState(datasource, "abc", commitA.sha);
      const aStateRendered = await convertCommitStateToRenderedState(
        datasource,
        aCommitState
      );

      const state2 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state2);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      const state3 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36,
            },
          },
          {
            mainKey: "key5",
            someProp: {
              value: 5,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state3);
      const commitC = await writeRepoCommit(datasource, "abc", "C");
      const cCommitState = await getCommitState(datasource, "abc", commitC.sha);
      const cStateRendered = await convertCommitStateToRenderedState(
        datasource,
        cCommitState
      );

      expect(await getApplicationState(datasource, "abc")).toEqual(
        cStateRendered
      );
      const reversionState = await revertCommit(datasource, "abc", commitB.sha);
      expect(reversionState).toEqual(aStateRendered);
    });
  });

  describe("autofix", () => {
    test("auto fixes reversion when it can", async () => {
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
                },
              },
            },
          },
        },
      };
      makeTestPlugin(PLUGIN_A_0_MANIFEST);
      const state1 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key2",
            someProp: {
              value: 2,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      let plugins: PluginElement[] = [
        {
          key: "A",
          value: "0.0.0",
        },
      ];
      await updatePlugins(datasource, "abc", plugins);
      await updatePluginState(datasource, "abc", "A", state1);
      await writeRepoCommit(datasource, "abc", "A");

      const state2 = {
        aSet: [
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 3,
            },
          },
          {
            mainKey: "key4",
            someProp: {
              value: 4,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state2);
      const commitB = await writeRepoCommit(datasource, "abc", "B");
      const state3 = {
        aSet: [
          {
            mainKey: "key0",
            someProp: {
              value: 0,
            },
          },
          {
            mainKey: "key1",
            someProp: {
              value: 1,
            },
          },
          {
            mainKey: "key1a",
            someProp: {
              value: 11,
            },
          },
          {
            mainKey: "key3",
            someProp: {
              value: 36,
            },
          },
          {
            mainKey: "key5",
            someProp: {
              value: 5,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state3);
      await writeRepoCommit(datasource, "abc", "C");
      const autoReversionState = await autofixReversion(
        datasource,
        "abc",
        commitB.sha
      );
      expect(autoReversionState).toEqual({
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
                mainKey: "key0",
                someProp: {
                  value: 0,
                },
              },
              {
                mainKey: "key1",
                someProp: {
                  value: 1,
                },
              },
              {
                mainKey: "key2",
                someProp: {
                  value: 2,
                },
              },
              {
                mainKey: "key3",
                someProp: {
                  value: 36,
                },
              },
              {
                mainKey: "key5",
                someProp: {
                  value: 5,
                },
              },
            ],
          },
        },
        binaries: [],
      });
      expect(autoReversionState).toEqual({
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
                mainKey: "key0",
                someProp: {
                  value: 0,
                },
              },
              {
                mainKey: "key1",
                someProp: {
                  value: 1,
                },
              },
              {
                mainKey: "key2",
                someProp: {
                  value: 2,
                },
              },
              {
                mainKey: "key3",
                someProp: {
                  value: 36,
                },
              },
              {
                mainKey: "key5",
                someProp: {
                  value: 5,
                },
              },
            ],
          },
        },
        binaries: [],
      });
    });
  });
});
