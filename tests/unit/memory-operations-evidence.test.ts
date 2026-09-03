// Unit tests for applyMemoryOperations evidence validation.
// Verifies that add_claim, add_constraint, add_route_intent_seed reject
// evidence links pointing to unknown or inactive sources.

import { describe, it, expect } from "vitest";
import { applyMemoryOperations } from "@/lib/working-memory/operations";
import { makeFixturePortrait } from "@/lib/portrait/types";
import { makeEmptyWorkingMemory } from "@/lib/working-memory/types";
import type { WorkingMemory, MemoryOperation } from "@/lib/working-memory/types";
import type { EvidenceLink } from "@/lib/state/contracts";

function nowISO() {
  return new Date().toISOString();
}

function makeMemoryWithActiveSource(): WorkingMemory {
  const base = makeEmptyWorkingMemory("test-session");
  const sourceId = "src-active-1";
  base.source_heads = [
    {
      session_id: "test-session",
      source_id: sourceId,
      active_revision: 1,
      status: "active",
    },
  ];
  base.source_versions = [
    {
      source_id: sourceId,
      session_id: "test-session",
      revision: 1,
      kind: "question_answer",
      created_at: nowISO(),
      untrusted: false,
      text_ref: "ref-active-1",
    },
  ];
  return base;
}

function validEvidence(): EvidenceLink {
  return {
    source_id: "src-active-1",
    source_revision: 1,
    epistemic_status: "user_stated",
    evidence_shape: "concrete_scene",
    relevance: "test evidence",
  };
}

function invalidEvidence(): EvidenceLink {
  return {
    source_id: "src-does-not-exist",
    source_revision: 1,
    epistemic_status: "user_stated",
    evidence_shape: "concrete_scene",
    relevance: "test evidence",
  };
}

function inactiveEvidence(): EvidenceLink {
  return {
    source_id: "src-inactive-1",
    source_revision: 1,
    epistemic_status: "user_stated",
    evidence_shape: "concrete_scene",
    relevance: "test evidence",
  };
}

function makeMemoryWithInactiveSource(): WorkingMemory {
  const base = makeMemoryWithActiveSource();
  base.source_heads.push({
    session_id: "test-session",
    source_id: "src-inactive-1",
    active_revision: 1,
    status: "superseded",
  });
  base.source_versions.push({
    source_id: "src-inactive-1",
    session_id: "test-session",
    revision: 1,
    kind: "question_answer",
    created_at: nowISO(),
    untrusted: false,
    text_ref: "ref-inactive-1",
  });
  return base;
}

describe("applyMemoryOperations evidence validation", () => {
  const opts = {
    wave_id: "w1",
    generation_provenance_id: "prov-test-1",
    created_at: nowISO(),
  };

  it("accepts add_claim with valid active evidence", () => {
    const memory = makeMemoryWithActiveSource();
    const ops: MemoryOperation[] = [
      {
        op: "add_claim",
        value: {
          id: "tmp-1",
          generation_provenance_id: "prov-test-1",
          text: "test claim",
          epistemic_status: "working_inference",
          evidence: [validEvidence()],
          dimensions: ["motivation"],
          calibration: "unreviewed",
          status: "active",
        },
      },
    ];
    const next = applyMemoryOperations(memory, ops, opts);
    expect(next.claims).toHaveLength(1);
    expect(next.claims[0].text).toBe("test claim");
  });

  it("rejects add_claim with unknown source_id", () => {
    const memory = makeMemoryWithActiveSource();
    const ops: MemoryOperation[] = [
      {
        op: "add_claim",
        value: {
          id: "tmp-1",
          generation_provenance_id: "prov-test-1",
          text: "test claim",
          epistemic_status: "working_inference",
          evidence: [invalidEvidence()],
          dimensions: ["motivation"],
          calibration: "unreviewed",
          status: "active",
        },
      },
    ];
    expect(() => applyMemoryOperations(memory, ops, opts)).toThrow(/unknown or inactive source/);
  });

  it("rejects add_claim with inactive source", () => {
    const memory = makeMemoryWithInactiveSource();
    const ops: MemoryOperation[] = [
      {
        op: "add_claim",
        value: {
          id: "tmp-1",
          generation_provenance_id: "prov-test-1",
          text: "test claim",
          epistemic_status: "working_inference",
          evidence: [inactiveEvidence()],
          dimensions: ["motivation"],
          calibration: "unreviewed",
          status: "active",
        },
      },
    ];
    expect(() => applyMemoryOperations(memory, ops, opts)).toThrow(/unknown or inactive source/);
  });

  it("rejects add_constraint with unknown source_id", () => {
    const memory = makeMemoryWithActiveSource();
    const ops: MemoryOperation[] = [
      {
        op: "add_constraint",
        value: {
          id: "tmp-c-1",
          generation_provenance_id: "prov-test-1",
          text: "test constraint",
          kind: "money",
          flexibility: "negotiable",
          evidence: [invalidEvidence()],
          status: "active",
        },
      },
    ];
    expect(() => applyMemoryOperations(memory, ops, opts)).toThrow(/unknown or inactive source/);
  });

  it("rejects add_route_intent_seed with unknown source_id", () => {
    const memory = makeMemoryWithActiveSource();
    const ops: MemoryOperation[] = [
      {
        op: "add_route_intent_seed",
        value: {
          id: "tmp-r-1",
          generation_provenance_id: "prov-test-1",
          title_hint: "test route",
          life_shape: {
            daily_rhythm: "test",
            work_or_study: "test",
            relationships: "test",
            environment: "test",
            responsibilities: "test",
            resources: "test",
          },
          real_cost: "test cost",
          evidence: [invalidEvidence()],
          status: "seed",
        },
      },
    ];
    expect(() => applyMemoryOperations(memory, ops, opts)).toThrow(/unknown or inactive source/);
  });

  it("rejects supersede_claim with invalid evidence", () => {
    const memory = makeMemoryWithActiveSource();
    // First add a valid claim
    const addOp: MemoryOperation[] = [
      {
        op: "add_claim",
        value: {
          id: "tmp-1",
          generation_provenance_id: "prov-test-1",
          text: "original claim",
          epistemic_status: "working_inference",
          evidence: [validEvidence()],
          dimensions: ["motivation"],
          calibration: "unreviewed",
          status: "active",
        },
      },
    ];
    const withClaim = applyMemoryOperations(memory, addOp, opts);
    const claimId = withClaim.claims[0].id;

    // Try to supersede with invalid evidence
    const supersedeOp: MemoryOperation[] = [
      {
        op: "supersede_claim",
        prior_id: claimId,
        value: {
          id: "tmp-2",
          generation_provenance_id: "prov-test-1",
          text: "superseding claim",
          epistemic_status: "working_inference",
          evidence: [invalidEvidence()],
          dimensions: ["motivation"],
          calibration: "unreviewed",
          status: "active",
        },
      },
    ];
    expect(() => applyMemoryOperations(withClaim, supersedeOp, opts)).toThrow(/unknown or inactive source/);
  });

  it("accepts empty operations without error", () => {
    const memory = makeMemoryWithActiveSource();
    const next = applyMemoryOperations(memory, [], opts);
    expect(next.claims).toHaveLength(0);
    expect(next.revision).toBe(memory.revision + 1);
  });
});

