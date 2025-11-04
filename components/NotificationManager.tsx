import * as React from 'react';
import { AppNotification } from '../types';
import { XMarkIcon, BellIcon, CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from './icons';

const notificationSoundBase64 = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

const getIcon = (type: AppNotification['type']) => {
    switch (type) {
        case 'success':
            return <CheckCircleIcon className="w-6 h-6 text-green-500" />;
        case 'error':
            return <XCircleIcon className="w-6 h-6 text-red-500" />;
        case 'warning':
            return <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500" />;
        case 'info':
        default:
            return <BellIcon className="w-6 h-6 text-blue-500" />;
    }
};

const Notification: React.FC<{ notification: AppNotification, onDismiss: (id: number) => void }> = ({ notification, onDismiss }) => {
    React.useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss(notification.id);
        }, 5000); // Auto-dismiss after 5 seconds

        return () => clearTimeout(timer);
    }, [notification.id, onDismiss]);

    return (
        <div className="w-full max-w-sm bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden animate-fade-in">
            <div className="p-4">
                <div className="flex items-start">
                    <div className="flex-shrink-0 pt-0.5">
                        {getIcon(notification.type)}
                    </div>
                    <div className="ms-3 w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{notification.message}</p>
                    </div>
                    <div className="ms-4 flex-shrink-0 flex">
                        <button
                            onClick={() => onDismiss(notification.id)}
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

interface NotificationManagerProps {
    notifications: AppNotification[];
    onDismiss: (id: number) => void;
}

const NotificationManager: React.FC<NotificationManagerProps> = ({ notifications, onDismiss }) => {
    const audioRef = React.useRef<HTMLAudioElement | null>(null);
    const prevNotificationsCount = React.useRef(notifications.length);

    React.useEffect(() => {
        if (notifications.length > prevNotificationsCount.current) {
            audioRef.current?.play().catch(e => console.error("Notification sound playback failed:", e));
        }
        prevNotificationsCount.current = notifications.length;
    }, [notifications.length]);

    if (notifications.length === 0) {
        return null;
    }

    return (
        <div aria-live="assertive" className="fixed inset-0 flex flex-col items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-[100]">
            <div className="w-full flex flex-col items-center space-y-4 sm:items-end">
                <audio ref={audioRef} src={notificationSoundBase64} preload="auto" />
                {notifications.map(notification => (
                    <Notification key={notification.id} notification={notification} onDismiss={onDismiss} />
                ))}
            </div>
        </div>
    );
};

export default NotificationManager;