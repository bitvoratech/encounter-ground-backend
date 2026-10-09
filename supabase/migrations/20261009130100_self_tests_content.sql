-- Content for the two self-tests carried over from encounterground.org.
-- Wording is the ministry's, lightly tidied (stray spaces and full stops).
-- The old Fivefold test repeated Pastor statements (32/33, 34/35, 36/37); the
-- repeats are left out, and scoring by percentage keeps the Pastor result fair.

-- 7 Mountains of Influence Self-Test
insert into public.self_tests (slug, title, summary, intro, scale, legacy_url, position, status) values
  ('seven-mountains-of-influence', '7 Mountains of Influence Self-Test',
   'Discover which area of society God may be calling you to influence.',
   'Read each statement and choose how true it is of you today, not how you wish it were. There are no right or wrong answers. At the end you will see how strongly you lean towards each of the seven mountains: family, faith, education, government, business, arts and media.',
   '["Not true for me", "Slightly true", "Somewhat true", "Mostly true", "Very true"]'::jsonb,
   'https://encounterground.org/influence-self-test/', 1, 'published');

insert into public.self_test_categories (test_id, key, name, description, position)
select t.id, c.key, c.name, c.description, c.position from public.self_tests t,
  (values
    ('family', 'Family', 'A burden for healthy marriages, homes and the next generation.', 1),
    ('faith', 'Faith', 'A burden for the Church, sound doctrine and kingdom expansion.', 2),
    ('education', 'Education', 'A burden to teach, train and shape what the next generation learns.', 3),
    ('government', 'Government', 'A burden for justice, righteous leadership and the laws that shape daily life.', 4),
    ('business', 'Business', 'A burden to build, innovate and steward resources for the Kingdom.', 5),
    ('arts', 'Arts & Entertainment', 'A burden to redeem creativity and culture for worship and truth.', 6),
    ('media', 'Media', 'A burden for truth and hope in what people read, watch and hear.', 7)
  ) as c (key, name, description, position)
where t.slug = 'seven-mountains-of-influence';

