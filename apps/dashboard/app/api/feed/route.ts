import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCorsHeaders } from '@/lib/response';

type CampaignRow = {
  id: string;
  title: string;
  status: string;
  valid_from: Date | null;
  valid_to: Date | null;
  first_seen_at: Date;
  last_seen_at: Date;
  primary_image_url: string | null;
  site_name: string;
  site_code: string;
};

export async function GET(request: Request) {
  try {
    const rows = await query<CampaignRow>(`
      SELECT 
        c.id,
        c.title,
        c.status,
        c.valid_from,
        c.valid_to,
        c.created_at as first_seen_at,
        c.last_seen_at,
        c.primary_image_url,
        s.name as site_name,
        s.code as site_code
      FROM campaigns c
      JOIN sites s ON s.id = c.site_id
      ORDER BY c.last_seen_at DESC
      LIMIT 20
    `);

    const feed = rows.map((row: CampaignRow) => ({
      id: row.id,
      title: row.title,
      site: row.site_name,
      siteCode: row.site_code,
      image: row.primary_image_url,
      status: row.status,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      date: row.last_seen_at,
    }));

    return NextResponse.json(
      {
        success: true,
        data: {
          title: 'Kampanya Feed',
          description: 'Latest campaigns from all sites',
          items: feed,
        },
      },
      { headers: getCorsHeaders(request) }
    );
  } catch (error) {
    console.error('Feed API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An error occurred',
        },
      },
      { status: 500, headers: getCorsHeaders(request) }
    );
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}