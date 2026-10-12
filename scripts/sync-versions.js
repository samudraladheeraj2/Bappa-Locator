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
      `applicationId "com.bappalocator.app.v2"`
    );
    gradleContent = gradleContent.replace(
      /namespace\s+["'][^"']+["']/,
      `namespace "com.bappalocator.app.v2"`
    );
    fs.writeFileSync(gradlePath, gradleContent);
    console.log(`[SyncVersions] Updated android/app/build.gradle (versionCode: ${versionCode}, versionName: "${version}", appId & namespace: com.bappalocator.app.v2)`);
  }

  // 5. Ensure capacitor.config.ts has consistent appId
  const capConfigPath = path.join(rootDir, 'capacitor.config.ts');
  if (fs.existsSync(capConfigPath)) {
    let capContent = fs.readFileSync(capConfigPath, 'utf8');
    if (!capContent.includes("appId: 'com.bappalocator.app.v2'")) {
      capContent = capContent.replace(/appId:\s*['"][^'"]+['']/, "appId: 'com.bappalocator.app.v2'");
      fs.writeFileSync(capConfigPath, capContent);
      console.log(`[SyncVersions] Verified capacitor.config.ts appId -> com.bappalocator.app.v2`);
    }
  }

  console.log('[SyncVersions] All versions and package attributes synchronized successfully!');
}

syncVersions();
