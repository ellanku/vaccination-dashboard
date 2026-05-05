/*
 * Shared UI primitives for the dashboard's chart cards.
 *
 * Exports:
 *   - <FilterBar>    — flex wrapper that lays out one or more FilterSelects
 *   - <FilterSelect> — labelled <select> with NHS-blue focus styling
 *   - <ChartArea>    — shows loading / error / empty states; renders children
 *                      only when data is ready
 *
 * Kept dumb on purpose: each chart owns its own filter state and passes
 * value/onChange down. Avoids context, avoids generics, plays nicely with
 * server-side rendering.
 */

import type { ReactNode } from 'react';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}

export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium uppercase tracking-wide text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-[#005EB8] focus:outline-none focus:ring-2 focus:ring-[#005EB8]/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface FilterBarProps {
  children: ReactNode;
}

export function FilterBar({ children }: FilterBarProps) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}

export interface ChartAreaProps {
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  height?: number;
  children: ReactNode;
}

export function ChartArea({ isLoading, error, isEmpty, height = 280, children }: ChartAreaProps) {
  if (error !== null) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center rounded-md bg-red-50 px-4 text-center text-sm text-red-700"
      >
        Failed to load: {error}
      </div>
    );
  }
  if (isLoading) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-slate-500">
        No data for this filter.
      </div>
    );
  }
  return <>{children}</>;
}
