import * as React from 'react';
import { XMarkIcon, ArrowPathIcon } from './icons';

export interface RealtimeAlert {
    id: number;
    message: string;
}

interface RealtimeNotifierProps {
    alerts: RealtimeAlert[];
    dismissAlert: (alertId: number) => void;
}

const RealtimeNotifier: React.FC<RealtimeNotifierProps> = ({ alerts, dismissAlert }) => {
    
    // This effect sets a timer to auto-dismiss the oldest notification.
    React.useEffect(() => {
        if (alerts.length > 0) {
            const timer = setTimeout(() => {
                // Dismiss the oldest alert, which is the last one in the array
                // since new alerts are added to the front.
                dismissAlert(alerts[alerts.length - 1].id);
            }, 5000); // Auto-dismiss after 5 seconds

            return () => clearTimeout(timer);
        }
    }, [alerts, dismissAlert]);

    if (alerts.length === 0) {
        return null;
    }

    return (
        <div className="fixed top-4 left-4 z-[100] w-full max-w-md space-y-3">
            {alerts.map(alert => (
                <div key={alert.id} className="w-full bg-white shadow-xl rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden animate-slide-in-down-fade">
                    <div className="p-4">
                        <div className="flex items-start">
                            <div className="flex-shrink-0 pt-0.5">
                                <ArrowPathIcon className="w-6 h-6 text-blue-500" />
                            </div>
                            <div className="ms-3 w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900">تحديث مباشر</p>
                                <p className="mt-1 text-sm text-gray-700">{alert.message}</p>
                            </div>
                            <div className="ms-4 flex-shrink-0 flex">
                                <button
                                    onClick={() => dismissAlert(alert.id)}
                                    className="inline-flex text-gray-400 bg-white rounded-md hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                >
                                    <span className="sr-only">Close</span>
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default RealtimeNotifier;