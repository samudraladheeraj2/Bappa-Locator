import fs from 'fs';

async function generate() {
  const res = await fetch('https://bappa-seva.vercel.app/api/pandals');
  const data = await res.json();
  const rawPandals = data.pandals || data;
  console.log('Fetched raw pandals:', rawPandals.length);

  const pandals = rawPandals.map((p, idx) => {
    let area = 'Hyderabad';
    const parts = (p.address || '').split(',');
    if (parts.length > 1) {
      area = parts[1].trim();
    }
    const replaceGanesh = (str) => {
      if (!str) return str;
      return str.replace(/Ganesh/gi, 'Durga Mata').replace(/Vinayak/gi, 'Durga Mata');
    };

    return {
      id: p.id || 'bs_' + idx,
      sourceId: p.id || '',
      name: replaceGanesh(p.name) || 'Durga Mata Pandal',
      committeeName: replaceGanesh(p.organizer_name || p.name) || '',
      organizerName: replaceGanesh(p.organizer_name) || '',
      address: p.address || 'Hyderabad',
      area: area,
      city: 'Hyderabad',
      state: 'Telangana',
      latitude: Number(p.lat) || 17.3850,
      longitude: Number(p.lng) || 78.4867,
      timings: p.timing_text || '6:00 AM - 11:00 PM',
      description: replaceGanesh(p.description) || 'Durga Mata pandal registered via BappaSeva.',
      image: p.image_url || 'https://images.unsplash.com/photo-1567157577867-05ccb1388e66?auto=format&fit=crop&w=800&q=80',
      extraImages: p.extra_image_urls || [],
      contactInfo: p.contact_phone || '',
      ownerInfo: p.user_id || '',
      status: 'approved',
      popular: p.featured || false
    };
  });

  const fileContent = `import { Pandal } from '../types';\n\nexport const PANDALS_DATA: Pandal[] = ${JSON.stringify(pandals, null, 2)};\n`;
  fs.writeFileSync('./src/data/pandals.ts', fileContent, 'utf8');
  console.log('Successfully wrote', pandals.length, 'pandals to ./src/data/pandals.ts');
}

generate().catch(console.error);
