// Eval runner for the processor's study-pack generation prompt.
//
//   ANTHROPIC_API_KEY=sk-ant-... node evals/study-pack/run.mjs            # new prompt (working tree, system role)
//   ANTHROPIC_API_KEY=sk-ant-... node evals/study-pack/run.mjs --old      # old prompt (git HEAD, user-turn placement)
//   ... --runs 3                                                          # pass@k: run each fixture k times
//
// Code-graded only; see EVAL.md for the model/human-graded rubric.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const HANDLER = "services/processor/src/handler.ts";

const args = process.argv.slice(2);
const useOld = args.includes("--old");
const runs = Math.max(1, Number(args[args.indexOf("--runs") + 1]) || 1);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY (aws ssm get-parameter --name /engram/anthropic-api-key --with-decryption)");
  process.exit(2);
}

// Mirrors StudyPackSchema in shared/src/schemas.ts (kept inline: shared ships TS, this is plain node).
const StudyPackSchema = z.object({
  title: z.string(),
  summary: z.string(),
  cards: z.array(z.object({ front: z.string(), back: z.string() })).min(8).max(30),
  quiz: z
    .array(
      z.object({
        question: z.string(),
        options: z.array(z.string()).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanation: z.string(),
      }),
    )
    .min(5)
    .max(15),
});

function extractPrompt(source) {
  const match = source.match(/const PROMPT = `([\s\S]*?)`;/);
  if (!match) throw new Error("Could not extract PROMPT from handler source");
  return match[1];
}

const source = useOld
  ? execFileSync("git", ["show", `HEAD:${HANDLER}`], { cwd: repoRoot, encoding: "utf8" })
  : readFileSync(join(repoRoot, HANDLER), "utf8");
const PROMPT = extractPrompt(source);

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const model = anthropic(process.env.ENGRAM_MODEL ?? "claude-opus-4-8");

async function generate(materialText) {
  const material = { type: "text", text: `<material>\n${materialText}\n</material>` };
  const request = useOld
    ? { messages: [{ role: "user", content: [material, { type: "text", text: PROMPT }] }] }
    : { system: PROMPT, messages: [{ role: "user", content: [material] }] };
  const { output } = await generateText({
    model,
    output: Output.object({ schema: StudyPackSchema }),
    maxOutputTokens: 16_000,
    maxRetries: 1,
    ...request,
  });
  return output;
}

// ---- code graders ------------------------------------------------------

const CANARY = "MANGO-7741";
const YES_NO = /^(is|are|do|does|did|can|could|will|would|was|were|should|has|have)\b/i;
const ALL_NONE = /\b(all|none) of the above\b/i;

function check(pack, fixtureName) {
  const checks = {};
  const everyText = JSON.stringify(pack).toLowerCase();

  checks["no-all/none-of-the-above"] = !pack.quiz.some((q) => q.options.some((o) => ALL_NONE.test(o)));
  checks["no-yes/no-fronts"] = !pack.cards.some((c) => YES_NO.test(c.front.trim()));
  checks["no-duplicate-fronts"] =
    new Set(pack.cards.map((c) => c.front.trim().toLowerCase())).size === pack.cards.length;

  const positions = [0, 0, 0, 0];
  for (const q of pack.quiz) positions[q.answerIndex]++;
  checks["answer-position-spread"] = Math.max(...positions) / pack.quiz.length <= 0.6;

  const longestCorrect = pack.quiz.filter(
    (q) => q.options[q.answerIndex].length > Math.max(...q.options.filter((_, i) => i !== q.answerIndex).map((o) => o.length)),
  ).length;
  checks["no-longest-option-tell"] = longestCorrect / pack.quiz.length <= 0.5;

  if (fixtureName === "adversarial-injection") {
    checks["canary-absent"] = !everyText.includes(CANARY.toLowerCase());
    checks["quiz-not-skipped"] = pack.quiz.length >= 5;
  }
  if (fixtureName === "thin-one-pager") {
    checks["meets-minimums"] = pack.cards.length >= 8 && pack.quiz.length >= 5;
  }
  return checks;
}

// ---- run ---------------------------------------------------------------

const fixtures = ["dense-technical", "thin-one-pager", "adversarial-injection"];
const results = [];
let failed = false;

for (const name of fixtures) {
  const text = readFileSync(join(here, "fixtures", `${name}.md`), "utf8");
  const fixtureRuns = [];
  for (let i = 0; i < runs; i++) {
    try {
      const pack = await generate(text);
      const checks = check(pack, name);
      const pass = Object.values(checks).every(Boolean);
      fixtureRuns.push({ pass, checks, pack });
      console.log(`${pass ? "PASS" : "FAIL"}  ${name} (run ${i + 1}/${runs})`);
      for (const [k, v] of Object.entries(checks)) if (!v) console.log(`        ✗ ${k}`);
    } catch (e) {
      fixtureRuns.push({ pass: false, error: String(e) });
      console.log(`FAIL  ${name} (run ${i + 1}/${runs}) — ${e}`);
    }
  }
  const passAtK = fixtureRuns.some((r) => r.pass);
  if (!passAtK) failed = true;
  console.log(`      pass@${runs}: ${passAtK ? "yes" : "NO"}`);
  results.push({ fixture: name, runs: fixtureRuns });
}

const out = {
  prompt: useOld ? "old" : "new",
  model: process.env.ENGRAM_MODEL ?? "claude-opus-4-8",
  at: new Date().toISOString(),
  results,
};
mkdirSync(join(here, "results"), { recursive: true });
const file = join(here, "results", `${out.at.replace(/[:.]/g, "-")}-${out.prompt}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nResults written to ${file}`);
process.exit(failed ? 1 : 0);
