-- The first version of next_demand_sequence named its argument scope_key, which
-- Postgres treats as the same name as the counter column. Replace it so a
-- demand note number can be issued.

CREATE OR REPLACE FUNCTION next_demand_sequence(scope_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seq INTEGER;
  chosen_scope TEXT;
BEGIN
  chosen_scope := scope_key;
  INSERT INTO demand_note_counters (scope_key, last_seq)
  VALUES (chosen_scope, 1)
  ON CONFLICT (scope_key) DO UPDATE
    SET last_seq = demand_note_counters.last_seq + 1
  RETURNING last_seq INTO seq;
  RETURN seq;
END;
$$;

REVOKE ALL ON FUNCTION next_demand_sequence(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION next_demand_sequence(TEXT) TO authenticated, service_role;
