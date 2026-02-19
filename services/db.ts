import {
    collection,
    getDocs,
    doc,
    setDoc,
    deleteDoc,
    updateDoc,
    onSnapshot,
    Unsubscribe,
    QuerySnapshot,
    DocumentData
} from "firebase/firestore";
import { db } from "../firebase";
import { Service, Barber, Appointment } from "../types";
import { INITIAL_SERVICES, INITIAL_BARBERS } from "../constants";

const getShopCollection = (shopId: string, name: string) =>
    collection(db, "shops", shopId, name);

// --- Real-time Subscriptions ---
export const subscribeToServices = (shopId: string, callback: (services: Service[]) => void): Unsubscribe => {
    const servicesCollection = getShopCollection(shopId, "services");
    return onSnapshot(servicesCollection, (snapshot: QuerySnapshot<DocumentData>) => {
        const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
        callback(services);
    });
};

export const subscribeToBarbers = (shopId: string, callback: (barbers: Barber[]) => void): Unsubscribe => {
    const barbersCollection = getShopCollection(shopId, "barbers");
    return onSnapshot(barbersCollection, (snapshot: QuerySnapshot<DocumentData>) => {
        const barbers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));
        callback(barbers);
    });
};

export const subscribeToAppointments = (shopId: string, callback: (appointments: Appointment[]) => void): Unsubscribe => {
    const appointmentsCollection = getShopCollection(shopId, "appointments");
    return onSnapshot(appointmentsCollection, (snapshot: QuerySnapshot<DocumentData>) => {
        const appointments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
        callback(appointments);
    });
};

// --- Services ---
export const getServices = async (shopId: string): Promise<Service[]> => {
    const servicesCollection = getShopCollection(shopId, "services");
    const snapshot = await getDocs(servicesCollection);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Service));
};

export const addService = async (shopId: string, service: Service): Promise<void> => {
    const serviceRef = doc(db, "shops", shopId, "services", service.id);
    await setDoc(serviceRef, service);
};

export const updateService = async (shopId: string, service: Service): Promise<void> => {
    const serviceRef = doc(db, "shops", shopId, "services", service.id);
    await updateDoc(serviceRef, { ...service });
};

// --- Barbers ---
export const getBarbers = async (shopId: string): Promise<Barber[]> => {
    const barbersCollection = getShopCollection(shopId, "barbers");
    const snapshot = await getDocs(barbersCollection);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Barber));
};

export const addBarber = async (shopId: string, barber: Barber): Promise<void> => {
    const barberRef = doc(db, "shops", shopId, "barbers", barber.id);
    await setDoc(barberRef, barber);
};

export const updateBarber = async (shopId: string, barber: Barber): Promise<void> => {
    const barberRef = doc(db, "shops", shopId, "barbers", barber.id);
    await updateDoc(barberRef, { ...barber });
};

export const deleteBarber = async (shopId: string, id: string): Promise<void> => {
    await deleteDoc(doc(db, "shops", shopId, "barbers", id));
};

// --- Appointments ---
export const getAppointments = async (shopId: string): Promise<Appointment[]> => {
    const appointmentsCollection = getShopCollection(shopId, "appointments");
    const snapshot = await getDocs(appointmentsCollection);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
};

export const addAppointment = async (shopId: string, appointment: Appointment): Promise<void> => {
    const apptRef = doc(db, "shops", shopId, "appointments", appointment.id);
    await setDoc(apptRef, appointment);
};

export const updateAppointment = async (shopId: string, appointment: Partial<Appointment> & { id: string }): Promise<void> => {
    const apptRef = doc(db, "shops", shopId, "appointments", appointment.id);
    await updateDoc(apptRef, { ...appointment });
};

export const deleteAppointment = async (shopId: string, id: string): Promise<void> => {
    await deleteDoc(doc(db, "shops", shopId, "appointments", id));
};

// --- Seeding ---
export const seedDatabase = async (shopId: string) => {
    console.log("Seeding database...");

    // Seed Services
    for (const service of INITIAL_SERVICES) {
        await setDoc(doc(db, "shops", shopId, "services", service.id), service);
    }

    // Seed Barbers
    for (const barber of INITIAL_BARBERS) {
        await setDoc(doc(db, "shops", shopId, "barbers", barber.id), barber);
    }

    console.log("Database seeded successfully!");
};

// --- Staff Authentication Tokens ---
/**
 * Generates a secure authentication token for a barber and stores it in Firestore.
 * The token is used for QR code-based auto-login to the Staff Portal.
 */
export const generateBarberToken = async (shopId: string, barberId: string): Promise<string> => {
    // Generate a random secure token
    const randomPart = Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
    const token = `${barberId}:${randomPart}`;

    // Store token in barber document
    const barberRef = doc(db, "shops", shopId, "barbers", barberId);
    await updateDoc(barberRef, { authToken: token });

    return token;
};

/**
 * Validates a staff authentication token and returns the associated barber if valid.
 * Returns null if token is invalid or barber not found.
 */
export const validateStaffToken = async (shopId: string, token: string): Promise<Barber | null> => {
    try {
        // Extract barber ID from token
        const barberId = token.split(':')[0];
        if (!barberId) return null;

        // Get all barbers and find the one with matching token
        const barbers = await getBarbers(shopId);
        const barber = barbers.find(b => b.id === barberId && (b as any).authToken === token);

        return barber || null;
    } catch (error) {
        console.error("Token validation failed:", error);
        return null;
    }
};
