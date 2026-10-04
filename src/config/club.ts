/// Invitación al grupo de WhatsApp del club. Solo se entrega a quien completa
/// el registro (POST /members/join) y en el correo de bienvenida; el sitio
/// público ya no la enlaza. Configurable para poder rotar la invitación sin
/// desplegar; el fallback es la invitación vigente.
export const WHATSAPP_GROUP_URL =
  process.env.WHATSAPP_GROUP_URL ||
  'https://chat.whatsapp.com/LkF1rxkIjBqL0qHTwA60au';

/// Zona horaria del club: fechas de los correos, día del pronóstico del tiempo
/// y horas de las actividades se calculan en esta zona, no en la del servidor.
export const CLUB_TIMEZONE = process.env.CLUB_TIMEZONE || 'America/Santiago';

/// País del club (ISO 3166-1): acota la búsqueda de ubicaciones de los lugares
export const CLUB_COUNTRY = process.env.CLUB_COUNTRY || 'CL';
