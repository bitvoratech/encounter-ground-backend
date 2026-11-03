-- The four Beth-El Institute classes, moved from the website's sample content into the
-- database. SAMPLE OUTLINES: module themes come from each class's description; lesson
-- titles, lengths and checkpoint prompts are placeholders until the ministry supplies the
-- real course content (then edit here or, later, in the admin). Final-check questions use
-- only facts already on the site. Classes are free (price 0) until the ministry sets fees.

insert into public.courses (slug, title, summary, meaning, badge, outcomes, price_kobo, sort_order, status) values
  ('halak', 'Halak', 'The foundations of walking with God: salvation, the Word, prayer and fellowship with the Holy Spirit.', 'Hebrew for “to walk”', 'Start here',
   array['Understand what it means to be saved and made new', 'Build a daily habit of reading the Word', 'Grow in a life of prayer', 'Know and walk with the Holy Spirit']::text[], 0, 1, 'published'),
  ('chayil', 'Chayil', 'Standing strong in identity and authority in Christ, and engaging in prayer as a warrior.', 'Hebrew for “strength, valour”', null,
   array['Stand in your identity in Christ', 'Understand the authority you carry as a believer', 'Engage in prayer as a warrior']::text[], 0, 2, 'published'),
  ('becoming', 'Becoming', 'Identity and purpose for young people, alongside the Who I Am Becoming journals.', 'For pre-teens and teenagers', 'Pre-teens and teens',
   array['Know who God made you to be', 'Discover purpose for your life', 'Build a daily habit with your journal']::text[], 0, 3, 'published'),
  ('whispers', 'Whispers', 'Learning to hear God and journal what He says, alongside Whispers: The Journal.', 'Hearing His voice', null,
   array['Learn to recognise God’s voice', 'Journal what He says', 'Grow in conversation with Him']::text[], 0, 4, 'published');

insert into public.course_modules (course_id, title, summary, position)
select c.id, m.title, m.summary, m.position from public.courses c join (values
  ('halak', 'Salvation', 'What it means to belong to God, and the new life that begins there.', 1),
  ('halak', 'The Word', 'Reading the Bible daily, and letting it move from hearing to doing.', 2),
  ('halak', 'Prayer', 'Learning to talk with God, and to listen.', 3),
  ('halak', 'Fellowship with the Holy Spirit', 'An interactive, loving relationship with the Holy Spirit.', 4),
  ('chayil', 'Identity in Christ', 'Who God says you are.', 1),
  ('chayil', 'Authority in Christ', 'The authority given to every believer, and how to walk in it.', 2),
  ('chayil', 'Prayer as a warrior', 'Strength and valour in prayer.', 3),
  ('becoming', 'Who I am', 'Identity for young people, in God’s words.', 1),
  ('becoming', 'Living with purpose', 'What your life is for, one day at a time.', 2),
  ('whispers', 'Hearing His voice', 'How God speaks, and how to listen.', 1),
  ('whispers', 'Journaling what He says', 'Writing down what you hear, and living it out.', 2)
) as m (course, title, summary, position) on m.course = c.slug;