insert into public.self_test_questions (test_id, category_id, prompt, position)
select t.id, c.id, q.prompt, q.position from public.self_tests t
  join (values
    (1, 'family', 'I feel called to help heal broken families and relationships.'),
    (2, 'family', 'People come to me for guidance about marriage or parenting.'),
    (3, 'family', 'I enjoy creating safe, nurturing environments for others.'),
    (4, 'family', 'I believe strong families are the foundation of society.'),
    (5, 'family', 'I feel fulfilled when mentoring or counseling younger people.'),
    (6, 'family', 'I’m passionate about raising godly children and future generations.'),
    (7, 'family', 'I often step into a ''parental'' or guiding role, even outside my family.'),
    (8, 'family', 'I’m burdened when I see divorce, abuse, or family breakdown.'),
    (9, 'family', 'I naturally encourage others toward unity and reconciliation.'),
    (10, 'family', 'I dream of seeing households living in God’s love and order.'),
    (11, 'faith', 'I feel deeply burdened for people’s spiritual growth and salvation.'),
    (12, 'faith', 'I’m energized by prayer, worship, and studying the Word.'),
    (13, 'faith', 'I often sense God calling me to teach, preach, or minister.'),
    (14, 'faith', 'People have affirmed a spiritual gift in me.'),
    (15, 'faith', 'I desire to plant churches, lead ministries, or disciple groups.'),
    (16, 'faith', 'I get excited when I see revival, missions, or kingdom expansion.'),
    (17, 'faith', 'I feel protective of sound doctrine and biblical truth.'),
    (18, 'faith', 'I enjoy helping others discover their spiritual gifts.'),
    (19, 'faith', 'I believe influencing the church will shape society.'),
    (20, 'faith', 'I often imagine myself in ministry roles.'),
    (21, 'education', 'I enjoy teaching or explaining things in ways people understand.'),
    (22, 'education', 'People often say I make complicated things simple.'),
    (23, 'education', 'I feel fulfilled when helping someone learn a new skill or truth.'),
    (24, 'education', 'I’m drawn to shaping values taught to the next generation.'),
    (25, 'education', 'I’m burdened when I see children misled by lies.'),
    (26, 'education', 'I’m energized by mentoring, tutoring, or coaching.'),
    (27, 'education', 'I value wisdom and truth as tools to transform lives.'),
    (28, 'education', 'I want to reform education systems to align with godly principles.'),
    (29, 'education', 'I naturally equip and train others.'),
    (30, 'education', 'I often think about influencing the future through teaching.'),
    (31, 'government', 'I feel passionate about justice and fairness in society.'),
    (32, 'government', 'Corruption and dishonesty anger me deeply.'),
    (33, 'government', 'I’m interested in leadership, law, or policymaking.'),
    (34, 'government', 'I often find myself debating social or political issues.'),
    (35, 'government', 'I feel a sense of duty to defend the weak and voiceless.'),
    (36, 'government', 'I believe God wants righteous leaders in positions of power.'),
    (37, 'government', 'I enjoy organizing, leading, or making decisions for groups.'),
    (38, 'business', 'I believe God gives me strategies to influence the marketplace.'),
    (39, 'business', 'I’m drawn to creating sustainable growth and development.'),
    (40, 'business', 'I enjoy solving problems through innovation.'),
    (41, 'business', 'I want to use wealth to fund Kingdom work and bless others.'),
    (42, 'business', 'People recognize leadership or entrepreneurial skills in me.'),
    (43, 'business', 'I feel fulfillment when helping others prosper financially.'),
    (44, 'business', 'I feel called to create jobs or opportunities for others.'),
    (45, 'business', 'I like managing money, resources, or investments.'),
    (46, 'business', 'I’m energized by turning ideas into practical solutions.'),
    (47, 'business', 'I enjoy coming up with ideas for businesses or projects.'),
    (48, 'arts', 'I often picture myself influencing culture through creativity.'),
    (49, 'arts', 'I find joy in innovating and creating new things.'),
    (50, 'arts', 'I’m burdened when I see ungodly culture dominate the arts.'),
    (51, 'arts', 'I want to see art redeemed for worship and truth.'),
    (52, 'arts', 'I’m drawn to shaping what people watch, read, or listen to.'),
    (53, 'arts', 'People affirm my creative or artistic abilities.'),
    (54, 'arts', 'I believe God uses beauty and stories to touch hearts.'),
    (55, 'arts', 'I dream of influencing culture through creative works.'),
    (56, 'arts', 'I’m most alive when I’m expressing myself artistically.'),
    (57, 'arts', 'I love creativity—music, dance, writing, film, or design.'),
    (58, 'media', 'I think about how media impacts people’s thinking.'),
    (59, 'media', 'I feel called to bring clarity, truth, and hope through words.'),
    (60, 'media', 'I believe media can be a powerful tool for the Gospel.'),
    (61, 'media', 'I enjoy analyzing culture and current events.'),
    (62, 'media', 'I want to see godly values represented in communication.'),
    (63, 'media', 'I naturally influence people with my words.'),
    (64, 'media', 'I’m drawn to storytelling and shaping public opinion.'),
    (65, 'media', 'I enjoy writing, speaking, or creating content.'),
    (66, 'media', 'Lies and manipulation in news/social media burden me.'),
    (67, 'media', 'I’m passionate about truth being shared in media.'),
    (68, 'government', 'I imagine myself advocating for truth in public spheres.'),
    (69, 'government', 'I feel called to influence culture at a national or community level.'),
    (70, 'government', 'I think strategically about how laws affect daily life.')
  ) as q (position, category, prompt) on true
  join public.self_test_categories c on c.test_id = t.id and c.key = q.category
where t.slug = 'seven-mountains-of-influence';

-- Fivefold Ministry Calling Self-Test
insert into public.self_tests (slug, title, summary, intro, scale, legacy_url, position, status) values
  ('fivefold-ministry-calling', 'Fivefold Ministry Calling Self-Test',
   'Reflect on where your grace lies among the fivefold ministry gifts of Ephesians 4:11.',
   'Read each statement and choose how true it is of you today, not how you wish it were. There are no right or wrong answers. At the end you will see how strongly you lean towards each of the five gifts: apostle, prophet, evangelist, pastor and teacher.',
   '["Not true for me", "Slightly true", "Somewhat true", "Mostly true", "Very true"]'::jsonb,
   'https://encounterground.org/fivefold-ministry-calling-self%e2%80%91test-workbook/', 2, 'published');

insert into public.self_test_categories (test_id, key, name, description, position)
select t.id, c.key, c.name, c.description, c.position from public.self_tests t,
  (values
    ('apostle', 'Apostle', 'Pioneers and builds: starts new works, lays foundations and releases leaders.', 1),
    ('prophet', 'Prophet', 'Hears and calls back: carries God''s heart for holiness, truth and alignment.', 2),
    ('evangelist', 'Evangelist', 'Gathers: carries a burden for the lost and shares the gospel with ease.', 3),
    ('pastor', 'Pastor', 'Shepherds: cares for, comforts and protects people over the long haul.', 4),
    ('teacher', 'Teacher', 'Explains: loves the Word and makes Scripture clear and practical.', 5)
  ) as c (key, name, description, position)
