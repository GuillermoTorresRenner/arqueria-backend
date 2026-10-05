-- «Próximas actividades» pasa a ir justo debajo de «Sobre nosotros»: se mueve
-- del home al final de la sección «nosotros». Idempotente: si ya está ahí, o
-- falta la sección o el bloque, no cambia nada.
DO $$
DECLARE
  about_id TEXT;
  block_id TEXT;
  block_section TEXT;
  pos INTEGER;
BEGIN
  SELECT "id" INTO about_id FROM "sections" WHERE "key" = 'nosotros';
  SELECT "id", "sectionId" INTO block_id, block_section FROM "blocks"
    WHERE "type" = 'ACTIVITIES' ORDER BY "createdAt" LIMIT 1;
  IF about_id IS NULL OR block_id IS NULL OR block_section = about_id THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX("order"), -1) + 1 INTO pos FROM "blocks" WHERE "sectionId" = about_id;
  UPDATE "blocks" SET "sectionId" = about_id, "order" = pos, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = block_id;
END $$;
