import * as React from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import ClientsTreeView from '../components/ClientsTreeView';
import ClientsListView from '../components/ClientsListView';
import { PlusIcon, SearchIcon, ListBulletIcon, ViewColumnsIcon, ExclamationTriangleIcon, PrintIcon, ScaleIcon, FolderOpenIcon, SparklesIcon, ArrowPathIcon } from '../components/icons';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { formatDate, toInputDateString } from '../utils/dateUtils';
import PrintableClientReport from '../components/PrintableClientReport';
import { printElement } from '../utils/printUtils';
import { MenuItem } from '../components/ContextMenu';
import { useDebounce } from '../hooks/useDebounce';
import { useData } from '../App';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface ClientsPageProps {
    onOpenAdminTaskModal: (initialData?: any) => void;
    showContextMenu: (event: React.MouseEvent, menuItems: MenuItem[]) => void;
    onCreateInvoice: (clientId: string, caseId?: string) => void;
}

const ClientsPage: React.FC<ClientsPageProps> = ({ showContextMenu, onOpenAdminTaskModal, onCreateInvoice }) => {
    const { clients, setClients, accountingEntries, setAccountingEntries, assistants, setFullData, invoices, adminTasks, appointments, deleteClient, deleteCase, deleteStage, deleteSession } = useData();
    const [modal, setModal] = React.useState<{ type: 'client' | 'case' | 'stage' | 'session' | null, context?: any, isEditing: boolean }>({ type: null, isEditing: false });
    const [formData, setFormData] = React.useState<any>({});
    const [searchQuery, setSearchQuery] = React.useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
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
    
    // State for AI data generation
    const [isGenerating, setIsGenerating] = React.useState(false);
    const isOnline = useOnlineStatus();


    const filteredClients = React.useMemo(() => {
        if (!debouncedSearchQuery) return clients;
        const lowercasedQuery = debouncedSearchQuery.toLowerCase();

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
    }, [clients, debouncedSearchQuery]);


    const handleOpenModal = (type: 'client' | 'case' | 'stage' | 'session', isEditing = false, context: any = {}) => {
        setModal({ type, context, isEditing });
        if (isEditing && context.item) {
            const item = context.item;
            if (type === 'session') {
                 setFormData({ ...item, date: toInputDateString(item.date), nextSessionDate: toInputDateString(item.nextSessionDate) });
            } else if (type === 'stage') {
                const { firstSessionDate, decisionDate, ...restOfStage } = item;
                setFormData({ 
                    ...restOfStage, 
                    firstSessionDate: toInputDateString(firstSessionDate),
                    decisionDate: toInputDateString(decisionDate)
                });
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

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
                updated_at: new Date(),
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    updated_at: new Date(),
                    stages: caseItem.stages.map(stage => {
                        const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIndex === -1) {
                            return stage;
                        }

                        const updatedSessions = [...stage.sessions];
                        const currentSession = updatedSessions[sessionIndex];
                        
                        // Logic for postponing: create a new session and update the old one
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
                                    updated_at: new Date(),
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
                                    updated_at: new Date(),
                                };
                                updatedSessions.push(newSession);
                            }
                        } else {
                             // Regular update
                             updatedSessions[sessionIndex] = { ...currentSession, ...updatedFields, updated_at: new Date() };
                        }

                        return { ...stage, sessions: updatedSessions, updated_at: new Date() };
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
                if (!isEditing) {
                    alert(`تنبيه: الموكل "${clientName}" موجود بالفعل.`);
                    return;
                }
                if (isEditing && context?.item?.id !== foundClient.id) {
                     alert(`تنبيه: الموكل "${clientName}" موجود بالفعل.`);
                     return;
                }
            }
            
            if (isEditing) {
                 if (context?.item?.id) {
                    setClients(prev => prev.map(c => c.id === context.item.id ? { ...c, ...formData, name: clientName, updated_at: new Date() } : c));
                }
            } else {
                const newClient: Client = { 
                    id: `client-${Date.now()}`, 
                    name: clientName, 
                    contactInfo: formData.contactInfo || '', 
                    cases: [],
                    updated_at: new Date(),
                };
                setClients(prev => [...prev, newClient]);
            }
        } else if (type === 'case') {
            if (isEditing) {
                setClients(prev => prev.map(c => c.id === context.client.id ? {
                    ...c,
                    updated_at: new Date(),
                    cases: c.cases.map(cs => cs.id === context.item.id ? { ...cs, ...formData, updated_at: new Date() } : cs)
                } : c));
            } else {
                const clientForCase = clients.find(c => c.id === context.clientId);
                if (clientForCase) {
                    const newCase: Case = {
                        id: `case-${Date.now()}`,
                        subject: formData.subject || 'قضية بدون موضوع',
                        opponentName: formData.opponentName || '',
                        feeAgreement: formData.feeAgreement || '',
                        status: formData.status || 'active',
                        clientName: clientForCase.name,
                        stages: [],
                        updated_at: new Date(),
                    };
        
                    const { court, caseNumber, firstSessionDate, firstSessionReason } = formData;
                    if (court || caseNumber || firstSessionDate) {
                        const newStage: Stage = {
                            id: `stage-${Date.now()}`,
                            court: court || 'غير محدد',
                            caseNumber: caseNumber || '',
                            firstSessionDate: firstSessionDate ? new Date(firstSessionDate) : undefined,
                            sessions: [],
                            updated_at: new Date(),
                        };
        
                        if (firstSessionDate) {
                            const newSession: Session = {
                                id: `session-${Date.now()}-first`,
                                court: newStage.court,
                                caseNumber: newStage.caseNumber,
                                date: new Date(firstSessionDate),
                                clientName: clientForCase.name,
                                opponentName: newCase.opponentName,
                                isPostponed: false,
                                postponementReason: firstSessionReason || undefined,
                                assignee: 'بدون تخصيص',
                                updated_at: new Date(),
                            };
                            newStage.sessions.push(newSession);
                        }
        
                        newCase.stages.push(newStage);
                    }
        
                    setClients(prev => prev.map(c => c.id === context.clientId ? { ...c, updated_at: new Date(), cases: [...c.cases, newCase] } : c));
                }
            }
        } else if (type === 'stage') {
            if (isEditing) {
                const stageData = { ...formData, updated_at: new Date() };
                stageData.firstSessionDate = stageData.firstSessionDate ? new Date(stageData.firstSessionDate) : undefined;
                stageData.decisionDate = stageData.decisionDate ? new Date(stageData.decisionDate) : undefined;
                
                setClients(prev => prev.map(c => c.id === context.client.id ? {
                    ...c,
                    updated_at: new Date(),
                    cases: c.cases.map(cs => cs.id === context.case.id ? {
                        ...cs,
                        updated_at: new Date(),
                        stages: cs.stages.map(st => st.id === context.item.id ? { ...st, ...stageData } : st)
                    } : cs)
                } : c));
            } else {
                const stageData = { ...formData };
                const newStage: Stage = {
                    id: `stage-${Date.now()}`,
                    court: stageData.court || 'غير محدد',
                    caseNumber: stageData.caseNumber || '',
                    firstSessionDate: stageData.firstSessionDate ? new Date(stageData.firstSessionDate) : undefined,
                    sessions: [],
                    updated_at: new Date(),
                };
                 if (newStage.firstSessionDate) {
                    const client = clients.find(c => c.id === context.clientId);
                    const caseItem = client?.cases.find(c => c.id === context.caseId);
                    if (client && caseItem) {
                        newStage.sessions.push({
                            id: `session-${Date.now()}-first`,
                            court: newStage.court,
                            caseNumber: newStage.caseNumber,
                            date: newStage.firstSessionDate,
                            clientName: client.name,
                            opponentName: caseItem.opponentName,
                            isPostponed: false,
                            postponementReason: stageData.firstSessionReason || undefined,
                            assignee: 'بدون تخصيص',
                            updated_at: new Date(),
                        });
                    }
                }
                setClients(prev => prev.map(c => c.id === context.clientId ? {
                    ...c,
                    updated_at: new Date(),
                    cases: c.cases.map(cs => cs.id === context.caseId ? { ...cs, updated_at: new Date(), stages: [...cs.stages, newStage] } : cs)
                } : c));
            }
        } else if (type === 'session') {
            if (isEditing) {
                 const sessionData = { ...formData, updated_at: new Date() };
                 sessionData.date = new Date(sessionData.date);
                 sessionData.nextSessionDate = sessionData.nextSessionDate ? new Date(sessionData.nextSessionDate) : undefined;

                 setClients(prev => prev.map(c => c.id === context.client.id ? {
                    ...c,
                    updated_at: new Date(),
                    cases: c.cases.map(cs => cs.id === context.case.id ? {
                        ...cs,
                        updated_at: new Date(),
                        stages: cs.stages.map(st => st.id === context.stage.id ? {
                            ...st,
                            updated_at: new Date(),
                            sessions: st.sessions.map(s => s.id === context.item.id ? { ...s, ...sessionData } : s)
                        } : st)
                    } : cs)
                } : c));
            } else {
                const newSession: Session = {
                    id: `session-${Date.now()}`,
                    date: new Date(formData.date),
                    court: formData.court,
                    caseNumber: formData.caseNumber,
                    clientName: formData.clientName,
                    opponentName: formData.opponentName,
                    isPostponed: false,
                    assignee: formData.assignee,
                    updated_at: new Date(),
                };
                 setClients(prev => prev.map(c => c.id === context.clientId ? {
                    ...c,
                    updated_at: new Date(),
                    cases: c.cases.map(cs => cs.id === context.caseId ? {
                        ...cs,
                        updated_at: new Date(),
                        stages: cs.stages.map(st => st.id === context.stageId ? { ...st, updated_at: new Date(), sessions: [...st.sessions, newSession] } : st)
                    } : cs)
                } : c));
            }
        }

        handleCloseModal();
    };
    
    // Deletion Handlers
    const handleDeleteClient = (client: Client) => {
        setClientToDelete(client);
        setIsDeleteClientModalOpen(true);
    };

    const handleConfirmDeleteClient = () => {
        if (clientToDelete) {
            deleteClient(clientToDelete.id);
        }
        setIsDeleteClientModalOpen(false);
        setClientToDelete(null);
    };

    const handleDeleteCase = (caseId: string, clientId: string, caseSubject: string) => {
        setCaseToDelete({ caseId, clientId, caseSubject });
        setIsDeleteCaseModalOpen(true);
    };
    
    const handleConfirmDeleteCase = () => {
        if (caseToDelete) {
            deleteCase(caseToDelete.caseId, caseToDelete.clientId);
        }
        setIsDeleteCaseModalOpen(false);
        setCaseToDelete(null);
    };

    const handleDeleteStage = (stageId: string, caseId: string, clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        const caseItem = client?.cases.find(c => c.id === caseId);
        const stage = caseItem?.stages.find(s => s.id === stageId);
        if (stage) {
            setStageToDelete({ stageId, caseId, clientId, stageInfo: `${stage.court} - ${stage.caseNumber}` });
            setIsDeleteStageModalOpen(true);
        }
    };
    
    const handleConfirmDeleteStage = () => {
        if (stageToDelete) {
            deleteStage(stageToDelete.stageId, stageToDelete.caseId, stageToDelete.clientId);
        }
        setIsDeleteStageModalOpen(false);
        setStageToDelete(null);
    };

    const handleDeleteSession = (sessionId: string, stageId: string, caseId: string, clientId: string) => {
        const session = clients.find(c => c.id === clientId)?.cases.find(cs => cs.id === caseId)?.stages.find(st => st.id === stageId)?.sessions.find(s => s.id === sessionId);
        if (session) {
            const message = `جلسة يوم ${formatDate(session.date)} في قضية ${session.clientName}`;
            setSessionToDelete({ sessionId, stageId, caseId, clientId, message });
            setIsDeleteSessionModalOpen(true);
        }
    };

    const handleConfirmDeleteSession = () => {
        if (sessionToDelete) {
            deleteSession(sessionToDelete.sessionId, sessionToDelete.stageId, sessionToDelete.caseId, sessionToDelete.clientId);
        }
        setIsDeleteSessionModalOpen(false);
        setSessionToDelete(null);
    };


    const handlePostponeSession = (sessionId: string, newDate: Date, newReason: string) => {
        onUpdateSession(sessionId, { nextSessionDate: newDate, nextPostponementReason: newReason });
    };

    // Printing Handlers
    const handlePrintClient = (client: Client, caseItem?: Case) => {
        const entries = caseItem 
            ? accountingEntries.filter(e => e.caseId === caseItem.id)
            : accountingEntries.filter(e => e.clientId === client.id);

        const totals = entries.reduce((acc, entry) => {
            if (entry.type === 'income') acc.income += entry.amount;
            else acc.expense += entry.amount;
            return acc;
        }, { income: 0, expense: 0, balance: 0 });
        totals.balance = totals.income - totals.expense;

        setPrintData({ client, caseData: caseItem, entries, totals });
        setIsPrintChoiceModalOpen(false);
        setIsPrintModalOpen(true);
    };
    
    const openPrintChoiceModal = (clientId: string) => {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setClientForPrintChoice(client);
            setIsPrintChoiceModalOpen(true);
        }
    };

    // Decide Session handlers
    const handleOpenDecideModal = (session: Session) => {
        if (!session.stageId) return;

        let foundStage: Stage | null = null;
        for (const client of clients) {
            for (const caseItem of client.cases) {
                const stage = caseItem.stages.find(st => st.id === session.stageId);
                if (stage) {
                    foundStage = stage;
                    break;
                }
            }
            if (foundStage) break;
        }

        if (!foundStage) {
            console.error("Cannot decide session: Corresponding stage not found for stageId:", session.stageId);
            return;
        }

        setDecideFormData({ decisionNumber: '', decisionSummary: '', decisionNotes: '' });
        setDecideModal({ isOpen: true, session, stage: foundStage });
    };

    const handleCloseDecideModal = () => setDecideModal({ isOpen: false });
    
    const handleDecideSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const { session, stage } = decideModal;
        if (!session || !stage) return;

        setClients(currentClients => currentClients.map(client => ({
            ...client,
            updated_at: new Date(),
            cases: client.cases.map(c => ({
                ...c,
                updated_at: new Date(),
                stages: c.stages.map(st => {
                    if (st.id === stage.id) {
                        return {
                            ...st,
                            decisionDate: session.date,
                            decisionNumber: decideFormData.decisionNumber,
                            decisionSummary: decideFormData.decisionSummary,
                            decisionNotes: decideFormData.decisionNotes,
                            updated_at: new Date(),
                        };
                    }
                    return st;
                })
            }))
        })));
        
        handleCloseDecideModal();
    };
    
     const generateSampleData = async () => {
        setIsGenerating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: "Generate a realistic but entirely fictional dataset for a Syrian lawyer's office management app. Provide the data in a single JSON object. The JSON should have a root key named `appData` containing four arrays: `clients`, `adminTasks`, `appointments`, and `accountingEntries`. Follow the provided TypeScript interfaces precisely. Generate around 5 clients, with 1-2 cases each, and a few stages and sessions per case. Use realistic Syrian names, court names, and legal scenarios. Dates should be relative to today. Ensure all nested structures (cases in clients, stages in cases, sessions in stages) are correctly populated. Generate about 5 admin tasks, 5 appointments, and 10 accounting entries, linking some accounting entries to the generated clients and cases. The `assistants` list should be ['أحمد', 'فاطمة', 'سارة', 'بدون تخصيص']. For IDs, use placeholders like 'client-1', 'case-1-1', etc. for clarity. For `updated_at`, use the current timestamp placeholder. All text should be in Arabic. For dates, use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ).",
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            appData: {
                                type: Type.OBJECT,
                                properties: {
                                    clients: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                                    adminTasks: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                                    appointments: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                                    accountingEntries: { type: Type.ARRAY, items: { type: Type.OBJECT } },
                                    assistants: { type: Type.ARRAY, items: { type: Type.STRING } },
                                }
                            }
                        }
                    }
                }
            });
            const jsonText = response.text.trim();
            const parsedData = JSON.parse(jsonText);

            if (parsedData && parsedData.appData) {
                const uniqueIdPrefix = Date.now();
                const generatedData = parsedData.appData;

                // Simple re-IDing logic
                const reId = (item: any, prefix: string, index: number) => ({ ...item, id: `${prefix}-${uniqueIdPrefix}-${index}` });

                generatedData.clients = generatedData.clients.map((c: any, cIdx: number) => {
                    const newClient = reId(c, 'client', cIdx);
                    newClient.cases = (c.cases || []).map((cs: any, csIdx: number) => {
                        const newCase = reId(cs, `case-${cIdx}`, csIdx);
                        newCase.stages = (cs.stages || []).map((st: any, stIdx: number) => {
                            const newStage = reId(st, `stage-${csIdx}`, stIdx);
                            newStage.sessions = (st.sessions || []).map((s: any, sIdx: number) => reId(s, `session-${stIdx}`, sIdx));
                            return newStage;
                        });
                        return newCase;
                    });
                    return newClient;
                });
                generatedData.adminTasks = (generatedData.adminTasks || []).map((t: any, i: number) => reId(t, 'task', i));
                generatedData.appointments = (generatedData.appointments || []).map((a: any, i: number) => reId(a, 'apt', i));
                generatedData.accountingEntries = (generatedData.accountingEntries || []).map((e: any, i: number) => reId(e, 'acc', i));

                setFullData(generatedData);
            }
        } catch (error) {
            console.error("AI data generation failed:", error);
            alert("فشل إنشاء البيانات التجريبية. يرجى التأكد من إعدادات مفتاح API.");
        } finally {
            setIsGenerating(false);
        }
    };


    const commonViewProps = {
        clients: filteredClients,
        setClients,
        accountingEntries,
        setAccountingEntries,
        onAddCase: (clientId: string) => handleOpenModal('case', false, { clientId }),
        onEditCase: (caseItem: Case, client: Client) => handleOpenModal('case', true, { item: caseItem, client }),
        onDeleteCase: (caseId: string, clientId: string) => {
             const caseToDelete = clients.find(c => c.id === clientId)?.cases.find(cs => cs.id === caseId);
             if (caseToDelete) {
                handleDeleteCase(caseId, clientId, caseToDelete.subject);
             }
        },
        onAddStage: (clientId: string, caseId: string) => handleOpenModal('stage', false, { clientId, caseId }),
        onEditStage: (stage: Stage, caseItem: Case, client: Client) => handleOpenModal('stage', true, { item: stage, case: caseItem, client }),
        onDeleteStage: (stageId: string, caseId: string, clientId: string) => handleDeleteStage(stageId, caseId, clientId),
        onAddSession: (clientId: string, caseId: string, stageId: string) => {
            const client = clients.find(c => c.id === clientId);
            const caseItem = client?.cases.find(c => c.id === caseId);
            const stage = caseItem?.stages.find(s => s.id === stageId);
            if (client && caseItem && stage) {
                handleOpenModal('session', false, { 
                    clientId, caseId, stageId, 
                    court: stage.court, 
                    caseNumber: stage.caseNumber, 
                    clientName: client.name, 
                    opponentName: caseItem.opponentName 
                });
            }
        },
        onEditSession: (session: Session, stage: Stage, caseItem: Case, client: Client) => handleOpenModal('session', true, { item: session, stage, case: caseItem, client }),
        onDeleteSession: handleDeleteSession,
        onPostponeSession: handlePostponeSession,
        onEditClient: (client: Client) => handleOpenModal('client', true, { item: client }),
        onDeleteClient: (clientId: string) => {
            const client = clients.find(c => c.id === clientId);
            if (client) handleDeleteClient(client);
        },
        onPrintClientStatement: openPrintChoiceModal,
        assistants,
        onUpdateSession,
        onDecide: handleOpenDecideModal,
        showContextMenu,
        onOpenAdminTaskModal,
        onCreateInvoice
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                    <FolderOpenIcon className="w-8 h-8"/>
                    <span>ملفات الموكلين</span>
                </h1>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                     <div className="relative flex-grow">
                        <input 
                            type="search" 
                            placeholder="ابحث..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                        />
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                            <SearchIcon className="w-4 h-4 text-gray-500" />
                        </div>
                    </div>
                    <button onClick={() => handleOpenModal('client')} className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                        <PlusIcon className="w-5 h-5" />
                        <span>إضافة موكل</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setViewMode('tree')} className={`p-2 rounded-lg ${viewMode === 'tree' ? 'bg-gray-300' : 'bg-gray-100 hover:bg-gray-200'}`}><ViewColumnsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg ${viewMode === 'list' ? 'bg-gray-300' : 'bg-gray-100 hover:bg-gray-200'}`}><ListBulletIcon className="w-5 h-5"/></button>
                    </div>
                </div>
            </div>
            
             {clients.length === 0 && (
                 <div className="text-center py-12 px-6 bg-white rounded-lg shadow">
                    <h2 className="text-xl font-semibold text-gray-700">لا يوجد موكلون بعد</h2>
                    <p className="text-gray-500 mt-2">ابدأ بإضافة موكلك الأول، أو دع الذكاء الاصطناعي ينشئ لك بعض البيانات التجريبية لتبدأ.</p>
                    <div className="mt-6">
                        <button 
                            onClick={generateSampleData}
                            disabled={isGenerating || !isOnline}
                            title={!isOnline ? "هذه الميزة تتطلب اتصالاً بالإنترنت" : "إنشاء بيانات باستخدام الذكاء الاصطناعي"}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors disabled:bg-purple-300 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                            <span>{isGenerating ? 'جاري الإنشاء...' : 'إنشاء بيانات تجريبية (AI)'}</span>
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-lg shadow">
                {viewMode === 'tree' ? <ClientsTreeView {...commonViewProps} /> : <ClientsListView {...commonViewProps} />}
            </div>

            {/* Modals are placed here */}
            {modal.type && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 no-print p-4 overflow-y-auto" onClick={handleCloseModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        {modal.type === 'client' && (
                             <form onSubmit={handleSubmit}>
                                <h2 className="text-xl font-bold mb-4">{modal.isEditing ? 'تعديل موكل' : 'إضافة موكل جديد'}</h2>
                                <div className="space-y-4">
                                    <div><label className="block text-sm font-medium">الاسم الكامل</label><input name="name" value={formData.name || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    <div><label className="block text-sm font-medium">معلومات الاتصال</label><input name="contactInfo" value={formData.contactInfo || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                </div>
                                <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                            </form>
                        )}
                        {modal.type === 'case' && (
                            <form onSubmit={handleSubmit}>
                                <h2 className="text-xl font-bold mb-4">{modal.isEditing ? 'تعديل قضية' : 'إضافة قضية جديدة'}</h2>
                                <div className="space-y-4">
                                    <div><label className="block text-sm font-medium">موضوع القضية</label><input name="subject" value={formData.subject || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    <div><label className="block text-sm font-medium">اسم الخصم</label><input name="opponentName" value={formData.opponentName || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                    <div><label className="block text-sm font-medium">اتفاقية الأتعاب</label><textarea name="feeAgreement" value={formData.feeAgreement || ''} onChange={handleFormChange} className="w-full p-2 border rounded" rows={2}></textarea></div>
                                    <div><label className="block text-sm font-medium">حالة القضية</label><select name="status" value={formData.status || 'active'} onChange={handleFormChange} className="w-full p-2 border rounded"><option value="active">نشطة</option><option value="closed">مغلقة</option><option value="on_hold">معلقة</option></select></div>
                                    {!modal.isEditing && (
                                        <div className="border-t pt-4 mt-4 space-y-4">
                                            <h3 className="font-semibold">إضافة مرحلة وجلسة أولى (اختياري)</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div><label className="block text-sm font-medium">المحكمة</label><input name="court" onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                                <div><label className="block text-sm font-medium">رقم الأساس</label><input name="caseNumber" onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                                <div><label className="block text-sm font-medium">تاريخ أول جلسة</label><input type="date" name="firstSessionDate" onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                                <div><label className="block text-sm font-medium">سبب أول جلسة</label><input name="firstSessionReason" onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                            </form>
                        )}
                        {modal.type === 'stage' && (
                             <form onSubmit={handleSubmit}>
                                <h2 className="text-xl font-bold mb-4">{modal.isEditing ? 'تعديل مرحلة' : 'إضافة مرحلة جديدة'}</h2>
                                <div className="space-y-4">
                                    <div><label className="block text-sm font-medium">المحكمة</label><input name="court" value={formData.court || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    <div><label className="block text-sm font-medium">رقم الأساس</label><input name="caseNumber" value={formData.caseNumber || ''} onChange={handleFormChange} className="w-full p-2 border rounded" /></div>
                                     {!modal.isEditing && (
                                        <div className="border-t pt-4 mt-4 space-y-4">
                                            <h3 className="font-semibold">إضافة جلسة أولى (اختياري)</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div><label className="block text-sm font-medium">تاريخ أول جلسة</label><input type="date" name="firstSessionDate" onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                                <div><label className="block text-sm font-medium">سبب أول جلسة</label><input name="firstSessionReason" onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                            </div>
                                        </div>
                                    )}
                                    {modal.isEditing && (
                                         <div className="border-t pt-4 mt-4 space-y-4">
                                            <h3 className="font-semibold">معلومات قرار الحسم</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div><label className="block text-sm font-medium">تاريخ الحسم</label><input type="date" name="decisionDate" value={formData.decisionDate || ''} onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                                <div><label className="block text-sm font-medium">رقم القرار</label><input name="decisionNumber" value={formData.decisionNumber || ''} onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                            </div>
                                             <div><label className="block text-sm font-medium">ملخص القرار</label><textarea name="decisionSummary" value={formData.decisionSummary || ''} onChange={handleFormChange} className="w-full p-2 border rounded" rows={2}></textarea></div>
                                             <div><label className="block text-sm font-medium">ملاحظات</label><textarea name="decisionNotes" value={formData.decisionNotes || ''} onChange={handleFormChange} className="w-full p-2 border rounded" rows={2}></textarea></div>
                                        </div>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                            </form>
                        )}
                         {modal.type === 'session' && (
                             <form onSubmit={handleSubmit}>
                                <h2 className="text-xl font-bold mb-4">{modal.isEditing ? 'تعديل جلسة' : 'إضافة جلسة جديدة'}</h2>
                                <div className="space-y-4">
                                    <div><label className="block text-sm font-medium">التاريخ</label><input type="date" name="date" value={formData.date || ''} onChange={handleFormChange} className="w-full p-2 border rounded" required /></div>
                                    {!modal.isEditing &&
                                    <div><label className="block text-sm font-medium">المكلف بالحضور</label><select name="assignee" value={formData.assignee || 'بدون تخصيص'} onChange={handleFormChange} className="w-full p-2 border rounded">{assistants.map(a => <option key={a} value={a}>{a}</option>)}</select></div>
                                    }
                                    {modal.isEditing && (
                                        <>
                                             <div className="flex items-center gap-4">
                                                <label className="flex items-center gap-2"><input type="checkbox" name="isPostponed" checked={!!formData.isPostponed} onChange={handleFormChange}/> مرحّلة</label>
                                            </div>
                                            <div><label className="block text-sm font-medium">سبب التأجيل</label><input name="postponementReason" value={formData.postponementReason || ''} onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                            <div><label className="block text-sm font-medium">تاريخ الجلسة القادمة</label><input type="date" name="nextSessionDate" value={formData.nextSessionDate || ''} onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                            <div><label className="block text-sm font-medium">سبب التأجيل القادم</label><input name="nextPostponementReason" value={formData.nextPostponementReason || ''} onChange={handleFormChange} className="w-full p-2 border rounded"/></div>
                                        </>
                                    )}
                                </div>
                                <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ</button></div>
                            </form>
                        )}
                    </div>
                </div>
            )}
            
            {isDeleteClientModalOpen && clientToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsDeleteClientModalOpen(false)}>
                     <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد حذف الموكل</h3>
                            <p className="my-4">هل أنت متأكد من حذف الموكل "{clientToDelete.name}"؟ سيتم حذف جميع القضايا والجلسات المتعلقة به.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4"><button className="px-6 py-2 bg-gray-200 rounded" onClick={() => setIsDeleteClientModalOpen(false)}>إلغاء</button><button className="px-6 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDeleteClient}>نعم، قم بالحذف</button></div>
                    </div>
                </div>
            )}
            
            {isDeleteCaseModalOpen && caseToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsDeleteCaseModalOpen(false)}>
                     <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد حذف القضية</h3>
                            <p className="my-4">هل أنت متأكد من حذف قضية "{caseToDelete.caseSubject}"؟ سيتم حذف جميع المراحل والجلسات المتعلقة بها.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4"><button className="px-6 py-2 bg-gray-200 rounded" onClick={() => setIsDeleteCaseModalOpen(false)}>إلغاء</button><button className="px-6 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDeleteCase}>نعم، قم بالحذف</button></div>
                    </div>
                </div>
            )}
            
            {isDeleteStageModalOpen && stageToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsDeleteStageModalOpen(false)}>
                     <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد حذف المرحلة</h3>
                            <p className="my-4">هل أنت متأكد من حذف المرحلة "{stageToDelete.stageInfo}"؟ سيتم حذف جميع الجلسات المتعلقة بها.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4"><button className="px-6 py-2 bg-gray-200 rounded" onClick={() => setIsDeleteStageModalOpen(false)}>إلغاء</button><button className="px-6 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDeleteStage}>نعم، قم بالحذف</button></div>
                    </div>
                </div>
            )}
            
            {isDeleteSessionModalOpen && sessionToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsDeleteSessionModalOpen(false)}>
                     <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد حذف الجلسة</h3>
                            <p className="my-4">هل أنت متأكد من حذف "{sessionToDelete.message}"؟</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4"><button className="px-6 py-2 bg-gray-200 rounded" onClick={() => setIsDeleteSessionModalOpen(false)}>إلغاء</button><button className="px-6 py-2 bg-red-600 text-white rounded" onClick={handleConfirmDeleteSession}>نعم، قم بالحذف</button></div>
                    </div>
                </div>
            )}

             {isPrintChoiceModalOpen && clientForPrintChoice && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => setIsPrintChoiceModalOpen(false)}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4 border-b pb-3">اختر كشف الحساب للطباعة</h2>
                        <div className="space-y-3 max-h-80 overflow-y-auto">
                            <button onClick={() => handlePrintClient(clientForPrintChoice)} className="w-full text-right px-4 py-3 bg-blue-50 text-blue-800 font-semibold rounded-lg hover:bg-blue-100">كشف حساب شامل للموكل</button>
                            <h3 className="text-md font-semibold text-gray-600 pt-2">أو طباعة كشف لقضية محددة:</h3>
                            {clientForPrintChoice.cases.map(c => (
                                <button key={c.id} onClick={() => handlePrintClient(clientForPrintChoice, c)} className="w-full text-right block px-4 py-2 bg-gray-50 text-gray-800 rounded-md hover:bg-gray-100">{c.subject}</button>
                            ))}
                        </div>
                         <div className="mt-6 flex justify-end"><button onClick={() => setIsPrintChoiceModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded">إغلاق</button></div>
                    </div>
                </div>
            )}
            
            {isPrintModalOpen && printData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] no-print" onClick={() => setIsPrintModalOpen(false)}>
                    <div className="bg-white p-2 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="overflow-y-auto" ref={printClientReportRef}><PrintableClientReport {...printData} /></div>
                        <div className="mt-4 flex justify-end gap-4 border-t p-4"><button onClick={() => setIsPrintModalOpen(false)} className="px-6 py-2 bg-gray-200 rounded">إغلاق</button><button onClick={() => printElement(printClientReportRef.current)} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded"><PrintIcon className="w-5 h-5"/>طباعة</button></div>
                    </div>
                </div>
            )}
            
            {decideModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={handleCloseDecideModal}>
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">تسجيل قرار الحسم</h2>
                        <form onSubmit={handleDecideSubmit} className="space-y-4">
                            <div><label>تاريخ الحسم</label><input type="date" value={toInputDateString(decideModal.session?.date)} readOnly className="w-full p-2 border rounded bg-gray-100" /></div>
                            <div><label>رقم القرار</label><input type="text" value={decideFormData.decisionNumber} onChange={e => setDecideFormData(p => ({...p, decisionNumber: e.target.value}))} className="w-full p-2 border rounded" /></div>
                            <div><label>ملخص القرار</label><textarea value={decideFormData.decisionSummary} onChange={e => setDecideFormData(p => ({...p, decisionSummary: e.target.value}))} className="w-full p-2 border rounded" rows={3}></textarea></div>
                            <div><label>ملاحظات</label><textarea value={decideFormData.decisionNotes} onChange={e => setDecideFormData(p => ({...p, decisionNotes: e.target.value}))} className="w-full p-2 border rounded" rows={2}></textarea></div>
                            <div className="mt-6 flex justify-end gap-4"><button type="button" onClick={handleCloseDecideModal} className="px-4 py-2 bg-gray-200 rounded">إلغاء</button><button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">حفظ القرار</button></div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientsPage;