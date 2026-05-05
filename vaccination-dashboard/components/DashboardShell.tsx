/*
 * DashboardShell — client-side container for tab + date-range state.
 *
 * Holds (1) the active tab and (2) the global date range (initialised from
 * the dataset's bounds passed in by app/page.tsx). Renders TabNav and the
 * DateRangeFilter, then conditionally renders the appropriate panel,
 * threading startDate/endDate down to every chart and the KPI panel.
 */

'use client';

import { useCallback, useState } from 'react';
import { TabNav } from './TabNav';
import { DateRangeFilter } from './DateRangeFilter';
import { DemographicChart } from './DemographicChart';
import { GeographyChart } from './GeographyChart';
import { ConversionChart } from './ConversionChart';
import { ReminderChart } from './ReminderChart';
import { OverviewPanel } from './OverviewPanel';
import type { DateBounds, VaccineOption } from '@/lib/db';

interface DashboardShellProps {
  vaccines: VaccineOption[];
  dateBounds: DateBounds;
}

type TabId = 'overview' | 'demographics' | 'geography' | 'outreach';

export function DashboardShell({ vaccines, dateBounds }: DashboardShellProps) {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [startDate, setStartDate] = useState<string>(dateBounds.min_date);
  const [endDate, setEndDate] = useState<string>(dateBounds.max_date);

  const handleReset = useCallback(() => {
    setStartDate(dateBounds.min_date);
    setEndDate(dateBounds.max_date);
  }, [dateBounds.min_date, dateBounds.max_date]);

  return (
    <>
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <DateRangeFilter
        startDate={startDate}
        endDate={endDate}
        defaultStart={dateBounds.min_date}
        defaultEnd={dateBounds.max_date}
        onStartChange={setStartDate}
        onEndChange={setEndDate}
        onReset={handleReset}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 sm:px-8">
        {activeTab === 'overview' && (
          <div id="overview-panel" role="tabpanel" aria-labelledby="overview">
            <OverviewPanel startDate={startDate} endDate={endDate} />
          </div>
        )}

        {activeTab === 'demographics' && (
          <div id="demographics-panel" role="tabpanel" aria-labelledby="demographics">
            <div className="grid grid-cols-1 gap-5">
              <DemographicChart vaccines={vaccines} startDate={startDate} endDate={endDate} />
            </div>
          </div>
        )}

        {activeTab === 'geography' && (
          <div id="geography-panel" role="tabpanel" aria-labelledby="geography">
            <div className="grid grid-cols-1 gap-5">
              <GeographyChart vaccines={vaccines} startDate={startDate} endDate={endDate} />
            </div>
          </div>
        )}

        {activeTab === 'outreach' && (
          <div id="outreach-panel" role="tabpanel" aria-labelledby="outreach">
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
              <div className="lg:col-span-2 xl:col-span-1">
                <ConversionChart startDate={startDate} endDate={endDate} />
              </div>
              <div className="lg:col-span-2 xl:col-span-1">
                <ReminderChart startDate={startDate} endDate={endDate} />
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
