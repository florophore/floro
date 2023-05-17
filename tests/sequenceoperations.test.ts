import {
  applyDiff,
  getDiff,
  getTextDiff,
  getMergeSequence,
  getCopySequence,
  copyKV,
} from "../src/sequenceoperations";

describe("versioncontrol", () => {
  describe("getDiff", () => {
    test("can perform myers diff", () => {
      const beforeString = "ABCDEF";
      const afterString = "XYAYCEFZ";
      const before = beforeString.split("").map((key) => ({ key, value: {} }));
      const after = afterString.split("").map((key) => ({ key, value: {} }));
      const diff = getDiff(before, after);
      const appliedDiff = applyDiff(diff, before)
        .map(({ key }) => key)
        .join("");
      expect(appliedDiff).toEqual(afterString);
    });
    test("can perform myers diff", () => {
      const beforeString = "ABCDE";
      const afterString = "XAEBE";
      const before = beforeString.split("").map((key) => ({ key, value: {} }));
      const after = afterString.split("").map((key) => ({ key, value: {} }));
      const diff = getDiff(before, after);
      const appliedDiff = applyDiff(diff, before)
        .map(({ key }) => key)
        .join("");
      expect(appliedDiff).toEqual(afterString);
    });
    test("can perform myers diff", () => {
      const before = "ABCDE".split("").map((key) => ({ key, value: {} }));
      const after = "XAEBCDFABD".split("").map((key) => ({ key, value: {} }));
      const diff = getDiff(before, after);
      expect(Object.keys(diff.add)).toHaveLength(6);
      expect(Object.keys(diff.remove)).toHaveLength(1);
      expect(diff.add[0].key).toBe("X");
      expect(diff.add[2].key).toBe("E");
      expect(diff.add[6].key).toBe("F");
      expect(diff.add[7].key).toBe("A");
      expect(diff.add[8].key).toBe("B");
      expect(diff.add[9].key).toBe("D");
      expect(diff.remove[4].key).toBe("E");
      const appliedDiff = applyDiff(diff, before)
        .map(({ key }) => key)
        .join("");
      expect(appliedDiff).toEqual("XAEBCDFABD");
    });

    test("can perform myers diff on empty values", () => {
      const before = "".split("").map((key) => ({ key, value: {} }));
      const after = "".split("").map((key) => ({ key, value: {} }));
      const diff = getDiff(before, after);
      expect(Object.keys(diff.add)).toHaveLength(0);
      expect(Object.keys(diff.remove)).toHaveLength(0);
    });

    test("can perform myers diff on swap", () => {
      const before = "AB".split("").map((key) => ({ key, value: {} }));
      const after = "BA".split("").map((key) => ({ key, value: {} }));
      const diff = getDiff(before, after);
      expect(Object.keys(diff.add)).toHaveLength(1);
      expect(Object.keys(diff.remove)).toHaveLength(1);
    });
  });

  describe("getTextDiff", () => {
    test("successfully applies text diff", () => {
      const paragraphA =
        "How the paragraph currently is. Will update soon! End of sentence";
      const diff0 = getTextDiff([].join(""), paragraphA);
      const paragraphB =
        "First time updating paragraph. How the paragraph currently is now. Added additional details! Random ending";
      const diff1 = getTextDiff(paragraphA, paragraphB);
      const paragraphC =
        "Second time updating paragraph. How the paragraph currently is now. Removed additional details! Add Chinese sentence。 Should be done?";
      const diff2 = getTextDiff(paragraphB, paragraphC);
      const pA = applyDiff(diff0, []);
      const pB = applyDiff(diff1, pA);
      const pC = applyDiff(diff2, pB);
      expect(pA.join("")).toEqual(paragraphA);
      expect(pB.join("")).toEqual(paragraphB);
      expect(pC.join("")).toEqual(paragraphC);
    });
  });

  describe("getMergeSequence", () => {
    test("creates merge with conflicts without a common origin when no subsequence overlap", () => {
      const A = "".split("");
      const B = "DA".split("");
      const C = "BC".split("");
      const merge = getMergeSequence(A, B, C).join("");
      expect(merge).toEqual("DABC");
      const canMerge = getMergeSequence(A, B, C, "theirs").join("") == getMergeSequence(A, B, C, "yours").join("");
      expect(canMerge).toBe(false);
    });

    test("creates merge without conflicts without a common origin when subsequences overlap", () => {
      const A = "".split("");
      const B = "DA".split("");
      const C = "ABC".split("");
      const merge = getMergeSequence(A, B, C).join("");
      expect(merge).toEqual("DABC");
      const canMerge = getMergeSequence(A, B, C, "theirs").join("") == getMergeSequence(A, B, C, "yours").join("");
      expect(canMerge).toBe(true);
    });

    test("creates merge without conflict when all subsquences are consistent", () => {
      const A = "ABCDEF".split("");
      const B = "RXALDEFSKZ".split("");
      const C = "ABCDFSJK".split("");
      const merge = getMergeSequence(A, B, C).join("");
      expect(merge).toEqual("RXALDFSJKZ");
      const canMerge = getMergeSequence(A, B, C, "theirs").join("") == getMergeSequence(A, B, C, "yours").join("");
      expect(canMerge).toBe(true);
    });

    test("creates merge without conflict when a subsequence cannot be reconciled", () => {
      const A = "ABCDEF".split("");
      const B = "RXALDEFSKZ".split("");
      const C = "ABCDFSJKL".split("");
      const merge = getMergeSequence(A, B, C).join("");
      expect(merge).toEqual("RXALDFSJKZL");
      const canMerge = getMergeSequence(A, B, C, "theirs").join("") == getMergeSequence(A, B, C, "yours").join("");
      expect(canMerge).toBe(false);
      expect(getMergeSequence(A, B, C, "theirs").join("")).toEqual(
        "RXALDFSJKLZ"
      );
    });

    test("creates merge without conflict if subsequences with deletions can be reconciled", () => {
      const A = "DENF".split("");
      const B = "DTENPF".split("");
      const C = "DF".split("");
      const merge = getMergeSequence(A, B, C).join("");
      expect(merge).toEqual("DTPF");
      const canMerge = getMergeSequence(A, B, C, "theirs").join("") == getMergeSequence(A, B, C, "yours").join("");
      expect(canMerge).toBe(true);
    });

    test("creates merge with conflict if subsequences with deletions cannot be reconciled", () => {
      const A = "DENF".split("");
      const B = "DTENPF".split("");
      const C = "DXF".split("");
      const merge = getMergeSequence(A, B, C).join("");
      expect(merge).toEqual("DTPXF");
      const canMerge = getMergeSequence(A, B, C, "theirs").join("") == getMergeSequence(A, B, C, "yours").join("");
      expect(canMerge).toBe(false);
      expect(getMergeSequence(A, B, C, "theirs").join("")).toEqual("DXTPF");
    });
  });

  describe("getCopySequence", () => {
    test("creates copy sequence", () => {
      const copyFrom = "ABCDEF".split("");
      const copyInto = "WBXYCDZ".split("");
      const copySet = new Set("ACF".split(""));
      const copySequence = getCopySequence(copyFrom, copyInto, copySet);
      expect(copySequence.join("")).toEqual("WABXYCDZF");
    });
  });

  describe("copyKV", () => {
    test("respects copy direction", () => {
      const copyFrom = [
        {
          key: "A",
          value: "A0",
        },
        {
          key: "B",
          value: "B0",
        },
        {
          key: "C",
          value: "C0",
        },
        {
          key: "D",
          value: "D0",
        },
        {
          key: "E",
          value: "E0",
        },
        {
          key: "F",
          value: "F0",
        },
      ];
      const copyInto = [
        {
          key: "W",
          value: "W1",
        },
        {
          key: "B",
          value: "B1",
        },
        {
          key: "X",
          value: "X1",
        },
        {
          key: "Y",
          value: "Y1",
        },
        {
          key: "C",
          value: "C1",
        },
        {
          key: "D",
          value: "D1",
        },
        {
          key: "Z",
          value: "Z0",
        },
      ];
      const copyKeys = ["A", "C", "F"]
      const copySequenceTheirs = copyKV(copyFrom, copyInto, copyKeys);
      expect(copySequenceTheirs).toEqual([
        {
          "key": "W",
          "value": "W1"
        },
        {
          "key": "A",
          "value": "A0"
        },
        {
          "key": "B",
          "value": "B1"
        },
        {
          "key": "X",
          "value": "X1"
        },
        {
          "key": "Y",
          "value": "Y1"
        },
        {
          "key": "C",
          "value": "C0"
        },
        {
          "key": "D",
          "value": "D1"
        },
        {
          "key": "Z",
          "value": "Z0"
        },
        {
          "key": "F",
          "value": "F0"
        }
      ]);

      const copySequenceYours = copyKV(copyFrom, copyInto, copyKeys, "yours");
      expect(copySequenceYours).toEqual([
        {
          "key": "W",
          "value": "W1"
        },
        {
          "key": "A",
          "value": "A0"
        },
        {
          "key": "B",
          "value": "B1"
        },
        {
          "key": "X",
          "value": "X1"
        },
        {
          "key": "Y",
          "value": "Y1"
        },
        {
          "key": "C",
          "value": "C1"
        },
        {
          "key": "D",
          "value": "D1"
        },
        {
          "key": "Z",
          "value": "Z0"
        },
        {
          "key": "F",
          "value": "F0"
        }
      ]);
    });
  });
});
