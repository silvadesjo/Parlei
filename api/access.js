// POST /api/access — the only way class access changes. The server checks who is asking, makes the
// change, and refreshes the list of teachers who may see each affected student's records.
//   {action:'join', code}                        a student joins the class with that join code
//   {action:'leave', cid}                        a student leaves a class
//   {action:'sync'}                              refresh the signed-in user's access
//   {action:'addCoTeacher', cid, email}          class owner (or Parlei owner) adds an approved instructor
//   {action:'removeCoTeacher', cid, uid}         class owner, Parlei owner, or the co-teacher themselves
//   {action:'removeStudent', cid, uid}           any teacher of the class
//   {action:'deleteClass', cid}                  class owner or Parlei owner
import {FieldPath, FieldValue} from 'firebase-admin/firestore';
import {admin, verifyUser, isOwnerUser, ownerEmail, teachesClass, studentsOf, syncAccess, docData, deliver, nameOf, fail, appUrl, teachersOfClass, firstTime} from './_lib/core.js';

const err = (status, code, message) => Object.assign(new Error(message), {status, code});
const safeId = v => { const s = String(v || ''); if (!/^[A-Za-z0-9_.~:@+-]{1,120}$/.test(s)) throw err(400, 'bad_id', 'Bad id'); return s; };

async function classOwnerOrAdmin(user, cid){
  const c = await docData('classes/' + cid);
  if (!c) throw err(404, 'no_class', 'Class not found');
  if (!(isOwnerUser(user) || c.teacherId === user.uid)) throw err(403, 'not_class_owner', 'Only the instructor who owns this class can do that');
  return c;
}

// teachers/{uid}.coClasses lists the classes an instructor co-teaches, so the app knows which to load.
async function markCoClass(uid, cid, on){
  const {db} = admin(), ref = db.doc('teachers/' + uid), t = await ref.get();
  if (!t.exists) return;   // the owner has no teachers/ document and can see every class anyway
  await ref.update(new FieldPath('coClasses', cid), on ? true : FieldValue.delete());
}

export default async function handler(req, res){
  if (req.method !== 'POST') return res.status(405).json({code:'method'});
  try {
    const user = await verifyUser(req);
    const b = req.body || {}, {db, auth} = admin();
    switch (b.action) {
      case 'sync': {
        await syncAccess([user.uid]);
        return res.status(200).json({ok:true});
      }
      case 'join': {
        // Class documents (and their join codes) can't be listed by students, so the server matches the code.
        const code = String(b.code || '').toUpperCase().replace(/\s+/g, '');
        if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw err(400, 'bad_code', "That code doesn't match a class");
        const q = await db.collection('classes').where('code', '==', code).limit(1).get();
        if (q.empty) throw err(404, 'bad_code', "That code doesn't match a class. Check it with your teacher.");
        const cid = q.docs[0].id, cls = q.docs[0].data() || {}, now = Date.now();
        const ref = db.doc('members/' + user.uid), m = await ref.get(), already = m.exists && typeof (m.data().classIds || {})[cid] === 'number' && m.data().classIds[cid] > 0;
        if (!already) {
          if (m.exists) await ref.update(new FieldPath('classIds', cid), now);
          else await ref.set({classIds:{[cid]:now}});
        }
        await syncAccess([user.uid]);   // this class's teachers can now see the student's records
        if (!already && await firstTime(`join-${user.uid}-${cid}-${now}`)) {
          const p = (await docData('profiles/' + user.uid)) || {};
          await deliver(await teachersOfClass(cid), 'joined', {title:`${await nameOf(user.uid)} joined ${cls.name || 'your class'}`, body:[p.email, p.native ? 'Speaks ' + p.native : '', p.goals ? 'Learning because: ' + p.goals : ''].filter(Boolean).join('\n') || 'A new student joined.', link:appUrl() + '/#students', linkLabel:'See your students'});
        }
        return res.status(200).json({ok:true, cid, name:cls.name || ''});
      }
      case 'leave': {
        const cid = safeId(b.cid), ref = db.doc('members/' + user.uid), m = await ref.get();
        if (m.exists && (m.data().classIds || {})[cid]) await ref.update(new FieldPath('classIds', cid), false);
        await syncAccess([user.uid]);
        return res.status(200).json({ok:true});
      }
      case 'addCoTeacher': {
        const cid = safeId(b.cid), c = await classOwnerOrAdmin(user, cid);
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err(400, 'bad_email', 'Check the email address');
        let uid = null, name = '';
        if (email === ownerEmail()) { try { const u = await auth.getUserByEmail(email); uid = u.uid; name = u.displayName || ''; } catch (e) {} }
        if (!uid) {
          const q = await db.collection('teachers').where('email', '==', email).limit(1).get();
          if (!q.empty) { uid = q.docs[0].id; name = q.docs[0].data().name || ''; }
        }
        if (!uid) throw err(404, 'not_instructor', 'No approved instructor has that email. They need to sign up as an instructor and be approved first.');
        if (uid === c.teacherId) throw err(400, 'already_owner', 'That instructor already owns this class');
        await db.doc('classes/' + cid).update(new FieldPath('coTeachers', uid), {name, email, addedBy:user.uid, at:Date.now()});
        await markCoClass(uid, cid, true);
        await syncAccess(await studentsOf(cid));
        await deliver([uid], 'joined', {title:`You're now a co-teacher of ${c.name || 'a class'}`, body:`${await nameOf(user.uid)} added you as a co-teacher. You can now post lessons and work, grade, and message the students in this class.`, link:appUrl() + '/#home', linkLabel:'Open Parlei'}, {force:true});
        return res.status(200).json({ok:true, uid, name});
      }
      case 'removeCoTeacher': {
        const cid = safeId(b.cid), uid = safeId(b.uid);
        const c = await docData('classes/' + cid);
        if (!c) throw err(404, 'no_class', 'Class not found');
        if (!(isOwnerUser(user) || c.teacherId === user.uid || uid === user.uid)) throw err(403, 'not_class_owner', 'Only the instructor who owns this class can do that');
        if (!(c.coTeachers || {})[uid]) return res.status(200).json({ok:true});
        await db.doc('classes/' + cid).update(new FieldPath('coTeachers', uid), FieldValue.delete());
        await markCoClass(uid, cid, false);
        await syncAccess(await studentsOf(cid));
        return res.status(200).json({ok:true});
      }
      case 'removeStudent': {
        const cid = safeId(b.cid), uid = safeId(b.uid);
        if (!(await teachesClass(user, cid))) throw err(403, 'not_teacher', 'You don\'t teach this class');
        const ref = db.doc('members/' + uid), m = await ref.get();
        if (m.exists && (m.data().classIds || {})[cid]) await ref.update(new FieldPath('classIds', cid), false);
        await syncAccess([uid]);
        return res.status(200).json({ok:true});
      }
      case 'deleteClass': {
        const cid = safeId(b.cid);
        await classOwnerOrAdmin(user, cid);
        const students = await studentsOf(cid), c = await docData('classes/' + cid);
        for (const uid of Object.keys((c && c.coTeachers) || {})) await markCoClass(uid, cid, false);
        await db.recursiveDelete(db.doc('classes/' + cid));   // the class and everything in it
        for (const uid of students) await db.doc('members/' + uid).update(new FieldPath('classIds', cid), false);
        await syncAccess(students);
        return res.status(200).json({ok:true});
      }
      default: throw err(400, 'unknown_action', 'Unknown action');
    }
  } catch (e) { fail(res, e); }
}
