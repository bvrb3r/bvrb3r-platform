-- Adds the AutoBooth Rent value to the barber subtype enum.
--
-- `alter type ... add value` must be committed before the value can be used in
-- constraints, updates, or comparisons, so this migration is deliberately
-- separate from 20260727120100_autobooth_rent_doctrine_lock.sql, which is where
-- the value is actually used. This mirrors the existing precedent in
-- 20260514203000_add_barber_role_enum_values.sql.
--
-- The retired revenue-share enum value is intentionally left in place: enum
-- values cannot be removed, and pre-doctrine rows must still be readable so the
-- doctrine lock can normalize them.

alter type public.barber_subtype add value if not exists 'autobooth_rent';
