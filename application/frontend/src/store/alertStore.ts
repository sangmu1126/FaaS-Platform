import { create } from 'zustand';

export interface Alert {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
}

interface AlertState {
    alerts: Alert[];
    toasts: Alert[];
    addAlert: (alert: Omit<Alert, 'id' | 'timestamp' | 'read'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    removeToast: (id: string) => void;
    clearAlerts: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
    alerts: [],
    toasts: [],

    addAlert: (alert) => {
        const newAlert: Alert = {
            ...alert,
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
            read: false,
        };

        set((state) => ({
            alerts: [newAlert, ...state.alerts].slice(0, 50), // Keep last 50 alerts
            toasts: [...state.toasts, newAlert],
        }));

        // Auto-remove toast after 5 seconds
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((t) => t.id !== newAlert.id),
            }));
        }, 5000);
    },

    markAsRead: (id) => {
        set((state) => ({
            alerts: state.alerts.map((a) =>
                a.id === id ? { ...a, read: true } : a
            ),
        }));
    },

    markAllAsRead: () => {
        set((state) => ({
            alerts: state.alerts.map((a) => ({ ...a, read: true })),
        }));
    },

    removeToast: (id) => {
        set((state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
        }));
    },

    clearAlerts: () => {
        set({ alerts: [] });
    },
}));
