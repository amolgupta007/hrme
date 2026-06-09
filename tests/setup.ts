// Provide stub env vars required by module-level constructors so vitest
// can import server-action modules without throwing at load time.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? "re_test_stub";
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.stub";
