/*
 * GET /api/conversion[?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 *
 * Returns invitation conversion rate grouped by channel
 * (SMS / Email / Letter). Optional startDate/endDate filter restricts
 * which invitations are counted (by Invitation.invitation_date).
 *
 * See lib/db.ts → getChannelConversion for the underlying SQL.
 */

import { NextRequest } from 'next/server';
import {
  getChannelConversion,
  parseDateRange,
  type ChannelConversionResponse,
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

  const rows = getChannelConversion(dr.startDate, dr.endDate);
  const body: ChannelConversionResponse = { rows };
  return Response.json(body);
}
