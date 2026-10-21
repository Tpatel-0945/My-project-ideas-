# Put AURA online and on your phone's home screen

About 20 minutes, once. You need a Google account and a computer (Windows, Mac or Linux) for step 3.
After this, AURA lives at `https://<your-project>.web.app`, you sign in on any phone, iPad or computer and all your data is there, and it installs as an app with its own icon.

## 1. Create your free backend (Firebase)

1. Go to <https://console.firebase.google.com> → **Create a project**. Name it, for example `aura-monitor`. Google Analytics is not needed.
2. **Sign-in:** *Build → Authentication → Get started → Sign-in method*. Enable **Google** (pick your support email) and **Email/Password**.
3. **Database:** *Build → Firestore Database → Create database*. Choose a location near you (**asia-south1, Mumbai** for India; it can't be changed later) and **production mode**. The rules come from this repo in step 3.
4. **Web app:** *Project overview → </> (Add app) → Web*. Give it a nickname, tick **Also set up Firebase Hosting**, and register. Copy the `firebaseConfig` values it shows.

The free Spark plan covers personal use comfortably: 1 GB of data, 50,000 reads and 20,000 writes a day. AURA uses Authentication, Firestore and Hosting only; no billing is needed.

## 2. Paste your config

Open `js/firebase-config.js` and fill in the values from step 1.4:

```js
window.AURA_FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'aura-monitor.web.app',   // use your .web.app address here (not .firebaseapp.com); Google sign-in on iPhone needs it
  projectId: 'aura-monitor',
  appId: '1:…:web:…',
};
```

These values are not secrets. Your data is protected by sign-in and by `firestore.rules`: only your account can read or write your data.

Open `.firebaserc` and replace `your-firebase-project-id` with your project ID.

## 3. Publish

Install [Node.js](https://nodejs.org) (LTS), then in a terminal inside this folder:

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

`firebase deploy` uploads the site **and** the security rules. It prints your address, for example `https://aura-monitor.web.app`. Run `firebase deploy` again whenever you change the code.

## 4. Open it and sign in

1. Open your `.web.app` address and **sign in with Google** (recommended), or create an email account with a strong password.
2. Enter your PIN to unlock. The default is the one in `js/lock-config.js`; change it in **Me → Privacy lock → Change PIN**, and the new PIN follows your account to every device.
3. On every other phone, iPad or computer: open the same address, sign in, and all your check-ins, scans, sleep nights, food plans and Derma chat appear. Changes show up on your other devices within seconds. Offline changes are kept on the device and upload when you reconnect.

## 5. Install it as an app (home-screen icon)

- **iPhone / iPad:** open the address in **Safari** → **Share** → **Add to Home Screen** → **Add**.
- **Android:** open it in **Chrome** → **Install app** (or menu ⋮ → *Add to Home screen*). The app's **Me** page also has an **Install AURA** button.
- **Computer:** Chrome or Edge → the install icon in the address bar.

It opens full-screen with no browser bars, starts at the lock screen, and keeps working offline.

### Use your own icon

Put a square PNG (1024 × 1024 is ideal) anywhere and run:

```bash
python3 tools/make_icons.py path/to/your-icon.png
firebase deploy
```

This makes every size phones need (Android adaptive icon, iPhone home-screen icon, favicon) in `icons/`. On a phone that already has the app, remove it from the home screen and add it again to see the new icon.

### Want a real Android app file?

Go to <https://www.pwabuilder.com>, enter your `.web.app` address and choose **Package for stores → Android**. You get an `.apk` to install on your phone (or an `.aab` for the Play Store). The iPhone App Store needs a paid Apple Developer account; **Add to Home Screen** gives you the same app for free.

## Without a computer: GitHub Pages

*Repo → Settings → Pages → Deploy from branch → `/ (root)`* publishes the site at `https://<username>.github.io/<repo>/`. Then:

- add `<username>.github.io` under *Authentication → Settings → Authorized domains*;
- paste `firestore.rules` into *Firestore → Rules → Publish* yourself.

Google sign-in inside the installed iPhone app can fail on GitHub Pages because of Safari's privacy rules, so use **email and password** sign-in there, or prefer Firebase Hosting.

## What's stored where

| Where | What |
| --- | --- |
| `users/<you>` | profile, routine, reminders, alarm and sleep nights, food plans |
| `users/<you>/logs/<date>` | one document per day of check-ins |
| `users/<you>/scans/<id>` | each photo scan (small thumbnail + scores) |
| `users/<you>/chat/main` | your Derma conversation |
| `users/<you>/private/settings` | your PIN's hash (never the PIN) and, if you tick the box, your Gemini key |
| `users/<you>/backups/<week>` | a compressed weekly backup of everything except photos (last 8 kept) |

Every device also keeps a full copy plus 14 daily backups, so the app opens instantly and works offline. Make a backup file now and then too (**Me → Data & backups**). **Me → Delete everything** removes everything, including backups, from your account and the device.

After changing `firestore.rules`, run `firebase deploy` again so the new `backups` collection is allowed.
