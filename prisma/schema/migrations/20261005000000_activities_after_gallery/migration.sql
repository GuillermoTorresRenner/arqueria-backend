-- «Próximas actividades» pasa a ir justo después de la galería del home.
-- Idempotente: si ya está después (o falta alguno de los dos), no cambia nada.
DO $$
DECLARE
  home_id TEXT;
  act_order INTEGER;
  gal_order INTEGER;
BEGIN
  SELECT "id" INTO home_id FROM "sections" WHERE "key" = 'home';
  IF home_id IS NULL THEN RETURN; END IF;

  SELECT MIN("order") INTO act_order FROM "blocks"
    WHERE "sectionId" = home_id AND "type" = 'ACTIVITIES';
  SELECT MIN("order") INTO gal_order FROM "blocks"
    WHERE "sectionId" = home_id AND "type" = 'GALLERY';
  IF act_order IS NULL OR gal_order IS NULL OR act_order > gal_order THEN
    RETURN;
  END IF;

  -- Los bloques entre ambos (galería incluida) suben un puesto
  UPDATE "blocks" SET "order" = "order" - 1
    WHERE "sectionId" = home_id AND "order" > act_order AND "order" <= gal_order;
  UPDATE "blocks" SET "order" = gal_order
    WHERE "sectionId" = home_id AND "type" = 'ACTIVITIES';
END $$;
