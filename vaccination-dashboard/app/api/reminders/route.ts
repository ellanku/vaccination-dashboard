/*
 * GET /api/reminders[?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 *
 * Returns invitation conversion rate grouped by reminder count (0, 1, 2, 3+).
 * Shows the effectiveness of reminder interventions on vaccination uptake.
 * Optional startDate/endDate restrict which invitations are counted
 * (by Invitation.invitation_date).
 *
 * See lib/db.ts → getReminderConversion for the underlying SQL.
 */

import { NextRequest } from 'next/server';
import {
  getReminderConversion,
  parseDateRange,
  type ReminderConversionResponse,
  type ApiError,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const dr = parseDateRange(params.get('startDate'), params.get('endDate'));
  if (dr.error) {
    const body: ApiError = { error: dr.error };
    return Response.json(body, { status: 400 });
  }

  const rows = getReminderConversion(dr.startDate, dr.endDate);
  const body: ReminderConversionResponse = { rows };
  return Response.json(body);
}
