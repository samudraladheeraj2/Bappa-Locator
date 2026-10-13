import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { syncHashPin } from '../src/utils/crypto.js';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function createTestUser() {
  const mobile = '1111111111';
  const pinHash = syncHashPin('0796');
  await setDoc(doc(db, 'users', mobile), {
    mobile: mobile,
    pinHash: pinHash,
    role: 'user',
    isAdmin: false,
    displayName: 'Test User (1111111111)',
    createdAt: new Date().toISOString(),
  });
  console.log('Test user created successfully!');
}
createTestUser().catch(console.error);
