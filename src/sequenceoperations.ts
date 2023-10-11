import sha256 from "crypto-js/sha256";
import HexEncode from "crypto-js/enc-hex";
import { StateDiff } from "./repo";
import mdiff from "mdiff";

const hash = (str: string|BinaryData): string => {
  const hash = sha256(str?.toString());
  return hash.toString(HexEncode);
}

export interface DiffElement {
  key: string;
  value: any;
}

export type Diff = {
  add: {
    [key: string]: DiffElement;
  };
  remove: {
    [key: string]: DiffElement;
  };
};

export type StringDiff = {
  add: {
    [key: number]: string;
  };
  remove: {
    [key: number]: string;
  };
};

export interface CommitData {
  sha?: string;
  originalSha?: string;
  diff: StateDiff;
  userId: string;
  username: string;
  authorUserId?: string;
  authorUsername?: string;
  timestamp: string;
  parent: string | null;
  historicalParent: string | null;
  mergeBase?: string | null;
  mergeRevertSha?: string | null;
  revertFromSha?: string | null;
  revertToSha?: string | null;
  idx: number;
  message: string;
}

const fastHash = (str: string) => {
  let hash = 0;
  let hash2 = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * hash2) ^ ((hash << 5) - hash + str.charCodeAt(i));
    hash2 = (hash2 << 5) - hash + str.charCodeAt(i);
    hash |= 0;
    hash2 |= 0;
  }
  return hash.toString(36).padEnd(6) + hash2.toString(36).padEnd(6);
};

export const hashBinary = (bin: BinaryData) => {
  return hash(bin);
};

export const hashString = (str: string) => {
  return fastHash(str);
};

export const getKVHashes = (obj: {
  key: string;
  value: {
    [key: string]: number | string | boolean | Array<number | string | boolean>;
  };
}): { keyHash: string; valueHash: string } => {
  const keyHash = fastHash(obj.key);
  const valueHash = fastHash(JSON.stringify(obj.value));
  return {
    keyHash,
    valueHash,
  };
};

export const getKVHash = (obj: {
  key: string;
  value: string | object;
}): string => {
  if (typeof obj.value == "string") {
    return fastHash(((obj.key as string) + obj.value) as string);
  }
  return fastHash(obj.key + JSON.stringify(obj.value));
};

export const getRowHash = (obj: {
  key: string;
  value: {
    [key: string]: number | string | boolean | Array<number | string | boolean>;
  };
}): string => {
  return fastHash(obj.key + JSON.stringify(obj.value));
};

