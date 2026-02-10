import { db } from '../firebase';
import { collection, doc, setDoc, updateDoc, getDocs, getDoc, deleteDoc, orderBy, query, limit, Timestamp, arrayUnion, increment } from 'firebase/firestore';

// Types for conversation logging
export interface ConversationEvent {
    type: 'user_speech' | 'agent_response' | 'tool_call' | 'system';
    content: string;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface ConversationLog {
    id: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    outcome: 'active' | 'completed' | 'abandoned' | 'error';
    events: ConversationEvent[];
    toolCalls: number;
    bookingCreated: boolean;
    appointmentId?: string;
}

const getConversationLogsCollection = (shopId: string) =>
    collection(db, 'shops', shopId, 'conversationLogs');

/**
 * Start a new conversation log
 */
export const startConversationLog = async (shopId: string): Promise<string> => {
    const logId = `conv_${Date.now()}`;
    const logData: ConversationLog = {
        id: logId,
        startTime: Date.now(),
        outcome: 'active',
        events: [],
        toolCalls: 0,
        bookingCreated: false
    };

    await setDoc(doc(getConversationLogsCollection(shopId), logId), logData);
    console.log('[ConversationLog] Started new log:', logId);
    return logId;
};

/**
 * Add an event to the conversation log (atomic, fire-and-forget safe)
 */
export const addConversationEvent = async (
    shopId: string,
    logId: string,
    event: Omit<ConversationEvent, 'timestamp'>
): Promise<void> => {
    try {
        const logRef = doc(getConversationLogsCollection(shopId), logId);
        const eventWithTime: ConversationEvent = {
            ...event,
            timestamp: Date.now()
        };

        // Use arrayUnion for atomic append (no race conditions)
        const update: Record<string, any> = {
            events: arrayUnion(eventWithTime)
        };

        // Increment tool call counter atomically if this is a tool call
        if (event.type === 'tool_call') {
            update.toolCalls = increment(1);
        }

        await updateDoc(logRef, update);
    } catch (error) {
        console.error('[ConversationLog] Error adding event:', error);
    }
};

/**
 * End the conversation log
 */
export const endConversationLog = async (
    shopId: string,
    logId: string,
    outcome: 'completed' | 'abandoned' | 'error',
    bookingCreated: boolean = false,
    appointmentId?: string,
    startTime?: number
): Promise<void> => {
    try {
        const logRef = doc(getConversationLogsCollection(shopId), logId);
        const endTime = Date.now();

        // If startTime not provided, fetch it
        let duration: number | undefined;
        if (startTime) {
            duration = Math.round((endTime - startTime) / 1000);
        } else {
            const logSnap = await getDoc(logRef);
            if (logSnap.exists()) {
                const logData = logSnap.data() as ConversationLog;
                duration = Math.round((endTime - logData.startTime) / 1000);
            }
        }

        await updateDoc(logRef, {
            endTime,
            ...(duration !== undefined && { duration }),
            outcome,
            bookingCreated,
            ...(appointmentId && { appointmentId })
        });
        console.log('[ConversationLog] Ended log:', logId, outcome, duration ? `${duration}s` : '');
    } catch (error) {
        console.error('[ConversationLog] Error ending log:', error);
    }
};

/**
 * Get recent conversation logs for admin dashboard
 */
export const getConversationLogs = async (shopId: string, limitCount: number = 50): Promise<ConversationLog[]> => {
    try {
        const q = query(
            getConversationLogsCollection(shopId),
            orderBy('startTime', 'desc'),
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data() as ConversationLog);
    } catch (error) {
        console.error('[ConversationLog] Error getting logs:', error);
        return [];
    }
};

/**
 * Delete a conversation log
 */
export const deleteConversationLog = async (shopId: string, logId: string): Promise<void> => {
    try {
        const logRef = doc(getConversationLogsCollection(shopId), logId);
        await deleteDoc(logRef);
        console.log('[ConversationLog] Deleted log:', logId);
    } catch (error) {
        console.error('[ConversationLog] Error deleting log:', error);
        throw new Error('Неуспешно изтриване на разговор');
    }
};
