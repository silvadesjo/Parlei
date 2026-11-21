// Health check: confirms the server functions run and their settings are present (never shows the values).
export default async function handler(req, res){
  const out = {node:process.version, settings:{}};
  for (const k of ['FIREBASE_SERVICE_ACCOUNT', 'OWNER_EMAIL', 'APP_URL', 'RESEND_API_KEY', 'FROM_EMAIL', 'CRON_SECRET', 'ANTHROPIC_API_KEY']) out.settings[k] = !!(process.env[k] || '').trim();
  try { await import('firebase-admin/app'); out.firebaseAdmin = 'ok'; } catch (e) { out.firebaseAdmin = 'missing'; }
  try { if (out.settings.FIREBASE_SERVICE_ACCOUNT) { const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); out.serviceAccountProject = sa.project_id || null; } } catch (e) { out.serviceAccountProject = 'unreadable'; }
  for (const m of ['firebase-admin/auth', 'firebase-admin/firestore', 'firebase-admin/messaging']) { try { await import(m); out[m] = 'ok'; } catch (e) { out[m] = String(e && e.message || e).slice(0, 200); } }
  try { await import('./_lib/core.js'); out.core = 'ok'; } catch (e) { out.core = String(e && e.message || e).slice(0, 200); }
  res.status(200).json(out);
}
