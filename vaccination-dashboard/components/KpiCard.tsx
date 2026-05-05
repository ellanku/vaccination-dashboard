/*
 * KpiCard — individual key performance indicator card.
 *
 * Displays a label, value, and optional unit in a bordered card with
 * consistent styling across the dashboard.
 */

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}

export function KpiCard({ label, value, unit, highlight }: KpiCardProps) {
  return (
    <div className={`rounded-lg border p-6 ${
      highlight
        ? 'border-[#005EB8] bg-blue-50'
        : 'border-slate-200 bg-white'
    }`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className={`text-3xl font-bold ${
          highlight ? 'text-[#005EB8]' : 'text-slate-900'
        }`}>
          {value}
        </p>
        {unit && <p className="text-sm font-medium text-slate-600">{unit}</p>}
      </div>
    </div>
  );
}
