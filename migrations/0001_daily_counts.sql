-- The only stored data in the whole product: a daily total per event.
CREATE TABLE daily_counts (
  day   TEXT    NOT NULL CHECK (day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'), -- UTC YYYY-MM-DD
  event TEXT    NOT NULL CHECK (event IN ('scan', 'cloak')),
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, event)
) WITHOUT ROWID;
