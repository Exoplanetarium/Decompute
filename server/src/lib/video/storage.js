import { mkdir, writeFile, readFile, rename, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { hash } from "./policy.js";

// Shared persistent volume in production; local private directory in development.
// Only generated UUID keys enter the filesystem. No renter/provider paths.
export class VideoStorage {
  constructor(root) { this.root = path.resolve(root); }
  path(key) {
    if (!/^[a-f0-9-]{36}\/(?:[a-f0-9-]{36})\.(?:png|mp4)$/.test(key)) throw new Error("Invalid video storage key");
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new Error("Invalid video storage path");
    return target;
  }
  async put(projectId, contentType, bytes) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new Error("Empty media");
    const id = crypto.randomUUID();
    const storageKey = `${projectId}/${id}.${contentType === "image/png" ? "png" : "mp4"}`;
    const destination = this.path(storageKey);
    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const temporary = `${destination}.upload-${crypto.randomUUID()}`;
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
    return { id, storageKey, contentType, sha256: hash(bytes), byteSize: bytes.length };
  }
  async read(key) { return readFile(this.path(key)); }
  stream(key) { return createReadStream(this.path(key)); }
  async exists(key) { try { return (await stat(this.path(key))).isFile(); } catch { return false; } }
  async remove(key) { await rm(this.path(key), { force: true }); }
}
