// Offline planning calculator. Does not read .env, call APIs, or rent compute.
// Run: node docs/video-cost-model.mjs [path/to/alternative-assumptions.json]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuote, REFERENCE_PRESET } from "../server/src/lib/video/policy.js";

// Runs a scenario through the production admission code itself, so the plan
// cannot drift from what the server will actually quote. Admission also
// checks the p95-based first-pass reservation, which the steady-state
// estimate above does not model and which binds first for slow presets.
export function admission(config, scenario, offer) {
  const ref = config.referenceWorker;
  if (!ref || !scenario.presetId || !scenario.gpuSecondsP95) return null;
  const workers = [
    { preset_id: scenario.presetId, price_per_hour: scenario.providerUsdPerHour, p50_seconds: scenario.gpuSecondsPerAttempt,
      p95_seconds: scenario.gpuSecondsP95, acceptance: scenario.acceptedAttemptProbability },
    { preset_id: REFERENCE_PRESET, price_per_hour: ref.providerUsdPerHour, p50_seconds: ref.gpuSecondsPerAttempt,
      p95_seconds: ref.gpuSecondsP95, acceptance: ref.acceptedAttemptProbability },
  ];
  try {
    const quote = buildQuote(offer.seconds, workers);
    return { ok: true, expectedComputeUsd: quote.expectedComputeMicros / 1e6, firstPassReserveUsd: quote.firstPassReserveMicros / 1e6, capUsd: quote.computeCapMicros / 1e6 };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

function positive(value, label, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`${label} must be a finite ${allowZero ? "nonnegative" : "positive"} number`);
  }
  return value;
}

function sumCosts(costs, label) {
  return Object.entries(costs).reduce((sum, [key, value]) =>
    sum + positive(value, `${label}.${key}`, true), 0);
}

export function estimate(config, scenario, offer) {
  const shotSeconds = positive(config.shotSeconds, "shotSeconds");
  const seconds = positive(offer.seconds, "offer.seconds");
  const price = positive(offer.priceUsd, "offer.priceUsd");
  const shots = Math.ceil(seconds / shotSeconds);
  const runtime = positive(scenario.gpuSecondsPerAttempt, "gpuSecondsPerAttempt");
  const rate = positive(scenario.providerUsdPerHour, "providerUsdPerHour");
  const acceptance = positive(scenario.acceptedAttemptProbability, "acceptedAttemptProbability");
  if (acceptance > 1) throw new Error("acceptedAttemptProbability must be <= 1");
  const targetMargin = positive(config.targetContributionMargin, "targetContributionMargin", true);
  const wallet = positive(config.payments.walletTopupUsd, "walletTopupUsd");
  const paymentFraction = positive(config.payments.percentage, "payments.percentage", true)
    + positive(config.payments.fixedUsd, "payments.fixedUsd", true) / wallet;
  if (targetMargin + paymentFraction >= 1) throw new Error("Margin plus payment fraction must be < 1");
  const expectedAttempts = shots / acceptance;
  const gpuCost = expectedAttempts * runtime / 3600 * rate;
  const otherCost = sumCosts(config.fixedPerProject, "fixedPerProject")
    + shots * sumCosts(config.perShot, "perShot");
  const paymentCost = price * paymentFraction;
  const variableCost = gpuCost + otherCost + paymentCost;
  const contribution = price - variableCost;
  const computeBudget = price * (1 - targetMargin - paymentFraction) - otherCost;
  return {
    scenario: scenario.id, seconds, shots, price, expectedAttempts,
    gpuCost, otherCost, paymentCost, variableCost, contribution,
    contributionMargin: contribution / price,
    minimumPriceForTargetMargin: (gpuCost + otherCost) / (1 - targetMargin - paymentFraction),
    maxGpuSecondsForTargetMargin: computeBudget > 0
      ? computeBudget * 3600 * acceptance / (shots * rate) : null,
    monthlyBreakEvenProjects: contribution > 0
      ? Math.ceil(positive(config.monthlyFixedOperatingUsd, "monthlyFixedOperatingUsd", true) / contribution) : null,
    // Diagnostic only: three independent attempts per shot, no repair or fallback.
    // The cost estimate above is a steady-state 1/p model, NOT this capped policy.
    completeProbabilityWithThreeAttemptsPerShot: (1 - (1 - acceptance) ** 3) ** shots,
  };
}

