// GET /api/demographics?vaccine=<id>&dimension=<ethnicity|age_band|risk_group>
//                      [&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
//
// Returns the uptake rate for one vaccine, broken down by the chosen
// demographic dimension. If a date range is given, it only filters the
// vaccinated count, not the eligible cohort, so the percentage shows
// "of all eligible patients, how many got vaccinated in this window".
//
// SQL lives in lib/db.ts (getDemographicUptake).

import { NextRequest } from 'next/server';
import {
  getDemographicUptake,
  parseDateRange,
  DEMOGRAPHIC_DIMENSIONS,
  type DemographicDimension,
  type DemographicUptakeResponse,
  type ApiError,
} from '@/lib/db';

// Use the Node runtime (libSQL client works on edge too, but staying on
// Node keeps things simple and lets us share one connection setup).
export const runtime = 'nodejs';
// We always want a live read from the DB, so don't let Next.js cache.
export const dynamic = 'force-dynamic';

function isDimension(v: string | null): v is DemographicDimension {
  return v !== null && (DEMOGRAPHIC_DIMENSIONS as readonly string[]).includes(v);
}

export async function GET(
  request: NextRequest,
): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const vaccineRaw = params.get('vaccine');
  const dimension = params.get('dimension');

  const vaccineId = vaccineRaw === null ? NaN : Number.parseInt(vaccineRaw, 10);
  if (!Number.isInteger(vaccineId) || vaccineId <= 0) {
    const body: ApiError = { error: 'Query param "vaccine" must be a positive integer.' };
    return Response.json(body, { status: 400 });
  }

  if (!isDimension(dimension)) {
    const body: ApiError = {
      error: `Query param "dimension" must be one of: ${DEMOGRAPHIC_DIMENSIONS.join(', ')}.`,
    };
    return Response.json(body, { status: 400 });
  }

  const dr = parseDateRange(params.get('startDate'), params.get('endDate'));
  if (dr.error) {
    const body: ApiError = { error: dr.error };
    return Response.json(body, { status: 400 });
  }

  const rows = await getDemographicUptake(vaccineId, dimension, dr.startDate, dr.endDate);
  const body: DemographicUptakeResponse = { vaccine_id: vaccineId, dimension, rows };
  return Response.json(body);
}
