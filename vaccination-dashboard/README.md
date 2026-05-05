# Vaccination Uptake Dashboard — Prototype

A coursework prototype dashboard that surfaces vaccination uptake disparities across demographic groups, clinical risk groups, and NHS England regions, so public-health teams can direct outreach where coverage is lowest.

> **All data is synthetic.** Coverage patterns are informed by the kinds of disparities published in UK Health Security Agency vaccination statistics, but no real patient data is used. This project is a university coursework prototype — not for operational use.

---

## What it does

- **Demographic uptake** — bar chart of uptake percentage per ethnicity, age band, or risk group, for any of eight vaccines (MMR, 6-in-1, HPV, MenACWY, Seasonal Flu, COVID-19, PPV, Shingles).
- **Geographic comparison** — grouped bars showing total population vs. vaccinated patients per NHS England region (London, North West, South East, Yorkshire and the Humber, West Midlands), with the uptake percentage labelled above each region. Optional vaccine filter.
- **Invitation conversion** — stacked bars per channel (SMS / Email / Letter) showing the share of invitations that resulted in a vaccination.

Each visualisation is backed by a multi-table SQL query (see [`lib/db.ts`](lib/db.ts)) and exposed as a JSON API route under [`app/api/`](app/api/).

---

## Tech stack

| Concern             | Choice                              |
| ------------------- | ----------------------------------- |
| Framework           | Next.js 16 (App Router) + TypeScript|
| UI / styling        | React 19, Tailwind CSS v4 (utility classes only) |
| Charts              | Recharts 3                          |
| Local database      | SQLite via `better-sqlite3`         |
| Production database | Designed for swap to Turso/libSQL — DB access is centralised in [`lib/db.ts`](lib/db.ts) |
| Deployment target   | Vercel                              |

---

## Project layout

```
vaccination-dashboard/
├── app/
│   ├── page.tsx              # Dashboard home (Server Component)
│   ├── layout.tsx            # Root layout, metadata, body styling
│   ├── globals.css           # @import "tailwindcss" only
│   └── api/
│       ├── demographics/route.ts
│       ├── geography/route.ts
│       └── conversion/route.ts
├── components/
│   ├── DemographicChart.tsx  # Bar chart, vaccine + dimension filters
│   ├── GeographyChart.tsx    # Grouped bars, vaccine filter, % label
│   ├── ConversionChart.tsx   # Stacked bars, no filters
│   └── FilterBar.tsx         # Shared FilterBar / FilterSelect / ChartArea primitives
├── lib/
│   ├── db.ts                 # Connection + four typed query functions
│   └── seed-generator.ts     # Deterministic generator for data/seed.sql
├── data/
│   ├── schema.sql            # 6-table 3NF schema with FKs and CHECK constraints
│   ├── seed.sql              # ~3,750 INSERT statements (generated)
│   └── vaccinations.db       # SQLite file built from schema + seed
└── README.md
```

---

## Quick start

### Prerequisites

