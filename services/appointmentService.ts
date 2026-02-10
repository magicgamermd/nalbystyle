import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    Timestamp,
    orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Appointment } from '../types';

/**
 * Firestore operations for appointments
 */

const getAppointmentsCollection = (shopId: string) =>
    collection(db, 'shops', shopId, 'appointments');

/**
 * Create a new appointment in Firestore
 */
export const createAppointment = async (shopId: string, appointment: Omit<Appointment, 'id'>): Promise<Appointment> => {
    try {
        const docRef = await addDoc(getAppointmentsCollection(shopId), {
            ...appointment,
            createdAt: Timestamp.now()
        });

        return {
            id: docRef.id,
            ...appointment
        };
    } catch (error) {
        console.error('Error creating appointment:', error);
        throw new Error('Неуспешно записване на час');
    }
};

/**
 * Get all appointments for a specific barber and date range
 */
export const getAppointments = async (
    shopId: string,
    barberId?: string,
    startDate?: Date,
    endDate?: Date
): Promise<Appointment[]> => {
    try {
        let q = query(getAppointmentsCollection(shopId));

        // Filter by barber if provided
        if (barberId) {
            q = query(q, where('barberId', '==', barberId));
        }

        // Filter by date range if provided
        if (startDate) {
            q = query(q, where('date', '>=', startDate.toISOString()));
        }
        if (endDate) {
            q = query(q, where('date', '<=', endDate.toISOString()));
        }

        // Order by date
        q = query(q, orderBy('date', 'asc'));

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Appointment));
    } catch (error) {
        console.error('Error getting appointments:', error);
        throw new Error('Неуспешно зареждане на часове');
    }
};

/**
 * Get appointments for a specific customer (by phone OR name)
 * Supports fuzzy name matching (case-insensitive contains)
 */
export const getCustomerAppointments = async (
    shopId: string,
    phoneOrName: string
): Promise<Appointment[]> => {
    try {
        // First try to search by phone (exact match after normalization)
        let normalizedPhone = phoneOrName.replace(/\D/g, '');
        if (normalizedPhone.startsWith('0')) normalizedPhone = '359' + normalizedPhone.substring(1);
        if (!normalizedPhone.startsWith('359') && normalizedPhone.length > 5) normalizedPhone = '359' + normalizedPhone;
        const phoneToSearch = normalizedPhone.length >= 9 ? `+${normalizedPhone}` : null;

        console.log(`[AppointmentService] Searching for: "${phoneOrName}" (normalized phone: ${phoneToSearch})`);

        // Get ALL recent appointments and filter locally (Firestore doesn't support OR queries well)
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const q = query(
            getAppointmentsCollection(shopId),
            where('date', '>=', weekAgo.toISOString()),
            orderBy('date', 'asc')
        );

        const snapshot = await getDocs(q);
        const searchTermLower = phoneOrName.toLowerCase();

        const matches = snapshot.docs
            .map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Appointment))
            .filter(apt => {
                // Only consider non-cancelled future appointments
                const aptDate = new Date(apt.date);
                if (aptDate < weekAgo || apt.status === 'cancelled') return false;

                // Match by phone (exact)
                if (phoneToSearch && apt.customerEmail === phoneToSearch) {
                    console.log(`[AppointmentService] Phone match: ${apt.id}`);
                    return true;
                }

                // Match by name (contains, case-insensitive)
                if (apt.customerName && apt.customerName.toLowerCase().includes(searchTermLower)) {
                    console.log(`[AppointmentService] Name match: ${apt.id} (${apt.customerName})`);
                    return true;
                }

                return false;
            });

        console.log(`[AppointmentService] Found ${matches.length} matching appointments`);
        return matches;
    } catch (error) {
        console.error('Error getting customer appointments:', error);
        throw new Error('Неуспешно зареждане на вашите часове');
    }
};

/**
 * Update an existing appointment
 */
export const updateAppointment = async (
    shopId: string,
    appointmentId: string,
    updates: Partial<Appointment>
): Promise<void> => {
    try {
        const appointmentRef = doc(db, 'shops', shopId, 'appointments', appointmentId);
        await updateDoc(appointmentRef, {
            ...updates,
            updatedAt: Timestamp.now()
        });
    } catch (error) {
        console.error('Error updating appointment:', error);
        throw new Error('Неуспешна промяна на час');
    }
};

/**
 * Cancel an appointment
 */
export const cancelAppointment = async (shopId: string, appointmentId: string): Promise<void> => {
    try {
        await updateAppointment(shopId, appointmentId, { status: 'cancelled' });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        throw new Error('Неуспешно отказване на час');
    }
};

/**
 * Reschedule an appointment to a new date and time
 */
export const rescheduleAppointment = async (
    shopId: string,
    appointmentId: string,
    newDate: string,
    newTime: string
): Promise<void> => {
    try {
        const dateTime = new Date(`${newDate}T${newTime}`);
        await updateAppointment(shopId, appointmentId, {
            date: dateTime.toISOString()
        });
    } catch (error) {
        console.error('Error rescheduling appointment:', error);
        throw new Error('Неуспешно преместване на час');
    }
};

/**
 * Delete an appointment (hard delete)
 */
export const deleteAppointment = async (shopId: string, appointmentId: string): Promise<void> => {
    try {
        const appointmentRef = doc(db, 'shops', shopId, 'appointments', appointmentId);
        await deleteDoc(appointmentRef);
    } catch (error) {
        console.error('Error deleting appointment:', error);
        throw new Error('Неуспешно изтриване на час');
    }
};
