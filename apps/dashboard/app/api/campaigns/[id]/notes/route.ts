import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, queryOne, execute } from '@/lib/db';
import { successResponse, createdResponse, errorResponse, handleApiError, getCorsHeaders } from '@/lib/response';
import { NotFoundError, ValidationError } from '@bitalih/shared/errors';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const createNoteSchema = z.object({
  authorName: z.string().min(1).max(128).optional(),
  noteText: z.string().min(1).max(5000),
  noteType: z.string().max(32).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = paramsSchema.parse(await params);
    const body = await request.json();
    const { authorName, noteText, noteType } = createNoteSchema.parse(body);

    const campaignCheck = await queryOne<{ id: string }>(
      'SELECT id FROM campaigns WHERE id = $1',
      [campaignId]
    );

    if (!campaignCheck) {
      throw new NotFoundError('Campaign', campaignId);
    }

    const result = await queryOne<{
      id: string;
      campaign_id: string;
      author_name: string | null;
      note_text: string;
      note_type: string | null;
      is_pinned: boolean;
      created_at: Date;
      updated_at: Date;
    }>(`
      INSERT INTO campaign_notes (campaign_id, author_name, note_text, note_type)
      VALUES ($1, $2, $3, $4)
      RETURNING id, campaign_id, author_name, note_text, note_type, is_pinned, created_at, updated_at
    `, [campaignId, authorName || null, noteText, noteType || null]);

    if (!result) {
      throw new ValidationError('Failed to create note');
    }

    const note = {
      id: result.id,
      campaignId: result.campaign_id,
      authorName: result.author_name,
      noteText: result.note_text,
      noteType: result.note_type,
      isPinned: result.is_pinned,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
    };

    return createdResponse(note);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return errorResponse(error.code, error.message, error.statusCode);
    }
    return handleApiError(error);
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
