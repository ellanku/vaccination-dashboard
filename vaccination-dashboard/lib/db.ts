/*
 * Database access layer.
 *
 * Centralises every SQL query the dashboard runs so route handlers stay thin
 * and the storage backend can be swapped (e.g. SQLite → Turso/libSQL) without
 * touching the rest of the app. To migrate to Turso, replace the connection
 * setup and convert each exported function to return Promises — the row
 * shapes and SQL stay the same.
 *
 * Connection model: a single read-only better-sqlite3 handle, cached on
 * globalThis so Next.js HMR doesn't open a new file handle on every reload.
 */

import Database from 'better-sqlite3';
import { join } from 'node:path';

declare global {
  // eslint-disable-next-line no-var
  var __vaxDb: Database.Database | undefined;
}

function getDb(): Database.Database {
  if (globalThis.__vaxDb) return globalThis.__vaxDb;
  const path = process.env.DB_PATH ?? join(process.cwd(), 'data', 'vaccinations.db');
  const db = new Database(path, { readonly: true, fileMustExist: true });
  db.pragma('foreign_keys = ON');
  if (process.env.NODE_ENV !== 'production') globalThis.__vaxDb = db;
  return db;
}

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type DemographicDimension = 'ethnicity' | 'age_band' | 'risk_group';

export const DEMOGRAPHIC_DIMENSIONS: readonly DemographicDimension[] = [
  'ethnicity',
  'age_band',
  'risk_group',
] as const;

export interface VaccineOption {
  vaccine_id: number;
  vaccine_name: string;
}

export interface DemographicUptakeRow {
  group_label: string;
  eligible_count: number;
  vaccinated_count: number;
  uptake_pct: number;
}

export interface RegionalUptakeRow {
  region: string;
  total_population: number;
  vaccinated_count: number;
  uptake_pct: number;
}

export interface ChannelConversionRow {
  channel: string;
  total_invitations: number;
  converted: number;
  not_converted: number;
  conversion_pct: number;
}

// API response envelope shapes. Routes return these; the client can rely on
// the `rows` key being present even when the result set is empty.
export interface DemographicUptakeResponse {
  vaccine_id: number;
  dimension: DemographicDimension;
  rows: DemographicUptakeRow[];
}

export interface RegionalUptakeResponse {
  vaccine_id: number | null;
  rows: RegionalUptakeRow[];
}

export interface ChannelConversionResponse {
  rows: ChannelConversionRow[];
}

export interface ReminderConversionRow {
  reminder_count: string;
  total_invitations: number;
  converted: number;
  not_converted: number;
  conversion_pct: number;
}

export interface ReminderConversionResponse {
  rows: ReminderConversionRow[];
}

export interface KpiData {
  total_patients: number;
  overall_coverage_pct: number;
  conversion_pct: number;
  lowest_coverage_region: string;
}

export interface ApiError {
  error: string;
}

// ---------------------------------------------------------------------
// Shared SQL fragments
// ---------------------------------------------------------------------

// Postcode → region mapping. The seed generator uses prefix sets that are
// mutually unambiguous, so a single CASE on the first two characters suffices
// (with one fallback for the single-letter Manchester prefix 'M').
const POSTCODE_TO_REGION_SQL = `
  CASE substr(p.postcode, 1, 2)
    WHEN 'SW' THEN 'London'
    WHEN 'NW' THEN 'London'
    WHEN 'SE' THEN 'London'
    WHEN 'WA' THEN 'North West'
    WHEN 'PR' THEN 'North West'
    WHEN 'BN' THEN 'South East'
    WHEN 'OX' THEN 'South East'
    WHEN 'GU' THEN 'South East'
    WHEN 'YO' THEN 'Yorkshire and the Humber'
    WHEN 'HU' THEN 'Yorkshire and the Humber'
    WHEN 'BD' THEN 'Yorkshire and the Humber'
    WHEN 'CV' THEN 'West Midlands'
    WHEN 'WV' THEN 'West Midlands'
    WHEN 'DY' THEN 'West Midlands'
    ELSE CASE substr(p.postcode, 1, 1) WHEN 'M' THEN 'North West' END
  END
`;

// Eligible-cohort predicate keyed on @vaccine. Mirrors the cohort caps used
// by the seed generator so numerator and denominator are on the same cohort.
const ELIGIBLE_COHORT_SQL = `
  pa.age_months >= v.minimum_age_months
  AND (
       (@vaccine = 1 AND pa.age_years <= 18)
    OR (@vaccine = 2 AND pa.age_years <= 5)
    OR (@vaccine IN (3, 4) AND pa.age_years <= 25)
    OR (@vaccine NOT IN (1, 2, 3, 4))
  )
`;

