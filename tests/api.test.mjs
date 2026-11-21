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
  p,
  get: async () => snap(p),
  delete: async () => { store.delete(p); },
  create: async d => { if (store.has(p)) { const e = new Error('already exists'); e.code = 6; throw e; } store.set(p, d); },
  set: async (d, o) => { store.set(p, o && o.merge ? {...(store.get(p) || {}), ...d} : d); },
  update: async (...args) => { const cur = structuredClone(store.get(p) || {}); if (args.length === 1 && !(args[0] instanceof FieldPath)) { store.set(p, Object.assign(cur, args[0])); return; } for (let i = 0; i < args.length; i += 2) { const fp = args[i].s; let o = cur; for (let j = 0; j < fp.length - 1; j++) o = o[fp[j]] = o[fp[j]] || {}; if (args[i + 1] && args[i + 1].__del) delete o[fp.at(-1)]; else o[fp.at(-1)] = args[i + 1]; } store.set(p, cur); }
};}
function col(path, filters = [], group = false){ return {
  where: (f, op, v) => col(path, filters.concat([[f, op, v]]), group),
  limit: () => col(path, filters, group),
  get: async () => { const docs = [...store.keys()].filter(k => group ? k.split('/').at(-2) === path : k.slice(0, k.lastIndexOf('/')) === path).filter(k => filters.every(([f, op, v]) => { const val = f.split('.').reduce((o, x) => o && o[x], store.get(k)); return op === '>' ? typeof val === 'number' && val > v : op === '==' ? val === v : op === '>=' ? val >= v : op === '<' ? val < v : false; })).map(k => ({id:k.split('/').pop(), data:() => store.get(k)})); return {docs, empty:!docs.length, forEach:f => docs.forEach(f)}; }
};}
const db = {doc:docRef, collection:p => col(p), collectionGroup:n => col(n, [], true), recursiveDelete: async r => { for (const k of [...store.keys()]) if (k === r.p || k.startsWith(r.p + '/')) store.delete(k); }, runTransaction: async fn => fn({get:r => r.get(), set:(r, d, o) => r.set(d, o)})};
const users = {'tok-owner':{uid:'owner', email:'owner@example.com', email_verified:true}, 'tok-amara':{uid:'amara', email:'amara@example.com', email_verified:true}, 'tok-luis':{uid:'luis', email:'luis@example.com', email_verified:true},
  'tok-tina':{uid:'tina', email:'tina@example.com', email_verified:true}, 'tok-carl':{uid:'carl', email:'carl@example.com', email_verified:true}};

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
const {default: access} = await import('../api/access.js');
const call = async (h, token, body, method = 'POST', headers = {}) => { let status = 200, json; const res = {status(s){ status = s; return res; }, json(j){ json = j; return res; }}; await h({method, headers:Object.assign(token ? {authorization:'Bearer ' + token} : {}, headers), body}, res); return {status, json}; };

const now = Date.now();
store.set('classes/c1', {name:'Français A1', code:'ABC', teacherId:'owner'});
store.set('members/amara', {classIds:{c1:now}}); store.set('members/luis', {classIds:{c1:false}});
store.set('profiles/amara', {first:'Amara', last:'Okafor', email:'amara@example.com', notify:{email:{message:false}}});
store.set('pushTokens/amara', {tokens:{'tokA':{}, 'tokDead':{}}});
store.set('classes/c1/announcements/an1', {classId:'c1', text:'Bienvenue !'});
store.set('classes/c1/assignments/a1', {classId:'c1', title:'Quiz 1', kind:'quiz', points:5, due:'2026-11-20'});

