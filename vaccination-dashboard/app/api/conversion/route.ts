/*
 * GET /api/conversion
 *
 * Returns invitation conversion rate grouped by channel
 * (SMS / Email / Letter). No query parameters.
 *
 * See lib/db.ts → getChannelConversion for the underlying SQL.
 */

import {
  getChannelConversion,
  type ChannelConversionResponse,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const rows = getChannelConversion();
  const body: ChannelConversionResponse = { rows };
  return Response.json(body);
}
