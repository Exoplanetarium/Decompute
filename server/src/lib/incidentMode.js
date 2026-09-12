export function incidentModeEnabled() {
  return String(process.env.DECOMPUTE_INCIDENT_MODE || "").toLowerCase() === "true";
}
