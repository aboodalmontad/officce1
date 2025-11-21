
import * as React from 'react';
import { XMarkIcon, ClockIcon, ArrowPathIcon, UserPlusIcon } from './icons';
import { Appointment } from '../types';

export interface RealtimeAlert {
    id: number;
    message: string;
    type?: 'sync' | 'userApproval';
}

// A valid, short beep sound in Base64 format (WAV)
// This string was previously corrupt; updated to a valid PCM WAV.
export const defaultUserApprovalSoundBase64 = 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU9vT18AAAAA';

interface NotificationCenterProps {
    appointmentAlerts: Appointment[];
    realtimeAlerts: RealtimeAlert[];
    userApprovalAlerts: RealtimeAlert[];
    dismissAppointmentAlert: (id: string) => void;
    dismissRealtimeAlert: (id: number) => void;
    dismissUserApprovalAlert: (id: number) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
    appointmentAlerts, 
    realtimeAlerts, 
    userApprovalAlerts,
    dismissAppointmentAlert, 
    dismissRealtimeAlert,
    dismissUserApprovalAlert
}) => {
    const audioRef = React.useRef<HTMLAudioElement | null>(null);
    const [hasInteracted, setHasInteracted] = React.useState(false);

    // Track interaction to unlock audio
    React.useEffect(() => {
        const handleInteraction = () => {
            setHasInteracted(true);
            // Attempt to unlock audio context silently
            if (audioRef.current) {
                try {
                    audioRef.current.load();
                } catch(e) {
                    console.warn("Audio load failed", e);
                }
            }
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };

        window.addEventListener('click', handleInteraction);
        window.addEventListener('keydown', handleInteraction);

        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
        };
    }, []);

    // Play sound when new important alerts arrive
    React.useEffect(() => {
        if ((appointmentAlerts.length > 0 || userApprovalAlerts.length > 0) && hasInteracted) {
            try {
                const savedSound = localStorage.getItem('customUserApprovalSound');
                const soundSource = savedSound || defaultUserApprovalSoundBase64;
                
                if (audioRef.current) {
                    audioRef.current.src = soundSource;
                    const playPromise = audioRef.current.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            console.warn("Audio playback failed (likely blocked by browser):", error);
                        });
                    }
                } else {
                    const audio = new Audio(soundSource);
                    audioRef.current = audio;
                    audio.play().catch(console.warn);
                }
            } catch (e) {
                console.error("Error initializing audio:", e);
            }
        }
    }, [appointmentAlerts.length, userApprovalAlerts.length, hasInteracted]);

    const alerts = [
        ...appointmentAlerts.map(a => ({ ...a, type: 'appointment' })),
        ...realtimeAlerts.map(a => ({ ...a, type: 'realtime' })),
        ...userApprovalAlerts.map(a => ({ ...a, type: 'userApproval' })),
    ];

    if (alerts.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
            {/* Hidden audio element for sound playback */}
            <audio ref={audioRef} className="hidden" preload="auto" />

            {alerts.map((alert: any) => (
                <div 
                    key={alert.id} 
                    className={`p-4 rounded-lg shadow-lg border-r-4 flex justify-between items-start gap-3 transition-all duration-300 animate-fade-in ${
                        alert.type === 'appointment' ? 'bg-white border-blue-500 text-gray-800' : 
                        alert.type === 'userApproval' ? 'bg-blue-50 border-blue-600 text-blue-900' :
                        'bg-yellow-50 border-yellow-500 text-yellow-900'
                    }`}
                >
                    <div className="flex-shrink-0 pt-1">
                        {alert.type === 'appointment' ? <ClockIcon className="w-5 h-5 text-blue-500" /> : 
                         alert.type === 'userApproval' ? <UserPlusIcon className="w-5 h-5 text-blue-600" /> :
                         <ArrowPathIcon className="w-5 h-5 text-yellow-600" />}
                    </div>
                    <div className="flex-grow">
                        <h4 className="font-bold text-sm">
                            {alert.type === 'appointment' ? 'تذكير بموعد' : 
                             alert.type === 'userApproval' ? 'تسجيل جديد' : 
                             'تحديث'}
                        </h4>
                        <p className="text-sm mt-1">
                            {alert.type === 'appointment' 
                                ? `حان موعد: ${alert.title} (${alert.time})` 
                                : alert.message}
                        </p>
                    </div>
                    <button 
                        onClick={() => {
                            if (alert.type === 'appointment') dismissAppointmentAlert(alert.id);
                            else if (alert.type === 'userApproval') dismissUserApprovalAlert(alert.id);
                            else dismissRealtimeAlert(alert.id);
                        }} 
                        className="text-gray-400 hover:text-gray-600 p-1"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
};

export default NotificationCenter;
