import { Crypto } from "cryptojs";
import { StateDiff } from "./repo";

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

export const getDiffHash = (diff: StateDiff, parentHash: string): string => {
  if (parentHash == null) {
    return Crypto.SHA1(JSON.stringify(diff));
  }
  return Crypto.SHA1(JSON.stringify(diff) + parentHash);
};

const getMyersSequence = (
  left: Array<string>,
  right: Array<string>
): Array<string> => {
  const graph = [];
  for (let i = 0; i < left.length; ++i) {
    graph.push([]);
    for (let j = 0; j < right.length; ++j) {
      if (left[i] == right[j]) {
        graph[i].push(1);
      } else {
        graph[i].push(0);
      }
    }
  }
  for (let i = 0; i < graph.length; ++i) {
    for (let j = 0; j < graph[i].length; ++j) {
      if (j > 0) {
        let add = 0;
        if (i > 0) {
          add = graph[i - 1][j - 1];
        }
        graph[i][j] = Math.max(graph[i][j - 1], add + graph[i][j]);
      }
    }
  }
  let out = [];
  let i = left.length - 1;
  let j = right.length - 1;
  let max = graph[i]?.[j] ?? 0;
  while (max != 0) {
    if (graph[i - 1]?.[j] != max && graph[i]?.[j - 1] != max) {
      max--;
      out.unshift(left[i]);
    }
    if (graph[i - 1]?.[j] == max) {
      i--;
    }
    if (graph[i]?.[j - 1] == max) {
      j--;
    }
  }
  return out;
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


export const applyDiff = <T extends DiffElement|string,> (
  diffset: Diff|TextDiff,
  state:  Array<T>
): Array<T> => {
  const assets = [...(state ?? [])];
  for (let stringIndex in diffset.remove) {
    const index = parseInt(stringIndex);
    assets[index] = null;
  }
  for (let stringIndex in diffset.add) {
    const index = parseInt(stringIndex);
    assets[index] = diffset.add[stringIndex] as T;
  }
  for (let j = assets.length - 1; j >= 0 && assets[j] === null; --j) {
    assets.pop();
  }
  return assets;
};