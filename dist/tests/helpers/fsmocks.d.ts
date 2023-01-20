import { Manifest } from "../../src/plugins";
export declare const makeSignedInUser: () => Promise<void>;
export declare const makePluginCreationDirectory: (name: string, manifest: Manifest) => string;
export declare const makeTestPlugin: (manifest: Manifest, isDev?: boolean) => string;
export declare const getPluginCreationDirectoryRoot: (name: string) => Promise<string>;
export declare const createBlankRepo: (repoId: string) => void;
