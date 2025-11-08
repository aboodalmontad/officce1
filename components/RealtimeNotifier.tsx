import * as React from 'react';
import { XMarkIcon, ClockIcon, ArrowPathIcon, DocumentTextIcon } from './icons';
import { Appointment } from '../types';

// Export RealtimeAlert for use in App.tsx
export interface RealtimeAlert {
    id: number;
    message: string;
    type?: 'sync';
}

// Sound for appointment notifications, moved from deprecated AppointmentNotifier
const soundBase64 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI9pEAnABpALFAAAAAAD/8BwATGF2ZjU2LjQwLjEwMQAAAAAAAAAAAABDcmVhdGVkIHdpdGggRmZkcCUyMEdhcGJhbmQgZm9yIFdpbmRvd3MAQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUBwEwATGF2ZjYwLjE0LjEwMAAAAAAAAAAAAAAARXZDAAAAAHwECAQAAAAAAAAAD/8CEAADDYhUa/7M5sDC/8k//8AAG5pbnRoZXJlem8AAAAAAAAAAEBsZWRpdGVkIHdpdGggVmlkZW9TaG9wIDIuMC4yLjU2NgAAAAAAAAAAAAAAAP/E0IABYIAANIAAAAABkAAANoAAAcSAAAA//wAAAAB+AACgAAAAAAAAAAAP/E0P/////////8E0QMP//////8E0QcP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QQMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QQMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP//////8E0QMP......';

type NotificationType = {
    id: string | number;
    title: string;
    message: string;
    type: 'appointment' | 'sync';
    duration?: number;
};

const NotificationToast: React.FC<{
    notification: NotificationType;
    onDismiss: () => void;
}> = ({ notification, onDismiss }) => {
    const [isVisible, setIsVisible] = React.useState(false);
    const timerRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        // Enter animation
        requestAnimationFrame(() => setIsVisible(true));

        // Auto-dismiss logic
        const duration = notification.duration || 7000;
        const timeoutId = window.setTimeout(() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300); // Wait for exit animation
        }, duration);

        timerRef.current = timeoutId;

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [notification, onDismiss]);
    
    const handleManualDismiss = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsVisible(false);
        setTimeout(onDismiss, 300);
    };

    const getIcon = () => {
        switch (notification.type) {
            case 'appointment': return <ClockIcon className="w-6 h-6 text-blue-500" />;
            case 'sync': return <ArrowPathIcon className="w-6 h-6 text-green-500" />;
            default: return null;
        }
    };
    
    return (
        <div
            className={`w-full max-w-sm bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden transition-all duration-300 ease-in-out transform ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}
        >
            <div className="p-4">
                <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                        {getIcon()}
                    </div>
                    <div className="ms-3 w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                        <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
                    </div>
                    <div className="ms-4 flex-shrink-0 flex">
                        <button
                            onClick={handleManualDismiss}
                            className="inline-flex text-gray-400 bg-white rounded-md hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            <span className="sr-only">Close</span>
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


interface NotificationCenterProps {
    appointmentAlerts: Appointment[];
    realtimeAlerts: RealtimeAlert[];
    dismissAppointmentAlert: (appointmentId: string) => void;
    dismissRealtimeAlert: (alertId: number) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ appointmentAlerts, realtimeAlerts, dismissAppointmentAlert, dismissRealtimeAlert }) => {
    const audioRef = React.useRef<HTMLAudioElement | null>(null);

    React.useEffect(() => {
        if (appointmentAlerts.length > 0) {
            audioRef.current?.play().catch(e => console.error("Audio playback failed:", e));
        }
    }, [appointmentAlerts]);

    const formatTime = (time: string) => {
        if (!time) return '';
        let [hours, minutes] = time.split(':');
        let hh = parseInt(hours, 10);
        const ampm = hh >= 12 ? 'مساءً' : 'صباحًا';
        hh = hh % 12;
        hh = hh ? hh : 12; 
        const finalHours = hh.toString().padStart(2, '0');
        return `${finalHours}:${minutes} ${ampm}`;
    };

    const allNotifications: NotificationType[] = React.useMemo(() => {
        const appointments: NotificationType[] = appointmentAlerts.map(alert => ({
            id: alert.id,
            type: 'appointment',
            title: 'تذكير بالموعد',
            message: `${alert.title} - الساعة ${formatTime(alert.time)}`,
            duration: 10000 
        }));
        const realtime: NotificationType[] = realtimeAlerts.map(alert => ({
            id: alert.id,
            type: 'sync',
            title: 'تحديث مباشر',
            message: alert.message,
            duration: 5000
        }));
        
        return [...appointments, ...realtime].sort((a,b) => {
            // Sort by ID, assuming IDs are timestamps or sequential.
            // Higher ID is newer.
            const idA = typeof a.id === 'string' ? (parseInt(a.id.replace(/\D/g, '')) || 0) : a.id;
            const idB = typeof b.id === 'string' ? (parseInt(b.id.replace(/\D/g, '')) || 0) : b.id;
            return idB - idA;
        });
    }, [appointmentAlerts, realtimeAlerts]);
    
    const handleDismiss = (id: string | number, type: 'appointment' | 'sync') => {
        if (type === 'appointment') {
            dismissAppointmentAlert(id as string);
        } else {
            dismissRealtimeAlert(id as number);
        }
    };
    
    return (
        <div aria-live="assertive" className="fixed inset-0 flex items-start px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-[100]">
            <div className="w-full flex flex-col items-center space-y-3 sm:items-end">
                <audio ref={audioRef} src={soundBase64} preload="auto" />
                {allNotifications.map(notification => (
                    <NotificationToast
                        key={notification.id}
                        notification={notification}
                        onDismiss={() => handleDismiss(notification.id, notification.type)}
                    />
                ))}
            </div>
        </div>
    );
};

export default NotificationCenter;