where t.slug = 'fivefold-ministry-calling';

insert into public.self_test_questions (test_id, category_id, prompt, position)
select t.id, c.id, q.prompt, q.position from public.self_tests t
  join (values
    (1, 'apostle', 'I enjoy pioneering new ministries, churches, or initiatives.'),
    (2, 'apostle', 'I often see the “big picture” and how things should be structured.'),
    (3, 'apostle', 'I naturally think about long-term growth and strategy.'),
    (4, 'apostle', 'I feel energized starting projects in new or difficult places.'),
    (5, 'apostle', 'I like to build foundations that others can build upon.'),
    (6, 'apostle', 'I often identify leaders and help release them into ministry.'),
    (7, 'apostle', 'I’m willing to face challenges and opposition for the sake of God’s mission.'),
    (8, 'apostle', 'I value order, systems, and organization in ministry.'),
    (9, 'apostle', 'I feel drawn to strengthen and connect multiple ministries together.'),
    (10, 'apostle', 'Others recognize me as someone who builds, organizes, and multiplies.'),
    (11, 'prophet', 'I carry a burden for God’s holiness and truth.'),
    (12, 'prophet', 'I often sense when something is spiritually “off” or compromised.'),
    (13, 'prophet', 'I am stirred to pray and intercede for people and nations.'),
    (14, 'prophet', 'I sometimes receive impressions, scriptures, or visions for others.'),
    (15, 'prophet', 'I long to see God’s people live with purity and devotion.'),
    (16, 'prophet', 'I am bold in speaking truth, even if it is uncomfortable.'),
    (17, 'prophet', 'I often call people back to obedience and alignment with God.'),
    (18, 'prophet', 'Worship and God’s presence stir me deeply.'),
    (19, 'prophet', 'Others often confirm that my words speak directly to their situation.'),
    (20, 'prophet', 'I feel protective of God’s flock against deception or sin.'),
    (21, 'evangelist', 'I feel a strong burden for people who don’t know Jesus.'),
    (22, 'evangelist', 'I naturally share the gospel in everyday conversations.'),
    (23, 'evangelist', 'I am energized by outreach and missions.'),
    (24, 'evangelist', 'I love telling stories of God’s goodness and power.'),
    (25, 'evangelist', 'I feel joy when people respond to Christ.'),
    (26, 'evangelist', 'I look for opportunities to meet new people and build bridges.'),
    (27, 'evangelist', 'I often invite others to church, events, or Christian community.'),
    (28, 'evangelist', 'I can explain salvation clearly and simply.'),
    (29, 'evangelist', 'I encourage others to share their faith boldly.'),
    (30, 'evangelist', 'People often respond when I invite them to follow Jesus.'),
    (31, 'pastor', 'I care deeply for the well-being of others.'),
    (32, 'pastor', 'I naturally listen to people and offer them comfort.'),
    (33, 'pastor', 'I often step in to reconcile conflicts or bring peace.'),
    (34, 'pastor', 'People tell me they feel safe and cared for around me.'),
    (35, 'pastor', 'I am drawn to mentoring, counseling, or shepherding roles.'),
    (36, 'pastor', 'I often sacrifice my own comfort to care for others.'),
    (37, 'pastor', 'Others affirm me as a source of encouragement and support.'),
    (38, 'teacher', 'I love studying and meditating on God’s Word.'),
    (39, 'teacher', 'I can explain difficult truths in ways people understand.'),
    (40, 'teacher', 'I feel responsible for guarding sound doctrine.'),
    (41, 'teacher', 'I enjoy helping others grow in knowledge of Scripture.'),
    (42, 'teacher', 'I often prepare lessons, devotionals, or teachings.'),
    (43, 'teacher', 'I naturally compare teachings to what the Bible says.'),
    (44, 'teacher', 'I am patient when explaining ideas multiple times.'),
    (45, 'teacher', 'People say they understand things better after I teach.'),
    (46, 'teacher', 'I feel excited when others “catch” biblical truths.'),
    (47, 'teacher', 'Others affirm my ability to make Scripture practical and clear.')
  ) as q (position, category, prompt) on true
  join public.self_test_categories c on c.test_id = t.id and c.key = q.category
where t.slug = 'fivefold-ministry-calling';
