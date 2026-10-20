import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VideoMedia } from "./media.js";

// Real encoding, not fixtures: these run the bundled ffmpeg/ffprobe dev
// dependencies against generated clips, so the validator and assembler are
// exercised exactly as an uploaded shot would exercise them.
const exec = promisify(execFile);
const binaries = await Promise.all([import("ffmpeg-static"), import("ffprobe-static")]).catch(() => null);
const skip = binaries ? false : "ffmpeg-static/ffprobe-static dev dependencies are not installed";
const ffmpeg = binaries?.[0].default, ffprobe = binaries?.[1].default.path;
const media = new VideoMedia({ ffmpeg, ffprobe });
let dir;

// Mirrors the final encode in job-templates/video-gen/generate.py.
async function clip(name, { source = "testsrc2", filter, size = "1280x720", frames = 120, fps = 24, audio = false, encoder = [] } = {}) {
  const out = path.join(dir, name);
  await exec(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `${source}${source.includes("=") ? ":" : "="}size=${size}:rate=${fps}`,
    ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-c:a", "aac", "-shortest"] : []),
    ...(filter ? ["-vf", filter] : []), "-frames:v", String(frames), "-c:v", "libx264", "-preset", "fast", "-crf", "20",
    "-pix_fmt", "yuv420p", ...encoder, "-movflags", "+faststart", out]);
  return out;
}
async function png(name, size = "1280x704") {
  const out = path.join(dir, name);
  await exec(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=1`, "-frames:v", "1", out]);
  return out;
}
const streamOf = async (file) => (await media.probe(file, "shot")).streams;

before(async () => { if (!skip) dir = await mkdtemp(path.join(os.tmpdir(), "decompute-media-test-")); });
after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

test("accepts a valid five-second shot and samples three review frames", { skip }, async () => {
  const result = await media.inspect(await clip("valid.mp4"), "shot");
  assert.equal(result.metadata.frames, 120);
  assert.equal(result.metadata.fps, 24);
  assert.equal(result.frames.length, 3);
  for (const frame of result.frames) assert.deepEqual([...frame.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test("rejects malformed, mislabeled, and junk shots before any paid review", { skip }, async () => {
  const truncatedSource = await readFile(await clip("whole.mp4"));
  await writeFile(path.join(dir, "truncated.mp4"), truncatedSource.subarray(0, Math.floor(truncatedSource.length * 0.6)));
  await writeFile(path.join(dir, "garbage.mp4"), Buffer.from("not a video"));
  const cases = [
    ["native 704-line output without delivery padding", await clip("short.mp4", { size: "1280x704" }), /1280×720/],
    ["one extra frame", await clip("long.mp4", { frames: 121 }), /120 frames/],
    ["an audio track", await clip("audio.mp4", { audio: true }), /single silent/],
    ["30 fps", await clip("fps30.mp4", { fps: 30, frames: 150 }), /120 frames/],
    ["4:4:4 chroma", await clip("444.mp4", { encoder: ["-pix_fmt", "yuv444p"] }), /yuv420p/],
    ["a still image encoded as video", await clip("frozen.mp4", { source: "color=c=red" }), /frozen/],
    ["a blank screen", await clip("black.mp4", { source: "color=c=black" }), /frozen|blank/],
    ["a truncated upload", path.join(dir, "truncated.mp4"), /./],
    ["bytes that are not a video", path.join(dir, "garbage.mp4"), /./],
    ["a PNG presented as a shot", await png("disguised.png"), /./],
  ];
  for (const [label, file, message] of cases) await assert.rejects(media.inspect(file, "shot"), message, `accepted ${label}`);
});

test("accepts a 1280×704 storyboard and rejects other images", { skip }, async () => {
  const result = await media.inspect(await png("storyboard.png"), "reference");
  assert.equal(result.metadata.width, 1280);
  assert.equal(result.frames.length, 1);
  await assert.rejects(media.inspect(await png("square.png", "1024x1024"), "reference"), /1280×704/);
  await assert.rejects(media.inspect(await clip("not-an-image.mp4"), "reference"), /./);
});

test("assembles identically encoded shots losslessly into an exact timeline", { skip }, async () => {
  const shots = [await clip("a.mp4"), await clip("b.mp4", { filter: "hue=h=120" }), await clip("c.mp4", { filter: "negate" })];
  const output = path.join(dir, "assembled.mp4");
  await writeFile(output, await media.assemble(shots));
  const [stream] = await streamOf(output);
  const probe = await media.probe(output, "shot");
  assert.equal(probe.streams.length, 1);
  assert.equal(Number(stream.nb_frames), 360);
  assert.ok(Math.abs(Number(probe.format.duration) - 15) <= 0.05);
  await media.decode(output, "shot", 360);
  assert.equal(stream.extradata_hash, (await streamOf(shots[0]))[0].extradata_hash, "identical shots should be stream-copied");
});

test("re-encodes shots whose parameter sets differ instead of stream-copying", { skip }, async () => {
  const shots = [await clip("baseline.mp4", { encoder: ["-profile:v", "baseline"] }), await clip("high.mp4")];
  const output = path.join(dir, "mixed.mp4");
  await writeFile(output, await media.assemble(shots));
  const [stream] = await streamOf(output);
  assert.equal(Number(stream.nb_frames), 240);
  assert.equal(stream.profile, "High", "a copied timeline would keep the first shot's Baseline parameter sets");
  await media.decode(output, "shot", 240);
});

test("refuses empty or oversized timelines", { skip }, async () => {
  await assert.rejects(media.assemble([]), /shot count/);
  await assert.rejects(media.assemble(Array(7).fill(path.join(dir, "a.mp4"))), /shot count/);
});
