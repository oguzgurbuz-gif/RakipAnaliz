import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCorsHeaders } from '@/lib/response'

export async function GET() {
  try {
    const [total, aiCount, missingDates, bothDates, missingBody, suspicious, active, ended, pending] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE metadata->'ai_analysis'->>'summary' IS NOT NULL`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE valid_from IS NULL OR valid_to IS NULL`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE valid_from IS NOT NULL AND valid_to IS NOT NULL`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE body IS NULL OR body = ''`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE status = 'updated'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE status = 'active'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE status = 'ended'`),
      query<{ count: string }>(`SELECT COUNT(*) as count FROM campaigns WHERE status = 'pending'`),
    ])

    return NextResponse.json({
      totalCampaigns: parseInt(total[0]?.count || '0', 10),
      campaignsWithAiAnalysis: parseInt(aiCount[0]?.count || '0', 10),
      campaignsMissingDates: parseInt(missingDates[0]?.count || '0', 10),
      campaignsWithBothDates: parseInt(bothDates[0]?.count || '0', 10),
      campaignsMissingBody: parseInt(missingBody[0]?.count || '0', 10),
      suspiciousCampaigns: parseInt(suspicious[0]?.count || '0', 10),
      activeCampaigns: parseInt(active[0]?.count || '0', 10),
      endedCampaigns: parseInt(ended[0]?.count || '0', 10),
      pendingCampaigns: parseInt(pending[0]?.count || '0', 10),
    })
  } catch (error) {
    console.error('Quality stats error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCorsHeaders() })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}