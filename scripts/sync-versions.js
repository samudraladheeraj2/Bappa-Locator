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
  const version = versionData.latestVersion || '1.2.6';
  const versionCode = versionData.versionCode || 10;

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
  }

  // 4. Sync android/app/build.gradle
  const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(gradlePath)) {
    let gradleContent = fs.readFileSync(gradlePath, 'utf8');
    gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    gradleContent = gradleContent.replace(/versionName\s+["'][^"']+["']/, `versionName "${version}"`);
    gradleContent = gradleContent.replace(
      /applicationId\s+["'][^"']+["']/,
      `applicationId "com.pandalhopper.app"`
    );
    // Replace any namespace variation to strictly match applicationId and Java package
    gradleContent = gradleContent.replace(
      /namespace\s*(=)?\s*["'][^"']+["']/g,
      `namespace = "com.pandalhopper.app"`
    );
    fs.writeFileSync(gradlePath, gradleContent);
    console.log(`[SyncVersions] Updated android/app/build.gradle`);
  }

  // 5. Ensure capacitor.config.ts has consistent appId & appName
  const capConfigPath = path.join(rootDir, 'capacitor.config.ts');
  if (fs.existsSync(capConfigPath)) {
    let capContent = fs.readFileSync(capConfigPath, 'utf8');
    capContent = capContent.replace(/appId:\s*['"][^'"]+['']/, "appId: 'com.pandalhopper.app'");
    capContent = capContent.replace(/appName:\s*['"][^'"]+['']/, "appName: 'Pandal Hopper'");
    fs.writeFileSync(capConfigPath, capContent);
  }

  // 6. Ensure Android resource files exist and are correct
  const resValuesDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values');
  const resXmlDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'xml');
  const resDrawableDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'drawable');

  fs.mkdirSync(resValuesDir, { recursive: true });
  fs.mkdirSync(resXmlDir, { recursive: true });
  fs.mkdirSync(resDrawableDir, { recursive: true });

  const stringsXmlPath = path.join(resValuesDir, 'strings.xml');
  fs.writeFileSync(stringsXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Pandal Hopper</string>
    <string name="title_activity_main">Pandal Hopper</string>
    <string name="package_name">com.pandalhopper.app</string>
    <string name="custom_url_scheme">com.pandalhopper.app</string>
</resources>`);

  const stylesXmlPath = path.join(resValuesDir, 'styles.xml');
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
        <item name="android:background">@drawable/splash</item>
        <item name="android:windowBackground">@drawable/splash</item>
    </style>
</resources>`);

  const colorsXmlPath = path.join(resValuesDir, 'colors.xml');
  fs.writeFileSync(colorsXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="colorPrimary">#78350f</color>
    <color name="colorPrimaryDark">#451a03</color>
    <color name="colorAccent">#d97706</color>
</resources>`);

  const filePathsXmlPath = path.join(resXmlDir, 'file_paths.xml');
  fs.writeFileSync(filePathsXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="external_files" path="." />
    <external-files-path name="external_file_path" path="." />
    <files-path name="internal_file_path" path="." />
    <cache-path name="internal_cache_path" path="." />
    <external-cache-path name="external_cache_path" path="." />
</paths>`);

  // Remove duplicate splash.xml if splash.png already exists
  const splashXmlPath = path.join(resDrawableDir, 'splash.xml');
  const splashPngPath = path.join(resDrawableDir, 'splash.png');
  if (fs.existsSync(splashPngPath) && fs.existsSync(splashXmlPath)) {
    fs.unlinkSync(splashXmlPath);
  }

  // 7. Ensure MainActivity.java exists ONLY in primary package com.pandalhopper.app
  const primaryActivityDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'pandalhopper', 'app');
  fs.mkdirSync(primaryActivityDir, { recursive: true });
  fs.writeFileSync(path.join(primaryActivityDir, 'MainActivity.java'), `package com.pandalhopper.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
`);

  // Strictly clean up any obsolete legacy bappalocator directory to prevent class collisions
  const legacyDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'java', 'com', 'bappalocator');
  if (fs.existsSync(legacyDir)) {
    fs.rmSync(legacyDir, { recursive: true, force: true });
    console.log(`[SyncVersions] Purged legacy com/bappalocator directory`);
  }

  // 8. Ensure AndroidManifest.xml has NO deprecated package attribute and has correct activity name
  const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    // Remove deprecated package attribute from manifest root tag
    manifestContent = manifestContent.replace(/\s+package\s*=\s*["'][^"']+["']/g, '');
    // Ensure fully qualified MainActivity name
    manifestContent = manifestContent.replace(/android:name\s*=\s*["']\.MainActivity["']/g, 'android:name="com.pandalhopper.app.MainActivity"');
    // Ensure usesCleartextTraffic="true"
    if (!manifestContent.includes('android:usesCleartextTraffic')) {
      manifestContent = manifestContent.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
    }
    fs.writeFileSync(manifestPath, manifestContent);
    console.log(`[SyncVersions] Updated AndroidManifest.xml successfully`);
  }

  console.log('[SyncVersions] All versions and package attributes synchronized successfully!');
}

syncVersions();
