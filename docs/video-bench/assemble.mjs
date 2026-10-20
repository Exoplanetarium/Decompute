// Stitches each subject's three shots with the production assembler.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [serverDir, dir] = process.argv.slice(2);
const require = createRequire(path.join(serverDir, "package.json"));
const { VideoMedia } = await import(pathToFileURL(path.join(serverDir, "src/lib/video/media.js")).href);
const media = new VideoMedia({ ffmpeg: require("ffmpeg-static"), ffprobe: require("ffprobe-static").path });
for (const s of [0, 1, 2, 3]) {
  const data = await media.assemble([0, 1, 2].map((n) => path.join(dir, `s${s}-shot-${n}-base.mp4`)));
  writeFileSync(path.join(dir, `video-subject${s}-15s.mp4`), data);
  console.log(`subject ${s}: ${(data.length / 1e6).toFixed(1)} MB assembled`);
}
