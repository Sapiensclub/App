-- ============================================================================
-- SAPIENS — Phase 6, Chunk 2 (prep): add the 'help' moment type
-- ============================================================================
-- The community feed shows anonymous "a help happened nearby" tiles alongside
-- selfies and milestones. A new enum value must be added in its own migration
-- (transaction) before it can be used, so this file does only that.
-- ============================================================================
alter type public.moment_type add value if not exists 'help';
