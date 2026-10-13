# Pandal Hopper — Mobile App Update & Distribution Guide

This guide explains how updates work and how release APKs are automatically built and published for Android smartphones.

---

## 📱 Automatic In-App APK Updates (Built-In)

Your app features an automated **In-App Update Checker** (`src/components/AndroidInAppUpdateChecker.tsx`).

### How It Works:
1. Every time a user opens the Pandal Hopper app on their mobile phone, the app checks `version.json` from your GitHub repository (`samudraladheeraj2/Pandal-Hopper`).
2. If `latestVersion` in `version.json` is newer than `CURRENT_APP_VERSION` (e.g. `1.2.6` > `1.2.5`), a popup modal appears automatically on the user's screen:
   - **Title**: *Android App Update Available!*
   - **Badge**: *v1.2.6 Available*
   - **Release Notes**: Highlights the latest changes.
   - **Action**: *Download & Install APK*
3. Tapping **Download & Install APK** downloads the new `.apk` file directly to their device.

### How to Release a New Version to Users:
1. **Increment Version**:
   In `version.json`, bump `latestVersion` (e.g. `"1.2.7"`) and `versionCode` (e.g. `11`):
   ```json
   {
     "latestVersion": "1.2.7",
     "versionCode": 11,
     "apkUrl": "https://github.com/samudraladheeraj2/Pandal-Hopper/releases/download/v1.2.7/pandal-hopper-v1.2.7.apk",
     "releaseNotes": "Performance improvements and new pandal listings.",
     "forceUpdate": false
   }
   ```
2. **Build and Sync**:
   `node scripts/sync-versions.js` automatically propagates the new version across `package.json`, `public/version.json`, `src/utils/versionCheck.ts`, and `android/app/build.gradle`.
3. **Push to GitHub**:
   - Pushing your changes automatically triggers `.github/workflows/build-apk.yml`.
   - The workflow runs `./gradlew clean` and compiles a clean, signed release APK.
   - The new APK is published directly as a GitHub Release (under tag `v1.2.7`) AND uploaded as a downloadable GitHub Actions artifact for immediate access.
   - Devotees opening the app will automatically get the prompt to download the new version!

---

## 🌐 Progressive Web App (PWA) Updates
For users visiting the web app or those who added it to their home screen via browser:
- Service Worker caching updates seamlessly in web browsers.
- On native Android APK runs, Service Worker caching is cleanly bypassed to ensure fast, zero-conflict WebView loading directly from local native assets.
