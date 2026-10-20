"""Benchmark the production video templates on Modal GPUs.

Images are built from job-templates/*/Dockerfile unchanged, and every attempt
runs /app/generate.py in a fresh Python process, as a provider's agent would.
Usage: modal run video_bench.py --phase smoke|full --gpu L40S
"""
import json
import os
import pathlib
import subprocess
import tempfile
import time

import modal

TEMPLATES = pathlib.Path(os.environ.get("DECOMPUTE_TEMPLATES", "."))
GPU = os.environ.get("BENCH_GPU", "L40S")
app = modal.App("decompute-video-bench")

ignore = ["__pycache__", "*.pyc"]
reference_image = modal.Image.from_dockerfile(TEMPLATES / "video-reference" / "Dockerfile",
    context_dir=TEMPLATES / "video-reference", ignore=ignore).entrypoint([])


def preset_context(name, repo, revision, preset):
    """Copy of video-gen with this preset's ARG defaults written in. Modal does
    not tell apart two builds of one Dockerfile that differ only in build_args."""
    import shutil
    target = pathlib.Path(__file__).parent / "build" / name
    if (TEMPLATES / "video-gen").exists():
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(TEMPLATES / "video-gen", target, ignore=shutil.ignore_patterns("__pycache__"))
        dockerfile = (target / "Dockerfile").read_text()
        for key, value in (("MODEL_REPO", repo), ("MODEL_REVISION", revision), ("PRESET", preset)):
            dockerfile = "\n".join(f"ARG {key}={value}" if line.startswith(f"ARG {key}=") else line for line in dockerfile.splitlines())
        (target / "Dockerfile").write_text(dockerfile + "\n")
    return modal.Image.from_dockerfile(target / "Dockerfile", context_dir=target, ignore=ignore).entrypoint([])


shot_image = preset_context("video-gen-base", "Wan-AI/Wan2.2-TI2V-5B-Diffusers",
    "b8fff7315c768468a5333511427288870b2e9635", "wan-2.2-5b-720-30-v1")
fast_image = preset_context("video-gen-fast", "FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers",
    "3e187042a324f6f5fb68fd22110a78725253de8f", "fastwan-2.2-5b-720-3-v1")


def run_template(spec, input_png=None, benchmark=False):
    """Run the template exactly as the container entrypoint would."""
    with tempfile.TemporaryDirectory() as work:
        work = pathlib.Path(work)
        (work / "in").mkdir()
        if input_png:
            (work / "in" / "reference.png").write_bytes(input_png)
        (work / "spec.json").write_text(json.dumps(spec))
        cmd = ["python", "/app/generate.py", "--spec-file", str(work / "spec.json"),
               "--input-dir", str(work / "in"), "--output-dir", str(work / "out")]
        if benchmark:
            cmd.append("--benchmark")
        started = time.perf_counter()
        proc = subprocess.run(cmd, capture_output=True, text=True)
        wall = time.perf_counter() - started
        metrics = None
        for line in proc.stdout.splitlines():
            if line.startswith("DECOMPUTE_BENCHMARK="):
                metrics = json.loads(line.split("=", 1)[1])
        outputs = list((work / "out").glob("result.*")) if (work / "out").exists() else []
        return {"ok": proc.returncode == 0 and bool(outputs), "wallSeconds": wall, "metrics": metrics,
                "data": outputs[0].read_bytes() if outputs else None,
                "log": (proc.stdout[-1500:] + "\n" + proc.stderr[-3000:]) if proc.returncode else ""}


@app.function(image=reference_image, gpu=GPU, memory=32768, timeout=900, max_containers=6)
def reference(spec, input_png=None):
    spec = {**spec, "presetId": "sdxl-ipadapter-v1", "modelRevision": os.environ["MODEL_REVISION"]}
    return run_template(spec, input_png)


