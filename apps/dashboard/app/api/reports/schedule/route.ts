import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { query, execute, queryOne } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  errorResponse,
  handleApiError,
  getCorsHeaders,
} from '@/lib/response';

const recipientsSchema = z
  .union([
    z.array(z.string().email()),
    z
      .string()
      .min(1)
      .transform((value) =>
        value
          .split(/[,\n;]/)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      )
      .pipe(z.array(z.string().email())),
  ])
  .refine((arr) => arr.length > 0, { message: 'At least one recipient is required' });

const createSchema = z.object({
  frequency: z.enum(['weekly', 'monthly']),
  recipients: recipientsSchema,
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  hour: z.number().int().min(0).max(23).optional(),
  enabled: z.boolean().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  frequency: z.enum(['weekly', 'monthly']).optional(),
  recipients: recipientsSchema.optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  hour: z.number().int().min(0).max(23).optional(),
  enabled: z.boolean().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

type ReportScheduleRow = {
  id: string;
  frequency: 'weekly' | 'monthly';
  recipients: string | string[] | null;
  day_of_week: number | null;
  hour: number;
  enabled: number | boolean;
  last_sent_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

interface ReportScheduleDto {
  id: string;
  frequency: 'weekly' | 'monthly';
  recipients: string[];
  dayOfWeek: number | null;
  hour: number;
  enabled: boolean;
  lastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseRecipients(value: ReportScheduleRow['recipients']): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string');
      }
    } catch {
      return [];
    }
  }
  return [];
}

function toDto(row: ReportScheduleRow): ReportScheduleDto {
  return {
    id: String(row.id),
    frequency: row.frequency,
    recipients: parseRecipients(row.recipients),
    dayOfWeek: row.day_of_week ?? null,
    hour: row.hour,
    enabled: Boolean(row.enabled),
    lastSentAt: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function GET() {
  try {
    const rows = await query<ReportScheduleRow>(
      `SELECT id, frequency, recipients, day_of_week, hour, enabled,
              last_sent_at, created_at, updated_at
       FROM report_schedules
       ORDER BY created_at DESC`
    );
    return successResponse(rows.map(toDto));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.parse(body);
    const dayOfWeek = parsed.dayOfWeek ?? (parsed.frequency === 'weekly' ? 1 : null);
    const hour = parsed.hour ?? 9;
    const enabled = parsed.enabled ?? true;

    const id = randomUUID();
    await execute(
      `INSERT INTO report_schedules (id, frequency, recipients, day_of_week, hour, enabled)
       VALUES ($1, $2, CAST($3 AS JSON), $4, $5, $6)`,
      [
        id,
        parsed.frequency,
        JSON.stringify(parsed.recipients),
        dayOfWeek,
        hour,
        enabled ? 1 : 0,
      ]
    );

    const row = await queryOne<ReportScheduleRow>(
      `SELECT id, frequency, recipients, day_of_week, hour, enabled,
              last_sent_at, created_at, updated_at
       FROM report_schedules
       WHERE id = $1`,
      [id]
    );

    if (!row) {
      return errorResponse('INTERNAL_ERROR', 'Failed to load created schedule', 500);
    }
    return createdResponse(toDto(row));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', error.errors[0]?.message ?? 'Invalid payload', 400);
    }
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = updateSchema.parse(body);

    const existing = await queryOne<ReportScheduleRow>(
      `SELECT id FROM report_schedules WHERE id = $1`,
      [parsed.id]
    );
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Schedule not found', 404);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (parsed.frequency !== undefined) {
      fields.push(`frequency = $${i++}`);
      values.push(parsed.frequency);
    }
    if (parsed.recipients !== undefined) {
      fields.push(`recipients = CAST($${i++} AS JSON)`);
      values.push(JSON.stringify(parsed.recipients));
    }
    if (parsed.dayOfWeek !== undefined) {
      fields.push(`day_of_week = $${i++}`);
      values.push(parsed.dayOfWeek);
    }
    if (parsed.hour !== undefined) {
      fields.push(`hour = $${i++}`);
      values.push(parsed.hour);
    }
    if (parsed.enabled !== undefined) {
      fields.push(`enabled = $${i++}`);
      values.push(parsed.enabled ? 1 : 0);
    }

    if (fields.length === 0) {
      return errorResponse('VALIDATION_ERROR', 'No fields to update', 400);
    }

    values.push(parsed.id);
    await execute(
      `UPDATE report_schedules SET ${fields.join(', ')} WHERE id = $${i}`,
      values
    );

    const row = await queryOne<ReportScheduleRow>(
      `SELECT id, frequency, recipients, day_of_week, hour, enabled,
              last_sent_at, created_at, updated_at
       FROM report_schedules
       WHERE id = $1`,
      [parsed.id]
    );

    if (!row) {
      return errorResponse('NOT_FOUND', 'Schedule disappeared after update', 404);
    }
    return successResponse(toDto(row));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', error.errors[0]?.message ?? 'Invalid payload', 400);
    }
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const idFromQuery = url.searchParams.get('id');
    const body = idFromQuery
      ? { id: idFromQuery }
      : await request.json().catch(() => ({}));
    const { id } = deleteSchema.parse(body);

    const existing = await queryOne<ReportScheduleRow>(
      `SELECT id FROM report_schedules WHERE id = $1`,
      [id]
    );
    if (!existing) {
      return errorResponse('NOT_FOUND', 'Schedule not found', 404);
    }

    await execute(`DELETE FROM report_schedules WHERE id = $1`, [id]);
    return successResponse({ id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('VALIDATION_ERROR', error.errors[0]?.message ?? 'Invalid payload', 400);
    }
    return handleApiError(error);
  }
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}
