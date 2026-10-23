-- Every computer gets a site-wide number, so the names setup gives them
-- ("Computer 12") are unique across accounts instead of each account
-- starting its own "Computer 1". Existing computers are numbered in the
-- order they joined, and setup-generated names are rewritten to match.
ALTER TABLE nodes ADD COLUMN number INT;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM nodes
)
UPDATE nodes SET number = ordered.n FROM ordered WHERE nodes.id = ordered.id;

CREATE SEQUENCE nodes_number_seq OWNED BY nodes.number;
SELECT setval('nodes_number_seq', COALESCE((SELECT max(number) FROM nodes), 0) + 1, false);

ALTER TABLE nodes
  ALTER COLUMN number SET DEFAULT nextval('nodes_number_seq'),
  ALTER COLUMN number SET NOT NULL,
  ADD CONSTRAINT nodes_number_unique UNIQUE (number);

UPDATE nodes SET name = 'Computer ' || number WHERE source = 'helper' AND name ~ '^Computer [0-9]+$';
