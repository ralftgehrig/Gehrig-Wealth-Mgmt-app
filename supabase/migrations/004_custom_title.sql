-- Lets the user override the displayed title of a transaction (e.g. renaming a
-- cryptic bank descriptor like "SQ *NOXY BROTHERS") without losing the original
-- merchant/description text underneath, which categorisation and dedup still use.
ALTER TABLE transactions ADD COLUMN custom_title TEXT;
