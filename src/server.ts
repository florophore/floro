import express from "express";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { promisify } from 'util';
import { vCDNPath} from "./filestructure";

const app = express();
const DEFAULT_PORT = 63403;
const port = !!process.env.FLORO_VCDN_PORT
  ? parseInt(process.env.FLORO_VCDN_PORT)
  : DEFAULT_PORT;


app.get("/ping", (req, res): void => {
  res.send("pong");
});

app.get("/*.svg", async (req, res) => {
  const imagePath = path.join(vCDNPath, req.path);
  if (await promisify(fs.exists)(imagePath)) {
    const svg = await promisify(fs.readFile)(imagePath, { encoding: "utf8", flag: "r" });
    res.status(200).setHeader("Content-Type", "image/svg+xml").send(svg);
  } else {
    res.status(404).send("No Image Found");
  }
});

app.get("/*.png", async (req, res) => {
  const width = req.query["w"];
  const height = req.query["h"];
  const svgPath = req.path.substring(0, req.path.length - 3) + "svg";
  const imagePath = path.join(vCDNPath, svgPath);
  if (await promisify(fs.exists)(imagePath)) {
    if (width) {
      const buffer = await sharp(imagePath)
        .resize({ width: parseInt(width) })
        .png()
        .toBuffer();
      res.status(200).setHeader("Content-Type", "image/png").send(buffer);
      return;
    }
    if (height) {
      const buffer = await sharp(imagePath)
        .resize({ height: parseInt(height) })
        .png()
        .toBuffer();
      res.status(200).setHeader("Content-Type", "image/png").send(buffer);
      return;
    }
    const buffer = await sharp(imagePath).png().toBuffer();
    res.status(200).setHeader("Content-Type", "image/png").send(buffer);
    return;
  } else {
    res.status(404).send("No Image Found");
  }
});

app.listen(port, "0.0.0.0", () => console.log("floro server started on: " + port));