export const getDiffHash = (commitData: CommitData): string => {
  const diffString = JSON.stringify(commitData.diff);
  if (!commitData.userId) {
    return null;
  }
  if (!commitData.timestamp) {
    return null;
  }
  if (!commitData.message) {
    return null;
  }

  if (!commitData.parent && !commitData.historicalParent) {
    const str = `userId:${commitData.userId}/userId:${
      commitData.username
    }/authorUserId:${
      commitData.authorUserId ?? commitData.userId
    }/authorUsername:${
      commitData.authorUsername ?? commitData.username
    }/timestamp:${commitData.timestamp}/message:${commitData.message}/idx:${
      commitData.idx
    }/mergeBase:${commitData?.mergeBase ?? "none"}/revertFromSha:${
      commitData.revertFromSha ?? "none"
    }/revertToSha:${commitData.revertToSha ?? "none"}/originalSha:${
      commitData?.originalSha ?? "none"
    }/diff:${diffString}`;
    return hash(str);
  }
  if (!commitData.parent) {
    const str = `userId:${commitData.userId}/username:${
      commitData.username
    }/authorUserId:${
      commitData.authorUserId ?? commitData.userId
    }/authorUsername:${
      commitData.authorUsername ?? commitData.username
    }/timestamp:${commitData.timestamp}/message:${
      commitData.message
    }/historicalParent:${commitData.historicalParent}/idx:${
      commitData.idx
    }/mergeBase:${commitData?.mergeBase ?? "none"}/revertFromSha:${
      commitData.revertFromSha ?? "none"
    }/revertToSha:${commitData.revertToSha ?? "none"}/originalSha:${
      commitData?.originalSha ?? "none"
    }/diff:${diffString}`;
    return hash(str);
  }
  if (!commitData.historicalParent) {
    const str = `userId:${commitData.userId}/username:${
      commitData.username
    }/authorUserId:${
      commitData.authorUserId ?? commitData.userId
    }/authorUsername:${
      commitData.authorUsername ?? commitData.username
    }/timestamp:${commitData.timestamp}/message:${commitData.message}/parent:${
      commitData.parent
    }/idx:${commitData.idx}/mergeBase:${
      commitData?.mergeBase ?? "none"
    }/revertFromSha:${commitData.revertFromSha ?? "none"}/revertToSha:${
      commitData.revertToSha ?? "none"
    }/originalSha:${commitData?.originalSha ?? "none"}/diff:${diffString}`;
    return hash(str);
  }
  const str = `userId:${commitData.userId}/username:${
    commitData.username
  }/authorUserId:${
    commitData.authorUserId ?? commitData.userId
  }/authorUsername:${
    commitData.authorUsername ?? commitData.username
  }/timestamp:${commitData.timestamp}/message:${commitData.message}/parent:${
    commitData.parent
  }/historicalParent:${commitData.historicalParent}/idx:${
    commitData.idx
  }/mergeBase:${commitData?.mergeBase ?? "none"}/revertFromSha:${
    commitData.revertFromSha ?? "none"
  }/revertToSha:${commitData.revertToSha ?? "none"}/originalSha:${
    commitData?.originalSha ?? "none"
  }/diff:${diffString}`;
  return hash(str);
};

export const getLCS = (
  left: Array<string>,
  right: Array<string>
): Array<string> => {
  const diff = mdiff(left, right);
  const lcs = diff.getLcs();
  return lcs;
};

export const getDiff = (
  before: Array<DiffElement>,
  after: Array<DiffElement>
): Diff => {
  const past = before.map(getRowHash);
  const present = after.map(getRowHash);
  const longestSequence = getLCS(past, present);
  let removeIndex = 0;
  let diff = {
    add: {},
    remove: {},
  };
  for (let i = 0; i < past.length; ++i) {
    if (longestSequence[removeIndex] == past[i]) {
      removeIndex++;
    } else {
      diff.remove[i] = before[i];
    }
  }

  let addIndex = 0;
  for (let i = 0; i < present.length; ++i) {
    if (longestSequence[addIndex] == present[i]) {
      addIndex++;
    } else {
      diff.add[i] = after[i];
    }
  }
  return diff;
};

export const splitTextForDiff = (str: string): Array<string> => {
  let chars = str;
  const sentences = str.split(/[\.!\?。]/g).filter((v) => v != "");
  for (let i = 0; i < sentences.length; ++i) {
    sentences[i] =
      sentences[i] + (chars.substring?.(sentences[i].length)?.[0] ?? "");
    chars = chars.substring(sentences[i].length);
  }
  return sentences;
};

export const getArrayStringDiff = (
  past: Array<string>,
  present: Array<string>
): StringDiff => {
  const longestSequence = getLCS(past, present);

  let diff = {
    add: {},
    remove: {},
  };

  for (let i = 0, removeIndex = 0; i < past.length; ++i) {
    if (longestSequence[removeIndex] == past[i]) {
      removeIndex++;
    } else {
      diff.remove[i] = past[i];
    }
  }

  for (let i = 0, addIndex = 0; i < present.length; ++i) {
    if (longestSequence[addIndex] == present[i]) {
      addIndex++;
    } else {
      diff.add[i] = present[i];
    }
  }
  return diff;
};

export const getTextDiff = (before: string, after: string): StringDiff => {
  const past = splitTextForDiff(before);
  const present = splitTextForDiff(after);
  return getArrayStringDiff(past, present);
};

