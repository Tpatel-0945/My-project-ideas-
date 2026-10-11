/* Firebase config for sign-in and sync across devices.
   Firebase console → Project settings → Your apps → Web app → "SDK setup and configuration" → Config.
   These values are not secrets: access is protected by Firebase Authentication and the rules in firestore.rules.
   authDomain: if you host on Firebase Hosting, use your '<project>.web.app' address so Google sign-in works in the installed iPhone app.
   Leave apiKey empty to keep the app local-only (data saved on each device separately). Full steps: DEPLOY.md */
window.AURA_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  appId: '',
};
