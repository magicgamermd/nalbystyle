import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

type MigrationResult = {
  services: number;
  barbers: number;
  appointments: number;
};

const legacyCollections = ['services', 'barbers', 'appointments'] as const;

export const migrateLegacyShopData = async (shopId: string): Promise<MigrationResult> => {
  const result: MigrationResult = { services: 0, barbers: 0, appointments: 0 };

  for (const name of legacyCollections) {
    const legacyCol = collection(db, name);
    const snapshot = await getDocs(legacyCol);

    for (const legacyDoc of snapshot.docs) {
      const targetRef = doc(db, 'shops', shopId, name, legacyDoc.id);
      const targetSnap = await getDoc(targetRef);
      if (!targetSnap.exists()) {
        await setDoc(targetRef, legacyDoc.data());
        result[name] += 1;
      }
    }
  }

  return result;
};
