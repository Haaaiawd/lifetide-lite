// Event envelope factory. Host code owns event identity, ordering, idempotency and provenance.

import { randomUUID } from "node:crypto";
import { hashObject } from "@/lib/utils/hash";
import type { EventEnvelope, Id, Revision, ISODateTime } from "./contracts";

export type EnvelopeInput<T> = {
  event_id?: Id;
  session_id: Id;
  actor: "user" | "host" | "interviewer" | "sensemaker" | "system";
  base_revision: Revision;
  idempotency_key: string;
  correlation_id?: Id;
  causation_id?: Id;
  proposal_id?: Id;
  payload: T;
  emitted_at?: ISODateTime;
};

export function makeEnvelope<TType extends string, TPayload>(
  eventType: TType,
  input: EnvelopeInput<TPayload>
): EventEnvelope<TType, TPayload> {
  const payloadHash = hashObject(input.payload);
  return {
    event_id: input.event_id ?? randomUUID(),
    event_type: eventType,
    schema_version: 3,
    session_id: input.session_id,
    actor: input.actor,
    base_revision: input.base_revision,
    emitted_at: input.emitted_at ?? new Date().toISOString(),
    idempotency_key: input.idempotency_key,
    correlation_id: input.correlation_id ?? randomUUID(),
    causation_id: input.causation_id,
    proposal_id: input.proposal_id,
    safety_flag: undefined,
    payload_hash: payloadHash,
    payload: input.payload,
  };
}
