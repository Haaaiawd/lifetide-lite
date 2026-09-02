import { describe, it, expect } from "vitest";
import { buildMemoryFromVirtualUser } from "../fixtures/build-memory";
import { buildFallbackParallelLivesPlan, buildFallbackDesignBasis, buildFallbackAnalysis } from "@/lib/ai/sensemaker/final";
import { parallelLivesPlanSchema } from "@/lib/state/contracts";
import type { ParallelLivesPlan, Analysis, DesignBasis } from "@/lib/state/contracts";

describe("Fallback plan completeness (revision 5)", () => {
  const memory = buildMemoryFromVirtualUser("virtual-user-01.json");
  const provenanceId = "test-provenance-001";
  const plan = buildFallbackParallelLivesPlan(memory.session_id, memory, false, provenanceId);

  it("passes the zod schema with analysis and design_basis", () => {
    const parsed = parallelLivesPlanSchema.safeParse(plan);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      console.error("Schema validation errors:", JSON.stringify(parsed.error.issues, null, 2));
    }
  });

  it("has analysis with all 8 tool sections", () => {
    const analysis = plan.analysis as Analysis;
    expect(analysis).toBeDefined();
    expect(analysis.life_dashboard).toBeDefined();
    expect(analysis.compass).toBeDefined();
    expect(analysis.energy_patterns).toBeDefined();
    expect(analysis.problem_frame).toBeDefined();
    expect(analysis.possibility_seeds).toBeDefined();
    expect(analysis.failure_learning).toBeDefined();
    expect(analysis.support_map).toBeDefined();
    expect(analysis.design_principles).toBeDefined();
  });

  it("has at least 3 possibility seeds for 3 distinct routes", () => {
    const analysis = plan.analysis as Analysis;
    expect(analysis.possibility_seeds.length).toBeGreaterThanOrEqual(3);
  });

  it("has at least 2 design principles", () => {
    const analysis = plan.analysis as Analysis;
    expect(analysis.design_principles.length).toBeGreaterThanOrEqual(2);
  });

  it("each life has design_basis with required fields", () => {
    for (const life of plan.lives) {
      const db = life.design_basis as DesignBasis;
      expect(db).toBeDefined();
      expect(db.principle_refs.length).toBeGreaterThanOrEqual(1);
      expect(db.seed_ref).toBeTruthy();
      expect(db.lived_difference).toBeTruthy();
      expect(db.narrative_anchor).toBeTruthy();
      expect(db.prototype_question).toBeTruthy();
    }
  });

  it("each life has day_narrative with 4-8 scenes", () => {
    for (const life of plan.lives) {
      expect(life.day_narrative).toBeDefined();
      expect(life.day_narrative.scenes.length).toBeGreaterThanOrEqual(4);
      expect(life.day_narrative.scenes.length).toBeLessThanOrEqual(8);
      for (const scene of life.day_narrative.scenes) {
        expect(scene.text.length).toBeGreaterThan(0);
      }
    }
  });

  it("each life has a complete prototype", () => {
    for (const life of plan.lives) {
      const p = life.prototype;
      expect(p.hypothesis).toBeTruthy();
      expect(p.today_action).toBeTruthy();
      expect(p.what_to_observe).toBeTruthy();
      expect(p.day_1).toBeTruthy();
      expect(p.day_2).toBeTruthy();
      expect(p.day_3).toBeTruthy();
      expect(p.time_ceiling_hours).toBeGreaterThanOrEqual(0.5);
      expect(p.time_ceiling_hours).toBeLessThanOrEqual(6);
      expect(p.money_ceiling).toBeTruthy();
      expect(p.reversible_because).toBeTruthy();
      expect(p.feedback_source).toBeTruthy();
      expect(p.continue_signal).toBeTruthy();
      expect(p.pause_or_exit_note).toBeTruthy();
      expect(p.safety_check).toBeTruthy();
    }
  });

  it("has blueprint with current_coordinate, key_tensions, recurring_elements", () => {
    expect(plan.blueprint.current_coordinate).toBeTruthy();
    expect(plan.blueprint.key_tensions.length).toBeGreaterThanOrEqual(1);
    expect(plan.blueprint.recurring_elements.length).toBeGreaterThanOrEqual(1);
  });

  it("three lives are pairwise distinct in title and core_experience", () => {
    const [a, b, c] = plan.lives;
    expect(a.title).not.toBe(b.title);
    expect(b.title).not.toBe(c.title);
    expect(a.title).not.toBe(c.title);
  });

  it("no ranking language in the entire plan", () => {
    const allText = JSON.stringify(plan);
    expect(allText).not.toMatch(/最佳|最适合|推荐|首选|冠军|plan b|b 计划|最安全/i);
  });

  it("no irreversible actions in prototypes", () => {
    for (const life of plan.lives) {
      const trialText = [
        life.prototype.hypothesis,
        life.prototype.today_action,
        life.prototype.day_1,
        life.prototype.day_2,
        life.prototype.day_3,
        life.prototype.safety_check,
      ].join(" ");
      expect(trialText).not.toMatch(/辞职|退学|搬家|贷款|手术|分手|公开宣布|卖房/);
    }
  });

  it("evidence_for references point to active source heads", () => {
    const activeSourceIds = new Set(memory.source_heads.map((h) => h.source_id));
    for (const life of plan.lives) {
      for (const link of life.evidence_for) {
        expect(activeSourceIds.has(link.source_id)).toBe(true);
      }
    }
  });
});

describe("buildFallbackAnalysis", () => {
  const memory = buildMemoryFromVirtualUser("virtual-user-01.json");
  const analysis = buildFallbackAnalysis(memory);

  it("returns a valid Analysis object", () => {
    expect(analysis.life_dashboard).toBeDefined();
    expect(analysis.compass).toBeDefined();
    expect(analysis.problem_frame).toBeDefined();
  });

  it("possibility_seeds have structural_changes with at least one axis", () => {
    for (const seed of analysis.possibility_seeds) {
      expect(seed.structural_changes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("design_principles have finding_refs", () => {
    for (const dp of analysis.design_principles) {
      expect(dp.finding_refs.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("buildFallbackDesignBasis", () => {
  it("produces a valid DesignBasis for each index", () => {
    for (let i = 0; i < 3; i++) {
      const db = buildFallbackDesignBasis(`路线${i + 1}`, i);
      expect(db.principle_refs.length).toBeGreaterThanOrEqual(1);
      expect(db.seed_ref).toContain("/analysis/possibility_seeds/");
      expect(db.lived_difference).toBeTruthy();
      expect(db.narrative_anchor).toBeTruthy();
      expect(db.prototype_question).toBeTruthy();
    }
  });
});
