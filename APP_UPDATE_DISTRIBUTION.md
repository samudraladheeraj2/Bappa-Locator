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

1. **Build the New APK**:
   - Push your code changes to GitHub. The `.github/workflows/deploy.yml` workflow will automatically build the new APK (`bappa-locator-android-apk`).
   - Create a Release on GitHub (e.g. Tag `v1.1.0`) and attach the new `.apk` file.

2. **Update `public/version.json`**:
   Change `latestVersion` to `"1.1.0"` (or your new version) and paste the new APK download URL:

   ```json
   {
     "latestVersion": "1.1.0",
     "versionCode": 2,
     "apkUrl": "https://github.com/samudraladheeraj/bappa-locator/releases/download/v1.1.0/bappa-locator-v1.1.0.apk",
     "releaseNotes": "Admin Console security updates, zero-flicker map performance, and cross-platform GitHub Secrets integration!",
     "forceUpdate": false
   }
   ```

3. **Push `version.json` to GitHub**:
   - As soon as `version.json` is updated on `main`, all user devices will detect the new version on next startup and prompt them to update!

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
