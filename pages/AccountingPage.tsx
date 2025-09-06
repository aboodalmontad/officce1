import React, { useState, useMemo } from 'react';
import { AccountingEntry, Client } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon, SearchIcon, ExclamationTriangleIcon } from '../components/icons';

interface AccountingPageProps {
    accountingEntries: AccountingEntry[];
    setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void;
    clients: Client[];
}

const AccountingPage: React.FC<AccountingPageProps> = ({ accountingEntries, setAccountingEntries, clients }) => {
    const [modal, setModal] = useState<{ isOpen: boolean; data?: AccountingEntry }>({ isOpen: false });
    const [formData, setFormData] = useState<Partial<AccountingEntry>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [entryToDelete, setEntryToDelete] = useState<AccountingEntry | null>(null);

    const financialSummary = useMemo(() => {
        const totalIncome = accountingEntries.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
        const totalExpenses = accountingEntries.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
        return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses };
    }, [accountingEntries]);
    
    const filteredAndSortedEntries = useMemo(() => {
        const filtered = accountingEntries.filter(entry => {
            if (!searchQuery) return true;
            const lowercasedQuery = searchQuery.toLowerCase();
            return (
                entry.description.toLowerCase().includes(lowercasedQuery) ||
                entry.clientName.toLowerCase().includes(lowercasedQuery) ||
                entry.amount.toString().includes(searchQuery)
            );
        });
        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [accountingEntries, searchQuery]);


    const handleOpenModal = (entry?: AccountingEntry) => {
        setFormData(entry ? { ...entry, date: entry.date.toISOString().split('T')[0] as any } : { type: 'income', date: new Date().toISOString().split('T')[0] as any });
        setModal({ isOpen: true, data: entry });
    };

    const handleCloseModal = () => {
        setModal({ isOpen: false });
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const selectedClient = clients.flatMap(c => c.cases.map(cs => ({ ...cs, clientId: c.id, clientName: c.name }))).find(c => c.id === formData.caseId);
        
        const entryData = {
            ...formData,
            date: new Date(formData.date!),
            clientName: selectedClient?.clientName || 'مصاريف عامة',
            clientId: selectedClient?.clientId || '',
        } as Omit<AccountingEntry, 'id'>;

        if (modal.data) { // Editing
            setAccountingEntries(prev => prev.map(item => item.id === modal.data!.id ? { ...item, ...entryData } as AccountingEntry : item));
        } else { // Adding
            setAccountingEntries(prev => [...prev, { ...entryData, id: `acc-${Date.now()}` } as AccountingEntry]);
        }
        handleCloseModal();
    };

    const openDeleteModal = (entry: AccountingEntry) => {
        setEntryToDelete(entry);
        setIsDeleteModalOpen(true);
    };
    
    const closeDeleteModal = () => {
        setEntryToDelete(null);
        setIsDeleteModalOpen(false);
    };

    const handleConfirmDelete = () => {
        if (entryToDelete) {
            setAccountingEntries(prev => prev.filter(item => item.id !== entryToDelete.id));
            closeDeleteModal();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">المحاسبة</h1>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-grow">
                        <input 
                            type="search" 
                            placeholder="ابحث في القيود..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                        />
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                            <SearchIcon className="w-4 h-4 text-gray-500" />
                        </div>
                    </div>
                    <button onClick={() => handleOpenModal()} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                        <PlusIcon className="w-5 h-5" />
                        <span>إضافة قيد</span>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-green-100 text-green-800 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">إجمالي الإيرادات</h3>
                    <p className="text-3xl font-bold">{financialSummary.totalIncome.toLocaleString()} ل.س</p>
                </div>
                <div className="p-6 bg-red-100 text-red-800 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">إجمالي المصروفات</h3>
                    <p className="text-3xl font-bold">{financialSummary.totalExpenses.toLocaleString()} ل.س</p>
                </div>
                <div className="p-6 bg-blue-100 text-blue-800 rounded-lg shadow">
                    <h3 className="text-lg font-semibold">الرصيد</h3>
                    <p className="text-3xl font-bold">{financialSummary.balance.toLocaleString()} ل.س</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-600">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                        <tr>
                            <th className="px-6 py-3">التاريخ</th>
                            <th className="px-6 py-3">البيان</th>
                            <th className="px-6 py-3">العميل/القضية</th>
                            <th className="px-6 py-3">الواردات</th>
                            <th className="px-6 py-3">المصروفات</th>
                            <th className="px-6 py-3">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAndSortedEntries.map(entry => (
                            <tr key={entry.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4">{formatDate(entry.date)}</td>
                                <td className="px-6 py-4">{entry.description}</td>
                                <td className="px-6 py-4">{entry.clientName}</td>
                                <td className="px-6 py-4 font-semibold text-green-600">
                                    {entry.type === 'income' ? entry.amount.toLocaleString() : '-'}
                                </td>
                                <td className="px-6 py-4 font-semibold text-red-600">
                                    {entry.type === 'expense' ? entry.amount.toLocaleString() : '-'}
                                </td>
                                <td className="px-6 py-4 flex items-center gap-2">
                                    <button onClick={() => handleOpenModal(entry)} className="p-2 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                                    <button onClick={() => openDeleteModal(entry)} className="p-2 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {modal.isOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{modal.data ? 'تعديل القيد' : 'إضافة قيد جديد'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">النوع</label>
                                <select name="type" value={formData.type} onChange={handleFormChange} className="w-full p-2 border rounded" required>
                                    <option value="income">إيراد</option>
                                    <option value="expense">مصروف</option>
                                </select>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">المبلغ</label>
                                <input type="number" name="amount" value={formData.amount || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">التاريخ</label>
                                <input type="date" name="date" value={formData.date as any} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">البيان</label>
                                <input type="text" name="description" value={formData.description || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">ربط بقضية (اختياري)</label>
                                 <select name="caseId" value={formData.caseId || ''} onChange={handleFormChange} className="w-full p-2 border rounded">
                                     <option value="">مصاريف عامة</option>
                                     {clients.flatMap(client => client.cases.map(c => (
                                         <option key={c.id} value={c.id}>{client.name} - {c.subject}</option>
                                     )))}
                                 </select>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteModalOpen && entryToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeDeleteModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف القيد
                            </h3>
                            <p className="text-gray-600 my-4">
                                هل أنت متأكد من حذف القيد التالي؟
                                <br/>
                                <strong className="font-semibold">{entryToDelete.description}</strong> بمبلغ <strong className="font-semibold">{entryToDelete.amount.toLocaleString()} ل.س</strong>
                                <br />
                                هذا الإجراء لا يمكن التراجع عنه.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={closeDeleteModal}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmDelete}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AccountingPage;