test('rejects unsigned and student-sent teacher events', async () => {
  assert.equal((await call(notify, null, {type:'announcement', id:'an1', classId:'c1'})).status, 401);
  assert.equal((await call(notify, 'tok-amara', {type:'announcement', id:'an1', classId:'c1'})).status, 403);
  assert.equal((await call(notify, 'tok-owner', {type:'announcement', id:'../x'})).status, 400);
});
test('announcement reaches enrolled students only, once', async () => {
  sentEmails.length = 0; sentPush.length = 0;
  const r = await call(notify, 'tok-owner', {type:'announcement', id:'an1', classId:'c1'});
  assert.equal(r.status, 200);
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['amara@example.com']);   // luis left the class
  assert.equal(sentPush.length, 1); assert.equal(sentPush[0].webpush.fcmOptions.link, 'https://parlei.ca/#home');
  assert.deepEqual(Object.keys(store.get('pushTokens/amara').tokens), ['tokA']);   // dead device removed
  const again = await call(notify, 'tok-owner', {type:'announcement', id:'an1', classId:'c1'});
  assert.equal(again.json.sent, 0);
});
test('messages reach only the people listed in the conversation', async () => {
  store.set('convos/amara__owner', {student:'amara', participants:['amara', 'owner'], msgs:{m1:{from:'owner', text:'Salut Amara', at:Date.now()}}});
  sentEmails.length = 0; sentPush.length = 0;
  await call(notify, 'tok-owner', {type:'message', cid:'amara__owner'});
  assert.equal(sentEmails.length, 0); assert.equal(sentPush.length, 1);   // Amara turned message emails off; push still on
  store.set('convos/amara__owner', {student:'amara', participants:['amara', 'owner'], msgs:{m1:{from:'owner', text:'Salut', at:Date.now() - 1000}, m2:{from:'amara', text:'Merci !', at:Date.now()}}});
  sentEmails.length = 0;
  await call(notify, 'tok-amara', {type:'message', cid:'amara__owner'});
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['owner@example.com']);
  assert.match(sentEmails[0].subject, /Message from Amara Okafor/);
  // someone not in the conversation can't trigger or receive anything from it
  assert.equal((await call(notify, 'tok-luis', {type:'message', cid:'amara__owner'})).status, 403);
  // a three-way conversation tells the other two only
  users['tok-ted'] = {uid:'ted', email:'ted@example.com', email_verified:true};
  store.set('convos/amara__owner_ted', {student:'amara', participants:['amara', 'owner', 'ted'], msgs:{m1:{from:'ted', text:'Bonjour à tous', at:Date.now()}}});
  sentEmails.length = 0; sentPush.length = 0;
  await call(notify, 'tok-ted', {type:'message', cid:'amara__owner_ted'});
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['owner@example.com']);   // Amara gets push (emails off), the owner gets email
  assert.match(sentEmails[0].subject, /wrote about Amara Okafor/);
  assert.equal(sentPush.length, 1);
});
test('grade and submission are checked against the database', async () => {
  sentEmails.length = 0;
  assert.equal((await call(notify, 'tok-owner', {type:'grade', uid:'amara', aid:'a1', classId:'c1'})).status, 400);
  store.set('grades/amara__c1', {student:'amara', classId:'c1', items:{a1:{grade:4, feedback:'Bien', gradedAt:1}}});
  await call(notify, 'tok-owner', {type:'grade', uid:'amara', aid:'a1', classId:'c1'});
  assert.match(sentEmails[0].subject, /Graded: Quiz 1/); assert.match(sentEmails[0].text, /4 \/ 5/);
  sentEmails.length = 0;
  await call(notify, 'tok-amara', {type:'submission', aid:'a1', classId:'c1'}); assert.equal(sentEmails.length, 0);   // nothing handed in yet
  store.set('subs/amara__c1', {student:'amara', classId:'c1', items:{a1:{answers:[1], right:4, total:5, submittedAt:Date.now()}}});
  await call(notify, 'tok-amara', {type:'submission', aid:'a1', classId:'c1'});
  assert.match(sentEmails[0].subject, /Amara Okafor handed in Quiz 1/);
});
test('daily reminders: due tomorrow and sessions', async () => {
  const tz = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Toronto', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(Date.now() + 864e5));
  store.set('classes/c1/assignments/a2', {classId:'c1', title:'Write about yourself', due:tz});
  store.set('classes/c1/events/e1', {classId:'c1', kind:'class', title:'Monday class', start:new Date(Date.now() + 3 * 36e5).toISOString(), mins:90});
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
test('instructor requests go to the owner; only the owner can announce approval', async () => {
  store.set('instructorRequests/luis', {name:'Luis Herrera', email:'luis@example.com', teaches:'Spanish', status:'pending', at:Date.now()});
  sentEmails.length = 0;
  await call(notify, 'tok-luis', {type:'instructorRequest'});
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['owner@example.com']);
  assert.match(sentEmails[0].subject, /Instructor request: Luis Herrera/);
  assert.equal((await call(notify, 'tok-amara', {type:'instructorRequest'})).json.sent, 0);   // no request on file
  assert.equal((await call(notify, 'tok-luis', {type:'instructorApproved', uid:'luis'})).status, 403);
  store.set('teachers/luis', {name:'Luis Herrera', approvedAt:Date.now()});
  sentEmails.length = 0;
  await call(notify, 'tok-owner', {type:'instructorApproved', uid:'luis'});
  assert.match(sentEmails[0].subject, /instructor account is ready/);
});

test('per-class access: co-teachers, removal, and who gets told', async () => {
  // Tina and Carl are approved instructors; Tina owns class c2.
  store.set('teachers/tina', {name:'Tina T', email:'tina@example.com'}); store.set('teachers/carl', {name:'Carl C', email:'carl@example.com'});
  store.set('classes/c2', {name:'Português A2', teacherId:'tina', code:'PT2X'});
  store.set('profiles/mei', {first:'Mei', last:'Chen', email:'mei@example.com'});
  users['tok-mei'] = {uid:'mei', email:'mei@example.com', email_verified:true};

  // Joining needs the right code; it gives the class's teacher access and tells only her.
  assert.equal((await call(access, 'tok-mei', {action:'join', code:'NOPE1'})).json.code, 'bad_code');
  assert.equal(store.get('members/mei'), undefined);
  sentEmails.length = 0;
  const joined = await call(access, 'tok-mei', {action:'join', code:'pt2x'});
  assert.equal(joined.json.cid, 'c2');
  assert.equal(typeof store.get('members/mei').classIds.c2, 'number');
  assert.deepEqual(store.get('members/mei').teacherIds, ['tina']);
  assert.deepEqual(sentEmails.map(e => e.to[0]), ['tina@example.com']);
  sentEmails.length = 0;
  await call(access, 'tok-mei', {action:'join', code:'PT2X'});   // joining again doesn't notify twice
  assert.equal(sentEmails.length, 0);

  // Carl can't act on Tina's class or her student.
  store.set('classes/c2/announcements/an2', {classId:'c2', text:'Olá'});
  assert.equal((await call(notify, 'tok-carl', {type:'announcement', id:'an2', classId:'c2'})).status, 403);
  assert.equal((await call(access, 'tok-carl', {action:'addCoTeacher', cid:'c2', email:'carl@example.com'})).status, 403);
  assert.equal((await call(access, 'tok-carl', {action:'removeStudent', cid:'c2', uid:'mei'})).status, 403);
  store.set('grades/mei__c2', {items:{a9:{grade:1, gradedAt:2}}}); store.set('classes/c2/assignments/a9', {classId:'c2', title:'T', points:5});
  assert.equal((await call(notify, 'tok-carl', {type:'grade', uid:'mei', aid:'a9', classId:'c2'})).status, 403);

  // Join codes: instructors can check one is free; students can't.
  assert.equal((await call(access, 'tok-tina', {action:'codeFree', code:'pt2x'})).json.free, false);
  assert.equal((await call(access, 'tok-tina', {action:'codeFree', code:'PT2X', cid:'c2'})).json.free, true);   // its own code
  assert.equal((await call(access, 'tok-tina', {action:'codeFree', code:'NEWONE'})).json.free, true);
  assert.equal((await call(access, 'tok-mei', {action:'codeFree', code:'NEWONE'})).status, 403);
  assert.equal((await call(access, 'tok-tina', {action:'codeFree', code:'no!'})).json.code, 'bad_code');

  // Only approved instructors can be added; Tina adds Carl and he gets access and an email.
  assert.equal((await call(access, 'tok-tina', {action:'addCoTeacher', cid:'c2', email:'amara@example.com'})).json.code, 'not_instructor');
  sentEmails.length = 0;
  const add = await call(access, 'tok-tina', {action:'addCoTeacher', cid:'c2', email:'Carl@Example.com'});
  assert.equal(add.status, 200);
  assert.ok(store.get('classes/c2').coTeachers.carl);
  assert.equal(store.get('teachers/carl').coClasses.c2, true);   // tells Carl's app to load the class
  assert.deepEqual(store.get('members/mei').teacherIds, ['carl', 'tina']);
  assert.match(sentEmails[0].subject, /co-teacher of Português A2/);
  assert.equal((await call(notify, 'tok-carl', {type:'announcement', id:'an2', classId:'c2'})).status, 200);

  // A co-teacher can't add others, but can leave; removing access updates the student.
  assert.equal((await call(access, 'tok-carl', {action:'addCoTeacher', cid:'c2', email:'owner@example.com'})).status, 403);
  await call(access, 'tok-carl', {action:'removeCoTeacher', cid:'c2', uid:'carl'});
  assert.equal(store.get('classes/c2').coTeachers.carl, undefined);
  assert.equal(store.get('teachers/carl').coClasses.c2, undefined);
  assert.deepEqual(store.get('members/mei').teacherIds, ['tina']);

  // A student can leave on their own.
  store.set('members/mei', {classIds:{c2:Date.now()}, teacherIds:['tina']});
  await call(access, 'tok-mei', {action:'leave', cid:'c2'});
  assert.equal(store.get('members/mei').classIds.c2, false);
  assert.deepEqual(store.get('members/mei').teacherIds, []);
  store.set('members/mei', {classIds:{c2:Date.now()}, teacherIds:['tina']});

  // Removing a student ends access; deleting a class does too.
  await call(access, 'tok-tina', {action:'removeStudent', cid:'c2', uid:'mei'});
  assert.equal(store.get('members/mei').classIds.c2, false);
  assert.deepEqual(store.get('members/mei').teacherIds, []);
  store.set('members/mei', {classIds:{c2:Date.now()}, teacherIds:['tina']});
  assert.equal((await call(access, 'tok-carl', {action:'deleteClass', cid:'c2'})).status, 403);
  await call(access, 'tok-tina', {action:'deleteClass', cid:'c2'});
  assert.equal(store.get('classes/c2'), undefined);
  assert.equal(store.get('classes/c2/announcements/an2'), undefined);   // its content goes with it
  assert.deepEqual(store.get('members/mei').teacherIds, []);
});
test('a student shared between two classes: each teacher only reaches their own class work', async () => {
  store.set('classes/c4', {name:'Español B1', teacherId:'tina'}); store.set('classes/c5', {name:'Italiano A1', teacherId:'carl'});
  store.set('members/zoe', {classIds:{c4:Date.now(), c5:Date.now()}, teacherIds:['carl', 'tina']});
  store.set('classes/c4/assignments/a4', {classId:'c4', title:'Ensayo', points:10}); store.set('classes/c5/assignments/a5', {classId:'c5', title:'Tema', points:10});
  store.set('grades/zoe__c4', {items:{a4:{grade:9, gradedAt:5}}});
  assert.equal((await call(notify, 'tok-carl', {type:'grade', uid:'zoe', aid:'a4', classId:'c4'})).status, 403);   // Carl teaches Zoe, but not Español B1
  assert.equal((await call(notify, 'tok-tina', {type:'grade', uid:'zoe', aid:'a4', classId:'c4'})).status, 200);
});
