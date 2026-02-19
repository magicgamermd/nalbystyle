import { Appointment } from '../types';
import { TIME_SLOTS } from '../constants';
import { getAppointments } from './appointmentService';

/**
 * Checks if a specific time slot is available for a given barber on a specific date.
 */
export const isSlotAvailable = (
    time: string,
    dateToCheck: string,
    barberId: string,
    appointments: Appointment[]
): boolean => {
    if (!dateToCheck || !barberId) return true;

    const targetDate = new Date(`${dateToCheck}T${time}`);

    const conflict = appointments.some(apt => {
        if (apt.barberId !== barberId || apt.status === 'cancelled') return false;
        const aptDate = new Date(apt.date);

        const sameDay =
            aptDate.getDate() === targetDate.getDate() &&
            aptDate.getMonth() === targetDate.getMonth() &&
            aptDate.getFullYear() === targetDate.getFullYear();

        if (!sameDay) return false;

        return aptDate.getHours() === targetDate.getHours() &&
            aptDate.getMinutes() === targetDate.getMinutes();
    });

    return !conflict;
};

/**
 * Finds the earliest available date and time.
 * If barberId is provided, checks only that barber.
 * If no barberId, checks ALL barbers and returns the absolute earliest slot found.
 */
export const findNextAvailableSlot = (
    appointments: Appointment[],
    barbers: { id: string }[],
    barberId?: string,
    startDate: Date = new Date()
): { date: string; time: string; barberId: string } | null => {

    // If a specific barber is requested, check only them
    if (barberId) {
        return findSlotForBarber(barberId, appointments, startDate);
    }

    // Otherwise find the earliest slot across ALL barbers
    let earliestSlot: { date: string; time: string; barberId: string } | null = null;

    for (const barber of barbers) {
        const slot = findSlotForBarber(barber.id, appointments, startDate);
        if (slot) {
            // If this is the first slot found, or it's earlier than the current earliest
            if (!earliestSlot ||
                new Date(`${slot.date}T${slot.time}`) < new Date(`${earliestSlot.date}T${earliestSlot.time}`)) {
                earliestSlot = slot;
            }
        }
    }

    return earliestSlot;
};

// Helper: Find earliest slot for a single barber
const findSlotForBarber = (
    barberId: string,
    appointments: Appointment[],
    startDate: Date
): { date: string; time: string; barberId: string } | null => {
    // Get current time in Sofia
    const now = new Date();
    // Use en-CA to get YYYY-MM-DD format directly with generic locale
    const currentDayStr = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
    const currentHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Sofia', hour: 'numeric', hour12: false }));

    for (let i = 0; i < 30; i++) {
        // Calculate the next date respecting the timezone
        const nextDate = new Date(startDate);
        nextDate.setDate(startDate.getDate() + i);

        // Convert the iteration date to Sofia YYYY-MM-DD string
        const dateStr = nextDate.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });

        for (const slot of TIME_SLOTS) {
            // Skip past slots if checking today (in Sofia time)
            if (dateStr === currentDayStr) {
                const [slotHour] = slot.split(':').map(Number);
                if (slotHour <= currentHour) continue;
            }

            if (isSlotAvailable(slot, dateStr, barberId, appointments)) {
                return { date: dateStr, time: slot, barberId };
            }
        }
    }
    return null;
};

/**
 * Gets all free slots for a specific date and barber.
 */
export const getFreeSlots = (
    date: string,
    barberId: string,
    appointments: Appointment[]
): string[] => {
    return TIME_SLOTS.filter(slot => isSlotAvailable(slot, date, barberId, appointments));
};

/**
 * Loads appointments from Firestore for a specific date range
 */
export const loadAppointmentsForDateRange = async (
    shopId: string,
    barberId: string,
    date: string
): Promise<Appointment[]> => {
    const targetDate = new Date(date);
    const startDate = new Date(targetDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(targetDate);
    endDate.setHours(23, 59, 59, 999);

    return await getAppointments(shopId, barberId, startDate, endDate);
};

