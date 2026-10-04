/// Invitación al grupo de WhatsApp del club. Solo se entrega a quien completa
/// el registro (POST /members/join) y en el correo de bienvenida; el sitio
/// público ya no la enlaza. Configurable para poder rotar la invitación sin
/// desplegar; el fallback es la invitación vigente.
export const WHATSAPP_GROUP_URL =
  process.env.WHATSAPP_GROUP_URL ||
  'https://chat.whatsapp.com/LkF1rxkIjBqL0qHTwA60au';
