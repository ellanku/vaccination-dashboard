/*
 * Seed generator for the vaccination dashboard.
 *
 * Produces /data/seed.sql with synthetic but realistic data for ~500 patients,
 * 15 clinics, 8 vaccines, and proportional invitations/reminders/vaccinations.
 *
 * Coverage patterns are calibrated to surface the disparities the dashboard
 * is meant to reveal:
 *   - childhood vaccines highest (~88-92%), shingles lowest (~50-60%)
 *   - London 5-10pp lower than other regions
 *   - eligible risk groups have higher coverage than 'None' (priority cohorts)
 *   - SMS invitations convert higher than Letter (5-10pp spread)
 *   - invitations with reminders convert slightly higher than those without
 *
 * Determinism: a seeded mulberry32 PRNG is used throughout so re-running the
 * generator produces byte-identical seed.sql output.
 *
 * Usage: npm run seed:generate  (uses tsx; see package.json)
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------
// Seeded PRNG and helpers
// ---------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260429);

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

interface Weighted<T> { value: T; weight: number; }

function pickWeighted<T>(items: Weighted<T>[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  const r = rand() * total;
  let acc = 0;
  for (const item of items) {
    acc += item.weight;
    if (r <= acc) return item.value;
  }
  return items[items.length - 1].value;
}

function sqlString(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function sqlNullableInt(n: number | null): string {
  return n === null ? 'NULL' : String(n);
}

function pad(n: number, len: number): string {
  return n.toString().padStart(len, '0');
}

function dateISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

const REFERENCE_DATE = new Date(Date.UTC(2026, 3, 29)); // 2026-04-29

// ---------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------

interface VaccineDef {
  vaccine_id: number;
  vaccine_name: string;
  target_disease: string;
  manufacturer: string;
  doses_required: number;
  minimum_age_months: number;
}

const VACCINES: VaccineDef[] = [
  { vaccine_id: 1, vaccine_name: 'MMR', target_disease: 'Measles, Mumps, Rubella', manufacturer: 'GSK', doses_required: 2, minimum_age_months: 12 },
  { vaccine_id: 2, vaccine_name: '6-in-1 (DTaP/IPV/Hib/HepB)', target_disease: 'Diphtheria/Tetanus/Pertussis/Polio/Hib/HepB', manufacturer: 'Sanofi Pasteur', doses_required: 3, minimum_age_months: 2 },
  { vaccine_id: 3, vaccine_name: 'HPV', target_disease: 'Human Papillomavirus', manufacturer: 'MSD', doses_required: 2, minimum_age_months: 144 },
  { vaccine_id: 4, vaccine_name: 'Meningitis ACWY', target_disease: 'Meningococcal disease', manufacturer: 'GSK', doses_required: 1, minimum_age_months: 168 },
  { vaccine_id: 5, vaccine_name: 'Seasonal Flu', target_disease: 'Influenza', manufacturer: 'Sanofi Pasteur', doses_required: 1, minimum_age_months: 6 },
  { vaccine_id: 6, vaccine_name: 'COVID-19', target_disease: 'SARS-CoV-2', manufacturer: 'Pfizer-BioNTech', doses_required: 2, minimum_age_months: 60 },
  { vaccine_id: 7, vaccine_name: 'Pneumococcal (PPV)', target_disease: 'S. pneumoniae', manufacturer: 'MSD', doses_required: 1, minimum_age_months: 780 },
  { vaccine_id: 8, vaccine_name: 'Shingles', target_disease: 'Herpes Zoster', manufacturer: 'GSK', doses_required: 2, minimum_age_months: 780 },
];

const REGIONS = ['London', 'North West', 'South East', 'Yorkshire and the Humber', 'West Midlands'] as const;
type Region = typeof REGIONS[number];

// Postcode prefixes are chosen so that no prefix is itself a prefix of another
// region's prefix. This lets the geography query map postcode → region with a
// simple CASE expression (no ordering bugs).
const POSTCODE_PREFIXES: Record<Region, string[]> = {
  'London': ['SW', 'NW', 'SE'],
  'North West': ['M', 'WA', 'PR'],
  'South East': ['BN', 'OX', 'GU'],
  'Yorkshire and the Humber': ['YO', 'HU', 'BD'],
  'West Midlands': ['CV', 'WV', 'DY'],
};

const CLINIC_TYPES = ['GP Surgery', 'Community Clinic', 'Pharmacy'] as const;

interface ClinicDef {
  clinic_id: number;
  clinic_name: string;
  address_line: string;
  postcode: string;
  region: Region;
  clinic_type: string;
  capacity_per_day: number;
}

const CLINICS: ClinicDef[] = [];
{
  let cid = 1;
  for (const region of REGIONS) {
    for (let i = 0; i < CLINIC_TYPES.length; i++) {
      const type = CLINIC_TYPES[i];
      const prefix = POSTCODE_PREFIXES[region][i];
      const postcode = `${prefix}${randInt(1, 20)} ${randInt(1, 9)}${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}`;
      const capacity = type === 'Community Clinic' ? randInt(80, 150)
        : type === 'GP Surgery' ? randInt(40, 80)
        : randInt(20, 50);
      CLINICS.push({
        clinic_id: cid++,
        clinic_name: `${region} ${type}${i > 0 ? ' ' + (i + 1) : ''}`,
        address_line: `${randInt(1, 250)} High Street`,
        postcode,
        region,
        clinic_type: type,
        capacity_per_day: capacity,
      });
    }
  }
}

// ---------------------------------------------------------------------
// Patient demographics
// ---------------------------------------------------------------------

const ETHNICITIES: Weighted<string>[] = [
  { value: 'White', weight: 74 },
  { value: 'Asian', weight: 10 },
  { value: 'Black', weight: 4 },
  { value: 'Mixed', weight: 3 },
  { value: 'Other', weight: 2 },
  { value: 'Prefer not to say', weight: 7 },
];

const GENDERS: Weighted<string>[] = [
  { value: 'Female', weight: 51 },
  { value: 'Male', weight: 48 },
  { value: 'Other/Not stated', weight: 1 },
];

// 'Over-65' is derived from DOB further down so it can overlap risk weights.
const RISK_GROUPS: Weighted<string>[] = [
  { value: 'None', weight: 70 },
  { value: 'Pregnant', weight: 3 },
  { value: 'Immunocompromised', weight: 5 },
  { value: 'Chronic respiratory', weight: 7 },
  { value: 'Chronic cardiovascular', weight: 6 },
  { value: 'Diabetes', weight: 5 },
];

interface PatientRow {
  patient_id: number;
  nhs_number: string;
  date_of_birth: Date;
  gender: string;
  ethnicity: string;
  postcode: string;
  risk_group: string;
  registered_date: Date;
  region: Region; // derived only — not emitted in SQL
}

function ageInYears(dob: Date): number {
  let years = REFERENCE_DATE.getUTCFullYear() - dob.getUTCFullYear();
  if (
    REFERENCE_DATE.getUTCMonth() < dob.getUTCMonth() ||
    (REFERENCE_DATE.getUTCMonth() === dob.getUTCMonth() && REFERENCE_DATE.getUTCDate() < dob.getUTCDate())
  ) years--;
  return years;
}

function ageInMonths(dob: Date): number {
  let months = (REFERENCE_DATE.getUTCFullYear() - dob.getUTCFullYear()) * 12
    + (REFERENCE_DATE.getUTCMonth() - dob.getUTCMonth());
  if (REFERENCE_DATE.getUTCDate() < dob.getUTCDate()) months--;
  return months;
}

// Distribute DOBs across all 8 vaccine target cohorts so every chart bar has data.
function generateDOB(): Date {
  const bucket = pickWeighted([
    { value: 'infant', weight: 5 },      // 0-1
    { value: 'preschool', weight: 6 },   // 2-4
    { value: 'school', weight: 13 },     // 5-15
    { value: 'youngAdult', weight: 14 }, // 16-25
    { value: 'adult', weight: 23 },      // 26-44
    { value: 'midlife', weight: 19 },    // 45-64
    { value: 'senior', weight: 20 },     // 65+
  ]);
  let years: number;
  switch (bucket) {
    case 'infant': years = randInt(0, 1); break;
    case 'preschool': years = randInt(2, 4); break;
    case 'school': years = randInt(5, 15); break;
    case 'youngAdult': years = randInt(16, 25); break;
    case 'adult': years = randInt(26, 44); break;
    case 'midlife': years = randInt(45, 64); break;
    default: years = randInt(65, 89);
  }
  // For infants ensure age >= 6 months so flu eligibility kicks in for some.
  const days = years === 0 ? randInt(60, 364) : randInt(0, 364);
  const dob = new Date(REFERENCE_DATE);
  dob.setUTCFullYear(dob.getUTCFullYear() - years);
  dob.setUTCDate(dob.getUTCDate() - days);
  return dob;
}

const usedNhs = new Set<string>();
function makeNhs(): string {
  let n = '';
  do {
    n = '';
    for (let i = 0; i < 10; i++) n += randInt(0, 9).toString();
  } while (usedNhs.has(n));
  usedNhs.add(n);
  return n;
}

function makePostcode(region: Region): string {
  const prefixes = POSTCODE_PREFIXES[region];
  const prefix = prefixes[randInt(0, prefixes.length - 1)];
  return `${prefix}${randInt(1, 20)} ${randInt(1, 9)}${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}`;
}

const NUM_PATIENTS = 500;
const PATIENTS: PatientRow[] = [];
for (let i = 1; i <= NUM_PATIENTS; i++) {
  const region = REGIONS[randInt(0, REGIONS.length - 1)];
  const dob = generateDOB();
  const ageY = ageInYears(dob);
  const gender = pickWeighted(GENDERS);
  let risk: string;
  if (ageY >= 65 && rand() < 0.55) {
    risk = 'Over-65';
  } else {
    risk = pickWeighted(RISK_GROUPS);
    if (risk === 'Pregnant' && (gender !== 'Female' || ageY < 16 || ageY > 50)) {
      risk = 'None';
    }
  }
  const ethnicity = pickWeighted(ETHNICITIES);
  const maxRegYearsBack = Math.min(Math.max(ageY, 1), 30);
  const regDaysBack = randInt(30, maxRegYearsBack * 365);
  const registeredDate = addDays(REFERENCE_DATE, -regDaysBack);
  PATIENTS.push({
    patient_id: i,
    nhs_number: makeNhs(),
    date_of_birth: dob,
    gender,
    ethnicity,
    postcode: makePostcode(region),
    risk_group: risk,
    registered_date: registeredDate,
    region,
  });
}

// ---------------------------------------------------------------------
// Eligibility & coverage model
// ---------------------------------------------------------------------

function isEligible(p: PatientRow, v: VaccineDef): boolean {
  const ageY = ageInYears(p.date_of_birth);
  const ageM = ageInMonths(p.date_of_birth);
  if (ageM < v.minimum_age_months) return false;
  // Tighten upper-age bounds for cohort-specific programmes so the
  // "eligible cohort" denominator reflects who the programme targets.
  switch (v.vaccine_id) {
    case 1: return ageY <= 18; // MMR — childhood/adolescent catch-up
    case 2: return ageY <= 5;  // 6-in-1 — infants only
    case 3: return ageY <= 25; // HPV
    case 4: return ageY <= 25; // MenACWY
    default: return true;
  }
}

interface CoverageModel {
  base: number;
  riskBoost?: Record<string, number>;
}

const COVERAGE: Record<number, CoverageModel> = {
  1: { base: 0.90 }, // MMR
  2: { base: 0.92 }, // 6-in-1
  3: { base: 0.84 }, // HPV
  4: { base: 0.86 }, // MenACWY
  5: {               // Seasonal Flu — risk groups prioritised
    base: 0.55,
    riskBoost: {
      'Immunocompromised': 0.20,
      'Chronic respiratory': 0.18,
      'Chronic cardiovascular': 0.15,
      'Diabetes': 0.12,
      'Pregnant': 0.15,
      'Over-65': 0.22,
    },
  },
  6: {               // COVID-19
    base: 0.68,
    riskBoost: {
      'Immunocompromised': 0.15,
      'Chronic respiratory': 0.10,
      'Chronic cardiovascular': 0.08,
      'Diabetes': 0.06,
      'Over-65': 0.15,
    },
  },
  7: {               // PPV
    base: 0.62,
    riskBoost: { 'Immunocompromised': 0.10, 'Over-65': 0.05 },
  },
  8: { base: 0.55 }, // Shingles
};

const REGION_OFFSET: Record<Region, number> = {
  'London': -0.07,
  'North West': 0.01,
  'South East': 0.03,
  'Yorkshire and the Humber': -0.01,
  'West Midlands': 0.00,
};

const ETHNICITY_OFFSET: Record<string, number> = {
  'White': 0.02,
  'Asian': -0.01,
  'Black': -0.04,
  'Mixed': 0.00,
  'Other': -0.03,
  'Prefer not to say': -0.02,
};

function coverageFor(p: PatientRow, v: VaccineDef): number {
  const cov = COVERAGE[v.vaccine_id];
  let r = cov.base;
  r += REGION_OFFSET[p.region] ?? 0;
  r += ETHNICITY_OFFSET[p.ethnicity] ?? 0;
  if (cov.riskBoost?.[p.risk_group]) r += cov.riskBoost[p.risk_group];
  r += (rand() - 0.5) * 0.04; // small per-patient noise
  return Math.max(0.01, Math.min(0.97, r));
}

interface Decision {
  patient: PatientRow;
  vaccine: VaccineDef;
  vaccinated: boolean;
}

const DECISIONS: Decision[] = [];
for (const p of PATIENTS) {
  for (const v of VACCINES) {
    if (!isEligible(p, v)) continue;
    DECISIONS.push({ patient: p, vaccine: v, vaccinated: rand() < coverageFor(p, v) });
  }
}

// ---------------------------------------------------------------------
// Invitations and vaccinations
// ---------------------------------------------------------------------

const NON_VACC_STATUS: Weighted<string>[] = [
  { value: 'Sent', weight: 30 },
  { value: 'Booked', weight: 25 },
  { value: 'DNA', weight: 30 },
  { value: 'Declined', weight: 15 },
];

// Channel mix tilted toward SMS for converted invitations and toward Letter
// for unconverted ones — produces the SMS > Email > Letter conversion ranking
// while leaving overall channel distribution near 50/30/20.
const VACC_CHANNEL: Weighted<string>[] = [
  { value: 'SMS', weight: 53 },
  { value: 'Letter', weight: 27 },
  { value: 'Email', weight: 20 },
];
const NONVACC_CHANNEL: Weighted<string>[] = [
  { value: 'SMS', weight: 47 },
  { value: 'Letter', weight: 33 },
  { value: 'Email', weight: 20 },
];

function clinicForRegion(region: Region): ClinicDef {
  const inRegion = CLINICS.filter(c => c.region === region);
  return inRegion[randInt(0, inRegion.length - 1)];
}

function batchNumber(): string {
  return `B${randInt(1000, 9999)}-${String.fromCharCode(65 + randInt(0, 25))}${String.fromCharCode(65 + randInt(0, 25))}`;
}

const ADMINISTERED_BY = [
  'Nurse Patel', 'Dr Smith', 'Pharmacist Chen', "Nurse O'Connor",
  'Dr Adeyemi', 'Pharmacist Khan', 'Nurse Williams', 'Dr Martin',
];

interface InvitationRow {
  invitation_id: number; patient_id: number; clinic_id: number; vaccine_id: number;
  invitation_date: Date; channel: string; status: string;
}
interface VaccinationRow {
  vaccination_id: number; patient_id: number; clinic_id: number; vaccine_id: number;
  invitation_id: number | null; date_administered: Date; dose_number: number;
  batch_number: string; administered_by: string;
}
interface ReminderRow {
  reminder_id: number; invitation_id: number; reminder_date: Date;
  channel: string; delivery_status: string; reminder_number: number;
}

const INVITATIONS: InvitationRow[] = [];
const VACCINATIONS: VaccinationRow[] = [];
const REMINDERS: ReminderRow[] = [];

let invId = 1;
let vaccId = 1;
let remId = 1;

const PROGRAMME_WINDOW_DAYS = 540; // ~18 months back
function programmeDate(): Date {
  return addDays(REFERENCE_DATE, -randInt(7, PROGRAMME_WINDOW_DAYS));
}

for (const d of DECISIONS) {
  if (d.vaccinated) {
    const clinic = clinicForRegion(d.patient.region);
    const isWalkIn = rand() < 0.10;
    const invDate = programmeDate();
    let invitationId: number | null = null;
    if (!isWalkIn) {
      INVITATIONS.push({
        invitation_id: invId,
        patient_id: d.patient.patient_id,
        clinic_id: clinic.clinic_id,
        vaccine_id: d.vaccine.vaccine_id,
        invitation_date: invDate,
        channel: pickWeighted(VACC_CHANNEL),
        status: 'Attended',
      });
      invitationId = invId;
      invId++;
    }
    const adminCandidate = isWalkIn ? programmeDate() : addDays(invDate, randInt(2, 30));
    const adminDate = adminCandidate > REFERENCE_DATE ? REFERENCE_DATE : adminCandidate;
    VACCINATIONS.push({
      vaccination_id: vaccId++,
      patient_id: d.patient.patient_id,
      clinic_id: clinic.clinic_id,
      vaccine_id: d.vaccine.vaccine_id,
      invitation_id: invitationId,
      date_administered: adminDate,
      dose_number: 1,
      batch_number: batchNumber(),
      administered_by: ADMINISTERED_BY[randInt(0, ADMINISTERED_BY.length - 1)],
    });
  } else {
    // 85% of non-vaccinated eligible patients still received an invitation.
    if (rand() >= 0.85) continue;
    const clinic = clinicForRegion(d.patient.region);
    INVITATIONS.push({
      invitation_id: invId++,
      patient_id: d.patient.patient_id,
      clinic_id: clinic.clinic_id,
      vaccine_id: d.vaccine.vaccine_id,
      invitation_date: programmeDate(),
      channel: pickWeighted(NONVACC_CHANNEL),
      status: pickWeighted(NON_VACC_STATUS),
    });
  }
}

// ---------------------------------------------------------------------
// Reminders — biased toward attended invitations so reminders correlate
// with conversion.
// ---------------------------------------------------------------------

for (const inv of INVITATIONS) {
  const pAny = inv.status === 'Attended' ? 0.40 : 0.22;
  if (rand() >= pAny) continue;
  const remCount = pickWeighted([
    { value: 1, weight: 65 },
    { value: 2, weight: 25 },
    { value: 3, weight: 10 },
  ]);
  for (let n = 1; n <= remCount; n++) {
    const candidate = addDays(inv.invitation_date, n * randInt(7, 14));
    const reminderDate = candidate > REFERENCE_DATE ? REFERENCE_DATE : candidate;
    REMINDERS.push({
      reminder_id: remId++,
      invitation_id: inv.invitation_id,
      reminder_date: reminderDate,
      channel: pickWeighted([
        { value: 'SMS', weight: 60 },
        { value: 'Letter', weight: 20 },
        { value: 'Email', weight: 20 },
      ]),
      delivery_status: pickWeighted([
        { value: 'Delivered', weight: 85 },
        { value: 'Failed', weight: 8 },
        { value: 'Bounced', weight: 7 },
      ]),
      reminder_number: n,
    });
  }
}

// ---------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------

const lines: string[] = [];
lines.push('/* Synthetic data for university coursework prototype. Coverage patterns informed by UK Health Security Agency vaccination statistics; no real patient data is used. */');
lines.push('');
lines.push('BEGIN TRANSACTION;');
lines.push('');

