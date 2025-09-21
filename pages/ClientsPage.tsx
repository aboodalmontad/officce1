import * as React from 'react';
import ClientsTreeView from '../components/ClientsTreeView';
import ClientsListView from '../components/ClientsListView';
import { PlusIcon, SearchIcon, ListBulletIcon, ViewColumnsIcon, ExclamationTriangleIcon, PrintIcon } from '../components/icons';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { formatDate } from '../utils/dateUtils';
import PrintableClientReport from '../components/PrintableClientReport';

interface ClientsPageProps {
    clients: Client[];
    setClients: (updater: (prevClients: Client[]) => Client[]) => void;
    accountingEntries: AccountingEntry[];
    setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void;
    assistants: string[];
}

const toInputDateString = (date?: Date) => {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y}-${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};


const ClientsPage: React.FC<ClientsPageProps> = ({ clients, setClients, accountingEntries, setAccountingEntries, assistants }) => {
    const [modal, setModal] = React.useState<{ type: 'client' | 'case' | 'stage' | 'session' | null, context?: any, isEditing: boolean }>({ type: null, isEditing: false });
    const [formData, setFormData] = React.useState<any>({});
    const [searchQuery, setSearchQuery] = React.useState('');
    const [viewMode, setViewMode] = React.useState<'tree' | 'list'>('tree');
    const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = React.useState(false);
    const [sessionToDelete, setSessionToDelete] = React.useState<{ sessionId: string, stageId: string, caseId: string, clientId: string, message: string } | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
    const [printData, setPrintData] = React.useState<{ client: Client; entries: AccountingEntry[]; totals: any } | null>(null);

    const filteredClients = React.useMemo(() => {
        if (!searchQuery) return clients;
        const lowercasedQuery = searchQuery.toLowerCase();

        return clients.filter(client => {
            // Search client info
            if (client.name.toLowerCase().includes(lowercasedQuery) || client.contactInfo.toLowerCase().includes(lowercasedQuery)) {
                return true;
            }

            // Search cases, stages, and sessions
            return client.cases.some(c => 
                c.subject.toLowerCase().includes(lowercasedQuery) ||
                c.opponentName.toLowerCase().includes(lowercasedQuery) ||
                c.stages.some(s => 
                    s.court.toLowerCase().includes(lowercasedQuery) ||
                    s.caseNumber.toLowerCase().includes(lowercasedQuery) ||
                    s.sessions.some(session => 
                        (session.postponementReason && session.postponementReason.toLowerCase().includes(lowercasedQuery)) ||
                        (session.nextPostponementReason && session.nextPostponementReason.toLowerCase().includes(lowercasedQuery)) ||
                        (session.assignee && session.assignee.toLowerCase().includes(lowercasedQuery))
                    )
                )
            );
        });
    }, [clients, searchQuery]);


    const handleOpenModal = (type: 'client' | 'case' | 'stage' | 'session', isEditing = false, context: any = {}) => {
        setModal({ type, context, isEditing });
        if (isEditing && context.item) {
            const item = context.item;
            if (type === 'session') {
                 setFormData({ ...item, date: toInputDateString(item.date) });
            } else if (type === 'stage') {
                const { firstSessionDate, ...restOfItem } = item;
                setFormData(restOfItem);
            } else {
                setFormData(item);
            }
        } else {
            setFormData(type === 'session' ? { date: toInputDateString(new Date()), assignee: 'بدون تخصيص'} : {});
        }
    };

    const handleCloseModal = () => {
        setModal({ type: null, isEditing: false });
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    
    // --- Delete Handlers ---
    const handleDeleteClient = (clientId: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذا الموكل وجميع القضايا المرتبطة به؟')) {
            setClients(prev => prev.filter(c => c.id !== clientId));
        }
    };

    const handleDeleteCase = (caseId: string, clientId: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذه القضية وجميع مراحلها وجلساتها؟')) {
            setClients(prev => prev.map(c => c.id === clientId ? { ...c, cases: c.cases.filter(cs => cs.id !== caseId) } : c));
        }
    };

    const handleDeleteStage = (stageId: string, caseId: string, clientId: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذه المرحلة وجميع جلساتها؟')) {
            setClients(prev => prev.map(c => c.id === clientId ? {
                ...c,
                cases: c.cases.map(cs => cs.id === caseId ? { ...cs, stages: cs.stages.filter(st => st.id !== stageId) } : cs)
            } : c));
        }
    };

    const openDeleteSessionModal = (sessionId: string, stageId: string, caseId: string, clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(cs => cs.id === caseId);
        const stage = caseItem?.stages.find(st => st.id === stageId);
        const session = stage?.sessions.find(se => se.id === sessionId);

        const message = session
            ? `هل أنت متأكد من حذف جلسة يوم ${formatDate(session.date)} الخاصة بقضية "${caseItem?.subject}"؟`
            : 'هل أنت متأكد من حذف هذه الجلسة؟';
        
        setSessionToDelete({ sessionId, stageId, caseId, clientId, message });
        setIsDeleteSessionModalOpen(true);
    };
    
    const closeDeleteSessionModal = () => {
        setIsDeleteSessionModalOpen(false);
        setSessionToDelete(null);
    };

    const handleConfirmDeleteSession = () => {
        if (!sessionToDelete) return;

        const { sessionId, stageId, caseId, clientId } = sessionToDelete;

        setClients(prev => prev.map(c => {
            if (c.id !== clientId) return c;
            return {
                ...c,
                cases: c.cases.map(cs => {
                    if (cs.id !== caseId) return cs;
                    return {
                        ...cs,
                        stages: cs.stages.map(st => {
                            if (st.id !== stageId) return st;
                            return {
                                ...st,
                                sessions: st.sessions.filter(se => se.id !== sessionId)
                            };
                        })
                    };
                })
            };
        }));
        closeDeleteSessionModal();
    };


    const handlePostponeSession = (sessionId: string, newDate: Date, newReason: string) => {
        setClients(currentClients => {
            let sessionToPostpone: Session | undefined;
            let stageOfSession: Stage | undefined;

            for (const client of currentClients) {
                for (const caseItem of client.cases) {
                    for (const stage of caseItem.stages) {
                        const foundSession = stage.sessions.find(s => s.id === sessionId);
                        if (foundSession) {
                            sessionToPostpone = foundSession;
                            stageOfSession = stage;
                            break;
                        }
                    }
                    if (stageOfSession) break;
                }
                if (stageOfSession) break;
            }

            if (!sessionToPostpone || !stageOfSession) {
                console.error("Session or stage not found");
                return currentClients;
            }

            const newSession: Session = {
                ...sessionToPostpone,
                id: `session-${Date.now()}`,
                date: newDate,
                isPostponed: false,
                postponementReason: newReason,
                nextPostponementReason: undefined,
                nextSessionDate: undefined,
            };

            return currentClients.map(client => ({
                ...client,
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    stages: caseItem.stages.map(stage => {
                        if (stage.id !== stageOfSession!.id) {
                            return stage;
                        }
                        
                        return {
                            ...stage,
                            sessions: [
                                ...stage.sessions.map(s =>
                                    s.id === sessionId
                                        ? { ...s, isPostponed: true, nextPostponementReason: newReason, nextSessionDate: newDate }
                                        : s
                                ),
                                newSession,
                            ],
                        };
                    }),
                })),
            }));
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const { type, context, isEditing } = modal;

        if (isEditing) {
            // --- Update Logic ---
            const { item } = context;
            if (type === 'client') {
                setClients(prev => prev.map(c => c.id === item.id ? { ...c, name: formData.name, contactInfo: formData.contactInfo } : c));
            } else if (type === 'case') {
                setClients(prev => prev.map(c => c.id === context.clientId ? {
                    ...c, cases: c.cases.map(cs => cs.id === item.id ? { ...cs, ...formData } : cs)
                } : c));
            } else if (type === 'stage') {
                const updatedStage = { ...item, ...formData, firstSessionDate: undefined };
                setClients(prev => prev.map(c => c.id === context.clientId ? {
                    ...c, cases: c.cases.map(cs => cs.id === context.caseId ? {
                        ...cs, stages: cs.stages.map(st => st.id === item.id ? updatedStage : st)
                    } : cs)
                } : c));
            } else if (type === 'session') {
                const updatedSession = { ...item, ...formData, date: new Date(formData.date), assignee: formData.assignee };
                 setClients(prev => prev.map(c => c.id === context.clientId ? {
                    ...c, cases: c.cases.map(cs => cs.id === context.caseId ? {
                        ...cs, stages: cs.stages.map(st => st.id === context.stageId ? {
                            ...st, sessions: st.sessions.map(se => se.id === item.id ? updatedSession : se)
                        } : st)
                    } : cs)
                } : c));
            }
        } else {
            // --- Add Logic ---
            if (type === 'client') {
                const newClient: Client = { id: `client-${Date.now()}`, name: formData.name, contactInfo: formData.contactInfo, cases: [] };
                setClients(prevClients => [...prevClients, newClient]);
            } else if (type === 'case' && context.clientId) {
                setClients(prevClients => prevClients.map(client => {
                    if (client.id === context.clientId) {
                        const newCase: Case = {
                            id: `case-${Date.now()}`,
                            subject: formData.subject,
                            clientName: client.name,
                            opponentName: formData.opponentName,
                            stages: [],
                            feeAgreement: formData.feeAgreement || '',
                            status: formData.status || 'active',
                        };
                        return { ...client, cases: [...client.cases, newCase] };
                    }
                    return client;
                }));
            } else if (type === 'stage' && context.clientId && context.caseId) {
                 setClients(prevClients => prevClients.map(client => client.id === context.clientId ? {
                    ...client,
                    cases: client.cases.map(c => {
                        if (c.id !== context.caseId) return c;
                        const newStage: Stage = {
                            id: `stage-${Date.now()}`, court: formData.court, caseNumber: formData.caseNumber, sessions: [],
                            firstSessionDate: undefined
                        };
                        return { ...c, stages: [...c.stages, newStage] };
                    })
                 } : client));
            } else if (type === 'session' && context.clientId && context.caseId && context.stageId) {
                 setClients(prevClients => {
                    const client = prevClients.find(c => c.id === context.clientId);
                    const caseItem = client?.cases.find(c => c.id === context.caseId);
                    const stage = caseItem?.stages.find(s => s.id === context.stageId);

                    if (client && caseItem && stage) {
                        const newSession: Session = {
                            id: `session-${Date.now()}`,
                            court: stage.court,
                            caseNumber: stage.caseNumber,
                            date: new Date(formData.date),
                            clientName: client.name,
                            opponentName: caseItem.opponentName,
                            isPostponed: false,
                            assignee: formData.assignee || 'بدون تخصيص',
                            postponementReason: formData.postponementReason || undefined,
                        };
                        return prevClients.map(cl => cl.id === context.clientId ? {
                            ...cl,
                            cases: cl.cases.map(c => c.id === context.caseId ? {
                                ...c,
                                stages: c.stages.map(s => s.id === context.stageId ? { ...s, sessions: [...s.sessions, newSession] } : s)
                            } : c)
                        } : cl);
                    }
                    return prevClients;
                 });
            }
        }
        handleCloseModal();
    };
    
    const handlePrintClientStatement = (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;

        const clientEntries = accountingEntries.filter(entry => entry.clientId === clientId);
        const totals = clientEntries.reduce((acc, entry) => {
            if (entry.type === 'income') acc.income += entry.amount;
            else acc.expense += entry.amount;
            return acc;
        }, { income: 0, expense: 0 });
        const balance = totals.income - totals.expense;

        setPrintData({ client, entries: clientEntries.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()), totals: { ...totals, balance } });
        setIsPrintModalOpen(true);
    };

    const handleClosePrintModal = () => {
        setIsPrintModalOpen(false);
        setPrintData(null);
    };

    const renderModalContent = () => {
        if (!modal.type) return null;

        const titles = {
            client: modal.isEditing ? 'تعديل موكل' : 'إضافة موكل جديد',
            case: modal.isEditing ? 'تعديل قضية' : 'إضافة قضية جديدة',
            stage: modal.isEditing ? 'تعديل مرحلة' : 'إضافة مرحلة جديدة',
            session: modal.isEditing ? 'تعديل جلسة' : 'إضافة جلسة جديدة',
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseModal}>
                <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <h2 className="text-xl font-bold mb-4">{titles[modal.type]}</h2>
                    <form onSubmit={handleSubmit}>
                        <div className="space-y-4">
                            {modal.type === 'client' && <>
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">اسم الموكل</label>
                                    <input type="text" id="name" name="name" value={formData.name || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="contactInfo" className="block text-sm font-medium text-gray-700">معلومات الاتصال</label>
                                    <input type="text" id="contactInfo" name="contactInfo" value={formData.contactInfo || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                            </>}
                             {modal.type === 'case' && <>
                                <div>
                                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700">موضوع القضية</label>
                                    <input type="text" id="subject" name="subject" value={formData.subject || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="opponentName" className="block text-sm font-medium text-gray-700">اسم الخصم</label>
                                    <input type="text" id="opponentName" name="opponentName" value={formData.opponentName || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="feeAgreement" className="block text-sm font-medium text-gray-700">اتفاقية الأتعاب</label>
                                    <input type="text" id="feeAgreement" name="feeAgreement" value={formData.feeAgreement || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" />
                                </div>
                                <div>
                                    <label htmlFor="status" className="block text-sm font-medium text-gray-700">الحالة</label>
                                    <select id="status" name="status" value={formData.status || 'active'} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required>
                                        <option value="active">نشطة</option>
                                        <option value="closed">مغلقة</option>
                                        <option value="on_hold">معلقة</option>
                                    </select>
                                </div>
                            </>}
                            {modal.type === 'stage' && <>
                                <div>
                                    <label htmlFor="court" className="block text-sm font-medium text-gray-700">المحكمة</label>
                                    <input type="text" id="court" name="court" value={formData.court || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="caseNumber" className="block text-sm font-medium text-gray-700">رقم الأساس</label>
                                    <input type="text" id="caseNumber" name="caseNumber" value={formData.caseNumber || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                            </>}
                            {modal.type === 'session' && <>
                                <div>
                                    <label htmlFor="date" className="block text-sm font-medium text-gray-700">تاريخ الجلسة</label>
                                    <input type="date" id="date" name="date" value={formData.date || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" placeholder="DD/MM/YYYY" required />
                                </div>
                                <div>
                                    <label htmlFor="assignee" className="block text-sm font-medium text-gray-700">مكلف بالحضور</label>
                                    <select id="assignee" name="assignee" value={formData.assignee || 'بدون تخصيص'} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded">
                                        {assistants.map(name => <option key={name} value={name}>{name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="postponementReason" className="block text-sm font-medium text-gray-700">سبب التأجيل (إن وجد)</label>
                                    <input type="text" id="postponementReason" name="postponementReason" value={formData.postponementReason || ''} onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" />
                                </div>
                            </>}
                        </div>
                        <div className="mt-6 flex justify-end gap-4">
                            <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{modal.isEditing ? 'حفظ التعديلات' : 'إضافة'}</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">إدارة الموكلين</h1>
                <button onClick={() => handleOpenModal('client')} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                    <PlusIcon className="w-5 h-5" />
                    <span>موكل جديد</span>
                </button>
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b pb-3 mb-3">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-semibold">قائمة الموكلين</h2>
                        <div className="relative">
                            <input
                                type="search"
                                placeholder="ابحث عن أي معلومة..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full sm:w-64 p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                                <SearchIcon className="w-4 h-4 text-gray-500" />
                            </div>
                        </div>
                    </div>
                     <div className="flex items-center p-1 bg-gray-200 rounded-lg">
                        <button onClick={() => setViewMode('tree')} className={`p-2 rounded-md ${viewMode === 'tree' ? 'bg-white shadow' : 'text-gray-600'}`}>
                            <ViewColumnsIcon className="w-5 h-5" />
                        </button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-white shadow' : 'text-gray-600'}`}>
                            <ListBulletIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {viewMode === 'tree' ? (
                     <ClientsTreeView
                        clients={filteredClients}
                        setClients={setClients}
                        accountingEntries={accountingEntries}
                        setAccountingEntries={setAccountingEntries}
                        onAddCase={(clientId) => handleOpenModal('case', false, { clientId })}
                        onEditCase={(caseItem, client) => handleOpenModal('case', true, { item: caseItem, clientId: client.id })}
                        onDeleteCase={handleDeleteCase}
                        onAddStage={(clientId, caseId) => handleOpenModal('stage', false, { clientId, caseId })}
                        onEditStage={(stage, caseItem, client) => handleOpenModal('stage', true, { item: stage, caseId: caseItem.id, clientId: client.id })}
                        onDeleteStage={handleDeleteStage}
                        onAddSession={(clientId, caseId, stageId) => handleOpenModal('session', false, { clientId, caseId, stageId })}
                        onEditSession={(session, stage, caseItem, client) => handleOpenModal('session', true, { item: session, stageId: stage.id, caseId: caseItem.id, clientId: client.id })}
                        onDeleteSession={openDeleteSessionModal}
                        onPostponeSession={handlePostponeSession}
                        onEditClient={(client) => handleOpenModal('client', true, { item: client })}
                        onDeleteClient={handleDeleteClient}
                        onPrintClientStatement={handlePrintClientStatement}
                    />
                ) : (
                    <ClientsListView
                        clients={filteredClients}
                        setClients={setClients}
                        accountingEntries={accountingEntries}
                        setAccountingEntries={setAccountingEntries}
                        onAddCase={(clientId) => handleOpenModal('case', false, { clientId })}
                        onEditCase={(caseItem, client) => handleOpenModal('case', true, { item: caseItem, clientId: client.id })}
                        onDeleteCase={handleDeleteCase}
                        onAddStage={(clientId, caseId) => handleOpenModal('stage', false, { clientId, caseId })}
                        onEditStage={(stage, caseItem, client) => handleOpenModal('stage', true, { item: stage, caseId: caseItem.id, clientId: client.id })}
                        onDeleteStage={handleDeleteStage}
                        onAddSession={(clientId, caseId, stageId) => handleOpenModal('session', false, { clientId, caseId, stageId })}
                        onEditSession={(session, stage, caseItem, client) => handleOpenModal('session', true, { item: session, stageId: stage.id, caseId: caseItem.id, clientId: client.id })}
                        onDeleteSession={openDeleteSessionModal}
                        onPostponeSession={handlePostponeSession}
                        onEditClient={(client) => handleOpenModal('client', true, { item: client })}
                        onDeleteClient={handleDeleteClient}
                        onPrintClientStatement={handlePrintClientStatement}
                    />
                )}
            </div>
            {renderModalContent()}
            {isDeleteSessionModalOpen && sessionToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={closeDeleteSessionModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">
                                تأكيد حذف الجلسة
                            </h3>
                            <p className="text-gray-600 my-4">
                                {sessionToDelete.message}
                                <br />
                                هذا الإجراء لا يمكن التراجع عنه.
                            </p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={closeDeleteSessionModal}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                                onClick={handleConfirmDeleteSession}
                            >
                                نعم، قم بالحذف
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isPrintModalOpen && printData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={handleClosePrintModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="overflow-y-auto printable-section">
                            <PrintableClientReport
                                client={printData.client}
                                entries={printData.entries}
                                totals={printData.totals}
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-4 border-t pt-4 no-print">
                            <button
                                type="button"
                                className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
                                onClick={handleClosePrintModal}
                            >
                                إغلاق
                            </button>
                            <button
                                type="button"
                                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                                onClick={() => window.print()}
                            >
                                <PrintIcon className="w-5 h-5" />
                                <span>طباعة</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientsPage;