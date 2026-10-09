-- Local development seed. Real programmes supplied by the ministry; times are
-- left unconfirmed where the ministry asked us not to show them yet.

insert into public.events
  (slug, title, summary, theme, is_recurring, recurrence_note, time_tbc, dress_code, registration_open, status)
values
  ('yada-intimacy-conference-2026',
   'YADA Intimacy Conference 2026',
   'YADA Intimacy Conference is a call into the deeper reality of YADA—knowing God beyond intellectual awareness and into experiential, relational, intimate knowing. It is a journey from knowing about God to truly knowing Him through desire, encounter, fellowship, surrender, obedience, and continual communion.',
   'Reviving the Ancient Well',
   false, 'Yearly conference held in December', true,
   'Decent and modest dressing is a priority for this event. Dress as one who is coming into the presence of their King.',
   true, 'published'),
  ('10-hours-prayer-stretch', '10 Hours Prayer Stretch', null, null,
   true, 'Every Friday on YouTube', true, null, false, 'published'),
  ('zoe-healing-stream', 'Zoe Healing Stream', null, null,
   true, 'Every Wednesday', true, null, false, 'published'),
  ('24-hours-prayer-stretch', '24 Hours Prayer Stretch', null, null,
   true, 'First Saturday of every quarter', true, null, false, 'published'),
  ('shaping-the-year-2027', 'Shaping the Year 2027', null, null,
   false, null, true, null, false, 'draft')
on conflict (slug) do nothing;

insert into public.site_content (key, value) values
  ('contact', '{
     "email": "General@encounterground.org",
     "phone": "08099977733",
     "instagram": "https://www.instagram.com/encounter_ground",
     "tiktok": "https://www.tiktok.com/@encounterground",
     "youtube": "EncounterGroundTV",
     "whatsapp": "https://whatsapp.com/channel/0029VbDonGGKmCPZKguofK3T"
   }'::jsonb),
  ('school.classes', '["Halak", "Chayil", "Becoming", "Whispers"]'::jsonb)
on conflict (key) do nothing;
