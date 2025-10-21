import * as React from 'https://esm.sh/react@18.2.0';
import { Invoice, InvoiceItem, Client, Case } from '../types';
import { formatDate } from '../utils/dateUtils';
import { PlusIcon, PencilIcon, TrashIcon, SearchIcon, ExclamationTriangleIcon, PrintIcon } from '../components/icons';
import PrintableInvoice from '../components/PrintableInvoice';
import { printElement } from '../utils/printUtils';

interface InvoicesPageProps {
    invoices: Invoice[];
    setInvoices: (updater: (prev: Invoice[]) => Invoice[]) => void;
    clients: Client[];
    initialInvoiceData?: { clientId: string; caseId?: string };
    clearInitialInvoiceData: () => void;
}

const toInputDateString = (date: Date): string => {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const getStatusStyles = (status: Invoice['status']) => {
    switch (status) {
        case 'draft': return { text: 'مسودة', className: 'bg-gray-200 text-gray-800' };
        case 'sent': return { text: 'مرسلة', className: 'bg-blue-200 text-blue-800' };
        case 'paid': return { text: 'مدفوعة', className: 'bg-green-200 text-green-800' };
        case 'overdue': return { text: 'متأخرة', className: 'bg-red-200 text-red-800' };
    }
};

const InvoicesPage: React.FC<InvoicesPageProps> = ({ invoices, setInvoices, clients, initialInvoiceData, clearInitialInvoiceData }) => {
    const [modal, setModal] = React.useState<{ isOpen: boolean; data?: Invoice }>({ isOpen: false });
    const [formData, setFormData] = React.useState<Partial<Invoice> & { items: InvoiceItem[] }>({ items: [] });
    const [searchQuery, setSearchQuery] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<Invoice['status'] | 'all'>('all');
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [entryToDelete, setEntryToDelete] = React.useState<Invoice | null>(null);
    const [viewInvoice, setViewInvoice] = React.useState<Invoice | null>(null);
    const printInvoiceRef = React.useRef<HTMLDivElement>(null);
    
    React.useEffect(() => {
        if (initialInvoiceData) {
            handleOpenModal(undefined, initialInvoiceData);
            clearInitialInvoiceData();
        }
    }, [initialInvoiceData, clearInitialInvoiceData]);

    const filteredAndSortedInvoices = React.useMemo(() => {
        return invoices
            .filter(invoice => {
                const statusMatch = statusFilter === 'all' || invoice.status === statusFilter;
                const searchMatch = searchQuery === '' ||
                    invoice.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    invoice.id.toLowerCase().includes(searchQuery.toLowerCase());
                return statusMatch && searchMatch;
            })
            .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
    }, [invoices, searchQuery, statusFilter]);

    const handleOpenModal = (invoice?: Invoice, initialIds?: { clientId: string; caseId?: string }) => {
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(today.getDate() + 14); // Default due date 14 days from now

        const client = clients.find(c => c.id === initialIds?.clientId);
        const caseItem = client?.cases.find(c => c.id === initialIds?.caseId);

        const newFormData = invoice ? 
            { ...invoice, issueDate: toInputDateString(invoice.issueDate) as any, dueDate: toInputDateString(invoice.dueDate) as any } : 
            {
                id: `INV-${Date.now()}`,
                issueDate: toInputDateString(today) as any,
                dueDate: toInputDateString(dueDate) as any,
                clientId: client?.id || '',
                caseId: caseItem?.id || '',
                items: [{ id: `item-${Date.now()}`, description: '', amount: 0 }],
                taxRate: 0,
                discount: 0,
                status: 'draft' as 'draft',
            };
        setFormData(newFormData as any);
        setModal({ isOpen: true, data: invoice });
    };

    const handleCloseModal = () => setModal({ isOpen: false });

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const numValue = (name === 'taxRate' || name === 'discount') ? parseFloat(value) : value;
        setFormData(prev => ({ ...prev, [name]: numValue }));
    };

    const handleItemChange = (index: number, field: keyof InvoiceItem, value: string | number) => {
        const newItems = [...formData.items];
        // @ts-ignore
        newItems[index][field] = field === 'amount' ? parseFloat(value as string) : value;
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const handleAddItem = () => setFormData(prev => ({ ...prev, items: [...prev.items, { id: `item-${Date.now()}`, description: '', amount: 0 }] }));
    const handleRemoveItem = (index: number) => setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const client = clients.find(c => c.id === formData.clientId);
        if (!client) return;

        const caseItem = client.cases.find(c => c.id === formData.caseId);

        const finalInvoice: Invoice = {
            id: formData.id!,
            clientId: client.id,
            clientName: client.name,
            caseId: caseItem?.id,
            caseSubject: caseItem?.subject,
            issueDate: new Date(formData.issueDate!),
            dueDate: new Date(formData.dueDate!),
            items: formData.items.filter(item => item.description.trim() !== '' && item.amount > 0),
            taxRate: formData.taxRate || 0,
            discount: formData.discount || 0,
            status: formData.status!,
            notes: formData.notes,
        };

        if (modal.data) { // Editing
            setInvoices(prev => prev.map(inv => inv.id === modal.data!.id ? finalInvoice : inv));
        } else { // Adding
            setInvoices(prev => [...prev, finalInvoice]);
        }
        handleCloseModal();
    };
    
    const openDeleteModal = (invoice: Invoice) => {
        setEntryToDelete(invoice);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = () => {
        if (entryToDelete) {
            setInvoices(prev => prev.filter(item => item.id !== entryToDelete.id));
        }
        setIsDeleteModalOpen(false);
        setEntryToDelete(null);
    };

    const subtotal = formData.items?.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
    const taxAmount = (subtotal * (formData.taxRate || 0)) / 100;
    const total = subtotal + taxAmount - (formData.discount || 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">الفواتير</h1>
                <button onClick={() => handleOpenModal()} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                    <PlusIcon className="w-5 h-5" />
                    <span>إنشاء فاتورة</span>
                </button>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="relative md:col-span-2">
                        <input type="search" placeholder="ابحث بالموكل أو رقم الفاتورة..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50"/>
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none"><SearchIcon className="w-4 h-4 text-gray-500" /></div>
                    </div>
                    <div>
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full p-2 text-sm border border-gray-300 rounded-lg bg-gray-50">
                            <option value="all">كل الحالات</option>
                            <option value="draft">مسودة</option>
                            <option value="sent">مرسلة</option>
                            <option value="paid">مدفوعة</option>
                            <option value="overdue">متأخرة</option>
                        </select>
                    </div>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-600">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th className="px-6 py-3">رقم الفاتورة</th>
                                <th className="px-6 py-3">العميل</th>
                                <th className="px-6 py-3">تاريخ الإصدار</th>
                                <th className="px-6 py-3">تاريخ الاستحقاق</th>
                                <th className="px-6 py-3">الإجمالي</th>
                                <th className="px-6 py-3">الحالة</th>
                                <th className="px-6 py-3">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedInvoices.map(invoice => (
                                <tr key={invoice.id} className="bg-white border-b hover:bg-gray-50 cursor-pointer" onClick={() => setViewInvoice(invoice)}>
                                    <td className="px-6 py-4 font-mono">{invoice.id}</td>
                                    <td className="px-6 py-4">{invoice.clientName}</td>
                                    <td className="px-6 py-4">{formatDate(invoice.issueDate)}</td>
                                    <td className="px-6 py-4">{formatDate(invoice.dueDate)}</td>
                                    <td className="px-6 py-4 font-semibold">{ (invoice.items.reduce((s, i) => s + i.amount, 0) * (1 + invoice.taxRate / 100) - invoice.discount).toLocaleString() } ل.س</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyles(invoice.status).className}`}>{getStatusStyles(invoice.status).text}</span></td>
                                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setViewInvoice(invoice)} className="p-2 text-gray-500 hover:text-green-600" title="طباعة/عرض"><PrintIcon className="w-4 h-4" /></button>
                                            <button onClick={() => handleOpenModal(invoice)} className="p-2 text-gray-500 hover:text-blue-600" title="تعديل"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => openDeleteModal(invoice)} className="p-2 text-gray-500 hover:text-red-600" title="حذف"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>

            {modal.isOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-3xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{modal.data ? 'تعديل فاتورة' : 'فاتورة جديدة'}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Header */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div><label className="block text-sm font-medium">العميل</label><select name="clientId" value={formData.clientId || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">القضية (اختياري)</label><select name="caseId" value={formData.caseId || ''} onChange={handleFormChange} className="w-full p-2 border rounded" disabled={!formData.clientId}><option value="">--</option>{clients.find(c => c.id === formData.clientId)?.cases.map(cs => <option key={cs.id} value={cs.id}>{cs.subject}</option>)}</select></div>
                                <div><label className="block text-sm font-medium">تاريخ الإصدار</label><input type="date" name="issueDate" value={formData.issueDate as any} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                <div><label className="block text-sm font-medium">تاريخ الاستحقاق</label><input type="date" name="dueDate" value={formData.dueDate as any} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                            </div>
                            {/* Items */}
                            <div className="border-t pt-4">
                                {formData.items.map((item, index) => (
                                    <div key={item.id} className="flex items-center gap-2 mb-2">
                                        <input type="text" placeholder="البيان" value={item.description} onChange={e => handleItemChange(index, 'description', e.target.value)} className="w-full p-2 border rounded"/>
                                        <input type="number" placeholder="المبلغ" value={item.amount} onChange={e => handleItemChange(index, 'amount', e.target.value)} className="w-48 p-2 border rounded"/>
                                        <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                ))}
                                <button type="button" onClick={handleAddItem} className="text-sm text-blue-600 font-semibold">+ إضافة بند</button>
                            </div>
                             {/* Footer */}
                             <div className="flex flex-col md:flex-row gap-4 pt-4 border-t">
                                <div className="flex-grow space-y-4">
                                     <div><label className="block text-sm font-medium">ملاحظات</label><textarea name="notes" value={formData.notes || ''} onChange={handleFormChange} className="w-full p-2 border rounded" rows={4}></textarea></div>
                                     <div><label className="block text-sm font-medium">الحالة</label><select name="status" value={formData.status || 'draft'} onChange={handleFormChange} className="w-full p-2 border rounded"><option value="draft">مسودة</option><option value="sent">مرسلة</option><option value="paid">مدفوعة</option><option value="overdue">متأخرة</option></select></div>
                                </div>
                                <div className="w-full md:w-64 flex-shrink-0 space-y-2">
                                    <div className="flex justify-between items-center"><label>المجموع الفرعي</label><span>{subtotal.toLocaleString()}</span></div>
                                    <div className="flex justify-between items-center"><label>الضريبة (%)</label><input type="number" name="taxRate" value={formData.taxRate || 0} onChange={handleFormChange} className="w-20 p-1 border rounded text-left"/></div>
                                    <div className="flex justify-between items-center"><label>الخصم</label><input type="number" name="discount" value={formData.discount || 0} onChange={handleFormChange} className="w-20 p-1 border rounded text-left"/></div>
                                    <div className="flex justify-between items-center font-bold text-lg pt-2 border-t"><label>الإجمالي</label><span>{total.toLocaleString()}</span></div>
                                </div>
                             </div>
                            <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                        </form>
                    </div>
                </div>
            )}
            
            {isDeleteModalOpen && entryToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                         <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الفاتورة</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف الفاتورة رقم <strong className="font-mono">{entryToDelete.id}</strong>؟ لا يمكن التراجع عن هذا الإجراء.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200" onClick={() => setIsDeleteModalOpen(false)}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white" onClick={handleConfirmDelete}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}

            {viewInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] no-print" onClick={() => setViewInvoice(null)}>
                    <div className="bg-white p-2 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="overflow-y-auto" ref={printInvoiceRef}><PrintableInvoice invoice={viewInvoice} /></div>
                        <div className="mt-4 flex justify-end gap-4 border-t p-4">
                            <button type="button" onClick={() => setViewInvoice(null)} className="px-6 py-2 bg-gray-200 rounded-lg">إغلاق</button>
                            <button type="button" onClick={() => printElement(printInvoiceRef.current)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg"><PrintIcon className="w-5 h-5"/>طباعة</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicesPage;