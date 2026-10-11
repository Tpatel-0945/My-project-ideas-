/* Firebase config for sign-in and sync across devices.
   Firebase console → Project settings → Your apps → Web app → "SDK setup and configuration" → Config.
   These values are not secrets: access is protected by Firebase Authentication and the rules in firestore.rules.
   Leave apiKey empty to keep the app local-only (data saved on each device separately). */
window.AURA_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};
