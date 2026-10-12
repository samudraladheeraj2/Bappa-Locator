import fs from 'fs';
import { PANDALS_DATA } from './src/data/pandals.ts';

const cleanData = PANDALS_DATA.map(p => ({
    ...p,
    name: p.name.replace(/Ganesh/gi, 'Durga Mata').replace(/Vinayak/gi, 'Durga Mata'),
    description: p.description.replace(/Ganesh/gi, 'Durga Mata').replace(/Vinayak/gi, 'Durga Mata')
}));

const fileContent = `import { Pandal } from '../types';\n\nexport const PANDALS_DATA: Pandal[] = ${JSON.stringify(cleanData, null, 2)};\n`;
fs.writeFileSync('./src/data/pandals.ts', fileContent, 'utf8');
console.log('Cleaned pandals data');
