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
export declare const getKVHashes: (obj: {
    key: string;
    value: {
        [key: string]: string | number | boolean;
    };
}) => {
    keyHash: string;
    valueHash: string;
};
export declare const getRowHash: (obj: {
    key: string;
    value: {
        [key: string]: string | number | boolean;
    };
}) => string;
export declare const getDiffHash: (diff: StateDiff, parentHash: string) => string;
export declare const getDiff: (before: Array<DiffElement>, after: Array<DiffElement>) => Diff;
export declare const splitTextForDiff: (str: string) => Array<string>;
export declare const getTextDiff: (before: string, after: string) => TextDiff;
export declare const applyDiff: <T extends string | DiffElement>(diffset: Diff | TextDiff, state: T[]) => T[];
