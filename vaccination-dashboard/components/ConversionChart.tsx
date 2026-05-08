// Stacked bar chart showing invitation conversion per channel.
// Converted (NHS blue) sits at the bottom, not-converted (slate) on top,
// sharing a stackId so the total bar height equals the total invitations
// for that channel. The only filter is the global date range from the page.

'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartArea } from './FilterBar';
import type { ChannelConversionResponse, ChannelConversionRow } from '@/lib/db';

export interface ConversionChartProps {
  startDate?: string;
  endDate?: string;
}

export function ConversionChart({ startDate, endDate }: ConversionChartProps = {}) {
  const [rows, setRows] = useState<ChannelConversionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const query = qs.toString();
    fetch(query ? `/api/conversion?${query}` : '/api/conversion')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ChannelConversionResponse;
      })
      .then((res) => {
        if (!cancelled) setRows(res.rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  return (
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Invitation conversion</h2>
        <p className="mt-1 text-sm text-slate-600">
          Of every invitation sent, how many resulted in a vaccination — split by the
          channel the invitation was sent through.
        </p>
      </header>

      <ChartArea
        isLoading={rows === null}
        error={error}
        isEmpty={rows !== null && rows.length === 0}
        height={300}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows ?? []} margin={{ top: 16, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="channel" tick={{ fontSize: 12, fill: '#475569' }} />
            <YAxis tick={{ fontSize: 12, fill: '#475569' }} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              }}
              formatter={(value, name, item) => {
                if (name === 'Converted') {
                  const row = item.payload as ChannelConversionRow;
                  return [`${value} (${row.conversion_pct}%)`, name];
                }
                return [String(value), name];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Bar
              dataKey="converted"
              name="Converted"
              stackId="invitations"
              fill="#005EB8"
              maxBarSize={80}
            />
            <Bar
              dataKey="not_converted"
              name="Not converted"
              stackId="invitations"
              fill="#cbd5e1"
              maxBarSize={80}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartArea>
    </section>
  );
}
