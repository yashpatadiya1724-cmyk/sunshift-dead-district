import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const zipFile = path.join(projectRoot, 'dist', 'sunshift-dead-district.zip');
const rootZip = path.join(projectRoot, 'sunshift-dead-district-itch.zip');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory does not exist. Run vite build first.');
  process.exit(1);
}

// Remove old zips if they exist
[zipFile, rootZip].forEach(file => {
  if (fs.existsSync(file)) {
    try { fs.unlinkSync(file); } catch {}
  }
});

console.log('📦 Packaging dist folder into itch.io ZIP archive...');

let success = false;

// Method 1: Try tar -a -cf (built into Windows 10/11, macOS, BSD, Linux)
try {
  execSync(`tar -a -cf "${rootZip}" -C "${distDir}" .`, { stdio: 'ignore' });
  if (fs.existsSync(rootZip) && fs.statSync(rootZip).size > 0) {
    fs.copyFileSync(rootZip, zipFile);
    success = true;
  }
} catch (e1) {}

// Method 2: Try PowerShell Compress-Archive on Windows
if (!success && process.platform === 'win32') {
  try {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${rootZip}' -Force"`, { stdio: 'ignore' });
    if (fs.existsSync(rootZip) && fs.statSync(rootZip).size > 0) {
      fs.copyFileSync(rootZip, zipFile);
      success = true;
    }
  } catch (e2) {}
}

// Method 3: Try zip command on Unix
if (!success) {
  try {
    execSync(`cd "${distDir}" && zip -q -r "${rootZip}" .`, { stdio: 'ignore' });
    if (fs.existsSync(rootZip) && fs.statSync(rootZip).size > 0) {
      fs.copyFileSync(rootZip, zipFile);
      success = true;
    }
  } catch (e3) {}
}

if (success && fs.existsSync(rootZip)) {
  const stats = fs.statSync(rootZip);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Successfully produced itch.io ZIP:`);
  console.log(`   -> ${rootZip} (${sizeMB} MB)`);
  console.log(`   -> ${zipFile}`);
} else {
  console.error('❌ Failed to produce zip archive.');
  process.exit(1);
}
