import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getStarCampaign, createOrUpdateStarCampaign } from "@/lib/auth/invite";

// GET — admin: return star campaign details
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request);
  if (response) return response;

  const campaign = await getStarCampaign();
  if (!campaign) {
    return NextResponse.json({ enabled: false, campaign: null });
  }

  const remaining = Math.max(0, campaign.maxUses - campaign.usedCount);
  return NextResponse.json({
    enabled: !campaign.exhausted && remaining > 0,
    campaign: {
      ...campaign,
      remaining,
    },
  });
}

// PATCH — admin: create or update star campaign maxUses
export async function PATCH(request: NextRequest) {
  const { user, response } = await requireAdmin(request);
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const maxUses = Math.max(1, Math.min(10000, Number(body.maxUses) || 0));

  if (maxUses < 1) {
    return NextResponse.json({ error: "maxUses 至少为 1" }, { status: 400 });
  }

  const result = await createOrUpdateStarCampaign({
    maxUses,
    createdBy: user!.email,
  });

  const campaign = await getStarCampaign();
  return NextResponse.json({
    id: result.id,
    code: result.code,
    maxUses: result.maxUses,
    usedCount: campaign?.usedCount ?? 0,
    remaining: campaign ? Math.max(0, campaign.maxUses - campaign.usedCount) : 0,
  });
}
