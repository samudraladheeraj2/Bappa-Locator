# Bappa Locator — GitHub Secrets Setup Guide

This guide details how to configure GitHub Repository Secrets to automatically build and deploy Bappa Locator across Web, PWA, and Android without committing secret API keys to the source repository.

---

## 🔑 Required Repository Secrets

Set up the following secrets in your GitHub repository:

| Secret Name | Description | Recommended Default / Example |
| :--- | :--- | :--- |
| `VITE_FIREBASE_API_KEY` | Firebase Web API Key | `AIzaSy...` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Project ID | `ai-studio-bappalocator-3f3c0518-c821-44fe-84bf-aa228b12ee54` |
| `VITE_FIREBASE_APP_ID` | Firebase Web App ID | `1:556597604247:web:b4fbcda8df3509b1dd9ed2` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain | `glossy-topic-380115.firebaseapp.com` |
| `VITE_FIREBASE_DATABASE_ID` | Firestore Database ID | `ai-studio-bappalocator-3f3c0518-c821-44fe-84bf-aa228b12ee54` |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage Bucket | `glossy-topic-380115.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID | `556597604247` |
| `VITE_GOOGLE_MAPS_API_KEY` | Restricted Google Maps API Key | `AIzaSy...` |
| `GEMINI_API_KEY` | Gemini AI Key | `AIzaSy...` |
| `APP_URL` | Production Web URL | `https://bappa-locator.app` |

---

## 🖥️ How to Add Secrets via GitHub UI

1. Open your repository on GitHub (`https://github.com/USERNAME/REPO_NAME`).
2. Click **Settings** (top navigation tab).
3. In the left sidebar under **Security**, expand **Secrets and variables** and click **Actions**.
4. Click **New repository secret**.
5. Enter the **Name** (e.g. `VITE_FIREBASE_API_KEY`) and the **Secret** value.
6. Click **Add secret**.
7. Repeat for all required secrets.

---

## ⚡ How to Add Secrets via GitHub CLI (`gh`)

If you have `gh` installed, run these commands in your terminal:

```bash
gh secret set VITE_FIREBASE_API_KEY --body "AIzaSyYourFirebaseApiKey"
gh secret set VITE_FIREBASE_PROJECT_ID --body "ai-studio-bappalocator-3f3c0518-c821-44fe-84bf-aa228b12ee54"
gh secret set VITE_FIREBASE_APP_ID --body "1:556597604247:web:b4fbcda8df3509b1dd9ed2"
gh secret set VITE_GOOGLE_MAPS_API_KEY --body "AIzaSyYourGoogleMapsApiKey"
gh secret set GEMINI_API_KEY --body "AIzaSyYourGeminiApiKey"
```

---

## 🚀 How the Automated Pipeline Works

1. On every push to `main` or `master` (or pull request), GitHub Actions executes `.github/workflows/deploy.yml`.
2. Environment secrets are injected dynamically during `npm run build` and `npx cap sync android`.
3. The build outputs two artifacts:
   - `bappa-locator-web-dist` (Production Web & PWA bundle)
   - `bappa-locator-android-apk` (Native Android `.apk` package)