export const applyDiff = <T extends DiffElement | string>(
  diffset: Diff | StringDiff,
  state: Array<T>
): Array<T> => {
  let assets = [...(state ?? [])];
  const addIndices = Object.keys(diffset.add).map((v) => parseInt(v));
  const removeIndices = Object.keys(diffset.remove).map((v) => parseInt(v));

  let offset = 0;
  for (let removeIndex of removeIndices) {
    const index = removeIndex - offset;
    assets.splice(index, 1);
    offset++;
  }

  for (let addIndex of addIndices) {
    const index = addIndex;
    assets.splice(index, 0, diffset.add[addIndex]);
  }
  return assets;
};

export const getMergeSequence = (
  origin: Array<string>,
  from: Array<string>,
  into: Array<string>,
  direction: "theirs" | "yours" = "yours"
): Array<string> => {
  if (from.length == 0 && into.length == 0) {
    return [];
  }
  const fromIsEqualToOrigin = sequencesAreEqual(origin, from);
  const intoIsEqualToOrigin = sequencesAreEqual(origin, into);

  if (fromIsEqualToOrigin && !intoIsEqualToOrigin) {
    return into;
  }

  if (!fromIsEqualToOrigin && intoIsEqualToOrigin) {
    return from;
  }

  if (fromIsEqualToOrigin && intoIsEqualToOrigin) {
    return origin;
  }

  const lcs = getGreatestCommonLCS(origin, from, into);
  if (lcs.length == 0) {
    return getMergeSubSequence(from, into, direction);
  }
  const originOffsets = getLCSBoundaryOffsets(origin, lcs);
  const originSequences = getLCSOffsetMergeSeqments(origin, originOffsets);
  const fromOffsets = getLCSBoundaryOffsets(from, lcs);
  const fromSequences = getLCSOffsetMergeSeqments(from, fromOffsets);
  const fromReconciledSequences = getReconciledSequence(
    originSequences,
    fromSequences
  );
  const intoOffsets = getLCSBoundaryOffsets(into, lcs);
  const intoSequences = getLCSOffsetMergeSeqments(into, intoOffsets);
  const intoReconciledSequences = getReconciledSequence(
    originSequences,
    intoSequences
  );

  let mergeSequences = [];
  let mergeIndex = 0;
  while (mergeIndex <= lcs.length) {
    if (
      sequencesAreEqual(
        fromReconciledSequences[mergeIndex],
        intoReconciledSequences[mergeIndex]
      )
    ) {
      mergeSequences.push(fromReconciledSequences[mergeIndex]);
    } else {
      mergeSequences.push(
        getMergeSubSequence(
          fromReconciledSequences[mergeIndex],
          intoReconciledSequences[mergeIndex],
          direction
        )
      );
    }
    if (mergeIndex != lcs.length) {
      mergeSequences.push([lcs[mergeIndex]]);
    }
    mergeIndex++;
  }
  const merge = mergeSequences.flatMap((v) => v);
  return merge;
};

// yours prioritizes into (you) from (them)
const getMergeSubSequence = (
  from: Array<string>,
  into: Array<string>,
  direction: "theirs" | "yours" = "yours"
): Array<string> => {
  if (from.length == 0 && into.length == 0) {
    return [];
  }
  const lcs = getLCS(from, into);
  if (lcs.length == 0) {
    if (direction == "yours") {
      return [...from, ...into];
    } else {
      return [...into, ...from];
    }
  }

  const fromOffsets = getLCSBoundaryOffsets(from, lcs);
  const fromSequences = getLCSOffsetMergeSeqments(from, fromOffsets);

  const intoOffsets = getLCSBoundaryOffsets(into, lcs);
  const intoSequences = getLCSOffsetMergeSeqments(into, intoOffsets);

  let mergeSequences = [];
  let mergeIndex = 0;
  while (mergeIndex <= lcs.length) {
    if (direction == "yours") {
      mergeSequences.push(fromSequences[mergeIndex]);
      mergeSequences.push(intoSequences[mergeIndex]);
    } else {
      mergeSequences.push(intoSequences[mergeIndex]);
      mergeSequences.push(fromSequences[mergeIndex]);
    }
    if (mergeIndex != lcs.length) {
      mergeSequences.push([lcs[mergeIndex]]);
    }
    mergeIndex++;
  }
  return mergeSequences.flatMap((v) => v);
};

