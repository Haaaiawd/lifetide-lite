/**
 * Manual AI generation script — runs runSensemakerFinal with virtual-user data.
 *
 * Usage:
 *   pnpm tsx scripts/generate-final-from-fixture.ts [fixture-file] [output-file]
 *
 * Defaults:
 *   fixture-file = tests/fixtures/virtual-user-01.json
 *   output-file  = tests/fixtures/output-final-plan.json
 *
 * Requires a real AI provider (AI_PROVIDER=aiping or openrouter).
 * In fixture mode, it will just output the fallback plan.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildMemoryFromVirtualUser } from "../tests/fixtures/build-memory";
import { runSensemakerFinal } from "@/lib/ai/sensemaker/final";

async function main() {
  const fixtureFile = process.argv[2] ?? "virtual-user-01.json";
  const outputFile = process.argv[3] ?? "output-final-plan.json";

  console.log(`\nBuilding WorkingMemory from ${fixtureFile}...`);
  const memory = buildMemoryFromVirtualUser(fixtureFile);

  console.log(`Memory summary:`);
  console.log(`  session: ${memory.session_id}`);
  console.log(`  sources: ${memory.source_heads.length}`);
  console.log(`  claims: ${memory.claims.length}`);
  console.log(`  constraints: ${memory.constraints.length}`);
  console.log(`  route_intents: ${memory.route_intents.length}`);
  console.log(`  uncertainties: ${memory.uncertainties.length}`);
  console.log(`  radar states: ${Object.entries(memory.radar).map(([k, v]) => `${k}=${v.state}`).join(", ")}`);

  console.log(`\nCalling runSensemakerFinal (AI_PROVIDER=${process.env.AI_PROVIDER ?? "not set"})...`);
  const startTime = Date.now();

  try {
    const result = await runSensemakerFinal({
      schema_version: "sensemaker.final.input.v3",
      memory,
      stop_reason: "sufficient",
      provisional: false,
      prompt_version: "sensemaker.final.v3",
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nGeneration completed in ${elapsed}s`);

    // Summary
    console.log(`\n=== Plan Summary ===`);
    console.log(`  schema_version: ${result.schema_version}`);
    console.log(`  provisional: ${result.provisional}`);
    console.log(`  framing: ${result.framing.slice(0, 100)}...`);
    console.log(`  blueprint.current_coordinate: ${result.blueprint.current_coordinate.slice(0, 80)}...`);
    console.log(`  blueprint.key_tensions: ${result.blueprint.key_tensions.length}`);
    console.log(`  blueprint.recurring_elements: ${result.blueprint.recurring_elements.length}`);
    console.log(`  analysis tools:`);
    console.log(`    life_dashboard: ${result.analysis.life_dashboard.health ? "✓" : "✗"} health, ${result.analysis.life_dashboard.work_learning ? "✓" : "✗"} work, ${result.analysis.life_dashboard.relationships ? "✓" : "✗"} relationships`);
    console.log(`    compass: ${result.analysis.compass.workview ? "✓" : "✗"} workview, ${result.analysis.compass.lifeview ? "✓" : "✗"} lifeview, ${result.analysis.compass.tensions.length} tensions`);
    console.log(`    energy_patterns: ${result.analysis.energy_patterns.length}`);
    console.log(`    problem_frame: design_question=${result.analysis.problem_frame.design_question ? "✓" : "✗"}`);
    console.log(`    possibility_seeds: ${result.analysis.possibility_seeds.length}`);
    console.log(`    design_principles: ${result.analysis.design_principles.length}`);
    console.log(`    failure_learning: ${result.analysis.failure_learning.length}`);
    console.log(`    support_map: ${result.analysis.support_map.length}`);

    for (let i = 0; i < result.lives.length; i++) {
      const life = result.lives[i];
      console.log(`\n  Life ${i + 1}: ${life.title}`);
      console.log(`    core_experience: ${life.core_experience.slice(0, 60)}...`);
      console.log(`    day_narrative scenes: ${life.day_narrative.scenes.length}`);
      console.log(`    design_basis.principle_refs: ${life.design_basis.principle_refs.length}`);
      console.log(`    design_basis.prototype_question: ${life.design_basis.prototype_question.slice(0, 60)}...`);
      console.log(`    attractions: ${life.attractions.length}, costs: ${life.costs_and_tradeoffs.length}`);
      console.log(`    prototype.time_ceiling_hours: ${life.prototype.time_ceiling_hours}`);
    }

    // Write full output
    const outputPath = join(process.cwd(), "tests", "fixtures", outputFile);
    writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
    console.log(`\nFull output written to: ${outputPath}`);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\nGeneration failed after ${elapsed}s:`);
    if (err instanceof Error) {
      console.error(`  ${err.name}: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}

main();
