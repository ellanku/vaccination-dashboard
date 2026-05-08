// Grouped bar chart with two bars per region: total population and
// vaccinated count. The uptake percentage sits above the vaccinated bar
// so you can read the gap at a glance. Vaccine dropdown defaults to
// "All vaccines" (no filter applied).

'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartArea, FilterBar, FilterSelect } from './FilterBar';
import type {
  RegionalUptakeResponse,
  RegionalUptakeRow,
  VaccineOption,
} from '@/lib/db';

const ALL_VACCINES = '';

export interface GeographyChartProps {
  vaccines: VaccineOption[];
  startDate?: string;
  endDate?: string;
}

export function GeographyChart({ vaccines, startDate, endDate }: GeographyChartProps) {
  const [vaccineId, setVaccineId] = useState<string>(ALL_VACCINES);
  const [rows, setRows] = useState<RegionalUptakeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const qs = new URLSearchParams();
    if (vaccineId !== ALL_VACCINES) qs.set('vaccine', vaccineId);
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const query = qs.toString();
    fetch(query ? `/api/geography?${query}` : '/api/geography')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as RegionalUptakeResponse;
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
  }, [vaccineId, startDate, endDate]);

  return (
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Geographic comparison</h2>
        <p className="mt-1 text-sm text-slate-600">
          Patients vaccinated vs. total population per NHS England region. The percentage
          above each pair shows uptake; lower bars relative to the population bar mean
          fewer people in that region have been reached.
        </p>
      </header>

      <div className="mb-4">
        <FilterBar>
          <FilterSelect
            label="Vaccine"
            value={vaccineId}
            options={[
              { value: ALL_VACCINES, label: 'All vaccines' },
              ...vaccines.map((v) => ({ value: String(v.vaccine_id), label: v.vaccine_name })),
            ]}
            onChange={setVaccineId}
          />
        </FilterBar>
      </div>

      <ChartArea
        isLoading={rows === null}
        error={error}
        isEmpty={rows !== null && rows.length === 0}
        height={300}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rows ?? []} margin={{ top: 24, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="region"
              tick={{ fontSize: 11, fill: '#475569' }}
              interval={0}
              angle={-15}
              textAnchor="end"
              height={70}
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
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Bar
              dataKey="total_population"
              name="Total population"
              fill="#cbd5e1"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
            <Bar
              dataKey="vaccinated_count"
              name="Vaccinated"
              fill="#005EB8"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            >
              <LabelList
                dataKey="uptake_pct"
                position="top"
                formatter={(value: unknown) => `${value}%`}
                fill="#FFB81C"
                style={{ fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartArea>
    </section>
  );
}
