// Parlei platform layer: connects the app (index.html) to Firebase.
// It hands the app the same small interface the app has always used:
// a document store (doc / collection / get / set / update / onSnapshot),
// sign-in, file uploads, push notifications, word look-up and notification sending.
// If config.js has no Firebase settings, the app runs as an in-memory demo.

const CONFIG = self.PARLEI_CONFIG || {};
const resolve = window.__parleiResolve;
const configured = CONFIG.firebase && CONFIG.firebase.apiKey && !/REPLACE/.test(CONFIG.firebase.apiKey);

if (!configured) resolve(null);
else init().catch(e => { console.error('Parlei could not start Firebase:', e); resolve({error:String(e && e.message || e)}); });

async function init(){
  const {initializeApp} = await import('./vendor/firebase-app.js');
  const A = await import('./vendor/firebase-auth.js');
  const F = await import('./vendor/firebase-firestore.js');
  const ST = await import('./vendor/firebase-storage.js');

  const app = initializeApp(CONFIG.firebase);
  const auth = A.getAuth(app);
  let fdb;
  try { fdb = F.initializeFirestore(app, {ignoreUndefinedProperties:true, localCache:F.persistentLocalCache({tabManager:F.persistentMultipleTabManager()})}); }
  catch (e) { fdb = F.initializeFirestore(app, {ignoreUndefinedProperties:true}); }
  const storage = ST.getStorage(app);
  const owner = String(CONFIG.ownerEmail || '').trim().toLowerCase();

  /* ---------- document store ---------- */
  const CODES = {'permission-denied':'invalid_argument', 'invalid-argument':'invalid_argument', 'not-found':'invalid_argument', 'failed-precondition':'invalid_argument', 'resource-exhausted':'resource_exhausted', 'unavailable':'unavailable', 'deadline-exceeded':'unavailable'};
  const err = e => ({code:CODES[e && e.code] || 'unavailable', rawCode:(e && e.code) || '', message:(e && e.message) || String(e)});
  const meta = s => ({fromCache:s.metadata.fromCache, hasPendingWrites:s.metadata.hasPendingWrites});
  const wrapDoc = s => ({id:s.id, exists:s.exists(), data:() => s.exists() ? s.data() : undefined, metadata:meta(s)});
  const wrapQuery = s => ({docs:s.docs.map(wrapDoc), size:s.size, empty:s.empty, docChanges:() => [], metadata:meta(s)});
  // The app's update() merges nested objects; Firestore's replaces them. Flatten to field paths so they merge.
  function flatten(obj, prefix, out){
    prefix = prefix || []; out = out || [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix.concat(k);
      if (v && typeof v === 'object' && !Array.isArray(v)) { if (Object.keys(v).length) flatten(v, path, out); }
      else out.push([path, v]);
    }
    return out;
  }
  const guard = async fn => { try { return await fn(); } catch (e) { throw err(e); } };
  // Tell the app when a live read is refused or fails, so it can stop waiting instead of loading forever.
  const watchErr = (path, e) => { try { window.dispatchEvent(new CustomEvent('parlei-db-error', {detail:{path, code:(e && e.code) || ''}})); } catch (x) {} };
  function docRef(path){
    const r = F.doc(fdb, path);
    return {
      id:r.id, path,
      get:opts => guard(async () => wrapDoc(await (opts && opts.source === 'server' ? F.getDocFromServer(r) : F.getDoc(r)))),
      set:(d, opts) => guard(() => opts ? F.setDoc(r, d, opts) : F.setDoc(r, d)),
      update:d => guard(() => { const pairs = flatten(d); if (!pairs.length) return; const args = []; pairs.forEach(([p, v]) => args.push(new F.FieldPath(...p), v)); return F.updateDoc(r, ...args); }),
      delete:() => guard(() => F.deleteDoc(r)),
      onSnapshot:(next, onErr) => F.onSnapshot(r, s => next(wrapDoc(s)), e => { watchErr(path, e); onErr && onErr(err(e)); }),
      collection:p => colRef(path + '/' + p)
    };
  }
  function colRef(path, cons, group){
    cons = cons || [];
    const c = group ? F.collectionGroup(fdb, path) : F.collection(fdb, path), q = () => cons.length ? F.query(c, ...cons) : c;
    return {
      path,
      doc:id => docRef(path + '/' + (id || F.doc(c).id)),
      add:async d => { const r = docRef(path + '/' + F.doc(c).id); await r.set(d); return r; },
      where:(f, op, v) => colRef(path, cons.concat(F.where(f, op, v)), group),
      orderBy:(f, dir) => colRef(path, cons.concat(F.orderBy(f, dir || 'asc')), group),
      limit:n => colRef(path, cons.concat(F.limit(n)), group),
      get:() => guard(async () => wrapQuery(await F.getDocs(q()))),
      onSnapshot:(next, onErr) => F.onSnapshot(q(), s => next(wrapQuery(s)), e => { watchErr(path, e); onErr && onErr(err(e)); })
    };
  }
  // collectionGroup(name): the same kind of item across every class, e.g. all public lessons.
  const db = {doc:docRef, collection:p => colRef(p), collectionGroup:name => colRef(name, [], true)};

  /* ---------- server calls ---------- */
  async function api(path, body){
    const u = auth.currentUser; if (!u) throw {code:'signed_out'};
    const res = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + await u.getIdToken()}, body:JSON.stringify(body)});
    let data = null; try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw Object.assign({status:res.status}, data || {}, {code:(data && data.code) || 'http_' + res.status});
    return data;
  }

  /* ---------- push notifications ---------- */
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const TOKEN_KEY = 'parlei.pushToken';
  const getLS = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const setLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
  let messagingP = null;
  async function messaging(){
    if (!messagingP) messagingP = (async () => {
      const M = await import('./vendor/firebase-messaging.js');
      if (!(await M.isSupported())) return null;
      const m = M.getMessaging(app);
      M.onMessage(m, p => { const n = p.notification || {}; if (window.parleiToast) window.parleiToast((n.title ? n.title + ': ' : '') + (n.body || '')); });
      return {M, m};
    })();
    return messagingP;
  }
  const push = {
    status(){
      if (!pushSupported) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      return Notification.permission === 'granted' && getLS(TOKEN_KEY) ? 'on' : 'off';
    },
    async enable(uid){
      if (!CONFIG.vapidKey || /REPLACE/.test(CONFIG.vapidKey)) return {ok:false, message:'Push is not set up yet: add the vapidKey to config.js (see SETUP.md).'};
      if (!pushSupported) return {ok:false, message:'This browser can\'t receive notifications.'};
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return {ok:false, message:'Notifications weren\'t allowed. You can allow them in your browser settings.'};
      try {
        const x = await messaging(); if (!x) return {ok:false, message:'This browser can\'t receive notifications.'};
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await x.M.getToken(x.m, {vapidKey:CONFIG.vapidKey, serviceWorkerRegistration:reg});
        if (!token) return {ok:false, message:'Couldn\'t register this device.'};
        const r = F.doc(fdb, 'pushTokens/' + uid);
        await F.setDoc(r, {tokens:{[token]:{at:Date.now(), device:navigator.userAgent.slice(0, 120)}}}, {merge:true});
        setLS(TOKEN_KEY, token);
        return {ok:true};
      } catch (e) { console.error(e); return {ok:false, message:'Couldn\'t turn on notifications on this device.'}; }
    },
    async disable(uid){
      const token = getLS(TOKEN_KEY); setLS(TOKEN_KEY, null);
      if (!token) return;
      try { await F.updateDoc(F.doc(fdb, 'pushTokens/' + uid), new F.FieldPath('tokens', token), F.deleteField()); } catch (e) {}
      try { const x = await messaging(); if (x) await x.M.deleteToken(x.m); } catch (e) {}
    }
  };
  if (pushSupported && getLS(TOKEN_KEY) && Notification.permission === 'granted') messaging().catch(() => {});

  /* ---------- sign-in ---------- */
  const isOwnerUser = u => !!(u && owner && String(u.email || '').toLowerCase() === owner && u.emailVerified);
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  resolve({
    db,
    onUser(cb){
      A.onAuthStateChanged(auth, async u => {
        if (!u) return cb(null);
        let isTeacher = isOwnerUser(u);
        if (!isTeacher) { try { isTeacher = (await F.getDoc(F.doc(fdb, 'teachers/' + u.uid))).exists(); } catch (e) {} }
        const usesPassword = u.providerData.some(p => p.providerId === 'password');
        cb({uid:u.uid, email:u.email, displayName:u.displayName, isOwner:isOwnerUser(u), isTeacher, needsVerify:usesPassword && !u.emailVerified});
      });
    },
    signIn:(email, password) => A.signInWithEmailAndPassword(auth, email, password),
    async signUp(email, password, name){
      const cred = await A.createUserWithEmailAndPassword(auth, email, password);
      try { if (name) await A.updateProfile(cred.user, {displayName:name}); } catch (e) {}
      try { await A.sendEmailVerification(cred.user, {url:location.origin}); } catch (e) {}
    },
    async signInGoogle(){
      const provider = new A.GoogleAuthProvider();
      if (standalone) return A.signInWithRedirect(auth, provider);
      try { await A.signInWithPopup(auth, provider); }
      catch (e) { if (/popup-blocked/.test(e.code || '')) return A.signInWithRedirect(auth, provider); throw e; }
    },
    resetPassword:email => A.sendPasswordResetEmail(auth, email, {url:location.origin}),
    resendVerification:() => A.sendEmailVerification(auth.currentUser, {url:location.origin}),
    signOut:() => A.signOut(auth),

    assets:{
      upload(file, opts){
        opts = opts || {};
        const ext = (String(file.name || '').split('.').pop() || 'audio').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'audio';
        const path = `audio/${opts.classId || 'misc'}/${opts.id || Date.now()}.${ext}`;
        const r = ST.ref(storage, path);
        const task = ST.uploadBytesResumable(r, file, {contentType:file.type || 'audio/mpeg'});
        return new Promise((ok, fail) => {
          task.on('state_changed', s => opts.onProgress && opts.onProgress(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
            e => fail({code:e.code, message:e.message}),
            async () => ok({id:path, url:await ST.getDownloadURL(r)}));
        });
      },
      delete:path => ST.deleteObject(ST.ref(storage, path)).catch(() => {})
    },

    lookup: CONFIG.lookup === false ? null : async q => {
      try { return await api('/api/lookup', q); }
      catch (e) {
        if (e.status === 501 || e.status === 404) throw {code:'lookup_off'};
        if (e.status === 429) throw {code:'daily_limit'};
        throw {code:'upstream_error'};
      }
    },
    notify:evt => api('/api/notify', evt),
    access:async body => { try { return await api('/api/access', body); } catch (e) { throw {code:e.code, message:e.message || "Couldn't make that change."}; } },
    push
  });
}
