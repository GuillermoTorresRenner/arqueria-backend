-- Bloque «Próximas actividades» en el home, justo después de «Qué hacemos»
-- (CARDS) o al final si no lo hay. Va en una migración aparte: el valor
-- ACTIVITIES del enum no se puede usar en la misma transacción que lo crea.
-- Idempotente: no hace nada si el home no existe o ya tiene el bloque.
DO $$
DECLARE
  home_id TEXT;
  pos INTEGER;
BEGIN
  SELECT "id" INTO home_id FROM "sections" WHERE "key" = 'home';
  IF home_id IS NULL OR EXISTS (
    SELECT 1 FROM "blocks" WHERE "sectionId" = home_id AND "type" = 'ACTIVITIES'
  ) THEN
    RETURN;
  END IF;

  SELECT MIN("order") + 1 INTO pos FROM "blocks"
    WHERE "sectionId" = home_id AND "type" = 'CARDS';
  IF pos IS NULL THEN
    SELECT COALESCE(MAX("order"), -1) + 1 INTO pos FROM "blocks" WHERE "sectionId" = home_id;
  END IF;

  UPDATE "blocks" SET "order" = "order" + 1
    WHERE "sectionId" = home_id AND "order" >= pos;

  INSERT INTO "blocks" ("id", "sectionId", "type", "order", "isActive", "data", "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid()::text, home_id, 'ACTIVITIES', pos, true,
    '{"title":"Próximas actividades","text":"Jornadas de tiro, clases y salidas del club."}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
END $$;
