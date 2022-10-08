#!/usr/bin/env node

import path from "path";
import os from 'os';
import fs from 'fs';

// ~/
export const userHome = os.homedir();
// ~/.floro
export const homePath = path.join(userHome, ".floro");
// ~/.floro/cache
export const vCachePath = path.join(homePath, "cache");
// ~/.floro/user
export const vUserPath = path.join(homePath, "user");
// ~/.floro/projects
export const vProjectsPath = path.join(homePath, "projects");

export const buildFloroFilestructure = (): void => {
  if (!fs.existsSync(homePath)) {
    fs.mkdirSync(homePath, 744);
  }

  if (!fs.existsSync(vCachePath)) {
    fs.mkdirSync(vCachePath, 744);
  }

  if (!fs.existsSync(vUserPath)) {
    fs.mkdirSync(vUserPath, 744);
  }

  if (!fs.existsSync(vProjectsPath)) {
    fs.mkdirSync(vProjectsPath, 744);
  }
}

export const existsAsync = (file): Promise<boolean> => {
  return fs.promises
    .access(file, fs.constants.F_OK)
    .then(() => true)
    .catch(() => false);
}