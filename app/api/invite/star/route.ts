import { NextResponse } from "next/server";
import { getStarCampaign } from "@/lib/auth/invite";

// GET — public: return star campaign status (remaining slots etc.)
export async function GET() {
  const campaign = await getStarCampaign();
  if (!campaign) {
    return NextResponse.json({
      enabled: false,
      remaining: 0,
      total: 0,
      used: 0,
      code: null,
    });
  }

  const remaining = Math.max(0, campaign.maxUses - campaign.usedCount);
  const enabled = !campaign.exhausted && remaining > 0;

  return NextResponse.json({
    enabled,
    remaining,
    total: campaign.maxUses,
    used: campaign.usedCount,
    code: enabled ? campaign.code : null,
  });
}

// POST — public: "I've starred, give me the code" (honor system)
export async function POST() {
  const campaign = await getStarCampaign();
  if (!campaign) {
    return NextResponse.json(
      { error: "Star campaign is not active", code: null },
      { status: 404 },
    );
  }

  const remaining = Math.max(0, campaign.maxUses - campaign.usedCount);
  if (campaign.exhausted || remaining <= 0) {
    return NextResponse.json(
      { error: "名额已用完", code: null, remaining: 0 },
      { status: 403 },
    );
  }

  return NextResponse.json({
    code: campaign.code,
    remaining,
    total: campaign.maxUses,
    used: campaign.usedCount,
  });
}
