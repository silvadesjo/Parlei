// Shared server code for Parlei's API routes (Vercel serverless functions).
import {initializeApp, getApps, cert} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore, FieldValue, FieldPath} from 'firebase-admin/firestore';
import {getMessaging} from 'firebase-admin/messaging';

export const env = k => (process.env[k] || '').trim();

let ready = null;
export function admin(){
  if (!ready) {
    if (!getApps().length) {
      const raw = env('FIREBASE_SERVICE_ACCOUNT');
      if (!raw) throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT is not set'), {status:500});
      const sa = JSON.parse(raw);
      if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
      initializeApp({credential:cert(sa)});
    }
    ready = {auth:getAuth(), db:getFirestore(), messaging:getMessaging()};
  }
  return ready;
}

export const ownerEmail = () => env('OWNER_EMAIL').toLowerCase();
export const appUrl = () => (env('APP_URL') || 'http://localhost:3000').replace(/\/$/, '');
export const timeZone = () => env('APP_TIMEZONE') || 'America/Toronto';

/** Verifies the Firebase ID token sent by the app. Returns {uid, email, emailVerified}. */
export async function verifyUser(req){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw Object.assign(new Error('Sign in required'), {status:401});
  try {
    const t = await admin().auth.verifyIdToken(token);
    return {uid:t.uid, email:String(t.email || '').toLowerCase(), emailVerified:!!t.email_verified};
  } catch (e) { throw Object.assign(new Error('Sign in required'), {status:401}); }
}

export async function isTeacher(user){
  if (user.email && user.email === ownerEmail() && user.emailVerified) return true;
  return (await admin().db.doc('teachers/' + user.uid).get()).exists;
}

let ownerUid;
export async function teacherUids(){
  const {auth, db} = admin(), ids = new Set();
  if (ownerUid === undefined) { try { ownerUid = ownerEmail() ? (await auth.getUserByEmail(ownerEmail())).uid : null; } catch (e) { ownerUid = null; } }
  if (ownerUid) ids.add(ownerUid);
  (await db.collection('teachers').get()).forEach(d => ids.add(d.id));
  return [...ids];
}

/** Students currently enrolled in a class (members/{uid}.classIds[cid] holds the join time; false means they left). */
export async function studentsOf(cid){
  const snap = await admin().db.collection('members').where(`classIds.${cid}`, '>', 0).get();
  return snap.docs.map(d => d.id);
}

export async function docData(path){ const s = await admin().db.doc(path).get(); return s.exists ? s.data() : null; }

export async function nameOf(uid){
  const p = await docData('profiles/' + uid);
  if (p) { const n = (p.preferred || [p.first, p.last].filter(Boolean).join(' ')).trim(); if (n) return n; }
  try { const u = await admin().auth.getUser(uid); return u.displayName || 'A student'; } catch (e) { return 'A student'; }
}

/** Records an event key once; returns false if it was already handled (so nobody gets the same notification twice). */
export async function firstTime(key){
  const id = String(key).replace(/[^A-Za-z0-9_.~-]/g, '_').slice(0, 400);
  try { await admin().db.doc('notifLog/' + id).create({at:Date.now()}); return true; }
  catch (e) { if (e.code === 6 || /already exists/i.test(e.message || '')) return false; throw e; }
}

const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
export const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

function emailHtml({title, body, link, linkLabel}){
  return `<!doctype html><html><body style="margin:0;background:#EDF0F4;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#14202B">
  <div style="max-width:520px;margin:0 auto;padding:28px 18px">
    <div style="font-size:20px;font-weight:600;margin-bottom:16px;color:#2445C4">Parlei</div>
    <div style="background:#fff;border:1px solid #D8DEE6;border-radius:12px;padding:22px">
      <h1 style="font-size:19px;line-height:1.3;margin:0 0 10px">${escapeHtml(title)}</h1>
      <p style="font-size:15px;line-height:1.55;margin:0 0 18px;white-space:pre-wrap">${escapeHtml(body)}</p>
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#2445C4;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600">${escapeHtml(linkLabel || 'Open Parlei')}</a>
    </div>
    <p style="font-size:12px;color:#5A6777;margin:14px 4px">You're getting this because of your Parlei notification settings. <a href="${escapeHtml(appUrl())}/#account" style="color:#5A6777">Change what you receive</a>.</p>
  </div></body></html>`;
}

async function sendEmail(to, msg){
  const key = env('RESEND_API_KEY'), from = env('FROM_EMAIL');
  if (!key || !from || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{Authorization:'Bearer ' + key, 'Content-Type':'application/json'},
    body:JSON.stringify({from, to:[to], subject:msg.title, html:emailHtml(msg), text:`${msg.body}\n\n${msg.link}`})
  });
  if (!res.ok) console.error('Email failed', res.status, await res.text().catch(() => ''));
  return res.ok;
}

async function sendPush(uid, msg){
  const {db, messaging} = admin();
  const ref = db.doc('pushTokens/' + uid), snap = await ref.get();
  const tokens = Object.keys((snap.exists && snap.data().tokens) || {});
  if (!tokens.length) return 0;
  const out = await messaging.sendEachForMulticast({
    tokens,
    notification:{title:msg.title, body:clip(msg.body, 180)},
    webpush:{fcmOptions:{link:msg.link}, notification:{icon:appUrl() + '/icons/icon-192.png', badge:appUrl() + '/icons/icon-192.png'}}
  });
  const dead = [];   // forget devices that have uninstalled or turned notifications off
  out.responses.forEach((r, i) => { const c = r.error && r.error.code; if (c === 'messaging/registration-token-not-registered' || c === 'messaging/invalid-registration-token') dead.push(new FieldPath('tokens', tokens[i]), FieldValue.delete()); });
  if (dead.length) await ref.update(...dead).catch(() => {});
  return out.successCount;
}

/**
 * Sends one notification to each person, by email and push, as their settings allow.
 * key is the settings key (announcement, assignment, lesson, grade, message, due, session, submission, joined, booking).
 */
export async function deliver(uids, key, msg, opts){
  opts = opts || {};
  let sent = 0;
  for (const uid of [...new Set(uids)].filter(Boolean)) {
    try {
      const p = (await docData('profiles/' + uid)) || {};
      const prefs = p.notify || {};
      const wantEmail = opts.force || !(prefs.email && prefs.email[key] === false);
      const wantPush = opts.force || !(prefs.push && prefs.push[key] === false);
      if (wantEmail) {
        let to = p.email;
        if (!to) { try { to = (await admin().auth.getUser(uid)).email; } catch (e) {} }
        if (await sendEmail(to, msg)) sent++;
      }
      if (wantPush) sent += await sendPush(uid, msg);
    } catch (e) { console.error('Delivery failed for', uid, e); }
  }
  return sent;
}

export function fail(res, e){
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  res.status(status).json({code:e.code || 'error', message:status >= 500 ? 'Something went wrong' : e.message});
}

export function fmtWhen(iso){
  try { return new Date(iso).toLocaleString('en-CA', {timeZone:timeZone(), weekday:'long', month:'long', day:'numeric', hour:'numeric', minute:'2-digit'}); }
  catch (e) { return iso; }
}
