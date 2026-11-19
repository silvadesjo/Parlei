// Runs the real API handlers against an in-memory stand-in for Firebase Admin, with email/push captured.
import {test, mock} from 'node:test';
import assert from 'node:assert/strict';

const store = new Map(); // path -> data
const sentEmails = [], sentPush = [];
const get = p => store.get(p);
class FieldPath { constructor(...s){ this.s = s; } }
const FieldValue = { delete: () => ({__del:true}), increment: n => ({__inc:n}) };
function snap(p){ const d = store.get(p); return {exists:!!d, id:p.split('/').pop(), data:() => d}; }
function docRef(p){ return {
  get: async () => snap(p),
  create: async d => { if (store.has(p)) { const e = new Error('already exists'); e.code = 6; throw e; } store.set(p, d); },
  set: async (d, o) => { store.set(p, o && o.merge ? {...(store.get(p) || {}), ...d} : d); },
  update: async (...args) => { const cur = structuredClone(store.get(p) || {}); for (let i = 0; i < args.length; i += 2) { const fp = args[i].s; let o = cur; for (let j = 0; j < fp.length - 1; j++) o = o[fp[j]] = o[fp[j]] || {}; if (args[i + 1] && args[i + 1].__del) delete o[fp.at(-1)]; else o[fp.at(-1)] = args[i + 1]; } store.set(p, cur); }
};}
function col(path, filters = []){ return {
  where: (f, op, v) => col(path, filters.concat([[f, op, v]])),
  get: async () => { const docs = [...store.keys()].filter(k => k.slice(0, k.lastIndexOf('/')) === path).filter(k => filters.every(([f, op, v]) => { const val = f.split('.').reduce((o, x) => o && o[x], store.get(k)); return op === '>' ? typeof val === 'number' && val > v : op === '==' ? val === v : op === '>=' ? val >= v : op === '<' ? val < v : false; })).map(k => ({id:k.split('/').pop(), data:() => store.get(k)})); return {docs, forEach:f => docs.forEach(f)}; }
};}
const db = {doc:docRef, collection:p => col(p), runTransaction: async fn => fn({get:r => r.get(), set:(r, d, o) => r.set(d, o)})};
const users = {'tok-owner':{uid:'owner', email:'owner@example.com', email_verified:true}, 'tok-amara':{uid:'amara', email:'amara@example.com', email_verified:true}, 'tok-luis':{uid:'luis', email:'luis@example.com', email_verified:true}};

mock.module('firebase-admin/app', {namedExports:{initializeApp(){}, getApps:() => [1], cert:x => x}});
mock.module('firebase-admin/auth', {namedExports:{getAuth:() => ({
  verifyIdToken: async t => { if (!users[t]) throw new Error('bad'); return users[t]; },
  getUserByEmail: async e => ({uid:Object.values(users).find(u => u.email === e).uid}),
  getUser: async uid => ({email:Object.values(users).find(u => u.uid === uid).email, displayName:''})
})}});
mock.module('firebase-admin/firestore', {namedExports:{getFirestore:() => db, FieldValue, FieldPath}});
mock.module('firebase-admin/messaging', {namedExports:{getMessaging:() => ({sendEachForMulticast: async m => { sentPush.push(m); return {successCount:m.tokens.length - 1, responses:m.tokens.map((t, i) => i === m.tokens.length - 1 && m.tokens.length > 1 ? {error:{code:'messaging/registration-token-not-registered'}} : {})}; }})}});
globalThis.fetch = async (url, opts) => { if (String(url).includes('resend')) { sentEmails.push(JSON.parse(opts.body)); return {ok:true, json:async () => ({})}; } if (String(url).includes('anthropic')) return {ok:true, json:async () => ({content:[{type:'text', text:'{"found":true,"term":"la gare","meaning":"train station","pos":"noun","note":"feminine","example":"Je vais à la gare.","exampleEn":"I am going to the station."}'}]})}; throw new Error('unexpected fetch ' + url); };
Object.assign(process.env, {OWNER_EMAIL:'owner@example.com', RESEND_API_KEY:'re_x', FROM_EMAIL:'Parlei <hi@parlei.ca>', APP_URL:'https://parlei.ca', FIREBASE_SERVICE_ACCOUNT:'{}', CRON_SECRET:'cs', ANTHROPIC_API_KEY:'sk'});

const {default: notify} = await import('../api/notify.js');
const {default: cron} = await import('../api/cron-daily.js');
const {default: lookup} = await import('../api/lookup.js');
const call = async (h, token, body, method = 'POST', headers = {}) => { let status = 200, json; const res = {status(s){ status = s; return res; }, json(j){ json = j; return res; }}; await h({method, headers:Object.assign(token ? {authorization:'Bearer ' + token} : {}, headers), body}, res); return {status, json}; };

