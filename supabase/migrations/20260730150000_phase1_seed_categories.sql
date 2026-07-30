-- ============================================================================
-- SAPIENS — Phase 1, Chunk 4: seed the 8 parent categories (PRD 3.11)
-- ============================================================================
-- The taxonomy is DATA, not code. These 8 parents are what "Ways I help" lets
-- a user opt into. Subtypes + the full attribute tuning happen in Phase 2 with
-- the dispatch engine. Idempotent via ON CONFLICT (slug).
--
-- Attribute defaults are the bracketed values from PRD 3.11:
--   [default_timing · typical_urgency · interaction_type · safety_sensitivity]
-- ============================================================================

insert into public.categories
  (slug, label, description, icon, default_timing, typical_urgency,
   interaction_type, implies_physical_meet, safety_sensitivity, allows_media)
values
  ('travel',    'Travel & Mobility',   'Rides, accompanying a journey, help with public transport, station/airport pickups.',
    'car-outline',           'either',    'everyday', 'one_to_one', true,  'high',   true),
  ('food',      'Food & Essentials',   'A meal shared, groceries dropped, medicine picked up, food for someone unwell.',
    'fast-food-outline',     'now',       'everyday', 'one_to_one', true,  'medium', true),
  ('knowledge', 'Knowledge & Skills',  'Language practice, tutoring, resume/job guidance, tech help, a skill shared.',
    'book-outline',          'scheduled', 'casual',   'one_to_one', true,  'medium', true),
  ('time',      'Time & Presence',     'Companionship, a companion to an appointment, sitting with someone, helping a newcomer.',
    'time-outline',          'either',    'everyday', 'one_to_one', true,  'high',   true),
  ('hands',     'Hands & Effort',      'Moving/lifting, small repairs, assembling something, an extra pair of hands.',
    'hammer-outline',        'either',    'everyday', 'either',     true,  'medium', true),
  ('material',  'Material & Sharing',  'Donate an item, lend a tool, pass on furniture/books/clothes.',
    'cube-outline',          'scheduled', 'casual',   'one_to_one', true,  'low',    true),
  ('activity',  'Activity & Community','A sports partner, a walking companion, hobby groups, someone to do a thing with.',
    'basketball-outline',    'scheduled', 'casual',   'group',      true,  'medium', true),
  ('safety',    'Safety & Urgent Help','Urgent non-emergencies — stranded, locked out, need a hand fast.',
    'shield-outline',        'now',       'urgent',   'one_to_one', true,  'high',   true)
on conflict (slug) do nothing;
