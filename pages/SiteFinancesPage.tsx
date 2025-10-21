import * as React from 'react';
import { ExclamationTriangleIcon } from '../components/icons';

const SiteFinancesPage: React.FC = () => {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-gray-800">مالية وتحليلات الموقع</h1>
            
            <div className="bg-white p-8 rounded-lg shadow text-center flex flex-col items-center animate-fade-in mt-10">
                <div className="flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-6">
                    <ExclamationTriangleIcon className="h-8 w-8 text-yellow-600" aria-hidden="true" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">الصفحة معطلة مؤقتاً</h2>
                <p className="mt-3 text-lg text-gray-600">
                    تم إيقاف عمل صفحة التحليلات والمالية بناءً على طلبك.
                </p>
            </div>
        </div>
    );
};

export default SiteFinancesPage;
