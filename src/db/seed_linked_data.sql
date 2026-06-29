-- Seed events and projects (run after schema). Replace with your real data.
-- Example: one project, a few events linked to it.

INSERT INTO projects (id, name, description) VALUES
  ('5185', 'Project 5185', 'Project linked to events in /'),
  ('default', 'Default Project', 'Default project for unassigned events')
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, project_id, name, details) VALUES
  ('1810', '5185', 'Event 1810', NULL),
  ('1811', '5185', 'Event 1811', NULL),
  ('1812', '5185', 'Event 1812', NULL),
  ('1994', '5185', 'Event 1994', NULL),
  ('1995', '5185', 'Event 1995', NULL),
  ('1996', '5185', 'Event 1996', NULL),
  ('2954', '5185', 'Event 2954', NULL),
  ('2955', '5185', 'Event 2955', NULL),
  ('2956', '5185', 'Event 2956', NULL)
ON CONFLICT (id) DO NOTHING;