const getGreatestCommonLCS = (
  origin: Array<string>,
  from: Array<string>,
  into: Array<string>
) => {
  const fromLCS = getLCS(origin, from);
  const intoLCS = getLCS(origin, into);
  return getLCS(fromLCS, intoLCS);
};

const sequencesAreEqual = (a: Array<string>, b: Array<string>) => {
  if (a.length != b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    if (a[i] != b[i]) return false;
  }
  return true;
};

/**
 *
 * EXAMPLE 1 (NO CONFLICT)
 *
 * MAIN BRANCH:    (commit: A, value: [A, B, C, D]) ---> (commit: B, value: [A, X, B, C, Y, D])
 *                                                 \
 * FEATURE BRANCH:                                  ---------> (commit: C, value: [A, D])
 *
 * TO MERGE B into C, we have to find the greatest longest common subsequence (GLCS) amongst all 3 commits
 * which is
 * GLCS: [A,D]
 *
 * SINCE the GLCS is [A, D], we know the merge segments for each commit are
 * A: {[], [B, C], []}
 * B: {[], [X, B, C, Y], []}
 * C: {[], [], []}
 *
 * Any sequences that are the same between the origin and sequence, must have been removed by the counter commit of the merge. Therefore we erase the sequence if the sequences are equal.
 *
 * B IS reconciled to the following: {[], [X, Y], []}
 * C IS reconciled to the following: {[], [], []}
 *
 * SINCE [B, C] are present in commit B but not commit C, we know C had to have deleted B and C,
 * therefore we can safely splice out [B, C] from [X, B, C, Y] in the merge by taking the LCS
 * of the origin against the respective sequence and finding the offsets. we then ignore the offsets
 * which effectively removes the values deleted by the merge-INTO (C) commit.
 *
 * merging by prioritzing commit B or commit C, always results in the sequence [A, X, Y, D].
 * Because the merging is communative we know no conflict exists between the sequences.
 *
 * To further clarify consider a case with merge conflicts
 * ______________________________________________________________________________________________________
 *
 *  EXAMPLE 2 (CONFLICT)
 *
 * MAIN BRANCH:    (commit: A, value: [A, B, C, D]) ---> (commit: B, value: [A, X, B, C, Y, D])
 *                                                 \
 * FEATURE BRANCH:                                  ---------> (commit: C, value: [A, Z, D])
 *
 * TO MERGE B into C, we have to find the greatest longest common subsequence (GLCS) amonst all 3 commits
 * which is
 * GLCS: [A,D]
 *
 * SINCE the GLCS is [A, D], we know the merge segments for each commit are
 * A: {[], [B, C], []}
 * B: {[], [X, B, C, Y], []}
 * C: {[], [Z], []}
 *
 * B IS reconciled to the following: {[], [X, Y], []}
 * C IS reconciled to the following: {[], [Z], []}
 *
 * Because B and C both have uncommon values at IDX (1), this results in merge coflict where both values are concatenated
 * to [X, Y, Z], if yours or [Z, X, Y] if theirs (i.e. the merge sequences do not commute, when changing the merge direction!)
 */

const getReconciledSequence = (
  originSequences: Array<Array<string>>,
  sequences: Array<Array<string>>
): Array<Array<string>> => {
  let out = [];
  for (let i = 0; i < sequences.length; ++i) {
    if (sequencesAreEqual(originSequences[i], sequences[i])) {
      out.push([]);
    } else {
      const subLCS = getLCS(originSequences[i], sequences[i]);
      const offsets = getLCSBoundaryOffsets(sequences[i], subLCS);
      let offsetIndex = 0;
      const next = [];
      for (let j = 0; j < sequences[i].length; ++j) {
        if (j != offsets[offsetIndex]) {
          next.push(sequences[i][j]);
        } else {
          offsetIndex++;
        }
      }
      out.push(next);
    }
  }
  return out;
};

