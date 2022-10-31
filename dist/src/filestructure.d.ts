export declare const userHome: string;
export declare const homePath: string;
export declare const vConfigPath: string;
export declare const vCachePath: string;
export declare const vUserPath: string;
export declare const vProjectsPath: string;
export declare const vPluginsPath: string;
export declare const vConfigCORSPath: string;
export declare const vConfigRemotePath: string;
export declare const vConfigPluginsPath: string;
export declare const userSessionPath: string;
export declare const userPath: string;
export declare const buildFloroFilestructure: () => void;
export declare const clean: () => void;
export declare const reset: () => void;
export declare const writeUserSession: (session: any) => Promise<void>;
export declare const getUserSession: () => any;
export declare const writeUser: (user: any) => Promise<void>;
export declare const getUser: () => any;
export declare const existsAsync: (file: any) => Promise<boolean>;
export declare const getPluginsJson: () => {
    plugins: {
        [key: string]: string;
    };
};
export declare const getRemoteHostSync: () => string;
export declare const getRemoteHostAsync: () => Promise<string>;
