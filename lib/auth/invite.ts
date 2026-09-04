import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type PrismaTransaction = Prisma.TransactionClient;

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I)

export type InviteSource = "admin" | "star";

export function generateCode(length: number = 8): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return code;
}

export async function createInviteCode(opts: {
  maxUses?: number;
  note?: string;
  createdBy?: string;
  source?: InviteSource;
}): Promise<{ code: string; id: string; maxUses: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const record = await prisma.inviteCode.create({
        data: {
          code,
          maxUses: opts.maxUses ?? 5,
          note: opts.note,
          createdBy: opts.createdBy,
          source: opts.source ?? "admin",
        },
      });
      return { code: record.code, id: record.id, maxUses: record.maxUses };
    } catch (err: any) {
      if (err?.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Failed to generate unique invite code after 5 attempts");
}

/**
 * Validate and atomically consume one slot of an invite code.
 * Returns the code's source ("admin" | "star") on success, or null on failure.
 */
export async function validateAndConsumeInviteCode(
  code: string,
): Promise<InviteSource | null> {
  const normalized = code.toUpperCase().trim();
  const result = await prisma.$transaction(async (tx) => {
    return consumeInviteCodeInTx(tx, normalized);
  });
  return result;
}

/**
 * Consume an invite code slot within an existing transaction.
 * Used by the register route to make invite consumption + user creation atomic.
 */
export async function consumeInviteCodeInTx(
  tx: PrismaTransaction,
  normalizedCode: string,
): Promise<InviteSource | null> {
  const record = await tx.inviteCode.findUnique({ where: { code: normalizedCode } });
  if (!record) return null;
  if (record.exhausted) return null;
  if (record.usedCount >= record.maxUses) return null;

  await tx.inviteCode.update({
    where: { id: record.id },
    data: {
      usedCount: { increment: 1 },
      exhausted: record.usedCount + 1 >= record.maxUses,
    },
  });

  return record.source as InviteSource;
}

// --- Star campaign helpers ---

export async function getStarCampaign(): Promise<{
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  remaining: number;
  exhausted: boolean;
} | null> {
  const record = await prisma.inviteCode.findFirst({
    where: { source: "star" },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  return {
    id: record.id,
    code: record.code,
    maxUses: record.maxUses,
    usedCount: record.usedCount,
    remaining: Math.max(0, record.maxUses - record.usedCount),
    exhausted: record.exhausted,
  };
}

export async function createOrUpdateStarCampaign(opts: {
  maxUses: number;
  createdBy?: string;
}): Promise<{ id: string; code: string; maxUses: number }> {
  const existing = await prisma.inviteCode.findFirst({ where: { source: "star" } });
  if (existing) {
    const updated = await prisma.inviteCode.update({
      where: { id: existing.id },
      data: {
        maxUses: opts.maxUses,
        exhausted: existing.usedCount >= opts.maxUses,
      },
    });
    return { id: updated.id, code: updated.code, maxUses: updated.maxUses };
  }

  const created = await createInviteCode({
    maxUses: opts.maxUses,
    source: "star",
    note: "GitHub Star campaign",
    createdBy: opts.createdBy,
  });
  return created;
}

// --- Social campaign helpers ---

export async function getSocialCampaign(): Promise<{
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  remaining: number;
  exhausted: boolean;
} | null> {
  const record = await prisma.inviteCode.findFirst({
    where: { source: "social" },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return null;
  return {
    id: record.id,
    code: record.code,
    maxUses: record.maxUses,
    usedCount: record.usedCount,
    remaining: Math.max(0, record.maxUses - record.usedCount),
    exhausted: record.exhausted,
  };
}

export async function createOrUpdateSocialCampaign(opts: {
  maxUses: number;
  createdBy?: string;
}): Promise<{ id: string; code: string; maxUses: number }> {
  const existing = await prisma.inviteCode.findFirst({ where: { source: "social" } });
  if (existing) {
    const updated = await prisma.inviteCode.update({
      where: { id: existing.id },
      data: {
        maxUses: opts.maxUses,
        exhausted: existing.usedCount >= opts.maxUses,
      },
    });
    return { id: updated.id, code: updated.code, maxUses: updated.maxUses };
  }

  const created = await createInviteCode({
    maxUses: opts.maxUses,
    note: "Social campaign (GitHub Star / 小红书 Follow)",
    createdBy: opts.createdBy,
  });
  // Mark source as social
  await prisma.inviteCode.update({
    where: { id: created.id },
    data: { source: "social" },
  });
  return created;
}
