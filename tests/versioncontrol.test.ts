import { applyDiff, getDiff, getTextDiff, getMergeSequence, canAutoMerge } from '../src/versioncontrol';

describe("versioncontrol", () => { 
    describe('getDiff', () => {
        test("can perform myers diff", () => {
            const beforeString = "ABCDEF"; 
            const afterString = "XYAYCEFZ"; 
            const before = beforeString.split("").map(key => ({key, value: {}}));
            const after = afterString.split("").map(key => ({key, value: {}}));
            const diff = getDiff(before, after);
            const appliedDiff = applyDiff(diff, before).map(({key}) => key).join("");
            expect(appliedDiff).toEqual(afterString);
        });
        test("can perform myers diff", () => {
            const beforeString = "ABCDE"; 
            const afterString = "XAEBE"; 
            const before = beforeString.split("").map(key => ({key, value: {}}));
            const after = afterString.split("").map(key => ({key, value: {}}));
            const diff = getDiff(before, after);
            const appliedDiff = applyDiff(diff, before).map(({key}) => key).join("");
            expect(appliedDiff).toEqual(afterString);
        });
        test("can perform myers diff", () => {
            const before = "ABCDE".split("").map(key => ({key, value: {}}));
            const after = "XAEBCDFABD".split("").map(key => ({key, value: {}}));
            const diff = getDiff(before, after);
            expect(Object.keys(diff.add)).toHaveLength(6)
            expect(Object.keys(diff.remove)).toHaveLength(1)
            expect(diff.add[0].key).toBe("X");
            expect(diff.add[2].key).toBe("E");
            expect(diff.add[6].key).toBe("F");
            expect(diff.add[7].key).toBe("A");
            expect(diff.add[8].key).toBe("B");
            expect(diff.add[9].key).toBe("D");
            expect(diff.remove[4].key).toBe("E");
            const appliedDiff = applyDiff(diff, before).map(({key}) => key).join("");
            expect(appliedDiff).toEqual("XAEBCDFABD");
        });

        test("can perform myers diff on empty values", () => {
            const before = "".split("").map(key => ({key, value: {}}));
            const after = "".split("").map(key => ({key, value: {}}));
            const diff = getDiff(before, after);
            expect(Object.keys(diff.add)).toHaveLength(0)
            expect(Object.keys(diff.remove)).toHaveLength(0)
        });

        test("can perform myers diff on swap", () => {
            const before = "AB".split("").map(key => ({key, value: {}}));
            const after = "BA".split("").map(key => ({key, value: {}}));
            const diff = getDiff(before, after);
            expect(Object.keys(diff.add)).toHaveLength(1)
            expect(Object.keys(diff.remove)).toHaveLength(1)
        });
    });

    describe('getTextDiff', () => {
        test("successfully applies text diff", () => {
            const paragraphA = "How the paragraph currently is. Will update soon! End of sentence"
            const diff0 = getTextDiff([].join(""), paragraphA);
            const paragraphB = "First time updating paragraph. How the paragraph currently is now. Added additional details! Random ending";
            const diff1 = getTextDiff(paragraphA, paragraphB);
            const paragraphC = "Second time updating paragraph. How the paragraph currently is now. Removed additional details! Add Chinese sentence。 Should be done?";
            const diff2 = getTextDiff(paragraphB, paragraphC);
            const pA = applyDiff(diff0, []);
            const pB = applyDiff(diff1, pA);
            const pC = applyDiff(diff2, pB);
            expect(pA.join("")).toEqual(paragraphA);
            expect(pB.join("")).toEqual(paragraphB);
            expect(pC.join("")).toEqual(paragraphC);
        });
    });

    describe('getMergeSequence', () => {

        test('creates merge without conflict', () => {
            const A = "FACXBRR".split("");
            const B = "FADACB".split("");
            expect(canAutoMerge(A, B)).toBe(true);
            expect(getMergeSequence(A, B).join("")).toEqual("FADACXBRR");
        });

        test('creates merge with conflict', () => {
            const A = "FACXBRR".split("");
            const B = "XFNCB".split("");
            expect(canAutoMerge(A, B)).toBe(false);
            expect(getMergeSequence(A, B).join("")).toEqual("XFANCXBRR");
        });
    });
});