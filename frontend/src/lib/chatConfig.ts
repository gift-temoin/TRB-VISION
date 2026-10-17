// Set VITE_WHATSAPP_ENABLED=true only when a real WhatsApp Business integration
// is configured on the backend. The in-app portal never implies WhatsApp delivery
// unless this flag is enabled.
export const isWhatsAppConfigured =
  import.meta.env.VITE_WHATSAPP_ENABLED === "true";
