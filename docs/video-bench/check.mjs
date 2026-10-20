// Runs benchmark outputs through the production validator (VideoMedia.inspect,
// real ffmpeg) and writes one contact sheet per shot: storyboard + 5 frames.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const [serverDir, dir] = process.argv.slice(2);
const require = createRequire(`${serverDir}/package.json`);
const ffmpeg = require("ffmpeg-static"), ffprobe = require("ffprobe-static").path;
const { VideoMedia } = await import(new URL(`file:///${serverDir.replace(/\\/g, "/")}/src/lib/video/media.js`));
const media = new VideoMedia({ ffmpeg, ffprobe });
const report = JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8"));
for (const row of report.filter((r) => r.ok)) {
  const isShot = row.kind === "shot";
  const file = path.join(dir, `${row.name}.${isShot ? "mp4" : "png"}`);
  try { await media.inspect(file, isShot ? "shot" : "reference"); row.validator = "pass"; }
  catch (e) { row.validator = `FAIL: ${e.message.split("\n")[0]}`; }
  if (isShot) {
    const board = file.replace(/shot-(\d+)-\w+\.mp4$/, "storyboard-$1.png");
    const sheet = file.replace(/\.mp4$/, "-sheet.jpg");
    // Storyboard, then frames at 0, 1.2, 2.4, 3.6, 4.8 s, tiled 3x2.
    const tmp = mkdtempSync(path.join(os.tmpdir(), "sheet-"));
    // Every tile is pre-scaled to one size: a size change mid-sequence makes
    // ffmpeg rebuild the filter graph and drop the storyboard tile.
    const tile = (input, n, select = "") => execFileSync(ffmpeg, ["-v", "error", "-y", "-i", input,
      "-vf", `${select}scale=640:360,setsar=1`, "-frames:v", "1", path.join(tmp, `${n}.png`)]);
    if (existsSync(board)) tile(board, 1);
    for (const [i, frame] of [0, 29, 58, 87, 116].entries()) tile(file, i + 2, `select=eq(n\\,${frame}),`);
    execFileSync(ffmpeg, ["-v", "error", "-y", "-framerate", "1", "-start_number", existsSync(board) ? "1" : "2", "-i", path.join(tmp, "%d.png"),
      "-vf", "tile=3x2:padding=4", "-frames:v", "1", "-q:v", "4", sheet]);
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${row.name.padEnd(22)} ${String(row.wallSeconds).padStart(7)}s  render=${row.metrics?.renderSeconds?.toFixed?.(1) ?? "-"}s load=${row.metrics?.loadSeconds?.toFixed?.(1) ?? "-"}s vram=${row.metrics ? (row.metrics.peakVramBytes / 2 ** 30).toFixed(1) : "-"}GB  ${row.validator}`);
}
writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 1));
