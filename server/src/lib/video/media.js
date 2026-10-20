import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const exec = promisify(execFile);
export const FRAMES_PER_SHOT = 120;
const FPS = 24;

// Stream copy is only safe when every shot carries identical parameter sets.
// ffmpeg will happily decode a mixed concatenation, but browsers may glitch at
// the cut, so anything that differs here forces a re-encode instead.
const encodingSignature = (stream) => JSON.stringify(["codec_name", "profile", "level", "width", "height", "pix_fmt",
  "time_base", "r_frame_rate", "has_b_frames", "refs", "color_space", "color_primaries", "color_transfer", "color_range",
  "extradata_hash"].map((key) => stream?.[key] ?? null));

export class VideoMedia {
  constructor({ ffmpeg = process.env.FFMPEG_PATH || "ffmpeg", ffprobe = process.env.FFPROBE_PATH || "ffprobe" } = {}) {
    this.ffmpeg = ffmpeg; this.ffprobe = ffprobe;
  }
  async ready() {
    try { await Promise.all([exec(this.ffmpeg, ["-version"], { timeout: 5000, windowsHide: true }), exec(this.ffprobe, ["-version"], { timeout: 5000, windowsHide: true })]); return true; }
    catch { return false; }
  }
  async probe(file, kind) {
    const { stdout } = await exec(this.ffprobe, ["-v", "error", "-protocol_whitelist", "file,pipe", "-f", kind === "shot" ? "mov" : "png_pipe",
      "-show_data_hash", "sha256", "-show_streams", "-show_format", "-of", "json", file], { timeout: 15_000, maxBuffer: 512 * 1024, windowsHide: true });
    return JSON.parse(stdout);
  }
  // Full decode with errors fatal. Counts the frames actually decoded instead
  // of trusting the container header, and optionally rejects unambiguous junk
  // (a still image or a blank screen for most of a shot) before paid review.
  // Limited threads, wall time, output size, and demuxer bound untrusted input.
  async decode(file, kind, expectedFrames, { rejectJunk = false } = {}) {
    const { stdout, stderr } = await exec(this.ffmpeg, ["-hide_banner", "-nostats", "-v", "info", "-xerror", "-threads", "2",
      "-protocol_whitelist", "file,pipe", "-f", kind === "shot" ? "mov" : "png_pipe", "-i", file,
      ...(kind === "shot" ? ["-t", String(expectedFrames / FPS + 1)] : []),
      ...(rejectJunk ? ["-vf", "freezedetect=n=-60dB:d=4,blackdetect=d=4:pix_th=0.10"] : []),
      "-progress", "pipe:1", "-f", "null", "-"], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const decoded = Number([...stdout.matchAll(/^frame=(\d+)\s*$/gm)].at(-1)?.[1] || 0);
    if (decoded !== expectedFrames) throw new Error(`Decoded ${decoded} of ${expectedFrames} expected frames`);
    if (rejectJunk && /freezedetect\.freeze_start/.test(stderr)) throw new Error("Video is frozen for most of the shot");
    if (rejectJunk && /black_start:/.test(stderr)) throw new Error("Video is blank for most of the shot");
  }
  async inspect(file, kind) {
    const probe = await this.probe(file, kind);
    const streams = probe.streams || [], stream = streams[0];
    if (streams.length !== 1 || stream?.codec_type !== "video") throw new Error("Expected a single silent video/image stream");
    if (kind === "shot") {
      if (stream.codec_name !== "h264" || stream.width !== 1280 || stream.height !== 720 || stream.pix_fmt !== "yuv420p") throw new Error("Expected H.264 1280×720 yuv420p video");
      const [num, den] = String(stream.avg_frame_rate).split("/").map(Number);
      if (num / den !== FPS || Number(stream.nb_frames) !== FRAMES_PER_SHOT || Math.abs(Number(probe.format.duration) - 5) > 0.05) throw new Error("Expected exactly 120 frames at 24 fps");
    } else if (stream.codec_name !== "png" || stream.width !== 1280 || stream.height !== 704) throw new Error("Expected a 1280×704 PNG storyboard");
    await this.decode(file, kind, kind === "shot" ? FRAMES_PER_SHOT : 1, { rejectJunk: kind === "shot" });
    const temp = await mkdtemp(path.join(os.tmpdir(), "decompute-video-review-"));
    try {
      const samples = kind === "shot" ? [0, 2.5, 4.9] : [0];
      const frames = [];
      for (const [index, second] of samples.entries()) {
        const target = path.join(temp, `${index}.png`);
        await exec(this.ffmpeg, ["-v", "error", "-threads", "2", "-protocol_whitelist", "file,pipe", "-f", kind === "shot" ? "mov" : "png_pipe",
          "-i", file, "-ss", String(second), "-frames:v", "1", "-vf", "scale=512:-2", "-y", target], { timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true });
        frames.push(await readFile(target));
      }
      return { metadata: { width: stream.width, height: stream.height, frames: kind === "shot" ? FRAMES_PER_SHOT : 1, fps: kind === "shot" ? FPS : null,
        codec: stream.codec_name, encoding: kind === "shot" ? encodingSignature(stream) : null }, frames };
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
  async assemble(files) {
    if (!files.length || files.length > 6) throw new Error("Invalid shot count");
    const signatures = new Set();
    for (const file of files) signatures.add(encodingSignature((await this.probe(file, "shot")).streams?.[0]));
    const copy = signatures.size === 1;
    const temp = await mkdtemp(path.join(os.tmpdir(), "decompute-video-assemble-"));
    try {
      // Copy generated names into the private scratch directory so concat
      // never interprets an untrusted path or a platform-specific escape.
      for (const [index, file] of files.entries()) await writeFile(path.join(temp, `${index}.mp4`), await readFile(file));
      await writeFile(path.join(temp, "list.txt"), files.map((_, index) => `file '${index}.mp4'`).join("\n"));
      const output = path.join(temp, "result.mp4");
      await exec(this.ffmpeg, ["-v", "error", "-f", "concat", "-safe", "1", "-i", path.join(temp, "list.txt"), "-map", "0:v:0", "-an",
        ...(copy ? ["-c:v", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p"]),
        "-movflags", "+faststart", "-y", output], { timeout: copy ? 60_000 : 180_000, maxBuffer: 64 * 1024, windowsHide: true });
      const expected = files.length * FRAMES_PER_SHOT;
      const probe = await this.probe(output, "shot");
      if (Number(probe.streams?.[0]?.nb_frames) !== expected || Math.abs(Number(probe.format?.duration) - files.length * 5) > 0.05) throw new Error("Assembled timeline is incomplete");
      await this.decode(output, "shot", expected);
      const data = await readFile(output);
      if (data.length > 96 * 1024 * 1024) throw new Error("Assembled video exceeds limit");
      return data;
    } finally { await rm(temp, { recursive: true, force: true }); }
  }
}
