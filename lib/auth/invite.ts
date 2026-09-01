import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I)

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
}): Promise<{ code: string; id: string; maxUses: number }> {
  // Try a few times in case of collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const record = await prisma.inviteCode.create({
        data: {
          code,
          maxUses: opts.maxUses ?? 5,
          note: opts.note,
          createdBy: opts.createdBy,
        },
      });
      return { code: record.code, id: record.id, maxUses: record.maxUses };
    } catch (err: any) {
      // Unique constraint violation — retry
      if (err?.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Failed to generate unique invite code after 5 attempts");
}

export async function validateAndConsumeInviteCode(code: string): Promise<boolean> {
  const record = await prisma.inviteCode.findUnique({ where: { code: code.toUpperCase().trim() } });
  if (!record) return false;
  if (record.exhausted) return false;
  if (record.usedCount >= record.maxUses) return false;

  const updated = await prisma.inviteCode.update({
    where: { id: record.id },
    data: {
      usedCount: { increment: 1 },
      exhausted: record.usedCount + 1 >= record.maxUses,
    },
  });

  return true;
}
