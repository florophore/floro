import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";
import { createHash } from "node:crypto";

const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "floro", "floro.manifest.json"), "utf8")
);

export default defineConfig(({ command, mode }): any => {
  const cdnHost = process.env?.CDN_HOST ?? "";
  manifest.version =
    mode == "production" || command == "build" ? manifest.version : "dev";
  return {
    assetsInclude: [
      "./floro/floro.manifest.json",
      "./floro/*.svg",
    ],
    base: `${cdnHost}/plugins/${manifest.name}/${manifest.version}/`,
    plugins: [react() as any],
    publicDir: ["public", "floro"],
    define: {
      FLORO_MANIFEST_NAME: JSON.stringify(manifest.name),
      FLORO_MANIFEST_VERSION: JSON.stringify(manifest.version),
    },
    build: {
      rollupOptions: {
        output: {
          assetFileNames: ({ name, source }) => {
            const filename = path.basename(name);
            const fname = path.parse(filename).name;
            const extname = path.extname(name);
            const sha256 = createHash("sha256");
            sha256.update(source);
            return `assets/${fname}-${sha256.digest("hex")}${extname}`;
          },
          entryFileNames: (chunkInfo) => {
            const code = Object.values(chunkInfo.modules)
              .map((m) => (m as { code: string }).code)
              .join("");
            const sha256 = createHash("sha256");
            sha256.update(code);
            return "assets/[name]-" + sha256.digest("hex") + ".js";
          },
        },
      },
    },
    experimental: {
      renderBuiltUrl: (filename: string, { hostId }) => {
        if (command == "build" && cdnHost != "") {
          return `${cdnHost}/plugins/${manifest.name}/${manifest.version}/${filename}`;
        }
        return { relative: true };
      },
    },
  };
});
