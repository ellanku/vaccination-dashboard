// All the SQL queries used by the API routes live in this file. The route
// handlers just call these functions, which keeps SQL out of the rest of
// the app and makes the connection layer easy to swap.
//
// We use Turso (libSQL) over HTTP, which means every query is async.
// Connection details come from TURSO_DATABASE_URL and TURSO_AUTH_TOKEN,
// which on Vercel come from the project's environment variables.
//
// The client is cached on globalThis so Next.js HMR doesn't reopen the
// connection every time something changes in dev.

import { createClient } from '@libsql/client';

declare global {
  // eslint-disable-next-line no-var
  var __vaxDb: ReturnType<typeof createClient> | undefined;
}

function getDb() {
  if (globalThis.__vaxDb) return globalThis.__vaxDb;

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error('TURSO_DATABASE_URL is not set.');
  if (!authToken) throw new Error('TURSO_AUTH_TOKEN is not set.');

  const db = createClient({ url, authToken });

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__vaxDb = db;
  }

  return db;
}

// Types used by both the queries below and the API route handlers.

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

export interface ReminderConversionRow {
  reminder_count: string;
  total_invitations: number;
  converted: number;
  not_converted: number;
  conversion_pct: number;
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

// Response shapes returned by the API routes. Wrapping rows in an object
// means the client always gets the same shape, even when the result is empty.
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

export interface ReminderConversionResponse {
  rows: ReminderConversionRow[];
}

// Bits of SQL reused across several queries below.

// Maps a postcode to its NHS region. The seed generator picks postcode
// prefixes that don't overlap, so checking the first two characters is
// enough for almost everything. The 'M' fallback catches Manchester
// postcodes (M1, M2, etc.) where the second character is a digit.
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

// Decides whether a patient counts as "eligible" for a given vaccine. The
// age caps here have to match the seed generator, otherwise we'd end up
// with patients in the eligible count who could never have been vaccinated.
const ELIGIBLE_COHORT_SQL = `
  pa.age_months >= v.minimum_age_months
  AND (
       (:vaccine = 1 AND pa.age_years <= 18)
    OR (:vaccine = 2 AND pa.age_years <= 5)
    OR (:vaccine IN (3, 4) AND pa.age_years <= 25)
    OR (:vaccine NOT IN (1, 2, 3, 4))
  )
`;

// Works out each patient's age at query time from date_of_birth. julianday
// handles leap years for us. Dividing by 365.25 gives years and 30.4375
// gives months (the average days per month). Casting to INTEGER floors
// the result so we get whole completed years/months.
const PATIENT_AGE_CTE = `
  patient_age AS (
    SELECT
      p.patient_id,
      p.ethnicity,
      p.risk_group,
      p.gender,
      p.postcode,
      CAST((julianday('now') - julianday(p.date_of_birth)) / 365.25 AS INTEGER) AS age_years,
      CAST((julianday('now') - julianday(p.date_of_birth)) / 30.4375 AS INTEGER) AS age_months
    FROM Patient p
  )
`;

// Used to set the default range on the date-range filter.
export interface DateBounds {
  min_date: string;
  max_date: string;
}

// Pulls the list of vaccines for the dropdowns on the dashboard.
export async function getVaccines(): Promise<VaccineOption[]> {
  const db = getDb();
  const result = await db.execute(`
    SELECT vaccine_id, vaccine_name
    FROM Vaccine
    ORDER BY vaccine_id
  `);
  return result.rows as unknown as VaccineOption[];
}

export async function getDateBounds(): Promise<DateBounds> {
  // Default range runs from the earliest invitation we have through to today.
  const db = getDb();
  const result = await db.execute(`
    SELECT
      DATE((SELECT MIN(invitation_date) FROM Invitation)) AS min_date,
      DATE('now') AS max_date
  `);
  return (result.rows[0] as unknown as DateBounds) ?? {
    min_date: '2024-01-01',
    max_date: '2024-12-31',
  };
}

// Validates the startDate/endDate query params on the API routes. Pulled
// out so the same check isn't repeated in every route handler. This is
// pure validation — no I/O, so no need for async.

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
    return {
      startDate: undefined,
      endDate: undefined,
      error: 'Query param "startDate" must be YYYY-MM-DD.',
    };
  }
  if (endRaw !== null && endRaw !== '' && !ISO_DATE_RE.test(endRaw)) {
    return {
      startDate: undefined,
      endDate: undefined,
      error: 'Query param "endDate" must be YYYY-MM-DD.',
    };
  }
  return {
    startDate: startRaw && startRaw !== '' ? startRaw : undefined,
    endDate: endRaw && endRaw !== '' ? endRaw : undefined,
    error: null,
  };
}

// Uptake percentage per demographic group, for one vaccine.
// Joins Patient (via a CTE for ages) → Vaccine → Vaccination.

