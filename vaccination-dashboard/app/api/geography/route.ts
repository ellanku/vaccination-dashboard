/*
 * GET /api/geography?vaccine=<id?>[&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD]
 *
 * Returns total population and vaccinated count per NHS England region,
 * derived from postcode. The `vaccine` query param is optional — when
 * omitted, every vaccination is counted toward vaccinated_count.
 * Optional startDate/endDate restrict the vaccinated numerator to
 * vaccinations administered within the window.
 *
 * See lib/db.ts → getRegionalUptake for the underlying SQL.
 */

import { NextRequest } from 'next/server';
import {
  getRegionalUptake,
  parseDateRange,
  type RegionalUptakeResponse,
  type ApiError,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
): Promise<Response> {
  const params = request.nextUrl.searchParams;
  const vaccineRaw = params.get('vaccine');

  let vaccineId: number | null = null;
  if (vaccineRaw !== null && vaccineRaw !== '') {
    const parsed = Number.parseInt(vaccineRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      const body: ApiError = { error: 'Query param "vaccine" must be a positive integer when provided.' };
      return Response.json(body, { status: 400 });
    }
    vaccineId = parsed;
  }

  const dr = parseDateRange(params.get('startDate'), params.get('endDate'));
  if (dr.error) {
    const body: ApiError = { error: dr.error };
    return Response.json(body, { status: 400 });
  }

  const rows = await getRegionalUptake(vaccineId, dr.startDate, dr.endDate);
  const body: RegionalUptakeResponse = { vaccine_id: vaccineId, rows };
  return Response.json(body);
}
