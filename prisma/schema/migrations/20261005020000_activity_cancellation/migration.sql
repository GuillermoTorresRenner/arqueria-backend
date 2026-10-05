-- Cancelación de actividades, eventos y torneos (columnas opcionales)
ALTER TABLE "activities" ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancellationReason" TEXT;
