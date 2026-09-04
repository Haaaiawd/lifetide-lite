import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/admin";
import { getSocialCampaign, createOrUpdateSocialCampaign } from "@/lib/auth/invite";

// GET — admin campaign status
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const campaign = await getSocialCampaign();
  return NextResponse.json({
    enabled: true,
    campaign: campaign
      ? {
          id: campaign.id,
          code: campaign.code,
          maxUses: campaign.maxUses,
          usedCount: campaign.usedCount,
          remaining: campaign.remaining,
          exhausted: campaign.exhausted,
        }
      : null,
  });
}

// PATCH — update campaign quota
export async function PATCH(request: NextRequest) {
  const { user, response } = await requireAdmin(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const maxUses = Number(body.maxUses);

  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10000) {
    return NextResponse.json(
      { error: "maxUses 必须是 1 到 10000 之间的整数" },
      { status: 400 },
    );
  }

  const result = await createOrUpdateSocialCampaign({
    maxUses,
    createdBy: user!.email,
  });

  const campaign = await getSocialCampaign();
  return NextResponse.json({
    id: result.id,
    code: result.code,
    maxUses: result.maxUses,
    usedCount: campaign?.usedCount ?? 0,
    remaining: campaign?.remaining ?? 0,
    exhausted: campaign?.exhausted ?? false,
  });
}
