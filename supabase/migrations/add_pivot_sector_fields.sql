-- Migration: add sector fields to pivots table
-- Allows partial-circle pivots (e.g., 270° sector instead of full 360°)
-- Angles in degrees, clockwise from North (standard GPS convention)

ALTER TABLE pivots
  ADD COLUMN IF NOT EXISTS sector_start_deg numeric(6,2) DEFAULT NULL;

ALTER TABLE pivots
  ADD COLUMN IF NOT EXISTS sector_end_deg numeric(6,2) DEFAULT NULL;