describe("makeFixturePortrait source_id resolution", () => {
  it("uses placeholder source_ids when no memory provided", () => {
    const portrait = makeFixturePortrait();
    expect(portrait.behavioral_patterns[0].evidence_ref.source_id).toBe("fixture-source-0");
    expect(portrait.behavioral_patterns[1].evidence_ref.source_id).toBe("fixture-source-1");
    expect(portrait.psychological_features[0].evidence_ref.source_id).toBe("fixture-source-2");
  });

  it("uses real active source_ids when memory provided", () => {
    const memory = makeMemoryWithActiveSource();
    // Add more sources for all evidence refs
    memory.source_heads.push(
      { session_id: "test-session", source_id: "src-active-2", active_revision: 1, status: "active" },
      { session_id: "test-session", source_id: "src-active-3", active_revision: 1, status: "active" },
    );
    memory.source_versions.push(
      { source_id: "src-active-2", session_id: "test-session", revision: 1, kind: "question_answer", created_at: nowISO(), untrusted: false, text_ref: "ref-2" },
      { source_id: "src-active-3", session_id: "test-session", revision: 1, kind: "question_answer", created_at: nowISO(), untrusted: false, text_ref: "ref-3" },
    );

    const portrait = makeFixturePortrait(memory);
    expect(portrait.behavioral_patterns[0].evidence_ref.source_id).toBe("src-active-1");
    expect(portrait.behavioral_patterns[1].evidence_ref.source_id).toBe("src-active-2");
    expect(portrait.psychological_features[0].evidence_ref.source_id).toBe("src-active-3");
  });

  it("falls back to placeholder when memory has no active sources", () => {
    const memory = makeEmptyWorkingMemory("test-session");
    const portrait = makeFixturePortrait(memory);
    expect(portrait.behavioral_patterns[0].evidence_ref.source_id).toBe("fixture-source-0");
  });

  it("ignores untrusted sources", () => {
    const memory = makeMemoryWithActiveSource();
    memory.source_versions[0].untrusted = true;
    const portrait = makeFixturePortrait(memory);
    expect(portrait.behavioral_patterns[0].evidence_ref.source_id).toBe("fixture-source-0");
  });

  it("ignores inactive sources", () => {
    const memory = makeMemoryWithInactiveSource();
    // Only the inactive source exists, no active ones
    memory.source_heads = memory.source_heads.filter((h) => h.source_id === "src-inactive-1");
    memory.source_versions = memory.source_versions.filter((v) => v.source_id === "src-inactive-1");
    const portrait = makeFixturePortrait(memory);
    expect(portrait.behavioral_patterns[0].evidence_ref.source_id).toBe("fixture-source-0");
  });
});
