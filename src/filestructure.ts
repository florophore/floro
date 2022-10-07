#!/usr/bin/env node

import path from "path";
import os from 'os';
import fs from 'fs';

export const userHome = os.homedir();
export const homePath = path.join(userHome, ".floro");
export const vCDNPath = path.join(homePath, "cache");

if (!fs.existsSync(homePath)) {
  fs.mkdirSync(homePath, 744);
}

if (!fs.existsSync(vCDNPath)) {
  fs.mkdirSync(vCDNPath, 744);
}