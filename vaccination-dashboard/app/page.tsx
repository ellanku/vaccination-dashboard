/*
 * Dashboard home page.
 *
 * Server Component — calls getVaccines() once at request time and passes
 * the list down to the (client) chart cards. Each chart fetches its own
 * data from the API based on its own filter state.
 */

import { getVaccines } from '@/lib/db';
import { DemographicChart } from '@/components/DemographicChart';
import { GeographyChart } from '@/components/GeographyChart';
import { ConversionChart } from '@/components/ConversionChart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function Home() {
  const vaccines = getVaccines();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      {/* NHS-blue top band — visual anchor, no content */}
      <div className="h-2 w-full bg-[#005EB8]" aria-hidden />

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-6 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#005EB8]">
            Public health analytics
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Vaccination Uptake Dashboard — Prototype
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Surfacing vaccination uptake disparities across demographic groups, clinical
            risk groups, and NHS England regions so outreach can be directed where coverage
            is lowest.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 sm:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <DemographicChart vaccines={vaccines} />
          <GeographyChart vaccines={vaccines} />
          {/* On lg, the third card spans both columns so there's no awkward
              empty space; on xl it returns to a single column. */}
          <div className="lg:col-span-2 xl:col-span-1">
            <ConversionChart />
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4 sm:px-8">
          <p className="text-xs text-slate-500">
            Synthetic data — university coursework prototype. Not for operational use.
          </p>
        </div>
      </footer>
    </div>
  );
}
