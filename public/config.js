// Parlei settings. Fill these in once (see SETUP.md). None of these values are secret:
// Firebase web settings are meant to be public; your data is protected by firestore.rules.
self.PARLEI_CONFIG = {
  // Firebase console > Project settings > General > Your apps > Web app > "firebaseConfig"
  firebase: {
    apiKey: "REPLACE_WITH_API_KEY",
    authDomain: "REPLACE.firebaseapp.com",
    projectId: "REPLACE",
    storageBucket: "REPLACE.firebasestorage.app",
    messagingSenderId: "REPLACE",
    appId: "REPLACE"
  },

  // The teacher's email. Signing in with this email (verified) makes you the teacher.
  // Use the same email in firestore.rules, storage.rules and the OWNER_EMAIL setting on Vercel.
  ownerEmail: "REPLACE_WITH_YOUR_EMAIL",

  // Firebase console > Project settings > Cloud Messaging > Web Push certificates > Key pair
  vapidKey: "REPLACE_WITH_VAPID_KEY",

  // Set to false to hide the vocabulary Look up button.
  lookup: true
};
