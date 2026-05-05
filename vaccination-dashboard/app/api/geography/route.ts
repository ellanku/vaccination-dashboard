/*
 * GET /api/geography?vaccine=<id?>
 *
 * Returns total population and vaccinated count per NHS England region,
 * derived from postcode. The `vaccine` query param is optional — when
 * omitted, every vaccination is counted toward vaccinated_count.
 *
 * See lib/db.ts → getRegionalUptake for the underlying SQL.
 */

import { NextRequest } from 'next/server';
import {
  getRegionalUptake,
  type RegionalUptakeResponse,
  type ApiError,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
): Promise<Response> {
  const vaccineRaw = request.nextUrl.searchParams.get('vaccine');

  let vaccineId: number | null = null;
  if (vaccineRaw !== null && vaccineRaw !== '') {
    const parsed = Number.parseInt(vaccineRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      const body: ApiError = { error: 'Query param "vaccine" must be a positive integer when provided.' };
      return Response.json(body, { status: 400 });
    }
    vaccineId = parsed;
  }

  const rows = getRegionalUptake(vaccineId);
  const body: RegionalUptakeResponse = { vaccine_id: vaccineId, rows };
  return Response.json(body);
}
