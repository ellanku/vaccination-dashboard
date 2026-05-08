// Bar chart showing how the conversion rate changes with the number of
// reminders sent. Buckets are 0, 1, 2, and 3+ reminders. The point is to
// see whether sending more reminders actually pushes more people to get
// vaccinated.

'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartArea } from './FilterBar';
import type { ReminderConversionResponse, ReminderConversionRow } from '@/lib/db';

export interface ReminderChartProps {
  startDate?: string;
  endDate?: string;
}

export function ReminderChart({ startDate, endDate }: ReminderChartProps = {}) {
  const [rows, setRows] = useState<ReminderConversionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const query = qs.toString();
    fetch(query ? `/api/reminders?${query}` : '/api/reminders')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ReminderConversionResponse;
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
        <h2 className="text-lg font-semibold text-slate-900">Reminder effectiveness</h2>
        <p className="mt-1 text-sm text-slate-600">
          Vaccination conversion rate by number of reminders sent to patients.
          Shows whether additional reminders improve uptake.
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
            <XAxis
              dataKey="reminder_count"
              label={{ value: 'Number of reminders', position: 'insideBottom', offset: -4 }}
              tick={{ fontSize: 12, fill: '#475569' }}
            />
            <YAxis tick={{ fontSize: 12, fill: '#475569' }} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              }}
              formatter={(value, name) => {
                if (name === 'conversion_pct') {
                  return [`${value}%`, 'Conversion rate'];
                }
                return [String(value), name];
              }}
              labelFormatter={(label) => `${label} reminder${label !== '1' ? 's' : ''}`}
            />
            <Bar
              dataKey="conversion_pct"
              name="Conversion rate"
              fill="#005EB8"
              maxBarSize={80}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartArea>
    </section>
  );
}
