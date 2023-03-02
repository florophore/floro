import { StateDiff } from "./repo";
export interface DiffElement {
    key: string;
    value: any;
}
export declare type Diff = {
    add: {
        [key: string]: DiffElement;
    };
    remove: {
        [key: string]: DiffElement;
    };
};
export declare type TextDiff = {
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
    authorUserId?: string;
    timestamp: string;
    parent: string | null;
    historicalParent: string | null;
    mergeBase?: string | null;
    idx: number;
    message: string;
}
export declare const hashString: (str: string) => string;
export declare const getKVHashes: (obj: {
    key: string;
    value: {
        [key: string]: string | number | boolean | (string | number | boolean)[];
    };
}) => {
    keyHash: string;
    valueHash: string;
};
export declare const getKVHash: (obj: {
    key: string;
    value: string | {
        [key: string]: string | number | boolean | (string | number | boolean)[];
    };
}) => string;
export declare const getRowHash: (obj: {
    key: string;
    value: {
        [key: string]: string | number | boolean | (string | number | boolean)[];
    };
}) => string;
export declare const getDiffHash: (commitData: CommitData) => string;
export declare const getLCS: (left: Array<string>, right: Array<string>) => Array<string>;
export declare const getDiff: (before: Array<DiffElement>, after: Array<DiffElement>) => Diff;
export declare const splitTextForDiff: (str: string) => Array<string>;
export declare const getTextDiff: (before: string, after: string) => TextDiff;
export declare const applyDiff: <T extends string | DiffElement>(diffset: Diff | TextDiff, state: T[]) => T[];
export declare const getMergeSequence: (origin: Array<string>, from: Array<string>, into: Array<string>, whose?: "theirs" | "yours") => Array<string>;
export declare const canAutoMerge: (origin: Array<string>, from: Array<string>, into: Array<string>) => boolean;
