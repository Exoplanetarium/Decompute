import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
// Lucide — one icon system across the app: 24px grid, uniform 2px stroke.
// Chosen over emoji so glyph weight and color stay consistent with the
// dark/teal theme instead of varying per platform font.
import {
  Info as InfoIcon, AppWindow, ArrowDown, Banknote, Bell, BookOpen, Bot, Brain, Briefcase, Check, Circle, Clapperboard, Coffee, Command, Cpu, CreditCard, Database, Download, FileText, Folder, Gift, Globe, Hand, Handshake, Key, Laptop, Leaf, Link, ListChecks, Lock, LogOut, Mail, MemoryStick, MessageSquare, Mic, Monitor, Moon, Network, NotebookPen, Package, Palette, PartyPopper, Plug, Recycle, Rocket, Scale, Search, Server, Settings, Share, Shield, ShieldCheck, ShoppingCart, Shuffle, Sparkles, Star, Stethoscope, Store, Terminal, TriangleAlert, Upload, User, Wallet, Wrench, X,
} from "lucide-react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{
  --bg0:#06090E;--bg1:#0C1118;--bg2:#111820;--bg3:#18212E;
  --b:rgba(255,255,255,0.07);--b2:rgba(255,255,255,0.14);
  --teal:#00D4A8;--td:rgba(0,212,168,0.12);
  --amber:#F5A623;--ad:rgba(245,166,35,0.12);
  --red:#FF4D6A;--rd:rgba(255,77,106,0.12);
  --blue:#3B9EFF;--bd:rgba(59,158,255,0.12);
  --purple:#9B6DFF;--pd:rgba(155,109,255,0.12);
  --t0:#EDF2FF;--t1:#A8B5CC;--t2:#5C6880;
  --r:8px;--r2:14px;--r3:20px;
  --fd:'Syne',sans-serif;--fm:'IBM Plex Mono',monospace;
}
html{scroll-behavior:smooth}
body{background:var(--bg0);color:var(--t0);font-family:var(--fd);overflow-x:hidden;-webkit-font-smoothing:antialiased}
/* color:inherit — without it buttons fall back to the UA's black 'buttontext'.
   Emoji ignored that, but icons draw with currentColor, so any icon in a
   button that doesn't set its own color would render black on dark. */
button{font-family:var(--fd);cursor:pointer;border:none;background:none;color:inherit;touch-action:manipulation}
input,select,textarea{font-family:var(--fm);-webkit-appearance:none;color:var(--t0);outline:none;transition:border-color .15s}
input:focus,textarea:focus,select:focus{border-color:var(--teal)!important}
::-webkit-scrollbar{width:3px;height:3px}
::-webkit-scrollbar-thumb{background:var(--b2);border-radius:2px}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideUp{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:translateY(0)}}
@keyframes slideRight{from{opacity:0;transform:translateX(50px)}to{opacity:1;transform:translateX(0)}}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes scan{0%{top:-2px}100%{top:100vh}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
@keyframes glow{0%,100%{box-shadow:0 0 8px rgba(0,212,168,.3)}50%{box-shadow:0 0 20px rgba(0,212,168,.55)}}
@keyframes flicker{0%,100%{opacity:1}90%{opacity:.8}95%{opacity:1}}
@keyframes checkPop{0%{transform:scale(0)}60%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes paletteIn{from{opacity:0;transform:translateY(-12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

/* Keyboard users get a clear focus ring; mouse users don't see it */
:focus-visible{outline:2px solid var(--teal);outline-offset:2px;border-radius:4px}
button:focus:not(:focus-visible),a:focus:not(:focus-visible){outline:none}

/* Command palette */
.cmd-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1300;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;backdrop-filter:blur(3px)}
.cmd-box{width:100%;max-width:540px;background:var(--bg1);border:.5px solid var(--b2);border-radius:var(--r2);box-shadow:0 20px 60px rgba(0,0,0,.6);overflow:hidden;animation:paletteIn .18s ease both}
.cmd-item{display:flex;align-items:center;gap:12px;padding:11px 16px;cursor:pointer;font-size:14px;border:none;background:none;width:100%;text-align:left;color:var(--t1);transition:background .1s}
.cmd-item:hover,.cmd-item[data-active="true"]{background:var(--td);color:var(--teal)}

.fade-in{animation:fadeUp .3s ease both}
.scan-line{position:fixed;left:0;right:0;height:2px;z-index:-1;pointer-events:none;
  background:linear-gradient(90deg,transparent,rgba(0,212,168,.2),transparent);animation:scan 9s linear infinite}

.wrap{max-width:1280px;margin:0 auto;padding:22px 22px 100px}
.node-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(314px,1fr));gap:18px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.prov-grid{display:grid;grid-template-columns:264px 1fr;gap:20px}
.form-2{display:grid;grid-template-columns:1fr 1fr;gap:13px}
.hdr-nav{display:flex}
.bot-nav{display:none}
.jdesk{display:grid;grid-template-columns:2fr 1.4fr 100px 90px 80px 90px;gap:12px;align-items:center}
.jmob{display:none}
.job-box{background:var(--bg2);border:.5px solid var(--b2);border-radius:var(--r2);overflow:hidden}
.filter-row{display:flex;gap:7px;overflow-x:auto;padding-bottom:3px;scrollbar-width:none;flex-wrap:nowrap}
.filter-row::-webkit-scrollbar{display:none}

.ai-panel{position:fixed;bottom:80px;right:20px;width:378px;max-height:68vh;z-index:500;
  display:flex;flex-direction:column;background:var(--bg1);border:.5px solid var(--b2);
  border-radius:var(--r2);overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.7);
  animation:slideRight .3s ease both}
.ai-closed{display:none}
.ai-fab{position:fixed;bottom:22px;right:22px;z-index:600;width:52px;height:52px;border-radius:50%;
  cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;
  transition:transform .2s;animation:glow 3s ease-in-out infinite;border:none}
.ai-fab:hover{transform:scale(1.09)}
.ai-u{align-self:flex-end;background:var(--td);border:.5px solid rgba(0,212,168,.28);
  color:var(--t0);border-radius:12px 12px 2px 12px;padding:9px 12px;max-width:85%;font-size:13px;line-height:1.55}
.ai-b{align-self:flex-start;background:var(--bg3);border:.5px solid var(--b2);
  color:var(--t0);border-radius:12px 12px 12px 2px;padding:9px 12px;max-width:90%;font-size:13px;line-height:1.6}
.ai-dot{width:6px;height:6px;border-radius:50%;background:var(--teal)}
.ai-dot:nth-child(1){animation:blink .9s ease infinite}
.ai-dot:nth-child(2){animation:blink .9s ease .2s infinite}
.ai-dot:nth-child(3){animation:blink .9s ease .4s infinite}
.ai-chip{padding:6px 11px;border-radius:18px;font-size:11px;font-family:var(--fm);cursor:pointer;
  border:.5px solid var(--b2);background:var(--bg3);color:var(--t1);transition:all .15s;white-space:nowrap;display:inline-flex;align-items:center;gap:4px}
.ai-chip:hover{border-color:var(--teal);color:var(--teal);background:var(--td);transform:translateY(-1px)}
.ai-chip{transition:all .2s ease}

/* Smooth focus rings everywhere */
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{
  outline:2px solid var(--teal);outline-offset:2px;border-radius:6px;
}

/* Loading skeleton — gentle pulsing placeholder */
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}
.skeleton{background:linear-gradient(90deg,var(--bg2) 25%,var(--bg3) 50%,var(--bg2) 75%);
  background-size:200px 100%;animation:shimmer 1.4s ease-in-out infinite;border-radius:6px}

/* Cards lift gently on hover (when interactive) */
.lift{transition:transform .25s cubic-bezier(.4,0,.2,1),border-color .15s,box-shadow .25s}
.lift:hover{transform:translateY(-2px)}

/* Smooth tab transitions */
@keyframes fadeSlide{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fade-in{animation:fadeSlide .35s cubic-bezier(.4,0,.2,1) both}

/* Soft scroll for prefers-reduced-motion */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;
    transition-duration:.01ms!important;scroll-behavior:auto!important}
}

/* Friendlier disabled state */
button:disabled{cursor:not-allowed!important}

/* Tooltip helper */
[title]:hover{cursor:help}

/* Button press feedback */
button:active{transform:scale(.97)}

/* Modals smooth in */
@keyframes modalIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}

/* Toasts pulse subtly to draw eye */
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.ai-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-family:var(--fm);
  padding:2px 7px;border-radius:4px;background:var(--pd);color:var(--purple);border:.5px solid rgba(155,109,255,.32)}
.anomaly-pulse{animation:pulse 1.5s ease infinite}

@media(max-width:1024px){
  .prov-grid{grid-template-columns:220px 1fr}
  .g4{grid-template-columns:repeat(2,1fr)}
  .g3{grid-template-columns:repeat(2,1fr)}
  .ai-panel{width:340px}
}
@media(max-width:768px){
  .hdr-nav{display:none}.bot-nav{display:grid}
  .wrap{padding:12px 14px calc(78px + env(safe-area-inset-bottom,0px))}
  .node-grid{grid-template-columns:1fr;gap:12px}
  .g4{grid-template-columns:1fr 1fr;gap:10px}
  .g3{grid-template-columns:1fr}.g2{grid-template-columns:1fr}
  .two-col{grid-template-columns:1fr}.prov-grid{grid-template-columns:1fr}
  .form-2{grid-template-columns:1fr}
  .jdesk{display:none}.jmob{display:flex;flex-direction:column;gap:8px}
  .job-box{background:transparent!important;border:none!important;border-radius:0!important;overflow:visible!important}
  .ai-panel{width:calc(100vw - 28px);right:14px;bottom:70px;max-height:63vh}
  .ai-fab{bottom:76px;right:16px}
}
@media(max-width:420px){.g4{grid-template-columns:1fr 1fr}}
`;

// ─── API CLIENT ───────────────────────────────────────────────────────────────
// Talks to the Decompute backend. Falls back to demo data when backend is offline.
const API_BASE =
  (typeof window !== "undefined" && window.DECOMPUTE_API_BASE) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://localhost:3000";
const TOKEN_KEY = "decompute_token";
const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

async function api(method, path, body, extraHeaders) {
  const token = getToken();
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { const e = await r.json(); msg = e.error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

async function uploadJobInput(file) {
  const token = getToken();
  const r = await fetch(`${API_BASE}/api/jobs/inputs`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-Decompute-Filename": encodeURIComponent(file.name || "input.bin"),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
    },
    body: file,
  });
  if (!r.ok) {
    let message = `Input upload failed (${r.status})`;
    try { message = (await r.json()).error || message; } catch {}
    throw new Error(message);
  }
  return (await r.json()).data;
}

// Convert backend node row → UI display shape
function nodeFromApi(n) {
  const tierMap = {starter:"Starter",professional:"Professional",enterprise:"Enterprise",hyperscale:"Hyperscale"};
  const total = n.gpu_count || 1;
  return {
    id: n.id,
    name: n.name || "Unnamed",
    provider: n.provider_name || "Provider",
    location: n.country_code ? `${n.city || ""} ${n.country_code}`.trim() : "—",
    gpu: `${n.gpu_count}× ${n.gpu_model}`,
    vram: `${parseFloat(n.vram_gb || 0).toFixed(0)}GB`,
    ram: `${parseFloat(n.ram_gb || 0).toFixed(0)}GB`,
    bw: n.network_gbps ? `${n.network_gbps}Gbps` : "—",
    uptime: `${parseFloat(n.uptime_pct || 100).toFixed(2)}%`,
    rep: Math.round(parseFloat(n.trust_score || 50)),
    tier: tierMap[n.tier] || "Starter",
    price: parseFloat(n.price_per_hour || 0),
    avail: total,
    total,
    tags: n.tee_types?.length ? n.tee_types : ["FP16"],
    attest: n.has_tee ? (n.tee_types?.join("+") || "TEE") : "None",
    tee: !!n.has_tee,
    status: n.status === "available" ? "available" : n.status === "busy" ? "limited" : "offline",
    aiScore: Math.round(parseFloat(n.quality_score || 50)),
    useCase: n.description || `${n.gpu_model} compute node`,
  };
}

const formatDur = (ms) => { const m = Math.floor(ms/60000); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`; };

function jobFromApi(j) {
  // No "matching"/"completing" — matching happens synchronously inside
  // POST /api/jobs (a job is created already matched to a node, or the
  // request fails outright), so those states never occur in the backend's
  // `status` at all.
  const statusMap = {pending:"queued",running:"running",done:"completed",failed:"completed",cancelled:"completed"};
  const status = statusMap[j.status] || "queued";

  const maxHours = parseFloat(j.max_runtime_hours || 0);
  const startedMs = j.started_at ? new Date(j.started_at).getTime() : null;
  const elapsedMs = startedMs ? Date.now() - startedMs : 0;
  // A batch parent has a real, counted fraction of children finished —
  // strictly better than the time-based guess a single job has to make,
  // so prefer it whenever the backend supplies one.
  const prog = j.progress_fraction !== undefined ? Math.round(j.progress_fraction * 100)
    : status === "completed" ? 100
    : status === "running" && maxHours > 0 ? Math.min(99, Math.round((elapsedMs / (maxHours * 3_600_000)) * 100))
    : 0;
  const eta = status === "running" && maxHours > 0
    ? formatDur(Math.max(0, maxHours * 3_600_000 - elapsedMs))
    : "—";

  return {
    id: j.id,
    name: j.name,
    node: j.node_name || "Pending match",
    vramGb: parseFloat(j.node_vram_gb || 80),
    status,
    // The raw backend status, kept alongside the collapsed `status` above
    // (which folds done/failed/cancelled all into "completed") — needed to
    // tell a genuine failure apart from a normal finish, e.g. to offer
    // "Retry with the same settings" only where it's relevant.
    rawStatus: j.status,
    prog,
    elapsed: startedMs ? formatDur(elapsedMs) : "—",
    eta,
    cost: parseFloat(j.actual_cost || j.estimated_cost || 0),
    gpu: parseFloat(j.avg_gpu_usage || 0),
    anomaly: false,
    aiInsight: j.statusMessage || `Status: ${j.status}`,
    hasArtifact: !!j.has_artifact,
    // The original submission spec, carried along so a failed job can be
    // resubmitted identically without the renter re-entering anything.
    dockerImage: j.docker_image,
    workloadId: j.workload_id,
    executionSource: j.execution_source || "community",
    gpusNeeded: j.gpus_needed,
    minVramGb: j.min_vram_gb,
    maxRuntimeHours: maxHours,
    envVars: j.env_vars,
    retryOfJobId: j.retry_of_job_id,
    retryCount: j.retry_count,
    // Batch fields — undefined/false for an ordinary job. `children` is
    // only present on a full GET /:id fetch (see LiveJobView), not the
    // list view, so it's mapped here rather than assumed to always exist.
    isBatch: !!j.is_batch,
    childCount: j.child_count || 0,
    children: j.children ? j.children.map(jobFromApi) : null,
  };
}

// job artifacts (e.g. a generated image) are binary and auth-scoped, so a
// plain <img src> can't fetch them directly — this mirrors api()'s auth
// header but returns a blob: URL for the caller to revoke when done.
// contentType comes along so callers can tell a single image (inline
// preview) apart from a multi-image zip (download-only).
async function fetchArtifactUrl(jobId) {
  const token = getToken();
  const r = await fetch(`${API_BASE}/api/jobs/${jobId}/artifact`, {
    headers: token ? { "Authorization": `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error(`Request failed (${r.status})`);
  const blob = await r.blob();
  return { url: URL.createObjectURL(blob), contentType: r.headers.get("content-type") || blob.type };
}

// Demo fallback data — used when backend is offline so the UI keeps working
const DEMO_NODES = [
  {id:"n1",name:"Titan Cluster A7",provider:"NeuroPeak Labs",location:"Frankfurt, DE",
   gpu:"8× NVIDIA H100 SXM",vram:"640GB",ram:"1.5TB",bw:"400Gbps InfiniBand",
   uptime:"99.97%",rep:98,tier:"Enterprise",price:12.80,avail:14,total:20,
   tags:["FP16","BF16","NVLink"],attest:"SGX+TDX",tee:true,status:"available",
   aiScore:96,useCase:"LLM fine-tuning, frontier inference, distributed training"},
  {id:"n2",name:"Apex Node Cluster",provider:"CloudForge Inc",location:"Ashburn, VA",
   gpu:"4× NVIDIA A100 80GB",vram:"320GB",ram:"768GB",bw:"200Gbps RDMA",
   uptime:"99.91%",rep:94,tier:"Professional",price:5.40,avail:8,total:12,
   tags:["FP16","INT8","TensorRT"],attest:"Intel TDX",tee:true,status:"available",
   aiScore:89,useCase:"Inference serving, LoRA fine-tuning, embedding pipelines"},
  {id:"n3",name:"Sovereign Pod γ",provider:"ArkMesh Network",location:"Singapore, SG",
   gpu:"6× NVIDIA L40S",vram:"288GB",ram:"512GB",bw:"100Gbps Ethernet",
   uptime:"99.88%",rep:91,tier:"Professional",price:4.20,avail:3,total:6,
   tags:["FP8","FP16","Video"],attest:"AMD SEV-SNP",tee:true,status:"limited",
   aiScore:82,useCase:"Video generation, diffusion models, multimedia AI"},
  {id:"n4",name:"EdgeBurst X1",provider:"DistributedAI.io",location:"Toronto, CA",
   gpu:"2× NVIDIA RTX 4090",vram:"48GB",ram:"128GB",bw:"10Gbps",
   uptime:"99.45%",rep:82,tier:"Starter",price:0.86,avail:22,total:22,
   tags:["FP16","Consumer"],attest:"None",tee:false,status:"available",
   aiScore:64,useCase:"Dev & test, small model inference, rapid prototyping"},
  {id:"n5",name:"NebulaCore Ω",provider:"Zenith Compute",location:"Tokyo, JP",
   gpu:"16× AMD MI300X",vram:"1.28TB HBM3",ram:"3TB",bw:"800Gbps NDR",
   uptime:"99.99%",rep:99,tier:"Hyperscale",price:28.60,avail:2,total:4,
   tags:["ROCm","FP8","Petabyte+"],attest:"SEV-SNP+TPM",tee:true,status:"limited",
   aiScore:99,useCase:"Frontier model training, MoE, multi-trillion parameter runs"},
  {id:"n6",name:"Helios Array β",provider:"StellarMind HPC",location:"Amsterdam, NL",
   gpu:"8× NVIDIA RTX 6000 Ada",vram:"384GB",ram:"512GB",bw:"100Gbps RDMA",
   uptime:"99.78%",rep:88,tier:"Professional",price:3.60,avail:0,total:8,
   tags:["FP16","Rendering","Ada"],attest:"Intel TDX",tee:true,status:"offline",
   aiScore:78,useCase:"3D rendering, NeRF, diffusion, video encoding"},
];

const DEMO_JOBS = [
  {id:"j1",name:"LLaMA-3.1 405B Fine-tune",node:"Titan Cluster A7",status:"running",
   prog:67,elapsed:"2h 14m",eta:"1h 08m",cost:28.97,gpu:94,anomaly:false,
   aiInsight:"On pace. GPU utilization is optimal at 94%. ETA confirmed at 1h08m. Cost tracking at $12.94/B tokens — 8% below avg."},
  {id:"j2",name:"Stable Diffusion XL Batch",node:"Apex Node Cluster",status:"running",
   prog:31,elapsed:"0h 44m",eta:"1h 38m",cost:3.96,gpu:61,anomaly:true,
   aiInsight:"⚠ GPU utilization dropped to 61% vs baseline 88%. Likely I/O bottleneck on dataset prefetch. Try: --num-workers 8 --pin-memory true. Expected +23% throughput."},
  {id:"j3",name:"BERT Embeddings Pipeline",node:"EdgeBurst X1",status:"queued",
   prog:0,elapsed:"—",eta:"~45m",cost:0,gpu:0,anomaly:false,
   aiInsight:"💡 Estimated queue wait: 8 min. Apex Node Cluster has 3 idle A100 slots right now — would finish 18 minutes faster at $0.40 more total cost."},
  {id:"j4",name:"Mistral-7B Inference Bench",node:"Helios Array β",status:"completed",
   prog:100,elapsed:"0h 18m",eta:"—",cost:1.08,gpu:0,anomaly:false,
   aiInsight:"✅ Completed 4min ahead of estimate. 1.2B tokens at $0.90/B — 23% better than network avg. RTX 6000 Ada proved well-suited for quantized Mistral."},
];

// ─── GLOBAL APP STATE ─────────────────────────────────────────────────────────
const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

// ─── JOB CATALOG ──────────────────────────────────────────────────────────────
// One catalog backs both Advanced mode (NewJobModal, shows everything below)
// and Simple mode (QuickStartLauncher/CreateTab, which only offers entries
// carrying a `simple` block, with friendlier framing over the same
// dockerImage/inputs — not a second, separate job system.
const JOB_CATALOG = [
  {
    id: "llm-finetune",
    icon: Bot,
    name: "Fine-tune a Language Model",
    short: "Train a chatbot or assistant on your data",
    description: "Teach a language model to write in your style or answer questions about your data. Upload a CSV or JSONL file with examples.",
    dockerImage: "ghcr.io/decompute/templates/llm-finetune:latest",
    minVramGb: 24,
    maxRuntimeHours: 6,
    needsSecurity: false,
    estimatedCost: "$15–$80",
    estimatedTime: "1–4 hours",
    popularity: 94,
    simple: { title: "Train on my data", sub: "Make AI that knows your stuff", color: "var(--amber)",
      achievementId: "first_finetune", achievementLabel: "Model Trainer" },
    inputs: [
      { key: "base_model", label: "Starting model", type: "select",
        options: [
          { value: "llama-3.1-8b", label:"Llama 3.1 8B (fast, good for most cases)" },
          { value: "llama-3.1-70b", label:"Llama 3.1 70B (slower, much smarter)" },
          { value: "mistral-7b", label:"Mistral 7B (great balance)" },
        ],
        default: "llama-3.1-8b" },
      { key: "training_data", label: "Your training data", type: "file",
        accept: ".csv,.jsonl,.txt", required: true,
        hint: "A CSV or JSONL file with examples of what you want the model to learn" },
      { key: "epochs", label: "Training rounds", type: "number", default: 3, min: 1, max: 20,
        hint: "More rounds = better learning but takes longer. 3 is a good default." },
    ],
  },
  {
    id: "image-generation",
    icon: Palette,
    name: "Generate Images",
    short: "Create art with Flux or Stable Diffusion",
    description: "Generate beautiful images from text descriptions. Great for art, design mockups, or content creation.",
    // Real, working stand-in (see job-templates/image-gen) — renders every
    // prompt line x count_per_prompt with Stable Diffusion 1.4 regardless
    // of the "Style" selection below, until a real multi-model pipeline
    // replaces it. Built and tagged locally for now
    // (docker build -t decompute/image-gen:local), not published to a
    // registry, so only a node whose operator built it locally can
    // actually run it.
    dockerImage: "decompute/image-gen:local",
    minVramGb: 8,
    // Real ceiling for the actual stand-in job (generation itself is well
    // under a minute; this pads for a cold Stable Diffusion 1.4 download on
    // a node that hasn't run it before) — not 1 hour, which used to make
    // progress/ETA meaningless for a job that finishes in seconds.
    maxRuntimeHours: 0.25,
    needsSecurity: false,
    estimatedCost: "$2–$8",
    estimatedTime: "5–30 minutes",
    popularity: 88,
    simple: { title: "Generate images", sub: "Create art from text descriptions", color: "var(--purple)",
      achievementId: "first_image", achievementLabel: "Image Creator" },
    inputs: [
      { key: "prompts", label: "What to generate", type: "textarea",
        placeholder: "A serene mountain lake at sunset, photorealistic\nA futuristic city skyline, cyberpunk style",
        hint: "One prompt per line. Each line creates one image.", required: true },
      { key: "model", label: "Style", type: "select",
        options: [
          { value: "flux-dev", label:"Flux Dev (photorealistic, high quality)" },
          { value: "flux-schnell", label:"Flux Schnell (fast, good quality)" },
          { value: "sdxl", label:"Stable Diffusion XL (artistic, versatile)" },
        ],
        default: "flux-schnell" },
      { key: "count_per_prompt", label: "Images per prompt", type: "number", default: 4, min: 1, max: 16 },
    ],
  },
  {
    id: "train-classifier",
    icon: Brain,
    name: "Train a Classifier",
    short: "Teach an AI to sort things into categories",
    description: "Train a model to classify images, text, or data. Examples: sort photos, detect spam, identify products.",
    dockerImage: "ghcr.io/decompute/templates/classifier-trainer:latest",
    minVramGb: 12,
    maxRuntimeHours: 3,
    needsSecurity: false,
    estimatedCost: "$3–$25",
    estimatedTime: "30 min – 2 hours",
    popularity: 76,
    inputs: [
      { key: "data_type", label: "What are you classifying?", type: "select",
        options: [
          { value: "image", label:"Images (photos, diagrams)" },
          { value: "text", label:"Text (reviews, comments, articles)" },
          { value: "tabular", label:"Spreadsheet data" },
        ],
        default: "image" },
      { key: "training_data", label: "Your data (zipped folder of examples)", type: "file",
        accept: ".zip", required: true,
        hint: "Folder structure: train/category-name/example1.jpg, train/category-name/example2.jpg, etc." },
      { key: "test_split", label: "% to hold out for testing", type: "number", default: 20, min: 5, max: 40 },
    ],
  },
  {
    id: "transcribe-audio",
    icon: Mic,
    name: "Transcribe Audio",
    short: "Convert speech to text using Whisper",
    description: "Turn podcasts, meetings, lectures, or any audio into accurate text transcripts in 100+ languages.",
    dockerImage: "ghcr.io/decompute/templates/whisper-transcribe:latest",
    minVramGb: 8,
    maxRuntimeHours: 2,
    needsSecurity: false,
    estimatedCost: "$0.50–$5",
    estimatedTime: "10 min – 1 hour",
    popularity: 82,
    simple: { title: "Transcribe audio", sub: "Turn voice into text instantly", color: "var(--blue)",
      achievementId: "first_transcribe", achievementLabel: "Voice Magic" },
    inputs: [
      { key: "audio_files", label: "Audio files", type: "file",
        accept: "audio/*,video/*", required: true, multiple: true,
        hint: "MP3, WAV, M4A, MP4 — pretty much anything. Drop multiple files at once." },
      { key: "language", label: "Language", type: "select",
        options: [
          { value: "auto", label:"Auto-detect" },
          { value: "en", label:"English" },
          { value: "es", label:"Spanish" },
          { value: "fr", label:"French" },
          { value: "de", label:"German" },
          { value: "zh", label:"Chinese" },
          { value: "ja", label:"Japanese" },
        ],
        default: "auto" },
      { key: "include_timestamps", label: "Include timestamps", type: "toggle", default: true },
    ],
  },
  {
    id: "text-embeddings",
    icon: Database,
    name: "Create Text Embeddings",
    short: "Turn independent text records into search vectors",
    description: "Create deterministic vector embeddings for semantic search, recommendations, and retrieval. Each line can run as an independent batch unit.",
    dockerImage: "decompute/embeddings:local",
    minVramGb: 2,
    maxRuntimeHours: 0.25,
    needsSecurity: false,
    estimatedCost: "$0.05–$1",
    estimatedTime: "1–10 minutes",
    popularity: 80,
    inputs: [
      { key: "texts", label: "Text records", type: "textarea", required: true,
        placeholder: "First document or sentence\nSecond document or sentence",
        hint: "One independent record per line; batches are distributed across community nodes." },
      { key: "normalize", label: "Normalize vectors", type: "toggle", default: true },
    ],
  },
  {
    id: "video-generation",
    icon: Clapperboard,
    name: "Generate Video",
    short: "Create short videos from text or images",
    description: "Animate text descriptions or still images into short video clips. Great for content, ads, social media.",
    dockerImage: "ghcr.io/decompute/templates/video-gen:latest",
    minVramGb: 40,
    maxRuntimeHours: 2,
    needsSecurity: false,
    estimatedCost: "$8–$40",
    estimatedTime: "20 min – 2 hours",
    popularity: 67,
    simple: { title: "Generate video", sub: "Bring text or images to life", color: "var(--red)",
      achievementId: "first_video", achievementLabel: "Director" },
    inputs: [
      { key: "prompt", label: "Describe your video", type: "textarea",
        placeholder: "A cat doing a backflip in slow motion, cinematic lighting",
        required: true },
      { key: "duration", label:"Length (seconds)", type:"number", default: 5, min: 2, max: 30 },
      { key: "style", label:"Style", type:"select",
        options: [
          { value: "realistic", label:"Realistic" },
          { value: "anime", label:"Anime" },
          { value: "3d", label:"3D animation" },
          { value: "stop-motion", label:"Stop motion" },
        ],
        default: "realistic" },
    ],
  },
  {
    id: "jupyter-lab",
    icon: NotebookPen,
    name: "Jupyter Notebook",
    short: "Launch a notebook with a GPU attached",
    description: "Get a Jupyter Lab environment with PyTorch, TensorFlow, and Hugging Face pre-installed. Perfect for experimentation.",
    dockerImage: "ghcr.io/decompute/templates/jupyter-pytorch:latest",
    minVramGb: 16,
    maxRuntimeHours: 4,
    needsSecurity: false,
    estimatedCost: "$5–$30",
    estimatedTime: "Your choice (up to 4 hours)",
    popularity: 91,
    simple: { title: "Open a notebook", sub: "For developers — get a Jupyter with GPU", color: "var(--t1)",
      achievementId: "first_notebook", achievementLabel: "Researcher" },
    inputs: [
      { key: "password", label: "Set a password for your notebook", type: "password",
        placeholder: "Pick something secure", required: true,
        hint: "You'll use this to access your notebook in the browser." },
      { key: "framework", label: "Pre-installed frameworks", type: "select",
        options: [
          { value: "pytorch", label:"PyTorch + transformers + datasets" },
          { value: "tensorflow", label:"TensorFlow + Keras" },
          { value: "both", label:"Both (PyTorch + TensorFlow)" },
        ],
        default: "pytorch" },
    ],
  },
  {
    id: "custom",
    icon: Wrench,
    name: "Custom Job",
    short: "Run your own Docker container",
    description: "For developers: bring your own Docker image and run anything you want.",
    custom: true,
    popularity: 35,
    minVramGb: 8,
    maxRuntimeHours: 4,
  },
];

// Builds envVars the normal way (DECOMPUTE_-prefixed, matching every
// template's expectations) plus, only for image-generation, a `units`
// array — one entry per image actually requested, flattening "prompts"
// (one line per subject) x count_per_prompt (copies of each) into a flat
// list. POST /api/jobs fans a multi-unit request out across as many nodes
// as are available (see server/src/lib/jobBatch.js) instead of running
// every image sequentially on one — units are independent, self-contained
// outputs, the one shape of "split across the network" that's actually
// safe (see the long thread on why: no request is ever split mid-flight,
// only ever handed out as whole, separate jobs).
function buildEnvVarsAndUnits(template, values) {
  const envVars = Object.fromEntries(
    Object.entries(values).filter(([k]) => template.inputs?.some(i => i.key === k && i.type !== "file"))
      .map(([k, v]) => [`DECOMPUTE_${k.toUpperCase()}`, String(v)])
  );

  if (template.id === "text-embeddings" && values.texts) {
    const lines = String(values.texts).split("\n").map(s => s.trim()).filter(Boolean);
    const units = lines.map(line => ({ DECOMPUTE_TEXTS: line }));
    if (units.length > 1) return { envVars, units };
  }

  if (template.id === "image-generation" && values.prompts) {
    const lines = String(values.prompts).split("\n").map(s => s.trim()).filter(Boolean);
    const countPerPrompt = Math.max(1, Math.min(16, parseInt(values.count_per_prompt, 10) || 1));
    const units = [];
    for (const line of lines) {
      for (let i = 0; i < countPerPrompt; i++) {
        // Each unit carries its own count_per_prompt:"1" override too, so
        // a child never re-applies the original (possibly much larger)
        // count on top of lines it already received one-per-image — envVars
        // itself is left untouched on purpose, so the parent job's stored
        // spec still reads as the original request for retry/display.
        units.push({ DECOMPUTE_PROMPTS: line, DECOMPUTE_COUNT_PER_PROMPT: "1" });
      }
    }
    if (units.length > 1) return { envVars, units };
  }

  return { envVars, units: null };
}

// ─── BROWSER NOTIFICATIONS ────────────────────────────────────────────────────
// Asks the browser to show a notification when a job is done.
async function askForNotificationPermission() {
  if (!("Notification"in window)) return"unsupported";
  if (Notification.permission === "granted") return"granted";
  if (Notification.permission === "denied") return"denied";
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch { return "denied"; }
}

function showBrowserNotification(title, body, icon = "🎉") {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body, icon: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${icon}</text></svg>`,
      tag: "decompute", silent: false,
    });
  } catch {}
}

function AppProvider({ children }) {
  const [nodes, setNodes] = useState(DEMO_NODES);
  const [jobs, setJobs] = useState(DEMO_JOBS);
  const [user, setUser] = useState(null);
  const [backendOnline, setBackendOnline] = useState(false);
  const [availableWorkloads, setAvailableWorkloads] = useState(JOB_CATALOG.filter(t => t.id !== "custom").map(t => t.id));
  const [toast, setToast] = useState(null);
  const [notifyPermission, setNotifyPermission] = useState(() => {
    try { return typeof Notification !== "undefined" ? Notification.permission : "unsupported"; }
    catch { return "unsupported"; }
  });
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [signupOpen, setSignupOpen] = useState(false);
  const [addFundsOpen, setAddFundsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Marketplace");
  const [shareModal, setShareModal] = useState(null); // {kind, data}
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [quickStartOutcome, setQuickStartOutcome] = useState(null); // jump straight to an outcome
  // Simple Mode: hides everything technical. ON by default — most people
  // want to make something, not shop for GPUs. Power users turn it off.
  const [simpleMode, setSimpleMode] = useState(() => {
    try {
      const saved = localStorage.getItem("decompute_simple_mode");
      return saved === null ? true : saved === "1";
    } catch { return true; }
  });
  const [referralOpen, setReferralOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [achievements, setAchievements] = useState(() => {
    try { return JSON.parse(localStorage.getItem("decompute_achievements") || "[]"); }
    catch { return []; }
  });
  const [achievementUnlock, setAchievementUnlock] = useState(null);
  const prevJobsRef = useRef([]);

  const unlockAchievement = useCallback((id, label, icon) => {
    if (achievements.includes(id)) return;
    const next = [...achievements, id];
    setAchievements(next);
    try { localStorage.setItem("decompute_achievements", JSON.stringify(next)); } catch {}
    setAchievementUnlock({ id, label, icon });
    setTimeout(() => setAchievementUnlock(null), 5000);
  }, [achievements]);

  const openShare = useCallback((kind, data) => setShareModal({ kind, data }), []);
  const closeShare = useCallback(() => setShareModal(null), []);
  const openQuickStart = useCallback((outcomeId = null) => {
    setQuickStartOutcome(outcomeId);
    setQuickStartOpen(true);
  }, []);
  const closeQuickStart = useCallback(() => {
    setQuickStartOpen(false);
    setQuickStartOutcome(null);
  }, []);
  const toggleSimpleMode = useCallback(() => {
    setSimpleMode(m => {
      const next = !m;
      try { localStorage.setItem("decompute_simple_mode", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);
  const openReferral = useCallback(() => setReferralOpen(true), []);
  const closeReferral = useCallback(() => setReferralOpen(false), []);
  const openEmbed = useCallback(() => setEmbedOpen(true), []);
  const closeEmbed = useCallback(() => setEmbedOpen(false), []);

  // Auto-generate a referral code for each user (deterministic from wallet/id)
  const referralCode = useMemo(() => {
    if (!user) return null;
    const seed = user.id || user.wallet || "anon";
    // Simple hash → 6-character code
    let h = 0;
    for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h + seed.charCodeAt(i)) | 0; }
    return "DECO" + Math.abs(h).toString(36).toUpperCase().slice(0, 4);
  }, [user]);

  const openSignup = useCallback(() => setSignupOpen(true), []);
  const closeSignup = useCallback(() => setSignupOpen(false), []);
  const openAddFunds = useCallback(() => setAddFundsOpen(true), []);
  const closeAddFunds = useCallback(() => setAddFundsOpen(false), []);

  const startTour = useCallback(() => {
    setTourStep(0);
    setTourActive(true);
  }, []);

  const endTour = useCallback(() => {
    setTourActive(false);
    setTourStep(0);
    try { localStorage.setItem("decompute_tour_completed", "1"); } catch {}
  }, []);

  const nextTourStep = useCallback(() => {
    setTourStep(s => s + 1);
  }, []);

  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Pick up a Stripe Checkout redirect back to the app (?topup=success&checkout_id=…)
  // and reopen the add-funds modal straight into its confirming step.
  const [pendingTopupId, setPendingTopupId] = useState(null);
  const clearPendingTopup = useCallback(() => setPendingTopupId(null), []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const topup = params.get("topup");
    if (topup === "success" && params.get("checkout_id")) {
      setPendingTopupId(params.get("checkout_id"));
      setAddFundsOpen(true);
    } else if (topup === "cancel") {
      showToast("Payment cancelled", "info");
    }
    if (topup) {
      params.delete("topup"); params.delete("checkout_id");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, [showToast]);

  // Try to connect to backend on startup
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await api("GET", "/health");
        if (!alive) return;
        setBackendOnline(true);
        try {
          const { data } = await api("GET", "/api/jobs/workloads");
          if (alive && Array.isArray(data)) setAvailableWorkloads(data.map(w => w.id));
        } catch {}
        try {
          const { data } = await api("GET", "/api/nodes?limit=50");
          if (alive && data?.length > 0) setNodes(data.map(nodeFromApi));
        } catch {}
        if (getToken()) {
          try {
            const me = await api("GET", "/api/auth/me");
            if (alive) setUser(me);
            const myJobs = await api("GET", "/api/jobs?limit=50");
            if (alive && myJobs?.data?.length > 0) setJobs(myJobs.data.map(jobFromApi));
          } catch { setToken(null); }
        }
      } catch { /* backend offline — demo mode is fine */ }
    })();
    return () => { alive = false; };
  }, []);

  // Auto-refresh every 30s when backend is online
  useEffect(() => {
    if (!backendOnline) return;
    const refresh = async () => {
      try {
        const { data } = await api("GET", "/api/nodes?limit=50");
        if (data?.length > 0) setNodes(data.map(nodeFromApi));
      } catch {}
      if (user) {
        try {
          const myJobs = await api("GET", "/api/jobs?limit=50");
          if (myJobs?.data) setJobs(myJobs.data.map(jobFromApi));
        } catch {}
        // Balance moves server-side outside of any button click too — a
        // job settling (refund or payout) is the main case — so it needs
        // its own periodic refetch rather than piggybacking on an action.
        try {
          const me = await api("GET", "/api/auth/me");
          setUser(me);
        } catch {}
      }
    };
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [backendOnline, user]);

  // Listen for auth changes (e.g. signup) — refetch user
  useEffect(() => {
    const handler = async () => {
      if (!getToken()) return;
      try {
        const me = await api("GET", "/api/auth/me");
        setUser(me);
        const myJobs = await api("GET", "/api/jobs?limit=50");
        if (myJobs?.data) setJobs(myJobs.data.map(jobFromApi));
      } catch {}
    };
    window.addEventListener("decompute-auth-changed", handler);
    return () => window.removeEventListener("decompute-auth-changed", handler);
  }, []);

  // Notify on job completion / failure
  useEffect(() => {
    if (!prevJobsRef.current.length) { prevJobsRef.current = jobs; return; }
    for (const job of jobs) {
      const prev = prevJobsRef.current.find(p => p.id === job.id);
      if (prev && prev.status === "running"&& job.status ==="completed") {
        showBrowserNotification("Your job is done! 🎉", `"${job.name}" finished successfully.`, "🎉");
      }
    }
    prevJobsRef.current = jobs;
  }, [jobs]);

  const requestNotifications = useCallback(async () => {
    const result = await askForNotificationPermission();
    setNotifyPermission(result);
    if (result === "granted") {
      showToast("We'll let you know when your jobs finish!","success");
      showBrowserNotification("Notifications on!", "We'll ping you when something happens.", "🔔");
    } else if (result === "denied") {
      showToast("Notifications blocked. You can enable them in your browser settings.", "info");
    }
    return result;
  }, []);

  const login = useCallback(async () => {
    if (!window.ethereum) {
      showToast("No wallet found. Install MetaMask or Coinbase Wallet.", "error");
      return false;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const wallet = accounts[0];
      const { message } = await api("POST", "/api/auth/login-message", { wallet });
      const signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, wallet],
      });
      const result = await api("POST", "/api/auth/login", { wallet, signature });
      setToken(result.token);
      setUser(result.user);
      showToast(result.welcome || "Welcome!", "success");
      return true;
    } catch (err) {
      showToast(err.message || "Login failed", "error");
      return false;
    }
  }, [showToast]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setJobs(DEMO_JOBS);
    showToast("Logged out.", "info");
  }, [showToast]);

  const submitJob = useCallback(async (spec) => {
    if (!user) { showToast("Please connect your wallet first.","error"); return null; }
    if (!backendOnline) { showToast("Demo mode — start the backend to submit real jobs.","info"); return null; }
    try {
      const { data } = await api("POST","/api/jobs", spec);
      showToast("Job submitted!","success");
      const myJobs = await api("GET","/api/jobs?limit=50");
      if (myJobs?.data) setJobs(myJobs.data.map(jobFromApi));
      // Job creation escrows its cost immediately server-side — refetch so
      // the balance shown in the header reflects that right away instead
      // of waiting for the next 30s poll.
      try { setUser(await api("GET", "/api/auth/me")); } catch {}
      // Transformed, not the raw row — callers (QuickStartLauncher,
      // NewJobModal) hand this straight to openLiveJob/LiveJobView, which
      // expects jobFromApi's shape (.node/.cost/.prog/...), not the
      // backend's (.node_name/.estimated_cost/...).
      return jobFromApi(data);
    } catch (err) {
      showToast(err.message || "Failed to submit job", "error");
      return null;
    }
  }, [user, backendOnline, showToast]);

  const cancelJob = useCallback(async (jobId) => {
    if (!backendOnline) { showToast("Demo mode — start the backend to cancel jobs.", "info"); return; }
    try {
      await api("POST", `/api/jobs/${jobId}/cancel`);
      showToast("Job cancelled.","success");
      const myJobs = await api("GET","/api/jobs?limit=50");
      if (myJobs?.data) setJobs(myJobs.data.map(jobFromApi));
      try { setUser(await api("GET", "/api/auth/me")); } catch {}
    } catch (err) {
      showToast(err.message || "Failed to cancel", "error");
    }
  }, [backendOnline, showToast]);

  const registerNode = useCallback(async (body, extraHeaders) => {
    if (!user) { showToast("Please connect your wallet first.","error"); return null; }
    if (!backendOnline) { showToast("Demo mode — start the backend to register nodes.","info"); return null; }
    try {
      const result = await api("POST","/api/nodes", body, extraHeaders);
      showToast("Node registered!","success");
      return result;
    } catch (err) {
      showToast(err.message || "Failed to register", "error");
      return null;
    }
  }, [user, backendOnline, showToast]);

  // Whether a job the stuck-job reaper refunds should be auto-resubmitted
  // to a different node, vs. left for the renter to retry by hand — the
  // one user-editable setting so far, so this doesn't need a general
  // "update settings" abstraction yet.
  const setAutoRetryFailedJobs = useCallback(async (enabled) => {
    if (!backendOnline) { showToast("Demo mode — start the backend to change settings.", "info"); return; }
    try {
      const updated = await api("PATCH", "/api/auth/me", { autoRetryFailedJobs: enabled });
      setUser(updated);
      showToast(enabled ? "Failed jobs will now retry automatically." : "Auto-retry turned off.", "success");
    } catch (err) {
      showToast(err.message || "Couldn't update setting", "error");
    }
  }, [backendOnline, showToast]);

  // The live-progress view for one job. Global (not local to MyJobs) so
  // any submission flow — QuickStartLauncher, NewJobModal — can jump
  // straight to watching the job it just created, from whatever tab it
  // was opened from.
  const [liveJob, setLiveJob] = useState(null);
  const openLiveJob = useCallback((job) => setLiveJob(job), []);
  const closeLiveJob = useCallback(() => setLiveJob(null), []);

  const value = useMemo(() => ({
    nodes, jobs, user, backendOnline, availableWorkloads, toast, notifyPermission,
    tourActive, tourStep, startTour, endTour, nextTourStep,
    signupOpen, openSignup, closeSignup,
    addFundsOpen, openAddFunds, closeAddFunds,
    pendingTopupId, clearPendingTopup,
    activeTab, setActiveTab,
    shareModal, openShare, closeShare,
    quickStartOpen, openQuickStart, closeQuickStart, quickStartOutcome,
    simpleMode, toggleSimpleMode,
    referralOpen, openReferral, closeReferral,
    embedOpen, openEmbed, closeEmbed,
    achievements, unlockAchievement, achievementUnlock,
    referralCode,
    liveJob, openLiveJob, closeLiveJob,
    login, logout, submitJob, cancelJob, registerNode, showToast, requestNotifications,
    setAutoRetryFailedJobs,
  }), [nodes, jobs, user, backendOnline, availableWorkloads, toast, notifyPermission, tourActive, tourStep,
       signupOpen, addFundsOpen, pendingTopupId, clearPendingTopup, activeTab, shareModal, quickStartOpen, quickStartOutcome,
       simpleMode, toggleSimpleMode, referralOpen, embedOpen,
       achievements, achievementUnlock, referralCode, liveJob, openLiveJob, closeLiveJob,
       login, logout, submitJob, cancelJob, registerNode, showToast, requestNotifications,
       startTour, endTour, nextTourStep, openSignup, closeSignup, openAddFunds, closeAddFunds,
       openShare, closeShare, openQuickStart, closeQuickStart, openReferral, closeReferral,
       openEmbed, closeEmbed, unlockAchievement, setAutoRetryFailedJobs]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

// ─── CLAUDE API ───────────────────────────────────────────────────────────────
const SYS = `You are Decompute AI — the intelligent assistant for a decentralized AI compute marketplace.

Platform: GPU compute rented from global providers. Trust comes from verified hardware, signed workloads, successful-job reputation, and supported isolation features—not provider wealth or collateral. Payment: USDC, 24h escrow settlement.

Available nodes:
- Titan Cluster A7: 8× H100 SXM, 640GB VRAM, $12.80/hr, Enterprise, Frankfurt, TEE verified, AI Score 96
- Apex Node Cluster: 4× A100 80GB, 320GB VRAM, $5.40/hr, Professional, Ashburn VA, TEE verified, AI Score 89
- Sovereign Pod γ: 6× L40S, 288GB VRAM, $4.20/hr, Professional, Singapore, limited slots, AI Score 82
- EdgeBurst X1: 2× RTX 4090, 48GB VRAM, $0.86/hr, Starter, Toronto, no TEE, AI Score 64
- NebulaCore Ω: 16× MI300X, 1.28TB VRAM, $28.60/hr, Hyperscale, Tokyo, limited, AI Score 99
- Helios Array β: 8× RTX 6000 Ada, 384GB VRAM, $3.60/hr, offline, Amsterdam

Be concise (2–4 sentences unless asked to elaborate). Use specific $ amounts. Use ✅ ⚠️ 💡 💰 🔐 contextually. Never hedge vaguely.`;

async function claude(messages, maxTokens = 700) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, system:SYS, messages }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content?.find(b => b.type==="text")?.text || "";
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const TC = {Hyperscale:"#9B6DFF",Enterprise:"#00D4A8",Professional:"#3B9EFF",Starter:"#F5A623"};
const SC = {available:"#00D4A8",limited:"#F5A623",offline:"#FF4D6A",running:"#00D4A8",queued:"#F5A623",completed:"#5C6880"};

const TierBadge = ({tier}) => (
  <span style={{fontSize:10,fontFamily:"var(--fm)",letterSpacing:".08em",padding:"3px 8px",
    borderRadius:4,whiteSpace:"nowrap",background:TC[tier]+"22",color:TC[tier],border:`0.5px solid ${TC[tier]}44`}}>
    {tier.toUpperCase()}
  </span>
);
const Dot = ({s}) => (
  <span style={{display:"inline-block",width:6,height:6,borderRadius:"50%",flexShrink:0,
    background:SC[s]||"#5C6880",marginRight:5,animation:["available","running"].includes(s)?"pulse 2s infinite":"none"}}/>
);
const Bar = ({v,c="#00D4A8",h=3}) => (
  <div style={{height:h,background:"var(--bg3)",borderRadius:2,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${Math.min(100,v||0)}%`,background:c,borderRadius:2,transition:"width .8s ease"}}/>
  </div>
);
const Pill = ({label,accent}) => (
  <span style={{fontSize:10,fontFamily:"var(--fm)",padding:"2px 7px",whiteSpace:"nowrap",
    borderRadius:4,background:accent?accent+"1a":"var(--bg3)",
    color:accent||"var(--t2)",border:`0.5px solid ${accent?accent+"44":"var(--b)"}`}}>{label}</span>
);
const Card = ({children,style={},onClick,accent}) => (
  <div onClick={onClick} className={onClick?"lift":""}
    style={{background:"var(--bg2)",border:".5px solid var(--b2)",
    borderRadius:"var(--r2)",padding:"18px 20px",position:"relative",
    transition:"border-color .2s,transform .25s cubic-bezier(.4,0,.2,1),box-shadow .25s",
    cursor:onClick?"pointer":"default",...style}}
    onMouseEnter={e=>{if(onClick){
      e.currentTarget.style.borderColor=(accent||"var(--teal)")+"66";
      e.currentTarget.style.boxShadow=`0 8px 24px ${(accent||"var(--teal)")}22`;
    }}}
    onMouseLeave={e=>{
      e.currentTarget.style.borderColor="var(--b2)";
      e.currentTarget.style.boxShadow="";
    }}>
    {children}
  </div>
);
const Btn = ({children,onClick,v="primary",full,disabled,style={}}) => {
  const vs={primary:{background:"var(--teal)",color:"#000"},ghost:{background:"var(--bg3)",color:"var(--t1)",border:".5px solid var(--b2)"},purple:{background:"var(--pd)",color:"var(--purple)",border:".5px solid rgba(155,109,255,.35)"},amber:{background:"var(--ad)",color:"var(--amber)",border:".5px solid rgba(245,166,35,.35)"}};
  return(
    <button onClick={onClick} disabled={disabled}
      style={{padding:"9px 18px",borderRadius:"var(--r)",fontSize:13,fontWeight:600,
        display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,
        width:full?"100%":undefined,whiteSpace:"nowrap",opacity:disabled?.45:1,
        cursor:disabled?"not-allowed":"pointer",transition:"opacity .15s,transform .1s",
        border:"none",...vs[v],...style}}
      onMouseDown={e=>!disabled&&(e.currentTarget.style.transform="scale(.97)")}
      onMouseUp={e=>e.currentTarget.style.transform=""}>
      {children}
    </button>
  );
};
const Spin = () => <div style={{width:15,height:15,border:"2px solid var(--b2)",borderTopColor:"var(--teal)",borderRadius:"50%",animation:"spin .7s linear infinite",flexShrink:0}}/>;
const Fld = ({label,placeholder,type="text",hint,value,onChange}) => (
  <div style={{marginBottom:13}}>
    <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{label}</label>
    <input type={type} placeholder={placeholder} value={value} onChange={onChange}
      style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
    {hint&&<p style={{fontSize:11,color:"var(--t2)",marginTop:5,lineHeight:1.5}}>{hint}</p>}
  </div>
);
const MStat = ({label,value,color="var(--teal)",size=16,sub}) => (
  <div style={{display:"flex",flexDirection:"column",gap:3}}>
    <span style={{fontSize:10,color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase",fontFamily:"var(--fm)"}}>{label}</span>
    <span style={{fontSize:size,fontFamily:"var(--fm)",fontWeight:500,color,lineHeight:1.1}}>{value}</span>
    {sub&&<span style={{fontSize:10,color:"var(--t2)"}}>{sub}</span>}
  </div>
);
function useIsMobile(bp=768){
  const[m,setM]=useState(()=>typeof window!=="undefined"&&window.innerWidth<=bp);
  useEffect(()=>{const fn=()=>setM(window.innerWidth<=bp);window.addEventListener("resize",fn,{passive:true});return()=>window.removeEventListener("resize",fn);},[bp]);
  return m;
}

// ─── TICKER ───────────────────────────────────────────────────────────────────
const Ticker = () => {
 const ev=["NeuroPeak Labs joined the network","Provider just earned $284.20","New computer online from Berlin","18,420 jobs running right now","4 new computers verified today","A user finished training their AI in 18 minutes","AI found great matches for 34 people this hour","Decompute is live in 47 countries"];
  return(
    <div style={{overflow:"hidden",background:"var(--bg1)",borderTop:".5px solid var(--b)",borderBottom:".5px solid var(--b)",padding:"8px 0"}}>
      <div style={{display:"flex",gap:48,whiteSpace:"nowrap",animation:"ticker 28s linear infinite",width:"max-content"}}>
        {[...ev,...ev].map((e,i)=><span key={i} style={{fontSize:11,fontFamily:"var(--fm)",color:"var(--t1)",flexShrink:0}}>{e}</span>)}
      </div>
    </div>
  );
};

// ─── HEADER / NAV ─────────────────────────────────────────────────────────────
const HeaderUserArea = ({setTab}) => {
  const { user, login, logout, backendOnline, showToast, notifyPermission, requestNotifications,
          openSignup, openAddFunds,
          openReferral, openEmbed, setAutoRetryFailedJobs } = useApp();
  const [working, setWorking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);

  const copyWallet = () => {
    if (!user?.wallet) return;
    navigator.clipboard?.writeText(user.wallet).then(
      () => showToast("Wallet address copied!","success"),
      () => showToast("Couldn't copy","error")
    );
  };

  const handleLogout = () => {
    setMenuOpen(false);
    if (confirm("Sign out of Decompute?")) logout();
  };

  if (!user) {
    return (
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span title={backendOnline?"Connected to the live network":"Showing example data — sign in to use the real network"}
          style={{fontSize:10,fontFamily:"var(--fm)",color:backendOnline?"var(--teal)":"var(--amber)",
          padding:"3px 8px",borderRadius:4,cursor:"help",
          background:backendOnline?"var(--td)":"var(--ad)",
          border:`.5px solid ${backendOnline?"rgba(0,212,168,.3)":"rgba(245,166,35,.3)"}`}}>
          {backendOnline?"● Live":"○ Demo"}
        </span>
        <button onClick={openSignup}
          style={{padding:"7px 14px",borderRadius:6,fontSize:12,fontWeight:600,
            background:"var(--teal)",color:"#000",border:"none",cursor:"pointer"}}>
          Sign in
        </button>
      </div>
    );
  }

  const short = user.wallet ? `${user.wallet.slice(0,6)}…${user.wallet.slice(-4)}` : "User";
  const initials = user.wallet ? user.wallet.slice(2,4).toUpperCase() : "U";
  const balance = parseFloat(user.balanceUsdc || 0).toFixed(2);
  const displayName = user.displayName || short;
  const role = user.role || "renter";

  return (
    <div style={{position:"relative",display:"flex",alignItems:"center",gap:10}} ref={menuRef}>
      <BalanceChip/>
      <button onClick={()=>setMenuOpen(o=>!o)} title="Account menu"
        aria-label="Open account menu" aria-expanded={menuOpen}
        style={{width:33,height:33,borderRadius:"50%",background:"var(--pd)",
          border:`.5px solid ${menuOpen?"var(--teal)":"var(--purple)"}`,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:11,fontFamily:"var(--fm)",fontWeight:600,
          color:menuOpen?"var(--teal)":"var(--purple)",cursor:"pointer",
          transition:"border-color .15s, color .15s"}}>
        {initials}
      </button>

      {menuOpen && (
        <div role="menu" style={{position:"absolute",top:"calc(100% + 8px)",right:0,
          width:280,background:"var(--bg2)",border:".5px solid var(--b2)",
          borderRadius:"var(--r2)",boxShadow:"0 12px 40px rgba(0,0,0,.5)",
          zIndex:300,overflow:"hidden",animation:"fadeUp .2s ease both"}}>

          {/* Profile header */}
          <div style={{padding:"14px 16px",borderBottom:".5px solid var(--b)",
            background:"linear-gradient(180deg,rgba(155,109,255,.08),transparent)"}}>
            <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:9}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:"var(--pd)",
                border:".5px solid var(--purple)",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:13,fontFamily:"var(--fm)",fontWeight:600,
                color:"var(--purple)",flexShrink:0}}>
                {initials}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  {displayName}
                </div>
                <div style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",textTransform:"capitalize",marginTop:2}}>
                  {role==="both"?"Renter & Provider":role}
                </div>
              </div>
            </div>
            <button onClick={copyWallet} title="Click to copy"
              style={{width:"100%",display:"flex",alignItems:"center",gap:7,
                padding:"6px 9px",borderRadius:6,background:"var(--bg3)",
                border:".5px solid var(--b)",fontSize:11,fontFamily:"var(--fm)",
                color:"var(--t1)",cursor:"pointer",justifyContent:"space-between"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--teal)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b)"}>
              <span>{short}</span>
 <span style={{color:"var(--t2)",fontSize:10}}> copy</span>
            </button>
          </div>

          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderBottom:".5px solid var(--b)"}}>
            <div style={{padding:"11px 14px",borderRight:".5px solid var(--b)",position:"relative"}}>
              <div style={{fontSize:9,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:3}}>Balance</div>
              <div style={{fontSize:16,fontFamily:"var(--fm)",fontWeight:500,color:"var(--teal)"}}>${balance}</div>
              <button onClick={()=>{setMenuOpen(false);openAddFunds();}}
                style={{position:"absolute",top:8,right:8,fontSize:10,fontFamily:"var(--fm)",
                  padding:"2px 7px",borderRadius:4,background:"var(--td)",color:"var(--teal)",
                  border:".5px solid rgba(0,212,168,.3)",cursor:"pointer"}}>
                + Add
              </button>
            </div>
            <div style={{padding:"11px 14px"}}>
              <div style={{fontSize:9,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:3}}>Network</div>
              <div style={{fontSize:11,fontFamily:"var(--fm)",fontWeight:500,
                color:backendOnline?"var(--teal)":"var(--amber)",display:"flex",alignItems:"center",gap:4,marginTop:2}}>
                <span style={{width:6,height:6,borderRadius:"50%",
                  background:backendOnline?"var(--teal)":"var(--amber)",
                  animation:backendOnline?"pulse 2s infinite":"none"}}/>
                {backendOnline?"Live":"Demo"}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{padding:"6px 0"}}>
            <MenuItem icon={CreditCard} label="Add funds"
              onClick={()=>{setMenuOpen(false);openAddFunds();}}/>
            <MenuItem icon={User} label="Profile & settings"
              onClick={()=>{setMenuOpen(false);showToast("Profile settings coming soon","info");}}/>
            <MenuItem icon={Key} label="API keys"
              onClick={()=>{setMenuOpen(false);showToast("API key management coming soon","info");}}/>
            <MenuItem icon={Gift} label="Invite friends (give $5, get $5)"
              onClick={()=>{setMenuOpen(false);openReferral();}}/>
            <MenuItem icon={Plug} label="Embed on my website"
              onClick={()=>{setMenuOpen(false);openEmbed();}}/>
            <MenuItem icon={Bell} label={notifyPermission === "granted"?"Notifications on":"Turn on notifications"}
              onClick={()=>{
                setMenuOpen(false);
                if (notifyPermission === "granted") { showToast("Notifications already on","info"); return; }
                if (notifyPermission === "denied") { showToast("Blocked. Enable in browser settings.","info"); return; }
                requestNotifications();
              }}/>
            <MenuItem icon={Banknote} label="Payment history"
              onClick={()=>{setMenuOpen(false);showToast("Payment history coming soon","info");}}/>
            <MenuItem icon={Rocket}
              label={user.autoRetryFailedJobs?"Auto-retry stuck jobs: On":"Auto-retry stuck jobs: Off"}
              onClick={()=>{setMenuOpen(false);setAutoRetryFailedJobs(!user.autoRetryFailedJobs);}}/>
            {role!=="provider"&&role!=="both"&&(
              <MenuItem icon={Monitor} label="Become a provider"
                onClick={()=>{setMenuOpen(false);setTab("Provider Hub");}}/>
            )}
            <MenuItem icon={BookOpen} label="Help & docs"
              onClick={()=>{setMenuOpen(false);window.open("https://docs.decompute.io","_blank");}}/>
          </div>

          {/* Footer actions */}
          <div style={{borderTop:".5px solid var(--b)",padding:"6px 0"}}>
            <MenuItem icon={LogOut} label="Sign out" danger onClick={handleLogout}/>
          </div>
        </div>
      )}
    </div>
  );
};

const MenuItem = ({icon,label,onClick,danger}) => (
  <button role="menuitem" onClick={onClick}
    style={{width:"100%",display:"flex",alignItems:"center",gap:11,
      padding:"9px 16px",fontSize:13,color:danger?"var(--red)":"var(--t1)",
      background:"transparent",border:"none",cursor:"pointer",textAlign:"left",
      transition:"background .12s"}}
    onMouseEnter={e=>e.currentTarget.style.background=danger?"var(--rd)":"var(--bg3)"}
    onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
    <span style={{width:18,display:"flex",justifyContent:"center",flexShrink:0}}>{icon?<icon size={15}/>:null}</span>
    <span>{label}</span>
  </button>
);

const Header = ({active,setTab}) => {
  const { simpleMode } = useApp();
  const tabs = simpleMode
    ? ["Create","My Stuff"]
    : ["Marketplace","Models","My Jobs","Provider Hub","Pricing","Network"];
  return(
    <header style={{background:"var(--bg1)",borderBottom:".5px solid var(--b2)",position:"sticky",top:0,zIndex:200}}>
      <div style={{maxWidth:1280,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:58,padding:"0 20px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <svg width="24" height="24" viewBox="0 0 28 28">
            <polygon points="14,2 26,8 26,20 14,26 2,20 2,8" fill="none" stroke="var(--teal)" strokeWidth="1.5"/>
            <polygon points="14,7 21,11 21,17 14,21 7,17 7,11" fill="var(--teal)" fillOpacity=".15" stroke="var(--teal)" strokeWidth=".5"/>
            <circle cx="14" cy="14" r="2.5" fill="var(--teal)"/>
          </svg>
          <span style={{fontSize:17,fontWeight:700,letterSpacing:"-.02em"}}>DE<span style={{color:"var(--teal)"}}>COMPUTE</span></span>
 <span className="ai-badge" style={{marginLeft:4,animation:"flicker 4s infinite"}}> AI-Powered</span>
        </div>
        <button onClick={()=>{const e=new KeyboardEvent("keydown",{key:"k",metaKey:true});document.dispatchEvent(e);}}
          className="hdr-nav" title="Quick actions (⌘K)"
          style={{alignItems:"center",gap:5,padding:"5px 10px",marginRight:6,background:"var(--bg3)",
            border:".5px solid var(--b2)",borderRadius:7,cursor:"pointer",color:"var(--t2)",fontSize:11}}>
          <span style={{fontFamily:"var(--fm)"}}>⌘K</span>
          <span>Quick actions</span>
        </button>
        <span className="hdr-nav" style={{alignItems:"center",marginRight:6}}>
          <SimpleModeToggle/>
        </span>
        <nav className="hdr-nav" style={{gap:4}}>
          {tabs.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              data-tour={t==="My Jobs"?"nav-myjobs":t==="Provider Hub"?"nav-provider":undefined}
              style={{padding:"6px 13px",borderRadius:6,fontSize:13,fontWeight:500,
              color:active===t?"var(--teal)":"var(--t1)",background:active===t?"var(--td)":"transparent",
              border:`.5px solid ${active===t?"var(--teal)":"transparent"}`,transition:"all .15s"}}>{t}</button>
          ))}
        </nav>
        <HeaderUserArea setTab={setTab}/>
      </div>
    </header>
  );
};
const BottomNav = ({active,setTab}) => {
  const { simpleMode } = useApp();
  const allTabs=[{id:"Marketplace",icon:Store,tour:undefined},{id:"Models",icon:Bot,tour:undefined},{id:"My Jobs",icon:ListChecks,tour:"nav-myjobs"},{id:"Provider Hub",icon:Server,tour:"nav-provider"},{id:"Network",icon:Network,tour:undefined}];
  const simpleTabs=[{id:"Create",icon:Sparkles,tour:undefined},{id:"My Stuff",icon:Package,tour:undefined}];
  const tabs = simpleMode ? simpleTabs : allTabs;
  return(
    <nav className="bot-nav" style={{position:"fixed",bottom:0,left:0,right:0,gridTemplateColumns:`repeat(${tabs.length},1fr)`,background:"var(--bg1)",borderTop:".5px solid var(--b2)",zIndex:200,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)}
          data-tour={t.tour}
          style={{padding:"10px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:3,color:active===t.id?"var(--teal)":"var(--t2)",transition:"color .15s"}}>
          <span style={{lineHeight:1}}><t.icon size={20}/></span>
          <span style={{fontSize:9,fontFamily:"var(--fm)",letterSpacing:".04em"}}>{t.id.split(" ")[0]}</span>
        </button>
      ))}
    </nav>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  AI COPILOT
// ═══════════════════════════════════════════════════════════════════════════════
const QUICK = [
  "Which computer should I rent for my project?",
  "Why is my job running slowly?",
  "How do I keep my data private?",
  "How can I save money on my next job?",
  "What's the difference between the tiers?",
  "How does payment work — is it safe?",
];

const Copilot = ({open,onToggle,injected,clearInjected}) => {
 const [msgs,setMsgs] = useState([{r:"a",c:"Hi! I'm here to help you make the most of Decompute.\n\nI can help you find the right computer for your project, save money, troubleshoot issues, and answer any questions. What can I help with?"}]);
  const [inp,setInp] = useState("");
  const [busy,setBusy] = useState(false);
  const bot = useRef();
  const inpRef = useRef();

  useEffect(()=>{bot.current?.scrollIntoView({behavior:"smooth"})},[msgs,busy]);
  useEffect(()=>{
    if(injected && open){setInp(injected);clearInjected();setTimeout(()=>inpRef.current?.focus(),80);}
  },[injected,open]);

  const send = useCallback(async(txt)=>{
    const m=(txt||inp).trim();
    if(!m||busy)return;
    setInp("");
    const next=[...msgs,{r:"user",c:m}];
    setMsgs(next);setBusy(true);
    try{
      const reply=await claude(next.map(x=>({role:x.r==="a"?"assistant":"user",content:x.c})));
      setMsgs(n=>[...n,{r:"a",c:reply}]);
 }catch{setMsgs(n=>[...n,{r:"a",c:"Connection error — please retry."}]);}
    finally{setBusy(false);}
  },[msgs,inp,busy]);

  return(
    <>
      <button className="ai-fab" data-tour="ai-fab" onClick={onToggle}
        style={{background:open?"var(--bg2)":"var(--teal)",color:open?"var(--teal)":"#000",
          border:open?".5px solid var(--teal)":"none"}}>
        {open?<X size={18}/>:<Sparkles size={18}/>}
      </button>
      <div className={open?"ai-panel":"ai-closed"}>
        {/* header */}
        <div style={{padding:"13px 15px",borderBottom:".5px solid var(--b2)",background:"var(--bg2)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:"var(--td)",border:".5px solid var(--teal)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--teal)"}}><Sparkles size={12}/></div>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>Your AI Assistant</div>
              <div style={{fontSize:10,color:"var(--teal)",fontFamily:"var(--fm)",display:"flex",alignItems:"center",gap:4}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:"var(--teal)",display:"inline-block",animation:"pulse 2s infinite"}}/>
                Always here to help
              </div>
            </div>
          </div>
          <button onClick={()=>setMsgs([{r:"a",c:"Fresh start! What can I help you with?"}])}
            style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",padding:"3px 8px",borderRadius:4,background:"var(--bg3)"}}>Clear</button>
        </div>
        {/* messages */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 13px",display:"flex",flexDirection:"column",gap:9,minHeight:0}}>
          {msgs.map((m,i)=>(
            <div key={i} className={m.r==="user"?"ai-u":"ai-b"} style={{whiteSpace:"pre-wrap"}}>{m.c}</div>
          ))}
          {busy&&<div className="ai-b"><div style={{display:"flex",gap:4,padding:"4px 0"}}><div className="ai-dot"/><div className="ai-dot"/><div className="ai-dot"/></div></div>}
          <div ref={bot}/>
        </div>
        {/* quick chips */}
        {msgs.length<=2&&(
          <div style={{padding:"0 13px 9px",display:"flex",gap:6,flexWrap:"wrap"}}>
            {QUICK.slice(0,4).map(q=><span key={q} className="ai-chip" onClick={()=>send(q)}>{q}</span>)}
          </div>
        )}
        {/* input */}
        <div style={{padding:"9px 11px",borderTop:".5px solid var(--b2)",display:"flex",gap:7,flexShrink:0}}>
          <input ref={inpRef} value={inp} onChange={e=>setInp(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
            placeholder="Ask me anything…"
            style={{flex:1,padding:"8px 11px",fontSize:12,borderRadius:"var(--r)",background:"var(--bg3)",border:".5px solid var(--b2)",minHeight:38}}/>
          <button onClick={()=>send()} disabled={!inp.trim()||busy}
            style={{width:38,height:38,borderRadius:"var(--r)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
              background:inp.trim()&&!busy?"var(--teal)":"var(--bg3)",color:inp.trim()&&!busy?"#000":"var(--t2)",
              border:"none",cursor:!inp.trim()||busy?"not-allowed":"pointer",transition:"background .15s",fontSize:16}}>
            {busy?<Spin/>:"↑"}
          </button>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  AI NODE MATCHER
// ═══════════════════════════════════════════════════════════════════════════════
const NodeMatcher = ({onInject}) => {
  const [q,setQ] = useState("");
  const [res,setRes] = useState(null);
  const [busy,setBusy] = useState(false);

  const run = async() => {
    if(!q.trim())return;
    setBusy(true);setRes(null);
    try{
      const r=await claude([{role:"user",content:`User workload: "${q}"\n\nAnalyze and recommend the BEST node. Format:\n**Recommended:** [node name]\n**Why:** [2 sentences max]\n**Cost estimate:** [for typical run duration]\n**Alternative:** [cheaper option if relevant]\n**Watch out:** [one key caveat]`}]);
      setRes(r);
 }catch{setRes("Matching failed. Please retry.");}
    finally{setBusy(false);}
  };

  return(
    <div style={{background:"var(--bg2)",border:".5px solid rgba(155,109,255,.35)",borderRadius:"var(--r2)",padding:"17px 19px",marginBottom:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,var(--purple),transparent)",opacity:.6}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:11}}>
        <span><Sparkles size={16}/></span>
        <span style={{fontSize:14,fontWeight:700}}>Find the right computer for me</span>
        <span className="ai-badge">AI suggests</span>
      </div>
      <div style={{display:"flex",gap:9}}>
        <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&run()}
          placeholder="Tell me what you want to do, like: 'train a language model for half a day, budget $200'"
          style={{flex:1,padding:"10px 13px",fontSize:13,borderRadius:"var(--r)",minHeight:44,background:"var(--bg3)",border:".5px solid var(--b2)"}}/>
        <Btn onClick={run} disabled={!q.trim()||busy} v="purple" style={{minWidth:90,height:44}}>
          {busy?<><Spin/> Thinking…</>:"Find one →"}
        </Btn>
      </div>
      {res&&(
        <div style={{marginTop:13,padding:"13px",background:"var(--bg3)",borderRadius:"var(--r)",border:".5px solid rgba(155,109,255,.2)",fontSize:13,lineHeight:1.65,whiteSpace:"pre-wrap"}}>
          {res}
          <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>onInject("Tell me more about the recommended node — security, attestation, and how to get started")}
              style={{fontSize:11,fontFamily:"var(--fm)",color:"var(--purple)",background:"var(--pd)",border:".5px solid rgba(155,109,255,.3)",borderRadius:4,padding:"4px 10px",cursor:"pointer"}}>
              Deep dive on security →
            </button>
            <button onClick={()=>{setRes(null);setQ("")}}
              style={{fontSize:11,fontFamily:"var(--fm)",color:"var(--t2)",background:"var(--bg3)",border:".5px solid var(--b)",borderRadius:4,padding:"4px 10px",cursor:"pointer"}}>
              New search
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  FIRST-TIME WELCOME BANNER
// ═══════════════════════════════════════════════════════════════════════════════
const FirstTimeWelcome = ({setTab}) => {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("decompute_welcomed") === "1"; } catch { return false; }
  });
  const { user, login, backendOnline, openSignup, openQuickStart } = useApp();

  if (dismissed || user) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("decompute_welcomed", "1"); } catch {}
  };

  return (
    <div style={{position:"relative",background:"linear-gradient(135deg,rgba(0,212,168,.08),rgba(155,109,255,.08))",
      border:".5px solid rgba(0,212,168,.25)",borderRadius:"var(--r2)",padding:"18px 22px",marginBottom:18,
      animation:"fadeSlide .5s ease both",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:"linear-gradient(90deg,var(--teal),var(--purple),var(--teal))",
        backgroundSize:"200% 100%",animation:"shimmer 3s linear infinite"}}/>
      <button onClick={dismiss} aria-label="Dismiss welcome"
        style={{position:"absolute",top:10,right:12,background:"none",border:"none",
          color:"var(--t2)",fontSize:18,cursor:"pointer",padding:6,lineHeight:1,
          opacity:.6,transition:"opacity .15s"}}
        onMouseEnter={e=>e.currentTarget.style.opacity="1"}
        onMouseLeave={e=>e.currentTarget.style.opacity=".6"}>×</button>

      <div style={{display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
        <div style={{flexShrink:0,filter:"drop-shadow(0 0 8px rgba(0,212,168,.3))"}}><Hand size={32}/></div>
        <div style={{flex:1,minWidth:240}}>
          <h3 style={{fontSize:16,fontWeight:700,marginBottom:5,letterSpacing:"-.01em"}}>Welcome to Decompute!</h3>
          <p style={{fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:12,maxWidth:520}}>
            Rent powerful computers for AI work, or earn money sharing your own.
            {backendOnline ? " " : <span style={{color:"var(--amber)"}}> You're in demo mode — </span>}
            <span style={{color:"var(--t2)"}}>{backendOnline?"Sign up with email or wallet — no credit card to start.":"explore freely. Sign up when you're ready."}</span>
          </p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={openQuickStart}
              style={{padding:"8px 14px",borderRadius:6,fontWeight:600,
                background:"var(--teal)",color:"#000",border:"none",cursor:"pointer",
                display:"inline-flex",alignItems:"center",gap:5}}>
              <Sparkles size={15}/> Start building — free
            </button>
            <button onClick={()=>{setTab("Provider Hub");dismiss();}}
              style={{padding:"8px 14px",borderRadius:6,fontSize:12,fontWeight:600,
                background:"var(--bg3)",color:"var(--t1)",border:".5px solid var(--b2)",cursor:"pointer"}}>
              <Wallet size={15}/> Earn with my GPU
            </button>
            <button onClick={dismiss}
              style={{padding:"8px 14px",borderRadius:6,fontSize:12,
                background:"transparent",color:"var(--t2)",border:".5px solid var(--b)",cursor:"pointer"}}>
              Just looking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ONE-LINE EXPLAINER — appears above marketplace for new visitors
//  Answers the "what is this?" question in 5 seconds
// ═══════════════════════════════════════════════════════════════════════════════
const OneLineExplainer = () => {
  const { user } = useApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("decompute_explainer_dismissed") === "1"; } catch { return false; }
  });

  if (user || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("decompute_explainer_dismissed", "1"); } catch {}
  };

  return (
    <div style={{padding:"14px 18px",background:"var(--bg2)",borderRadius:"var(--r2)",
      border:".5px solid var(--b2)",marginBottom:14,fontSize:13,lineHeight:1.55,
      color:"var(--t1)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div style={{flexShrink:0}}><ArrowDown size={22}/></div>
      <div style={{flex:"1 1 280px"}}>
        <strong style={{color:"var(--t0)"}}>What is this?</strong> Rent GPU computers from people around the world for AI work — typically <strong style={{color:"var(--teal)"}}>70% cheaper than AWS</strong>. Or share your own GPU to <strong style={{color:"var(--amber)"}}>earn money</strong>.
      </div>
      <button onClick={dismiss}
        style={{padding:"5px 10px",fontSize:11,background:"transparent",color:"var(--t2)",
          border:".5px solid var(--b)",borderRadius:5,cursor:"pointer",flexShrink:0}}>
        Got it
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  INFO TOOLTIP — appears on hover with a friendly explanation
//  Use anywhere users might be confused: <Info text="What this means">label</Info>
// ═══════════════════════════════════════════════════════════════════════════════
const Info = ({ children, text, side = "top" }) => {
  const [show, setShow] = useState(false);
  const [hoverTimer, setHoverTimer] = useState(null);

  const showAfterDelay = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    setHoverTimer(setTimeout(() => setShow(true), 400));
  };
  const hideNow = () => {
    if (hoverTimer) clearTimeout(hoverTimer);
    setShow(false);
  };

  return (
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",gap:4,cursor:"help"}}
      onMouseEnter={showAfterDelay} onMouseLeave={hideNow}
      onFocus={showAfterDelay} onBlur={hideNow} tabIndex={0}>
      {children}
      <span style={{fontSize:9,color:"var(--t2)",width:13,height:13,borderRadius:"50%",
        border:".5px solid var(--b2)",display:"inline-flex",alignItems:"center",justifyContent:"center",
        fontFamily:"var(--fm)"}}>?</span>
      {show && (
        <span role="tooltip" style={{position:"absolute",
          ...(side==="top"? {bottom:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)"} :
              side==="bottom"? {top:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)"} :
              side==="left"? {right:"calc(100% + 6px)",top:"50%",transform:"translateY(-50%)"} :
              {left:"calc(100% + 6px)",top:"50%",transform:"translateY(-50%)"}),
          background:"var(--bg1)",border:".5px solid var(--teal)",borderRadius:"var(--r)",
          padding:"8px 11px",fontSize:11,color:"var(--t0)",lineHeight:1.55,
          minWidth:200,maxWidth:280,zIndex:50,whiteSpace:"normal",
          boxShadow:"0 6px 16px rgba(0,0,0,.5)",pointerEvents:"none",
          animation:"fadeUp .15s ease both"}}>
          {text}
        </span>
      )}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  STUCK DETECTOR — if a user is on a page for 60s without interacting,
//  offer them help proactively. The "I notice you're stuck" assistant.
// ═══════════════════════════════════════════════════════════════════════════════
const StuckDetector = () => {
  const [showNudge, setShowNudge] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (dismissed) return;

    const recordActivity = () => {
      lastActivityRef.current = Date.now();
      setShowNudge(false);
    };

    const events = ["click", "keydown", "scroll", "mousemove"];
    events.forEach(e => document.addEventListener(e, recordActivity, { passive: true }));

    const checkStuck = setInterval(() => {
      if (Date.now() - lastActivityRef.current > 60000 && !showNudge) {
        setShowNudge(true);
      }
    }, 5000);

    return () => {
      events.forEach(e => document.removeEventListener(e, recordActivity));
      clearInterval(checkStuck);
    };
  }, [dismissed, showNudge]);

  if (!showNudge || dismissed) return null;

  return (
    <div role="status" style={{position:"fixed",bottom:90,right:22,zIndex:550,
      width:280,background:"var(--bg2)",border:".5px solid var(--purple)",
      borderRadius:"var(--r2)",padding:"14px 16px",
      boxShadow:"0 12px 32px rgba(0,0,0,.4)",
      animation:"fadeUp .3s ease both"}}>
      <button onClick={()=>{setShowNudge(false);setDismissed(true);}}
        aria-label="Dismiss" style={{position:"absolute",top:8,right:10,
          background:"transparent",border:"none",color:"var(--t2)",fontSize:14,cursor:"pointer"}}>
        ×
      </button>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <span><Hand size={22}/></span>
        <div style={{flex:1}}>
          <div style={{fontSize:12,fontWeight:600,marginBottom:4}}>Need a hand?</div>
          <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.55,marginBottom:9}}>
            Looks like you might be exploring. Want me to show you around or answer a question?
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button onClick={()=>{
              setShowNudge(false);
              document.querySelector('.ai-fab')?.click();
            }}
              style={{fontSize:10,fontFamily:"var(--fm)",padding:"5px 10px",borderRadius:4,
                background:"var(--td)",color:"var(--teal)",border:".5px solid rgba(0,212,168,.3)",cursor:"pointer"}}>
              <Sparkles size={15}/> Ask AI
            </button>
            <button onClick={()=>{
              setShowNudge(false);
              document.querySelector('[aria-label="Open help"]')?.click();
            }}
              style={{fontSize:10,fontFamily:"var(--fm)",padding:"5px 10px",borderRadius:4,
                background:"var(--bg3)",color:"var(--t1)",border:".5px solid var(--b)",cursor:"pointer"}}>
              <BookOpen size={15}/> Help
            </button>
            <button onClick={()=>{setShowNudge(false);setDismissed(true);}}
              style={{fontSize:10,fontFamily:"var(--fm)",padding:"5px 10px",borderRadius:4,
                background:"transparent",color:"var(--t2)",border:".5px solid var(--b)",cursor:"pointer"}}>
              I'm fine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  HELP BUTTON — floating help launcher in bottom-left
//  Opens a contextual help panel based on current tab
// ═══════════════════════════════════════════════════════════════════════════════
const HELP_CONTENT = {
  Marketplace: {
 title: "Browsing computers",
    sections: [
      { q: "What's an AI Score?",
        a: "Our 0-100 quality rating combining reliability, performance, and uptime. 90+ is excellent. Below 60, we usually warn you." },
      { q: "What does 'Verified hardware' mean?",
        a: "We've cryptographically verified the computer is real and unmodified. Like a TSA Precheck for GPUs." },
      { q: "How do I know which computer to pick?",
        a: "Click 'Find the right computer for me' at the top — our AI asks a few questions and recommends one." },
      { q: "What if my job needs to be private?",
 a: "Look for the badge. Those computers run jobs in encrypted memory so the owner can't peek at your data." },
    ],
  },
  "My Jobs": {
 title: "Running jobs",
    sections: [
      { q: "How do I start my first job?",
        a: "Click '+ New Job' and pick a template. We have presets for image generation, language model training, transcription, and more. No coding needed for the basics." },
      { q: "How is pricing calculated?",
        a: "You pay by the hour, only for time used. If your job finishes in 30 minutes instead of an hour, you only pay for 30 minutes." },
      { q: "What happens if my job fails?",
        a: "Automatic refund. The money is held in escrow until your job completes successfully." },
      { q: "Can I cancel a running job?",
        a: "Yes, anytime. Click the job, then 'Stop job'. You pay for the time used until that moment." },
    ],
  },
  "Provider Hub": {
 title: "Earning money",
    sections: [
      { q: "Do I need technical skills?",
        a: "No. Use the Easy Setup. Download the helper app, it figures out your computer and sets everything up." },
      { q: "When do I get paid?",
        a: "Every 24 hours, in USDC, to whatever wallet you choose. No invoicing, no waiting." },
      { q: "Will it slow down my computer?",
        a: "Only when running jobs. You can set it to only run at night, when you're idle, or pause anytime." },
      { q: "Is it safe?",
        a: "Every job runs in an isolated sandbox. They can't see your files. We wipe everything after each job." },
    ],
  },
  Pricing: {
 title: "Pricing",
    sections: [
      { q: "Why are you so much cheaper than AWS?",
        a: "We use computers that already exist (no data centers to build) and take a 10% fee instead of huge markups. Most providers undercut AWS by 60-80%." },
      { q: "Are there hidden fees?",
        a: "No. The hourly rate is what you pay. Free egress, free storage during your job, no setup fees, no minimum commitment." },
      { q: "What about taxes?",
        a: "You're responsible for your own taxes. We don't charge sales tax (yet — may change for enterprise contracts)." },
    ],
  },
  Network: {
 title: "About the network",
    sections: [
      { q: "How is this different from AWS?",
        a: "AWS owns the computers. We don't. Our network is thousands of computers owned by individuals and small operators. Same compute, fraction of the cost." },
      { q: "Is it reliable?",
        a: "We have 99.9%+ uptime because the network is decentralized — if one computer goes down, another picks up. We monitor every node 24/7." },
      { q: "Where are the computers located?",
        a: "47 countries and growing. You can filter by region if latency matters for your job." },
    ],
  },
};

const HelpButton = () => {
  const [open, setOpen] = useState(false);
  const { showToast, activeTab } = useApp();
  const panelRef = useRef(null);
  const tab = HELP_CONTENT[activeTab] ? activeTab : "Marketplace";

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const h = e => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = e => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const content = HELP_CONTENT[tab] || HELP_CONTENT.Marketplace;

  return (
    <>
      <button onClick={()=>setOpen(o=>!o)}
        title="Help & FAQs"
        aria-label="Open help"
        style={{position:"fixed",bottom:22,left:22,zIndex:500,
          width:42,height:42,borderRadius:"50%",
          background:open?"var(--bg2)":"var(--bg3)",
          color:open?"var(--teal)":"var(--t1)",
          border:`.5px solid ${open?"var(--teal)":"var(--b2)"}`,
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
          fontSize:18,fontWeight:500,transition:"all .15s",
          boxShadow:"0 4px 14px rgba(0,0,0,.3)"}}>
 {open? "":"?"}
      </button>

      {open && (
        <div ref={panelRef} role="dialog" aria-label="Help and FAQs"
          style={{position:"fixed",bottom:74,left:22,zIndex:500,
            width:340,maxHeight:"68vh",overflowY:"auto",
            background:"var(--bg1)",border:".5px solid var(--b2)",
            borderRadius:"var(--r2)",boxShadow:"0 12px 40px rgba(0,0,0,.5)",
            animation:"fadeUp .25s ease both"}}>

          <div style={{padding:"14px 16px",borderBottom:".5px solid var(--b2)",
            background:"linear-gradient(180deg,rgba(0,212,168,.06),transparent)",
            position:"sticky",top:0,zIndex:1,backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:3}}>
              Help · {tab}
            </div>
            <h3 style={{fontSize:15,fontWeight:700}}>{content.title}</h3>
          </div>

          <div style={{padding:"6px 14px 12px"}}>
            {content.sections.map((s, i) => (
              <details key={i} style={{padding:"10px 0",borderBottom:i<content.sections.length-1?".5px solid var(--b)":"none"}}>
                <summary style={{cursor:"pointer",fontSize:13,fontWeight:600,color:"var(--t0)",
                  listStyle:"none",display:"flex",alignItems:"center",gap:8,padding:"4px 0"}}>
                  <span style={{color:"var(--teal)",fontSize:14}}>›</span>
                  <span>{s.q}</span>
                </summary>
                <p style={{fontSize:12,color:"var(--t1)",lineHeight:1.65,padding:"7px 0 0 22px"}}>
                  {s.a}
                </p>
              </details>
            ))}
          </div>

          {/* Footer: link to full docs + community */}
          <div style={{padding:"12px 16px",borderTop:".5px solid var(--b)",
            background:"var(--bg2)",display:"flex",flexDirection:"column",gap:7}}>
            <button onClick={()=>{showToast("Opening full docs at docs.decompute.io","info");}}
              style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                background:"transparent",border:".5px solid var(--b)",borderRadius:6,
                fontSize:12,color:"var(--t1)",cursor:"pointer",justifyContent:"flex-start"}}>
              <span><BookOpen size={16}/></span><span>Full documentation</span>
              <span style={{marginLeft:"auto",fontSize:10,color:"var(--t2)"}}>↗</span>
            </button>
            <button onClick={()=>{showToast("Opening Discord community","info");}}
              style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                background:"transparent",border:".5px solid var(--b)",borderRadius:6,
                fontSize:12,color:"var(--t1)",cursor:"pointer",justifyContent:"flex-start"}}>
              <span><MessageSquare size={16}/></span><span>Ask the community</span>
              <span style={{marginLeft:"auto",fontSize:10,color:"var(--t2)"}}>↗</span>
            </button>
            <button onClick={()=>{showToast("Opening AI Copilot for personalized help","info");}}
              style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",
                background:"var(--td)",border:".5px solid rgba(0,212,168,.3)",borderRadius:6,
                fontSize:12,color:"var(--teal)",cursor:"pointer",justifyContent:"flex-start",fontWeight:600}}>
              <span><Sparkles size={16}/></span><span>Ask the AI Copilot</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TRY DEMO BANNER — 60-second value moment for non-signed-in users
//  Lets visitors try generating an image right from the marketplace page
// ═══════════════════════════════════════════════════════════════════════════════
const TryDemoBanner = () => {
  const { user, showToast, openSignup } = useApp();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("decompute_demo_dismissed") === "1"; } catch { return false; }
  });
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  if (user || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("decompute_demo_dismissed", "1"); } catch {}
  };

  const runDemo = async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setResult(null);
    // Simulate a real job running — in production this would call your demo API
    await new Promise(r => setTimeout(r, 2200));
    setRunning(false);
    setResult({
      success: true,
      time: 1.7,
      cost: 0.04,
      preview: prompt,
    });
  };

  return (
    <div style={{background:"linear-gradient(135deg,rgba(0,212,168,.08),rgba(155,109,255,.05))",
      border:".5px solid rgba(0,212,168,.3)",borderRadius:"var(--r2)",padding:"18px 22px",marginBottom:18,
      position:"relative",overflow:"hidden",animation:"fadeUp .4s ease both"}}>

      <div style={{position:"absolute",top:0,left:0,right:0,height:2,
        background:"linear-gradient(90deg,transparent,var(--teal),transparent)",opacity:.6}}/>

      <button onClick={dismiss} aria-label="Dismiss"
        style={{position:"absolute",top:10,right:12,background:"none",border:"none",
          color:"var(--t2)",fontSize:16,cursor:"pointer",padding:6,lineHeight:1,opacity:.6}}>
        ×
      </button>

      <div style={{display:"flex",alignItems:"flex-start",gap:14,flexWrap:"wrap",marginBottom:12}}>
        <div style={{flexShrink:0}}><Sparkles size={28}/></div>
        <div style={{flex:1,minWidth:220}}>
          <h3 style={{fontSize:15,fontWeight:700,marginBottom:4,letterSpacing:"-.01em"}}>
            Try it right now — no signup, no card
          </h3>
          <p style={{fontSize:12,color:"var(--t1)",lineHeight:1.55}}>
            Type anything below and we'll generate an image in about 2 seconds. See how fast it is.
          </p>
        </div>
      </div>

      {!result ? (
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={prompt} onChange={e=>setPrompt(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&runDemo()}
            placeholder="a serene mountain lake at sunset"
            style={{flex:"1 1 240px",padding:"10px 13px",fontSize:13,
              background:"var(--bg3)",border:".5px solid var(--b2)",
              borderRadius:"var(--r)",minHeight:42,color:"var(--t0)"}}/>
          <button onClick={runDemo} disabled={!prompt.trim() || running}
            style={{padding:"10px 18px",fontSize:13,fontWeight:600,
              background:"var(--teal)",color:"#000",border:"none",
              borderRadius:"var(--r)",cursor:running?"wait":(prompt.trim()?"pointer":"not-allowed"),
              opacity:(!prompt.trim() || running)?.6:1,
              display:"inline-flex",alignItems:"center",gap:7,minHeight:42}}>
            {running ? <><Spin/> Generating…</> : "Generate →"}
          </button>
        </div>
      ) : (
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"12px",
          background:"var(--bg3)",borderRadius:"var(--r)",flexWrap:"wrap"}}>
          <div style={{width:64,height:64,borderRadius:"var(--r)",flexShrink:0,
            background:`linear-gradient(135deg,hsl(${result.preview.length*7%360},70%,50%),hsl(${result.preview.length*13%360},70%,30%))`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
 
          </div>
          <div style={{flex:"1 1 200px",fontSize:12}}>
            <div style={{color:"var(--teal)",fontWeight:600,marginBottom:3,display:"flex",alignItems:"center",gap:6}}>
 Done in {result.time}s
            </div>
            <div style={{color:"var(--t2)",lineHeight:1.6}}>
 Cost: <strong style={{color:"var(--amber)"}}>${result.cost}</strong> on a Starter computer.
              In real usage you'd get the actual image — this is a demo.
            </div>
          </div>
          <button onClick={()=>setResult(null)}
            style={{padding:"7px 13px",fontSize:11,background:"var(--bg2)",color:"var(--t1)",
              border:".5px solid var(--b2)",borderRadius:6,cursor:"pointer"}}>
            Try another
          </button>
        </div>
      )}

      {/* CTA after they see it work */}
      {result && (
        <div style={{marginTop:12,padding:"11px 13px",background:"var(--td)",
          border:".5px solid rgba(0,212,168,.3)",borderRadius:"var(--r)",
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"var(--t1)"}}>
 Get <strong style={{color:"var(--teal)"}}>$5 free</strong> when you sign up — enough for ~125 more images
          </span>
          <button onClick={openSignup}
            style={{padding:"7px 14px",fontSize:12,fontWeight:600,
              background:"var(--teal)",color:"#000",border:"none",borderRadius:6,cursor:"pointer"}}>
            Claim my $5 →
          </button>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PUBLIC TRUST BAR — small strip of social proof at the top of the marketplace
// ═══════════════════════════════════════════════════════════════════════════════
const TrustBar = () => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:24,
    padding:"8px 16px",marginBottom:14,fontSize:11,color:"var(--t2)",
    flexWrap:"wrap",borderBottom:".5px solid var(--b)"}}>
    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
      <span style={{color:"var(--teal)",fontSize:13}}>●</span> 99.94% uptime
    </span>
    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
      <span><ShieldCheck size={16}/></span> Payments held safely until job completes
    </span>
    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
      <span><Leaf size={16}/></span> 70% lower carbon than AWS
    </span>
    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
      <span><Banknote size={16}/></span> No minimum, no commitment
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
//  QUICK START — outcome-first launcher. The "I want to..." gateway.
//  This is what common users see first. No mention of GPUs, Docker, or jobs.
//  Reads from JOB_CATALOG (entries with a `simple` block) — see that
//  definition for why this isn't its own separate template list anymore.
// ════════════════════════════════════════════════════════════════════════════

const QuickStartLauncher = () => {
  const { quickStartOpen, closeQuickStart, submitJob, user, openSignup, unlockAchievement, showToast, openLiveJob, quickStartOutcome, backendOnline, availableWorkloads } = useApp();
  const [step, setStep] = useState("pick"); // pick | configure
  const [outcome, setOutcome] = useState(null); // a JOB_CATALOG entry with a `simple` block
  const [values, setValues] = useState({});
  const [improving, setImproving] = useState(false); // AI prompt enhancement in flight
  const [submitting, setSubmitting] = useState(false);

  const SIMPLE_CATALOG = JOB_CATALOG.filter(t => t.simple && (!backendOnline || availableWorkloads.includes(t.id)));

  // If opened with a specific outcome, skip the picker and configure it
  useEffect(() => {
    if (quickStartOpen && quickStartOutcome) {
      const o = SIMPLE_CATALOG.find(x => x.id === quickStartOutcome);
      if (o) {
        setOutcome(o);
        const defaults = {};
        o.inputs?.forEach(i => { if (i.default !== undefined) defaults[i.key] = i.default; });
        setValues(defaults);
        setStep("configure");
      }
    }
  }, [quickStartOpen, quickStartOutcome]);

  // Reset state when modal closes
  useEffect(() => {
    if (!quickStartOpen) {
      setTimeout(() => { setStep("pick"); setOutcome(null); setValues({}); }, 200);
    }
  }, [quickStartOpen]);

  // Close on Escape
  useEffect(() => {
    if (!quickStartOpen) return;
    const h = e => { if (e.key === "Escape") closeQuickStart(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [quickStartOpen, closeQuickStart]);

  if (!quickStartOpen) return null;

  const pickOutcome = (o) => {
    setOutcome(o);
    const defaults = {};
    o.inputs?.forEach(i => { if (i.default !== undefined) defaults[i.key] = i.default; });
    setValues(defaults);
    setStep("configure");
  };

  // Builds the same spec shape NewJobModal's non-custom path builds — one
  // job pipeline behind both, Simple mode just skips straight to a curated
  // template instead of picking from the full catalog.
  const launch = async () => {
    if (!user) { openSignup(); return; }
    if (!outcome) return;
    setSubmitting(true);
    const { envVars, units } = buildEnvVarsAndUnits(outcome, values);
    const spec = {
      name: outcome.name,
      workloadId: outcome.id,
      executionSource: "community",
      maxRuntimeHours: outcome.maxRuntimeHours,
      envVars,
      ...(units ? { units } : {}),
    };
    const job = await submitJob(spec);
    setSubmitting(false);
    if (!job) return; // submitJob already toasted the error — stay put to retry
    unlockAchievement(outcome.simple.achievementId, outcome.simple.achievementLabel, outcome.icon);
    closeQuickStart();
    openLiveJob(job);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Quick Start"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1000,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}
      onClick={e=>e.target===e.currentTarget&&closeQuickStart()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        width:"100%",maxWidth:560,maxHeight:"92vh",overflow:"hidden",
        display:"flex",flexDirection:"column",
        animation:"modalIn .3s cubic-bezier(.4,0,.2,1) both"}}>

        {/* Top bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"14px 22px",borderBottom:".5px solid var(--b)"}}>
          <button onClick={()=>step==="configure"?setStep("pick"):closeQuickStart()}
            style={{fontSize:13,color:"var(--t2)",background:"transparent",border:"none",cursor:"pointer"}}>
            {step==="configure"?"← Back":"Close"}
          </button>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".08em"}}>
            {step==="pick"?"WHAT WOULD YOU LIKE TO BUILD?" : "JUST A FEW DETAILS"}
          </div>
          <div style={{width:60}}/>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"22px 24px"}}>
          {step === "pick" && (
            <>
              <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em",marginBottom:8,textAlign:"center"}}>
                I want to...
              </h2>
              <p style={{fontSize:13,color:"var(--t2)",textAlign:"center",marginBottom:20,lineHeight:1.55}}>
                Pick one. We handle everything else — the GPUs, the setup, the deploys.
              </p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
                {SIMPLE_CATALOG.map(o => (
                  <button key={o.id} onClick={()=>pickOutcome(o)} className="lift"
                    style={{padding:"16px 16px",background:"var(--bg3)",
                      border:".5px solid var(--b2)",borderRadius:"var(--r2)",
                      cursor:"pointer",textAlign:"left",position:"relative",
                      transition:"all .2s",display:"flex",flexDirection:"column",gap:6,minHeight:120}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=o.simple.color;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b2)";}}>
                    <div style={{lineHeight:1}}><o.icon size={28}/></div>
                    <div style={{fontSize:14,fontWeight:600,color:"var(--t0)"}}>{o.simple.title}</div>
                    <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.45,marginBottom:"auto"}}>{o.simple.sub}</div>
                    <div style={{display:"flex",gap:8,marginTop:8,fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)"}}>
                      <span>⏱ {o.estimatedTime}</span>
                      <span>{o.estimatedCost}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div style={{marginTop:20,padding:"12px 16px",background:"var(--bg3)",borderRadius:"var(--r)",
                fontSize:12,color:"var(--t2)",lineHeight:1.6,textAlign:"center"}}>
                <strong style={{color:"var(--teal)"}}>First $5 is on us</strong> — enough to try anything above.
              </div>
            </>
          )}

          {step === "configure" && outcome && (
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
                <div><outcome.icon size={32}/></div>
                <div>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:2}}>{outcome.simple.title}</h2>
                  <p style={{fontSize:12,color:"var(--t2)"}}>
                    Estimated: {outcome.estimatedTime} · {outcome.estimatedCost}
                  </p>
                </div>
              </div>

              {(outcome.inputs || []).map(inp => (
                <div key={inp.key} style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
                    letterSpacing:".06em",textTransform:"uppercase",marginBottom:6}}>
                    {inp.label}{inp.required && <span style={{color:"var(--amber)",marginLeft:4}}>*</span>}
                  </label>
                  {inp.type === "select" && (
                    <select value={values[inp.key] ?? inp.default ?? ""}
                      onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                      style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                        border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}>
                      {inp.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {inp.type === "textarea" && (
                    <>
                      <textarea value={values[inp.key] || ""} placeholder={inp.placeholder}
                        onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                        style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                          border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:80,
                          fontFamily:"inherit",resize:"vertical",lineHeight:1.5}}/>
                      {inp.key === "prompt" && (
                        <div style={{marginTop:6,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                          <button onClick={async()=>{
                              const text = (values.prompt||"").trim();
                              if (text.length < 2) { showToast("Write a few words first","info"); return; }
                              setImproving(true);
                              try {
                                const r = await api("POST","/api/ai/enhance-prompt",{prompt:text});
                                if (r?.enhanced && r.wasEnhanced) {
                                  setValues(v=>({...v,prompt:r.enhanced}));
                                  showToast("Made your description more detailed","success");
                                } else {
                                  showToast("Your description is already detailed","info");
                                }
                              } catch { showToast("Couldn't improve it — yours works fine","info"); }
                              finally { setImproving(false); }
                            }}
                            disabled={improving}
                            style={{fontSize:11,fontFamily:"var(--fm)",padding:"5px 11px",borderRadius:6,
                              background:"var(--pd)",color:"var(--purple)",
                              border:".5px solid rgba(155,109,255,.3)",cursor:"pointer",
                              display:"inline-flex",alignItems:"center",gap:5}}>
 {improving? <><Spin/> Improving…</> : "Help me describe it better"}
                          </button>
                          <span style={{fontSize:11,color:"var(--t2)"}}>More detail usually means a better result</span>
                        </div>
                      )}
                    </>
                  )}
                  {(inp.type === "url" || inp.type === "text") && (
                    <input type={inp.type} value={values[inp.key] || ""} placeholder={inp.placeholder}
                      onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                      style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                        border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
                  )}
                  {inp.type === "password" && (
                    <input type="password" value={values[inp.key] || ""} placeholder={inp.placeholder}
                      onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                      style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                        border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
                  )}
                  {inp.type === "toggle" && (
                    <div onClick={()=>setValues(v=>({...v,[inp.key]:!v[inp.key]}))}
                      style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",
                        background:"var(--bg3)",borderRadius:"var(--r)",cursor:"pointer",
                        border:`.5px solid ${values[inp.key]?"rgba(0,212,168,.35)":"var(--b)"}`}}>
                      <div style={{width:36,height:20,borderRadius:10,position:"relative",flexShrink:0,
                        background:values[inp.key]?"var(--teal)":"var(--bg2)",
                        border:`.5px solid ${values[inp.key]?"var(--teal)":"var(--b2)"}`,transition:"background .2s"}}>
                        <div style={{position:"absolute",top:2,left:values[inp.key]?18:2,width:16,height:16,
                          borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                      </div>
                      <span style={{fontSize:13}}>{values[inp.key] ? "On" : "Off"}</span>
                    </div>
                  )}
                  {inp.type === "number" && (
                    <input type="number" value={values[inp.key] ?? inp.default ?? ""} min={inp.min} max={inp.max}
                      onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                      style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                        border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
                  )}
                  {inp.type === "file" && (
                    <div style={{padding:"22px 14px",background:"var(--bg3)",borderRadius:"var(--r)",
                      border:"1px dashed var(--b2)",textAlign:"center",cursor:"pointer"}}>
                      <div style={{marginBottom:6,opacity:.6}}><Folder size={24}/></div>
                      <div style={{fontSize:12,color:"var(--t1)"}}>
                        <strong style={{color:"var(--teal)"}}>Click to browse</strong> or drop files here
                      </div>
                      {inp.accept && (
                        <div style={{fontSize:10,color:"var(--t2)",marginTop:3,fontFamily:"var(--fm)"}}>
                          Accepted: {inp.accept}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              <Btn full onClick={launch} disabled={submitting || (outcome.inputs || []).some(i => i.required && !values[i.key])}>
                {submitting ? <><Spin/> Starting…</> : user ? `Build it · ${outcome.estimatedCost}` : "Sign up free to continue"}
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  SHARE MODAL — universal "I just made this" sharing surface
//  Generates a fake public URL, social cards, and viral copy.
// ════════════════════════════════════════════════════════════════════════════

const ShareModal = () => {
  const { shareModal, closeShare, showToast, user, referralCode } = useApp();
  if (!shareModal) return null;

  const fallbackSlug = (shareModal.data?.preview || "creation").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const slug = shareModal.data?.slug || fallbackSlug;  // real backend slug when available
  const userHandle = user?.displayName?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
                     user?.wallet?.slice(2, 10) || "anon";
  const publicUrl = `https://decompute.run/u/${userHandle}/${slug}?ref=${referralCode || "DECO"}`;

  // Plain text for the tweet — `icon` is a React component now, so it can't
  // be interpolated here.
  const tweetText = `Just built ${shareModal.data?.title?.toLowerCase()} on @decompute in under a minute. ` + publicUrl;

  const copyUrl = () => {
    navigator.clipboard?.writeText(publicUrl).then(
      () => showToast("Link copied!","success"),
      () => showToast("Couldn't copy","error")
    );
  };

  const shareToTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`, "_blank");
  };

  const shareToLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`, "_blank");
  };

  const shareToReddit = () => {
    window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(publicUrl)}&title=${encodeURIComponent(tweetText)}`, "_blank");
  };

  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1100,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&closeShare()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        width:"100%",maxWidth:440,maxHeight:"92vh",overflowY:"auto",
        animation:"modalIn .3s cubic-bezier(.4,0,.2,1) both"}}>

        {/* Header */}
        <div style={{padding:"20px 24px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
 <h3 style={{fontSize:16,fontWeight:700}}>Share your creation</h3>
          <button onClick={closeShare} style={{background:"transparent",border:"none",color:"var(--t2)",cursor:"pointer"}}><X size={18}/></button>
        </div>

        <div style={{padding:"16px 24px 24px"}}>
          {/* Preview card */}
          <div style={{background:"linear-gradient(135deg,rgba(0,212,168,.1),rgba(155,109,255,.1))",
            border:".5px solid var(--b2)",borderRadius:"var(--r2)",padding:"18px 20px",
            marginBottom:16,position:"relative",overflow:"hidden"}}>
            <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:10}}>
              {shareModal.data?.imageUrl ? (
                <img src={shareModal.data.imageUrl} alt="creation"
                  style={{width:46,height:46,borderRadius:"var(--r)",objectFit:"cover",flexShrink:0,
                    border:".5px solid var(--b2)"}}/>
              ) : (
                <div>{shareModal.data?.icon ? <shareModal.data.icon size={26}/> : <Sparkles size={26}/>}</div>
              )}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:2}}>
                  Made by {userHandle}
                </div>
                <div style={{fontSize:14,fontWeight:600,color:"var(--t0)",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {shareModal.data?.preview || shareModal.data?.title}
                </div>
              </div>
            </div>
            {/* "Made with Decompute" watermark */}
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:10,fontFamily:"var(--fm)",color:"var(--teal)",marginTop:10}}>
              <span><Sparkles size={16}/></span>
              <span>Made with Decompute</span>
            </div>
          </div>

          {/* Public URL */}
          <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
            letterSpacing:".06em",textTransform:"uppercase",marginBottom:6}}>
            Your shareable link
          </label>
          <div style={{display:"flex",gap:7,marginBottom:14}}>
            <input value={publicUrl} readOnly
              style={{flex:1,padding:"9px 12px",fontSize:11,background:"var(--bg3)",
                border:".5px solid var(--b2)",borderRadius:"var(--r)",
                color:"var(--t1)",fontFamily:"var(--fm)",minHeight:38,
                overflow:"hidden",textOverflow:"ellipsis"}}/>
            <button onClick={copyUrl}
              style={{padding:"9px 14px",background:"var(--teal)",color:"#000",border:"none",
                borderRadius:"var(--r)",fontSize:12,fontWeight:600,cursor:"pointer",minHeight:38}}>
              Copy
            </button>
          </div>

          {/* Share buttons */}
          <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
            letterSpacing:".06em",textTransform:"uppercase",marginBottom:8}}>
            Share to
          </label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            <button onClick={shareToTwitter}
              style={{padding:"10px",background:"var(--bg3)",border:".5px solid var(--b2)",
                borderRadius:"var(--r)",cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",gap:4,fontSize:11,color:"var(--t1)"}}>
              <span style={{fontSize:18}}>𝕏</span>
              <span>Twitter</span>
            </button>
            <button onClick={shareToLinkedIn}
              style={{padding:"10px",background:"var(--bg3)",border:".5px solid var(--b2)",
                borderRadius:"var(--r)",cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",gap:4,fontSize:11,color:"var(--t1)"}}>
              <span style={{fontSize:18}}>in</span>
              <span>LinkedIn</span>
            </button>
            <button onClick={shareToReddit}
              style={{padding:"10px",background:"var(--bg3)",border:".5px solid var(--b2)",
                borderRadius:"var(--r)",cursor:"pointer",display:"flex",flexDirection:"column",
                alignItems:"center",gap:4,fontSize:11,color:"var(--t1)"}}>
              <span style={{fontSize:18}}>r/</span>
              <span>Reddit</span>
            </button>
          </div>

          {/* Referral bonus reminder */}
          <div style={{padding:"11px 14px",background:"var(--td)",border:".5px solid rgba(0,212,168,.3)",
            borderRadius:"var(--r)",fontSize:12,color:"var(--t1)",lineHeight:1.55}}>
 Friends who sign up via your link get <strong style={{color:"var(--teal)"}}>$5 free</strong> — you get <strong style={{color:"var(--teal)"}}>$5</strong> too.
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  REFERRAL MODAL — drops user's referral code + simple share buttons
// ════════════════════════════════════════════════════════════════════════════

const ReferralModal = () => {
  const { referralOpen, closeReferral, referralCode, showToast } = useApp();
  if (!referralOpen) return null;

  const link = `https://decompute.run/?ref=${referralCode}`;
  const copyLink = () => {
    navigator.clipboard?.writeText(link).then(
      () => showToast("Referral link copied!", "success"),
      () => {}
    );
  };

  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1100,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&closeReferral()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        width:"100%",maxWidth:420,
        animation:"modalIn .3s cubic-bezier(.4,0,.2,1) both"}}>
        <div style={{padding:"22px 24px"}}>
          <div style={{textAlign:"center",marginBottom:18}}>
            <div style={{marginBottom:8}}><Gift size={42}/></div>
            <h3 style={{fontSize:20,fontWeight:700,letterSpacing:"-.02em",marginBottom:5}}>
              Give $5, get $5
            </h3>
            <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.55}}>
              Friends who sign up with your link get $5 free. You get $5 too — for every friend.
            </p>
          </div>

          <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
            letterSpacing:".06em",textTransform:"uppercase",marginBottom:6}}>
            Your link
          </label>
          <div style={{display:"flex",gap:7,marginBottom:14}}>
            <input value={link} readOnly
              style={{flex:1,padding:"9px 12px",fontSize:11,background:"var(--bg3)",
                border:".5px solid var(--b2)",borderRadius:"var(--r)",
                color:"var(--t1)",fontFamily:"var(--fm)",minHeight:38}}/>
            <button onClick={copyLink}
              style={{padding:"9px 14px",background:"var(--teal)",color:"#000",border:"none",
                borderRadius:"var(--r)",fontSize:12,fontWeight:600,cursor:"pointer",minHeight:38}}>
              Copy
            </button>
          </div>

          <div style={{background:"var(--bg3)",borderRadius:"var(--r)",padding:"13px 14px",
            border:".5px solid var(--b)",marginBottom:14}}>
            <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:6}}>
              Your referral code
            </div>
            <div style={{fontSize:22,fontFamily:"var(--fm)",fontWeight:600,color:"var(--teal)",letterSpacing:".05em"}}>
              {referralCode}
            </div>
            <div style={{fontSize:11,color:"var(--t2)",marginTop:6}}>
              Friends can also enter this code at signup
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
            <button onClick={()=>window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`I'm using Decompute to run AI without paying AWS prices. Get $5 free: ${link}`)}`, "_blank")}
              style={{padding:"10px",background:"var(--bg3)",border:".5px solid var(--b2)",
                borderRadius:"var(--r)",cursor:"pointer",fontSize:12,color:"var(--t1)"}}>
              𝕏 Tweet it
            </button>
            <button onClick={()=>window.open(`mailto:?subject=Check out Decompute&body=${encodeURIComponent(`I'm using Decompute for AI work — way cheaper than AWS. Get $5 free when you sign up: ${link}`)}`, "_blank")}
              style={{padding:"10px",background:"var(--bg3)",border:".5px solid var(--b2)",
                borderRadius:"var(--r)",cursor:"pointer",fontSize:12,color:"var(--t1)"}}>
              <Mail size={15}/> Email
            </button>
          </div>

          <button onClick={closeReferral}
            style={{width:"100%",padding:"10px",background:"transparent",color:"var(--t2)",
              border:".5px solid var(--b)",borderRadius:"var(--r)",fontSize:12,cursor:"pointer"}}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  EMBED WIDGET MODAL — gives users a script tag to drop on their website
// ════════════════════════════════════════════════════════════════════════════

const EmbedModal = () => {
  const { embedOpen, closeEmbed, showToast, user, referralCode } = useApp();
  const [widgetType, setWidgetType] = useState("chat");
  if (!embedOpen) return null;

  const widgets = {
    chat: {
      name: "Chat widget",
      icon: MessageSquare,
      desc: "A floating chat bubble for your website",
      code: `<script src="https://embed.decompute.io/v1/chat.js"
  data-model="your-model-id"
  data-ref="${referralCode || "DECO"}"></script>`,
    },
    image: {
      name: "Image generator",
      icon: Palette,
      desc: "Let visitors generate images on your site",
      code: `<div id="decompute-image-gen"></div>
<script src="https://embed.decompute.io/v1/image.js"
  data-target="decompute-image-gen"
  data-ref="${referralCode || "DECO"}"></script>`,
    },
    api: {
      name: "API endpoint",
      icon: Plug,
      desc: "Call your model from anywhere",
      code: `fetch("https://api.decompute.io/v1/run", {
  method: "POST",
  headers: { "Authorization":"Bearer YOUR_KEY" },
  body: JSON.stringify({ model: "your-model-id", input:"..." })
})`,
    },
  };

  const current = widgets[widgetType];

  const copyCode = () => {
    navigator.clipboard?.writeText(current.code).then(
      () => showToast("Code copied!", "success"),
      () => {}
    );
  };

  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1100,
        display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&closeEmbed()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        width:"100%",maxWidth:520,
        animation:"modalIn .3s cubic-bezier(.4,0,.2,1) both"}}>
        <div style={{padding:"20px 24px",borderBottom:".5px solid var(--b)",display:"flex",
          justifyContent:"space-between",alignItems:"center"}}>
          <h3 style={{fontSize:16,fontWeight:700}}>Embed on your website</h3>
          <button onClick={closeEmbed} style={{background:"transparent",border:"none",color:"var(--t2)",cursor:"pointer"}}><X size={18}/></button>
        </div>

        <div style={{padding:"18px 24px 24px"}}>
          {/* Widget picker */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginBottom:16}}>
            {Object.entries(widgets).map(([key, w]) => (
              <button key={key} onClick={()=>setWidgetType(key)}
                style={{padding:"11px 9px",background:widgetType===key?"var(--td)":"var(--bg3)",
                  color:widgetType===key?"var(--teal)":"var(--t1)",
                  border:`.5px solid ${widgetType===key?"var(--teal)":"var(--b2)"}`,
                  borderRadius:"var(--r)",cursor:"pointer",textAlign:"center",fontSize:12}}>
                <div style={{marginBottom:4}}><w.icon size={20}/></div>
                <div style={{fontWeight:600}}>{w.name}</div>
              </button>
            ))}
          </div>

          <p style={{fontSize:13,color:"var(--t1)",marginBottom:13,lineHeight:1.55}}>
            {current.desc}
          </p>

          {/* Code block */}
          <div style={{background:"#020608",borderRadius:"var(--r)",padding:"14px 16px",
            fontFamily:"var(--fm)",fontSize:11.5,color:"var(--teal)",
            position:"relative",marginBottom:13,overflowX:"auto"}}>
            <pre style={{margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.55}}>
              {current.code}
            </pre>
            <button onClick={copyCode}
              style={{position:"absolute",top:8,right:8,padding:"4px 10px",fontSize:10,
                fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
              Copy
            </button>
          </div>

          <div style={{padding:"10px 13px",background:"var(--bg3)",borderRadius:"var(--r)",
            fontSize:11,color:"var(--t2)",lineHeight:1.55,border:".5px solid var(--b)"}}>
 Every embed has a small "Powered by Decompute" link.
            Visitors who click through and sign up earn you <strong style={{color:"var(--teal)"}}>$5</strong>.
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  MODEL MARKETPLACE TAB — community-published fine-tuned models
//  Users earn when others use their models. Platform takes 10%.
// ════════════════════════════════════════════════════════════════════════════

const COMMUNITY_MODELS = [
  { id:"m1", emoji:BookOpen, name:"LegalDocs-7B", author:"alex_law",
    desc:"Llama 7B fine-tuned on 50K legal documents. Answers legal questions in plain English.",
    uses:14_293, earnings:"$1,847", price:0.002, rating:4.8, ratings:412,
    tags:["Legal","Q&A","English"], color:"var(--blue)" },
  { id:"m2", emoji:Laptop, name:"CodeReview-13B", author:"dev_jenny",
    desc:"Reviews PRs and suggests improvements. Trained on 100K open-source code reviews.",
    uses:8_172, earnings:"$924", price:0.003, rating:4.7, ratings:218,
    tags:["Code","Reviews","Dev"], color:"var(--teal)" },
  { id:"m3", emoji:Palette, name:"Pixar-Style-XL",  author:"art_collective",
    desc:"Diffusion model fine-tuned on Pixar-inspired illustrations. Family-friendly aesthetics.",
    uses:32_417, earnings:"$4,221", price:0.01, rating:4.9, ratings:1_083,
    tags:["Image","Art","3D"], color:"var(--purple)" },
  { id:"m4", emoji:Stethoscope, name:"MedNotes-Whisper", author:"hospital_lab",
    desc:"Whisper variant tuned for medical terminology. 23% more accurate on clinical audio.",
    uses:5_602, earnings:"$612", price:0.001, rating:4.6, ratings:147,
    tags:["Audio","Medical","HIPAA"], color:"var(--red)" },
  { id:"m5", emoji:ShoppingCart, name:"Product-Recs-3B", author:"shopify_pro",
    desc:"Recommendation engine trained on 2M product purchases. Drop into your e-commerce site.",
    uses:21_904, earnings:"$2,876", price:0.0008, rating:4.7, ratings:519,
    tags:["E-commerce","API","Real-time"], color:"var(--amber)" },
  { id:"m6", emoji:Globe, name:"Translate-50",   author:"polyglot_org",
    desc:"Translates between 50 languages with cultural context. Beats Google Translate on idioms.",
    uses:67_120, earnings:"$8,430", price:0.0005, rating:4.8, ratings:2_104,
    tags:["Translation","Multilingual","API"], color:"var(--blue)" },
];

const ModelMarketplaceTab = ({onInject}) => {
  const { user, openSignup, showToast } = useApp();
  const [filter, setFilter] = useState("All");
  const [sort, setSort] = useState("popular");
  const tags = ["All", "Code", "Image", "Audio", "Translation", "Legal", "Medical"];

  const list = [...COMMUNITY_MODELS]
    .filter(m => filter === "All" || m.tags.some(t => t === filter))
    .sort((a,b) => sort === "popular" ? b.uses - a.uses : sort === "rating" ? b.rating - a.rating : a.price - b.price);

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",
        marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>Community Models</h2>
          <p style={{fontSize:13,color:"var(--t2)",marginTop:3}}>
            Use AI built by people like you · or publish yours and earn forever
          </p>
        </div>
        <Btn onClick={()=>user ? showToast("Model publishing flow coming next!","info") : openSignup()} style={{fontSize:13}}>
          + Publish my model
        </Btn>
      </div>

      {/* Earnings pitch */}
      <div style={{background:"linear-gradient(135deg,rgba(245,166,35,.08),transparent)",
        border:".5px solid rgba(245,166,35,.25)",borderRadius:"var(--r2)",padding:"16px 20px",
        marginBottom:18,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div><Wallet size={30}/></div>
        <div style={{flex:"1 1 240px"}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:3}}>Train once, earn forever</div>
          <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.55}}>
            Publish a fine-tuned model. Every time someone uses it, you earn a cut.
            Top models make <strong style={{color:"var(--amber)"}}>$1,000–$10,000/month</strong>.
            Platform takes 10%, you keep the rest.
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div className="filter-row" style={{flex:"1 1 auto"}}>
          {tags.map(t => (
            <button key={t} onClick={()=>setFilter(t)}
              style={{flexShrink:0,padding:"7px 13px",borderRadius:6,fontSize:12,fontFamily:"var(--fm)",
                background:filter===t?"var(--td)":"var(--bg2)",
                color:filter===t?"var(--teal)":"var(--t2)",
                border:`.5px solid ${filter===t?"var(--teal)":"var(--b)"}`,minHeight:34}}>
              {t}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{padding:"8px 11px",borderRadius:"var(--r)",fontSize:12,minHeight:36,
            background:"var(--bg2)",border:".5px solid var(--b2)"}}>
          <option value="popular">Most used</option>
          <option value="rating">Highest rated</option>
          <option value="cheapest">Cheapest</option>
        </select>
      </div>

      {/* Grid */}
      <div className="node-grid">
        {list.map(m => (
          <Card key={m.id} accent={m.color} onClick={()=>showToast(`Would open ${m.name} details`,"info")}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:11}}>
              <div style={{flexShrink:0}}><m.emoji size={30}/></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,marginBottom:2,letterSpacing:"-.01em"}}>{m.name}</div>
                <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>by {m.author}</div>
              </div>
              <div style={{fontFamily:"var(--fm)",padding:"3px 8px",borderRadius:4,
                background:"var(--bg3)",color:"var(--amber)",whiteSpace:"nowrap"}}>
                <Star size={13}/> {m.rating}
              </div>
            </div>
            <div style={{fontSize:12,color:"var(--t1)",lineHeight:1.6,marginBottom:12}}>{m.desc}</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}>
              {m.tags.map(t => <Pill key={t} label={t}/>)}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:13}}>
              <MStat label="Uses" value={m.uses.toLocaleString()} color="var(--teal)"/>
              <MStat label="Per call" value={`$${m.price.toFixed(4)}`} color="var(--amber)"/>
              <MStat label="Earned" value={m.earnings} color="var(--blue)"/>
            </div>
            <Btn full onClick={e=>{e.stopPropagation();user?showToast(`Would run ${m.name}`,"info"):openSignup();}}>
              Use this model →
            </Btn>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  GLOBAL ACCESS STRIP — for users without good internet or English
//  WhatsApp / Telegram / SMS interfaces shown prominently
// ════════════════════════════════════════════════════════════════════════════

const GlobalAccessStrip = () => {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem("decompute_global_dismissed") === "1"; } catch { return false; }
  });
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem("decompute_global_dismissed", "1"); } catch {}
  };

  return (
    <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r)",
      padding:"10px 14px",marginBottom:14,display:"flex",alignItems:"center",gap:12,
      flexWrap:"wrap",fontSize:12}}>
      <span style={{color:"var(--t1)",display:"flex"}}><Globe size={18}/></span>
      <span style={{color:"var(--t1)",flex:"1 1 240px",lineHeight:1.5}}>
        Slow internet? Don't speak English? Use Decompute via{" "}
        <a href="https://wa.me/14155551234" target="_blank" rel="noopener noreferrer" style={{color:"var(--teal)",textDecoration:"none",fontWeight:600}}>WhatsApp</a>,{" "}
        <a href="https://t.me/decomputebot" target="_blank" rel="noopener noreferrer" style={{color:"var(--teal)",textDecoration:"none",fontWeight:600}}>Telegram</a>, or{" "}
        <a href="sms:+14155551234" style={{color:"var(--teal)",textDecoration:"none",fontWeight:600}}>SMS</a>.
        Same AI, anywhere.
      </span>
      <button onClick={dismiss} style={{padding:"4px 8px",fontSize:11,background:"transparent",
        color:"var(--t2)",border:".5px solid var(--b)",borderRadius:4,cursor:"pointer"}}>
        Got it
      </button>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  ACHIEVEMENT TOAST — slides in when user unlocks something
// ════════════════════════════════════════════════════════════════════════════

const AchievementToast = () => {
  const { achievementUnlock } = useApp();
  if (!achievementUnlock) return null;

  return (
    <div role="status" aria-live="polite"
      style={{position:"fixed",top:80,left:"50%",transform:"translateX(-50%)",zIndex:1050,
        background:"linear-gradient(135deg,rgba(245,166,35,.2),rgba(155,109,255,.15))",
        border:"1px solid rgba(245,166,35,.5)",borderRadius:"var(--r2)",
        padding:"14px 22px",display:"flex",alignItems:"center",gap:13,
        maxWidth:"90vw",
        boxShadow:"0 12px 40px rgba(0,0,0,.5), 0 0 32px rgba(245,166,35,.15)",
        animation:"modalIn .4s cubic-bezier(.4,0,.2,1) both",
        backdropFilter:"blur(8px)"}}>
      <div><achievementUnlock.icon size={32}/></div>
      <div>
        <div style={{fontSize:10,color:"var(--amber)",fontFamily:"var(--fm)",letterSpacing:".1em",textTransform:"uppercase"}}>
          Achievement unlocked!
        </div>
        <div style={{fontSize:15,fontWeight:700,color:"var(--t0)",marginTop:2}}>
          {achievementUnlock.label}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  HERO QUICK START — big outcome-first card at the top of the marketplace
//  This is the entry point that bypasses all the technical complexity
// ════════════════════════════════════════════════════════════════════════════

const HeroQuickStart = () => {
  const { openQuickStart, user } = useApp();
  return (
    <div style={{background:"linear-gradient(135deg,rgba(0,212,168,.12),rgba(155,109,255,.08))",
      border:".5px solid rgba(0,212,168,.3)",borderRadius:"var(--r2)",padding:"22px 26px",marginBottom:20,
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-40,right:-40,width:200,height:200,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(0,212,168,.15),transparent)",pointerEvents:"none"}}/>
      <div style={{position:"relative"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:18,flexWrap:"wrap"}}>
          <div style={{flex:"1 1 280px"}}>
            <div style={{fontFamily:"var(--fm)",color:"var(--teal)",letterSpacing:".15em",marginBottom:6}}>
              <Sparkles size={15}/> NO TECHNICAL SKILLS NEEDED
            </div>
            <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:8,lineHeight:1.15}}>
              What do you want to build?
            </h2>
            <p style={{fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:14,maxWidth:440}}>
              Chatbots, image generators, transcription, custom AI — all in one click.
              We handle every complicated bit. {user ? "" : "First $5 is free."}
            </p>
            <button onClick={openQuickStart}
              style={{padding:"12px 22px",background:"var(--teal)",color:"#000",border:"none",
                borderRadius:"var(--r)",fontSize:14,fontWeight:700,cursor:"pointer",
                boxShadow:"0 4px 14px rgba(0,212,168,.3)",
                display:"inline-flex",alignItems:"center",gap:7}}>
              Start building →
            </button>
            {!user && (
              <span style={{fontSize:11,color:"var(--t2)",marginLeft:14}}>
                No credit card needed
              </span>
            )}
          </div>
          {/* Outcome icons strip */}
          <div style={{display:"flex",gap:8,flexShrink:0,alignSelf:"center",flexWrap:"wrap"}}>
 {[MessageSquare, Palette, Mic, Brain, Clapperboard, NotebookPen].map((Icon, i) => (
              <div key={i} style={{width:46,height:46,borderRadius:"var(--r)",
                background:"var(--bg2)",border:".5px solid var(--b2)",
                display:"flex",alignItems:"center",justifyContent:"center",
                opacity:.85,
                animation:`fadeUp .${4+i}s ease both`,animationDelay:`${i*0.05}s`}}>
                <Icon size={20}/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  COMMAND PALETTE — press ⌘K / Ctrl+K to jump anywhere or do anything.
//  Power-user speed without cluttering the UI for everyone else.
// ════════════════════════════════════════════════════════════════════════════
const CommandPalette = ({ setTab }) => {
  const { openQuickStart, openAddFunds, openReferral, user, openSignup } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const commands = useMemo(() => [
    { id: "build", icon: Sparkles, label:"Build something new", hint:"Quick Start", action: () => openQuickStart() },
    { id: "marketplace", icon:Store, label:"Browse computers", hint:"Marketplace", action: () => setTab("Marketplace") },
    { id: "models", icon: Bot, label:"Browse community models", hint:"Models", action: () => setTab("Models") },
    { id: "jobs", icon:ListChecks, label:"View my jobs", hint:"My Jobs", action: () => setTab("My Jobs") },
    { id: "earn", icon: Wallet, label:"Earn with my computer", hint:"Provider Hub", action: () => setTab("Provider Hub") },
    { id: "pricing", icon: Banknote, label:"Compare pricing", hint:"Pricing", action: () => setTab("Pricing") },
    { id: "funds", icon: CreditCard, label:"Add funds", hint: user ?"":"Sign in first", action: () => user ? openAddFunds() : openSignup() },
    { id: "invite", icon: Gift, label:"Invite friends (give $5, get $5)", hint:"", action: () => user ? openReferral() : openSignup() },
  ], [openQuickStart, openAddFunds, openReferral, setTab, user, openSignup]);

  const filtered = query
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(o => !o);
        setQuery(""); setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  if (!open) return null;

  const run = (cmd) => { cmd.action(); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && filtered[active]) { e.preventDefault(); run(filtered[active]); }
  };

  return (
    <div className="cmd-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
      <div className="cmd-box" role="dialog" aria-label="Command palette">
        <div style={{padding:"12px 16px",borderBottom:".5px solid var(--b)",display:"flex",alignItems:"center",gap:10}}>
          <span style={{color:"var(--t2)",fontSize:15}}>⌘</span>
          <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:"var(--t0)",fontSize:15,fontFamily:"inherit"}}/>
          <kbd style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",padding:"2px 6px",border:".5px solid var(--b2)",borderRadius:4}}>ESC</kbd>
        </div>
        <div style={{maxHeight:340,overflowY:"auto",padding:"6px 0"}}>
          {filtered.length === 0 ? (
            <div style={{padding:"20px 16px",fontSize:13,color:"var(--t2)",textAlign:"center"}}>
              No matches. Try "build", "jobs", or "earn".
            </div>
          ) : filtered.map((c, i) => (
            <button key={c.id} className="cmd-item" data-active={i === active}
              onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
              <span style={{width:24,textAlign:"center"}}><c.icon size={18}/></span>
              <span style={{flex:1}}>{c.label}</span>
              {c.hint && <span style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>{c.hint}</span>}
            </button>
          ))}
        </div>
        <div style={{padding:"9px 16px",borderTop:".5px solid var(--b)",display:"flex",gap:14,fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)"}}>
          <span>↑↓ navigate</span><span>↵ select</span><span>esc close</span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  SECURITY REASSURANCE — a small, friendly explainer that demystifies
//  "USDC" and "escrow" for people who've never touched crypto.
// ════════════════════════════════════════════════════════════════════════════
const SecurityReassurance = ({ compact }) => (
  <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:compact?"9px 12px":"12px 15px",
    background:"var(--bg3)",border:".5px solid var(--b)",borderRadius:"var(--r)",fontSize:12,lineHeight:1.55}}>
    <span style={{flexShrink:0}}><Lock size={16}/></span>
    <div style={{color:"var(--t1)"}}>
      <strong style={{color:"var(--t0)"}}>Your money is safe.</strong> Funds are held securely and only
      released when your job finishes. If anything goes wrong, you're refunded automatically.
      {!compact && <> We use <Info text="USDC is a digital dollar — always worth exactly $1, backed by real US dollars and Treasury bonds, with public monthly audits. It's the most trusted, regulated digital currency.">USDC (digital dollars)</Info> behind the scenes, but you never have to think about it.</>}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════════════
//  BALANCE CHIP — header chip showing balance + quick "Add" for logged-in users
// ════════════════════════════════════════════════════════════════════════════
const BalanceChip = () => {
  const { user, openAddFunds } = useApp();
  if (!user) return null;
  const balance = parseFloat(user.balanceUsdc || user.balance || 0).toFixed(2);
  return (
    <button onClick={openAddFunds} title="Add funds"
      style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 7px 5px 11px",
        background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:18,cursor:"pointer",
        transition:"border-color .15s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="var(--teal)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b2)"}>
      <span style={{fontSize:12,fontFamily:"var(--fm)",color:"var(--t1)"}}>
        <span style={{color:"var(--t2)"}}>$</span><span style={{color:"var(--teal)",fontWeight:600}}>{balance}</span>
      </span>
      <span style={{width:18,height:18,borderRadius:"50%",background:"var(--td)",color:"var(--teal)",
        display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:600,lineHeight:1}}>+</span>
    </button>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  CREATE TAB — what Simple Mode users land on. No GPUs, no jargon,
//  just "what do you want to make?" laid out as big friendly cards.
// ════════════════════════════════════════════════════════════════════════════
const CreateTab = () => {
  const { openQuickStart, user, openSignup, backendOnline, availableWorkloads } = useApp();

  return (
    <div className="fade-in">
      {/* Warm, plain-language header */}
      <div style={{textAlign:"center",padding:"18px 0 26px"}}>
        <h1 style={{fontSize:30,fontWeight:700,letterSpacing:"-.03em",marginBottom:10,lineHeight:1.15}}>
          What would you like to make?
        </h1>
        <p style={{fontSize:14,color:"var(--t1)",lineHeight:1.6,maxWidth:460,margin:"0 auto"}}>
          Pick something below and answer a couple of simple questions.
          We handle all the technical parts for you.
        </p>
        {!user && (
          <div style={{marginTop:14,display:"inline-flex",alignItems:"center",gap:7,
            padding:"7px 14px",borderRadius:20,background:"var(--td)",
            border:".5px solid rgba(0,212,168,.3)",color:"var(--teal)"}}>
            <Gift size={15}/> Your first $5 is free — no card needed
          </div>
        )}
      </div>

      {/* Big outcome cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",
        gap:14,maxWidth:840,margin:"0 auto"}}>
        {JOB_CATALOG.filter(o => o.simple && (!backendOnline || availableWorkloads.includes(o.id))).map(o => (
          <button key={o.id} onClick={()=>openQuickStart(o.id)} className="lift"
            style={{padding:"22px 20px",background:"var(--bg2)",
              border:".5px solid var(--b2)",borderRadius:"var(--r2)",
              cursor:"pointer",textAlign:"left",display:"flex",flexDirection:"column",
              gap:8,minHeight:172,transition:"all .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=o.simple.color;
              e.currentTarget.style.transform="translateY(-3px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b2)";
              e.currentTarget.style.transform="";}}>
            <div style={{lineHeight:1,marginBottom:2}}><o.icon size={38}/></div>
            <div style={{fontSize:17,fontWeight:700,color:"var(--t0)",letterSpacing:"-.01em"}}>{o.simple.title}</div>
            <div style={{fontSize:13,color:"var(--t1)",lineHeight:1.5,marginBottom:"auto"}}>{o.simple.sub}</div>
            <div style={{display:"flex",gap:12,marginTop:10,fontSize:11,
              fontFamily:"var(--fm)",color:"var(--t2)"}}>
              <span>⏱ {o.estimatedTime}</span>
              <span>{o.estimatedCost}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Reassurance strip */}
      <div style={{maxWidth:840,margin:"26px auto 0",display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
        {[
          {icon:Lock,title:"Your money is safe",body:"You're only charged when something works. Failures are refunded automatically."},
          {icon:Leaf,title:"Kinder to the planet",body:"We use computers that already exist instead of building new data centres."},
          {icon:MessageSquare,title:"Stuck? Just ask",body:"Tap the help button any time. Plain English, no manuals."},
        ].map(item => (
          <div key={item.title} style={{background:"var(--bg2)",border:".5px solid var(--b)",
            borderRadius:"var(--r2)",padding:"14px 16px"}}>
            <div style={{marginBottom:6}}><item.icon size={18}/></div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{item.title}</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.55}}>{item.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  MY STUFF — Simple Mode's version of "My Jobs". Shows what you made,
//  not job statuses and GPU utilization charts.
// ════════════════════════════════════════════════════════════════════════════
const MyStuffTab = () => {
  const { user, openSignup, openQuickStart, backendOnline, openShare } = useApp();
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user || !backendOnline) { setLoading(false); return; }
    api("GET", "/api/outputs/mine")
      .then(r => { if (!cancelled) { setItems(r.data || []); setLoading(false); } })
      .catch(() => { if (!cancelled) { setItems([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [user, backendOnline]);

  if (!user) {
    return (
      <div className="fade-in" style={{textAlign:"center",padding:"60px 20px"}}>
        <div style={{marginBottom:14}}><Package size={46}/></div>
        <h2 style={{fontSize:20,fontWeight:700,marginBottom:8}}>Your creations live here</h2>
        <p style={{fontSize:13,color:"var(--t2)",marginBottom:20,maxWidth:320,margin:"0 auto 20px",lineHeight:1.6}}>
          Sign in to see everything you've made and share it with friends.
        </p>
        <Btn onClick={openSignup}>Sign in — it's free</Btn>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fade-in" style={{textAlign:"center",padding:"60px 20px"}}>
        <Spin/>
        <p style={{fontSize:13,color:"var(--t2)",marginTop:12}}>Loading your creations…</p>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="fade-in" style={{textAlign:"center",padding:"56px 20px"}}>
        <div style={{marginBottom:14}}><Sparkles size={46}/></div>
        <h2 style={{fontSize:20,fontWeight:700,marginBottom:8}}>Nothing here yet</h2>
        <p style={{fontSize:13,color:"var(--t2)",marginBottom:20,maxWidth:340,margin:"0 auto 20px",lineHeight:1.6}}>
          Make your first thing — it takes about a minute and your first $5 is on us.
        </p>
        <Btn onClick={()=>openQuickStart()}>Make something →</Btn>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>My creations</h2>
          <p style={{fontSize:13,color:"var(--t2)",marginTop:3}}>
            {items.length} {items.length === 1 ? "thing" : "things"} you've made
          </p>
        </div>
        <Btn onClick={()=>openQuickStart()}>+ Make something new</Btn>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
        {items.map(item => (
          <div key={item.id} style={{background:"var(--bg2)",border:".5px solid var(--b2)",
            borderRadius:"var(--r2)",overflow:"hidden"}}>
            {item.thumbnail_url && (
              <img src={item.thumbnail_url} alt={item.prompt || "creation"}
                style={{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block"}}/>
            )}
            <div style={{padding:"10px 12px"}}>
              <div style={{fontSize:12,color:"var(--t1)",lineHeight:1.5,
                display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",
                overflow:"hidden",marginBottom:8}}>
                {item.prompt || "Untitled"}
              </div>
              <button onClick={()=>openShare("outcome",{
                  title:"My creation", icon:Palette,
                  preview:item.prompt, slug:item.slug, imageUrl:item.url,
                })}
                style={{width:"100%",padding:"6px",fontSize:11,fontFamily:"var(--fm)",
                  background:"var(--bg3)",color:"var(--t1)",border:".5px solid var(--b)",
                  borderRadius:6,cursor:"pointer"}}>
                <Upload size={15}/> Share
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
//  SIMPLE MODE TOGGLE — lets people move between the friendly and full product
// ════════════════════════════════════════════════════════════════════════════
const SimpleModeToggle = ({compact}) => {
  const { simpleMode, toggleSimpleMode, setActiveTab } = useApp();
  const flip = () => {
    toggleSimpleMode();
    // Send them somewhere that exists in the mode they're switching to
    setActiveTab(simpleMode ? "Marketplace" : "Create");
  };
  return (
    <button onClick={flip} title={simpleMode ? "Show advanced features" : "Switch to simple view"}
      style={{display:"inline-flex",alignItems:"center",gap:6,
        padding: compact ? "5px 10px" : "6px 12px",
        background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:16,
        cursor:"pointer",color:"var(--t2)",fontSize:11,whiteSpace:"nowrap",
        transition:"border-color .15s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="var(--teal)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b2)"}>
      <span>{simpleMode ? <Leaf size={13}/> : <Settings size={13}/>}</span>
      <span>{simpleMode ? "Simple":"Advanced"}</span>
    </button>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════════
const NodeCard = ({node,onRent,onAsk}) => {
  const util=Math.round(((node.total-node.avail)/node.total)*100);
  const off=node.status==="offline";
  const scoreColor=node.aiScore>=90?"var(--teal)":node.aiScore>=75?"var(--blue)":"var(--amber)";
  const scoreBg=node.aiScore>=90?"var(--td)":node.aiScore>=75?"var(--bd)":"var(--ad)";
  return(
    <Card accent={off?"var(--red)":"var(--teal)"} onClick={off?null:onRent}
      style={{display:"flex",flexDirection:"column"}}>
      {/* AI score */}
      <div title={`AI quality score: ${node.aiScore}/100. ${node.aiScore>=90?"Excellent — consistently reliable and fast.":node.aiScore>=75?"Good — solid choice for most jobs.":"Decent — fine for non-critical work."}`}
        style={{position:"absolute",top:14,right:14,fontSize:10,fontFamily:"var(--fm)",padding:"2px 8px",
        borderRadius:4,background:scoreBg,color:scoreColor,border:`.5px solid ${scoreColor}44`,cursor:"help"}}>
 {node.aiScore}
      </div>
      <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:12,paddingRight:60}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><Dot s={node.status}/><span style={{fontSize:14,fontWeight:600,letterSpacing:"-.01em"}}>{node.name}</span></div>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>{node.provider} · {node.location}</div>
        </div>
        <TierBadge tier={node.tier}/>
      </div>
      <div style={{background:"var(--bg3)",borderRadius:"var(--r)",padding:"9px 12px",marginBottom:11,border:".5px solid var(--b)"}}>
        <div style={{fontSize:12,color:"var(--teal)",fontFamily:"var(--fm)",fontWeight:500,marginBottom:3}}>{node.gpu}</div>
        <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>{node.vram} VRAM · {node.ram} RAM</div>
      </div>
 <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.5,marginBottom:10,fontStyle:"italic"}}> {node.useCase}</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <div><div style={{fontSize:10,color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:3}}><Info text="The hourly rate. You only pay for actual time used — if your job finishes in 30 min, you pay for 30 min.">Per hour</Info></div><div style={{fontSize:16,fontFamily:"var(--fm)",fontWeight:500,color:"var(--amber)",lineHeight:1.1}}>{`$${node.price.toFixed(2)}`}</div></div>
        <div><div style={{fontSize:10,color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:3}}><Info text="What percentage of the time this computer has been online and working. 99%+ is excellent.">Uptime</Info></div><div style={{fontSize:16,fontFamily:"var(--fm)",fontWeight:500,color:"var(--teal)",lineHeight:1.1}}>{node.uptime}</div></div>
        <div><div style={{fontSize:10,color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase",fontFamily:"var(--fm)",marginBottom:3}}><Info text="A reputation score based on how reliably this computer has delivered jobs. Higher means more dependable.">Trust</Info></div><div style={{fontSize:16,fontFamily:"var(--fm)",fontWeight:500,color:"var(--blue)",lineHeight:1.1}}>{`${node.rep}/100`}</div></div>
        <MStat label="Available" value={`${node.avail}/${node.total}`}
          color={node.avail===0?"var(--red)":node.avail<=3?"var(--amber)":"var(--teal)"}/>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)"}}>
          <span>How busy</span><span style={{color:"var(--t1)"}}>{util}%</span>
        </div>
        <Bar v={util} c={util>80?"var(--amber)":"var(--teal)"}/>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
        {node.tags.map(t=><Pill key={t} label={t}/>)}
 {node.tee&&<Pill label={` ${node.attest}`} accent="var(--teal)"/>}
      </div>
      <div style={{display:"flex",gap:8,marginTop:"auto"}}>
        <button disabled={off} onClick={e=>{e.stopPropagation();if(!off)onRent();}}
          style={{flex:1,padding:"10px",borderRadius:"var(--r)",fontSize:13,fontWeight:600,
            background:off?"var(--bg3)":"var(--teal)",color:off?"var(--t2)":"#000",
            border:"none",opacity:off?.5:1,cursor:off?"not-allowed":"pointer",minHeight:42}}>
          {off?"Not available":`Rent · $${node.price.toFixed(2)}/hour`}
        </button>
        <button onClick={e=>{e.stopPropagation();onAsk(node);}}
          title="Ask AI about this node"
          style={{width:42,height:42,border:".5px solid rgba(155,109,255,.35)",borderRadius:"var(--r)",background:"var(--pd)",color:"var(--purple)",fontSize:14,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Sparkles size={14}/></button>
      </div>
    </Card>
  );
};

const Marketplace = ({onRent,onInject}) => {
  const { nodes } = useApp();
  const [filt,setFilt]=useState("All");
  const [sort,setSort]=useState("ai");
  const tiers=["All","Hyperscale","Enterprise","Professional","Starter"];
  const list=[...nodes].filter(n=>filt==="All"||n.tier===filt)
    .sort((a,b)=>sort==="price"?a.price-b.price:sort==="rep"?b.rep-a.rep:b.aiScore-a.aiScore);
  return(
    <div className="fade-in">
      <OneLineExplainer/>
      <GlobalAccessStrip/>
      <HeroQuickStart/>
      <TrustBar/>
      <NodeMatcher onInject={onInject}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>Browse Computers</h2>
          <p style={{fontSize:13,color:"var(--t2)",marginTop:3}}>
            {nodes.filter(n=>n.status!=="offline").length} computers ready to rent · {nodes.reduce((a,n)=>a+n.avail,0)} spots available right now
            <span style={{marginLeft:8,color:"var(--purple)",fontSize:11,fontFamily:"var(--fm)"}}>· best matches first</span>
          </p>
        </div>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{padding:"8px 12px",borderRadius:"var(--r)",fontSize:12,minHeight:38,background:"var(--bg2)",border:".5px solid var(--b2)"}}>
          <option value="ai">Best match</option>
          <option value="price">Cheapest first</option>
          <option value="rep">Most trusted</option>
        </select>
      </div>
      <div className="filter-row" style={{marginBottom:18}}>
        {tiers.map(t=>(
          <button key={t} onClick={()=>setFilt(t)} style={{flexShrink:0,padding:"7px 14px",borderRadius:6,fontSize:12,fontFamily:"var(--fm)",
            background:filt===t?"var(--td)":"var(--bg2)",color:filt===t?"var(--teal)":"var(--t2)",
            border:`.5px solid ${filt===t?"var(--teal)":"var(--b)"}`,minHeight:36,transition:"all .15s"}}>{t}</button>
        ))}
      </div>
      {list.length===0?(
        <div style={{textAlign:"center",padding:"60px 24px",background:"var(--bg2)",
          border:".5px solid var(--b2)",borderRadius:"var(--r2)"}}>
          <div style={{marginBottom:14,opacity:.5}}><Search size={40}/></div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No computers match those filters</div>
          <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6,maxWidth:340,margin:"0 auto 16px"}}>
            Try changing the filter or sort options above. New computers join the network all the time.
          </div>
          <button onClick={()=>{setFilt("All");setSort("ai");}}
            style={{padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:600,
              background:"var(--td)",color:"var(--teal)",border:".5px solid var(--teal)",cursor:"pointer"}}>
            Clear filters
          </button>
        </div>
      ):(
        <div className="node-grid" data-tour="marketplace-grid">
        {list.map(n=>(
          <NodeCard key={n.id} node={n}
            onRent={()=>onRent(n)}
            onAsk={node=>onInject(`Compare ${node.name} with alternatives for cost-effectiveness. Is $${node.price.toFixed(2)}/hr competitive for ${node.gpu}? Quick verdict.`)}/>
        ))}
      </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  MY JOBS
// ═══════════════════════════════════════════════════════════════════════════════
const CostOptimizer = ({onInject}) => {
  const { jobs } = useApp();
  const [res,setRes]=useState(null);
  const [busy,setBusy]=useState(false);
  const run=async()=>{
    setBusy(true);setRes(null);
    const summary=jobs.map(j=>`${j.name}: ${j.status}, cost $${j.cost}, GPU util ${j.gpu}%, node ${j.node}`).join("\n");
    try{
      const r=await claude([{role:"user",content:`Analyze these active compute jobs:\n${summary}\n\nGive me:\n1) Total spend summary\n2) Any waste or inefficiency (be specific)\n3) One immediate optimization action\n\nMax 4 bullet points. Be direct.`}]);
      setRes(r);
 }catch{setRes("Analysis failed.");}
    finally{setBusy(false);}
  };
  return(
    <div style={{background:"var(--bg2)",border:".5px solid rgba(0,212,168,.25)",borderRadius:"var(--r2)",padding:"16px 19px",marginBottom:20,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,var(--teal),transparent)",opacity:.5}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:res?14:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span><Wallet size={16}/></span>
          <span style={{fontSize:14,fontWeight:700}}>Help me save money</span>
          <span className="ai-badge">AI tip</span>
        </div>
        <Btn onClick={run} disabled={busy} style={{fontSize:12,padding:"7px 15px"}}>
          {busy?<><Spin/> Looking…</>:"Show me how →"}
        </Btn>
      </div>
      {res&&(
        <div style={{fontSize:13,lineHeight:1.7,color:"var(--t1)",whiteSpace:"pre-wrap",padding:"13px",background:"var(--bg3)",borderRadius:"var(--r)",border:".5px solid var(--b)"}}>
          {res}
        </div>
      )}
    </div>
  );
};

const AnomalyDetail = ({job}) => {
  const [detail,setDetail]=useState(null);
  const [busy,setBusy]=useState(false);
  if(!job.anomaly)return null;
  const investigate=async e=>{
    e.stopPropagation();setBusy(true);
    try{
      const r=await claude([{role:"user",content:`Job "${job.name}" has an anomaly:\n${job.aiInsight}\n\nProvide: 1) Most likely root cause, 2) Exact command/parameter fix to try, 3) Expected improvement. Be very specific.`}],350);
      setDetail(r);
    }catch{setDetail("Investigation failed.");}
    finally{setBusy(false);}
  };
  return(
    <div style={{marginTop:8}}>
      <div onClick={investigate} className="anomaly-pulse"
        style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontFamily:"var(--fm)",padding:"3px 9px",borderRadius:4,background:"var(--rd)",color:"var(--red)",border:".5px solid rgba(255,77,106,.35)",cursor:"pointer"}}>
 {busy ? <Spin/> : <TriangleAlert size={12}/>} Something looks off — tap to see why
      </div>
      {detail&&(
        <div style={{marginTop:8,fontSize:12,lineHeight:1.65,color:"var(--t1)",padding:"10px 12px",background:"var(--bg3)",borderRadius:"var(--r)",border:".5px solid rgba(255,77,106,.25)",whiteSpace:"pre-wrap"}}>
          {detail}
        </div>
      )}
    </div>
  );
};

const JobRow = ({job,isMobile,onOpenLive}) => {
  const [expanded,setExpanded]=useState(false);
  const JC={running:"var(--teal)",queued:"var(--amber)",completed:"var(--t2)"};
  const inner=(
    <>
      <div style={{padding:"12px 20px 14px",background:"var(--bg3)",borderBottom:".5px solid var(--b)",
        ...(isMobile&&{borderRadius:"0 0 var(--r2) var(--r2)",margin:"-1px 0 10px",border:".5px solid var(--b2)",borderTop:"none"})}}>
 <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",marginBottom:6}}> What's happening</div>
        <div style={{fontSize:12,lineHeight:1.65,color:"var(--t1)"}}>{job.aiInsight}</div>
        <AnomalyDetail job={job}/>
      </div>
    </>
  );
  if(!isMobile) return(
    <div>
      <div className="jdesk" onClick={()=>setExpanded(x=>!x)}
        style={{padding:"13px 20px",borderBottom:".5px solid var(--b)",cursor:"pointer",transition:"background .15s"}}
        onMouseEnter={e=>e.currentTarget.style.background="var(--bg3)"}
        onMouseLeave={e=>e.currentTarget.style.background=""}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:13,fontWeight:500}}>{job.name}</span>
 {job.anomaly&&<span className="anomaly-pulse" style={{fontSize:10,fontFamily:"var(--fm)",padding:"1px 6px",borderRadius:3,background:"var(--rd)",color:"var(--red)"}}> anomaly</span>}
          </div>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>{job.node}</div>
        </div>
        <div>{job.status==="running"&&<><div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11,fontFamily:"var(--fm)",color:"var(--t2)"}}><span>{job.prog}%</span><span style={{color:job.gpu<70?"var(--amber)":"var(--teal)"}}>GPU {job.gpu}%</span></div><Bar v={job.prog}/></>}</div>
        <div style={{display:"flex",alignItems:"center",gap:5}}><Dot s={job.status}/><span style={{fontSize:12,color:JC[job.status],fontFamily:"var(--fm)",textTransform:"capitalize"}}>{job.status}</span></div>
        <span style={{fontFamily:"var(--fm)",fontSize:12,color:"var(--t1)"}}>{job.elapsed}</span>
        <span style={{fontFamily:"var(--fm)",fontSize:12,color:"var(--t2)"}}>{job.eta}</span>
        <span style={{fontFamily:"var(--fm)",fontSize:13,color:"var(--amber)",fontWeight:500,display:"flex",alignItems:"center",gap:7}}>
          ${job.cost.toFixed(2)}
          {job.status==="running" && onOpenLive && (
            <button onClick={e=>{e.stopPropagation();onOpenLive(job);}}
              title="Watch live"
              style={{padding:"3px 8px",fontSize:10,fontFamily:"var(--fm)",
                background:"var(--td)",color:"var(--teal)",border:".5px solid rgba(0,212,168,.4)",
                borderRadius:4,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"var(--teal)",animation:"pulse 1.4s infinite"}}/>
              Live
            </button>
          )}
        </span>
      </div>
      {expanded&&inner}
    </div>
  );
  return(
    <div style={{borderRadius:"var(--r2)",background:"var(--bg2)",border:".5px solid var(--b2)",marginBottom:10,overflow:"hidden"}}>
      <div className="jmob" style={{padding:"13px 15px",cursor:"pointer"}} onClick={()=>setExpanded(x=>!x)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:job.status==="running"?10:0}}>
          <div style={{flex:1,minWidth:0,marginRight:10}}>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:600}}>{job.name}</span>
 {job.anomaly&&<span style={{fontSize:10,padding:"1px 5px",borderRadius:3,background:"var(--rd)",color:"var(--red)"}}> anomaly</span>}
            </div>
            <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>{job.node}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
            <span style={{fontFamily:"var(--fm)",fontSize:13,color:"var(--amber)",fontWeight:500}}>${job.cost.toFixed(2)}</span>
            {job.status==="running" && onOpenLive && (
              <button onClick={e=>{e.stopPropagation();onOpenLive(job);}}
                style={{padding:"3px 8px",fontSize:10,fontFamily:"var(--fm)",
                  background:"var(--td)",color:"var(--teal)",border:".5px solid rgba(0,212,168,.4)",
                  borderRadius:4,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4}}>
                <span style={{width:5,height:5,borderRadius:"50%",background:"var(--teal)",animation:"pulse 1.4s infinite"}}/>
                Live
              </button>
            )}
          </div>
        </div>
        {job.status==="running"&&<div style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:11,fontFamily:"var(--fm)",color:"var(--t2)"}}><span>Progress {job.prog}%</span><span style={{color:job.gpu<70?"var(--amber)":"var(--teal)"}}>GPU {job.gpu}%</span></div><Bar v={job.prog}/></div>}
        <div style={{display:"flex",gap:10,fontSize:11,fontFamily:"var(--fm)",color:"var(--t2)"}}><Dot s={job.status}/><span style={{color:JC[job.status],textTransform:"capitalize"}}>{job.status}</span><span>· {job.elapsed}</span><span>· ETA {job.eta}</span></div>
      </div>
      {expanded&&inner}
    </div>
  );
};

const MyJobs = ({onInject}) => {
  const { jobs, user, login, openSignup, openLiveJob } = useApp();
  const [showNew, setShowNew] = useState(false);
  const mob=useIsMobile();
  const running = jobs.filter(j=>j.status==="running").length;
  const queued = jobs.filter(j=>j.status==="queued").length;
  const completed = jobs.filter(j=>j.status==="completed").length;
  return(
    <div className="fade-in">
      {!user && (
        <div style={{background:"var(--ad)",border:".5px solid rgba(245,166,35,.35)",borderRadius:"var(--r2)",padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
 <span style={{fontSize:13,color:"var(--amber)"}}> Sign in to start running jobs — takes 30 seconds</span>
          <Btn onClick={openSignup} style={{fontSize:12,padding:"6px 14px"}}>Sign in</Btn>
        </div>
      )}
      <CostOptimizer onInject={onInject}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>My Jobs</h2>
          <p style={{fontSize:13,color:"var(--t2)",marginTop:3}}>{running} running · {queued} waiting · {completed} done · tap a job to see details</p>
        </div>
        <div style={{display:"flex",gap:8}}>
 <Btn v="ghost" onClick={()=>onInject("Give me a cost breakdown and specific optimization for all my active jobs")} style={{fontSize:12}}> Ask AI</Btn>
          <Btn onClick={()=>setShowNew(true)} style={{fontSize:13}}>+ New Job</Btn>
        </div>
      </div>
      {showNew && <NewJobModal onClose={()=>setShowNew(false)}/>}
      <div className="g4" style={{marginBottom:20}}>
        {[{label:"Spent so far",value:"$34.01",color:"var(--amber)"},{label:"Work done",value:"9.72B",color:"var(--teal)"},{label:"Hours used",value:"3.0h",color:"var(--blue)"},{label:"Average busy",value:"91%",color:"var(--purple)"}].map(s=>(
          <div key={s.label} style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r2)",padding:"15px 17px"}}>
            <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:7}}>{s.label}</div>
            <div style={{fontSize:22,fontFamily:"var(--fm)",fontWeight:500,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>
      <div className="job-box">
        {!mob&&(
          <div className="jdesk" style={{padding:"10px 20px",background:"var(--bg3)",borderBottom:".5px solid var(--b2)"}}>
            {["Job Name","Progress","Status","Elapsed","ETA","Cost"].map(h=>(
              <span key={h} style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",textTransform:"uppercase",letterSpacing:".06em"}}>{h}</span>
            ))}
          </div>
        )}
        <div style={{...(mob&&{padding:"2px 0"})}}>
          {jobs.length===0?<div style={{padding:"48px 24px",textAlign:"center"}}>
            <div style={{marginBottom:14,opacity:.85}}><Briefcase size={48}/></div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--t0)",marginBottom:7,letterSpacing:"-.01em"}}>Run your first job in 60 seconds</div>
            <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.65,maxWidth:380,margin:"0 auto 20px"}}>
              We have templates for the most common tasks. Pick one, fill in a couple fields, and you're running. Free $5 of credit covers your first few jobs.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,maxWidth:540,margin:"0 auto 18px"}}>
              {[
 [Palette,"Generate images","~30 sec, ~$0.05"],
 [Mic,"Transcribe audio","~2 min, ~$0.20"],
 [Brain,"Train a model","1-4 hours"],
 [NotebookPen,"Open a notebook","Pay per hour"],
              ].map(([Icon,name,sub])=>(
                <button key={name} onClick={()=>setShowNew(true)}
                  style={{padding:"12px 13px",background:"var(--bg3)",border:".5px solid var(--b2)",
                    borderRadius:"var(--r)",cursor:"pointer",textAlign:"center",
                    transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--teal)";e.currentTarget.style.background="var(--td)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b2)";e.currentTarget.style.background="var(--bg3)";}}>
                  <span style={{display:"flex"}}><Icon size={20}/></span>
                  <span style={{fontSize:12,fontWeight:600,color:"var(--t1)"}}>{name}</span>
                  <span style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)"}}>{sub}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>setShowNew(true)}
              style={{padding:"10px 22px",background:"var(--teal)",color:"#000",border:"none",
                borderRadius:"var(--r)",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              + Browse all templates
            </button>
          </div>:jobs.map(j=><JobRow key={j.id} job={j} isMobile={mob} onOpenLive={openLiveJob}/>)}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PROVIDER HUB
// ═══════════════════════════════════════════════════════════════════════════════
const PricingAdvisor = ({onInject}) => {
  const [gpu,setGpu]=useState("NVIDIA H100 SXM");
  const [cnt,setCnt]=useState("8");
  const [res,setRes]=useState(null);
  const [busy,setBusy]=useState(false);
  const run=async()=>{
    setBusy(true);setRes(null);
    try{
      const r=await claude([{role:"user",content:`I want to list ${cnt}× ${gpu} on Decompute.\n\nGive me:\n1) **Optimal on-demand price** (compare to market)\n2) **Spot price** recommendation\n3) **Compatible workload tier**\n4) **Monthly earnings ranges** at 10, 40, and 100 available hours\n5) **One non-financial reliability tip** to improve matching\n\nDo not assume 24/7 operation or recommend collateral. Be specific with $ amounts.`}]);
      setRes(r);
 }catch{setRes("Advisor unavailable.");}
    finally{setBusy(false);}
  };
  return(
    <Card style={{border:".5px solid rgba(245,166,35,.3)",marginBottom:18,overflow:"hidden",position:"relative"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,var(--amber),transparent)",opacity:.5}}/>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:13}}>
        <span><Wallet size={14}/></span><span style={{fontSize:14,fontWeight:700}}>What should I charge?</span>
        <span style={{fontSize:10,fontFamily:"var(--fm)",padding:"2px 7px",borderRadius:4,background:"var(--ad)",color:"var(--amber)",border:".5px solid rgba(245,166,35,.3)"}}>Market check</span>
      </div>
      <div style={{display:"flex",gap:9,marginBottom:12,flexWrap:"wrap"}}>
        <input value={gpu} onChange={e=>setGpu(e.target.value)} placeholder="GPU Model"
          style={{flex:2,padding:"9px 12px",fontSize:12,borderRadius:"var(--r)",minHeight:40,minWidth:160,background:"var(--bg3)",border:".5px solid var(--b2)"}}/>
        <input value={cnt} onChange={e=>setCnt(e.target.value)} type="number" placeholder="×"
          style={{width:72,padding:"9px 12px",fontSize:12,borderRadius:"var(--r)",minHeight:40,background:"var(--bg3)",border:".5px solid var(--b2)"}}/>
        <Btn v="ghost" onClick={run} disabled={busy} style={{height:40,fontSize:12,minWidth:120}}>
          {busy?<><Spin/> Checking…</>:"Suggest a price →"}
        </Btn>
      </div>
      {res&&<div style={{fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap",color:"var(--t1)",padding:"13px",background:"var(--bg3)",borderRadius:"var(--r)",border:".5px solid var(--b)"}}>{res}</div>}
    </Card>
  );
};

const PSTEPS=["Your Computer","Internet","Privacy","Pricing","Done!"];
const HWForm=()=>(
  <><h3 style={{fontSize:16,fontWeight:600,marginBottom:5}}>Tell us about your computer</h3>
  <p style={{fontSize:13,color:"var(--t2)",marginBottom:18}}>Just the basics — we'll figure out the rest</p>
  <div className="form-2"><Fld label="GPU Model" placeholder="e.g. NVIDIA H100 SXM5 80GB"/><Fld label="GPU Count" placeholder="8" type="number"/>
  <Fld label="System RAM" placeholder="e.g. 1.5TB"/><Fld label="CPU Model" placeholder="e.g. AMD EPYC 9654"/>
  <Fld label="NVMe Storage" placeholder="e.g. 12TB"/><Fld label="Total VRAM" placeholder="e.g. 640GB"/></div>
  <Fld label="Physical Location" placeholder="City, Country" hint="Used for latency routing. Exact address never stored."/></>
);
const NetForm=()=>(
  <><h3 style={{fontSize:16,fontWeight:600,marginBottom:5}}>Your internet connection</h3>
  <p style={{fontSize:13,color:"var(--t2)",marginBottom:18}}>How fast can you upload and download</p>
  <Fld label="Upstream Bandwidth" placeholder="e.g. 400 Gbps"/>
  <Fld label="Network Interface" placeholder="e.g. InfiniBand HDR, RoCE, Ethernet"/>
  <div className="form-2"><Fld label="IP Address" placeholder="Verified via probe"/><Fld label="Port" placeholder="7777" type="number"/></div>
  <div style={{background:"var(--bg3)",border:".5px solid var(--b)",borderRadius:"var(--r)",padding:13}}>
    <div style={{fontSize:12,color:"var(--teal)",fontFamily:"var(--fm)",marginBottom:5}}>Automated Latency Probe</div>
    <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6}}>After saving, our prober measures RTT from 12 global PoPs to assign your latency tier and optimize AI job routing.</div>
  </div></>
);
const SecForm=()=>{
  const[on,setOn]=useState([0,2]);
  const opts=[{l:"Intel TDX / SGX",d:"Strongest isolation — required for Enterprise tier"},{l:"AMD SEV-SNP",d:"Memory encryption for AMD EPYC"},{l:"TPM 2.0 Attestation",d:"Firmware & boot-chain verification"},{l:"Confidential GPU",d:"Encrypt GPU memory mid-inference (H100/MI300X)"}];
  return(
    <><h3 style={{fontSize:16,fontWeight:600,marginBottom:5}}>Privacy features</h3>
    <p style={{fontSize:13,color:"var(--t2)",marginBottom:18}}>The more privacy features you support, the more jobs you'll get</p>
    {opts.map((o,i)=>{const a=on.includes(i);return(
      <div key={o.l} onClick={()=>setOn(x=>a?x.filter(v=>v!==i):[...x,i])}
        style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 13px",
          background:"var(--bg3)",borderRadius:"var(--r)",marginBottom:9,cursor:"pointer",
          border:`.5px solid ${a?"rgba(0,212,168,.35)":"var(--b)"}`,transition:"border-color .15s"}}>
        <div><div style={{fontSize:13,fontWeight:500,marginBottom:2}}>{o.l}</div><div style={{fontSize:11,color:"var(--t2)"}}>{o.d}</div></div>
        <div style={{width:36,height:20,borderRadius:10,flexShrink:0,marginLeft:12,position:"relative",
          background:a?"var(--teal)":"var(--bg2)",border:`.5px solid ${a?"var(--teal)":"var(--b2)"}`,transition:"background .2s"}}>
          <div style={{position:"absolute",top:2,left:a?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
        </div>
      </div>
    );})}
    </>
  );
};
const PriceForm=()=>(
  <><h3 style={{fontSize:16,fontWeight:600,marginBottom:5}}>Set your prices</h3>
  <p style={{fontSize:13,color:"var(--t2)",marginBottom:18}}>Not sure? Use the price suggester above to see what others charge</p>
  <div className="form-2"><Fld label="On-Demand ($/hr)" placeholder="e.g. 12.80" type="number"/><Fld label="Spot Price ($/hr)" placeholder="e.g. 5.20" type="number"/>
  <Fld label="Min Rental Period" placeholder="e.g. 1h"/><Fld label="Max Rental Period" placeholder="e.g. 720h"/></div>
  <Fld label="Availability Schedule" placeholder="Always-on · or custom UTC window" hint="Downtime windows excluded from SLA. AI routing auto-avoids maintenance slots."/></>
);
const ReviewForm=()=>(
  <div style={{textAlign:"center",padding:"10px 0"}}>
    <div style={{width:54,height:54,borderRadius:"50%",background:"var(--td)",border:".5px solid var(--teal)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 15px"}}><ShieldCheck size={22}/></div>
 <h3 style={{fontSize:17,fontWeight:700,marginBottom:7}}>You're all set!</h3>
    <p style={{fontSize:13,color:"var(--t2)",maxWidth:360,margin:"0 auto 20px",lineHeight:1.6}}>Once you click below, your computer joins the network. We'll verify it, give you a quality score, and start sending you jobs. You'll get paid every 24 hours, automatically.</p>
    <div style={{background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:"var(--r)",padding:15,textAlign:"left",maxWidth:400,margin:"0 auto"}}>
      {[["Hardware","8× H100 SXM · 640GB VRAM"],["Attestation","SGX+TDX verified"],["Reliability","Built from completed jobs"],["On-Demand","$12.80/hr"],["Fair share","Owner-level scheduling"],["Availability","Your schedule, no minimum"]].map(([k,v])=>(
        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:".5px solid var(--b)",fontSize:13}}>
          <span style={{color:"var(--t2)",fontFamily:"var(--fm)",fontSize:12}}>{k}</span><span style={{fontWeight:500}}>{v}</span>
        </div>
      ))}
    </div>
  </div>
);

const ProviderHub = ({onInject}) => {
  const [path, setPath] = useState(null); // null | "easy"|"advanced"
  const { user, backendOnline } = useApp();
  const [myNodes, setMyNodes] = useState([]);
  const [loadingNodes, setLoadingNodes] = useState(false);

  const refreshMyNodes = useCallback(async () => {
    if (!user || !backendOnline) { setMyNodes([]); return; }
    setLoadingNodes(true);
    try {
      const r = await api("GET","/api/nodes/mine");
      setMyNodes(r?.data || []);
    } catch {
      // Non-fatal: the hub still works for creating a new listing.
    } finally {
      setLoadingNodes(false);
    }
  }, [user, backendOnline]);

  useEffect(() => { refreshMyNodes(); }, [refreshMyNodes]);

  // Returning providers care about the machines they already run, so those
  // lead once they exist; the pitch is only the front door for newcomers.
  const hasListings = myNodes.length > 0;

  return (
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>Earn With Your Computer</h2>
          <p style={{fontSize:13,color:"var(--t2)",marginTop:3}}>Share your GPU. Get paid in dollars. Help the planet.</p>
        </div>
        {path && (
          <button onClick={()=>{setPath(null);refreshMyNodes();}}
            style={{fontSize:12,color:"var(--t2)",background:"transparent",border:"none",
              padding:"4px 8px",cursor:"pointer"}}>
            ← Back to overview
          </button>
        )}
      </div>

      {!path && hasListings && (
        <>
          <PayoutsPanel/>
          <MyListings nodes={myNodes} onChanged={refreshMyNodes} onAddAnother={()=>setPath("easy")}/>
        </>
      )}
      {!path && !hasListings && !loadingNodes && <ProviderPathChooser onPick={setPath}/>}
      {path === "easy" && <ProviderEasyPath onInject={onInject} onRegistered={refreshMyNodes} onExit={()=>setPath(null)}/>}
      {path === "advanced" && <ProviderAdvancedPath onInject={onInject}/>}
    </div>
  );
};

// ─── PAYOUTS — connect a bank account via Stripe Connect and cash out balance ──
const PayoutsPanel = () => {
  const { user, backendOnline, showToast } = useApp();
  const [status, setStatus] = useState(null); // {connected, payoutsEnabled, balanceUsdc}
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || !backendOnline) { setLoading(false); return; }
    try {
      const r = await api("GET", "/api/payouts/status");
      setStatus(r?.data || null);
    } catch {
      // Non-fatal — the rest of the Provider Hub still works without this panel.
    } finally {
      setLoading(false);
    }
  }, [user, backendOnline]);

  useEffect(() => { refresh(); }, [refresh]);

  // Pick up the redirect back from Stripe's onboarding flow (?connect=return)
  // and re-check status — mirrors the ?topup=success handling for checkout.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connect = params.get("connect");
    if (!connect) return;
    if (connect === "return") refresh();
    params.delete("connect");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [refresh]);

  const startOnboarding = async () => {
    setBusy(true);
    try {
      const r = await api("POST", "/api/payouts/connect-onboard");
      if (r?.url) window.location.href = r.url;
    } catch (err) {
      showToast(err.message || "Couldn't start payout setup", "error");
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    try {
      const r = await api("POST", "/api/payouts/withdraw", {}, { "Idempotency-Key": crypto.randomUUID() });
      showToast(`$${Number(r?.data?.amountUsd || 0).toFixed(2)} sent to your bank account.`, "success");
      refresh();
    } catch (err) {
      showToast(err.message || "Couldn't withdraw", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !status) return null;
  const balance = parseFloat(status.balanceUsdc || 0);

  return (
    <Card style={{padding:16,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
            <Banknote size={16} color="var(--teal)"/>
            <span style={{fontSize:14,fontWeight:600}}>Earnings</span>
          </div>
          <div style={{fontSize:20,fontFamily:"var(--fm)",fontWeight:600,color:"var(--teal)"}}>${balance.toFixed(2)}</div>
          <div style={{fontSize:11.5,color:"var(--t2)",marginTop:3}}>
            {!status.connected
              ? "Connect a bank account to withdraw what you earn."
              : status.payoutsEnabled
                ? "Ready to withdraw to your connected account."
                : "Finish setup with Stripe to enable withdrawals."}
          </div>
        </div>
        {!status.payoutsEnabled ? (
          <Btn disabled={busy} onClick={startOnboarding} style={{fontSize:12,padding:"8px 15px"}}>
            {busy ? <><Spin/> Redirecting…</> : status.connected ? "Finish setup" : "Set up payouts"}
          </Btn>
        ) : (
          <Btn disabled={busy || balance < 1} onClick={withdraw} style={{fontSize:12,padding:"8px 15px"}}>
            {busy ? <><Spin/> Withdrawing…</> : "Withdraw all"}
          </Btn>
        )}
      </div>
    </Card>
  );
};

// ─── MY LISTINGS — manage machines you've already registered ──────────────────
const MyListings = ({nodes, onChanged, onAddAnother}) => {
  const [editingId, setEditingId] = useState(null);
  const active = nodes.filter(n => n.active).length;

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
        marginBottom:12,flexWrap:"wrap",gap:10}}>
        <div>
          <h3 style={{fontSize:16,fontWeight:600}}>Your computers</h3>
          <p style={{fontSize:12,color:"var(--t2)",marginTop:2}}>
            {nodes.length} listed · {active} earning
          </p>
        </div>
        <Btn onClick={onAddAnother} style={{fontSize:12,padding:"7px 14px"}}>+ Add another computer</Btn>
      </div>

      <div style={{display:"grid",gap:11}}>
        {nodes.map(node => (
          <ListingCard key={node.id} node={node}
            editing={editingId === node.id}
            onEdit={()=>setEditingId(node.id)}
            onCancelEdit={()=>setEditingId(null)}
            onChanged={()=>{setEditingId(null);onChanged();}}/>
        ))}
      </div>
    </div>
  );
};

const ListingCard = ({node, editing, onEdit, onCancelEdit, onChanged}) => {
  const { showToast } = useApp();
  const [name, setName] = useState(node.name);
  const [price, setPrice] = useState(String(node.price_per_hour));
  const [schedule, setSchedule] = useState(node.schedule || "always");
  const [renewable, setRenewable] = useState(!!node.renewable);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = async (body, successMsg) => {
    setBusy(true);
    try {
      await api("PATCH", `/api/nodes/${node.id}`, body);
      showToast(successMsg, "success");
      onChanged();
    } catch (err) {
      showToast(err.message || "Couldn't save changes","error");
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const parsed = parseFloat(price);
    if (!Number.isFinite(parsed)) { showToast("Enter a price per hour","error"); return; }
    patch({ name: name.trim(), pricePerHour: parsed, schedule, renewable }, "Listing updated.");
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("DELETE", `/api/nodes/${node.id}`);
      showToast("Listing removed.","success");
      onChanged();
    } catch (err) {
      showToast(err.message || "Couldn't remove listing","error");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const specLine = [
    node.gpu_count > 1 ? `${node.gpu_count}× ${node.gpu_model}` : node.gpu_model,
    node.vram_gb ? `${gb(node.vram_gb)} VRAM` : null,
    node.ram_gb ? `${gb(node.ram_gb)} RAM` : null,
    node.cpu_cores ? `${node.cpu_cores}-core CPU` : null,
  ].filter(Boolean).join("·");

  return (
    <Card style={{padding:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 260px",minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:600}}>{node.name}</span>
            <span style={{fontSize:10,fontFamily:"var(--fm)",padding:"2px 7px",borderRadius:4,
              background:node.active?"var(--td)":"var(--bg3)",
              color:node.active?"var(--teal)":"var(--t2)",
              border:`.5px solid ${node.active?"rgba(0,212,168,.4)":"var(--b2)"}`}}>
              {node.active ? "● Earning":"○ Paused"}
            </span>
            {node.verification_status === "verified" && (
              <span title="Specs confirmed by the helper app"
 style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)"}}> Verified</span>
            )}
          </div>
          <div style={{fontSize:11.5,color:"var(--t2)",fontFamily:"var(--fm)",lineHeight:1.5}}>{specLine}</div>
        </div>
        <div style={{textAlign:"right",flexShrink:0}}>
          <div style={{fontSize:17,fontFamily:"var(--fm)",fontWeight:600,color:"var(--amber)"}}>
            ${parseFloat(node.price_per_hour).toFixed(2)}<span style={{fontSize:11,color:"var(--t2)"}}>/hr</span>
          </div>
        </div>
      </div>

      {!editing ? (
        <div style={{display:"flex",gap:8,marginTop:13,flexWrap:"wrap"}}>
          <Btn v="ghost" disabled={busy} onClick={onEdit} style={{fontSize:12,padding:"6px 13px"}}>Edit</Btn>
          <Btn v="ghost" disabled={busy}
            onClick={()=>patch({ active: !node.active }, node.active ? "Listing paused.":"Listing is live again.")}
            style={{fontSize:12,padding:"6px 13px"}}>
            {node.active ? "Pause":"Resume"}
          </Btn>
          {!confirmDelete ? (
            <button disabled={busy} onClick={()=>setConfirmDelete(true)}
              style={{marginLeft:"auto",fontSize:12,color:"var(--t2)",background:"transparent",
                border:"none",padding:"6px 10px",cursor:"pointer"}}>Remove</button>
          ) : (
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:12,color:"var(--t2)"}}>Remove this listing?</span>
              <Btn v="amber" disabled={busy} onClick={remove} style={{fontSize:12,padding:"6px 13px"}}>Remove</Btn>
              <button disabled={busy} onClick={()=>setConfirmDelete(false)}
                style={{fontSize:12,color:"var(--t2)",background:"transparent",border:"none",
                  padding:"6px 8px",cursor:"pointer"}}>Cancel</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{marginTop:14,paddingTop:14,borderTop:".5px solid var(--b)"}}>
          <Fld label="Name" value={name} onChange={e=>setName(e.target.value)}/>
          <Fld label="Price per hour (USD)" type="number" value={price} onChange={e=>setPrice(e.target.value)}/>

          <div style={{marginBottom:13}}>
            <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
              textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>When it earns</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:7}}>
              {[
                {id:"always",label:"Always",icon:Circle},
                {id:"nights",label:"Nights & weekends",icon:Moon},
                {id:"idle",label:"When I'm not using it",icon:Coffee},
              ].map(opt => (
                <button key={opt.id} onClick={()=>setSchedule(opt.id)}
                  style={{padding:"9px 11px",fontSize:12,textAlign:"left",
                    background:schedule===opt.id?"var(--td)":"var(--bg3)",
                    color:schedule===opt.id?"var(--teal)":"var(--t1)",
                    border:`.5px solid ${schedule===opt.id?"var(--teal)":"var(--b2)"}`,
                    borderRadius:"var(--r)",cursor:"pointer"}}>
                  <opt.icon size={18}/> {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div onClick={()=>setRenewable(r=>!r)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",marginBottom:13,
              background:"var(--bg3)",borderRadius:"var(--r)",cursor:"pointer",
              border:`.5px solid ${renewable?"rgba(61,186,111,.4)":"var(--b)"}`}}>
            <div style={{width:34,height:19,borderRadius:10,position:"relative",flexShrink:0,
              background:renewable?"var(--green)":"var(--bg2)",
              border:`.5px solid ${renewable?"var(--green)":"var(--b2)"}`}}>
              <div style={{position:"absolute",top:2,left:renewable?17:2,width:15,height:15,
                borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
 <span style={{fontSize:12.5}}> Runs on renewable energy</span>
          </div>

          <div style={{fontSize:11,color:"var(--t2)",marginBottom:12,lineHeight:1.5}}>
            Hardware specs can't be edited — they come from the helper app so renters can trust them.
            Re-run setup if this machine's hardware changed.
          </div>

          <div style={{display:"flex",gap:8}}>
            <Btn disabled={busy} onClick={save} style={{fontSize:12,padding:"7px 15px"}}>
              {busy ? <><Spin/> Saving…</> : "Save changes"}
            </Btn>
            <Btn v="ghost" disabled={busy} onClick={onCancelEdit} style={{fontSize:12,padding:"7px 15px"}}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
};

// ─── PATH CHOOSER — front door for new providers ──────────────────────────────
const ProviderPathChooser = ({onPick}) => (
  <div>
    {/* Hero earnings card */}
    <div style={{background:"linear-gradient(135deg,rgba(245,166,35,.12),rgba(0,212,168,.08))",
      border:".5px solid rgba(245,166,35,.3)",borderRadius:"var(--r2)",padding:"22px 26px",marginBottom:20,
      position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:-50,right:-50,width:200,height:200,borderRadius:"50%",
        background:"radial-gradient(circle,rgba(245,166,35,.15),transparent)"}}/>
      <div style={{position:"relative",display:"flex",alignItems:"center",gap:24,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 280px"}}>
          <h3 style={{fontSize:18,fontWeight:700,marginBottom:8,letterSpacing:"-.01em"}}>
 How much can I earn?
          </h3>
          <p style={{fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:12}}>
            Most people earn between <strong style={{color:"var(--amber)"}}>$30 to $200 per day</strong>{" "}
            depending on their computer.{" "}
            <span style={{color:"var(--t2)"}}>We pay automatically every 24 hours.</span>
          </p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:8}}>
            {[
              {gpu:"Gaming PC",amt:"$15–$45/day",sub:"RTX 4070/3080"},
              {gpu:"High-end gaming",amt:"$40–$120/day",sub:"RTX 4090/3090"},
              {gpu:"Pro workstation",amt:"$100–$400/day",sub:"RTX 6000 / A100"},
              {gpu:"Server/datacenter",amt:"$200–$900/day",sub:"H100 / MI300X"},
            ].map(t => (
              <div key={t.gpu} style={{background:"var(--bg2)",borderRadius:"var(--r)",padding:"10px 12px",
                border:".5px solid var(--b)"}}>
                <div style={{fontSize:11,color:"var(--t2)",marginBottom:3}}>{t.gpu}</div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--amber)",fontFamily:"var(--fm)"}}>{t.amt}</div>
                <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",marginTop:2}}>{t.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Two-path chooser */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14,marginBottom:20}}>

      {/* Easy path */}
      <button onClick={()=>onPick("easy")}
        className="lift"
        style={{textAlign:"left",padding:"24px 22px",background:"var(--bg2)",
          border:".5px solid var(--teal)",borderRadius:"var(--r2)",cursor:"pointer",
          position:"relative",overflow:"hidden",transition:"all .2s"}}
        onMouseEnter={e=>{e.currentTarget.style.background="rgba(0,212,168,.05)";}}
        onMouseLeave={e=>{e.currentTarget.style.background="var(--bg2)";}}>
        <div style={{position:"absolute",top:14,right:14,fontSize:9,fontFamily:"var(--fm)",
          padding:"3px 8px",borderRadius:4,background:"var(--td)",color:"var(--teal)",
          border:".5px solid rgba(0,212,168,.4)",letterSpacing:".06em"}}>
          RECOMMENDED
        </div>
        <div style={{marginBottom:13,lineHeight:1}}><Sparkles size={38}/></div>
        <h3 style={{fontSize:17,fontWeight:700,marginBottom:7,letterSpacing:"-.01em"}}>
          Easy setup
        </h3>
        <p style={{fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:14}}>
          Download our little helper app. It checks your computer, sets everything up, and you start earning.
          No questions about tech specs.
        </p>
        <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.8}}>
 <div> Works on Mac, Windows & Linux</div>
 <div> Auto-detects your GPU & specs</div>
 <div> Takes about 2 minutes</div>
 <div> Stops earning when you need your computer</div>
        </div>
        <div style={{marginTop:16,fontSize:13,fontWeight:600,color:"var(--teal)",display:"flex",alignItems:"center",gap:5}}>
          Start →
        </div>
      </button>

      {/* Advanced path */}
      <button onClick={()=>onPick("advanced")}
        className="lift"
        style={{textAlign:"left",padding:"24px 22px",background:"var(--bg2)",
          border:".5px solid var(--b2)",borderRadius:"var(--r2)",cursor:"pointer",
          position:"relative",transition:"all .2s"}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--purple)";}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b2)";}}>
        <div style={{marginBottom:13,lineHeight:1}}><Wrench size={38}/></div>
        <h3 style={{fontSize:17,fontWeight:700,marginBottom:7,letterSpacing:"-.01em"}}>
          Advanced setup
        </h3>
        <p style={{fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:14}}>
          For developers and sysadmins who want full control. Enter specs manually,
          configure attestation, set custom pricing tiers, and deploy via SSH.
        </p>
        <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.8}}>
 <div> Manual hardware configuration</div>
 <div> TEE / SGX / SEV-SNP setup</div>
 <div> Headless server deployment</div>
 <div> Custom availability schedules</div>
        </div>
        <div style={{marginTop:16,fontSize:13,fontWeight:600,color:"var(--purple)",display:"flex",alignItems:"center",gap:5}}>
          Manual setup →
        </div>
      </button>
    </div>

    {/* FAQ teaser */}
    <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r2)",padding:"18px 22px"}}>
      <h4 style={{fontSize:14,fontWeight:600,marginBottom:13}}>Common questions</h4>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
        <FaqItem q="Will it slow down my computer?"
          a="Only when running jobs. You can pause anytime or only share when idle (e.g., overnight)."/>
        <FaqItem q="Is my data safe?"
          a="Every job runs in an isolated sandbox. Renters can't see your files. We wipe everything after each job."/>
        <FaqItem q="When do I get paid?"
          a="Every 24 hours, automatically, in USDC. No invoicing, no waiting."/>
        <FaqItem q="Do I need an expensive 24/7 rig?"
          a="No. Fair-share matching favors compatible providers who earned less recently and waited longer. Being online part-time still gives you a real turn."/>
        <FaqItem q="What if my computer breaks?"
          a="No problem — just uninstall the helper. You keep all the money you've earned."/>
      </div>
    </div>
  </div>
);

const FaqItem = ({q, a}) => (
  <div>
    <div style={{fontSize:12,fontWeight:600,color:"var(--t0)",marginBottom:4}}>{q}</div>
    <div style={{fontSize:11.5,color:"var(--t2)",lineHeight:1.6}}>{a}</div>
  </div>
);

// ─── EASY PATH — download installer & auto-detect ─────────────────────────────
const ProviderEasyPath = ({onInject, onRegistered, onExit}) => {
  const { user, showToast, registerNode, backendOnline, openSignup } = useApp();
  const [phase, setPhase] = useState("os"); // os → install → detecting → incompatible → review → done
  const [os, setOs] = useState(detectOs());
  const [pairingCode, setPairingCode] = useState(null); // { code, expiresAt } | null — real mode only
  const [detectedSpecs, setDetectedSpecs] = useState(null);
  const [progress, setProgress] = useState(0); // demo-mode fake progress only
  const [elapsedSec, setElapsedSec] = useState(0);
  const [nodeName, setNodeName] = useState("");
  const [pricePreset, setPricePreset] = useState("auto");
  const [schedule, setSchedule] = useState("always");
  const [renewable, setRenewable] = useState(false);
  const [showCmdLine, setShowCmdLine] = useState(false);
  const idempotencyKeyRef = useRef(null);
  const [registeredNode, setRegisteredNode] = useState(null);
  const [copiedAgentCommand, setCopiedAgentCommand] = useState(false);
  const [readinessChecks, setReadinessChecks] = useState(null);
  const [enrollCode, setEnrollCode] = useState(null); // { code, expiresAt } | null — one-time --start credential

  const demoMode = !backendOnline;

  // Mints a short-lived pairing code as soon as the seller reaches the
  // install step — this is what ties the helper binary's report back to
  // this account, so a seller can't just type in specs. No backend to mint
  // a real code against in demo mode, so this is skipped there.
  useEffect(() => {
    if (phase !== "install" || demoMode || pairingCode) return;
    if (!user) { openSignup(); return; }
    (async () => {
      try {
        const result = await api("POST", "/api/nodes/pairing-codes");
        setPairingCode(result.data);
      } catch (err) {
        showToast(err.message || "Couldn't start setup — try again.", "error");
      }
    })();
  }, [phase, demoMode, pairingCode, user]);

  // Demo-mode-only fake progress simulation — no backend to poll against.
  useEffect(() => {
    if (phase !== "detecting" || !demoMode) return;
    setProgress(0);
    const steps = [18, 38, 58, 78, 100];
    let i = 0;
    const id = setInterval(() => {
      if (i >= steps.length) {
        clearInterval(id);
        setDetectedSpecs(simulateDetection());
        setTimeout(() => setPhase("review"), 600);
        return;
      }
      setProgress(steps[i]);
      i++;
    }, 900);
    return () => clearInterval(id);
  }, [phase, demoMode]);

  // Real mode: poll the pairing code until the helper binary reports specs.
  useEffect(() => {
    if (phase !== "detecting" || demoMode || !pairingCode) return;
    setElapsedSec(0);
    const tick = async () => {
      try {
        const result = await api("GET", `/api/nodes/pairing-codes/${pairingCode.code}`);
        const { status, detectedSpec } = result.data;
        if (status === "detected") {
          // Hardware first, then Docker/GPU-container access — surfaced
          // from the same helper run. Older helper builds report no
          // checks at all; treat that as unknown, not a failure.
          const checks = detectedSpec?.readiness?.checks;
          if (detectedSpec?.readiness?.ready === false && Array.isArray(checks) && checks.length > 0) {
            setReadinessChecks(checks);
            setPhase("incompatible");
          } else {
            setDetectedSpecs(specFromDetected(detectedSpec));
            setPhase("review");
          }
        } else if (status === "expired") {
          showToast("Your pairing code expired — let's get you a new one.", "error");
          setPairingCode(null);
          setPhase("install");
        }
      } catch {}
    };
    tick(); // immediate first tick
    const id = setInterval(tick, 3000);
    const clock = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => { clearInterval(id); clearInterval(clock); };
  }, [phase, demoMode, pairingCode]);

  // Reset the idempotency key when leaving review so a later retry after
  // going all the way back doesn't replay a stale registration attempt.
  useEffect(() => {
    if (phase === "review" && !idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    if (phase === "install") idempotencyKeyRef.current = null;
  }, [phase]);

  useEffect(() => {
    const nodeOnline = registeredNode?.status === "available" || registeredNode?.status === "busy";
    if (phase !== "done" || demoMode || !registeredNode?.id || nodeOnline) return;
    const refreshStatus = async () => {
      try {
        const result = await api("GET", "/api/nodes/mine");
        const current = result.data?.find((node) => node.id === registeredNode.id);
        if (current) setRegisteredNode((node) => ({ ...node, ...current, agentToken: node.agentToken }));
      } catch {}
    };
    refreshStatus();
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [phase, demoMode, registeredNode?.id, registeredNode?.status]);

  // Mints the one-time code the helper's --start flag redeems for the
  // node's real credential — the seller only ever sees this short code,
  // never the long-lived secret itself.
  useEffect(() => {
    if (phase !== "done" || demoMode || !registeredNode?.id || enrollCode) return;
    (async () => {
      try {
        const result = await api("POST", `/api/nodes/${registeredNode.id}/agent-enroll-codes`);
        setEnrollCode(result.data);
      } catch (err) {
        showToast(err.message || "Couldn't prepare your setup command — try again.", "error");
      }
    })();
  }, [phase, demoMode, registeredNode?.id, enrollCode]);

  // ─── Step 1: Pick OS ─────────────────────────────────────────────────────
  if (phase === "os") {
    return (
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{marginBottom:10}}><Laptop size={40}/></div>
          <h3 style={{fontSize:19,fontWeight:700,marginBottom:6}}>Which computer do you want to share?</h3>
          <p style={{fontSize:13,color:"var(--t2)"}}>We'll download the right helper app for it.</p>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:11,marginBottom:18}}>
          {[
            { id:"mac",     name:"Mac",     icon:Command, note:"M1/M2/M3 or Intel" },
            { id:"windows", name:"Windows", icon:AppWindow, note:"Windows 10 or 11" },
            { id:"linux",   name:"Linux",   icon:Terminal, note:"Ubuntu, Fedora, etc." },
          ].map(opt => (
            <button key={opt.id} onClick={()=>setOs(opt.id)}
              style={{padding:"22px 16px",background:os===opt.id?"var(--td)":"var(--bg2)",
                border:`.5px solid ${os===opt.id?"var(--teal)":"var(--b2)"}`,
                borderRadius:"var(--r2)",cursor:"pointer",textAlign:"center",
                transition:"all .15s"}}>
              <div style={{marginBottom:8}}><opt.icon size={32}/></div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:3,
                color:os===opt.id?"var(--teal)":"var(--t0)"}}>{opt.name}</div>
              <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)"}}>{opt.note}</div>
            </button>
          ))}
        </div>

        <Btn full disabled={!os} onClick={()=>setPhase("install")}>
          Continue with {os ? ({mac:"Mac",windows:"Windows",linux:"Linux"}[os]) : "..."} →
        </Btn>

        <div style={{marginTop:14,padding:"10px 13px",background:"var(--bg3)",borderRadius:"var(--r)",
          fontSize:11,color:"var(--t2)",lineHeight:1.5,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:14}}>ℹ️</span>
          <span>The helper app is tiny (~12 MB), open source, and you can uninstall it anytime.</span>
        </div>
      </div>
    );
  }

  // ─── Step 2: Connect & detect ────────────────────────────────────────────
  if (phase === "install") {
    // Demo-mode fallback: no backend to mint a real pairing code against,
    // so this reproduces the old fully-simulated experience.
    if (demoMode) {
      const installInfo = {
        mac:     { ext:".dmg",  cmd:"Open the .dmg and drag Decompute to your Applications folder" },
        windows: { ext:".exe",  cmd:"Run the installer and click 'Yes' when Windows asks for permission" },
        linux:   { ext:".sh",   cmd:"curl -fsSL https://get.decompute.io | bash" },
      }[os] || {};

      return (
        <div style={{maxWidth:680,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{marginBottom:10}}><Download size={40}/></div>
            <h3 style={{fontSize:19,fontWeight:700,marginBottom:6}}>Step 1: Download the helper</h3>
            <p style={{fontSize:13,color:"var(--t2)"}}>This tiny app lets your computer talk to the network.</p>
          </div>

          <div style={{background:"var(--bg2)",border:".5px solid var(--teal)",borderRadius:"var(--r2)",padding:22,marginBottom:14}}>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <div style={{width:54,height:54,borderRadius:"var(--r)",background:"var(--td)",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
 {(()=>{const I={mac:Command,windows:AppWindow,linux:Terminal}[os]; return I?<I size={24}/>:null;})()}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>Decompute Helper</div>
                <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>
                  v1.0.4 · 12.3 MB · {os==="mac"?"macOS 12+":os==="windows"?"Windows 10+":"Ubuntu 20+ / Fedora 38+"}
                </div>
              </div>
            </div>

            {os === "linux" ? (
              <div style={{background:"#020608",borderRadius:"var(--r)",padding:"12px 14px",
                fontFamily:"var(--fm)",fontSize:12,color:"var(--teal)",position:"relative",marginBottom:11}}>
                <code style={{display:"block",wordBreak:"break-all",paddingRight:50}}>{installInfo.cmd}</code>
                <button onClick={()=>{navigator.clipboard?.writeText(installInfo.cmd);showToast("Copied!","success");}}
                  style={{position:"absolute",right:6,top:6,padding:"4px 10px",fontSize:10,
                    fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                    border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
                  Copy
                </button>
              </div>
            ) : (
              <Btn full onClick={()=>showToast("Download started! Run the installer when it finishes.","success")}
                style={{marginBottom:11}}>
                <Download size={15}/> Download Decompute-Helper{installInfo.ext}
              </Btn>
            )}

            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6,padding:"10px 12px",background:"var(--bg3)",borderRadius:"var(--r)"}}>
              <strong style={{color:"var(--t0)"}}>What happens next:</strong> {installInfo.cmd}{os!=="linux"&&"."}
            </div>
          </div>

          <div style={{textAlign:"center",margin:"20px 0",fontSize:13,color:"var(--t2)"}}>
            Once installed, click below to let your computer check in.
          </div>

          <Btn full onClick={()=>setPhase("detecting")}>
            My helper is installed — check my computer →
          </Btn>

          <button onClick={()=>setPhase("os")}
            style={{display:"block",margin:"14px auto 0",fontSize:12,color:"var(--t2)",
              background:"transparent",border:"none",padding:6,cursor:"pointer"}}>
            ← Pick a different operating system
          </button>
        </div>
      );
    }

    if (!user) {
      return (
        <div style={{maxWidth:680,margin:"0 auto",textAlign:"center"}}>
          <div style={{marginBottom:10}}><Lock size={40}/></div>
          <h3 style={{fontSize:19,fontWeight:700,marginBottom:6}}>Sign in to continue</h3>
          <p style={{fontSize:13,color:"var(--t2)",marginBottom:16}}>We need an account to link your computer to.</p>
          <Btn onClick={openSignup}>Sign in / Create account</Btn>
        </div>
      );
    }

    if (!pairingCode) {
      return (
        <div style={{maxWidth:680,margin:"0 auto",textAlign:"center",padding:"60px 0"}}>
          <div style={{fontSize:13,color:"var(--t2)"}}>Setting things up...</div>
        </div>
      );
    }

    // A typed-in code carries no destination, so on its own the helper can
    // only report to its build-time default (production). When this app
    // points somewhere else — local dev, staging — the code is shown as
    // CODE@host so the helper knows where to report and the type-the-code
    // flow keeps working without a terminal. See splitCodeAndHost in
    // helper/main.go.
    // Always include the issuing API address. Released helper binaries
    // default to production, while local and staging backends commonly use
    // a different host or port; embedding it prevents a valid code being
    // sent to the wrong API.
    const displayCode = `${pairingCode.code}@${API_BASE.replace(/^https?:\/\//, "").replace(/\/$/,"")}`;
    const runCmd = os === "windows"
      ? `decompute-helper.exe --code ${displayCode}`
      : `./decompute-helper --code ${displayCode}`;
    const linuxInstallCmd = `curl -fsSL ${HELPER_BASE}/${HELPER_FILES.linux} -o decompute-helper && chmod +x decompute-helper && ./decompute-helper --code ${displayCode}`;

    return (
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{marginBottom:10}}><Download size={40}/></div>
          <h3 style={{fontSize:19,fontWeight:700,marginBottom:6}}>Step 1: Download the helper</h3>
          <p style={{fontSize:13,color:"var(--t2)"}}>This tiny app checks your hardware and reports it back — it doesn't run in the background.</p>
        </div>

        <div style={{background:"var(--bg2)",border:".5px solid var(--teal)",borderRadius:"var(--r2)",padding:22,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
            <div style={{width:54,height:54,borderRadius:"var(--r)",background:"var(--td)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
 {(()=>{const I={mac:Command,windows:AppWindow,linux:Terminal}[os]; return I?<I size={24}/>:null;})()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:2}}>Decompute Helper</div>
              <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>
                {os==="mac"?"macOS 12+":os==="windows"?"Windows 10+":"Ubuntu 20+ / Fedora 38+"}
              </div>
            </div>
          </div>

          {os === "linux" && (
            <div style={{background:"#020608",borderRadius:"var(--r)",padding:"12px 14px",
              fontFamily:"var(--fm)",fontSize:12,color:"var(--teal)",position:"relative",marginBottom:11}}>
              <code style={{display:"block",wordBreak:"break-all",paddingRight:50}}>{linuxInstallCmd}</code>
              <button onClick={()=>{navigator.clipboard?.writeText(linuxInstallCmd);showToast("Copied!","success");}}
                style={{position:"absolute",right:6,top:6,padding:"4px 10px",fontSize:10,
                  fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                  border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
                Copy
              </button>
            </div>
          )}

          {os === "mac" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <a href={`${HELPER_BASE}/${HELPER_FILES["mac-arm64"]}`} download style={{display:"block"}}>
                <Btn full><Download size={15}/> Apple Silicon (M1/M2/M3)</Btn>
              </a>
              <a href={`${HELPER_BASE}/${HELPER_FILES["mac-amd64"]}`} download style={{display:"block"}}>
                <Btn full><Download size={15}/> Intel</Btn>
              </a>
            </div>
          )}

          {os === "windows" && (
            <a href={`${HELPER_BASE}/${HELPER_FILES.windows}`} download style={{display:"block",marginBottom:14}}>
              <Btn full><Download size={15}/> Decompute-Helper.exe</Btn>
            </a>
          )}

          {os !== "linux" && (
            <>
              {/* No terminal needed: open the file, it prompts for the code. */}
              <div style={{marginBottom:14}}>
                {[
                  `Open the downloaded file.${os==="windows"
                    ? ` Windows will warn it's from an unrecognized publisher — click "More info" → "Run anyway".`
                    : ` macOS will warn the developer can't be verified — right-click the file → "Open" → "Open" again.`}`,
                  "A window will appear and ask for a pairing code.",
                  "Copy the code below, paste it in, then press Enter.",
                ].map((step,i) => (
                  <div key={i} style={{display:"flex",gap:10,padding:"6px 0",fontSize:12,color:"var(--t1)"}}>
                    <span style={{color:"var(--teal)",flexShrink:0,fontWeight:600}}>{i+1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>

              <div style={{background:"#020608",borderRadius:"var(--r)",padding:"14px",textAlign:"center",marginBottom:11,position:"relative"}}>
                <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>
                  Your pairing code
                </div>
                <div style={{fontSize:displayCode.length > 12 ? 15 : 22,fontFamily:"var(--fm)",fontWeight:700,
                  color:"var(--teal)",letterSpacing:".06em",wordBreak:"break-all",padding:"0 52px"}}>
                  {displayCode}
                </div>
                <button onClick={()=>{navigator.clipboard?.writeText(displayCode);showToast("Copied!","success");}}
                  style={{position:"absolute",right:6,top:6,padding:"4px 10px",fontSize:10,
                    fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                    border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
                  Copy
                </button>
              </div>

              <button onClick={()=>setShowCmdLine(s=>!s)}
                style={{display:"block",margin:"0 auto 4px",fontSize:11,color:"var(--t2)",
                  background:"transparent",border:"none",padding:4,cursor:"pointer",textDecoration:"underline"}}>
                {showCmdLine ? "Hide command line option":"Prefer the command line?"}
              </button>

              {showCmdLine && (
                <div style={{background:"#020608",borderRadius:"var(--r)",padding:"12px 14px",
                  fontFamily:"var(--fm)",fontSize:12,color:"var(--teal)",position:"relative",marginTop:8}}>
                  <code style={{display:"block",wordBreak:"break-all",paddingRight:50}}>{runCmd}</code>
                  <button onClick={()=>{navigator.clipboard?.writeText(runCmd);showToast("Copied!","success");}}
                    style={{position:"absolute",right:6,top:6,padding:"4px 10px",fontSize:10,
                      fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                      border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
                    Copy
                  </button>
                </div>
              )}
            </>
          )}

          {os === "linux" && (
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6,padding:"10px 12px",background:"var(--bg3)",borderRadius:"var(--r)"}}>
              <strong style={{color:"var(--t0)"}}>Your pairing code:</strong>{" "}
              <span style={{fontFamily:"var(--fm)",color:"var(--teal)",fontWeight:600}}>{displayCode}</span>
              {" "}— valid for 15 minutes, already included in the command above.
            </div>
          )}
        </div>

        <div style={{textAlign:"center",margin:"20px 0",fontSize:13,color:"var(--t2)"}}>
          {os === "linux"?"Once you've run the command above, click below to check in.":"Once it says it's done, click below to check in."}
        </div>

        <Btn full onClick={()=>setPhase("detecting")}>
          I ran it — check my computer →
        </Btn>

        <button onClick={()=>{setPairingCode(null);setPhase("os");}}
          style={{display:"block",margin:"14px auto 0",fontSize:12,color:"var(--t2)",
            background:"transparent",border:"none",padding:6,cursor:"pointer"}}>
          ← Pick a different operating system
        </button>
      </div>
    );
  }

  // ─── Step 3: Auto-detecting ──────────────────────────────────────────────
  if (phase === "detecting") {
    const steps = [
      { pct: 18, label: "Connecting" },
      { pct: 38, label: "Checking GPU" },
      { pct: 58, label: "Testing internet" },
      { pct: 78, label: "Measuring speed" },
      { pct: 100, label: "Done" },
    ];
    const current = steps.find(s => progress <= s.pct) || steps[steps.length-1];
    // Real mode has no fixed-length process to show percentage-through —
    // the wait is "has the seller run the binary yet", which is unbounded.
    // Creep the ring toward (not to) full so it still reads as "working".
    const displayProgress = demoMode ? progress : Math.min(92, elapsedSec * 4);

    return (
      <div style={{maxWidth:540,margin:"0 auto",textAlign:"center"}}>
        <div style={{marginBottom:18}}><Search size={46}/></div>
        <h3 style={{fontSize:19,fontWeight:700,marginBottom:8}}>Looking at your computer...</h3>
        <p style={{fontSize:13,color:"var(--t2)",marginBottom:24}}>
          {demoMode
            ? "We're checking what you've got. This takes about 30 seconds."
            : "Run the helper on your computer — we'll pick it up automatically."}
        </p>

        {/* Progress ring */}
        <div style={{position:"relative",width:120,height:120,margin:"0 auto 24px"}}>
          <svg viewBox="0 0 120 120" style={{width:"100%",height:"100%",transform:"rotate(-90deg)"}}>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg3)" strokeWidth="6"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--teal)" strokeWidth="6"
              strokeDasharray={`${2*Math.PI*52}`} strokeDashoffset={`${2*Math.PI*52*(1-displayProgress/100)}`}
              strokeLinecap="round" style={{transition:"stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)"}}/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:demoMode?24:16,fontFamily:"var(--fm)",fontWeight:600,color:"var(--teal)"}}>
            {demoMode ? `${progress}%` : `${elapsedSec}s`}
          </div>
        </div>

        <div style={{fontSize:14,fontWeight:500,color:"var(--t1)",marginBottom:20,minHeight:20}}>
          {demoMode ? `${current.label}...` : "Waiting for the helper to check in..."}
        </div>

        {demoMode ? (
          <div style={{textAlign:"left",maxWidth:300,margin:"0 auto"}}>
            {steps.slice(0,4).map(s => (
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",
                opacity:progress >= s.pct ? 1 : 0.4,transition:"opacity .3s"}}>
                <div style={{width:16,height:16,borderRadius:"50%",flexShrink:0,
                  background:progress >= s.pct ? "var(--teal)" : "var(--bg3)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,
                  color:"var(--bg0)"}}>
 {progress >= s.pct ? <Check size={10}/> : null}
                </div>
                <span style={{fontSize:12,color:"var(--t1)"}}>{s.label}</span>
              </div>
            ))}
          </div>
        ) : pairingCode && (
          <div style={{fontSize:12,color:"var(--t2)",background:"var(--bg3)",borderRadius:"var(--r)",
            padding:"10px 14px",maxWidth:340,margin:"0 auto"}}>
            Still need the command? Your code is{" "}
            <strong style={{color:"var(--teal)",fontFamily:"var(--fm)"}}>{pairingCode.code}</strong> —{" "}
            <button onClick={()=>setPhase("install")}
              style={{color:"var(--teal)",background:"none",border:"none",cursor:"pointer",padding:0,font:"inherit"}}>
              go back
            </button> to see it again.
          </div>
        )}
      </div>
    );
  }

  // ─── Step 3b: Not compatible yet ─────────────────────────────────────────
  if (phase === "incompatible") {
    return (
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{marginBottom:10}}><ShieldCheck size={40}/></div>
          <h3 style={{fontSize:19,fontWeight:700,marginBottom:6}}>A few things to fix first</h3>
          <p style={{fontSize:13,color:"var(--t2)"}}>Your computer reported these results — fix what's missing, then run the helper again.</p>
        </div>
        <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r2)",padding:18,marginBottom:14}}>
          {(readinessChecks || []).map((check, index) => (
            <div key={check.id} style={{padding:"12px 0",borderTop:index ? ".5px solid var(--b)" : "none"}}>
              <div style={{display:"flex",alignItems:"center",gap:9,fontSize:13,fontWeight:600,color:check.ready?"var(--teal)":"var(--t0)"}}>
                <span style={{width:20,height:20,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,background:check.ready?"var(--td)":"var(--bg3)",border:`.5px solid ${check.ready?"var(--teal)":"var(--b2)"}`}}>{check.ready ? "✓" : "!"}</span>
                {check.label}
              </div>
              <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5,margin:"5px 0 0 29px"}}>
                {check.detail}{!check.ready && check.install ? ` ${check.install}` : ""}
              </div>
            </div>
          ))}
        </div>
        <Btn full onClick={()=>{
          setPairingCode(null);
          setDetectedSpecs(null);
          setReadinessChecks(null);
          setPhase("install");
        }}>
          I fixed it — check my computer again →
        </Btn>
        <button onClick={()=>setPhase("os")} style={{display:"block",margin:"14px auto 0",fontSize:12,color:"var(--t2)",background:"transparent",border:"none",padding:6,cursor:"pointer"}}>← Pick a different computer</button>
      </div>
    );
  }

  // ─── Step 4: Review detected specs + pricing ─────────────────────────────
  if (phase === "review") {
    const s = detectedSpecs;
    const suggestedPrice = suggestPrice(s.gpu);

    return (
      <div style={{maxWidth:680,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{marginBottom:10}}><PartyPopper size={46}/></div>
          <h3 style={{fontSize:20,fontWeight:700,marginBottom:6}}>Looks great! Here's your computer:</h3>
          <p style={{fontSize:13,color:"var(--t2)"}}>You can change any of this later from your dashboard.</p>
        </div>

        {/* Detected spec card */}
        <Card style={{marginBottom:14,padding:18}}>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:10}}>
            What we found
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14}}>
            <SpecItem icon={Cpu} label="Graphics card" value={s.gpu}/>
            <SpecItem icon={MemoryStick} label="VRAM" value={s.vram}/>
            <SpecItem icon={Brain} label="System memory" value={s.ram}/>
            <SpecItem icon={Cpu} label="CPU" value={s.cpu}/>
            <SpecItem icon={Laptop} label="OS" value={({mac:"macOS",windows:"Windows",linux:"Linux"})[s.os] || s.os}/>
          </div>
        </Card>

        {/* Configure */}
        <Card style={{marginBottom:14,padding:18}}>
          <div style={{fontSize:14,fontWeight:600,marginBottom:13}}>A couple things to set up</div>

          <Fld label="Name your computer (so you recognize it)"
            placeholder={`My ${s.gpu.split(" ").slice(-2).join(" ")} setup`}
            value={nodeName} onChange={e=>setNodeName(e.target.value)}/>

          {/* Price preset */}
          <div style={{marginBottom:14}}>
            <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
              textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>
              How much to charge per hour
            </label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {[
                { id:"low", label:"Budget", price:(suggestedPrice*0.85).toFixed(2), sub:"Get jobs fast" },
                { id:"auto", label:"Suggested", price:suggestedPrice.toFixed(2), sub:"Sweet spot" },
                { id:"high", label:"Premium", price:(suggestedPrice*1.20).toFixed(2), sub:"Higher profit" },
              ].map(p => (
                <button key={p.id} onClick={()=>setPricePreset(p.id)}
                  style={{padding:"11px 9px",borderRadius:"var(--r)",fontSize:12,fontWeight:600,
                    background:pricePreset===p.id?"var(--td)":"var(--bg3)",
                    color:pricePreset===p.id?"var(--teal)":"var(--t1)",
                    border:`.5px solid ${pricePreset===p.id?"var(--teal)":"var(--b2)"}`,
                    cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                  <div style={{fontSize:11,marginBottom:3,opacity:.85}}>{p.label}</div>
                  <div style={{fontSize:15,fontFamily:"var(--fm)",fontWeight:600}}>${p.price}<span style={{fontSize:10,opacity:.7}}>/hr</span></div>
                  <div style={{fontSize:9,opacity:.7,marginTop:3}}>{p.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* When */}
          <div style={{marginBottom:13}}>
            <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
              textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>
              When should your computer earn money?
            </label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:7}}>
              {[
                {id:"always",label:"Always",icon:Circle,hint:"Maximum earnings"},
                {id:"nights",label:"Nights & weekends",icon:Moon,hint:"While you sleep"},
                {id:"idle",label:"When I'm not using it",icon:Coffee,hint:"Detects automatically"},
              ].map(opt => (
                <button key={opt.id} onClick={()=>setSchedule(opt.id)}
                  style={{padding:"10px 12px",fontSize:12,textAlign:"left",
                    background:schedule===opt.id?"var(--td)":"var(--bg3)",
                    color:schedule===opt.id?"var(--teal)":"var(--t1)",
                    border:`.5px solid ${schedule===opt.id?"var(--teal)":"var(--b2)"}`,
                    borderRadius:"var(--r)",cursor:"pointer",transition:"all .15s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <span><opt.icon size={18}/></span>
                    <span style={{fontWeight:600,fontSize:12}}>{opt.label}</span>
                  </div>
                  <div style={{fontSize:10,color:"var(--t2)"}}>{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Renewable */}
          <div onClick={()=>setRenewable(r=>!r)}
            style={{display:"flex",alignItems:"center",gap:10,padding:"10px 13px",
              background:"var(--bg3)",borderRadius:"var(--r)",cursor:"pointer",
              border:`.5px solid ${renewable?"rgba(61,186,111,.4)":"var(--b)"}`}}>
            <div style={{width:36,height:20,borderRadius:10,position:"relative",flexShrink:0,
              background:renewable?"var(--green)":"var(--bg2)",
              border:`.5px solid ${renewable?"var(--green)":"var(--b2)"}`,transition:"background .2s"}}>
              <div style={{position:"absolute",top:2,left:renewable?18:2,width:16,height:16,
                borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </div>
            <div style={{flex:1}}>
 <div style={{fontSize:13,fontWeight:500}}> My computer runs on renewable energy</div>
              <div style={{fontSize:11,color:"var(--t2)"}}>Earn 8% more from eco-conscious renters</div>
            </div>
          </div>
        </Card>

        {/* Estimated earnings */}
        <div style={{background:"linear-gradient(135deg,rgba(245,166,35,.1),transparent)",
          border:".5px solid rgba(245,166,35,.3)",borderRadius:"var(--r2)",padding:"16px 20px",marginBottom:14}}>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>
            Estimated earnings
          </div>
          <div style={{display:"flex",alignItems:"baseline",gap:14,flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:26,fontFamily:"var(--fm)",fontWeight:600,color:"var(--amber)",lineHeight:1}}>
                ${estimateEarnings(suggestedPrice, pricePreset, schedule, renewable).toFixed(0)}
                <span style={{fontSize:14,color:"var(--t2)"}}>/month</span>
              </div>
              <div style={{fontSize:11,color:"var(--t2)",marginTop:4}}>after our 10% fee</div>
            </div>
            <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.6}}>
              Based on typical usage patterns.<br/>
              Actual earnings vary with demand.
            </div>
          </div>
        </div>

        {/* Launch */}
        <Btn full onClick={async()=>{
          if (!user) { showToast("Please sign in first","error"); return; }

          if (demoMode) {
            showToast("All set! Your computer would be live now (demo mode).","success");
            setPhase("done");
            return;
          }
          if (!pairingCode) {
            showToast("Something went wrong — let's restart setup.","error");
            setPhase("install");
            return;
          }

          const finalPrice = pricePreset==="low" ? suggestedPrice*0.85 :
                              pricePreset==="high" ? suggestedPrice*1.20 :
                              suggestedPrice;
          const result = await registerNode(
            {
              code: pairingCode.code,
              name: nodeName.trim() || `My ${s.gpu.split(" ").slice(-2).join(" ")} setup`,
              pricePerHour: Math.round(finalPrice * 100) / 100,
              schedule,
              renewable,
            },
            idempotencyKeyRef.current ? { "Idempotency-Key": idempotencyKeyRef.current } : undefined
          );
          if (!result) return; // registerNode already toasted the error — stay on review to retry
          setRegisteredNode(result.data);
          onRegistered?.();
          setPhase("done");
        }} style={{fontSize:15,padding:"13px 20px"}}>
          <Rocket size={15}/> Start earning
        </Btn>

        <button onClick={()=>setPhase("install")}
          style={{display:"block",margin:"12px auto 0",fontSize:12,color:"var(--t2)",
            background:"transparent",border:"none",padding:6,cursor:"pointer"}}>
          ← Run detection again
        </button>
      </div>
    );
  }

  // ─── Step 5: Start the resident agent ────────────────────────────────────
  // The command carries a one-time code, not the long-lived secret — the
  // helper's --start flag exchanges it and saves the real credential
  // locally, so this short string is all a seller ever has to handle.
  const displayEnrollCode = enrollCode
    ? `${enrollCode.code}@${API_BASE.replace(/^https?:\/\//, "").replace(/\/$/,"")}`
    : null;
  const agentCommand = displayEnrollCode
    ? (os === "windows"
      ? `decompute-helper-windows-amd64.exe --start ${displayEnrollCode}`
      : `./decompute-helper --start ${displayEnrollCode}`)
    : null;
  const nodeOnline = registeredNode?.status === "available" || registeredNode?.status === "busy";

  return (
    <div style={{maxWidth:540,margin:"40px auto 0",textAlign:"center"}}>
      <div style={{width:80,height:80,borderRadius:"50%",background:"var(--td)",
        border:"1px solid rgba(0,212,168,.4)",margin:"0 auto 18px",display:"flex",
        alignItems:"center",justifyContent:"center",fontSize:40,
        animation:"modalIn .5s cubic-bezier(.4,0,.2,1) both"}}>
 
      </div>
 <h3 style={{fontSize:22,fontWeight:700,marginBottom:8}}>{demoMode || nodeOnline ? "You're online!" : "One more step"}</h3>
      <p style={{fontSize:14,color:"var(--t1)",lineHeight:1.6,marginBottom:24}}>
        {demoMode || nodeOnline
          ? "Your computer is connected and ready to receive jobs."
          : "Open the helper app one more time to turn on job-receiving."}
      </p>

      {!demoMode && !nodeOnline && <div style={{background:"var(--bg2)",border:".5px solid var(--teal)",borderRadius:"var(--r2)",
        padding:"16px 20px",marginBottom:18,textAlign:"left"}}>
        <div style={{fontSize:12,fontWeight:600,color:"var(--t0)",marginBottom:9}}>Turn on job-receiving</div>
        <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6,marginBottom:13}}>
          Just open the helper app again — no typing needed. This is the last step, and it also sets your computer to keep doing this automatically every time you turn it on.
        </div>
        {[
          "Open the helper you downloaded earlier (double-click it).",
          "It'll ask for a code — paste this one in and press Enter.",
          "Once it says you're connected, you can close it — your computer will keep receiving jobs on its own from now on, including after restarts.",
        ].map((step,i) => (
          <div key={i} style={{display:"flex",gap:10,padding:"5px 0",fontSize:12,color:"var(--t1)"}}>
            <span style={{color:"var(--teal)",flexShrink:0,fontWeight:600}}>{i+1}.</span>
            <span>{step}</span>
          </div>
        ))}
        {enrollCode ? (
          <div style={{background:"#020608",borderRadius:"var(--r)",padding:"14px",textAlign:"center",margin:"11px 0",position:"relative"}}>
            <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:6}}>Your code</div>
            <div style={{fontSize:displayEnrollCode.length > 20 ? 15 : 22,fontFamily:"var(--fm)",fontWeight:700,color:"var(--teal)",letterSpacing:".06em",wordBreak:"break-all",padding:"0 52px"}}>
              {displayEnrollCode}
            </div>
            <button onClick={()=>{navigator.clipboard?.writeText(displayEnrollCode);setCopiedAgentCommand(true);showToast("Code copied. Keep it private until you've used it — it activates this listing.","success");}}
              style={{position:"absolute",right:6,top:6,padding:"4px 10px",fontSize:10,
                fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
              {copiedAgentCommand ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <div style={{fontSize:12,color:"var(--t2)",padding:"11px 0"}}>Preparing your one-time code…</div>
        )}
        <button onClick={()=>setShowCmdLine(s=>!s)}
          style={{display:"block",margin:"2px auto 4px",fontSize:11,color:"var(--t2)",
            background:"transparent",border:"none",padding:4,cursor:"pointer",textDecoration:"underline"}}>
          {showCmdLine ? "Hide command line option":"Prefer the command line?"}
        </button>
        {showCmdLine && agentCommand && (
          <div style={{background:"#020608",borderRadius:"var(--r)",padding:"12px 14px",
            fontFamily:"var(--fm)",fontSize:12,color:"var(--teal)",position:"relative",marginTop:8}}>
            <code style={{display:"block",wordBreak:"break-all",paddingRight:50}}>{agentCommand}</code>
            <button onClick={()=>{navigator.clipboard?.writeText(agentCommand);showToast("Command copied.","success");}}
              style={{position:"absolute",right:6,top:6,padding:"4px 10px",fontSize:10,
                fontFamily:"var(--fm)",background:"var(--bg3)",color:"var(--teal)",
                border:".5px solid var(--b2)",borderRadius:4,cursor:"pointer"}}>
              Copy
            </button>
          </div>
        )}
        <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.5,marginTop:11}}>Waiting to hear from your computer — this updates on its own once it checks in.</div>
        <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.5,marginTop:6}}>Changed your mind? Open the helper with <code style={{color:"var(--teal)"}}>--autostart off</code> to stop it from starting automatically.</div>
      </div>}

      {(demoMode || nodeOnline) && <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r2)",
        padding:"16px 20px",marginBottom:18,textAlign:"left",fontSize:12,color:"var(--t1)",lineHeight:1.6}}>
        Your agent is checking in successfully. Jobs matching your computer can now be assigned here.
      </div>}

      <Btn full onClick={()=>{
        window.dispatchEvent(new CustomEvent("decompute-auth-changed"));
        // Reset so the wizard is clean if they add another machine later,
        // then hand back to the hub, which now leads with their listings.
        setPhase("os");
        setPairingCode(null);
        setRegisteredNode(null);
        setEnrollCode(null);
        onExit?.();
      }}>Go to my dashboard</Btn>
    </div>
  );
};

// ─── Tiny helpers for the easy path ───────────────────────────────────────────
const SpecItem = ({icon: Icon, label, value}) => (
  <div>
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"var(--t2)",marginBottom:3}}>
      <span style={{display:"flex"}}>{Icon ? <Icon size={13}/> : null}</span>
      <span style={{textTransform:"uppercase",letterSpacing:".06em",fontFamily:"var(--fm)"}}>{label}</span>
    </div>
    <div style={{fontSize:13,color:"var(--t0)",fontWeight:500,fontFamily:"var(--fm)"}}>{value}</div>
  </div>
);

function detectOs() {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent || "";
  if (/Mac/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  return "linux";
}

// Demo-mode-only fallback for when there's no backend to poll a real
// pairing code against. Never used once backendOnline is true — real specs
// always come from specFromDetected(), fed by the helper binary's report.
function simulateDetection() {
  const examples = [
    { gpu:"NVIDIA RTX 4090", gpuBrand:"nvidia", gpuCount:1, vramGb:24, vram:"24 GB",
      ram:"64 GB", ramGb:64, cpu:"Intel Core i9-13900K", cpuCores:24, os:"windows" },
    { gpu:"NVIDIA RTX 3080", gpuBrand:"nvidia", gpuCount:1, vramGb:10, vram:"10 GB",
      ram:"32 GB", ramGb:32, cpu:"AMD Ryzen 9 5900X", cpuCores:12, os:"windows" },
    { gpu:"NVIDIA RTX 4070 Ti", gpuBrand:"nvidia", gpuCount:1, vramGb:12, vram:"12 GB",
      ram:"32 GB", ramGb:32, cpu:"AMD Ryzen 7 7700X", cpuCores:8, os:"windows" },
  ];
  return examples[Math.floor(Math.random() * examples.length)];
}

// One decimal, and no trailing ".0" — byte-derived totals otherwise render
// as 31.434871673583984 GB. Newer helper builds round at the source; this
// also covers specs captured before that.
const gb = (n) => `${Math.round((Number(n) || 0) * 10) / 10} GB`;

// Converts the backend's detected_spec shape (see POST /api/nodes/detect)
// into the display shape the review step's SpecItem grid renders.
function specFromDetected(detected) {
  const gpuCount = detected.gpuCount || 1;
  return {
    gpu: gpuCount > 1 ? `${gpuCount}x ${detected.gpuModel}` : detected.gpuModel,
    gpuBrand: detected.gpuVendor,
    gpuCount,
    vramGb: detected.vramGb,
    vram: gb(detected.vramGb),
    ramGb: detected.ramGb,
    ram: gb(detected.ramGb),
    cpu: detected.cpuModel,
    cpuCores: detected.cpuCores,
    os: detected.os,
  };
}

// Where the compiled helper binaries are hosted. Defaults to this repo's
// GitHub Releases "latest" alias (github.com/<owner>/<repo>/releases/latest/
// download/<filename> always redirects to the current release's asset of
// that name) — free, no custom domain required. See helper/README.md for
// how new binaries get published there.
const HELPER_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_HELPER_BINARY_BASE_URL) || "https://github.com/Exoplanetarium/Decompute/releases/latest/download";
const HELPER_FILES = {
  "mac-arm64":"decompute-helper-darwin-arm64",
  "mac-amd64":"decompute-helper-darwin-amd64",
  windows: "decompute-helper-windows-amd64.exe",
  linux: "decompute-helper-linux-amd64",
};

// Must match the -X main.defaultAPIBase value the released binaries are
// built with (see helper/Makefile). The double-click "just type the code"
// flow only works when this equals the frontend's own API_BASE — otherwise
// the binary reports to production instead of wherever this app actually
// points, so we fall back to showing the --api-base command instead.
const HELPER_DEFAULT_API_BASE = "https://api.decompute.io";

function suggestPrice(gpuModel) {
  const m = String(gpuModel).toUpperCase();
  if (m.includes("H100")) return 12.50;
  if (m.includes("A100")) return 5.50;
  if (m.includes("MI300")) return 28.00;
  if (m.includes("L40")) return 4.20;
  if (m.includes("6000")) return 3.50;
  if (m.includes("4090")) return 0.95;
  if (m.includes("4080")) return 0.65;
  if (m.includes("4070")) return 0.50;
  if (m.includes("3090")) return 0.55;
  if (m.includes("3080")) return 0.40;
  return 0.35;
}

function estimateEarnings(basePrice, preset, schedule, renewable) {
  const priceMul = preset === "low"? 0.85 : preset ==="high" ? 1.20 : 1.0;
  const scheduleMul = schedule === "always"? 0.75 : schedule ==="nights" ? 0.45 : 0.30;
  const renewableMul = renewable ? 1.08 : 1.0;
  const hours = 24 * 30;
  return basePrice * priceMul * hours * scheduleMul * renewableMul * 0.9; // After 10% fee
}

// ─── ADVANCED PATH — the old technical wizard for developers ──────────────────
const ProviderAdvancedPath = ({onInject}) => {
  const [step,setStep]=useState(0);
  const mob=useIsMobile();
  const FORMS=[HWForm,NetForm,SecForm,PriceForm,ReviewForm];
  const F=FORMS[step];
  return(
    <div>
      <div style={{background:"var(--pd)",border:".5px solid rgba(155,109,255,.3)",borderRadius:"var(--r)",
        padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
        <span><Wrench size={18}/></span>
        <span style={{fontSize:12,color:"var(--purple)",lineHeight:1.5}}>
          <strong>Advanced mode</strong> — manual config for developers. Not sure about specs? Use the Easy setup instead.
        </span>
      </div>
      <PricingAdvisor onInject={onInject}/>
      <div className="prov-grid">
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card style={{border:".5px solid rgba(245,166,35,.3)",padding:17,position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,var(--amber),transparent)",opacity:.5}}/>
            <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:9}}>What you could earn</div>
            <div style={{fontSize:26,fontFamily:"var(--fm)",fontWeight:500,color:"var(--amber)",marginBottom:4}}>$4,840<span style={{fontSize:13,color:"var(--t2)"}}>/mo</span></div>
            <div style={{fontSize:12,color:"var(--t2)",marginBottom:11}}>at 90% busy time</div>
            <Bar v={90} c="var(--amber)"/>
            <div style={{fontSize:11,color:"var(--t2)",marginTop:8,fontFamily:"var(--fm)"}}>After our 10% fee, you keep $4,356/mo</div>
          </Card>
          {!mob&&(
            <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r2)",padding:13}}>
              {PSTEPS.map((s,i)=>(
                <div key={s} onClick={()=>setStep(i)} style={{display:"flex",alignItems:"center",gap:11,padding:"9px 11px",borderRadius:"var(--r)",cursor:"pointer",marginBottom:3,minHeight:42,background:step===i?"var(--td)":"transparent",transition:"background .15s"}}>
                  <div style={{width:23,height:23,borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontFamily:"var(--fm)",fontWeight:500,
                    background:i<step?"var(--teal)":step===i?"var(--td)":"var(--bg3)",color:i<step?"#000":step===i?"var(--teal)":"var(--t2)",
 border:`.5px solid ${i<=step?"var(--teal)":"var(--b)"}`}}>{i<step?"":i+1}</div>
                  <span style={{fontSize:13,color:step===i?"var(--teal)":"var(--t1)"}}>{s}</span>
                </div>
              ))}
            </div>
          )}
          <Card>
 <div style={{fontSize:12,fontWeight:600,marginBottom:11}}> Your trust badges</div>
            {[["Computer verified","Not yet"],["Internet tested","Not yet"],["Privacy enabled","Not yet"],["Deposit received","Not yet"],["Quality score","—"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:".5px solid var(--b)",fontSize:12}}>
                <span style={{color:"var(--t2)"}}>{k}</span>
                <span style={{fontFamily:"var(--fm)",color:"var(--t2)",fontSize:11}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
        <div>
          {mob&&(
            <div style={{display:"flex",gap:6,overflowX:"auto",padding:"0 0 11px",scrollbarWidth:"none"}}>
              {PSTEPS.map((s,i)=>(
                <button key={s} onClick={()=>setStep(i)} style={{flexShrink:0,padding:"5px 11px",borderRadius:18,fontSize:11,fontFamily:"var(--fm)",minHeight:30,
                  border:`.5px solid ${step===i?"var(--teal)":i<step?"rgba(0,212,168,.3)":"var(--b)"}`,
                  background:step===i?"var(--td)":"var(--bg3)",color:step===i?"var(--teal)":i<step?"var(--teal)":"var(--t2)"}}>
 {i<step ? <Check size={11}/> : null}{s}
                </button>
              ))}
            </div>
          )}
          <Card>
            <F/>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:22,paddingTop:16,borderTop:".5px solid var(--b)"}}>
              {step>0&&<Btn v="ghost" onClick={()=>setStep(s=>s-1)}>← Back</Btn>}
 <Btn onClick={()=>setStep(s=>Math.min(4,s+1))}>{step===4?"Join the Network":"Next →"}</Btn>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  NETWORK
// ═══════════════════════════════════════════════════════════════════════════════
const HealthMonitor = ({onInject}) => {
  const [res,setRes]=useState(null);
  const [busy,setBusy]=useState(false);
  const run=async()=>{
    setBusy(true);setRes(null);
    try{
 const r=await claude([{role:"user",content:`Generate a network health report for Decompute:\n- 2,847 nodes, 47 countries\n- 4.7 ExaFLOPS, 18,420 active jobs\n- 99.94% uptime\n- 1 node offline (Helios Array β, Amsterdam)\n- 1 job with GPU utilization anomaly (61% vs expected 88%)\n- $284K 24h volume\n\nProvide: 1) Health status (//), 2) Top 2 issues, 3) 4-hour capacity forecast, 4) Recommended operator action. Concise.`}]);
      setRes(r);
 }catch{setRes("Diagnostic unavailable.");}
    finally{setBusy(false);}
  };
  return(
    <Card style={{border:".5px solid rgba(0,212,168,.25)",marginBottom:18,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,var(--teal),transparent)",opacity:.5}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:res?14:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span><Globe size={14}/></span><span style={{fontSize:14,fontWeight:700}}>How is the network doing?</span>
          <span className="ai-badge">Live status</span>
        </div>
        <Btn onClick={run} disabled={busy} style={{fontSize:12,padding:"7px 14px"}}>
          {busy?<><Spin/> Checking…</>:"Check now →"}
        </Btn>
      </div>
      {res&&(
        <div style={{fontSize:13,lineHeight:1.7,color:"var(--t1)",whiteSpace:"pre-wrap",padding:"13px",background:"var(--bg3)",borderRadius:"var(--r)",border:".5px solid var(--b)"}}>
          {res}
          <button onClick={()=>onInject("What are the best practices to improve platform uptime and reduce node offline incidents?")}
            style={{marginTop:10,fontSize:11,fontFamily:"var(--fm)",color:"var(--teal)",background:"var(--td)",border:".5px solid rgba(0,212,168,.3)",borderRadius:4,padding:"4px 10px",cursor:"pointer",display:"block"}}>
            Uptime recommendations →
          </button>
        </div>
      )}
    </Card>
  );
};

const NetworkTab = ({onInject}) => { const { nodes, jobs } = useApp(); return (
  <div className="fade-in">
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
      <div><h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>The Network</h2>
        <p style={{fontSize:13,color:"var(--t2)",marginTop:3}}>How Decompute is doing right now — across the world</p></div>
 <Btn v="ghost" onClick={()=>onInject("Give me a full network status summary and any upcoming capacity concerns for the next 24 hours")} style={{fontSize:12}}> Ask AI</Btn>
    </div>
    <HealthMonitor onInject={onInject}/>
    <div className="g4" style={{marginBottom:20}}>
      {[{label:"Computers ready",value:String(nodes.filter(n=>n.status!=="offline").length),color:"var(--teal)",sub:`${nodes.length} total`},{label:"Total power",value:`${nodes.reduce((a,n)=>a+(n.total||0),0)} GPU`,color:"var(--purple)",sub:"across the network"},{label:"Jobs running",value:String(jobs.filter(j=>j.status==="running").length),color:"var(--amber)",sub:`${jobs.length} total`},{label:"Average quality",value:nodes.length>0?String(Math.round(nodes.reduce((a,n)=>a+(n.aiScore||0),0)/nodes.length)):"—",color:"var(--blue)",sub:"out of 100"}].map(s=>(
        <div key={s.label} style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r2)",padding:"15px 17px"}}>
          <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:7}}>{s.label}</div>
          <div style={{fontSize:24,fontFamily:"var(--fm)",fontWeight:500,color:s.color,marginBottom:4}}>{s.value}</div>
          <div style={{fontSize:11,color:"var(--t2)"}}>{s.sub}</div>
        </div>
      ))}
    </div>
    <div className="two-col" style={{marginBottom:18}}>
      <Card>
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>Types of computers available</div>
 {[{l:"Top tier — for huge models",p:18,c:"var(--purple)"},{l:"Pro — for serious work",p:31,c:"var(--teal)"},{l:"Standard — most popular",p:29,c:"var(--blue)"},{l:"Starter — great for learning",p:22,c:"var(--amber)"}].map(t=>(
          <div key={t.l} style={{marginBottom:13}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,fontSize:12,fontFamily:"var(--fm)"}}><span style={{color:"var(--t1)"}}>{t.l}</span><span style={{color:t.c}}>{t.p}%</span></div>
            <Bar v={t.p} c={t.c}/>
          </div>
        ))}
      </Card>
      <Card>
        <div style={{fontSize:13,fontWeight:600,marginBottom:14}}>How Decompute works</div>
        {[{l:"Safe payments",d:"Money held until job completes",c:"var(--teal)"},{l:"Smart matching",d:"AI picks the right computer",c:"var(--blue)"},{l:"Hardware checks",d:"We verify each computer is legit",c:"var(--purple)"},{l:"The computers",d:"GPU owners around the world",c:"var(--amber)"},{l:"Quick payouts",d:"Providers paid within 24 hours",c:"var(--red)"}].map((l,i)=>(
          <div key={l.l} style={{display:"flex",gap:12,padding:"9px 0",borderBottom:i<4?".5px solid var(--b)":"none",alignItems:"center"}}>
            <div style={{width:8,height:8,borderRadius:2,background:l.c,flexShrink:0}}/>
            <div><div style={{fontSize:13,fontWeight:500,marginBottom:2}}>{l.l}</div><div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>{l.d}</div></div>
          </div>
        ))}
      </Card>
    </div>
    <Card>
      <div style={{fontSize:13,fontWeight:600,marginBottom:15}}>How we keep you safe</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:13}}>
        {[{icon:ShieldCheck,t:"Verified hardware",b:"We check every computer is real and unmodified before it can join. Like an inspection sticker."},{icon:Wallet,t:"Money-back guarantee",b:"Providers put down a deposit. If they break the rules, you get refunded automatically. No arguing."},{icon:Shuffle,t:"Your data stays yours",b:"Everything you send is encrypted. The computer's owner can't see what you're working on."},{icon:Scale,t:"Fair dispute resolution",b:"If something goes wrong, we have a fair process to sort it out. Decisions are public and binding."},{icon:Sparkles,t:"Trust scores",b:"Every computer earns a reputation over time. Bad behavior tanks the score. You always see it."},{icon:Shield,t:"Clean handoffs",b:"After your job finishes, the computer's memory is wiped clean. No leftover data, ever."}].map(item=>(
          <div key={item.t} style={{background:"var(--bg3)",borderRadius:"var(--r)",padding:13,border:".5px solid var(--b)"}}>
            <div style={{marginBottom:8}}><item.icon size={16}/></div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:5}}>{item.t}</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6}}>{item.b}</div>
          </div>
        ))}
      </div>
    </Card>
  </div>
);};

// ═══════════════════════════════════════════════════════════════════════════════
//  FREE CREDIT TRIGGER — shows the $5 welcome modal on first signup
// ═══════════════════════════════════════════════════════════════════════════════
const FreeCreditTrigger = () => {
  const { user, startTour } = useApp();
  const [show, setShow] = useState(false);
  const seenRef = useRef(false);

  useEffect(() => {
    if (!user || seenRef.current) return;
    // Check if we've shown this before for this user
    try {
      const key = `decompute_credit_shown_${user.id || user.wallet}`;
      if (localStorage.getItem(key)) return;
      // Show after a tiny delay so it doesn't blink in immediately
      const id = setTimeout(() => {
        setShow(true);
        seenRef.current = true;
        localStorage.setItem(key, "1");
      }, 400);
      return () => clearTimeout(id);
    } catch {
      // localStorage blocked — just show once per session
      if (!seenRef.current) {
        setShow(true);
        seenRef.current = true;
      }
    }
  }, [user]);

  if (!show) return null;
  return <FreeCreditModal onClose={()=>setShow(false)} onStartTour={()=>{setShow(false);startTour();}}/>;
};

// ═══════════════════════════════════════════════════════════════════════════════
//  $5 FREE CREDIT MODAL — shown right after signup
// ═══════════════════════════════════════════════════════════════════════════════
const FreeCreditModal = ({onClose, onStartTour}) => {
  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:1100,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"linear-gradient(135deg,rgba(0,212,168,.1),rgba(155,109,255,.1)),var(--bg2)",
        border:"1px solid rgba(0,212,168,.4)",borderRadius:"var(--r3)",padding:32,width:"100%",maxWidth:440,
        animation:"modalIn .4s cubic-bezier(.4,0,.2,1) both",textAlign:"center",position:"relative",overflow:"hidden"}}>

        {/* Confetti-ish background dots */}
        <div style={{position:"absolute",inset:0,opacity:.3,pointerEvents:"none"}}>
          {[...Array(20)].map((_,i)=>(
            <div key={i} style={{position:"absolute",
              top:`${Math.random()*100}%`,left:`${Math.random()*100}%`,
              width:6,height:6,borderRadius:"50%",
              background:["var(--teal)","var(--purple)","var(--amber)"][i%3],
              animation:`fadeUp ${.5+Math.random()}s ease both`,animationDelay:`${Math.random()*.5}s`}}/>
          ))}
        </div>

        <div style={{position:"relative"}}>
          <div style={{marginBottom:14,animation:"modalIn .6s cubic-bezier(.4,0,.2,1) both"}}><Gift size={54}/></div>
          <h2 style={{fontSize:24,fontWeight:700,letterSpacing:"-.02em",marginBottom:8}}>
            Here's <span style={{color:"var(--teal)"}}>$5 free</span> to get started
          </h2>
          <p style={{fontSize:14,color:"var(--t1)",lineHeight:1.65,marginBottom:24,maxWidth:340,margin:"0 auto 24px"}}>
            On the house — enough to try a few jobs. No credit card needed.
            Try generating an image, transcribing audio, or running a quick experiment.
          </p>

          <div style={{background:"var(--bg3)",border:".5px solid var(--b)",borderRadius:"var(--r)",
            padding:"14px 18px",marginBottom:24,textAlign:"left"}}>
            <div style={{fontSize:11,fontWeight:600,color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:10}}>
              What you can try with $5
            </div>
            {[
 [Palette,"Generate 40+ images with Flux"],
 [Mic,"Transcribe 5 hours of audio"],
 [Brain,"Run a small fine-tune"],
 [NotebookPen,"Spend 4 hours in a Jupyter notebook"],
            ].map(([Icon,label])=>(
              <div key={label} style={{display:"flex",gap:10,padding:"5px 0",fontSize:13}}>
                <span style={{width:22,display:"flex"}}><Icon size={15}/></span>
                <span style={{color:"var(--t1)"}}>{label}</span>
              </div>
            ))}
          </div>

          <button onClick={()=>{onClose();onStartTour();}}
            style={{width:"100%",padding:"13px 18px",background:"var(--teal)",color:"#000",
              border:"none",borderRadius:"var(--r)",fontSize:14,fontWeight:600,cursor:"pointer",
              marginBottom:10}}>
            <Sparkles size={15}/> Show me around (60 sec)
          </button>
          <button onClick={onClose}
            style={{width:"100%",padding:"10px 18px",background:"transparent",color:"var(--t2)",
              border:"none",fontSize:12,cursor:"pointer"}}>
            I'll explore on my own
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ONBOARDING TOUR — 5-step interactive walkthrough
// ═══════════════════════════════════════════════════════════════════════════════
const TOUR_STEPS = [
  {
 title: "This is the marketplace",
    body: "Every card here is a real computer ready to rent. Each shows what GPU it has, how much it costs, and a trust score. Best matches show first.",
    target: "marketplace-grid",
    placement: "center",
  },
  {
 title: "Need help picking one? Ask AI",
 body: "Click the button (bottom-right) anytime to chat with our AI assistant. Tell it what you're working on and it'll recommend the right computer.",
    target: "ai-fab",
    placement: "left",
  },
  {
 title: "Submit your first job",
    body: "Head to 'My Jobs' and click '+ New Job'. We have templates for image generation, language model fine-tuning, transcription, and more. One click and you're running.",
    target: "nav-myjobs",
    placement: "bottom",
  },
  {
 title: "Earn money on the side",
    body: "Got a gaming PC? Share its GPU when you're not using it. Earnings go straight to your wallet every 24 hours. Most people earn $30–200/day.",
    target: "nav-provider",
    placement: "bottom",
  },
  {
 title: "Your $5 is ready",
    body: "We added $5 to your account. Pick something fun from the marketplace, or click 'My Jobs' → '+ New Job' to get started with a template. Have fun!",
    target: null,
    placement: "center",
    final: true,
  },
];

const OnboardingTour = ({setTab}) => {
  const { tourActive, tourStep, endTour, nextTourStep } = useApp();
  const [highlightRect, setHighlightRect] = useState(null);

  // Find and highlight the target element
  useEffect(() => {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStep];
    if (!step?.target) {
      setHighlightRect(null);
      return;
    }

    const findEl = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setHighlightRect({
          top: rect.top, left: rect.left, width: rect.width, height: rect.height
        });
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };

    findEl();
    const id = setInterval(findEl, 300); // re-check in case layout shifts
    return () => clearInterval(id);
  }, [tourActive, tourStep]);

  // Auto-navigate to correct tab for each step
  useEffect(() => {
    if (!tourActive) return;
    const step = TOUR_STEPS[tourStep];
    if (step?.target === "marketplace-grid") setTab("Marketplace");
  }, [tourActive, tourStep, setTab]);

  if (!tourActive) return null;
  const step = TOUR_STEPS[tourStep];
  const isLast = tourStep >= TOUR_STEPS.length - 1;

  return (
    <>
      {/* Dim overlay with a hole punched through */}
      <div style={{position:"fixed",inset:0,zIndex:1200,pointerEvents:"none"}}>
        <svg width="100%" height="100%" style={{position:"absolute",inset:0}}>
          <defs>
            <mask id="tour-mask">
              <rect width="100%" height="100%" fill="white"/>
              {highlightRect && (
                <rect x={highlightRect.left-8} y={highlightRect.top-8}
                  width={highlightRect.width+16} height={highlightRect.height+16}
                  rx="12" fill="black"/>
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#tour-mask)"/>
        </svg>
        {/* Animated ring around highlighted element */}
        {highlightRect && (
          <div style={{position:"absolute",
            top:highlightRect.top-8,left:highlightRect.left-8,
            width:highlightRect.width+16,height:highlightRect.height+16,
            borderRadius:12,border:"2px solid var(--teal)",
            boxShadow:"0 0 0 4px rgba(0,212,168,.2),0 0 24px rgba(0,212,168,.4)",
            animation:"pulse 2s ease infinite",pointerEvents:"none"}}/>
        )}
      </div>

      {/* Step card */}
      <div style={{position:"fixed",zIndex:1201,
        ...(step.placement === "center" || !highlightRect ? {
          top:"50%",left:"50%",transform:"translate(-50%,-50%)"
        } : step.placement === "bottom" ? {
          top: Math.min(highlightRect.top + highlightRect.height + 20, window.innerHeight - 280),
          left: Math.max(20, Math.min(highlightRect.left + highlightRect.width/2 - 180, window.innerWidth - 380))
        } : step.placement === "left" ? {
          top: Math.max(20, Math.min(highlightRect.top + highlightRect.height/2 - 90, window.innerHeight - 220)),
          right: window.innerWidth - highlightRect.left + 20
        } : {
          top: Math.min(highlightRect.top + highlightRect.height + 20, window.innerHeight - 280),
          left: Math.max(20, Math.min(highlightRect.left, window.innerWidth - 380))
        }),
        background:"var(--bg2)",border:"1px solid var(--teal)",borderRadius:"var(--r2)",
        padding:"18px 22px",width:340,maxWidth:"calc(100vw - 32px)",
        boxShadow:"0 16px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(0,212,168,.2)",
        animation:"modalIn .25s cubic-bezier(.4,0,.2,1) both"}}>

        {/* Step indicator */}
        <div style={{display:"flex",gap:4,marginBottom:14}}>
          {TOUR_STEPS.map((_, i) => (
            <div key={i} style={{flex:1,height:3,borderRadius:2,
              background: i <= tourStep ? "var(--teal)" : "var(--bg3)",
              transition:"background .3s"}}/>
          ))}
        </div>

        <h3 style={{fontSize:16,fontWeight:700,marginBottom:8,letterSpacing:"-.01em"}}>
          {step.title}
        </h3>
        <p style={{fontSize:13,color:"var(--t1)",lineHeight:1.65,marginBottom:18}}>
          {step.body}
        </p>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <button onClick={endTour}
            style={{fontSize:12,color:"var(--t2)",background:"transparent",border:"none",
              cursor:"pointer",padding:"6px 0"}}>
            Skip tour
          </button>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>
              {tourStep + 1}/{TOUR_STEPS.length}
            </span>
            <button onClick={isLast ? endTour : nextTourStep}
              style={{padding:"7px 16px",background:"var(--teal)",color:"#000",border:"none",
                borderRadius:6,fontSize:12,fontWeight:600,cursor:"pointer"}}>
 {isLast? "Got it!" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  PRICING CALCULATOR — public page, compares Decompute to competitors
// ═══════════════════════════════════════════════════════════════════════════════

// Competitor pricing data (per GPU hour, rough averages from public price pages)
const COMPETITOR_PRICES = {
  "RTX 4090": { decompute: 0.86, aws: 3.20, runpod: 0.79, lambda: 1.10, together: null },
  "A100 80GB": { decompute: 5.40, aws: 7.34, runpod: 2.49, lambda: 2.99, together: 3.40 },
  "H100 80GB": { decompute: 12.80, aws: 12.29, runpod: 4.69, lambda: 4.49, together: 9.80 },
  "L40S":     { decompute: 4.20, aws: null, runpod: 1.19, lambda: null, together: null },
  "RTX 6000 Ada": { decompute: 3.60, aws: null, runpod: 0.99, lambda: 1.49, together: null },
};

const WORKLOADS = [
  { id: "image", name:"Generate 100 images", hours: 0.3, gpu:"RTX 4090" },
  { id: "transcribe", name:"Transcribe 10 hours of audio", hours: 0.8, gpu:"RTX 4090" },
  { id: "finetune-small", name:"Fine-tune Llama 8B", hours: 4, gpu:"A100 80GB" },
  { id: "finetune-large", name:"Fine-tune Llama 70B", hours: 12, gpu:"H100 80GB" },
  { id: "diffusion", name:"Train custom diffusion model", hours: 24, gpu:"A100 80GB" },
  { id: "video", name:"Generate 50 video clips", hours: 2, gpu:"H100 80GB" },
];

const PricingTab = ({onInject, setTab}) => {
  const [workload, setWorkload] = useState(WORKLOADS[0]);
  const [customHours, setCustomHours] = useState(null);
  const [customGpu, setCustomGpu] = useState(null);
  const { login } = useApp();

  const hours = customHours ?? workload.hours;
  const gpu = customGpu ?? workload.gpu;
  const prices = COMPETITOR_PRICES[gpu] || COMPETITOR_PRICES["RTX 4090"];

  // Calculate costs
  const costs = [
    { provider: "Decompute", price: prices.decompute, badge: "Cheapest in most cases", color: "var(--teal)" },
    { provider: "RunPod",      price: prices.runpod },
    { provider: "Lambda Labs", price: prices.lambda },
    { provider: "Together AI", price: prices.together },
    { provider: "AWS",         price: prices.aws,    badge: "Most expensive", color: "var(--red)" },
  ].filter(c => c.price !== null).sort((a,b) => a.price - b.price);

  const decomputeCost = (prices.decompute * hours).toFixed(2);
  const awsCost = prices.aws ? (prices.aws * hours).toFixed(2) : null;
  const savings = awsCost ? (parseFloat(awsCost) - parseFloat(decomputeCost)).toFixed(2) : null;
  const savingsPct = awsCost ? Math.round((1 - prices.decompute / prices.aws) * 100) : null;

  return (
    <div className="fade-in">
      {/* Hero */}
      <div style={{textAlign:"center",padding:"24px 0 32px",maxWidth:680,margin:"0 auto"}}>
        <h1 style={{fontSize:32,fontWeight:700,letterSpacing:"-.02em",marginBottom:10,lineHeight:1.1}}>
          AI compute at a fraction of the cost
        </h1>
        <p style={{fontSize:15,color:"var(--t1)",lineHeight:1.6,marginBottom:6}}>
          Compare what your workload would cost on Decompute vs AWS, Lambda, and others.
        </p>
        <p style={{fontSize:12,color:"var(--t2)"}}>
          Prices update daily. No login required.
        </p>
      </div>

      {/* Workload picker */}
      <Card style={{marginBottom:18,padding:20}}>
        <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:11}}>
          What are you running?
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:9}}>
          {WORKLOADS.map(w => (
            <button key={w.id} onClick={()=>{setWorkload(w);setCustomHours(null);setCustomGpu(null);}}
              style={{padding:"11px 13px",textAlign:"left",
                background:workload.id===w.id?"var(--td)":"var(--bg3)",
                color:workload.id===w.id?"var(--teal)":"var(--t1)",
                border:`.5px solid ${workload.id===w.id?"var(--teal)":"var(--b2)"}`,
                borderRadius:"var(--r)",cursor:"pointer",transition:"all .15s",fontSize:13}}>
              <div style={{fontWeight:600,marginBottom:4}}>{w.name}</div>
              <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)"}}>~{w.hours}h on {w.gpu}</div>
            </button>
          ))}
        </div>

        {/* Custom controls */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:14,paddingTop:14,borderTop:".5px solid var(--b)"}}>
          <div>
            <label style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",display:"block",marginBottom:5}}>
              Hours
            </label>
            <input type="number" min="0.1" step="0.5" value={hours}
              onChange={e=>setCustomHours(parseFloat(e.target.value)||1)}
              style={{width:"100%",padding:"8px 11px",fontSize:13,background:"var(--bg3)",
                border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:38}}/>
          </div>
          <div>
            <label style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",display:"block",marginBottom:5}}>
              GPU
            </label>
            <select value={gpu} onChange={e=>setCustomGpu(e.target.value)}
              style={{width:"100%",padding:"8px 11px",fontSize:13,background:"var(--bg3)",
                border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:38}}>
              {Object.keys(COMPETITOR_PRICES).map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Big comparison */}
      <Card style={{marginBottom:18,padding:"22px 24px",overflow:"hidden",position:"relative"}}>
        <div style={{position:"absolute",top:0,left:0,right:0,height:3,
          background:"linear-gradient(90deg,var(--teal),var(--purple),var(--teal))",
          backgroundSize:"200% 100%",animation:"shimmer 3s linear infinite"}}/>

        <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap",marginBottom:18}}>
          <h2 style={{fontSize:22,fontWeight:700,letterSpacing:"-.02em"}}>
            Your cost on Decompute
          </h2>
          {savingsPct && (
            <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:14,
              background:"var(--td)",color:"var(--teal)",border:".5px solid rgba(0,212,168,.4)"}}>
              SAVE {savingsPct}%
            </span>
          )}
        </div>

        <div style={{display:"flex",alignItems:"baseline",gap:24,flexWrap:"wrap",marginBottom:18}}>
          <div>
            <div style={{fontSize:48,fontWeight:700,color:"var(--teal)",fontFamily:"var(--fm)",lineHeight:1}}>
              ${decomputeCost}
            </div>
            <div style={{fontSize:12,color:"var(--t2)",marginTop:4}}>
              total for {hours} hour{hours===1?"":"s"} on {gpu}
            </div>
          </div>
          {awsCost && (
            <div>
              <div style={{fontSize:24,fontWeight:600,color:"var(--t2)",fontFamily:"var(--fm)",textDecoration:"line-through",lineHeight:1}}>
                ${awsCost}
              </div>
              <div style={{fontSize:11,color:"var(--t2)",marginTop:4}}>
                on AWS · you save <strong style={{color:"var(--teal)"}}>${savings}</strong>
              </div>
            </div>
          )}
        </div>

        <div style={{padding:"11px 14px",background:"var(--td)",border:".5px solid rgba(0,212,168,.3)",
          borderRadius:"var(--r)",fontSize:13,color:"var(--t1)",lineHeight:1.5}}>
 With our welcome credit, your first <strong style={{color:"var(--teal)"}}>${"5"}</strong> is on us.
          Most users run their first job free.
        </div>
      </Card>

      {/* Full comparison table */}
      <Card style={{marginBottom:18,padding:20}}>
        <h3 style={{fontSize:15,fontWeight:600,marginBottom:14}}>Side-by-side comparison</h3>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {costs.map((c,i) => {
            const cost = (c.price * hours).toFixed(2);
            const isDecompute = c.provider === "Decompute";
            const pct = Math.min(100, (c.price / costs[costs.length-1].price) * 100);
            return (
              <div key={c.provider} style={{display:"flex",alignItems:"center",gap:14,
                padding:"12px 14px",
                background:isDecompute?"var(--td)":"var(--bg3)",
                border:`.5px solid ${isDecompute?"var(--teal)":"var(--b)"}`,
                borderRadius:"var(--r)"}}>
                <div style={{flex:"0 0 130px"}}>
                  <div style={{fontSize:13,fontWeight:600,color:isDecompute?"var(--teal)":"var(--t1)"}}>
                    {c.provider} {isDecompute && <span><Check size={10}/></span>}
                  </div>
                  <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",marginTop:2}}>
                    ${c.price.toFixed(2)}/hour
                  </div>
                </div>
                <div style={{flex:1,height:6,background:"var(--bg2)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,
                    background:c.color || (isDecompute?"var(--teal)":"var(--t2)"),
                    borderRadius:3,transition:"width .5s ease"}}/>
                </div>
                <div style={{flex:"0 0 80px",textAlign:"right",fontSize:14,fontWeight:600,
                  color:isDecompute?"var(--teal)":"var(--t1)",fontFamily:"var(--fm)"}}>
                  ${cost}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{fontSize:10,color:"var(--t2)",marginTop:14,lineHeight:1.6}}>
          Prices reflect on-demand rates as of {new Date().toLocaleDateString()}. AWS p4d.24xlarge / p5.48xlarge.
          RunPod, Lambda, Together: lowest community/secure rates. Spot/reserved instances available at lower prices.
        </div>
      </Card>

      {/* Why is it cheaper? */}
      <Card style={{marginBottom:18,padding:20}}>
        <h3 style={{fontSize:15,fontWeight:600,marginBottom:13}}>How are we so much cheaper?</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
          <div>
            <div style={{marginBottom:6}}><Globe size={22}/></div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>No data centers to build</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5}}>
              We use computers that already exist. No real estate, cooling, or power infrastructure to pay for.
            </div>
          </div>
          <div>
            <div style={{marginBottom:6}}><Handshake size={22}/></div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>10% fee, not 100%+ markup</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5}}>
              Providers set their own prices. We take a small cut. Hyperscalers add their own margin on top of everything.
            </div>
          </div>
          <div>
            <div style={{marginBottom:6}}><Recycle size={22}/></div>
            <div style={{fontSize:13,fontWeight:600,marginBottom:4}}>Using idle capacity</div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5}}>
              Gaming PCs sit idle most of the day. We put that capacity to work, which makes it nearly free to provide.
            </div>
          </div>
        </div>
      </Card>

      {/* CTA */}
      <Card style={{padding:24,background:"linear-gradient(135deg,rgba(0,212,168,.08),rgba(155,109,255,.08))",
        border:".5px solid rgba(0,212,168,.3)",textAlign:"center"}}>
        <h3 style={{fontSize:18,fontWeight:700,marginBottom:8}}>Ready to save?</h3>
        <p style={{fontSize:13,color:"var(--t1)",marginBottom:16,maxWidth:420,margin:"0 auto 16px"}}>
          Sign up takes 30 seconds. Your first $5 is on us — enough to test a workload at no cost.
        </p>
        <button onClick={()=>setTab("My Jobs")}
          style={{padding:"12px 24px",background:"var(--teal)",color:"#000",border:"none",
            borderRadius:"var(--r)",fontSize:14,fontWeight:600,cursor:"pointer"}}>
          <Sparkles size={15}/> Get started — free
        </button>
      </Card>

      {/* Trust signals */}
      <div style={{display:"flex",justifyContent:"center",gap:24,marginTop:24,
        flexWrap:"wrap",fontSize:11,color:"var(--t2)"}}>
 <span> SOC 2 in progress</span>
        <span>•</span>
 <span> Payments via Stripe</span>
        <span>•</span>
 <span> 60-80% less carbon than AWS</span>
        <span>•</span>
 <span> Open source</span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SIGNUP MODAL — Email/password account (no wallet needed)
// ═══════════════════════════════════════════════════════════════════════════════
const SignupModal = ({onClose, onSwitchToLogin}) => {
  const { showToast, backendOnline, login } = useApp();
  const [mode, setMode] = useState("signup"); // signup | login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [walletBusy, setWalletBusy] = useState(false);

  // Close on Escape
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      showToast("Email and password required", "error");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      showToast("Password should be at least 8 characters", "error");
      return;
    }
    setBusy(true);
    try {
      if (!backendOnline) {
        await new Promise(r => setTimeout(r, 800));
        showToast("Demo mode — sign in flow isn't connected. Start the backend to sign up.", "info");
        onClose();
        return;
      }
      const path = mode === "signup"?"/api/auth/signup":"/api/auth/login-email";
      const result = await api("POST", path, { email, password, ...(mode ==="signup" && { displayName: name }) });
      if (result.token) {
        // Persist token + refresh; context's effect will pick up the new user
        try { localStorage.setItem("decompute_token", result.token); } catch {}
        showToast(mode === "signup" ? `Welcome to Decompute, ${name || email}!` : "Welcome back!", "success");
        onClose();
        // Soft refresh via a custom event — AppProvider listens for this
        window.dispatchEvent(new CustomEvent("decompute-auth-changed"));
      }
    } catch (err) {
      showToast(err.message || "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:999,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        padding:24,width:"100%",maxWidth:420,maxHeight:"92vh",overflowY:"auto",
        animation:"modalIn .25s cubic-bezier(.4,0,.2,1) both"}}>

        {/* Header */}
        <div style={{textAlign:"center",marginBottom:18}}>
          <div style={{marginBottom:8}}><Globe size={32}/></div>
          <h2 style={{fontSize:20,fontWeight:700,letterSpacing:"-.02em",marginBottom:4}}>
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h2>
          <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.5}}>
            {mode === "signup" ? "Just an email and password — that's it." : "Sign in to continue."}
          </p>
        </div>

        {/* Form */}
        {mode === "signup" && (
          <Fld label="Your name (optional)" placeholder="Jane Doe"
            value={name} onChange={e=>setName(e.target.value)}/>
        )}

        <Fld label="Email" type="email" placeholder="you@example.com"
          value={email} onChange={e=>setEmail(e.target.value)}/>

        <div style={{marginBottom:14,position:"relative"}}>
          <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
            textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>Password</label>
          <input type={showPw ? "text":"password"}
            placeholder={mode === "signup"?"At least 8 characters":"••••••••"}
            value={password} onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&submit()}
            style={{width:"100%",padding:"10px 40px 10px 13px",fontSize:13,
              background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
          <button onClick={()=>setShowPw(s=>!s)} type="button"
            style={{position:"absolute",right:8,top:30,padding:"6px 10px",
              background:"transparent",border:"none",color:"var(--t2)",cursor:"pointer",fontSize:11,fontFamily:"var(--fm)"}}>
            {showPw ? "Hide" : "Show"}
          </button>
          {mode === "signup" && password && password.length < 8 && (
            <p style={{fontSize:11,color:"var(--amber)",marginTop:5}}>
              A few more characters for a stronger password
            </p>
          )}
        </div>

        <Btn full disabled={busy || !email.trim() || !password.trim() || (mode === "signup" && password.length < 8)}
          onClick={submit} style={{marginBottom:13}}>
          {busy ? <><Spin/> {mode === "signup"?"Creating account…":"Signing in…"}</>
                : (mode === "signup"?"Create account":"Sign in")}
        </Btn>

        {/* Divider */}
        <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0",color:"var(--t2)"}}>
          <div style={{flex:1,height:1,background:"var(--b)"}}/>
          <span style={{fontSize:10,fontFamily:"var(--fm)",letterSpacing:".1em"}}>OR</span>
          <div style={{flex:1,height:1,background:"var(--b)"}}/>
        </div>

        {/* Wallet alternative */}
        <button onClick={async()=>{
            setWalletBusy(true);
            const success = await login();
            setWalletBusy(false);
            if (success) onClose();
          }} disabled={walletBusy}
          style={{width:"100%",padding:"10px 14px",borderRadius:"var(--r)",fontSize:13,
            background:"var(--bg3)",color:"var(--t1)",border:".5px solid var(--b2)",
            cursor:walletBusy?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            transition:"border-color .15s",opacity:walletBusy?.6:1}}
          onMouseEnter={e=>!walletBusy&&(e.currentTarget.style.borderColor="var(--teal)")}
          onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b2)"}>
          {walletBusy ? <><Spin/> Connecting wallet…</> : <><span><Link size={16}/></span><span>Continue with crypto wallet</span></>}
        </button>

        {/* Switch mode */}
        <div style={{textAlign:"center",marginTop:18,fontSize:12,color:"var(--t2)"}}>
          {mode === "signup"?"Already have an account?":"New here?"}{" "}
          <button onClick={()=>setMode(m => m === "signup"?"login":"signup")}
            style={{background:"transparent",border:"none",color:"var(--teal)",
              fontSize:12,fontWeight:600,cursor:"pointer",padding:0,textDecoration:"underline"}}>
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </div>

        {/* Legal */}
        <p style={{fontSize:10,color:"var(--t2)",lineHeight:1.6,textAlign:"center",marginTop:16}}>
          By {mode === "signup" ? "creating an account" : "signing in"} you agree to our{" "}
          <span style={{textDecoration:"underline",cursor:"pointer"}}>Terms</span> and{" "}
          <span style={{textDecoration:"underline",cursor:"pointer"}}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  ADD FUNDS MODAL — Credit card top-up (Stripe-style)
// ═══════════════════════════════════════════════════════════════════════════════
const AddFundsModal = ({onClose}) => {
  const { showToast, user, backendOnline, pendingTopupId, clearPendingTopup } = useApp();
  const [amount, setAmount] = useState(50);
  const [confirmedAmount, setConfirmedAmount] = useState(null);
  // 1=amount, 2=pay, confirming=polling after a Stripe redirect back, 3=success, failed
  const [step, setStep] = useState(pendingTopupId ? "confirming" : 1);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(null);

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  // After a Stripe Checkout redirect back, poll until the webhook has
  // confirmed the payment — never trust the redirect itself as success.
  useEffect(() => {
    if (!pendingTopupId) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const res = await api("GET", `/api/payments/checkout-session/${pendingTopupId}`);
        if (cancelled) return;
        if (res.status === "succeeded") {
          setConfirmedAmount(res.amountUsd);
          setStep(3);
          clearPendingTopup();
          window.dispatchEvent(new CustomEvent("decompute-auth-changed"));
          return;
        }
        if (res.status === "failed" || res.status === "expired") {
          setStep("failed");
          clearPendingTopup();
          return;
        }
      } catch {
        // fall through to retry/timeout below
      }
      if (attempts >= 20) { setStep("failed"); clearPendingTopup(); return; }
      setTimeout(poll, 1500);
    };
    poll();
    return () => { cancelled = true; };
  }, [pendingTopupId, clearPendingTopup]);

  const quickAmounts = [25, 50, 100, 250, 500, 1000];

  const goToPay = () => {
    setIdempotencyKey(typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    setStep(2);
  };

  const submit = async () => {
    setBusy(true);
    if (backendOnline) {
      try {
        const res = await api("POST", "/api/payments/checkout-session", { amountUsd: amount }, { "Idempotency-Key": idempotencyKey });
        // Real Stripe: redirect to the hosted checkout page. The page will
        // navigate away here; balance only ever updates from the webhook.
        window.location.href = res.url;
        return;
      } catch (err) {
        showToast(err?.message || "Couldn't start checkout — try again", "error");
        setBusy(false);
        return;
      }
    }
    // Offline/demo-without-backend fallback — no real backend to charge.
    await new Promise(r => setTimeout(r, 1200));
    setBusy(false);
    setConfirmedAmount(amount);
    setStep(3);
    showToast(`Added $${amount} to your balance (demo)`, "success");
  };

  return (
    <div role="dialog" aria-modal="true"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:999,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        padding:24,width:"100%",maxWidth:440,maxHeight:"92vh",overflowY:"auto",
        animation:"modalIn .25s cubic-bezier(.4,0,.2,1) both"}}>

        {/* Step 1: Pick amount */}
        {step === 1 && (
          <>
            <div style={{marginBottom:16}}>
              <button onClick={onClose}
                style={{fontSize:13,color:"var(--t2)",padding:"4px 0",cursor:"pointer",
                  background:"transparent",border:"none"}}>← Cancel</button>
              <h2 style={{fontSize:20,fontWeight:700,letterSpacing:"-.02em",marginTop:8,marginBottom:5}}>
                Add funds to your balance
              </h2>
              <p style={{fontSize:13,color:"var(--t2)"}}>
                Pay by credit card. We convert it to USDC instantly.
              </p>
            </div>

            {/* Current balance */}
            <div style={{background:"var(--bg3)",border:".5px solid var(--b)",borderRadius:"var(--r)",
              padding:"11px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:"var(--t2)"}}>Current balance</span>
              <span style={{fontSize:15,fontFamily:"var(--fm)",fontWeight:600,color:"var(--teal)"}}>
                ${parseFloat(user?.balanceUsdc || 0).toFixed(2)}
              </span>
            </div>

            {/* Quick amounts */}
            <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
              textTransform:"uppercase",letterSpacing:".06em",marginBottom:8}}>How much?</label>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:11}}>
              {quickAmounts.map(a => (
                <button key={a} onClick={()=>setAmount(a)}
                  style={{padding:"11px 9px",borderRadius:"var(--r)",fontSize:13,fontWeight:600,
                    background:amount===a?"var(--td)":"var(--bg3)",
                    color:amount===a?"var(--teal)":"var(--t1)",
                    border:`.5px solid ${amount===a?"var(--teal)":"var(--b2)"}`,
                    cursor:"pointer",transition:"all .15s"}}>
                  ${a}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div style={{position:"relative",marginBottom:14}}>
              <span style={{position:"absolute",left:12,top:11,fontSize:15,color:"var(--t2)",fontFamily:"var(--fm)"}}>$</span>
              <input type="number" min="5" max="10000"
                value={amount} onChange={e=>setAmount(Math.max(5, parseInt(e.target.value)||5))}
                style={{width:"100%",padding:"10px 13px 10px 24px",fontSize:15,fontFamily:"var(--fm)",
                  background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:44}}/>
            </div>

            <Btn full onClick={goToPay} disabled={amount < 5}>
              Continue · ${amount}
            </Btn>

            {/* Security note */}
            <div style={{marginTop:14,padding:"9px 12px",background:"var(--bg3)",borderRadius:"var(--r)",
              border:".5px solid var(--b)",fontSize:11,color:"var(--t2)",lineHeight:1.5,
              display:"flex",alignItems:"center",gap:8}}>
              <span><Lock size={14}/></span>
              <span>Payments processed securely. We never see your card. Powered by Stripe.</span>
            </div>
          </>
        )}

        {/* Step 2: Pay */}
        {step === 2 && (
          <>
            <div style={{marginBottom:14}}>
              <button onClick={()=>setStep(1)}
                style={{fontSize:13,color:"var(--t2)",padding:"4px 0",cursor:"pointer",
                  background:"transparent",border:"none"}}>← Back</button>
              <h2 style={{fontSize:20,fontWeight:700,letterSpacing:"-.02em",marginTop:8,marginBottom:5}}>
                How would you like to pay?
              </h2>
              <p style={{fontSize:13,color:"var(--t2)"}}>
                Adding <strong style={{color:"var(--t0)"}}>${amount}</strong> to your balance.
              </p>
            </div>

            {/* Payment method — card is the only real path right now */}
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <div style={{flex:1,padding:"12px",borderRadius:"var(--r)",
                  background:"var(--td)",border:".5px solid var(--teal)",
                  color:"var(--teal)",textAlign:"center"}}>
                <div style={{marginBottom:4}}><CreditCard size={20}/></div>
                <div style={{fontSize:12,fontWeight:600}}>Card</div>
                <div style={{fontSize:10,color:"var(--t2)",marginTop:2}}>Visa, Mastercard, Amex</div>
              </div>
              <div title="Crypto top-ups need real on-chain verification we haven't built yet"
                style={{flex:1,padding:"12px",borderRadius:"var(--r)",cursor:"not-allowed",
                  background:"var(--bg3)",border:".5px solid var(--b2)",
                  color:"var(--t2)",textAlign:"center",opacity:.55}}>
                <div style={{marginBottom:4}}><Link size={20}/></div>
                <div style={{fontSize:12,fontWeight:600}}>Crypto</div>
                <div style={{fontSize:10,marginTop:2}}>Coming soon</div>
              </div>
            </div>

            {/* Total */}
            <div style={{background:"var(--bg3)",border:".5px solid var(--b)",borderRadius:"var(--r)",
              padding:"12px 14px",margin:"14px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:12,color:"var(--t2)"}}>You're paying</div>
                <div style={{fontSize:18,fontFamily:"var(--fm)",fontWeight:600,color:"var(--teal)"}}>${amount}.00</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"var(--t2)"}}>You'll receive</div>
                <div style={{fontSize:14,fontFamily:"var(--fm)",color:"var(--t1)"}}>${amount} USDC</div>
              </div>
            </div>

            <Btn full disabled={busy} onClick={submit}>
 {busy? <><Spin/> Redirecting to Stripe…</> : ` Pay $${amount} with Stripe`}
            </Btn>

            <p style={{fontSize:10,color:"var(--t2)",textAlign:"center",marginTop:11,lineHeight:1.5}}>
              You'll be taken to Stripe's secure checkout. We never see or store your card number.
            </p>
          </>
        )}

        {/* Confirming: back from Stripe, waiting on the webhook to confirm */}
        {step === "confirming" && (
          <div style={{textAlign:"center",padding:"32px 12px"}}>
            <Spin/>
            <h2 style={{fontSize:18,fontWeight:700,marginTop:16,marginBottom:6}}>Confirming your payment…</h2>
            <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.6}}>
              This usually takes a few seconds.
            </p>
          </div>
        )}

        {/* Failed: payment didn't succeed, or confirmation timed out */}
        {step === "failed" && (
          <div style={{textAlign:"center",padding:"24px 12px"}}>
            <div style={{width:64,height:64,borderRadius:"50%",background:"var(--rd)",
              border:"1px solid rgba(239,68,68,.4)",margin:"0 auto 16px",display:"flex",
              alignItems:"center",justifyContent:"center",fontSize:28}}>
 
            </div>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:7}}>Payment not confirmed</h2>
            <p style={{fontSize:13,color:"var(--t2)",marginBottom:20,lineHeight:1.6}}>
              Your card wasn't charged, or we couldn't confirm it in time. No funds were added.
            </p>
            <Btn full onClick={()=>setStep(1)}>Try again</Btn>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div style={{textAlign:"center",padding:"24px 12px"}}>
            <div style={{width:64,height:64,borderRadius:"50%",background:"var(--td)",
              border:"1px solid rgba(0,212,168,.4)",margin:"0 auto 16px",display:"flex",
              alignItems:"center",justifyContent:"center",fontSize:32,
              animation:"modalIn .4s cubic-bezier(.4,0,.2,1) both"}}>
 
            </div>
            <h2 style={{fontSize:20,fontWeight:700,marginBottom:7}}>Funds added!</h2>
            <p style={{fontSize:13,color:"var(--t2)",marginBottom:20,lineHeight:1.6}}>
              <strong style={{color:"var(--teal)"}}>${confirmedAmount ?? amount}</strong> is now in your balance.
              <br/>You're ready to run jobs.
            </p>
            <Btn full onClick={onClose}>Done</Btn>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  LIVE JOB VIEW — Real-time streaming logs + GPU charts
// ═══════════════════════════════════════════════════════════════════════════════

// Simulated log lines for demo mode (cycles through these)
const DEMO_LOGS = [
  {t:"INFO",  msg:"Initializing CUDA runtime..."},
  {t:"INFO",  msg:"Detected 1× NVIDIA H100 SXM (80GB VRAM)"},
  {t:"INFO",  msg:"Loading model weights from /workspace/checkpoint.bin"},
  {t:"INFO",  msg:"Model loaded — 7.2B parameters"},
  {t:"INFO",  msg:"Starting training run..."},
  {t:"DEBUG", msg:"Optimizer: AdamW (lr=3e-5, beta1=0.9, beta2=0.999)"},
  {t:"INFO",  msg:"Epoch 1/3 — step 12/450 — loss: 2.847 — lr: 2.95e-5"},
  {t:"INFO",  msg:"Epoch 1/3 — step 24/450 — loss: 2.612 — lr: 2.92e-5"},
  {t:"INFO",  msg:"Epoch 1/3 — step 36/450 — loss: 2.401 — lr: 2.89e-5"},
  {t:"INFO",  msg:"Checkpoint saved to /workspace/checkpoint_step_36.bin"},
  {t:"INFO",  msg:"Epoch 1/3 — step 48/450 — loss: 2.198 — lr: 2.85e-5"},
  {t:"INFO",  msg:"Epoch 1/3 — step 60/450 — loss: 2.014 — lr: 2.82e-5"},
  {t:"INFO",  msg:"GPU memory: 71.2 GB / 80 GB (89% used)"},
  {t:"INFO",  msg:"Epoch 1/3 — step 72/450 — loss: 1.847 — lr: 2.79e-5"},
  {t:"INFO",  msg:"Epoch 1/3 — step 84/450 — loss: 1.694 — lr: 2.76e-5"},
  {t:"INFO",  msg:"Throughput: 142 tokens/sec/GPU"},
  {t:"INFO",  msg:"Epoch 1/3 — step 96/450 — loss: 1.555 — lr: 2.72e-5"},
  {t:"INFO",  msg:"Epoch 1/3 — step 108/450 — loss: 1.428 — lr: 2.69e-5"},
];

const LiveJobView = ({job, onClose}) => {
  const { backendOnline, cancelJob, submitJob, openLiveJob } = useApp();
  const [retrying, setRetrying] = useState(false);
  // A job can be opened the instant it's submitted, while still "pending"
  // (queued, not yet claimed by the node's agent) — the `job` prop is a
  // one-time snapshot from that moment, so without re-fetching it this
  // view would never notice the pending→running→completed transitions and
  // would just sit frozen. displayJob is what actually renders below.
  const [displayJob, setDisplayJob] = useState(job);
  const [logs, setLogs] = useState([]);
  const [metrics, setMetrics] = useState([]); // [{ts, gpu, vram}]
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [artifactUrl, setArtifactUrl] = useState(null);
  const [artifactType, setArtifactType] = useState(null);
  const logEndRef = useRef(null);
  const logContainerRef = useRef(null);
  const tickRef = useRef(0);

  // Fetch the job's output file once it's done producing one — revoke the
  // blob: URL on unmount/job-change so it doesn't leak.
  useEffect(() => {
    if (!displayJob.hasArtifact) return;
    let url;
    fetchArtifactUrl(displayJob.id).then(({url: u, contentType}) => {
      url = u; setArtifactUrl(u); setArtifactType(contentType);
    }).catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [displayJob.id, displayJob.hasArtifact]);

  // Close on Escape
  useEffect(() => {
    const h = e => { if (e.key === "Escape" && !confirmCancel) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, confirmCancel]);

  // Lock body scroll while open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  // Poll for live updates (every 2 seconds in demo, every 3 in real mode).
  // Runs while pending or running; stops once the job reaches a terminal
  // state — "completed" covers done/failed/cancelled, see jobFromApi.
  useEffect(() => {
    if (displayJob.status === "completed") return;
    const interval = backendOnline ? 3000 : 1800;

    const tick = async () => {
      if (backendOnline) {
        try {
          const [jobRes, hbRes, logRes] = await Promise.all([
            api("GET", `/api/jobs/${job.id}`),
            api("GET", `/api/jobs/${job.id}/heartbeats`),
            api("GET", `/api/jobs/${job.id}/logs`),
          ]);
          if (jobRes?.data) setDisplayJob(jobFromApi(jobRes.data));
          if (hbRes?.data?.length) {
            const recent = hbRes.data.slice(-60).map(h => ({
              ts: new Date(h.recorded_at).getTime(),
              gpu: parseFloat(h.gpu_usage_pct || 0),
              vram: parseFloat(h.vram_used_gb || 0),
            }));
            setMetrics(recent);
          }
          if (logRes?.data) {
            setLogs(logRes.data.map(l => ({
              id: l.id,
              ts: new Date(l.ts).toLocaleTimeString(),
              t: l.level,
              msg: l.msg,
            })));
          }
          setLastUpdate(Date.now());
        } catch {}
      } else {
        // Demo mode: simulated rolling data + log lines
        tickRef.current++;
        setMetrics(m => {
          const newMetric = {
            ts: Date.now(),
            gpu: 85 + Math.sin(tickRef.current * 0.3) * 10 + Math.random() * 4,
            vram: 70 + Math.sin(tickRef.current * 0.2) * 3 + Math.random() * 1.5,
          };
          return [...m, newMetric].slice(-60);
        });
        setLogs(l => {
          const next = [...l];
          const logIdx = tickRef.current % DEMO_LOGS.length;
          next.push({
            ...DEMO_LOGS[logIdx],
            ts: new Date().toLocaleTimeString(),
            id: tickRef.current,
          });
          return next.slice(-200); // keep last 200
        });
        setLastUpdate(Date.now());
      }
    };

    tick(); // immediate first tick
    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [job.id, displayJob.status, backendOnline]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [logs, autoScroll]);

  // Track user scroll to disable auto-scroll when they scroll up
  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (atBottom !== autoScroll) setAutoScroll(atBottom);
  };

  // Current metrics
  const current = metrics.length > 0 ? metrics[metrics.length - 1] : { gpu: 0, vram: 0 };
  const isLive = Date.now() - lastUpdate < 8000;
  const ago = Math.floor((Date.now() - lastUpdate) / 1000);

  // Sparkline path for GPU usage
  const sparkPath = useMemo(() => {
    if (metrics.length < 2) return "";
    const w = 100, h = 28;
    return metrics.map((m, i) => {
      const x = (i / (metrics.length - 1)) * w;
      const y = h - (Math.min(100, m.gpu) / 100) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [metrics]);

  const handleCancelClick = async () => {
    if (!confirmCancel) { setConfirmCancel(true); return; }
    await cancelJob(job.id);
    onClose();
  };

  // Resubmits with the exact spec this job was created with — the job row
  // (and jobFromApi) carries that along specifically so a renter never has
  // to re-enter it, whether they're retrying by hand or the job just got
  // refunded by the stuck-job reaper for going dark on its node.
  const retry = async () => {
    setRetrying(true);
    const ev = displayJob.envVars || {};
    // A failed batch's envVars still holds the original, un-flattened
    // request (see buildEnvVarsAndUnits) — re-flatten it the same way so
    // retrying a batch fans back out across nodes instead of collapsing
    // into one ordinary job.
    let units = null;
    if (ev.DECOMPUTE_PROMPTS && ev.DECOMPUTE_COUNT_PER_PROMPT) {
      const lines = String(ev.DECOMPUTE_PROMPTS).split("\n").map(s => s.trim()).filter(Boolean);
      const countPerPrompt = Math.max(1, Math.min(16, parseInt(ev.DECOMPUTE_COUNT_PER_PROMPT, 10) || 1));
      const flat = [];
      for (const line of lines) {
        for (let i = 0; i < countPerPrompt; i++) flat.push({ DECOMPUTE_PROMPTS: line, DECOMPUTE_COUNT_PER_PROMPT: "1" });
      }
      if (flat.length > 1) units = flat;
    }
    const newJob = await submitJob({
      workloadId: displayJob.workloadId,
      executionSource: "community",
      maxRuntimeHours: displayJob.maxRuntimeHours,
      name: displayJob.name,
      envVars: ev,
      ...(units ? { units } : {}),
    });
    setRetrying(false);
    if (newJob) openLiveJob(newJob);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Live job view"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",zIndex:998,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>

      <div style={{background:"var(--bg1)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        width:"100%",maxWidth:920,maxHeight:"92vh",display:"flex",flexDirection:"column",
        animation:"modalIn .3s cubic-bezier(.4,0,.2,1) both",overflow:"hidden"}}>

        {/* Header */}
        <div style={{padding:"15px 22px",borderBottom:".5px solid var(--b2)",
          background:"linear-gradient(180deg,rgba(0,212,168,.06),transparent)",
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:240}}>
            <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:4}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,
                fontSize:10,fontFamily:"var(--fm)",color:isLive?"var(--teal)":"var(--amber)",
                padding:"3px 9px",borderRadius:4,
                background:isLive?"var(--td)":"var(--ad)",
                border:`.5px solid ${isLive?"rgba(0,212,168,.4)":"rgba(245,166,35,.4)"}`}}>
                <span style={{width:6,height:6,borderRadius:"50%",
                  background:isLive?"var(--teal)":"var(--amber)",
                  animation:isLive?"pulse 1.4s infinite":"none"}}/>
                {isLive ? "LIVE" : `${ago}s ago`}
              </span>
              <h3 style={{fontSize:16,fontWeight:700,letterSpacing:"-.01em",margin:0}}>{displayJob.name}</h3>
            </div>
            <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)"}}>
              {displayJob.status === "queued"
                ? <>Waiting for {displayJob.node} to pick this up</>
                : <>Running on {displayJob.node} · started {displayJob.elapsed} ago</>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{color:"var(--t2)",fontSize:20,width:36,height:36,
              borderRadius:8,background:"var(--bg3)",border:".5px solid var(--b2)",
              cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
 
          </button>
        </div>

        {/* Batch children — each one ran as a complete, independent job on
            its own node (see the long thread on why this is the only safe
            way to "split across the network"): no shared progress bar can
            represent that honestly, so each gets its own dot and status. */}
        {displayJob.isBatch && displayJob.children && (
          <div style={{padding:"12px 22px",borderBottom:".5px solid var(--b)"}}>
            <div style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",letterSpacing:".06em",
              textTransform:"uppercase",marginBottom:8}}>
              {displayJob.childCount} node{displayJob.childCount===1?"":"s"} working on this
            </div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {displayJob.children.map(c => {
                const color = c.rawStatus==="done" ? "var(--teal)"
                  : c.rawStatus==="running" ? "var(--blue)"
                  : c.rawStatus==="pending" ? "var(--amber)"
                  : "var(--red)";
                return (
                  <div key={c.id} title={`${c.node} — ${c.rawStatus}`}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",
                      background:"var(--bg3)",border:`.5px solid ${color}`,borderRadius:6,fontSize:11}}>
                    <span style={{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0,
                      animation:c.rawStatus==="running"?"pulse 1.4s infinite":"none"}}/>
                    <span style={{color:"var(--t1)",fontFamily:"var(--fm)"}}>{c.node}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Failure banner — only for a genuine failure (rawStatus), not a
            normal cancel/done, which "completed" alone can't distinguish */}
        {displayJob.rawStatus === "failed" && (
          <div style={{padding:"12px 22px",borderBottom:".5px solid var(--b)",
            background:"var(--rd)",display:"flex",alignItems:"center",justifyContent:"space-between",
            gap:12,flexWrap:"wrap"}}>
            <div style={{fontSize:12,color:"var(--t1)",lineHeight:1.5}}>
              <strong style={{color:"var(--red)"}}>Failed — fully refunded.</strong>{" "}
              {displayJob.aiInsight}
            </div>
            <Btn disabled={retrying} onClick={retry} style={{fontSize:12,padding:"7px 14px",flexShrink:0}}>
              {retrying ? <><Spin/> Retrying…</> : "Retry with same settings"}
            </Btn>
          </div>
        )}

        {/* Live metrics row */}
        <div style={{padding:"14px 22px",borderBottom:".5px solid var(--b)",
          display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14}}>

          {/* GPU Usage with sparkline */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase"}}>GPU</span>
              <span style={{fontSize:18,fontFamily:"var(--fm)",fontWeight:500,color:current.gpu < 60 ? "var(--amber)" : "var(--teal)"}}>
                {Math.round(current.gpu)}%
              </span>
            </div>
            <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{width:"100%",height:32,display:"block"}}>
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={current.gpu < 60 ?"var(--amber)":"var(--teal)"} stopOpacity=".4"/>
                  <stop offset="100%" stopColor={current.gpu < 60 ?"var(--amber)":"var(--teal)"} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {sparkPath && (
                <>
                  <path d={`${sparkPath} L100,28 L0,28 Z`} fill="url(#sparkGrad)" opacity=".5"/>
                  <path d={sparkPath} fill="none" stroke={current.gpu < 60 ? "var(--amber)" : "var(--teal)"} strokeWidth="1.2"/>
                </>
              )}
            </svg>
          </div>

          {/* VRAM */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase"}}>Memory</span>
              <span style={{fontSize:18,fontFamily:"var(--fm)",fontWeight:500,color:"var(--blue)"}}>
                {current.vram.toFixed(1)} GB
              </span>
            </div>
            <Bar v={Math.min(100, (current.vram / displayJob.vramGb) * 100)} c="var(--blue)" h={6}/>
            <div style={{fontSize:9,color:"var(--t2)",fontFamily:"var(--fm)",marginTop:4}}>of {displayJob.vramGb} GB</div>
          </div>

          {/* Cost so far */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase"}}>Cost so far</span>
              <span style={{fontSize:18,fontFamily:"var(--fm)",fontWeight:500,color:"var(--amber)"}}>
                ${displayJob.cost.toFixed(2)}
              </span>
            </div>
            <div style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)",marginTop:6}}>
              ~${(displayJob.cost * 60 / Math.max(1, parseInt(displayJob.elapsed) || 1)).toFixed(2)}/hour
            </div>
          </div>

          {/* Progress */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
              <span style={{fontSize:10,fontFamily:"var(--fm)",color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase"}}>Progress</span>
              <span style={{fontSize:18,fontFamily:"var(--fm)",fontWeight:500,color:"var(--purple)"}}>
                {displayJob.prog}%
              </span>
            </div>
            <Bar v={displayJob.prog} c="var(--purple)" h={6}/>
            <div style={{fontSize:9,color:"var(--t2)",fontFamily:"var(--fm)",marginTop:4}}>
              ETA: {displayJob.eta}
            </div>
          </div>
        </div>

        {/* Output file, once the job's produced one — a single image previews
            inline, a multi-image zip (several prompts/count_per_prompt > 1)
            is download-only since there's no single image to show. */}
        {artifactUrl && (
          <div style={{padding:"16px 22px",borderBottom:".5px solid var(--b)",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
            {artifactType?.startsWith("image/") ? (
              <>
                <img src={artifactUrl} alt="Job output"
                  style={{maxWidth:"100%",maxHeight:340,borderRadius:"var(--r)",border:".5px solid var(--b2)"}}/>
                <a href={artifactUrl} download={`${displayJob.name || "output"}.png`}
                  style={{fontSize:11,fontFamily:"var(--fm)",color:"var(--teal)",textDecoration:"none"}}>
                  ↓ Download image
                </a>
              </>
            ) : (
              <a href={artifactUrl} download={`${displayJob.name || "output"}.zip`}
                style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",fontSize:12,
                  fontFamily:"var(--fm)",color:"var(--teal)",textDecoration:"none",
                  background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:"var(--r)"}}>
                <Download size={14}/> Download images (.zip)
              </a>
            )}
          </div>
        )}

        {/* Logs */}
        <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column"}}>
          <div style={{padding:"10px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:11,fontFamily:"var(--fm)",color:"var(--t2)",letterSpacing:".06em",textTransform:"uppercase"}}>
              Live Logs
            </div>
            <div style={{display:"flex",gap:7,alignItems:"center"}}>
              <button onClick={()=>setAutoScroll(a=>!a)}
                style={{fontSize:10,fontFamily:"var(--fm)",padding:"3px 9px",borderRadius:4,
                  background:autoScroll?"var(--td)":"var(--bg3)",
                  color:autoScroll?"var(--teal)":"var(--t2)",
                  border:`.5px solid ${autoScroll?"rgba(0,212,168,.3)":"var(--b)"}`,cursor:"pointer"}}>
 {autoScroll? "Auto-scroll" : "○ Auto-scroll"}
              </button>
              <span style={{fontSize:10,color:"var(--t2)",fontFamily:"var(--fm)"}}>{logs.length} lines</span>
            </div>
          </div>

          <div ref={logContainerRef} onScroll={handleScroll}
            style={{flex:1,minHeight:200,maxHeight:340,overflowY:"auto",overflowX:"hidden",
              background:"#020608",borderTop:".5px solid var(--b)",borderBottom:".5px solid var(--b)",
              padding:"10px 22px",fontFamily:"var(--fm)",fontSize:11.5,lineHeight:1.65}}>
            {logs.length === 0 ? (
              <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:200,gap:10,color:"var(--t2)"}}>
                <Spin/> <span>Connecting to live stream...</span>
              </div>
            ) : (
              logs.map((line) => (
                <div key={line.id} style={{display:"flex",gap:10,color:"var(--t1)",animation:"fadeUp .2s ease both"}}>
                  <span style={{color:"var(--t2)",flexShrink:0,minWidth:62}}>{line.ts}</span>
                  <span style={{color: line.t==="ERROR"?"var(--red)":line.t==="WARN"?"var(--amber)":line.t==="DEBUG"?"var(--purple)":"var(--teal)",
                    flexShrink:0,minWidth:48,fontWeight:600}}>{line.t}</span>
                  <span style={{wordBreak:"break-word"}}>{line.msg}</span>
                </div>
              ))
            )}
            <div ref={logEndRef}/>
          </div>
        </div>

        {/* Bottom action bar */}
        <div style={{padding:"12px 22px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.5,flex:1,minWidth:200}}>
            {displayJob.aiInsight}
          </div>
          <div style={{display:"flex",gap:8}}>
            {!confirmCancel ? (
              <button onClick={handleCancelClick}
                style={{padding:"8px 14px",borderRadius:6,fontSize:12,fontWeight:600,
                  background:"var(--bg3)",color:"var(--red)",border:".5px solid rgba(255,77,106,.3)",
                  cursor:"pointer"}}>
                Stop job
              </button>
            ) : (
              <>
                <button onClick={()=>setConfirmCancel(false)}
                  style={{padding:"8px 14px",borderRadius:6,fontSize:12,
                    background:"var(--bg3)",color:"var(--t1)",border:".5px solid var(--b)",cursor:"pointer"}}>
                  Keep running
                </button>
                <button onClick={handleCancelClick}
                  style={{padding:"8px 14px",borderRadius:6,fontSize:12,fontWeight:600,
                    background:"var(--red)",color:"#fff",border:"none",cursor:"pointer"}}>
                  Yes, stop it
                </button>
              </>
            )}
            <Btn onClick={onClose} style={{fontSize:12,padding:"8px 14px"}}>Done</Btn>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  NEW JOB MODAL — 3-step wizard with templates, file upload, notifications
// ═══════════════════════════════════════════════════════════════════════════════
const NewJobModal = ({onClose, presetNodeId, presetNodeName}) => {
  const { submitJob, requestNotifications, notifyPermission, openLiveJob, backendOnline, availableWorkloads, showToast } = useApp();
  const [step, setStep] = useState(1);
  const [template, setTemplate] = useState(null);
  const [values, setValues] = useState({});
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState({}); // key -> File[]

  // Close on Escape
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const pickTemplate = (t) => {
    setTemplate(t);
    setName(t.custom ? "" : t.name);
    // Pre-fill defaults
    const defaults = {};
    if (t.inputs) t.inputs.forEach(inp => { if (inp.default !== undefined) defaults[inp.key] = inp.default; });
    setValues(defaults);
    setStep(2);
  };

  const handleFile = (key, fileList) => {
    setFiles(f => ({...f, [key]: Array.from(fileList || [])}));
    setValues(v => ({...v, [key]: fileList && fileList[0] ? fileList[0].name : ""}));
  };

  const launch = async () => {
    if (!template) return;
    setBusy(true);
    const jobName = name.trim() || template.name;

    let inputIds = [];
    try {
      for (const file of Object.values(files).flat()) inputIds.push((await uploadJobInput(file)).id);
    } catch (err) {
      showToast(err.message || "Input upload failed", "error");
      setBusy(false);
      return;
    }

    // For custom template, use raw form. For others, build from template.
    // presetNodeId pins the job to one specific node (arrived here via a
    // marketplace listing's "Rent" button) instead of leaving nodeId unset
    // for the backend to apply community fair-share matching.
    const spec = (() => {
      const { envVars, units } = buildEnvVarsAndUnits(template, values);
      return {
        name: jobName,
        workloadId: template.id,
        executionSource: "community",
        maxRuntimeHours: parseFloat(values.maxRuntimeHours) || template.maxRuntimeHours,
        needsSecurity: !!values.needsSecurity,
        envVars,
        ...(inputIds.length ? { inputIds } : {}),
        ...(units ? { units } : {}),
        // A batch fans out across many nodes by design — pinning it to one
        // preset node would defeat that, so a marketplace "Rent" click only
        // pins nodeId for a normal, non-decomposable job.
        ...(presetNodeId && !units ? { nodeId: presetNodeId } : {}),
      };
    })();

    // Real file upload would happen here — for now, files are tracked client-side
    // and would be uploaded to R2/S3 + the signed URL passed via envVars
    const result = await submitJob(spec);
    setBusy(false);
    if (result) {
      // Request notification permission if they haven't granted yet
      if (notifyPermission === "default") requestNotifications();
      onClose();
      openLiveJob(result);
    }
  };

  // ─── STEP 1: Pick a template ─────────────────────────────────────────────────
  const Step1 = () => (
    <>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:5}}>Step 1 of 3</div>
        <h3 style={{fontSize:18,fontWeight:700,marginBottom:5}}>What would you like to do?</h3>
        <p style={{fontSize:13,color:"var(--t2)"}}>Pick a security-reviewed workload to get started.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:14}}>
        {JOB_CATALOG.filter(t => t.id !== "custom" && (!backendOnline || availableWorkloads.includes(t.id))).map(t => (
          <button key={t.id} onClick={()=>pickTemplate(t)}
            className="lift"
            style={{textAlign:"left",padding:"13px 14px",background:"var(--bg3)",
              border:".5px solid var(--b2)",borderRadius:"var(--r)",cursor:"pointer",
              display:"flex",flexDirection:"column",gap:5,minHeight:120,position:"relative",
              transition:"all .2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--teal)";e.currentTarget.style.background="var(--td)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--b2)";e.currentTarget.style.background="var(--bg3)";}}>
            <div style={{lineHeight:1}}><t.icon size={24}/></div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--t0)",lineHeight:1.3}}>{t.name}</div>
            <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.4,marginTop:"auto"}}>{t.short}</div>
            {t.popularity >= 85 && (
              <span style={{position:"absolute",top:8,right:8,fontSize:9,fontFamily:"var(--fm)",
                padding:"2px 6px",borderRadius:3,background:"var(--ad)",color:"var(--amber)"}}>
                Popular
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );

  // ─── STEP 2: Configure ──────────────────────────────────────────────────────
  const Step2 = () => {
    const t = template;
    return (
      <>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:5}}>Step 2 of 3</div>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:6}}>
            <span><t.icon size={22}/></span>
            <h3 style={{fontSize:17,fontWeight:700}}>{t.name}</h3>
          </div>
          <p style={{fontSize:13,color:"var(--t2)",lineHeight:1.55}}>{t.description}</p>
        </div>

        <Fld label="Give this job a nickname" placeholder={t.name}
          value={name} onChange={e=>setName(e.target.value)}
          hint="So you can find it later in your dashboard"/>

        {/* Custom: free-form Docker fields */}
        {t.custom && (
          <>
            <Fld label="Docker image" placeholder="e.g. ghcr.io/myorg/myapp:latest"
              value={values.dockerImage || ""} onChange={e=>setValues(v=>({...v,dockerImage:e.target.value}))}
              hint="The packaged app to run. Like an .exe but for the cloud."/>
            <div className="form-2">
              <Fld label="GPUs needed" type="number"
                value={values.gpusNeeded || 1} onChange={e=>setValues(v=>({...v,gpusNeeded:e.target.value}))}/>
              <Fld label="Memory needed (GB)" type="number"
                value={values.minVramGb || 8} onChange={e=>setValues(v=>({...v,minVramGb:e.target.value}))}/>
            </div>
          </>
        )}

        {/* Template inputs */}
        {t.inputs?.map(inp => (
          <div key={inp.key} style={{marginBottom:13}}>
            <label style={{display:"block",fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",
              textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>
              {inp.label}{inp.required && <span style={{color:"var(--amber)",marginLeft:4}}>*</span>}
            </label>

            {inp.type === "select" && (
              <select value={values[inp.key] || inp.default || ""}
                onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                  border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}>
                {inp.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}

            {inp.type === "textarea" && (
              <textarea value={values[inp.key] || ""} placeholder={inp.placeholder}
                onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                  border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:80,
                  fontFamily:"var(--fm)",resize:"vertical",lineHeight:1.5}}/>
            )}

            {inp.type === "number" && (
              <input type="number" value={values[inp.key] || ""} min={inp.min} max={inp.max}
                placeholder={String(inp.default)}
                onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                  border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
            )}

            {inp.type === "password" && (
              <input type="password" value={values[inp.key] || ""} placeholder={inp.placeholder}
                onChange={e=>setValues(v=>({...v,[inp.key]:e.target.value}))}
                style={{width:"100%",padding:"10px 13px",fontSize:13,background:"var(--bg3)",
                  border:".5px solid var(--b2)",borderRadius:"var(--r)",minHeight:42}}/>
            )}

            {inp.type === "toggle" && (
              <div onClick={()=>setValues(v=>({...v,[inp.key]:!v[inp.key]}))}
                style={{display:"flex",alignItems:"center",gap:9,padding:"9px 12px",
                  background:"var(--bg3)",borderRadius:"var(--r)",cursor:"pointer",
                  border:`.5px solid ${values[inp.key]?"rgba(0,212,168,.35)":"var(--b)"}`}}>
                <div style={{width:36,height:20,borderRadius:10,position:"relative",flexShrink:0,
                  background:values[inp.key]?"var(--teal)":"var(--bg2)",
                  border:`.5px solid ${values[inp.key]?"var(--teal)":"var(--b2)"}`,transition:"background .2s"}}>
                  <div style={{position:"absolute",top:2,left:values[inp.key]?18:2,width:16,height:16,
                    borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{fontSize:13}}>{values[inp.key] ? "On" : "Off"}</span>
              </div>
            )}

            {inp.type === "file" && <FileUpload inp={inp} value={values[inp.key]} files={files[inp.key]} onChange={fl=>handleFile(inp.key, fl)}/>}

            {inp.hint && (
              <p style={{fontSize:11,color:"var(--t2)",marginTop:5,lineHeight:1.5}}>{inp.hint}</p>
            )}
          </div>
        ))}
      </>
    );
  };

  // ─── STEP 3: Review & launch ────────────────────────────────────────────────
  const Step3 = () => {
    const t = template;
    const inputSummary = (t.inputs || []).map(inp => {
      const v = values[inp.key];
      if (!v && inp.type !== "toggle") return null;
      let displayVal = v;
      if (inp.type === "select") {
        const opt = inp.options?.find(o => o.value === v);
        if (opt) displayVal = opt.label;
      }
      if (inp.type === "password") displayVal ="••••••••";
      if (inp.type === "toggle") displayVal = v ?"Yes":"No";
      if (typeof displayVal === "string"&& displayVal.length > 50) displayVal = displayVal.slice(0, 47) +"…";
      return { label: inp.label, value: String(displayVal) };
    }).filter(Boolean);

    return (
      <>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:"var(--t2)",fontFamily:"var(--fm)",letterSpacing:".06em",textTransform:"uppercase",marginBottom:5}}>Step 3 of 3</div>
          <h3 style={{fontSize:17,fontWeight:700,marginBottom:5}}>Ready to go?</h3>
          <p style={{fontSize:13,color:"var(--t2)"}}>Quick check before we start.</p>
        </div>

        <div style={{background:"var(--bg3)",border:".5px solid var(--b2)",borderRadius:"var(--r)",
          padding:"14px 16px",marginBottom:13}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,paddingBottom:10,borderBottom:".5px solid var(--b)"}}>
            <span><t.icon size={22}/></span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600}}>{name.trim() || t.name}</div>
              <div style={{fontSize:11,color:"var(--t2)"}}>{t.short || "Custom job"}</div>
            </div>
          </div>

          {presetNodeId && (
            <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"5px 0",fontSize:12}}>
              <span style={{color:"var(--t2)"}}>Running on</span>
              <span style={{color:"var(--teal)",fontFamily:"var(--fm)",textAlign:"right",maxWidth:"60%"}}>{presetNodeName || presetNodeId}</span>
            </div>
          )}
          {!presetNodeId && (
            <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:"5px 0",fontSize:12}}>
              <span style={{color:"var(--t2)"}}>Execution source</span>
              <span style={{color:"var(--teal)",fontFamily:"var(--fm)",textAlign:"right"}}>Community network only</span>
            </div>
          )}
          {inputSummary.map(s => (
            <div key={s.label} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"5px 0",fontSize:12}}>
              <span style={{color:"var(--t2)"}}>{s.label}</span>
              <span style={{color:"var(--t0)",fontFamily:"var(--fm)",textAlign:"right",maxWidth:"60%"}}>{s.value}</span>
            </div>
          ))}

          {t.estimatedCost && (
            <div style={{marginTop:10,paddingTop:10,borderTop:".5px solid var(--b)",
              display:"flex",justifyContent:"space-between",gap:12}}>
              <div style={{fontSize:12,color:"var(--t2)"}}>Estimated cost</div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--amber)",fontFamily:"var(--fm)"}}>{t.estimatedCost}</div>
            </div>
          )}
          {t.estimatedTime && (
            <div style={{display:"flex",justifyContent:"space-between",gap:12}}>
              <div style={{fontSize:12,color:"var(--t2)"}}>Estimated time</div>
              <div style={{fontSize:13,fontWeight:600,color:"var(--teal)",fontFamily:"var(--fm)"}}>{t.estimatedTime}</div>
            </div>
          )}
        </div>

        {/* Notification opt-in */}
        {notifyPermission === "default" && (
          <div style={{background:"var(--pd)",border:".5px solid rgba(155,109,255,.3)",borderRadius:"var(--r)",
            padding:"11px 13px",marginBottom:13,display:"flex",alignItems:"center",gap:10}}>
            <span><Bell size={20}/></span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:600,color:"var(--purple)"}}>Get notified when it's done</div>
              <div style={{fontSize:11,color:"var(--t2)",lineHeight:1.4}}>We'll ping your browser the moment your job finishes. No spam, ever.</div>
            </div>
            <button onClick={requestNotifications}
              style={{padding:"6px 12px",borderRadius:6,fontSize:11,fontWeight:600,background:"var(--purple)",color:"#fff",border:"none",cursor:"pointer"}}>
              Enable
            </button>
          </div>
        )}

        {notifyPermission === "granted" && (
          <div style={{background:"var(--td)",border:".5px solid rgba(0,212,168,.3)",borderRadius:"var(--r)",
            padding:"9px 13px",marginBottom:13,fontSize:11,color:"var(--teal)"}}>
 Notifications on — we'll let you know when it's done
          </div>
        )}

        <div style={{background:"var(--td)",border:".5px solid rgba(0,212,168,.25)",borderRadius:"var(--r)",
          padding:"9px 13px",marginBottom:13,fontSize:11,color:"var(--t1)",lineHeight:1.5}}>
 <strong style={{color:"var(--teal)"}}>You're protected:</strong> Money's held safely. If anything goes wrong, you'll be refunded automatically. You can cancel anytime.
        </div>
      </>
    );
  };

  // ─── Step indicator ─────────────────────────────────────────────────────────
  const StepDots = () => (
    <div style={{display:"flex",gap:6,marginBottom:0}}>
      {[1,2,3].map(n => (
        <div key={n} style={{flex:1,height:3,borderRadius:2,
          background:n<=step?"var(--teal)":"var(--bg3)",transition:"background .3s"}}/>
      ))}
    </div>
  );

  // Determine if we can proceed
  const canProceed = step === 1 ? false :
    step === 2 ? (() => {
      if (template?.custom) {
        return values.dockerImage?.trim();
      }
      return (template?.inputs || []).every(inp =>
        !inp.required || (values[inp.key] != null && values[inp.key] !== "")
      );
    })() : true;

  return(
    <div role="dialog" aria-modal="true" aria-label="Run a new job"
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",zIndex:999,
      display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"var(--bg2)",border:".5px solid var(--b2)",borderRadius:"var(--r3)",
        padding:22,width:"100%",maxWidth:540,maxHeight:"92vh",overflowY:"auto",
        animation:"modalIn .25s cubic-bezier(.4,0,.2,1) both",display:"flex",flexDirection:"column"}}>

        {/* Top bar */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <button onClick={()=>step>1?setStep(s=>s-1):onClose()}
            style={{color:"var(--t2)",fontSize:13,padding:"4px 8px",cursor:"pointer",
              borderRadius:4,background:"transparent",border:"none",display:"flex",alignItems:"center",gap:5}}
            onMouseEnter={e=>e.currentTarget.style.color="var(--t0)"}
            onMouseLeave={e=>e.currentTarget.style.color="var(--t2)"}>
            {step > 1 ? "← Back" : "← Cancel"}
          </button>
          <button onClick={onClose} aria-label="Close"
            style={{color:"var(--t2)",padding:6,minWidth:34,minHeight:34,
              borderRadius:6,background:"transparent",border:"none",cursor:"pointer"}}><X size={16}/></button>
        </div>

        <StepDots/>
        <div style={{height:18}}/>

        {/* Step content */}
        {/* Called as plain functions, not <Step1/> JSX — Step1/2/3 are
            redefined on every render, so mounting them as components would
            give React a new component type each keystroke and remount the
            subtree, dropping focus out of the textarea. */}
        {step === 1 && Step1()}
        {step === 2 && Step2()}
        {step === 3 && Step3()}

        {/* Bottom button */}
        <div style={{marginTop:"auto",paddingTop:14}}>
          {step === 1 && (
            <div style={{fontSize:11,color:"var(--t2)",textAlign:"center"}}>
              Pick a template above to continue
            </div>
          )}
          {step === 2 && (
            <Btn full disabled={!canProceed} onClick={()=>setStep(3)}>
              Continue →
            </Btn>
          )}
          {step === 3 && (
            <Btn full disabled={busy} onClick={launch}>
 {busy?<><Spin/> Starting your job…</>:"Let's go!"}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── File upload component ───────────────────────────────────────────────────
const FileUpload = ({inp, value, files, onChange}) => {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  return (
    <div onClick={()=>fileRef.current?.click()}
      onDragOver={e=>{e.preventDefault();setDragging(true);}}
      onDragLeave={()=>setDragging(false)}
      onDrop={e=>{e.preventDefault();setDragging(false);onChange(e.dataTransfer.files);}}
      style={{padding:"18px 14px",background:"var(--bg3)",borderRadius:"var(--r)",cursor:"pointer",
        border:`1px dashed ${dragging?"var(--teal)":"var(--b2)"}`,
        textAlign:"center",transition:"border-color .2s, background .2s",
        ...(dragging && {background:"var(--td)"})}}>
      <input type="file" ref={fileRef} style={{display:"none"}}
        accept={inp.accept} multiple={inp.multiple}
        onChange={e=>onChange(e.target.files)}/>
      {files?.length > 0 ? (
        <>
          <div style={{marginBottom:6}}><FileText size={18}/></div>
          <div style={{fontSize:13,fontWeight:600,color:"var(--teal)",marginBottom:3}}>
            {files.length === 1 ? files[0].name : `${files.length} files selected`}
          </div>
          <div style={{fontSize:11,color:"var(--t2)"}}>
            {files.length === 1
              ? `${(files[0].size / 1024 / 1024).toFixed(2)} MB · click to change`
              : `Total: ${(files.reduce((s,f)=>s+f.size,0) / 1024 / 1024).toFixed(2)} MB · click to change`}
          </div>
        </>
      ) : (
        <>
          <div style={{marginBottom:6,opacity:.6}}><Folder size={22}/></div>
          <div style={{fontSize:13,color:"var(--t1)",marginBottom:3}}>
            <strong style={{color:"var(--teal)"}}>Click to browse</strong> or drag & drop here
          </div>
          {inp.accept && (
            <div style={{fontSize:11,color:"var(--t2)"}}>
              Accepted: {inp.accept.replace(/,/g, ", ")}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════════════════════════
const ToastView = () => {
  const { toast } = useApp();
  if (!toast) return null;
  const colors = {
    success: { bg: "rgba(0,212,168,.15)", fg:"var(--teal)", border:"rgba(0,212,168,.5)", icon: Check },
    error:   { bg: "rgba(255,77,106,.15)", fg:"var(--red)",  border:"rgba(255,77,106,.5)",  icon: TriangleAlert },
    info:    { bg: "rgba(59,158,255,.15)", fg:"var(--blue)", border:"rgba(59,158,255,.5)",  icon: InfoIcon },
  };
  const c = colors[toast.type] || colors.info;
  return (
    <div role="status" aria-live="polite"
      style={{position:"fixed",bottom:96,left:"50%",transform:"translateX(-50%)",zIndex:1000,
      background:`linear-gradient(135deg,${c.bg},rgba(15,32,64,.95))`,
      border:`1px solid ${c.border}`,borderRadius:"var(--r2)",
      padding:"12px 18px",display:"flex",alignItems:"center",gap:11,maxWidth:"90vw",
      backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
      boxShadow:`0 12px 40px rgba(0,0,0,.5), 0 0 0 1px ${c.border} inset`,
      animation:"toastIn .3s cubic-bezier(.4,0,.2,1) both"}}>
      <span style={{color:c.fg,lineHeight:1,flexShrink:0}}><c.icon size={16}/></span>
      <span style={{fontSize:13,color:"var(--t0)",lineHeight:1.4,fontWeight:500}}>{toast.msg}</span>
    </div>
  );
};

// RentModal was retired — once a job needs a Docker image to actually run
// (see the job-execution work), "rent this node with no workload" stopped
// being something the backend can act on. Its "pick a node" affordance
// lives on now as NewJobModal's presetNodeId/presetNodeName props, wired
// from AppInner below.

// ═══════════════════════════════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  return (
    <AppProvider>
      <AppInner/>
    </AppProvider>
  );
}

function AppInner() {
  const [tab,setTabLocal]=useState(()=>{
    try {
      const saved = localStorage.getItem("decompute_simple_mode");
      return (saved === null || saved === "1") ? "Create" : "Marketplace";
    } catch { return "Create"; }
  });
  const [rentNode,setRentNode]=useState(null); // a marketplace node the renter wants to pin a new job to
  const [aiOpen,setAiOpen]=useState(false);
  const [injected,setInjected]=useState(null);
  const { setActiveTab } = useApp();

  // Keep context aware of which tab is active
  const setTab = useCallback((t) => {
    setTabLocal(t);
    setActiveTab(t);
  }, [setActiveTab]);

  useEffect(() => { setActiveTab(tab); }, [tab, setActiveTab]);

  const inject=useCallback(p=>{setInjected(p);setAiOpen(true);},[]);
  const clearInjected=useCallback(()=>setInjected(null),[]);

  return(
    <>
      <style>{CSS}</style>
      <div className="scan-line"/>
      <Header active={tab} setTab={setTab}/>
      <main className="wrap">
        <FirstTimeWelcome setTab={setTab}/>
        {tab==="Create"       &&<CreateTab/>}
        {tab==="My Stuff"     &&<MyStuffTab/>}
        {tab==="Marketplace"  &&<Marketplace  onRent={setRentNode} onInject={inject}/>}
        {tab==="Models"       &&<ModelMarketplaceTab onInject={inject}/>}
        {tab==="My Jobs"      &&<MyJobs       onInject={inject}/>}
        {tab==="Provider Hub" &&<ProviderHub  onInject={inject}/>}
        {tab==="Pricing"      &&<PricingTab   onInject={inject} setTab={setTab}/>}
        {tab==="Network"      &&<NetworkTab   onInject={inject}/>}
      </main>
      <BottomNav active={tab} setTab={setTab}/>
      <Copilot open={aiOpen} onToggle={()=>setAiOpen(o=>!o)} injected={injected} clearInjected={clearInjected}/>
      {rentNode&&<NewJobModal presetNodeId={rentNode.id} presetNodeName={rentNode.name} onClose={()=>setRentNode(null)}/>}
      <ToastView/>
      <OnboardingTour setTab={setTab}/>
      <FreeCreditTrigger/>
      <HelpButton/>
      <StuckDetector/>
      <CommandPalette setTab={setTab}/>
      <ModeTabGuard tab={tab} setTab={setTab}/>
      <GlobalModals/>
    </>
  );
}

// Keeps the active tab valid when Simple Mode is toggled.
const ModeTabGuard = ({tab, setTab}) => {
  const { simpleMode } = useApp();
  useEffect(() => {
    // Provider Hub is reachable from Simple Mode (command palette, account
    // menu) even though it isn't in Simple Mode's own header/bottom-nav
    // tabs — its wizard is guided enough not to need Advanced Mode, and
    // bouncing it back to "Create" broke that navigation entirely.
    const simple = ["Create","My Stuff","Provider Hub"];
    const full = ["Marketplace","Models","My Jobs","Provider Hub","Pricing","Network"];
    if (simpleMode && !simple.includes(tab)) setTab("Create");
    if (!simpleMode && !full.includes(tab)) setTab("Marketplace");
  }, [simpleMode, tab, setTab]);
  return null;
};

// Renders the global modals that any component can open via context
function GlobalModals() {
  const { signupOpen, closeSignup, addFundsOpen, closeAddFunds, liveJob, closeLiveJob } = useApp();
  return (
    <>
      {signupOpen && <SignupModal onClose={closeSignup}/>}
      {addFundsOpen && <AddFundsModal onClose={closeAddFunds}/>}
      {liveJob && <LiveJobView job={liveJob} onClose={closeLiveJob}/>}
      <QuickStartLauncher/>
      <ShareModal/>
      <ReferralModal/>
      <EmbedModal/>
      <AchievementToast/>
    </>
  );
}