insert into public.lessons (module_id, slug, title, kind, duration_seconds, is_preview, prompt, position)
select m.id, l.slug, l.title, l.kind::public.lesson_kind, l.minutes * 60, l.preview, l.prompt, l.position
  from public.course_modules m join public.courses c on c.id = m.course_id
  join (values
    ('halak', 1, 'welcome', 'Welcome to Halak', 'video', 6, true, null, 1),
    ('halak', 1, 'new-life', 'New life in Christ', 'video', 14, false, null, 2),
    ('halak', 1, 'salvation-checkpoint', 'Checkpoint: Salvation', 'checkpoint', 10, false, 'Write a few sentences about how you came to know Christ, or what you are still asking Him.', 3),
    ('halak', 2, 'reading-daily', 'Reading the Bible daily', 'video', 12, false, null, 1),
    ('halak', 2, 'reading-plan', 'Study guide: a reading plan', 'pdf', 5, false, null, 2),
    ('halak', 2, 'word-checkpoint', 'Checkpoint: The Word', 'checkpoint', 10, false, 'Share a passage you read this week and one thing you will do because of it.', 3),
    ('halak', 3, 'learning-to-pray', 'Learning to pray', 'video', 15, false, null, 1),
    ('halak', 3, 'morning-prayer', 'A guided morning prayer', 'audio', 8, false, null, 2),
    ('halak', 3, 'prayer-checkpoint', 'Checkpoint: Prayer', 'checkpoint', 10, false, 'Describe your prayer time this week: when, where, and what you noticed.', 3),
    ('halak', 4, 'knowing-the-spirit', 'Knowing the Holy Spirit', 'video', 16, false, null, 1),
    ('halak', 4, 'walking-it-out', 'Walking it out', 'text', 6, false, null, 2),
    ('halak', 4, 'spirit-checkpoint', 'Checkpoint: Fellowship with the Holy Spirit', 'checkpoint', 10, false, 'How have you sensed the Holy Spirit’s leading recently?', 3),
    ('halak', 4, 'final-check', 'Final check', 'quiz', 5, false, null, 4),
    ('chayil', 1, 'welcome', 'Welcome to Chayil', 'video', 6, true, null, 1),
    ('chayil', 1, 'who-you-are', 'Who God says you are', 'video', 14, false, null, 2),
    ('chayil', 1, 'identity-declarations', 'Identity declarations', 'text', 5, false, null, 3),
    ('chayil', 1, 'identity-checkpoint', 'Checkpoint: Identity in Christ', 'checkpoint', 10, false, 'Which truth about your identity in Christ do you find hardest to believe, and why?', 4),
    ('chayil', 2, 'authority', 'Authority in Christ', 'video', 16, false, null, 1),
    ('chayil', 2, 'authority-guide', 'Study guide: authority in Scripture', 'pdf', 5, false, null, 2),
    ('chayil', 2, 'authority-checkpoint', 'Checkpoint: Authority in Christ', 'checkpoint', 10, false, 'Where in your life do you need to stand in the authority you have in Christ?', 3),
    ('chayil', 3, 'warrior-prayer', 'Praying as a warrior', 'video', 15, false, null, 1),
    ('chayil', 3, 'prayer-session', 'A guided prayer session', 'audio', 10, false, null, 2),
    ('chayil', 3, 'warrior-checkpoint', 'Checkpoint: Prayer as a warrior', 'checkpoint', 10, false, 'Write a short prayer for someone or something you are standing in faith for.', 3),
    ('chayil', 3, 'final-check', 'Final check', 'quiz', 5, false, null, 4),
    ('becoming', 1, 'welcome', 'Welcome to Becoming', 'video', 5, true, null, 1),
    ('becoming', 1, 'made-on-purpose', 'Made on purpose', 'video', 10, false, null, 2),
    ('becoming', 1, 'journal-start', 'Starting your journal', 'text', 5, false, null, 3),
    ('becoming', 1, 'who-checkpoint', 'Checkpoint: Who I am', 'checkpoint', 10, false, 'Write three things God says about you that you want to remember.', 4),
    ('becoming', 2, 'purpose', 'Living with purpose', 'video', 12, false, null, 1),
    ('becoming', 2, 'journal-pages', 'Journal pages', 'pdf', 5, false, null, 2),
    ('becoming', 2, 'purpose-checkpoint', 'Checkpoint: Living with purpose', 'checkpoint', 10, false, 'What is one small thing you can do this week that reflects who God made you to be?', 3),
    ('becoming', 2, 'final-check', 'Final check', 'quiz', 5, false, null, 4),
    ('whispers', 1, 'welcome', 'Welcome to Whispers', 'video', 6, true, null, 1),
    ('whispers', 1, 'how-god-speaks', 'How God speaks', 'video', 14, false, null, 2),
    ('whispers', 1, 'quiet-listening', 'A time of quiet listening', 'audio', 10, false, null, 3),
    ('whispers', 1, 'hearing-checkpoint', 'Checkpoint: Hearing His voice', 'checkpoint', 10, false, 'Describe a moment when you sensed God speaking to you.', 4),
    ('whispers', 2, 'journaling', 'Journaling what He says', 'video', 12, false, null, 1),
    ('whispers', 2, 'journal-guide', 'Study guide: journaling', 'pdf', 5, false, null, 2),
    ('whispers', 2, 'journal-checkpoint', 'Checkpoint: Journaling what He says', 'checkpoint', 10, false, 'Share one entry from your journal this week, or what you are listening for.', 3),
    ('whispers', 2, 'final-check', 'Final check', 'quiz', 5, false, null, 4)
  ) as l (course, module_position, slug, title, kind, minutes, preview, prompt, position)
    on l.course = c.slug and l.module_position = m.position;

