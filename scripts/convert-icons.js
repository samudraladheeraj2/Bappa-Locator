import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function convert() {
  const source = 'public/app-icon.jpg';
  if (!fs.existsSync(source)) {
    console.error('Source app-icon.jpg not found!');
    process.exit(1);
  }

  console.log('Converting app-icon.jpg to PNG...');
  
  // Convert and resize to PWA standards
  await sharp(source).resize(512, 512).png().toFile('public/app-icon.png');
  await sharp(source).resize(192, 192).png().toFile('public/pwa-192x192.png');
  await sharp(source).resize(512, 512).png().toFile('public/pwa-512x512.png');
  await sharp(source).resize(512, 512).png().toFile('public/pwa-maskable-512x512.png');
  await sharp(source).resize(180, 180).png().toFile('public/apple-touch-icon.png');
  await sharp(source).resize(512, 512).png().toFile('public/icon.png');
  
  console.log('Icons converted successfully to true PNG formats!');
}

convert().catch(err => {
  console.error('Error converting:', err);
  process.exit(1);
});
