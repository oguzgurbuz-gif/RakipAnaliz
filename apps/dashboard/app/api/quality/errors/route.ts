import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getCorsHeaders } from '@/lib/response'

export async function GET() {
  try {
    const result = await query(`
      SELECT severity, COUNT(*) as count
      FROM error_logs
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY severity
      ORDER BY count DESC
    `)

    return NextResponse.json(result)
  } catch (error) {
    console.error('Quality errors error:', error)
    return NextResponse.json([], { headers: getCorsHeaders() })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders() })
}