const GROUP_EXPRESSION_BY_DIMENSION: Record<DemographicDimension, string> = {
  ethnicity: 'pa.ethnicity',
  risk_group: 'pa.risk_group',
  age_band: `
    CASE
      WHEN pa.age_years <= 4 THEN '0-4'
      WHEN pa.age_years <= 15 THEN '5-15'
      WHEN pa.age_years <= 44 THEN '16-44'
      WHEN pa.age_years <= 64 THEN '45-64'
      ELSE '65+'
    END
  `,
};

// Forces a fixed order on the bars so the chart doesn't shuffle between
// requests. Without this, SQLite's GROUP BY ordering isn't guaranteed.
const ORDER_EXPRESSION_BY_DIMENSION: Record<DemographicDimension, string> = {
  ethnicity: `CASE pa.ethnicity
    WHEN 'White' THEN 1
    WHEN 'Asian' THEN 2
    WHEN 'Black' THEN 3
    WHEN 'Mixed' THEN 4
    WHEN 'Other' THEN 5
    WHEN 'Prefer not to say' THEN 6
    ELSE 99 END`,
  risk_group: `CASE pa.risk_group
    WHEN 'None' THEN 1
    WHEN 'Pregnant' THEN 2
    WHEN 'Immunocompromised' THEN 3
    WHEN 'Chronic respiratory' THEN 4
    WHEN 'Chronic cardiovascular' THEN 5
    WHEN 'Diabetes' THEN 6
    WHEN 'Over-65' THEN 7
    ELSE 99 END`,
  age_band: `CASE
    WHEN pa.age_years <= 4 THEN 1
    WHEN pa.age_years <= 15 THEN 2
    WHEN pa.age_years <= 44 THEN 3
    WHEN pa.age_years <= 64 THEN 4
    ELSE 5 END`,
};

export async function getDemographicUptake(
  vaccineId: number,
  dimension: DemographicDimension,
  startDate?: string,
  endDate?: string,
): Promise<DemographicUptakeRow[]> {
  const db = getDb();
  const groupExpr = GROUP_EXPRESSION_BY_DIMENSION[dimension];
  const orderExpr = ORDER_EXPRESSION_BY_DIMENSION[dimension];
  const dateFilter = startDate && endDate
    ? `AND vac.date_administered >= :startDate AND vac.date_administered <= :endDate`
    : '';

  const sql = `
    WITH ${PATIENT_AGE_CTE},
    eligible AS (
      SELECT pa.*
      FROM patient_age pa
      JOIN Vaccine v ON v.vaccine_id = :vaccine
      WHERE ${ELIGIBLE_COHORT_SQL}
    )
    SELECT
      ${groupExpr} AS group_label,
      COUNT(DISTINCT pa.patient_id) AS eligible_count,
      COUNT(DISTINCT vac.patient_id) AS vaccinated_count,
      CASE
        WHEN COUNT(DISTINCT pa.patient_id) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(DISTINCT vac.patient_id) / COUNT(DISTINCT pa.patient_id), 1)
      END AS uptake_pct
    FROM eligible pa
    LEFT JOIN Vaccination vac
      ON vac.patient_id = pa.patient_id
     AND vac.vaccine_id = :vaccine
     ${dateFilter}
    GROUP BY group_label
    ORDER BY ${orderExpr}, group_label
  `;

  const args: Record<string, string | number> = { vaccine: vaccineId };
  if (startDate && endDate) {
    args.startDate = startDate;
    args.endDate = endDate;
  }

  const result = await db.execute({ sql, args });
  return result.rows as unknown as DemographicUptakeRow[];
}

// Uptake per NHS region. Joins Patient → Vaccination → Clinic.
// Region is worked out from postcode in a CTE because Patient itself
// doesn't have a region column.
export async function getRegionalUptake(
  vaccineId: number | null,
  startDate?: string,
  endDate?: string,
): Promise<RegionalUptakeRow[]> {
  const db = getDb();
  const dateFilter = startDate && endDate
    ? `AND vac.date_administered >= :startDate AND vac.date_administered <= :endDate`
    : '';

  // libSQL doesn't accept `null` cleanly through `IS NULL OR =` with named
  // params, so the vaccine filter is built into the SQL string at the JS layer.
  const vaccineFilter = vaccineId !== null ? `AND vac.vaccine_id = :vaccine` : '';

  const sql = `
    WITH patient_with_region AS (
      SELECT p.patient_id, ${POSTCODE_TO_REGION_SQL} AS region
      FROM Patient p
    )
    SELECT
      pwr.region AS region,
      COUNT(DISTINCT pwr.patient_id) AS total_population,
      COUNT(DISTINCT vac.patient_id) AS vaccinated_count,
      CASE
        WHEN COUNT(DISTINCT pwr.patient_id) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(DISTINCT vac.patient_id) / COUNT(DISTINCT pwr.patient_id), 1)
      END AS uptake_pct
    FROM patient_with_region pwr
    LEFT JOIN Vaccination vac
      ON vac.patient_id = pwr.patient_id
      ${vaccineFilter}
      ${dateFilter}
    LEFT JOIN Clinic c
      ON c.clinic_id = vac.clinic_id
    WHERE pwr.region IS NOT NULL
    GROUP BY pwr.region
    ORDER BY pwr.region
  `;

  const args: Record<string, string | number> = {};
  if (vaccineId !== null) args.vaccine = vaccineId;
  if (startDate && endDate) {
    args.startDate = startDate;
    args.endDate = endDate;
  }

  const result = await db.execute({ sql, args });
  return result.rows as unknown as RegionalUptakeRow[];
}

