// POST /api/notify — called by the app right after something happens (a grade is saved, a message is sent…).
// The server checks the event against the database before sending anything, so a user can only
// trigger the notifications their own real actions justify, and each event is sent once.
import {admin, verifyUser, studentsOf, docData, nameOf, firstTime, deliver, fail, clip, appUrl, fmtWhen, teachesClass, teachesStudent, teachersOfClass, teachersOfStudent, syncAccess} from './_lib/core.js';

const HOUR = 36e5;
const bad = msg => Object.assign(new Error(msg), {status:400});
const forbidden = () => Object.assign(new Error('Not allowed'), {status:403});
const safeId = v => { const s = String(v || ''); if (!/^[A-Za-z0-9_.~:@+-]{1,120}$/.test(s)) throw bad('Bad id'); return s; };

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({code:'method'});
  try {
    const user = await verifyUser(req);
    const evt = req.body || {};
    const link = page => appUrl() + '/#' + page;
    let sent = 0;

    switch (evt.type) {
      case 'test': {
        sent = await deliver([user.uid], 'test', {title:'Parlei notifications work', body:'This is a test. You will get notifications like this one, as your settings allow.', link:link('account'), linkLabel:'Notification settings'}, {force:true});
        break;
      }
      case 'announcement': case 'assignment': case 'lesson': case 'audio': {
        const id = safeId(evt.id), col = {announcement:'announcements', assignment:'assignments', lesson:'lessons', audio:'audio'}[evt.type];
        const d = await docData(`${col}/${id}`); if (!d) throw bad('Not found');
        if (!(await teachesClass(user, d.classId))) throw forbidden();
        if ((evt.type === 'lesson' || evt.type === 'audio') && d.published === false) break;
        if (!(await firstTime(`${evt.type}-${id}`))) break;
        const cls = (await docData('classes/' + d.classId)) || {};
        const students = await studentsOf(d.classId);
        const msg = {
          announcement:{title:`${cls.name || 'Your class'}: new announcement`, body:clip(d.text, 600), link:link('home')},
          assignment:{title:`New assignment: ${d.title}`, body:`${d.due ? 'Due ' + d.due + '. ' : ''}${clip(d.instructions, 300)}`, link:link('work'), linkLabel:'Open the assignment'},
          lesson:{title:`New lesson: ${d.title}`, body:`${cls.name || 'Your class'} has a new lesson${d.unit ? ' in ' + d.unit : ''}.`, link:link('lessons'), linkLabel:'Read the lesson'},
          audio:{title:`New recording: ${d.title}`, body:`Your teacher shared a new recording for ${cls.name || 'your class'}.`, link:link('media'), linkLabel:'Listen'}
        }[evt.type];
        sent = await deliver(students, evt.type === 'audio' ? 'lesson' : evt.type, msg);
        break;
      }
      case 'grade': {
        const uid = safeId(evt.uid), aid = safeId(evt.aid);
        if (!(await teachesStudent(user, uid))) throw forbidden();
        const g = await docData('grades/' + uid), item = g && g.items && g.items[aid];
        const a = await docData('assignments/' + aid);
        if (!item || !a) throw bad('Not found');
        if (!(await firstTime(`grade-${uid}-${aid}-${item.gradedAt}`))) break;
        sent = await deliver([uid], 'grade', {title:`Graded: ${a.title}`, body:`You got ${item.grade} / ${a.points}.${item.feedback ? '\n\n' + clip(item.feedback, 800) : ''}`, link:link('work'), linkLabel:'See your feedback'});
        break;
      }
      case 'message': {
        const sid = safeId(evt.sid);
        if (sid !== user.uid && !(await teachesStudent(user, sid))) throw forbidden();
        const t = await docData('threads/' + sid);
        const msgs = Object.entries((t && t.msgs) || {}).map(([id, m]) => Object.assign({id}, m)).sort((x, y) => (y.at || 0) - (x.at || 0));
        const last = msgs[0];
        if (!last || last.from !== user.uid || Date.now() - last.at > HOUR) break;
        if (!(await firstTime(`msg-${sid}-${last.id}`))) break;
        if (user.uid === sid) sent = await deliver(await teachersOfStudent(sid), 'message', {title:`Message from ${await nameOf(sid)}`, body:clip(last.text, 600), link:link('inbox'), linkLabel:'Reply'});
        else sent = await deliver([sid], 'message', {title:'New message from your teacher', body:clip(last.text, 600), link:link('inbox'), linkLabel:'Reply'});
        break;
      }
      case 'submission': {
        const aid = safeId(evt.aid);
        const s = await docData('subs/' + user.uid), item = s && s.items && s.items[aid];
        const a = await docData('assignments/' + aid);
        if (!item || !a || Date.now() - item.submittedAt > HOUR) break;
        if (!(await firstTime(`sub-${user.uid}-${aid}-${item.submittedAt}`))) break;
        const score = a.kind === 'quiz' && item.total ? ` Quiz score: ${item.right} / ${item.total}.` : '';
        sent = await deliver(await teachersOfClass(a.classId), 'submission', {title:`${await nameOf(user.uid)} handed in ${a.title}`, body:`${a.kind === 'quiz' ? 'Quiz completed.' : 'Ready for you to grade.'}${score}`, link:link('work'), linkLabel:a.kind === 'quiz' ? 'See results' : 'Grade it'});
        break;
      }
      case 'joined': {
        const cid = safeId(evt.cid);
        const m = await docData('members/' + user.uid), at = m && m.classIds && m.classIds[cid];
        if (typeof at !== 'number' || Date.now() - at > 24 * HOUR) break;
        await syncAccess([user.uid]);   // give this class's teachers access to the new student's records
        if (!(await firstTime(`join-${user.uid}-${cid}-${at}`))) break;
        const cls = (await docData('classes/' + cid)) || {};
        const p = (await docData('profiles/' + user.uid)) || {};
        sent = await deliver(await teachersOfClass(cid), 'joined', {title:`${await nameOf(user.uid)} joined ${cls.name || 'your class'}`, body:[p.email, p.native ? 'Speaks ' + p.native : '', p.goals ? 'Learning because: ' + p.goals : ''].filter(Boolean).join('\n') || 'A new student joined.', link:link('students'), linkLabel:'See your students'});
        break;
      }
      case 'booking': {
        const eid = safeId(evt.eid);
        const b = await docData('bookings/' + user.uid), e = await docData('events/' + eid);
        if (!b || !b.slots || b.slots[eid] !== true || !e) break;
        if (!(await firstTime(`book-${user.uid}-${eid}`))) break;
        sent = await deliver(await teachersOfClass(e.classId), 'booking', {title:`${await nameOf(user.uid)} booked ${e.title}`, body:`${fmtWhen(e.start)} (${e.mins || 60} min)`, link:link('calendar'), linkLabel:'Open the schedule'});
        break;
      }
      case 'instructorRequest': {
        const r = await docData('instructorRequests/' + user.uid);
        if (!r || r.status !== 'pending' || Date.now() - (r.at || 0) > 24 * HOUR) break;
        if (!(await firstTime(`instreq-${user.uid}-${r.at}`))) break;
        const {auth} = admin(); let ownerUid = null;
        try { ownerUid = (await auth.getUserByEmail(process.env.OWNER_EMAIL)).uid; } catch (e) {}
        sent = await deliver([ownerUid], 'joined', {title:`Instructor request: ${r.name || r.email}`, body:[r.email, r.teaches ? 'Teaches ' + r.teaches : '', r.org].filter(Boolean).join('\n') || 'Someone asked for an instructor account.', link:link('account'), linkLabel:'Review the request'});
        break;
      }
      case 'instructorApproved': {
        if (!(user.email === (process.env.OWNER_EMAIL || '').trim().toLowerCase() && user.emailVerified)) throw forbidden();
        const uid = safeId(evt.uid);
        const t = await docData('teachers/' + uid); if (!t) throw bad('Not found');
        if (!(await firstTime(`instok-${uid}-${t.approvedAt}`))) break;
        sent = await deliver([uid], 'joined', {title:'Your Parlei instructor account is ready', body:'You can now create classes, post lessons and invite students. Sign in to get started.', link:link('home'), linkLabel:'Open Parlei'}, {force:true});
        break;
      }
      default: throw bad('Unknown event');
    }
    res.status(200).json({ok:true, sent});
  } catch (e) { fail(res, e); }
}