@app.function(image=shot_image, gpu=GPU, memory=65536, timeout=2400, max_containers=6)
def shot(spec, input_png):
    spec = {**spec, "presetId": "wan-2.2-5b-720-30-v1", "steps": 30, "modelRevision": os.environ["MODEL_REVISION"]}
    return run_template(spec, input_png)


@app.function(image=fast_image, gpu=GPU, memory=65536, timeout=1200, max_containers=6)
def fast_shot(spec, input_png):
    spec = {**spec, "presetId": "fastwan-2.2-5b-720-3-v1", "steps": 3, "modelRevision": os.environ["MODEL_REVISION"]}
    return run_template(spec, input_png)


@app.local_entrypoint()
def main(phase: str = "smoke", out: str = "results", canaries: str = "canaries.json", presets: str = "fast,base"):
    plan = json.loads(pathlib.Path(canaries).read_text())
    subjects = plan["canaries"][:1] if phase == "smoke" else plan["canaries"]
    shots_per_subject = 1 if phase == "smoke" else 3
    outdir = pathlib.Path(out) / phase
    outdir.mkdir(parents=True, exist_ok=True)
    report = []

    def save(name, result, ext, extra):
        row = {"name": name, "ok": result["ok"], "wallSeconds": round(result["wallSeconds"], 1), **extra,
               "metrics": result["metrics"]}
        if result["data"]:
            (outdir / f"{name}.{ext}").write_bytes(result["data"])
        if not result["ok"]:
            row["log"] = result["log"]
            print(f"FAILED {name}:\n{result['log']}")
        report.append(row)
        (outdir / "report.json").write_text(json.dumps(report, indent=1))
        print(f"{name}: ok={row['ok']} wall={row['wallSeconds']}s")

    def task(subject, key):
        return next(t for t in subject["tasks"] if t["key"] == key)

    def compiled(t):
        return {**t["spec"], "kind": t["kind"], "seed": t["seed"]}

    # 1. Master references, one per subject.
    refs = list(reference.map([compiled(task(s, "reference")) for s in subjects], return_exceptions=True))
    ref_png = {}
    for i, r in enumerate(refs):
        if isinstance(r, Exception):
            print(f"reference {i} raised: {r}"); continue
        save(f"s{i}-reference", r, "png", {"kind": "reference"})
        if r["ok"]:
            ref_png[i] = r["data"]

    # 2. Storyboards conditioned on their subject's reference.
    jobs = [(i, n) for i in ref_png for n in range(shots_per_subject)]
    boards = list(reference.starmap([(compiled(task(subjects[i], f"storyboard-{n}")), ref_png[i]) for i, n in jobs],
                                    return_exceptions=True))
    board_png = {}
    for (i, n), r in zip(jobs, boards):
        if isinstance(r, Exception):
            print(f"storyboard s{i}-{n} raised: {r}"); continue
        save(f"s{i}-storyboard-{n}", r, "png", {"kind": "storyboard"})
        if r["ok"]:
            board_png[(i, n)] = r["data"]

    # 3. Shots from the same storyboards with each preset, in parallel.
    keys = list(board_png)
    calls = {}
    for label, fn in (("fast", fast_shot), ("base", shot)):
        if label in presets.split(","):
            calls[label] = [fn.spawn(compiled(task(subjects[i], f"shot-{n}")), board_png[(i, n)]) for i, n in keys]
    for label, handles in calls.items():
        for (i, n), handle in zip(keys, handles):
            try:
                save(f"s{i}-shot-{n}-{label}", handle.get(), "mp4", {"kind": "shot", "preset": label})
            except Exception as error:  # noqa: BLE001 - record and keep going
                print(f"shot s{i}-{n}-{label} raised: {error}")
                report.append({"name": f"s{i}-shot-{n}-{label}", "ok": False, "error": str(error)})
    (outdir / "report.json").write_text(json.dumps(report, indent=1))
    print(f"done: {sum(r['ok'] for r in report)}/{len(report)} ok -> {outdir}")
