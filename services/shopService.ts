import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  Unsubscribe
} from "firebase/firestore";
import { db } from "../firebase";
import { ShopConfig } from "../types";

const shopsCollection = collection(db, "shops");

const normalizeHost = (host: string) => host.replace(/^www\./, "").toLowerCase();

export const getShopIdFromHost = (host: string): string => {
  const normalized = normalizeHost(host || "");
  if (!normalized || normalized.includes("localhost") || normalized.includes("127.0.0.1")) {
    return "local";
  }
  return normalized;
};

export const getShopConfig = async (shopId: string): Promise<ShopConfig | null> => {
  const shopRef = doc(shopsCollection, shopId);
  const snapshot = await getDoc(shopRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...(snapshot.data() as ShopConfig) };
};

export const subscribeToShopConfig = (
  shopId: string,
  callback: (config: ShopConfig | null) => void
): Unsubscribe => {
  const shopRef = doc(shopsCollection, shopId);
  return onSnapshot(shopRef, (snapshot) => {
    if (!snapshot.exists()) {
      callback(null);
      return;
    }
    callback({ id: snapshot.id, ...(snapshot.data() as ShopConfig) });
  });
};

export const createShopConfig = async (shopId: string, config: ShopConfig): Promise<void> => {
  const shopRef = doc(shopsCollection, shopId);
  await setDoc(shopRef, config);
};

export const updateShopConfig = async (
  shopId: string,
  updates: Partial<ShopConfig>
): Promise<void> => {
  const shopRef = doc(shopsCollection, shopId);
  await updateDoc(shopRef, updates);
};
