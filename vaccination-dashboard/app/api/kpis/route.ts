/*
 * GET /api/kpis[?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 *
 * Returns KPI summary data: total patients, overall coverage %, conversion %,
 * and the lowest-coverage region. Optional startDate/endDate filter the
 * vaccination and invitation date columns respectively.
 *
 * See lib/db.ts → getKpis for the underlying SQL.
 */

import { NextRequest } from 'next/server';
import {
  getKpis,
  parseDateRange,
  type KpiData,
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

  const data: KpiData = await getKpis(dr.startDate, dr.endDate);
  return Response.json(data);
}
