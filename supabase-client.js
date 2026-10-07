window.Doodhwala = window.Doodhwala || {};
(function(){
  const url = window.DOODHWALA_SUPABASE_URL || "";
  const key = window.DOODHWALA_SUPABASE_PUBLISHABLE_KEY || "";
  const sdk = window.supabase;
  window.Doodhwala.configured = Boolean(url && key && sdk && sdk.createClient);
  window.Doodhwala.supabase = window.Doodhwala.configured ? sdk.createClient(url, key) : null;
})();