// Conversion rate (invitations that turned into a vaccination) grouped by
// the channel the invitation was sent through. Joins Invitation to Vaccination.
export async function getChannelConversion(
  startDate?: string,
  endDate?: string,
): Promise<ChannelConversionRow[]> {
  const db = getDb();
  const dateFilter = startDate && endDate
    ? `WHERE i.invitation_date >= :startDate AND i.invitation_date <= :endDate`
    : '';

  const sql = `
    SELECT
      i.channel,
      COUNT(*) AS total_invitations,
      COUNT(v.vaccination_id) AS converted,
      COUNT(*) - COUNT(v.vaccination_id) AS not_converted,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(v.vaccination_id) / COUNT(*), 1)
      END AS conversion_pct
    FROM Invitation i
    LEFT JOIN Vaccination v ON v.invitation_id = i.invitation_id
    ${dateFilter}
    GROUP BY i.channel
    ORDER BY conversion_pct DESC
  `;

  const args: Record<string, string> = {};
  if (startDate && endDate) {
    args.startDate = startDate;
    args.endDate = endDate;
  }

  const result = await db.execute({ sql, args });
  return result.rows as unknown as ChannelConversionRow[];
}

// Returns all four KPI numbers in one query: total patients, overall
// coverage %, invitation conversion %, and the region with the lowest
// uptake. Doing it as one query saves the Overview tab from making
// four round trips.
export async function getKpis(
  startDate?: string,
  endDate?: string,
): Promise<KpiData> {
  const db = getDb();
  const vaccDateFilter = startDate && endDate
    ? `AND vac.date_administered >= :startDate AND vac.date_administered <= :endDate`
    : '';
  const invitationDateFilter = startDate && endDate
    ? `AND i.invitation_date >= :startDate AND i.invitation_date <= :endDate`
    : '';

  const sql = `
    WITH patient_with_region AS (
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
      LEFT JOIN Vaccination vac
        ON vac.patient_id = pwr.patient_id
        ${vaccDateFilter}
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
      CASE
        WHEN COUNT(DISTINCT p.patient_id) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(DISTINCT pv.patient_id) / COUNT(DISTINCT p.patient_id), 1)
      END AS overall_coverage_pct,
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(100.0 * COUNT(DISTINCT v.vaccination_id) / COUNT(DISTINCT i.invitation_id), 1)
      END AS conversion_pct,
      COALESCE((SELECT region FROM lowest_region), 'N/A') AS lowest_coverage_region
    FROM Patient p
    LEFT JOIN patient_vaccinated pv ON pv.patient_id = p.patient_id
    CROSS JOIN Invitation i
    LEFT JOIN Vaccination v ON v.invitation_id = i.invitation_id
    WHERE 1=1 ${invitationDateFilter}
  `;

  const args: Record<string, string> = {};
  if (startDate && endDate) {
    args.startDate = startDate;
    args.endDate = endDate;
  }

  const result = await db.execute({ sql, args });
  return (result.rows[0] as unknown as KpiData) ?? {
    total_patients: 0,
    overall_coverage_pct: 0,
    conversion_pct: 0,
    lowest_coverage_region: 'N/A',
  };
}

// Looks at how the conversion rate changes with the number of reminders
// sent. Buckets invitations into 0, 1, 2, or 3+ reminders. Joins
// Invitation, Reminder, and Vaccination.
export async function getReminderConversion(
  startDate?: string,
  endDate?: string,
): Promise<ReminderConversionRow[]> {
  const db = getDb();
  const dateFilter = startDate && endDate
    ? `WHERE i.invitation_date >= :startDate AND i.invitation_date <= :endDate`
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
      CASE
        WHEN COUNT(*) = 0 THEN 0
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

  const args: Record<string, string> = {};
  if (startDate && endDate) {
    args.startDate = startDate;
    args.endDate = endDate;
  }

  const result = await db.execute({ sql, args });
  return result.rows as unknown as ReminderConversionRow[];
}
