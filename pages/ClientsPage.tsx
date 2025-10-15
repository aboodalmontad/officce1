import * as React from 'react';
import ClientsTreeView from '../components/ClientsTreeView';
import ClientsListView from '../components/ClientsListView';
import { PlusIcon, SearchIcon, ListBulletIcon, ViewColumnsIcon, ExclamationTriangleIcon, PrintIcon, ScaleIcon } from '../components/icons';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { formatDate } from '../utils/dateUtils';
import PrintableClientReport from '../components/PrintableClientReport';
import { printElement } from '../utils/printUtils';

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
    const [isDeleteCaseModalOpen, setIsDeleteCaseModalOpen] = React.useState(false);
    const [caseToDelete, setCaseToDelete] = React.useState<{ caseId: string, clientId: string, caseSubject: string } | null>(null);
    const [isDeleteClientModalOpen, setIsDeleteClientModalOpen] = React.useState(false);
    const [clientToDelete, setClientToDelete] = React.useState<Client | null>(null);
    const [isDeleteStageModalOpen, setIsDeleteStageModalOpen] = React.useState(false);
    const [stageToDelete, setStageToDelete] = React.useState<{ stageId: string; caseId: string; clientId: string; stageInfo: string } | null>(null);
    
    // State for printing logic
    const [isPrintChoiceModalOpen, setIsPrintChoiceModalOpen] = React.useState(false);
    const [clientForPrintChoice, setClientForPrintChoice] = React.useState<Client | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = React.useState(false);
    const [printData, setPrintData] = React.useState<{ client: Client; caseData?: Case; entries: AccountingEntry[]; totals: any } | null>(null);
    const printClientReportRef = React.useRef<HTMLDivElement>(null);

    // State for Decide Session Modal
    const [decideModal, setDecideModal] = React.useState<{ isOpen: boolean; session?: Session, stage?: Stage }>({ isOpen: false });
    const [decideFormData, setDecideFormData] = React.useState({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });


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
                 setFormData({ ...item, date: toInputDateString(item.date), nextSessionDate: toInputDateString(item.nextSessionDate) });
            } else if (type === 'stage') {
                const { firstSessionDate, ...restOfStage } = item;
                setFormData({ ...restOfStage, firstSessionDate: toInputDateString(firstSessionDate) });
            } else {
                setFormData(item);
            }
        } else {
            setFormData(context.id ? { [`${type}Id`]: context.id } : {});
        }
    };

    const handleCloseModal = () => {
        setModal({ type: null, isEditing: false });
        setFormData({});
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        // @ts-ignore
        const val = isCheckbox ? e.target.checked : value;
        setFormData(prev => ({ ...prev, [name]: val }));
    };
    
    const onUpdateSession = (sessionId: string, updatedFields: Partial<Session>) => {
        setClients(currentClients => {
            return currentClients.map(client => ({
                ...client,
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    stages: caseItem.stages.map(stage => {
                        const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIndex === -1) {
                            return stage;
                        }

                        const updatedSessions = [...stage.sessions];
                        const currentSession = updatedSessions[sessionIndex];
                        
                        // If postponing, create the new session and update the old one
                        if ('nextSessionDate' in updatedFields && 'nextPostponementReason' in updatedFields) {
                            const newSessionDate = updatedFields.nextSessionDate;
                            const newPostponementReason = updatedFields.nextPostponementReason;

                            if (newSessionDate && newPostponementReason) {
                                // Mark current session as postponed
                                updatedSessions[sessionIndex] = {
                                    ...currentSession,
                                    isPostponed: true,
                                    nextSessionDate: newSessionDate,
                                    nextPostponementReason: newPostponementReason,
                                };
                                
                                // Create the new session
                                const newSession: Session = {
                                    ...currentSession,
                                    id: `session-${Date.now()}`,
                                    date: newSessionDate,
                                    isPostponed: false,
                                    postponementReason: newPostponementReason, // The reason for this new session is the postponement of the old one
                                    nextSessionDate: undefined,
                                    nextPostponementReason: undefined,
                                };
                                updatedSessions.push(newSession);
                            }
                        } else {
                             // Regular update
                             updatedSessions[sessionIndex] = { ...currentSession, ...updatedFields };
                        }

                        return { ...stage, sessions: updatedSessions };
                    }),
                })),
            }));
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const { type, context, isEditing } = modal;

        if (type === 'client') {
            const clientName = formData.name?.trim();
            if (!clientName) {
                alert("اسم الموكل مطلوب.");
                return;
            }
            
            const normalizedClientName = clientName.toLowerCase();
            const foundClient = clients.find(c => c.name.trim().toLowerCase() === normalizedClientName);

            if (foundClient) {
                // A client with this name exists. Check if it's a true duplicate.
                
                // Case 1: We are ADDING a new client. Any match is a duplicate.
                if (!isEditing) {
                    alert(`تنبيه: الموكل "${clientName}" موجود بالفعل.`);
                    return;
                }
                
                // Case 2: We are EDITING a client. It's a duplicate ONLY if the found client's ID is different from the one we are editing.
                if (isEditing && context?.item?.id !== foundClient.id) {
                     alert(`تنبيه: الموكل "${clientName}" موجود بالفعل.`);
                     return;
                }
            }
            
            if (isEditing) {
                 if (context?.item?.id) {
                    setClients(prev => prev.map(c => c.id === context.item.id ? { ...c, ...formData, name: clientName } : c));
                }
            } else {
                const newClient: Client = { 
                    id: `client-${Date.now()}`, 
                    name: clientName, 
                    contactInfo: formData.contactInfo || '', 
                    cases: [] 
                };
                setClients(prev => [...prev, newClient]);
            }
        } else if (type === 'case') {
            if (isEditing) {
                setClients(prev => prev.map(c => c.id === context.client.id ? {
                    ...c,
                    cases: c.cases.map(cs => cs.id === context.item.id ? { ...cs, ...formData } : cs)
                } : c));
            } else {
                const clientForCase = clients.find(c => c.id === context.clientId);
                if (clientForCase) {
                    // Explicitly create the case object to avoid adding extra properties from formData
                    const newCase: Case = {
                        id: `case-${Date.now()}`,
                        subject: formData.subject || 'قضية بدون موضوع',
                        opponentName: formData.opponentName || '',
                        feeAgreement: formData.feeAgreement || '',
                        status: formData.status || 'active',
                        clientName: clientForCase.name,
                        stages: []
                    };

                    // If first stage data is provided, create and add it
                    const { court, caseNumber, firstSessionDate } = formData;
                    if (court || caseNumber) {
                        const newStage: Stage = {
                            id: `stage-${Date.now()}`,
                            court: court || 'غير محدد',
                            caseNumber: caseNumber || '',
                            firstSessionDate: firstSessionDate ? new Date(firstSessionDate) : undefined,
                            sessions: [],
                        };
                        newCase.stages.push(newStage);
                    }

                    setClients(prev => prev.map(c => c.id === context.clientId ? { ...c, cases: [...c.cases, newCase] } : c));
                }
            }
        } else if (type === 'stage') {
            const stageData = { ...formData };
            if (stageData.firstSessionDate) {
                 stageData.firstSessionDate = new Date(stageData.firstSessionDate);
            }
            if (isEditing) {
                setClients(prev => prev.map(c => c.id === context.client.id ? {
                    ...c,
                    cases: c.cases.map(cs => cs.id === context.case.id ? {
                        ...cs,
                        stages: cs.stages.map(st => st.id === context.item.id ? { ...st, ...stageData } : st)
                    } : cs)
                } : c));
            } else {
                 const newStage: Stage = { id: `stage-${Date.now()}`, sessions: [], ...stageData };
                 setClients(prev => prev.map(c => c.id === context.clientId ? {
                     ...c,
                     cases: c.cases.map(cs => cs.id === context.caseId ? { ...cs, stages: [...cs.stages, newStage] } : cs)
                 } : c));
            }
        } else if (type === 'session') {
            const sessionData = { ...formData };
            if (sessionData.date) sessionData.date = new Date(sessionData.date);
            if (sessionData.nextSessionDate) sessionData.nextSessionDate = new Date(sessionData.nextSessionDate);

            if (isEditing) {
                if (sessionData.isPostponed && sessionData.nextSessionDate && sessionData.nextPostponementReason) {
                    onUpdateSession(context.item.id, {
                        nextSessionDate: sessionData.nextSessionDate,
                        nextPostponementReason: sessionData.nextPostponementReason
                    });
                } else { // Regular edit
                     setClients(prev => prev.map(c => c.id === context.client.id ? {
                         ...c,
                         cases: c.cases.map(cs => cs.id === context.case.id ? {
                             ...cs,
                             stages: cs.stages.map(st => st.id === context.stage.id ? {
                                 ...st,
                                 sessions: st.sessions.map(s => s.id === context.item.id ? { ...s, ...sessionData } : s)
                             } : st)
                         } : cs)
                     } : c));
                }
            } else { // Adding new session
                setClients(prev => prev.map(client => {
                    if (client.id !== context.clientId) return client;
                    return {
                        ...client,
                        cases: client.cases.map(caseItem => {
                            if (caseItem.id !== context.caseId) return caseItem;
                            return {
                                ...caseItem,
                                stages: caseItem.stages.map(stage => {
                                    if (stage.id !== context.stageId) return stage;
                                    
                                    const newSession: Session = {
                                        id: `session-${Date.now()}`,
                                        isPostponed: false,
                                        court: stage.court,
                                        caseNumber: stage.caseNumber,
                                        clientName: client.name,
                                        opponentName: caseItem.opponentName,
                                        date: sessionData.date,
                                        assignee: sessionData.assignee || 'بدون تخصيص',
                                        postponementReason: sessionData.postponementReason,
                                        nextPostponementReason: undefined,
                                        nextSessionDate: undefined,
                                    };
                                    
                                    return {
                                        ...stage,
                                        sessions: [...stage.sessions, newSession]
                                    };
                                })
                            };
                        })
                    };
                }));
            }
        }
        handleCloseModal();
    };
    
    // --- Deletion Handlers ---

    const handleDeleteClient = (client: Client) => {
        setClientToDelete(client);
        setIsDeleteClientModalOpen(true);
    };

    const handleConfirmDeleteClient = () => {
        if (!clientToDelete) return;
        const clientId = clientToDelete.id;

        // Collect all case IDs for the client being deleted
        const caseIdsToDelete = clientToDelete.cases.map(c => c.id);

        // First, delete all accounting entries associated with the client OR any of their cases
        setAccountingEntries(prev => prev.filter(e => e.clientId !== clientId && !caseIdsToDelete.includes(e.caseId)));

        // Then, delete the client, which cascades to cases, stages, and sessions within the state
        setClients(prev => prev.filter(c => c.id !== clientId));

        closeDeleteClientModal();
    };

    const closeDeleteClientModal = () => {
        setClientToDelete(null);
        setIsDeleteClientModalOpen(false);
    };
    
    const handleDeleteCase = (caseId: string, clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(c => c.id === caseId);
        if (caseItem) {
            setCaseToDelete({ caseId, clientId, caseSubject: caseItem.subject });
            setIsDeleteCaseModalOpen(true);
        }
    };
    
    const handleConfirmDeleteCase = () => {
        if (!caseToDelete) return;

        // Delete associated accounting entries first
        setAccountingEntries(prev => prev.filter(e => e.caseId !== caseToDelete.caseId));
        
        // Then delete the case itself
        setClients(prevClients =>
            prevClients.map(client =>
                client.id === caseToDelete.clientId
                    ? { ...client, cases: client.cases.filter(c => c.id !== caseToDelete.caseId) }
                    : client
            )
        );
        
        closeDeleteCaseModal();
    };

    const closeDeleteCaseModal = () => {
        setIsDeleteCaseModalOpen(false);
        setCaseToDelete(null);
    };


    const handleDeleteStage = (stageId: string, caseId: string, clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(c => c.id === caseId);
        const stage = caseItem?.stages.find(s => s.id === stageId);

        if (stage) {
            setStageToDelete({
                stageId,
                caseId,
                clientId,
                stageInfo: `مرحلة المحكمة "${stage.court}" برقم أساس "${stage.caseNumber}"`
            });
            setIsDeleteStageModalOpen(true);
        }
    };

    const handleConfirmDeleteStage = () => {
        if (!stageToDelete) return;

        const { stageId, caseId, clientId } = stageToDelete;
        setClients(prev => prev.map(c => c.id === clientId ? {
            ...c,
            cases: c.cases.map(cs => cs.id === caseId ? {
                ...cs,
                stages: cs.stages.filter(st => st.id !== stageId)
            } : cs)
        } : c));

        closeDeleteStageModal();
    };

    const closeDeleteStageModal = () => {
        setIsDeleteStageModalOpen(false);
        setStageToDelete(null);
    };


    const handleDeleteSession = (sessionId: string, stageId: string, caseId: string, clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(c => c.id === caseId);
        const stage = caseItem?.stages.find(s => s.id === stageId);
        const session = stage?.sessions.find(s => s.id === sessionId);

        if (!session) return;

        let message = `هل أنت متأكد من حذف جلسة ${formatDate(session.date)} لقضية "${caseItem?.subject}"؟`;
        if (session.isPostponed && session.nextSessionDate) {
            message += `\nتحذير: هذه الجلسة مرحّلة. حذفها قد يؤدي إلى عدم اتساق البيانات إذا لم تقم بحذف الجلسة التالية المرتبطة بها أيضاً.`;
        }
        
        setSessionToDelete({ sessionId, stageId, caseId, clientId, message });
        setIsDeleteSessionModalOpen(true);
    };

    const handleConfirmDeleteSession = () => {
        if (!sessionToDelete) return;
        const { sessionId, stageId, caseId, clientId } = sessionToDelete;
         setClients(prev => prev.map(c => c.id === clientId ? {
            ...c,
            cases: c.cases.map(cs => cs.id === caseId ? {
                ...cs,
                stages: cs.stages.map(st => st.id === stageId ? {
                    ...st,
                    sessions: st.sessions.filter(s => s.id !== sessionId)
                } : st)
            } : cs)
        } : c));
        closeDeleteSessionModal();
    };
    
    const closeDeleteSessionModal = () => {
        setIsDeleteSessionModalOpen(false);
        setSessionToDelete(null);
    };
    
    // --- Printing Logic ---

    const handleOpenPrintChoice = (client: Client) => {
        setClientForPrintChoice(client);
        setIsPrintChoiceModalOpen(true);
    };

    const handleGeneratePrintData = (clientId: string, caseId?: string) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return;
    
        let reportCase: Case | undefined;
        let reportEntries: AccountingEntry[];
    
        if (caseId) {
            // Report for a specific case
            reportCase = client.cases.find(c => c.id === caseId);
            if (!reportCase) return;
            reportEntries = accountingEntries.filter(e => e.caseId === caseId);
        } else {
            // Report for the whole client
            const clientCaseIds = client.cases.map(c => c.id);
            reportEntries = accountingEntries.filter(e => e.clientId === clientId || clientCaseIds.includes(e.caseId));
        }
    
        const totals = reportEntries.reduce((acc, entry) => {
            if (entry.type === 'income') acc.income += entry.amount;
            else acc.expense += entry.amount;
            return acc;
        }, { income: 0, expense: 0 });
    
        setPrintData({
            client: client,
            caseData: reportCase,
            entries: reportEntries.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
            totals: { ...totals, balance: totals.income - totals.expense }
        });
        
        setIsPrintChoiceModalOpen(false);
        setIsPrintModalOpen(true);
    };
    
    const handleOpenDecideModal = (session: Session, stage: Stage) => {
        setDecideFormData({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });
        setDecideModal({ isOpen: true, session, stage });
    };

    const handleCloseDecideModal = () => {
        setDecideModal({ isOpen: false });
    };

    const handleDecideSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const { session, stage } = decideModal;
        if (!session || !stage) return;

        setClients(currentClients => currentClients.map(client => ({
            ...client,
            cases: client.cases.map(c => ({
                ...c,
                stages: c.stages.map(st => {
                    if (st.id === stage.id) {
                        return {
                            ...st,
                            decisionDate: session.date,
                            decisionNumber: decideFormData.decisionNumber,
                            decisionSummary: decideFormData.decisionSummary,
                            decisionNotes: decideFormData.decisionNotes,
                        };
                    }
                    return st;
                })
            }))
        })));
        
        handleCloseDecideModal();
    };

    
    const getModalTitle = () => {
        if (!modal.type) return '';
        const action = modal.isEditing ? 'تعديل' : 'إضافة';
        switch (modal.type) {
            case 'client': return `${action} موكل`;
            case 'case': return `${action} قضية`;
            case 'stage': return `${action} مرحلة`;
            case 'session': return `${action} جلسة`;
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800">الموكلين</h1>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-grow">
                        <input 
                            type="search" 
                            placeholder="ابحث عن موكل، قضية، خصم..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                        />
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                            <SearchIcon className="w-4 h-4 text-gray-500" />
                        </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                         <div className="bg-gray-200 rounded-lg p-0.5 flex">
                            <button 
                                onClick={() => setViewMode('tree')} 
                                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'tree' ? 'bg-white shadow' : 'text-gray-600'}`}
                            >
                                <ViewColumnsIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => setViewMode('list')} 
                                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow' : 'text-gray-600'}`}
                            >
                                <ListBulletIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <button onClick={() => handleOpenModal('client')} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                            <PlusIcon className="w-5 h-5" />
                            <span>إضافة موكل</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                {viewMode === 'tree' ? (
                     <ClientsTreeView 
                        clients={filteredClients} 
                        setClients={setClients}
                        accountingEntries={accountingEntries}
                        setAccountingEntries={setAccountingEntries}
                        onAddCase={(clientId) => handleOpenModal('case', false, { clientId })}
                        onEditCase={(caseItem, client) => handleOpenModal('case', true, { item: caseItem, client })}
                        onDeleteCase={handleDeleteCase}
                        onAddStage={(clientId, caseId) => handleOpenModal('stage', false, { clientId, caseId })}
                        onEditStage={(stage, caseItem, client) => handleOpenModal('stage', true, { item: stage, case: caseItem, client })}
                        onDeleteStage={handleDeleteStage}
                        onAddSession={(clientId, caseId, stageId) => handleOpenModal('session', false, { clientId, caseId, stageId })}
                        onEditSession={(session, stage, caseItem, client) => handleOpenModal('session', true, { item: session, stage, case: caseItem, client })}
                        onDeleteSession={handleDeleteSession}
                        onPostponeSession={(sessionId, newDate, reason) => onUpdateSession(sessionId, { nextSessionDate: newDate, nextPostponementReason: reason, isPostponed: true })}
                        onEditClient={(client) => handleOpenModal('client', true, { item: client })}
                        onDeleteClient={(clientId) => handleDeleteClient(clients.find(c => c.id === clientId)!)}
                        onPrintClientStatement={(clientId) => handleOpenPrintChoice(clients.find(c => c.id === clientId)!)}
                        assistants={assistants}
                        onUpdateSession={onUpdateSession}
                        onDecide={(session, stage) => handleOpenDecideModal(session, stage)}
                    />
                ) : (
                    <ClientsListView 
                        clients={filteredClients}
                        setClients={setClients}
                        accountingEntries={accountingEntries}
                        setAccountingEntries={setAccountingEntries}
                        onAddCase={(clientId) => handleOpenModal('case', false, { clientId })}
                        onEditCase={(caseItem, client) => handleOpenModal('case', true, { item: caseItem, client })}
                        onDeleteCase={handleDeleteCase}
                        onAddStage={(clientId, caseId) => handleOpenModal('stage', false, { clientId, caseId })}
                        onEditStage={(stage, caseItem, client) => handleOpenModal('stage', true, { item: stage, case: caseItem, client })}
                        onDeleteStage={handleDeleteStage}
                        onAddSession={(clientId, caseId, stageId) => handleOpenModal('session', false, { clientId, caseId, stageId })}
                        onEditSession={(session, stage, caseItem, client) => handleOpenModal('session', true, { item: session, stage, case: caseItem, client })}
                        onDeleteSession={handleDeleteSession}
                        onPostponeSession={(sessionId, newDate, reason) => onUpdateSession(sessionId, { nextSessionDate: newDate, nextPostponementReason: reason, isPostponed: true })}
                        onEditClient={(client) => handleOpenModal('client', true, { item: client })}
                        onDeleteClient={(clientId) => handleDeleteClient(clients.find(c => c.id === clientId)!)}
                        onPrintClientStatement={(clientId) => handleOpenPrintChoice(clients.find(c => c.id === clientId)!)}
                        assistants={assistants}
                        onUpdateSession={onUpdateSession}
                        onDecide={(session, stage) => handleOpenDecideModal(session, stage)}
                    />
                )}
            </div>

            {modal.type && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{getModalTitle()}</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {modal.type === 'client' && (
                                <>
                                    <div><label className="block text-sm font-medium">اسم الموكل</label><input type="text" name="name" value={formData.name || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    <div><label className="block text-sm font-medium">معلومات الاتصال</label><input type="text" name="contactInfo" value={formData.contactInfo || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                </>
                            )}
                             {modal.type === 'case' && (
                                <>
                                    <div><label className="block text-sm font-medium">موضوع القضية</label><input type="text" name="subject" value={formData.subject || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    <div><label className="block text-sm font-medium">اسم الخصم</label><input type="text" name="opponentName" value={formData.opponentName || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                    <div><label className="block text-sm font-medium">اتفاقية الأتعاب</label><input type="text" name="feeAgreement" value={formData.feeAgreement || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                    <div>
                                        <label className="block text-sm font-medium">الحالة</label>
                                        <select name="status" value={formData.status || 'active'} onChange={handleFormChange} className="w-full p-2 border rounded">
                                            <option value="active">نشطة</option>
                                            <option value="closed">مغلقة</option>
                                            <option value="on_hold">معلقة</option>
                                        </select>
                                    </div>
                                    {!modal.isEditing && (
                                        <div className="p-4 bg-gray-50 rounded-lg border mt-4">
                                            <h3 className="text-md font-semibold text-gray-700 mb-2">إضافة مرحلة أولى (اختياري)</h3>
                                            <div className="space-y-2">
                                                <div><label className="block text-xs font-medium">المحكمة</label><input type="text" name="court" value={formData.court || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                                <div><label className="block text-xs font-medium">رقم الأساس</label><input type="text" name="caseNumber" value={formData.caseNumber || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                                <div><label className="block text-xs font-medium">تاريخ أول جلسة</label><input type="date" name="firstSessionDate" value={formData.firstSessionDate || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                             {modal.type === 'stage' && (
                                <>
                                    <div><label className="block text-sm font-medium">المحكمة</label><input type="text" name="court" value={formData.court || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    <div><label className="block text-sm font-medium">رقم الأساس</label><input type="text" name="caseNumber" value={formData.caseNumber || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                    <div><label className="block text-sm font-medium">تاريخ أول جلسة</label><input type="date" name="firstSessionDate" value={formData.firstSessionDate || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                </>
                            )}
                             {modal.type === 'session' && (
                                <>
                                    <div><label className="block text-sm font-medium">تاريخ الجلسة</label><input type="date" name="date" value={formData.date || ''} onChange={handleFormChange} className="w-full p-2 border rounded" placeholder="DD/MM/YYYY" required /></div>
                                    <div><label className="block text-sm font-medium">سبب التأجيل (إن وجد)</label><input type="text" name="postponementReason" value={formData.postponementReason || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                    <div>
                                        <label className="block text-sm font-medium">الشخص المسؤول عن الحضور</label>
                                        <select name="assignee" value={formData.assignee || 'بدون تخصيص'} onChange={handleFormChange} className="w-full p-2 border rounded">
                                            {assistants.map(name => <option key={name} value={name}>{name}</option>)}
                                        </select>
                                    </div>
                                    {modal.isEditing && (
                                        <div className="mt-4 p-4 border rounded-lg bg-yellow-50">
                                            <h3 className="font-semibold text-yellow-800">ترحيل الجلسة</h3>
                                            <div className="flex items-center gap-2 mt-2">
                                                <input type="checkbox" id="isPostponed" name="isPostponed" checked={formData.isPostponed || false} onChange={handleFormChange} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                                <label htmlFor="isPostponed">هذه الجلسة تم ترحيلها</label>
                                            </div>
                                            {formData.isPostponed && (
                                                <div className="space-y-2 mt-2 animate-fade-in">
                                                    <div><label className="block text-sm font-medium">تاريخ الجلسة القادمة</label><input type="date" name="nextSessionDate" value={formData.nextSessionDate || ''} onChange={handleFormChange} className="w-full p-2 border rounded" placeholder="DD/MM/YYYY" /></div>
                                                    <div><label className="block text-sm font-medium">سبب التأجيل القادم</label><input type="text" name="nextPostponementReason" value={formData.nextPostponementReason || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isDeleteClientModalOpen && clientToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteClientModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الموكل</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف الموكل "{clientToDelete.name}"؟<br />سيتم حذف جميع القضايا والجلسات والقيود المحاسبية المرتبطة به. هذا الإجراء لا يمكن التراجع عنه.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300" onClick={closeDeleteClientModal}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700" onClick={handleConfirmDeleteClient}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isDeleteCaseModalOpen && caseToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteCaseModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600" aria-hidden="true" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف القضية</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف قضية "{caseToDelete.caseSubject}"؟<br />سيتم حذف جميع مراحلها وجلساتها والقيود المحاسبية المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300" onClick={closeDeleteCaseModal}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700" onClick={handleConfirmDeleteCase}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
            
            {isDeleteStageModalOpen && stageToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteStageModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف المرحلة</h3>
                            <p className="text-gray-600 my-4">هل أنت متأكد من حذف "{stageToDelete.stageInfo}"؟<br />سيتم حذف جميع جلساتها. هذا الإجراء لا يمكن التراجع عنه.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={closeDeleteStageModal}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={handleConfirmDeleteStage}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteSessionModalOpen && sessionToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={closeDeleteSessionModal}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold text-gray-900">تأكيد حذف الجلسة</h3>
                            <p className="text-gray-600 my-4 whitespace-pre-line">{sessionToDelete.message}</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button type="button" className="px-6 py-2 bg-gray-200 rounded-lg" onClick={closeDeleteSessionModal}>إلغاء</button>
                            <button type="button" className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={handleConfirmDeleteSession}>نعم، قم بالحذف</button>
                        </div>
                    </div>
                </div>
            )}
            
            {decideModal.isOpen && decideModal.session && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseDecideModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">تسجيل قرار حاسم</h2>
                        <form onSubmit={handleDecideSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">تاريخ الحسم</label>
                                <input type="date" value={toInputDateString(decideModal.session.date)} readOnly className="w-full p-2 border rounded bg-gray-100" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">رقم القرار</label>
                                <input type="text" value={decideFormData.decisionNumber} onChange={e => setDecideFormData(p => ({...p, decisionNumber: e.target.value}))} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">ملخص القرار</label>
                                <textarea value={decideFormData.decisionSummary} onChange={e => setDecideFormData(p => ({...p, decisionSummary: e.target.value}))} className="w-full p-2 border rounded" rows={3}></textarea>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">ملاحظات</label>
                                <textarea value={decideFormData.decisionNotes} onChange={e => setDecideFormData(p => ({...p, decisionNotes: e.target.value}))} className="w-full p-2 border rounded" rows={2}></textarea>
                            </div>
                            <div className="mt-6 flex justify-end gap-4">
                                <button type="button" onClick={handleCloseDecideModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">حفظ القرار</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
             {isPrintChoiceModalOpen && clientForPrintChoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={() => setIsPrintChoiceModalOpen(false)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 border-b pb-3">اختر التقرير المراد طباعته لـِ: {clientForPrintChoice.name}</h2>
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            <button
                                onClick={() => handleGeneratePrintData(clientForPrintChoice.id)}
                                className="w-full text-right px-4 py-3 bg-blue-50 text-blue-800 font-semibold rounded-lg hover:bg-blue-100 transition-colors"
                            >
                                كشف حساب شامل للموكل
                            </button>
                            <h3 className="text-md font-semibold text-gray-600 pt-2">أو طباعة كشف حساب لقضية محددة:</h3>
                            {clientForPrintChoice.cases.map(caseItem => (
                                <button
                                    key={caseItem.id}
                                    onClick={() => handleGeneratePrintData(clientForPrintChoice.id, caseItem.id)}
                                    className="w-full text-right block px-4 py-2 bg-gray-50 text-gray-800 rounded-md hover:bg-gray-100 transition-colors"
                                >
                                    {caseItem.subject} (ضد: {caseItem.opponentName})
                                </button>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end">
                            <button type="button" onClick={() => setIsPrintChoiceModalOpen(false)} className="px-6 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors">إغلاق</button>
                        </div>
                    </div>
                </div>
            )}

            {isPrintModalOpen && printData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] no-print" onClick={() => setIsPrintModalOpen(false)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="overflow-y-auto" ref={printClientReportRef}>
                            <PrintableClientReport 
                                client={printData.client} 
                                caseData={printData.caseData}
                                entries={printData.entries}
                                totals={printData.totals}
                            />
                        </div>
                        <div className="mt-6 flex justify-end gap-4 border-t pt-4">
                            <button type="button" onClick={() => setIsPrintModalOpen(false)} className="px-6 py-2 bg-gray-200 rounded-lg">إغلاق</button>
                            <button type="button" onClick={() => printElement(printClientReportRef.current)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg"><PrintIcon className="w-5 h-5"/>طباعة</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// FIX: Add default export to make the component importable.
export default ClientsPage;