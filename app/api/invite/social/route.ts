import { NextRequest, NextResponse } from "next/server";
import { getSocialCampaign } from "@/lib/auth/invite";

// GET — public campaign status (no code revealed)
export async function GET() {
  const campaign = await getSocialCampaign();
  if (!campaign) {
    return NextResponse.json({ enabled: false, remaining: 0, total: 0, used: 0 });
  }
  return NextResponse.json({
    enabled: !campaign.exhausted && campaign.remaining > 0,
    remaining: campaign.remaining,
    total: campaign.maxUses,
    used: campaign.usedCount,
  });
}

// POST — claim the campaign code (honor system, no verification)
export async function POST(request: NextRequest) {
  const campaign = await getSocialCampaign();
  if (!campaign || campaign.exhausted || campaign.remaining <= 0) {
    return NextResponse.json(
      { error: "名额已用完" },
      { status: 403 },
    );
  }

  // Honor system: just return the code. The slot is consumed at registration,
  // not here — this avoids wasting slots on users who claim but don't register.
  return NextResponse.json({
    code: campaign.code,
    remaining: campaign.remaining,
    total: campaign.maxUses,
    used: campaign.usedCount,
  });
}
