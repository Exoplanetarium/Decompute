import path from "node:path";
import { pool } from "../../db.js";
import { incidentModeEnabled } from "../incidentMode.js";
import { VideoService } from "./service.js";
import { VideoStorage } from "./storage.js";
import { VideoMedia } from "./media.js";
import { VideoModels } from "./models.js";

export const videoService = new VideoService({ pool,
  storage: new VideoStorage(process.env.VIDEO_STORAGE_DIR || path.resolve("data/video")),
  media: new VideoMedia(), models: new VideoModels(), paused: incidentModeEnabled,
});
let processing = false;
export async function runVideoQueue() {
  if (processing || process.env.VIDEO_ENABLED !== "true") return;
  processing = true;
  try { await videoService.tick(); await videoService.purge(); }
  finally { processing = false; }
}
