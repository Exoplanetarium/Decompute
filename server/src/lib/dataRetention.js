import { query } from "../db.js";

export async function purgeExpiredData() {
  const expiredInputs = await query(`DELETE FROM job_inputs WHERE expires_at < now() OR
    (job_id IS NOT NULL AND EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_inputs.job_id AND jobs.status IN ('done','failed','cancelled')))`);
  const expiredArtifacts = await query(`DELETE FROM job_artifacts WHERE expires_at < now()`);
  return { inputs: expiredInputs.rowCount, artifacts: expiredArtifacts.rowCount };
}
