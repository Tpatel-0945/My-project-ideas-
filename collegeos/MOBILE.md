# CollegeOS on Android and iPad

There are two ways. **Start with option 1**: it's free, takes 10 minutes, and gives you an app
icon with a full-screen app. Option 2 builds real Play Store / App Store apps.

Both need CollegeOS online at an **https** address first, because phones can't reach your laptop's
`localhost`, and the sign-in code is sent by the server.

## Step 0: put CollegeOS online (once)
1. Push this repo to GitHub (it already is: `tpatel-0945/my-project-ideas-`).
2. Create a free account at https://www.brevo.com. Under **Senders**, verify the email you'll send from;
   under **SMTP & API → API keys**, create a key. (Render's free plan blocks Gmail's ports, so the
   online version sends codes with Brevo.)
3. Go to https://render.com → **New → Blueprint** → pick the repo. Render reads `render.yaml`.
   Paste `BREVO_API_KEY` and `MAIL_FROM_EMAIL` when asked → **Apply**.
4. After a few minutes you get a link like `https://collegeos.onrender.com`. Open it on your laptop and
   sign in once to check the email code arrives.

Free Render apps sleep after 15 minutes without use, so the first open after a break can take
about 30 seconds.

## Option 1: install it like an app (no app store)
CollegeOS now includes an app manifest, icons and offline support, so phones treat it as an
installable app (a "progressive web app").

### Android phone (Chrome)
1. Open your `https://…onrender.com` link in **Chrome**.
2. Tap the **⋮** menu → **Install app** (on some phones: **Add to Home screen** → **Install**).
3. CollegeOS appears in your app drawer with its icon. It opens full screen, without the browser bar.

### iPad or iPhone (Safari)
1. Open the same link in **Safari** (it has to be Safari for installing on iPadOS/iOS).
2. Tap the **Share** button (square with an arrow; on iPad it's at the top right).
3. Scroll and tap **Add to Home Screen** → **Add**.
4. Open CollegeOS from the home screen. It runs full screen with a black status bar.

To update the app later, just push changes to GitHub; Render redeploys and the installed app picks
up the new version the next time it opens.

## Option 2: real Android and iPad apps (Capacitor)
The `mobile/` folder turns CollegeOS into native app projects that load your hosted site.

### You'll need
- Node.js 18+ on your computer
- **Android:** Android Studio (free, Windows/Mac/Linux): https://developer.android.com/studio
- **iPad:** a **Mac** with Xcode from the App Store. Testing on your own iPad is free;
  publishing on the App Store needs the Apple Developer Program ($99/year).
- **Play Store:** a Google Play Console account (one-time $25).

### Set up (once)
1. Open `mobile/capacitor.config.json` and replace `https://REPLACE-WITH-YOUR-APP.onrender.com`
   with your Render link.
2. In a terminal:
   ```bash
   cd collegeos/mobile
   npm install
   npx cap add android     # creates the android/ project
   npx cap add ios         # Mac only: creates the ios/ project
   npx cap sync
   ```

### Android: run on your phone
1. On the phone: **Settings → About phone** → tap **Build number** 7 times to unlock Developer options.
   Then **Settings → Developer options → USB debugging: on**.
2. Connect the phone with a USB cable and allow debugging when it asks.
3. `npx cap open android` opens Android Studio. Wait for Gradle to finish, pick your phone at the top,
   and press **Run ▶**. CollegeOS installs on the phone.
4. **To share or publish:** in Android Studio, **Build → Generate Signed App Bundle / APK**.
   - **APK**: send the file to friends; they allow "Install unknown apps" and tap it.
   - **App Bundle (.aab)**: upload to Google Play Console → create app → Production → upload.

### iPad: run on your iPad (Mac needed)
1. `npx cap open ios` opens Xcode.
2. Click the **App** project → **Signing & Capabilities** → **Team**: sign in with your Apple ID
   (a free "Personal Team" works for your own iPad).
3. Connect the iPad with a cable, choose it at the top of Xcode, and press **Run ▶**.
4. On the iPad: **Settings → General → VPN & Device Management** → trust your developer profile,
   then open CollegeOS. With a free Apple ID the app has to be re-installed from Xcode every 7 days.
5. **To publish:** join the Apple Developer Program, then in Xcode **Product → Archive →
   Distribute App → App Store Connect**, and submit it from https://appstoreconnect.apple.com.
   For the iPad, keep "iPad" ticked under **General → Supported Destinations**.

### After you change the website
Nothing to rebuild: the apps load your hosted site, so pushing to GitHub updates them. Rebuild only
if you change the app name, icon or `capacitor.config.json` (`npx cap sync`, then Run again).

### App icon for the native apps
Use `pwa/icons/icon-512.png`. In Android Studio: right-click **res → New → Image Asset**.
In Xcode: **App → Assets → AppIcon**, then drop in the 1024 px version (scale up the 512 px icon, or
re-run `pwa/make-icons.js` with a 1024 size).
