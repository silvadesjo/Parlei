// Parlei settings. Fill these in once (see SETUP.md). None of these values are secret:
// Firebase web settings are meant to be public; your data is protected by firestore.rules.
self.PARLEI_CONFIG = {
  // Firebase console > Project settings > General > Your apps > Web app > "firebaseConfig"
  firebase: {
    apiKey: "AIzaSyB_rM0YXrJtwDMUC5xX_lpKjGX62xf92A8",
    authDomain: "www.parlei.ca",   // Google sign-in runs on your own domain (vercel.json forwards /__/auth to Firebase),
    projectId: "parlei-795a8",
    storageBucket: "parlei-795a8.firebasestorage.app",
    messagingSenderId: "826965689607",
    appId: "1:826965689607:web:866782196e8ff8cfd471a2"
  },

  // The teacher's email. Signing in with this email (verified) makes you the teacher.
  // Use the same email in firestore.rules, storage.rules and the OWNER_EMAIL setting on Vercel.
  ownerEmail: "REPLACE_WITH_YOUR_EMAIL",

  // Firebase console > Project settings > Cloud Messaging > Web Push certificates > Key pair
  vapidKey: "REPLACE_WITH_VAPID_KEY",

  // Set to false to hide the vocabulary Look up button.
  lookup: true
};
