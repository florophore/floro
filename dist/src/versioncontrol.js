"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyDiff = exports.getTextDiff = exports.splitTextForDiff = exports.getDiff = exports.getDiffHash = exports.getRowHash = exports.getKVHashes = void 0;
const cryptojs_1 = require("cryptojs");
const getObjectStringValue = (obj) => {
    if (typeof obj == "string")
        return obj;
    return Object.keys(obj).reduce((s, key) => {
        return `${s}/${key}:${obj[key]}`;
    }, "");
};
const getKVHashes = (obj) => {
    const keyHash = cryptojs_1.Crypto.SHA1(obj.key);
    const valueHash = cryptojs_1.Crypto.SHA1(getObjectStringValue(obj.value));
    return {
        keyHash,
        valueHash,
    };
};
exports.getKVHashes = getKVHashes;
const getRowHash = (obj) => {
    const { keyHash, valueHash } = (0, exports.getKVHashes)(obj);
    return cryptojs_1.Crypto.SHA1(keyHash + valueHash);
};
exports.getRowHash = getRowHash;
const getDiffHash = (diff, parentHash) => {
    if (parentHash == null) {
        return cryptojs_1.Crypto.SHA1(JSON.stringify(diff));
    }
    return cryptojs_1.Crypto.SHA1(JSON.stringify(diff) + parentHash);
};
exports.getDiffHash = getDiffHash;
const getMyersSequence = (left, right) => {
    const graph = [];
    for (let i = 0; i < left.length; ++i) {
        graph.push([]);
        for (let j = 0; j < right.length; ++j) {
            if (left[i] == right[j]) {
                graph[i].push(1);
            }
            else {
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
const getDiff = (before, after) => {
    const past = before.map(exports.getRowHash);
    const present = after.map(exports.getRowHash);
    const longestSequence = getMyersSequence(past, present);
    let removeIndex = 0;
    let diff = {
        add: {},
        remove: {},
    };
    for (let i = 0; i < past.length; ++i) {
        if (longestSequence[removeIndex] == past[i]) {
            removeIndex++;
        }
        else {
            diff.remove[i] = before[i];
        }
    }
    let addIndex = 0;
    for (let i = 0; i < present.length; ++i) {
        if (longestSequence[addIndex] == present[i]) {
            addIndex++;
        }
        else {
            diff.add[i] = after[i];
        }
    }
    return diff;
};
exports.getDiff = getDiff;
const splitTextForDiff = (str) => {
    let chars = str;
    const sentences = str.split(/[\.!\?。]/g).filter(v => v != "");
    for (let i = 0; i < sentences.length; ++i) {
        sentences[i] = sentences[i] + (chars.substring?.(sentences[i].length)?.[0] ?? "");
        chars = chars.substring(sentences[i].length);
    }
    return sentences;
};
exports.splitTextForDiff = splitTextForDiff;
const getTextDiff = (before, after) => {
    const past = (0, exports.splitTextForDiff)(before);
    const present = (0, exports.splitTextForDiff)(after);
    const longestSequence = getMyersSequence(past, present);
    let diff = {
        add: {},
        remove: {},
    };
    for (let i = 0, removeIndex = 0; i < past.length; ++i) {
        if (longestSequence[removeIndex] == past[i]) {
            removeIndex++;
        }
        else {
            diff.remove[i] = past[i];
        }
    }
    for (let i = 0, addIndex = 0; i < present.length; ++i) {
        if (longestSequence[addIndex] == present[i]) {
            addIndex++;
        }
        else {
            diff.add[i] = present[i];
        }
    }
    return diff;
};
exports.getTextDiff = getTextDiff;
const applyDiff = (diffset, state) => {
    const assets = [...(state ?? [])];
    for (let stringIndex in diffset.remove) {
        const index = parseInt(stringIndex);
        assets[index] = null;
    }
    for (let stringIndex in diffset.add) {
        const index = parseInt(stringIndex);
        assets[index] = diffset.add[stringIndex];
    }
    for (let j = assets.length - 1; j >= 0 && assets[j] === null; --j) {
        assets.pop();
    }
    return assets;
};
exports.applyDiff = applyDiff;
//# sourceMappingURL=versioncontrol.js.map