/***
 * Considering following:
 * idx        0 1 2 3 4 5 6 7
 * sequence = A F C Z Z C Z Z
 * lcs =      A C Z Z
 *
 * we get the matching graph
 * where 1 denotes a match and 0 is a mismatch
 *
 *       0 1 2 3 4 5 6 7
 *       | | | | | | | |
 *       A F C Z Z C Z Z
 *  0-A  1 0 0 0 0 0 0 0
 *  1-C  0 0 1 0 0 1 0 0
 *  2-Z  0 0 0 1 1 0 1 1
 *  3-Z  0 0 0 1 1 0 1 1
 *
 * by tracing the longest diagonal sequence of 1's
 * from the lower right to upper left, we can get
 * the max consecutive subsequences length for each sequence character
 *
 *       0 1 2 3 4 5 6 7
 *       | | | | | | | |
 *       A F C Z Z C Z Z
 *  0-A  1 0 0 0 0 0 0 0
 *  1-C  0 0 3 0 0 3 0 0
 *  2-Z  0 0 0 2 1 0 2 1
 *  3-Z  0 0 0 1 1 0 1 1
 *
 * finally we get the LCS boundary index by looking first for the
 * maximum value on each row, then selecting the rightmost value
 * for example. Row 0: the max value is 1 and it's rightmost location is index 0
 *
 *  IDX  0 1 2 3 4 5 6 7
 *  ROW  | | | | | | | |
 *       A F C Z Z C Z Z
 *  0-A  1 0 0 0 0 0 0 0 -> MAX: 1, RIGHTMOST IDX of (1): 0
 *  1-C  0 0 3 0 0 3 0 0 -> MAX: 3, RIGHTMOST IDX of (3): 5
 *  2-Z  0 0 0 2 1 0 2 1 -> MAX: 2, RIGHTMOST IDX of (2): 6
 *  3-Z  0 0 0 1 1 0 1 1 -> MAX: 1, RIGHTMOST IDX of (1): 7
 *
 * The LCS Boundary Offsets are therefore [0, 5, 6, 7]
 * Which corresponds with                 [A, C, Z, Z]
 *
 * DP BFS here is way faster and more intuitive than recursive approach
 * O(M*N*min(M, N))
 */
const getLCSBoundaryOffsets = (
  sequence: Array<string>,
  lcs: Array<string>
): Array<number> => {
  let graph = [];
  for (let i = 0; i < lcs.length; ++i) {
    graph.push([]);
    for (let j = 0; j < sequence.length; ++j) {
      if (lcs[i] == sequence[j]) {
        graph[i].push(1);
        let backtrace = 0;
        while (
          i - backtrace > 0 &&
          j - backtrace > 0 &&
          graph[i - backtrace - 1][j - backtrace - 1] > 0
        ) {
          graph[i - backtrace - 1][j - backtrace - 1]++;
          backtrace++;
        }
      } else {
        graph[i].push(0);
      }
    }
  }
  let out = [];
  for (let i = 0; i < graph.length; ++i) {
    let max = Math.max(...graph[i]);
    for (let j = sequence.length - 1; j >= 0; --j) {
      if (graph[i][j] == max) {
        out.push(j);
        break;
      }
    }
  }
  return out;
};

/***
 * Considering following:
 * idx        0 1 2 3 4 5 6 7
 * sequence = A F C Z Z C Z Z
 * lcs =      A C Z Z
 * offsets = [0, 5, 6, 7] (see above)
 *  getLCSOffsetMergeSeqments produces following merge segments from offsets
 *
 * sequence:   A     F   C   Z   Z     C      Z      Z
 *             |     |   |   |   |     |      |      |
 * indices:    0     1   2   3   4     5      6      7
 *             |     |   |   |   |     |      |      |
 * offsets:    0     |   |   |   |     5      6      7
 *             |     |   |   |   |     |      |      |
 *             |     F   C   Z   Z     |      |      |
 *             A     *   *   *   *     C      Z      Z
 * segs:  { [] -   [ F,  C , Z , Z ]   -  []  -  []  -  [] }
 *
 * output is following,
 * [[], [ F,  C , Z , Z ], [], [], []]
 */