// Patient ages are derived at query time from date_of_birth, per the brief.
// julianday is leap-year aware; the /365.25 and /30.4375 divisors give the
// standard floor-of-completed-years and approximate-completed-months that
// match the seed generator's age math.
const PATIENT_AGE_CTE = `
  patient_age AS (
    SELECT
      p.patient_id,
      p.ethnicity,
      p.risk_group,
      p.gender,
      p.postcode,
      CAST((julianday('now') - julianday(p.date_of_birth)) / 365.25  AS INTEGER) AS age_years,
      CAST((julianday('now') - julianday(p.date_of_birth)) / 30.4375 AS INTEGER) AS age_months
    FROM Patient p
  )
`;

// ---------------------------------------------------------------------
// Vaccine dropdown options
// ---------------------------------------------------------------------

export function getVaccines(): VaccineOption[] {
  const stmt = getDb().prepare<[], VaccineOption>(`
    SELECT vaccine_id, vaccine_name
    FROM Vaccine
    ORDER BY vaccine_id
  `);
  return stmt.all();
}

// ---------------------------------------------------------------------
// Date range bounds
// ---------------------------------------------------------------------

export interface DateBounds {
  min_date: string;
  max_date: string;
}

export function getDateBounds(): DateBounds {
  // Per the Feature 4 spec: default range is the earliest invitation_date in
  // the dataset through to today.
  const stmt = getDb().prepare<[], DateBounds>(`
    SELECT
      DATE((SELECT MIN(invitation_date) FROM Invitation)) AS min_date,
      DATE('now') AS max_date
  `);
  const result = stmt.get();
  return result || {
    min_date: '2024-01-01',
    max_date: '2024-12-31',
  };
}

// ---------------------------------------------------------------------
// Date-range query-param validator shared by route handlers
// ---------------------------------------------------------------------

