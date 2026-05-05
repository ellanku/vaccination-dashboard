/*
 * DemographicChart — uptake percentage per demographic group for one vaccine.
 *
 * Owns its own filter state (vaccine + dimension) and re-fetches from
 * /api/demographics whenever either dropdown changes.
 */

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
import { ChartArea, FilterBar, FilterSelect } from './FilterBar';
import type {
  DemographicDimension,
  DemographicUptakeResponse,
  DemographicUptakeRow,
  VaccineOption,
} from '@/lib/db';

const DIMENSION_OPTIONS = [
  { value: 'ethnicity', label: 'Ethnicity' },
  { value: 'age_band', label: 'Age band' },
  { value: 'risk_group', label: 'Risk group' },
] as const;

export interface DemographicChartProps {
  vaccines: VaccineOption[];
  startDate?: string;
  endDate?: string;
}

export function DemographicChart({ vaccines, startDate, endDate }: DemographicChartProps) {
  const [vaccineId, setVaccineId] = useState<number>(vaccines[0]?.vaccine_id ?? 1);
  const [dimension, setDimension] = useState<DemographicDimension>('ethnicity');
  const [rows, setRows] = useState<DemographicUptakeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const qs = new URLSearchParams({ vaccine: String(vaccineId), dimension });
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    fetch(`/api/demographics?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as DemographicUptakeResponse;
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
  }, [vaccineId, dimension, startDate, endDate]);

  const vaccineName = vaccines.find((v) => v.vaccine_id === vaccineId)?.vaccine_name ?? '';

  return (
    <section className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">Demographic uptake</h2>
        <p className="mt-1 text-sm text-slate-600">
          Share of the eligible cohort that received {vaccineName || 'the selected vaccine'},
          broken down by the chosen demographic dimension.
        </p>
      </header>

      <div className="mb-4">
        <FilterBar>
          <FilterSelect
            label="Vaccine"
            value={String(vaccineId)}
            options={vaccines.map((v) => ({ value: String(v.vaccine_id), label: v.vaccine_name }))}
            onChange={(v) => setVaccineId(Number(v))}
          />
          <FilterSelect
            label="Dimension"
            value={dimension}
            options={DIMENSION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(v) => setDimension(v as DemographicDimension)}
          />
        </FilterBar>
      </div>

      <ChartArea isLoading={rows === null} error={error} isEmpty={rows !== null && rows.length === 0}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows ?? []} margin={{ top: 16, right: 12, bottom: 8, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="group_label"
              tick={{ fontSize: 12, fill: '#475569' }}
              interval={0}
              angle={dimension === 'ethnicity' || dimension === 'risk_group' ? -15 : 0}
              textAnchor={dimension === 'ethnicity' || dimension === 'risk_group' ? 'end' : 'middle'}
              height={dimension === 'ethnicity' || dimension === 'risk_group' ? 60 : 30}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fontSize: 12, fill: '#475569' }}
            />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              }}
              formatter={(value, _name, item) => {
                const row = item.payload as DemographicUptakeRow;
                return [`${value}% (${row.vaccinated_count}/${row.eligible_count})`, 'Uptake'];
              }}
            />
            <Bar dataKey="uptake_pct" fill="#005EB8" radius={[4, 4, 0, 0]} maxBarSize={64} />
          </BarChart>
        </ResponsiveContainer>
      </ChartArea>
    </section>
  );
}
