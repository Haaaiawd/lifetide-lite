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
 * Consume an invite code slot within an existing transaction.
 * Used by the register route to make invite consumption + user creation atomic.
 *
 * Uses updateMany with a WHERE guard (usedCount < maxUses) so that concurrent
 * requests cannot over-consume the last slot — only the first one that matches
 * will actually increment.
 */
export async function consumeInviteCodeInTx(
  tx: PrismaTransaction,
  normalizedCode: string,
): Promise<InviteSource | null> {
  const record = await tx.inviteCode.findUnique({ where: { code: normalizedCode } });
  if (!record) return null;
  if (record.exhausted) return null;
  if (record.usedCount >= record.maxUses) return null;

  // Atomic conditional update: only succeeds if usedCount is still below maxUses.
  // This prevents two concurrent requests from both passing the check above
  // and then both incrementing past the limit.
  const willBeExhausted = record.usedCount + 1 >= record.maxUses;
  const result = await tx.inviteCode.updateMany({
    where: { id: record.id, usedCount: { lt: record.maxUses } },
    data: {
      usedCount: { increment: 1 },
      exhausted: willBeExhausted,
    },
  });

  if (result.count === 0) return null; // someone else grabbed the last slot
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
  const existing = await prisma.inviteCode.findFirst({
    where: { source: "social" },
    orderBy: { createdAt: "desc" },
  });
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
