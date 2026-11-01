// Public configuration only. Never add a secret key, service_role, password or JWT.
// Separate Free project for Ilsiyar. The publishable key is public; RLS is mandatory.
window.ILSIYAR_CMS_CONFIG = Object.freeze({
  enabled: true,
  siteId: "ilsiyar-catalog-v1",
  supabaseUrl: "https://dalcgrioqdvfwadmtfiv.supabase.co",
  publishableKey: "sb_publishable_-Tkw7CIsWoQEzFzXnbkzgw_7UU-gtkA",
  bucket: "catalog-private",
});
