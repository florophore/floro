import { fs, vol } from "memfs";
import { DataSource, makeMemoizedDataSource } from "../src/datasource";
import { buildFloroFilestructure, userHome } from "../src/filestructure";
import { Manifest, PluginElement } from "../src/plugins";
import {
  getCurrentCommitSha,
  getCommitState,
  convertCommitStateToRenderedState,
  ApplicationKVState,
  applyStateDiffToCommitState,
  uniqueKV,
  uniqueKVObj,
} from "../src/repo";
import {
  getApplicationState,
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
  updateMergeDirection,
  abortMerge,
  resolveMerge,
  revertCommit,
  autofixReversion,
  cherryPickRevision,
  createRepoBranch,
  updateCurrentCommitSHA,
  convertRenderedCommitStateToKv
} from "../src/repoapi";
import {
  createBlankRepo,
  makeSignedInUser,
  makeTestPlugin,
} from "./helpers/fsmocks";
import { applyDiff } from "../src/versioncontrol";

jest.mock("fs");
jest.mock("fs/promises");

describe("repoapi", () => {
  let datasource: DataSource;
  beforeEach(async () => {
    fs.mkdirSync(userHome, { recursive: true });
    buildFloroFilestructure();
    await makeSignedInUser();
    createBlankRepo("abc");
    datasource = makeMemoizedDataSource();
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

    test("saves files to binary list", async () => {
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
              someFile: {
                type: "file",
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
            someFile: "Z",
          },
          {
            mainKey: "key2",
            someProp: 2,
            someFile: "B",
          },
          {
            mainKey: "key3",
            someProp: 3,
            someFile: "A",
          },
          {
            mainKey: "key4",
            someProp: 4,
            someFile: "A",
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
      const result = await updatePluginState(
        {
          ...datasource,
          checkBinary: async (binaryId) => {
            if (binaryId == "B") {
              return false;
            }
            return true;
          },
        },
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
                someFile: "Z",
              },
              {
                mainKey: "key2",
                someProp: 2,
                someFile: null,
              },
              {
                mainKey: "key3",
                someProp: 3,
                someFile: "A",
              },
              {
                mainKey: "key4",
                someProp: 4,
                someFile: "A",
              },
            ],
          },
        },
        binaries: ["A", "Z"],
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
      await updateCurrentCommitSHA(datasource, "abc", commitA.sha, false);
      await createRepoBranch(datasource, "abc", "feature-branch");
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

      const mergeStateOut = await mergeCommit(datasource, "abc", commitB.sha);
      expect(mergeStateOut).toEqual({
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
          },
        },
        binaries: [],
      });
      const repoState = await datasource.readCurrentRepoState("abc");
      const mergeSha = await getCurrentCommitSha(datasource, "abc");
      expect(repoState).toEqual({
        branch: "feature-branch",
        commit: mergeSha,
        isInMergeConflict: false,
        merge: null,
        commandMode: "view",
        comparison: null,
      });
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
      await createRepoBranch(
        datasource,
        "abc",
        "feature-branch",
        commitA.sha,
        "main",
        true
      );

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
      await createRepoBranch(
        datasource,
        "abc",
        "feature-branch",
        commitA.sha,
        "main",
        true
      );

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

  describe("cherrypick", () => {
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
            mainKey: "key2",
            someProp: {
              value: 2,
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
          {
            mainKey: "key6",
            someProp: {
              value: 6,
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
          {
            mainKey: "key6",
            someProp: {
              value: 6,
            },
          },
        ],
      };
      await updatePluginState(datasource, "abc", "A", state4);
      const cherryPickedState = await cherryPickRevision(
        datasource,
        "abc",
        commitB.sha
      );

      expect(cherryPickedState).toEqual({
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
              {
                mainKey: "key6",
                someProp: {
                  value: 6,
                },
              },
              {
                mainKey: "key7",
                someProp: {
                  value: 7,
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
