# Bappa Locator — Mobile App Update & Distribution Guide

This guide explains how to push app updates to users who have installed Bappa Locator on their Android smartphones or PWA desktop/mobile devices.

---

## 📱 Option 1: Automatic In-App APK Update Popup (Built-In)

Your app features an automated **In-App Update Checker** (`src/components/AndroidInAppUpdateChecker.tsx`).

### How It Works:
1. Every time a user opens the Bappa Locator app on their mobile phone, the app silently fetches `version.json` from your GitHub repository or web host.
2. If `latestVersion` in `version.json` is newer than `CURRENT_APP_VERSION` (e.g. `1.1.0` > `1.0.0`), a popup modal automatically appears on the user's screen:
   - **Title**: *Android App Update Available!*
   - **Badge**: *v1.1.0 Available*
   - **Release Notes**: Highlights what's new.
   - **Action**: *Download & Install APK*
3. Tapping **Download & Install APK** downloads the new `.apk` file directly to their device and opens the native Android package installer.

### Steps to Trigger an Update for All Users:

1. **Update `version.json`**:
   Simply increment `latestVersion` (e.g. `"1.2.6"`) and `versionCode` (e.g. `10`) in root `version.json`:
   ```json
   {
     "latestVersion": "1.2.6",
     "versionCode": 10,
     "apkUrl": "https://github.com/samudraladheeraj2/Bappa-Locator/releases/download/v1.2.6/bappa-locator-v1.2.6.apk",
     "releaseNotes": "Highlight your new features or bug fixes here!",
     "forceUpdate": false
   }
   ```

2. **Automatic Package & Version Synchronization**:
   - `scripts/sync-versions.js` automatically propagates the version to `package.json`, `public/version.json`, `src/utils/versionCheck.ts`, `capacitor.config.ts`, and `android/app/build.gradle`.
   - The signing keystore is permanently embedded in `android/app/release.keystore`, ensuring every generated APK uses the exact same digital certificate. **Users can update smoothly without any "Package conflicts with an existing package" or packaging errors!**

3. **Push to GitHub**:
   - Pushing your changes to `main` automatically triggers `.github/workflows/build-apk.yml`.
   - The signed APK is compiled and published as a GitHub Release under tag `v1.2.6`.
   - All installed apps on user phones will automatically detect the new version on their next app launch and prompt them to update!

---

## ⚡ Option 2: Over-The-Air (OTA) Web Bundle Updates (`@capgo/capacitor-updater`)

For frontend, styling, or bug-fix updates that do not require new native Android permissions:

1. `@capgo/capacitor-updater` is already installed and configured in `src/components/AppUpdaterNotifier.tsx`.
2. When a web update bundle is published via Capgo CLI (`npx @capgo/cli@latest upload`), the app automatically notifies the user on startup:
   - *"A new version of the app is ready. Tap Update to apply."*
3. Tapping **Update** downloads the bundle and reloads the app in 2 seconds without requiring an APK re-install!

---

## 🌐 Option 3: PWA (Progressive Web App) Auto-Update

For users who installed the app directly from Chrome/Edge/Safari (via **"Add to Home Screen"** or **"Install App"**):

1. The Service Worker (`sw.js`) automatically checks for new assets on every app launch.
2. Newly compiled JS/CSS bundles (`dist/`) are cached in the background, updating the PWA seamlessly.
