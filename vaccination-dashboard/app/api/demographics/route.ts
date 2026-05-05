/*
 * GET /api/demographics?vaccine=<id>&dimension=<ethnicity|age_band|risk_group>
 *
 * Returns uptake rate per demographic group for the given vaccine.
 * See lib/db.ts → getDemographicUptake for the underlying SQL.
 */

import { NextRequest } from 'next/server';
import {
  getDemographicUptake,
  DEMOGRAPHIC_DIMENSIONS,
  type DemographicDimension,
  type DemographicUptakeResponse,
  type ApiError,
} from '@/lib/db';

// better-sqlite3 is a native module → must run on Node, never Edge.
export const runtime = 'nodejs';
// Always read live from the DB file; never cache at build/request layer.
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

  const rows = getDemographicUptake(vaccineId, dimension);
  const body: DemographicUptakeResponse = { vaccine_id: vaccineId, dimension, rows };
  return Response.json(body);
}
