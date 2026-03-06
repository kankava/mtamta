INSERT INTO users (id, display_name, email, bio) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Alice Alpinist', 'alice@example.com', 'Backcountry skier, Mont Blanc summiteer'),
  ('00000000-0000-0000-0000-000000000002', 'Bob Backcountry', 'bob@example.com', 'Powder chaser'),
  ('00000000-0000-0000-0000-000000000003', 'Carol Climber', 'carol@example.com', 'Sport and trad, 6c+')
ON CONFLICT DO NOTHING;

INSERT INTO auth_providers (user_id, provider, provider_uid, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'google', 'google-uid-alice-001', 'alice@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'google', 'google-uid-bob-002',   'bob@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'google', 'google-uid-carol-003', 'carol@example.com')
ON CONFLICT DO NOTHING;