export interface ParsedDateRange {
  startDate: string | undefined;
  endDate: string | undefined;
  error: string | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateRange(
  startRaw: string | null,
  endRaw: string | null,
): ParsedDateRange {
  if (startRaw !== null && startRaw !== '' && !ISO_DATE_RE.test(startRaw)) {
    return { startDate: undefined, endDate: undefined, error: 'Query param "startDate" must be YYYY-MM-DD.' };
  }
  if (endRaw !== null && endRaw !== '' && !ISO_DATE_RE.test(endRaw)) {
    return { startDate: undefined, endDate: undefined, error: 'Query param "endDate" must be YYYY-MM-DD.' };
  }
  return {
    startDate: startRaw && startRaw !== '' ? startRaw : undefined,
    endDate: endRaw && endRaw !== '' ? endRaw : undefined,
    error: null,
  };
}

// ---------------------------------------------------------------------
// Query 1 — Demographic uptake
// JOINs: Patient (CTE) → Vaccine → Vaccination
// ---------------------------------------------------------------------

const GROUP_EXPRESSION_BY_DIMENSION: Record<DemographicDimension, string> = {
  ethnicity: 'pa.ethnicity',
  risk_group: 'pa.risk_group',
  age_band: `
    CASE
      WHEN pa.age_years <= 4  THEN '0-4'
      WHEN pa.age_years <= 15 THEN '5-15'
      WHEN pa.age_years <= 44 THEN '16-44'
      WHEN pa.age_years <= 64 THEN '45-64'
      ELSE '65+'
    END
  `,
};

// Stable display order so charts don't re-shuffle bars between requests.
const ORDER_EXPRESSION_BY_DIMENSION: Record<DemographicDimension, string> = {
  ethnicity: `CASE pa.ethnicity
    WHEN 'White' THEN 1 WHEN 'Asian' THEN 2 WHEN 'Black' THEN 3
    WHEN 'Mixed' THEN 4 WHEN 'Other' THEN 5 WHEN 'Prefer not to say' THEN 6 ELSE 99 END`,
  risk_group: `CASE pa.risk_group
    WHEN 'None' THEN 1 WHEN 'Pregnant' THEN 2 WHEN 'Immunocompromised' THEN 3
    WHEN 'Chronic respiratory' THEN 4 WHEN 'Chronic cardiovascular' THEN 5
    WHEN 'Diabetes' THEN 6 WHEN 'Over-65' THEN 7 ELSE 99 END`,
  age_band: `CASE
    WHEN pa.age_years <= 4  THEN 1
    WHEN pa.age_years <= 15 THEN 2
    WHEN pa.age_years <= 44 THEN 3
    WHEN pa.age_years <= 64 THEN 4
    ELSE 5 END`,
};

export function getDemographicUptake(
  vaccineId: number,
  dimension: DemographicDimension,
  startDate?: string,
  endDate?: string,
): DemographicUptakeRow[] {
  const groupExpr = GROUP_EXPRESSION_BY_DIMENSION[dimension];
  const orderExpr = ORDER_EXPRESSION_BY_DIMENSION[dimension];
  const dateFilter = startDate && endDate
    ? `AND vac.date_administered >= @startDate AND vac.date_administered <= @endDate`
    : '';
  const sql = `
    WITH ${PATIENT_AGE_CTE},
    eligible AS (
      SELECT pa.*
      FROM patient_age pa
      JOIN Vaccine v ON v.vaccine_id = @vaccine
      WHERE ${ELIGIBLE_COHORT_SQL}
    )
    SELECT
      ${groupExpr} AS group_label,
      COUNT(DISTINCT pa.patient_id) AS eligible_count,
      COUNT(DISTINCT vac.patient_id) AS vaccinated_count,
      CASE WHEN COUNT(DISTINCT pa.patient_id) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(DISTINCT vac.patient_id) / COUNT(DISTINCT pa.patient_id), 1)
      END AS uptake_pct
    FROM eligible pa
    LEFT JOIN Vaccination vac
      ON vac.patient_id = pa.patient_id AND vac.vaccine_id = @vaccine
      ${dateFilter}
    GROUP BY group_label
    ORDER BY ${orderExpr}, group_label
  `;
  const stmt = getDb().prepare<{ vaccine: number; startDate?: string; endDate?: string }, DemographicUptakeRow>(sql);
  return stmt.all({ vaccine: vaccineId, startDate, endDate });
}

// ---------------------------------------------------------------------
// Query 2 — Geographic comparison
// JOINs: Patient → Vaccination → Clinic
// ---------------------------------------------------------------------

export function getRegionalUptake(vaccineId: number | null, startDate?: string, endDate?: string): RegionalUptakeRow[] {
  // Region for the denominator comes from the patient's postcode (Patient
  // has no region column per the brief). It's computed in a CTE so
  // GROUP BY pwr.region is unambiguous — without that, SQLite resolves
  // `region` to Clinic.region and silently drops unvaccinated patients
  // (whose joined Clinic row is NULL after the LEFT JOIN).
  const dateFilter = startDate && endDate
    ? `AND vac.date_administered >= @startDate AND vac.date_administered <= @endDate`
    : '';
  const sql = `
    WITH patient_with_region AS (
      SELECT p.patient_id, ${POSTCODE_TO_REGION_SQL} AS region
      FROM Patient p
    )
    SELECT
      pwr.region AS region,
      COUNT(DISTINCT pwr.patient_id) AS total_population,
      COUNT(DISTINCT vac.patient_id) AS vaccinated_count,
      CASE WHEN COUNT(DISTINCT pwr.patient_id) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(DISTINCT vac.patient_id) / COUNT(DISTINCT pwr.patient_id), 1)
      END AS uptake_pct
    FROM patient_with_region pwr
    LEFT JOIN Vaccination vac
      ON vac.patient_id = pwr.patient_id
     AND (@vaccine IS NULL OR vac.vaccine_id = @vaccine)
     ${dateFilter}
    LEFT JOIN Clinic c
      ON c.clinic_id = vac.clinic_id
    WHERE pwr.region IS NOT NULL
    GROUP BY pwr.region
    ORDER BY pwr.region
  `;
  const stmt = getDb().prepare<{ vaccine: number | null; startDate?: string; endDate?: string }, RegionalUptakeRow>(sql);
  return stmt.all({ vaccine: vaccineId, startDate, endDate });
}

// ---------------------------------------------------------------------
// Query 3 — Invitation conversion by channel
// JOINs: Invitation LEFT JOIN Vaccination
// ---------------------------------------------------------------------

export function getChannelConversion(startDate?: string, endDate?: string): ChannelConversionRow[] {
  const dateFilter = startDate && endDate
    ? `WHERE i.invitation_date >= @startDate AND i.invitation_date <= @endDate`
    : '';
  const sql = `
    SELECT
      i.channel,
      COUNT(*) AS total_invitations,
      COUNT(v.vaccination_id) AS converted,
      COUNT(*) - COUNT(v.vaccination_id) AS not_converted,
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(v.vaccination_id) / COUNT(*), 1)
      END AS conversion_pct
    FROM Invitation i
    LEFT JOIN Vaccination v ON v.invitation_id = i.invitation_id
    ${dateFilter}
    GROUP BY i.channel
    ORDER BY conversion_pct DESC
  `;
  const stmt = getDb().prepare<{ startDate?: string; endDate?: string }, ChannelConversionRow>(sql);
  return stmt.all({ startDate, endDate });
}

// ---------------------------------------------------------------------
// Query 4 — KPI summary cards
// Aggregates total patients, overall coverage, conversion %, lowest region
// ---------------------------------------------------------------------

export function getKpis(startDate?: string, endDate?: string): KpiData {
  const vaccDateFilter = startDate && endDate
    ? `AND vac.date_administered >= @startDate AND vac.date_administered <= @endDate`
    : '';
  const invitationDateFilter = startDate && endDate
    ? `AND i.invitation_date >= @startDate AND i.invitation_date <= @endDate`
    : '';
  const sql = `
    WITH ${PATIENT_AGE_CTE},
    patient_with_region AS (
      SELECT p.patient_id, ${POSTCODE_TO_REGION_SQL} AS region
      FROM Patient p
    ),
    patient_vaccinated AS (
      SELECT DISTINCT vac.patient_id
      FROM Vaccination vac
      WHERE 1=1 ${vaccDateFilter}
    ),
    regional_uptake AS (
      SELECT
        pwr.region,
        ROUND(100.0 * COUNT(DISTINCT vac.patient_id) / COUNT(DISTINCT pwr.patient_id), 1) AS uptake_pct
      FROM patient_with_region pwr
      LEFT JOIN Vaccination vac ON vac.patient_id = pwr.patient_id ${vaccDateFilter}
      WHERE pwr.region IS NOT NULL
      GROUP BY pwr.region
    ),
    lowest_region AS (
      SELECT region FROM regional_uptake
      WHERE uptake_pct = (SELECT MIN(uptake_pct) FROM regional_uptake)
      LIMIT 1
    )
    SELECT
      COUNT(DISTINCT p.patient_id) AS total_patients,
      CASE WHEN COUNT(DISTINCT p.patient_id) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(DISTINCT pv.patient_id) / COUNT(DISTINCT p.patient_id), 1)
      END AS overall_coverage_pct,
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * COUNT(DISTINCT v.vaccination_id) / COUNT(DISTINCT i.invitation_id), 1)
      END AS conversion_pct,
      COALESCE((SELECT region FROM lowest_region), 'N/A') AS lowest_coverage_region
    FROM Patient p
    LEFT JOIN patient_vaccinated pv ON pv.patient_id = p.patient_id
    CROSS JOIN Invitation i
    LEFT JOIN Vaccination v ON v.invitation_id = i.invitation_id
    WHERE 1=1 ${invitationDateFilter}
  `;
  const stmt = getDb().prepare<{ startDate?: string; endDate?: string }, KpiData>(sql);
  const result = stmt.get({ startDate, endDate });
  return result || {
    total_patients: 0,
    overall_coverage_pct: 0,
    conversion_pct: 0,
    lowest_coverage_region: 'N/A',
  };
}

// ---------------------------------------------------------------------
// Query 5 — Reminder effectiveness
// JOINs: Invitation → Reminder → Vaccination
// Groups by reminder count (0, 1, 2, 3+) and calculates conversion per group
// ---------------------------------------------------------------------

export function getReminderConversion(startDate?: string, endDate?: string): ReminderConversionRow[] {
  const dateFilter = startDate && endDate
    ? `WHERE i.invitation_date >= @startDate AND i.invitation_date <= @endDate`
    : '';
  const sql = `
    WITH invitation_reminder_count AS (
      SELECT
        i.invitation_id,
        COUNT(r.reminder_id) AS reminder_count
      FROM Invitation i
      LEFT JOIN Reminder r ON r.invitation_id = i.invitation_id
      ${dateFilter}
      GROUP BY i.invitation_id
    ),
    invitation_with_reminders AS (
      SELECT
        irc.invitation_id,
        CASE
          WHEN irc.reminder_count = 0 THEN '0'
          WHEN irc.reminder_count = 1 THEN '1'
          WHEN irc.reminder_count = 2 THEN '2'
          ELSE '3+'
        END AS reminder_band,
        CASE WHEN v.vaccination_id IS NOT NULL THEN 1 ELSE 0 END AS converted
      FROM invitation_reminder_count irc
      LEFT JOIN Vaccination v ON v.invitation_id = irc.invitation_id
    )
    SELECT
      reminder_band AS reminder_count,
      COUNT(*) AS total_invitations,
      SUM(converted) AS converted,
      COUNT(*) - SUM(converted) AS not_converted,
      CASE WHEN COUNT(*) = 0 THEN 0
           ELSE ROUND(100.0 * SUM(converted) / COUNT(*), 1)
      END AS conversion_pct
    FROM invitation_with_reminders
    GROUP BY reminder_band
    ORDER BY
      CASE reminder_band
        WHEN '0' THEN 1
        WHEN '1' THEN 2
        WHEN '2' THEN 3
        ELSE 4
      END
  `;
  const stmt = getDb().prepare<{ startDate?: string; endDate?: string }, ReminderConversionRow>(sql);
  return stmt.all({ startDate, endDate });
}