lines.push('-- Vaccines');
for (const v of VACCINES) {
  lines.push(
    `INSERT INTO Vaccine (vaccine_id, vaccine_name, target_disease, manufacturer, doses_required, minimum_age_months) VALUES (`
    + `${v.vaccine_id}, ${sqlString(v.vaccine_name)}, ${sqlString(v.target_disease)}, ${sqlString(v.manufacturer)}, ${v.doses_required}, ${v.minimum_age_months});`
  );
}
lines.push('');

lines.push('-- Clinics');
for (const c of CLINICS) {
  lines.push(
    `INSERT INTO Clinic (clinic_id, clinic_name, address_line, postcode, region, clinic_type, capacity_per_day) VALUES (`
    + `${c.clinic_id}, ${sqlString(c.clinic_name)}, ${sqlString(c.address_line)}, ${sqlString(c.postcode)}, ${sqlString(c.region)}, ${sqlString(c.clinic_type)}, ${c.capacity_per_day});`
  );
}
lines.push('');

lines.push('-- Patients');
for (const p of PATIENTS) {
  lines.push(
    `INSERT INTO Patient (patient_id, nhs_number, date_of_birth, gender, ethnicity, postcode, risk_group, registered_date) VALUES (`
    + `${p.patient_id}, ${sqlString(p.nhs_number)}, ${sqlString(dateISO(p.date_of_birth))}, ${sqlString(p.gender)}, ${sqlString(p.ethnicity)}, ${sqlString(p.postcode)}, ${sqlString(p.risk_group)}, ${sqlString(dateISO(p.registered_date))});`
  );
}
lines.push('');

