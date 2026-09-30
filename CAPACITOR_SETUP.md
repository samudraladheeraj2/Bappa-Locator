# Bappa Locator — Mobile App Build & Capacitor Setup Guide

This project includes Capacitor setup for cross-platform native iOS & Android application deployment.

---

## 🛠️ Prerequisites

- **Node.js**: v18 or v20+
- **Android Studio**: Installed with Android SDK (API Level 33+)
- **Java JDK**: Version 17

---

## 🚀 Quick Start Instructions

### 1. Build Production Web Bundle & Sync
```bash
npm run build
npx cap add android
npx cap sync
```

### 2. Open Android Project in Android Studio
```bash
npx cap open android
```

### 3. Generate Android APK / App Bundle
In Android Studio:
- Select **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**
- The output APK will be saved at `android/app/build/outputs/apk/debug/app-debug.apk`.

---

## 🤖 Automated CI/CD (GitHub Actions)

An automated workflow is configured at `.github/workflows/build-apk.yml`:
- Runs automatically on push to `main` or `master`.
- Installs dependencies, runs `npm run lint` and `npm run build`.
- Adds/syncs Capacitor Android project and compiles `./gradlew assembleDebug`.
- Publishes `bappa-locator-debug-apk` artifact directly to GitHub Actions build outputs for instant download.

---

## 📋 Capacitor Configuration Summary

- **App Name**: Bappa Locator
- **App ID**: `com.bappalocator.app`
- **Web Directory**: `dist`
- **Config File**: `capacitor.config.ts`
