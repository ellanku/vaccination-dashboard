// The contents of the Overview tab. Pulls the four KPI numbers from
// /api/kpis (one request, not four) and renders them as cards.

'use client';

import { useEffect, useState } from 'react';
import { KpiCard } from './KpiCard';
import { ChartArea } from './FilterBar';
import type { KpiData } from '@/lib/db';

export interface OverviewPanelProps {
  startDate?: string;
  endDate?: string;
}

export function OverviewPanel({ startDate, endDate }: OverviewPanelProps = {}) {
  const [data, setData] = useState<KpiData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const query = qs.toString();
    fetch(query ? `/api/kpis?${query}` : '/api/kpis')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as KpiData;
      })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Dashboard summary</h2>
        <p className="mt-1 text-sm text-slate-600">
          Key metrics at a glance: patient population, vaccination coverage, and outreach effectiveness.
        </p>
      </div>

      <ChartArea
        isLoading={data === null}
        error={error}
        isEmpty={false}
        height={180}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total patients"
            value={data?.total_patients.toLocaleString() ?? '—'}
          />
          <KpiCard
            label="Overall coverage"
            value={data?.overall_coverage_pct ?? '—'}
            unit="%"
            highlight
          />
          <KpiCard
            label="Invitation conversion"
            value={data?.conversion_pct ?? '—'}
            unit="%"
          />
          <KpiCard
            label="Lowest-coverage region"
            value={data?.lowest_coverage_region ?? '—'}
          />
        </div>
      </ChartArea>
    </section>
  );
}