lines.push('-- Invitations');
for (const inv of INVITATIONS) {
  lines.push(
    `INSERT INTO Invitation (invitation_id, patient_id, clinic_id, vaccine_id, invitation_date, channel, status) VALUES (`
    + `${inv.invitation_id}, ${inv.patient_id}, ${inv.clinic_id}, ${inv.vaccine_id}, ${sqlString(dateISO(inv.invitation_date))}, ${sqlString(inv.channel)}, ${sqlString(inv.status)});`
  );
}
lines.push('');

lines.push('-- Reminders');
for (const r of REMINDERS) {
  lines.push(
    `INSERT INTO Reminder (reminder_id, invitation_id, reminder_date, channel, delivery_status, reminder_number) VALUES (`
    + `${r.reminder_id}, ${r.invitation_id}, ${sqlString(dateISO(r.reminder_date))}, ${sqlString(r.channel)}, ${sqlString(r.delivery_status)}, ${r.reminder_number});`
  );
}
lines.push('');

lines.push('-- Vaccinations');
for (const v of VACCINATIONS) {
  lines.push(
    `INSERT INTO Vaccination (vaccination_id, patient_id, clinic_id, vaccine_id, invitation_id, date_administered, dose_number, batch_number, administered_by) VALUES (`
    + `${v.vaccination_id}, ${v.patient_id}, ${v.clinic_id}, ${v.vaccine_id}, ${sqlNullableInt(v.invitation_id)}, ${sqlString(dateISO(v.date_administered))}, ${v.dose_number}, ${sqlString(v.batch_number)}, ${sqlString(v.administered_by)});`
  );
}
lines.push('');