insert into public.course_quiz_questions (course_id, position, question, options, answer_index, explanation)
select c.id, x.position, x.question, x.options, x.answer, x.explanation from public.courses c join (values
  ('halak', 1, 'What does “Halak” mean?', array['To walk', 'Strength and valour', 'Hearing His voice']::text[], 0, 'Halak is Hebrew for “to walk”: the class lays the foundations of walking with God.'),
  ('halak', 2, 'Which class should someone new to the school start with?', array['Chayil', 'Halak', 'Whispers']::text[], 1, 'New students begin with Halak, then follow the path as the Spirit leads.'),
  ('halak', 3, 'What does “Beth-El” mean?', array['House of God', 'To walk', 'Strength and valour']::text[], 0, 'Beth-El means “house of God”, the place where Jacob saw heaven open (Genesis 28:19).'),
  ('chayil', 1, 'What does “Chayil” mean?', array['To walk', 'Strength and valour', 'House of God']::text[], 1, 'Chayil is Hebrew for “strength, valour”.'),
  ('chayil', 2, 'What does Chayil help you stand strong in?', array['Identity and authority in Christ', 'Church history', 'Public speaking']::text[], 0, 'Chayil is about standing strong in identity and authority in Christ, and engaging in prayer as a warrior.'),
  ('chayil', 3, 'What does “Beth-El” mean?', array['House of God', 'To walk', 'Strength and valour']::text[], 0, 'Beth-El means “house of God”, the place where Jacob saw heaven open (Genesis 28:19).'),
  ('becoming', 1, 'Who is the Becoming class for?', array['Pre-teens and teenagers', 'Church leaders', 'New parents']::text[], 0, 'Becoming teaches identity and purpose for pre-teens and teenagers.'),
  ('becoming', 2, 'Which journals go alongside Becoming?', array['Whispers: The Journal', 'Who I Am Becoming', 'Burn']::text[], 1, 'Becoming goes alongside the Who I Am Becoming journals, for girls and for guys.'),
  ('becoming', 3, 'What does “Beth-El” mean?', array['House of God', 'To walk', 'Strength and valour']::text[], 0, 'Beth-El means “house of God”, the place where Jacob saw heaven open (Genesis 28:19).'),
  ('whispers', 1, 'What is Whispers about?', array['Hearing God and journaling what He says', 'Leading worship', 'Bible languages']::text[], 0, 'Whispers is about learning to hear God and journal what He says.'),
  ('whispers', 2, 'Which journal goes alongside Whispers?', array['Burn', 'Whispers: The Journal', 'Who I Am Becoming']::text[], 1, 'The class goes alongside Whispers: The Journal.'),
  ('whispers', 3, 'What does “Beth-El” mean?', array['House of God', 'To walk', 'Strength and valour']::text[], 0, 'Beth-El means “house of God”, the place where Jacob saw heaven open (Genesis 28:19).')
) as x (course, position, question, options, answer, explanation) on x.course = c.slug;
