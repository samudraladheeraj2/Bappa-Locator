import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function syncVersions() {
  const versionJsonPath = path.join(rootDir, 'version.json');
  if (!fs.existsSync(versionJsonPath)) {
    console.error('Error: version.json not found at project root.');
    process.exit(1);
  }

  const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
  const version = versionData.latestVersion || '1.2.5';
  const versionCode = versionData.versionCode || 9;

  console.log(`[SyncVersions] Syncing project to version: ${version} (versionCode: ${versionCode})...`);

  // 1. Sync package.json
  const packageJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (pkg.version !== version) {
      pkg.version = version;
      fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`[SyncVersions] Updated package.json version -> ${version}`);
    }
  }

  // 2. Sync public/version.json
  const publicVersionPath = path.join(rootDir, 'public', 'version.json');
  fs.mkdirSync(path.dirname(publicVersionPath), { recursive: true });
  fs.writeFileSync(publicVersionPath, JSON.stringify(versionData, null, 2) + '\n');
  console.log(`[SyncVersions] Updated public/version.json to match version.json`);

  // 3. Sync src/utils/versionCheck.ts
  const versionCheckPath = path.join(rootDir, 'src', 'utils', 'versionCheck.ts');
  if (fs.existsSync(versionCheckPath)) {
    let content = fs.readFileSync(versionCheckPath, 'utf8');
    content = content.replace(
      /export const CURRENT_APP_VERSION = ['"][^'"]+['"];/,
      `export const CURRENT_APP_VERSION = '${version}';`
    );
    content = content.replace(
      /export const CURRENT_VERSION_CODE = \d+;/,
      `export const CURRENT_VERSION_CODE = ${versionCode};`
    );
    fs.writeFileSync(versionCheckPath, content);
    console.log(`[SyncVersions] Updated src/utils/versionCheck.ts (CURRENT_APP_VERSION: ${version}, CURRENT_VERSION_CODE: ${versionCode})`);
  }

  // 4. Sync android/app/build.gradle
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradleContent = fs.readFileSync(gradlePath, 'utf8');
    gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    gradleContent = gradleContent.replace(/versionName\s+["'][^"']+["']/, `versionName "${version}"`);
    // Ensure consistent applicationId and namespace
    gradleContent = gradleContent.replace(
      /applicationId\s+["'][^"']+["']/,
      `applicationId "com.pandalhopper.app"`
    );
    gradleContent = gradleContent.replace(
      /namespace\s+["'][^"']+["']/,
      `namespace "com.pandalhopper.app"`
    );
    fs.writeFileSync(gradlePath, gradleContent);
    console.log(`[SyncVersions] Updated android/app/build.gradle (versionCode: ${versionCode}, versionName: "${version}", appId & namespace: com.pandalhopper.app)`);
  }

  // 5. Ensure capacitor.config.ts has consistent appId
  const capConfigPath = path.join(rootDir, 'capacitor.config.ts');
  if (fs.existsSync(capConfigPath)) {
    let capContent = fs.readFileSync(capConfigPath, 'utf8');
    if (!capContent.includes("appId: 'com.pandalhopper.app'")) {
      capContent = capContent.replace(/appId:\s*['"][^'"]+['']/, "appId: 'com.pandalhopper.app'");
      fs.writeFileSync(capConfigPath, capContent);
      console.log(`[SyncVersions] Verified capacitor.config.ts appId -> com.pandalhopper.app`);
    }
  }

  // 6. Ensure Android resource files exist and are complete (prevent AAPT resource linking errors in CI)
  const resValuesDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values');
  const resXmlDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'xml');
  fs.mkdirSync(resValuesDir, { recursive: true });
  fs.mkdirSync(resXmlDir, { recursive: true });

  const stringsXmlPath = path.join(resValuesDir, 'strings.xml');
  if (!fs.existsSync(stringsXmlPath)) {
    fs.writeFileSync(stringsXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Pandal Hopper</string>
    <string name="title_activity_main">Pandal Hopper</string>
    <string name="package_name">com.pandalhopper.app</string>
    <string name="custom_url_scheme">com.pandalhopper.app</string>
</resources>
`);
    console.log(`[SyncVersions] Created missing android/app/src/main/res/values/strings.xml`);
  }

  const stylesXmlPath = path.join(resValuesDir, 'styles.xml');
  if (!fs.existsSync(stylesXmlPath)) {
    fs.writeFileSync(stylesXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
        <item name="windowNoTitle">true</item>
        <item name="windowActionBar">false</item>
        <item name="android:windowBackground">@color/colorPrimary</item>
    </style>
    <style name="AppTheme.NoActionBarLaunch" parent="AppTheme.NoActionBar">
        <item name="android:windowBackground">@drawable/splash</item>
    </style>
</resources>
`);
    console.log(`[SyncVersions] Created missing android/app/src/main/res/values/styles.xml`);
  }

  const colorsXmlPath = path.join(resValuesDir, 'colors.xml');
  if (!fs.existsSync(colorsXmlPath)) {
    fs.writeFileSync(colorsXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#78350f</color>
    <color name="colorPrimaryDark">#451a03</color>
    <color name="colorAccent">#d97706</color>
</resources>
`);
    console.log(`[SyncVersions] Created missing android/app/src/main/res/values/colors.xml`);
  }

  const filePathsXmlPath = path.join(resXmlDir, 'file_paths.xml');
  if (!fs.existsSync(filePathsXmlPath)) {
    fs.writeFileSync(filePathsXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="external_files" path="." />
    <external-files-path name="external_file_path" path="." />
    <files-path name="internal_file_path" path="." />
    <cache-path name="internal_cache_path" path="." />
    <external-cache-path name="external_cache_path" path="." />
</paths>
`);
    console.log(`[SyncVersions] Created missing android/app/src/main/res/xml/file_paths.xml`);
  }

  // 7. Ensure MainActivity.java exists
  const mainActivityDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'pandalhopper', 'app');
  fs.mkdirSync(mainActivityDir, { recursive: true });
  const mainActivityPath = path.join(mainActivityDir, 'MainActivity.java');
  if (!fs.existsSync(mainActivityPath)) {
    fs.writeFileSync(mainActivityPath, `package com.pandalhopper.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
`);
    console.log(`[SyncVersions] Created missing android/app/src/main/java/com/pandalhopper/app/MainActivity.java`);
  }

  console.log('[SyncVersions] All versions and package attributes synchronized successfully!');
}

syncVersions();