lines.push('COMMIT;');

const out = join(process.cwd(), 'data', 'seed.sql');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join('\n') + '\n');

// ---------------------------------------------------------------------
// Summary stats — printed so the seed run is auditable.
// ---------------------------------------------------------------------

console.log(`Wrote ${out}`);
console.log(`  Patients:     ${PATIENTS.length}`);
console.log(`  Vaccines:     ${VACCINES.length}`);
console.log(`  Clinics:      ${CLINICS.length}`);
console.log(`  Invitations:  ${INVITATIONS.length}`);
console.log(`  Reminders:    ${REMINDERS.length}`);
console.log(`  Vaccinations: ${VACCINATIONS.length} (walk-ins: ${VACCINATIONS.filter(v => v.invitation_id === null).length})`);

const channelStats: Record<string, { total: number; converted: number }> = {};
for (const inv of INVITATIONS) {
  channelStats[inv.channel] ??= { total: 0, converted: 0 };
  channelStats[inv.channel].total++;
  if (inv.status === 'Attended') channelStats[inv.channel].converted++;
}
console.log('  Channel conversion:');
for (const [ch, s] of Object.entries(channelStats)) {
  console.log(`    ${ch.padEnd(7)} ${s.converted}/${s.total} = ${(s.converted / s.total * 100).toFixed(1)}%`);
}