const now = Date.now();
store.set('classes/c1', {name:'Français A1', code:'ABC'});
store.set('members/amara', {classIds:{c1:now}}); store.set('members/luis', {classIds:{c1:false}});
store.set('profiles/amara', {first:'Amara', last:'Okafor', email:'amara@example.com', notify:{email:{message:false}}});
store.set('pushTokens/amara', {tokens:{'tokA':{}, 'tokDead':{}}});
store.set('announcements/an1', {classId:'c1', text:'Bienvenue !'});
store.set('assignments/a1', {classId:'c1', title:'Quiz 1', kind:'quiz', points:5, due:'2026-11-20'});

test('rejects unsigned and student-sent teacher events', async () => {
  assert.equal((await call(notify, null, {type:'announcement', id:'an1'})).status, 401);
  assert.equal((await call(notify, 'tok-amara', {type:'announcement', id:'an1'})).status, 403);
  assert.equal((await call(notify, 'tok-owner', {type:'announcement', id:'../x'})).status, 400);
});
test('announcement reaches enrolled students only, once', async () => {
  sentEmails.length = 0; sentPush.length = 0;
  const r = await call(notify, 'tok-owner', {type:'announcement', id:'an1'});
  assert.equal(r.status, 200);
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['amara@example.com']);   // luis left the class
  assert.equal(sentPush.length, 1); assert.equal(sentPush[0].webpush.fcmOptions.link, 'https://parlei.ca/#home');
  assert.deepEqual(Object.keys(store.get('pushTokens/amara').tokens), ['tokA']);   // dead device removed
  const again = await call(notify, 'tok-owner', {type:'announcement', id:'an1'});
  assert.equal(again.json.sent, 0);
});
test('message prefs: email off, push on; student message goes to teacher', async () => {
  store.set('threads/amara', {msgs:{m1:{from:'owner', text:'Salut Amara', at:Date.now()}}});
  sentEmails.length = 0; sentPush.length = 0;
  await call(notify, 'tok-owner', {type:'message', sid:'amara'});
  assert.equal(sentEmails.length, 0); assert.equal(sentPush.length, 1);
  store.set('threads/amara', {msgs:{m1:{from:'owner', text:'Salut', at:Date.now() - 1000}, m2:{from:'amara', text:'Merci !', at:Date.now()}}});
  sentEmails.length = 0;
  await call(notify, 'tok-amara', {type:'message', sid:'amara'});
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['owner@example.com']);
  assert.match(sentEmails[0].subject, /Message from Amara Okafor/);
  assert.equal((await call(notify, 'tok-luis', {type:'message', sid:'amara'})).status, 403);
});
test('grade and submission are checked against the database', async () => {
  sentEmails.length = 0;
  assert.equal((await call(notify, 'tok-owner', {type:'grade', uid:'amara', aid:'a1'})).status, 400);
  store.set('grades/amara', {items:{a1:{grade:4, feedback:'Bien', gradedAt:1}}});
  await call(notify, 'tok-owner', {type:'grade', uid:'amara', aid:'a1'});
  assert.match(sentEmails[0].subject, /Graded: Quiz 1/); assert.match(sentEmails[0].text, /4 \/ 5/);
  sentEmails.length = 0;
  await call(notify, 'tok-amara', {type:'submission', aid:'a1'}); assert.equal(sentEmails.length, 0);   // nothing handed in yet
  store.set('subs/amara', {items:{a1:{answers:[1], right:4, total:5, submittedAt:Date.now()}}});
  await call(notify, 'tok-amara', {type:'submission', aid:'a1'});
  assert.match(sentEmails[0].subject, /Amara Okafor handed in Quiz 1/);
});
test('daily reminders: due tomorrow and sessions', async () => {
  const tz = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(Date.now() + 864e5));
  store.set('assignments/a2', {classId:'c1', title:'Write about yourself', due:tz});
  store.set('events/e1', {classId:'c1', kind:'class', title:'Monday class', start:new Date(Date.now() + 3 * 36e5).toISOString(), mins:90});
  assert.equal((await call(cron, null, null, 'GET')).status, 401);
  sentEmails.length = 0;
  const r = await call(cron, null, null, 'GET', {authorization:'Bearer cs'});
  assert.equal(r.status, 200);
  const subjects = sentEmails.map(e => e.to[0] + ' ' + e.subject);
  assert.ok(subjects.includes('amara@example.com Due tomorrow: Write about yourself'), subjects.join('\n'));
  assert.ok(subjects.some(s => s.startsWith('amara@example.com Class reminder: Monday class')));
  assert.ok(subjects.some(s => s.startsWith("owner@example.com You're teaching")));
});
test('look-up endpoint and daily limit', async () => {
  const r = await call(lookup, 'tok-amara', {lang:'fr', langName:'French', term:'gare', meaning:''});
  assert.equal(r.status, 200); assert.equal(r.json.term, 'la gare');
  assert.equal((await call(lookup, null, {lang:'fr', term:'x'})).status, 401);
  assert.equal((await call(lookup, 'tok-amara', {lang:'<script>', term:'x'})).status, 400);
});