export function render(config) {
  const usd = (value) => `$${value.toFixed(4)}`;
  const rows = [
    `Assumptions as of ${config.asOf}. Hypothetical unit economics; no GPU benchmark performed.`,
    "Payment fee allocated across fully spent wallet credit. Audio, salaries, acquisition, taxes, and reserved idle GPUs excluded.",
    "",
    "| Scenario | Output | Price | GPU | Other | Payment | Total variable cost | Contribution | Margin | Projects/month to cover fixed ops |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const scenario of config.scenarios) {
    for (const offer of config.offers) {
      const r = estimate(config, scenario, offer);
      rows.push(`| ${r.scenario} | ${r.seconds}s | ${usd(r.price)} | ${usd(r.gpuCost)} | ${usd(r.otherCost)} | ${usd(r.paymentCost)} | ${usd(r.variableCost)} | ${usd(r.contribution)} | ${(r.contributionMargin * 100).toFixed(1)}% | ${r.monthlyBreakEvenProjects ?? "never"} |`);
    }
  }
  rows.push("", `Target contribution margin: ${config.targetContributionMargin * 100}%`, "");
  for (const scenario of config.scenarios) {
    const r = estimate(config, scenario, config.offers.at(-1));
    rows.push(`${r.scenario}, ${r.seconds}s: minimum price ${usd(r.minimumPriceForTargetMargin)}; max GPU seconds/attempt at current price ${r.maxGpuSecondsForTargetMargin?.toFixed(1) ?? "no feasible budget"}; independent three-attempt project success ${(100 * r.completeProbabilityWithThreeAttemptsPerShot).toFixed(2)}%.`);
  }
  rows.push("", "Production admission (server/src/lib/video/policy.js buildQuote): the server refuses an order unless expected compute AND the",
    "p95-based first-pass reservation both fit the compute cap left after payment fees, overhead and the 35% margin.", "",
    "| Scenario | Output | Quote? | Expected GPU | First-pass reserve | Compute cap |", "|---|---:|---|---:|---:|---:|");
  for (const scenario of config.scenarios) {
    for (const offer of config.offers) {
      const a = admission(config, scenario, offer);
      if (!a) continue;
      rows.push(a.ok ? `| ${scenario.id} | ${offer.seconds}s | yes | ${usd(a.expectedComputeUsd)} | ${usd(a.firstPassReserveUsd)} | ${usd(a.capUsd)} |`
        : `| ${scenario.id} | ${offer.seconds}s | no: ${a.reason} | | | |`);
    }
  }
  rows.push("", "Provider comparison: normalized generation spend only; clip-length rounding, retries, editing, and references can add cost.",
    "", "| Provider | 5s equivalent | 30s equivalent |", "|---|---:|---:|");
  for (const competitor of config.competitors) {
    const cost = (seconds) => competitor.usdPerFiveSecondClip !== undefined
      ? Math.ceil(seconds / 5) * positive(competitor.usdPerFiveSecondClip, "competitor price", true)
      : seconds * positive(competitor.usdPerSecond, "competitor price", true);
    rows.push(`| ${competitor.name} | ${usd(cost(5))} | ${usd(cost(30))} |`);
  }
  return rows.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] || new URL("./video-cost-assumptions.json", import.meta.url);
  try {
    console.log(render(JSON.parse(readFileSync(source, "utf8"))));
  } catch (error) {
    console.error(`Cost model: ${error.message}`);
    process.exitCode = 1;
  }
}
