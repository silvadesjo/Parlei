// Receives push notifications while Parlei is closed or in the background.
importScripts('/config.js', '/vendor/firebase-app-compat.js', '/vendor/firebase-messaging-compat.js');

const cfg = self.PARLEI_CONFIG && self.PARLEI_CONFIG.firebase;
if (cfg && cfg.apiKey && !/REPLACE/.test(cfg.apiKey)) {
  firebase.initializeApp(cfg);
  firebase.messaging();   // notifications sent with a title and body are shown automatically
}
// Tapping a notification opens the page in its webpush.fcmOptions.link (handled by Firebase).