const getLCSOffsetMergeSeqments = (
  sequence: Array<string>,
  offsets: Array<number>
): Array<Array<string>> => {
  let out = [];
  if (offsets.length == 0) return out;
  out.push(sequence.slice(0, offsets[0]));
  for (let i = 0; i < offsets.length; ++i) {
    if (i == offsets.length - 1) {
      out.push(sequence.slice(offsets[i] + 1));
    } else {
      out.push(sequence.slice(offsets[i] + 1, offsets[i + 1]));
    }
  }
  return out;
};

export const getCopySequence = (
  copyFrom: Array<string>,
  copyInto: Array<string>,
  copySet: Set<string>
): Array<string> => {
  const lcs = getLCS(copyFrom, copyInto);
  if (lcs.length == 0) {
    return [...copyInto, ...copyFrom.filter(s => copySet.has(s))];
  }
  const intoBoundaryOffests = getLCSBoundaryOffsets(copyInto, lcs);
  const intoMergeSegments = getLCSOffsetMergeSeqments(
    copyInto,
    intoBoundaryOffests
  );
  const fromBoundaryOffests = getLCSBoundaryOffsets(copyFrom, lcs);
  const fromMergeSegments = getLCSOffsetMergeSeqments(
    copyFrom,
    fromBoundaryOffests
  );
  for (let i = 0; i < lcs.length + 1; ++i) {
    const copyIntoSegment = intoMergeSegments[i];
    const copyFromSegment = fromMergeSegments[i];
    for (let j = 0; j < copyFromSegment.length; ++j) {
      if (copySet.has(copyFromSegment[j])) {
        copyIntoSegment.push(copyFromSegment[j]);
      }
    }
  }
  const out: Array<string> = [];
  for (let i = 0; i < lcs.length + 1; ++i) {
    const copyIntoSegment = intoMergeSegments[i];
    if (i == lcs.length) {
      out.push(...copyIntoSegment);
    } else {
      out.push(...copyIntoSegment);
      out.push(lcs[i]);
    }
  }
  return out;
};

export const copyKV = <T>(
  copyFrom: Array<{ key: string; value: T }>,
  copyInto: Array<{ key: string; value: T }>,
  copyKeys: Array<string>,
  priority: "yours" | "theirs" = "theirs"
): Array<{ key: string; value: T }> => {
  const copyFromKeys = copyFrom.map((v) => v.key);
  const copyFromMap: { [key: string]: T } = copyFrom.reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {}
  );
  const copyIntoKeys = copyInto.map((v) => v.key);
  const copyIntoMap: { [key: string]: T } = copyInto.reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {}
  );
  const copySet = new Set<string>(copyKeys);
  const out: Array<{ key: string; value: T }> = [];
  const copySequence = getCopySequence(copyFromKeys, copyIntoKeys, copySet);
  for (let i = 0; i < copySequence.length; ++i) {
    if (copySet.has(copySequence[i])) {
      if (copyFromMap[copySequence[i]] && copyIntoMap[copySequence[i]]) {
        if (priority == "theirs") {
          out.push({
            key: copySequence[i],
            value: copyFromMap[copySequence[i]],
          });
        } else {
          out.push({
            key: copySequence[i],
            value: copyIntoMap[copySequence[i]],
          });
        }
      } else {
        out.push({
          key: copySequence[i],
          value: copyFromMap[copySequence[i]],
        });
      }
    } else {
      out.push({
        key: copySequence[i],
        value: copyIntoMap[copySequence[i]],
      });
    }
  }
  return out;
};