- **Node.js 22+** (the seed generator and `tsx` use modern features; Node 20 may also work but isn't tested)
- **`sqlite3` CLI** on your `PATH` for the seed-apply step (most macOS/Linux distros include this; on Windows install via [sqlite.org/download.html](https://sqlite.org/download.html))

### 1. Install

```bash
npm install
```

### 2. Build the local database

```bash
npm run seed
```

This runs two steps:

| Step                  | What it does                                                  |
| --------------------- | -------------------------------------------------------------- |
| `seed:generate`       | Runs `lib/seed-generator.ts` via `tsx` to produce `data/seed.sql`. Deterministic via a seeded PRNG, so output is byte-identical across runs. |
| `seed:apply`          | Removes any existing `data/vaccinations.db`, then loads `data/schema.sql` followed by `data/seed.sql`. |

You can run the steps separately with `npm run seed:generate` and `npm run seed:apply`.

The generator prints a summary of what it produced, including per-vaccine uptake rates and channel-conversion percentages, so you can sanity-check the patterns before launching the app.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Useful commands

| Command                | Purpose                                                |
| ---------------------- | ------------------------------------------------------ |
| `npm run dev`          | Start the Next.js dev server (Turbopack, port 3000)    |
| `npm run build`        | Production build                                       |
| `npm run start`        | Run the production build                               |
| `npm run lint`         | ESLint                                                 |
| `npm run seed`         | Regenerate `seed.sql` and rebuild `vaccinations.db`    |
| `npx tsc --noEmit`     | Strict typecheck                                       |

---

## Data model

Six tables in 3NF, with foreign keys enforced. The schema is in [`data/schema.sql`](data/schema.sql).

| Table         | Role                                                    |
| ------------- | ------------------------------------------------------- |
| `Patient`     | Individuals with demographics, postcode, risk group     |
| `Vaccine`     | Catalogue of 8 vaccines with min-age and dose metadata  |
| `Clinic`      | 15 clinics across 5 regions (3 types per region)        |
| `Invitation`  | Sent invitations, channel (SMS/Letter/Email), status    |
| `Reminder`    | 0–3 follow-up reminders per invitation                  |
| `Vaccination` | Administered doses; `invitation_id` is nullable for walk-ins |

**Synthetic-data calibration** (defined in [`lib/seed-generator.ts`](lib/seed-generator.ts)):
- Childhood vaccines (MMR, 6-in-1) ~88–92% uptake; shingles ~50–60%
- London 5–7pp below the highest-coverage regions
- Eligible risk groups (Over-65, Immunocompromised, Chronic respiratory, etc.) show higher coverage than `None` for vaccines they are prioritised for
- SMS conversion ~9pp above Letter; ~10% of vaccinations are walk-ins (no linked invitation)
- Demographic offsets give a 3–5pp uptake variance between ethnic groups so the demographic chart shows real patterns

---

## API

All three routes are `GET`, return JSON, and use `Response.json()` with strict types from [`lib/db.ts`](lib/db.ts).

| Route                                                     | Query parameters                                                   | Response shape                  |
| --------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| `GET /api/demographics`                                   | `vaccine` (positive int, **required**) + `dimension` ∈ `ethnicity \| age_band \| risk_group` (**required**) | `DemographicUptakeResponse`     |
| `GET /api/geography`                                      | `vaccine` (positive int, **optional** — omit for all-vaccine totals) | `RegionalUptakeResponse`        |
| `GET /api/conversion`                                     | _(none)_                                                           | `ChannelConversionResponse`     |

Validation failures return HTTP 400 with `{ "error": string }`.

The route handlers are kept thin — all SQL lives in [`lib/db.ts`](lib/db.ts).

### Sample request

```bash
curl 'http://localhost:3000/api/demographics?vaccine=5&dimension=risk_group'
```

```json
{
  "vaccine_id": 5,
  "dimension": "risk_group",
  "rows": [
    { "group_label": "None", "eligible_count": 308, "vaccinated_count": 163, "uptake_pct": 52.9 },
    { "group_label": "Over-65", "eligible_count": 76, "vaccinated_count": 65, "uptake_pct": 85.5 },
    ...
  ]
}
```

---

## Deploying to Vercel

**Important:** `better-sqlite3` is a native Node module and the database is a **file on the local filesystem** — Vercel's serverless functions have a read-only filesystem at runtime, so the SQLite-file approach used in development won't work in production as-is.

You have two options before deploying:

### Option A — Switch to Turso (recommended, matches the brief)

Turso is a managed libSQL (SQLite-compatible) service with HTTP/WebSocket access that works on Vercel.

1. Create a Turso DB and load the schema + seed:
   ```bash
   turso db create vaccinations
   turso db shell vaccinations < data/schema.sql
   turso db shell vaccinations < data/seed.sql
   ```
2. Get the connection details:
   ```bash
   turso db show vaccinations --url
   turso db tokens create vaccinations
   ```
3. Add `@libsql/client` to the project:
   ```bash
   npm install @libsql/client
   ```
4. Replace the connection setup at the top of [`lib/db.ts`](lib/db.ts) with the libSQL client and convert the four exported functions to `async`. The SQL strings stay the same — libSQL is SQLite-dialect — but `prepare(...).all(...)` becomes `client.execute({ sql, args })`. Update the three route handlers to `await` the calls.
5. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as environment variables in the Vercel project settings.
6. Deploy:
   ```bash
   vercel
   ```

### Option B — Static-export the seed data as JSON

If you only need read-only data and want to skip Turso entirely, export the three query results to JSON at build time and serve them as static files. This loses interactive SQL but is the simplest path to a live demo URL. Not recommended unless you need a zero-infrastructure deploy.

### Vercel project settings

- **Framework preset**: Next.js (auto-detected)
- **Node version**: 22.x
- **Environment variables** (Option A only): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

The route handlers already declare `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`, so no further config is needed.

---

## Code conventions

- **TypeScript strict mode**, no `any` types
- **Database access centralised** in `lib/db.ts` — route handlers contain no inline SQL
- **All API responses typed** via the response interfaces in `lib/db.ts`
- **Tailwind utility classes only** — no custom CSS files (`globals.css` contains a single `@import "tailwindcss"`)
- **Comments**: function-level comments only where the *why* is non-obvious; identifiers do the rest

---

## License & data provenance

This is coursework. The synthetic data is generated programmatically and bears no relation to any real patient. Coverage patterns are informed by publicly available UK Health Security Agency vaccination statistics so the resulting charts are roughly plausible.
