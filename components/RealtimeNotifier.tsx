import * as React from 'react';
import { XMarkIcon, ClockIcon, UserGroupIcon } from './icons';
import { Appointment, Profile } from '../types';

// Sound for standard appointment notifications
const appointmentSoundBase64 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI9pEAnABpALFAAAAAAD/8BwATGF2ZjU2LjQwLjEwMQAAAAAAAAAAAABDcmVhdGVkIHdpdGggRmZkcCUyMEdhcGJhbmQgZm9yIFdpbmRvd3MAQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU-"'
// Sound for admin notifications (new user)
const adminSoundBase64 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI9pEAnABpALFAAAAAAD/8BwATGF2ZjU2LjQwLjEwMQAAAAAAAAAAAABDcmVhdGVkIHdpdGggRmZkcCUyMEdhcGJhbmQgZm9yIFdpbmRvd3MAQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU-';

type NotificationAction = {
    label: string;
    onClick: () => void;
};

type NotificationType = {
    id: string | number;
    title: string;
    message: string;
    type: 'appointment' | 'newUser';
    duration?: number;
    action?: NotificationAction;
};

const NotificationToast: React.FC<{
    notification: NotificationType;
    onDismiss: () => void;
}> = ({ notification, onDismiss }) => {
    const [isVisible, setIsVisible] = React.useState(false);
    const timerRef = React.useRef<number | null>(null);

    React.useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));
        const duration = notification.duration || 10000;
        timerRef.current = window.setTimeout(() => {
            setIsVisible(false);
            setTimeout(onDismiss, 300);
        }, duration);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [notification, onDismiss]);
    
    const handleManualDismiss = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setIsVisible(false);
        setTimeout(onDismiss, 300);
    };

    const getIcon = () => {
        switch (notification.type) {
            case 'appointment': return <ClockIcon className="w-6 h-6 text-blue-500" />;
            case 'newUser': return <UserGroupIcon className="w-6 h-6 text-green-500" />;
            default: return null;
        }
    };
    
    const handleActionClick = () => {
        notification.action?.onClick();
        handleManualDismiss();
    };

    return (
        <div className={`w-full max-w-sm bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden transition-all duration-300 ease-in-out transform ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}`}>
            <div className="p-4">
                <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">{getIcon()}</div>
                    <div className="ms-3 w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                        <p className="mt-1 text-sm text-gray-700">{notification.message}</p>
                        {notification.action && (
                            <div className="mt-3">
                                <button onClick={handleActionClick} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700">
                                    {notification.action.label}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="ms-4 flex-shrink-0 flex"><button onClick={handleManualDismiss} className="inline-flex text-gray-400 bg-white rounded-md hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"><XMarkIcon className="w-5 h-5" /></button></div>
                </div>
            </div>
        </div>
    );
};

interface NotificationCenterProps {
    appointmentAlerts?: Appointment[];
    dismissAppointmentAlert?: (appointmentId: string) => void;
    newUserAlerts?: Profile[];
    dismissNewUserAlert?: (userId: string) => void;
    onNewUserAlertClick?: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ appointmentAlerts = [], dismissAppointmentAlert, newUserAlerts = [], dismissNewUserAlert, onNewUserAlertClick }) => {
    const appointmentAudioRef = React.useRef<HTMLAudioElement | null>(null);
    const adminAudioRef = React.useRef<HTMLAudioElement | null>(null);

    React.useEffect(() => {
        if (appointmentAlerts.length > 0) {
            appointmentAudioRef.current?.play().catch(e => console.error("Appointment audio playback failed:", e));
        }
    }, [appointmentAlerts]);

    React.useEffect(() => {
        if (newUserAlerts.length > 0) {
            adminAudioRef.current?.play().catch(e => console.error("Admin audio playback failed:", e));
        }
    }, [newUserAlerts]);


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
        const appointmentNotifications: NotificationType[] = appointmentAlerts.map(alert => ({
            id: alert.id,
            type: 'appointment',
            title: 'تذكير بالموعد',
            message: `${alert.title} - الساعة ${formatTime(alert.time)}`,
        }));
        
        const newUserNotifications: NotificationType[] = newUserAlerts.map(user => ({
            id: user.id,
            type: 'newUser',
            title: 'تسجيل مستخدم جديد',
            message: `المستخدم "${user.full_name}" ينتظر الموافقة.`,
            action: onNewUserAlertClick ? { label: 'الانتقال إلى إدارة المستخدمين', onClick: onNewUserAlertClick } : undefined,
        }));
        
        return [...appointmentNotifications, ...newUserNotifications];
    }, [appointmentAlerts, newUserAlerts, onNewUserAlertClick]);
    
    const handleDismiss = (id: string | number, type: 'appointment' | 'newUser') => {
        if (type === 'appointment' && dismissAppointmentAlert) {
            dismissAppointmentAlert(id as string);
        } else if (type === 'newUser' && dismissNewUserAlert) {
            dismissNewUserAlert(id as string);
        }
    };
    
    return (
        <div aria-live="assertive" className="fixed inset-0 flex items-start px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-[100]">
            <div className="w-full flex flex-col items-center space-y-3 sm:items-end">
                <audio ref={appointmentAudioRef} src={appointmentSoundBase64} preload="auto" />
                <audio ref={adminAudioRef} src={adminSoundBase64} preload="auto" />
                {allNotifications.map(notification => (
                    <NotificationToast
                        key={`${notification.type}-${notification.id}`}
                        notification={notification}
                        onDismiss={() => handleDismiss(notification.id, notification.type)}
                    />
                ))}
            </div>
        </div>
    );
};

export default NotificationCenter;