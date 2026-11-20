// GET /api/cron-daily — run once a day by Vercel Cron (see vercel.json).
// Sends reminders for assignments due tomorrow and for classes and booked 1:1s in the next 24 hours.
import {admin, env, studentsOf, teachersOfClass, docData, firstTime, deliver, fail, appUrl, timeZone, fmtWhen} from './_lib/core.js';

const ymd = d => new Intl.DateTimeFormat('en-CA', {timeZone:timeZone(), year:'numeric', month:'2-digit', day:'2-digit'}).format(d);

export default async function handler(req, res){
  try {
    if (!env('CRON_SECRET') || req.headers.authorization !== 'Bearer ' + env('CRON_SECRET')) return res.status(401).json({code:'unauthorized'});
    const {db} = admin(), now = Date.now(), tomorrow = ymd(new Date(now + 864e5));
    let sent = 0;

    // Assignments due tomorrow: remind students who haven't handed in.
    const due = await db.collection('assignments').where('due', '==', tomorrow).get();
    for (const doc of due.docs) {
      const a = doc.data();
      if (!(await firstTime(`due-${doc.id}-${tomorrow}`))) continue;
      const pending = [];
      for (const uid of await studentsOf(a.classId)) {
        const s = await docData(`subs/${uid}__${a.classId}`);
        if (!(s && s.items && s.items[doc.id] && s.items[doc.id].submittedAt)) pending.push(uid);
      }
      sent += await deliver(pending, 'due', {title:`Due tomorrow: ${a.title}`, body:`Hand it in by the end of the day tomorrow (${tomorrow}).`, link:appUrl() + '/#work', linkLabel:'Open the assignment'});
    }

    // Sessions in the next 24 hours.
    const from = new Date(now).toISOString(), to = new Date(now + 864e5).toISOString();
    const events = await db.collection('events').where('start', '>=', from).where('start', '<', to).get();
    for (const doc of events.docs) {
      const e = doc.data();
      if (!(await firstTime(`session-${doc.id}`))) continue;
      const when = fmtWhen(e.start), link = appUrl() + '/#calendar', teachers = await teachersOfClass(e.classId);
      const body = `${when} (${e.mins || 60} min).${e.link ? '\nJoin: ' + e.link : ''}`;
      if (e.kind === 'slot') {
        const booked = (await db.collection('bookings').get()).docs.filter(d => d.data().slots && d.data().slots[doc.id] === true).map(d => d.id);
        if (!booked.length) continue;
        sent += await deliver(booked, 'session', {title:`Reminder: ${e.title}`, body, link, linkLabel:'Open the schedule'});
        sent += await deliver(teachers, 'session', {title:`Reminder: ${e.title}`, body:body + '\nBooked by a student.', link, linkLabel:'Open the schedule'});
      } else {
        const cls = (await docData('classes/' + e.classId)) || {};
        sent += await deliver(await studentsOf(e.classId), 'session', {title:`Class reminder: ${e.title}`, body:`${cls.name ? cls.name + '\n' : ''}${body}`, link, linkLabel:'Open the schedule'});
        sent += await deliver(teachers, 'session', {title:`You're teaching: ${e.title}`, body, link, linkLabel:'Open the schedule'});
      }
    }
    res.status(200).json({ok:true, sent});
  } catch (e) { fail(res, e); }
}
