/*
 * DateRangeFilter — global date range filter for the dashboard.
 *
 * Two native HTML date inputs and a Reset button. Renders an "active range"
 * label only when the current range differs from the dataset's default
 * (earliest invitation_date → today). State is owned by DashboardShell —
 * this component is a pure controlled widget.
 */

'use client';

export interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  defaultStart: string;
  defaultEnd: string;
  onStartChange: (date: string) => void;
  onEndChange: (date: string) => void;
  onReset: () => void;
}

export function DateRangeFilter({
  startDate,
  endDate,
  defaultStart,
  defaultEnd,
  onStartChange,
  onEndChange,
  onReset,
}: DateRangeFilterProps) {
  const isFiltered = startDate !== defaultStart || endDate !== defaultEnd;

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-3 px-6 py-3 sm:px-8">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium uppercase tracking-wide text-slate-600">From</span>
          <input
            type="date"
            value={startDate}
            min={defaultStart}
            max={endDate || defaultEnd}
            onChange={(e) => onStartChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#005EB8] focus:outline-none focus:ring-2 focus:ring-[#005EB8]/30"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium uppercase tracking-wide text-slate-600">To</span>
          <input
            type="date"
            value={endDate}
            min={startDate || defaultStart}
            max={defaultEnd}
            onChange={(e) => onEndChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#005EB8] focus:outline-none focus:ring-2 focus:ring-[#005EB8]/30"
          />
        </label>
        <button
          type="button"
          onClick={onReset}
          disabled={!isFiltered}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>
        {isFiltered && (
          <p className="ml-auto text-xs text-slate-500">
            Filtered: {startDate} to {endDate}
          </p>
        )}
      </div>
    </div>
  );
}
