/*
 * Vaccination Uptake Dashboard - Database Schema
 *
 * 6-table relational schema (3NF) for tracking vaccination programmes:
 * patients, vaccines, clinics, invitations, reminders, and administered
 * vaccinations. Designed for SQLite (better-sqlite3) locally; portable to
 * Turso/libSQL for production.
 *
 * Foreign keys are declared on every reference. SQLite requires
 * `PRAGMA foreign_keys = ON;` per connection (set in lib/db.ts) for them
 * to be enforced at runtime.
 */

PRAGMA foreign_keys = ON;

-- Drop in reverse-dependency order so the script is idempotent.
DROP TABLE IF EXISTS Vaccination;
DROP TABLE IF EXISTS Reminder;
DROP TABLE IF EXISTS Invitation;
DROP TABLE IF EXISTS Clinic;
DROP TABLE IF EXISTS Vaccine;
DROP TABLE IF EXISTS Patient;

CREATE TABLE Patient (
    patient_id        INTEGER PRIMARY KEY,
    nhs_number        CHAR(10)    NOT NULL UNIQUE,
    date_of_birth     DATE        NOT NULL,
    gender            VARCHAR(20) NOT NULL,
    ethnicity         VARCHAR(50) NOT NULL,
    postcode          VARCHAR(10) NOT NULL,
    risk_group        VARCHAR(30) NOT NULL,
    registered_date   DATE        NOT NULL
);

CREATE TABLE Vaccine (
    vaccine_id          INTEGER PRIMARY KEY,
    vaccine_name        VARCHAR(100) NOT NULL,
    target_disease      VARCHAR(50)  NOT NULL,
    manufacturer        VARCHAR(100) NOT NULL,
    doses_required      INTEGER      NOT NULL CHECK (doses_required > 0),
    minimum_age_months  INTEGER      NOT NULL CHECK (minimum_age_months >= 0)
);

CREATE TABLE Clinic (
    clinic_id         INTEGER PRIMARY KEY,
    clinic_name       VARCHAR(100) NOT NULL,
    address_line      VARCHAR(150) NOT NULL,
    postcode          VARCHAR(10)  NOT NULL,
    region            VARCHAR(50)  NOT NULL,
    clinic_type       VARCHAR(30)  NOT NULL,
    capacity_per_day  INTEGER      NOT NULL CHECK (capacity_per_day > 0)
);

CREATE TABLE Invitation (
    invitation_id    INTEGER PRIMARY KEY,
    patient_id       INTEGER     NOT NULL,
    clinic_id        INTEGER     NOT NULL,
    vaccine_id       INTEGER     NOT NULL,
    invitation_date  DATE        NOT NULL,
    channel          VARCHAR(20) NOT NULL CHECK (channel IN ('SMS', 'Letter', 'Email')),
    status           VARCHAR(20) NOT NULL CHECK (status IN ('Sent', 'Booked', 'Attended', 'DNA', 'Declined')),
    FOREIGN KEY (patient_id) REFERENCES Patient(patient_id),
    FOREIGN KEY (clinic_id)  REFERENCES Clinic(clinic_id),
    FOREIGN KEY (vaccine_id) REFERENCES Vaccine(vaccine_id)
);

CREATE TABLE Reminder (
    reminder_id      INTEGER PRIMARY KEY,
    invitation_id    INTEGER     NOT NULL,
    reminder_date    DATE        NOT NULL,
    channel          VARCHAR(20) NOT NULL CHECK (channel IN ('SMS', 'Letter', 'Email')),
    delivery_status  VARCHAR(20) NOT NULL,
    reminder_number  INTEGER     NOT NULL CHECK (reminder_number > 0),
    FOREIGN KEY (invitation_id) REFERENCES Invitation(invitation_id)
);

-- invitation_id is NULLABLE to support walk-in vaccinations where no
-- prior invitation existed.
CREATE TABLE Vaccination (
    vaccination_id     INTEGER PRIMARY KEY,
    patient_id         INTEGER      NOT NULL,
    clinic_id          INTEGER      NOT NULL,
    vaccine_id         INTEGER      NOT NULL,
    invitation_id      INTEGER,
    date_administered  DATE         NOT NULL,
    dose_number        INTEGER      NOT NULL CHECK (dose_number > 0),
    batch_number       VARCHAR(30)  NOT NULL,
    administered_by    VARCHAR(100) NOT NULL,
    FOREIGN KEY (patient_id)    REFERENCES Patient(patient_id),
    FOREIGN KEY (clinic_id)     REFERENCES Clinic(clinic_id),
    FOREIGN KEY (vaccine_id)    REFERENCES Vaccine(vaccine_id),
    FOREIGN KEY (invitation_id) REFERENCES Invitation(invitation_id)
);

-- Indexes to speed up the dashboard's grouped queries.
CREATE INDEX idx_vaccination_patient   ON Vaccination(patient_id);
CREATE INDEX idx_vaccination_vaccine   ON Vaccination(vaccine_id);
CREATE INDEX idx_vaccination_clinic    ON Vaccination(clinic_id);
CREATE INDEX idx_invitation_patient    ON Invitation(patient_id);
CREATE INDEX idx_invitation_vaccine    ON Invitation(vaccine_id);
CREATE INDEX idx_reminder_invitation   ON Reminder(invitation_id);
CREATE INDEX idx_clinic_region         ON Clinic(region);
CREATE INDEX idx_patient_dob           ON Patient(date_of_birth);