const regionPop: Record<string, number> = {};
const regionVacc: Record<string, number> = {};
for (const p of PATIENTS) {
  regionPop[p.region] = (regionPop[p.region] ?? 0) + 1;
  regionVacc[p.region] ??= 0;
}
const patientById = new Map(PATIENTS.map(p => [p.patient_id, p]));
for (const v of VACCINATIONS) {
  const p = patientById.get(v.patient_id);
  if (p) regionVacc[p.region] = (regionVacc[p.region] ?? 0) + 1;
}
console.log('  Vaccinations by region:');
for (const r of REGIONS) {
  console.log(`    ${r.padEnd(28)} ${regionVacc[r]} (population ${regionPop[r]})`);
}

const vaccineUptake: Record<number, { eligible: number; vaccinated: number }> = {};
for (const d of DECISIONS) {
  const id = d.vaccine.vaccine_id;
  vaccineUptake[id] ??= { eligible: 0, vaccinated: 0 };
  vaccineUptake[id].eligible++;
  if (d.vaccinated) vaccineUptake[id].vaccinated++;
}
console.log('  Per-vaccine uptake (among eligible cohort):');
for (const v of VACCINES) {
  const s = vaccineUptake[v.vaccine_id];
  if (!s) continue;
  console.log(`    ${v.vaccine_name.padEnd(28)} ${s.vaccinated}/${s.eligible} = ${(s.vaccinated / s.eligible * 100).toFixed(1)}%`);
}
