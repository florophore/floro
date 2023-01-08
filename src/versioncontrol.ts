import console from "console";
import { Crypto } from "cryptojs";
import { StateDiff } from "./repo";
import mdiff from 'mdiff';

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

export type TextDiff = {
  add: {
    [key: number]: string;
  };
  remove: {
    [key: number]: string;
  };
};

export interface CommitData {
  sha?: string;
  diff: StateDiff;
  userId: string;
  timestamp: string;
  parent: string|null;
  historicalParent: string|null;
  message: string;
}

const getObjectStringValue = (obj: {[key: string]: number|string|boolean}): string => {
  if (typeof obj == "string") return obj;
  return Object.keys(obj).reduce((s, key) => {
    return `${s}/${key}:${obj[key]}`;
  }, "");
};

export const getKVHashes = (obj: {
  key: string;
  value: { [key: string]: number | string | boolean };
}): { keyHash: string, valueHash: string } => {
  const keyHash = Crypto.SHA1(obj.key);
  const valueHash = Crypto.SHA1(getObjectStringValue(obj.value));
  return {
    keyHash,
    valueHash,
  };
};

export const getRowHash = (obj: {
  key: string;
  value: { [key: string]: number | string | boolean };
}): string => {
  const { keyHash, valueHash } = getKVHashes(obj);
  return Crypto.SHA1(keyHash + valueHash);
};

export const getDiffHash = (commitData: CommitData): string => {
  return Crypto.SHA1(JSON.stringify(commitData));
};

export const getMyersSequence = (
  left: Array<string>,
  right: Array<string>
): Array<string> => {
  const diff = mdiff(left, right);
  return diff.getLcs();
};

export const getStringDiff = (
  before: Array<string>,
  after: Array<string>
): Diff => {
  const past = before;
  const present = after;
  const longestSequence = getMyersSequence(past, present);
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

export const getDiff = (
  before: Array<DiffElement>,
  after: Array<DiffElement>
): Diff => {
  const past = before.map(getRowHash);
  const present = after.map(getRowHash);
  const longestSequence = getMyersSequence(past, present);
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
  const sentences = str.split(/[\.!\?。]/g).filter(v => v != ""); 
  for (let i = 0; i < sentences.length; ++i) {
    sentences[i] = sentences[i] + (chars.substring?.(sentences[i].length)?.[0] ?? "");
    chars = chars.substring(sentences[i].length);
  }
  return sentences;
}

export const getTextDiff = (before: string, after: string): TextDiff => {
  const past = splitTextForDiff(before);
  const present = splitTextForDiff(after);
  const longestSequence = getMyersSequence(past, present);

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
} 


export const applyDiff = <T extends DiffElement | string>(
  diffset: Diff | TextDiff,
  state: Array<T>
): Array<T> => {
  let assets = [...(state ?? [])];
  const addIndices = Object.keys(diffset.add)
    .map((v) => parseInt(v))
    .sort((a, b) => a - b);
  const removeIndices = Object.keys(diffset.remove)
    .map((v) => parseInt(v))
    .sort((a, b) => a - b);

  let offset = 0;
  for (let removeIndex of removeIndices) {
    const index = removeIndex - offset;
    assets = [...assets.slice(0, index), ...assets.slice(index + 1, assets.length)];
    offset++;
  }
  for (let addIndex of addIndices) {
    const index = addIndex;
    assets = [
      ...assets.slice(0, index),
      diffset.add[addIndex] as T,
      ...assets.slice(index),
    ];
  }
  return assets;
};
 
export const getMergeSequence = (
  from: Array<string>,
  into: Array<string>
): Array<string> => {
  if (from.length == 0 && into.length == 0) {
    return [];
  }
  const lcs = getMyersSequence(from, into);
  if (lcs.length == 0) {
    return into;
  }
  const fromOffsets = getLCSBoundaryOffsets(from, lcs);
  const fromSequences = getLCSOffsetMergeSeqments(from, fromOffsets);
  const intoOffsets = getLCSBoundaryOffsets(into, lcs);
  const intoSequences = getLCSOffsetMergeSeqments(into, intoOffsets);
  let keepSequences = [];
  let keepIndex = 0;
  while (keepIndex <= lcs.length) {
    keepSequences.push(fromSequences[keepIndex]);
    if (keepIndex != lcs.length) {
      keepSequences.push([lcs[keepIndex]]);
    }
    keepIndex++;
  }
  const keep = keepSequences.flatMap((v) => v);

  let mergeSequences = [];
  let mergeIndex = 0;
  while (mergeIndex <= lcs.length) {
    mergeSequences.push(fromSequences[mergeIndex]);
    mergeSequences.push(intoSequences[mergeIndex]);
    if (mergeIndex != lcs.length) {
      mergeSequences.push([lcs[mergeIndex]]);
    }
    mergeIndex++;
  }
  const merge = mergeSequences.flatMap((v) => v);
  return merge;
};

export const canAutoMerge = (
  from: Array<string>,
  into: Array<string>
): boolean => {
  if (from.length == 0 && into.length == 0) {
    return true;
  }
  const lcs = getMyersSequence(from, into);
  if (lcs.length == 0) {
    return false
  }
  const fromOffsets = getLCSBoundaryOffsets(from, lcs);
  const fromSequences = getLCSOffsetMergeSeqments(from, fromOffsets);
  const intoOffsets = getLCSBoundaryOffsets(into, lcs);
  const intoSequences = getLCSOffsetMergeSeqments(into, intoOffsets);
  let index = 0;
  if (lcs.length == 0) return false;
  while (index <= lcs.length) {
    if (fromSequences[index].length > 0 && intoSequences[index].length > 0) {
      return false;
    }
    index++;
  }
  return true;
}

const getLCSBoundaryOffsets = (
  sequence: Array<string>,
  lcs: Array<string>
): Array<number> => {
  let graph = []
  for (let i = 0; i < lcs.length; ++i) {
    graph.push([]);
    for (let j = 0; j < sequence.length; ++j) {
      graph[i].push(0);
    }
  }
  for (let i = 0; i < lcs.length; ++i) {
    for (let j = 0; j < sequence.length; ++j) {
      if (lcs[i] == sequence[j]) {
        graph[i][j]++;
        let back = 0
        while (i - back > 0 && j - back > 0 && graph[i - back - 1][j - back - 1] > 0) {
            graph[i - back - 1][j - back - 1]++;
            back++;
        }
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

const getLCSOffsetMergeSeqments = (
  sequence: Array<string>,
  offsets: Array<number>
): Array<Array<string>> => {
  let out = [];
  if (offsets.length == 0) return out;
  out.push(sequence.slice(0, offsets[0]));
  for (let i = 0; i < offsets.length; ++i) {
    if (i == offsets.length - 1) {
      out.push(sequence.slice(offsets[i] + 1))
    } else {
      out.push(sequence.slice(offsets[i] + 1, offsets[i + 1]))
    }
  }
  return out;
};
