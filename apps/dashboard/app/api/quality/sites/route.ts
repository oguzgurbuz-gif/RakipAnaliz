import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCorsHeaders } from '@/lib/response'

export async function GET() {
  try {
    const result = await query(`
      SELECT
        s.name as site_name,
        s.code as site_code,
        COUNT(c.id) as total_campaigns,
        COUNT(CASE WHEN c.metadata->'ai_analysis'->>'summary' IS NOT NULL THEN 1 END) as with_ai,
        COUNT(CASE WHEN c.valid_from IS NULL OR c.valid_to IS NULL THEN 1 END) as missing_dates,
        COUNT(CASE WHEN c.body IS NULL OR c.body = '' THEN 1 END) as missing_body
      FROM sites s
      LEFT JOIN campaigns c ON c.site_id = s.id
      WHERE s.is_active = true
      GROUP BY s.id, s.name, s.code
      ORDER BY total_campaigns DESC
      LIMIT 20
    `)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Quality sites error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: getCorsHeaders() })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}