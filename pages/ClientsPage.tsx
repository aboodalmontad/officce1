import * as React from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import ClientsTreeView from '../components/ClientsTreeView';
import ClientsListView from '../components/ClientsListView';
import { PlusIcon, SearchIcon, ListBulletIcon, ViewColumnsIcon, ExclamationTriangleIcon, PrintIcon, ScaleIcon, FolderOpenIcon, SparklesIcon, ArrowPathIcon } from '../components/icons';
import { Client, Case, Stage, Session, AccountingEntry, InvoiceItem } from '../types';
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
    const { 
        clients, 
        setClients,
        accountingEntries, 
        setAccountingEntries, 
        assistants, 
        setFullData, 
        deleteClient, 
        deleteCase, 
        deleteStage, 
        deleteSession,
        postponeSession
    } = useData();
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
            if (client.name.toLowerCase().includes(lowercasedQuery) || client.contactInfo.toLowerCase().includes(lowercasedQuery)) {
                return true;
            }
            return client.cases.some(c => {
                if (c.subject.toLowerCase().includes(lowercasedQuery) || c.opponentName.toLowerCase().includes(lowercasedQuery)) {
                    return true;
                }
                return c.stages.some(s => {
                    if (s.court.toLowerCase().includes(lowercasedQuery) || s.caseNumber.toLowerCase().includes(lowercasedQuery)) {
                        return true;
                    }
                    return s.sessions.some(session => 
                        (session.postponementReason && session.postponementReason.toLowerCase().includes(lowercasedQuery)) ||
                        (session.nextPostponementReason && session.nextPostponementReason.toLowerCase().includes(lowercasedQuery)) ||
                        (session.assignee && session.assignee.toLowerCase().includes(lowercasedQuery))
                    );
                });
            });
        });
    }, [clients, debouncedSearchQuery]);

    const clientsTree = filteredClients;


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
                cases: client.cases.map(caseItem => ({
                    ...caseItem,
                    stages: caseItem.stages.map(stage => {
                        const sessionIndex = stage.sessions.findIndex(s => s.id === sessionId);
                        if (sessionIndex === -1) return stage;
    
                        const updatedSessions = [...stage.sessions];
                        updatedSessions[sessionIndex] = {
                            ...updatedSessions[sessionIndex],
                            ...updatedFields,
                            updated_at: new Date(),
                        };
                        
                        return { ...stage, sessions: updatedSessions };
                    })
                }))
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
                    updated_at: new Date(),
                    cases: [],
                };
                setClients(prev => [...prev, newClient]);
            }
        } else if (type === 'case') {
            if (isEditing) {
                setClients(prev => prev.map(client => ({
                    ...client,
                    cases: client.cases.map(cs => cs.id === context.item.id ? { ...cs, ...formData, updated_at: new Date() } : cs)
                })));
            } else {
                const clientForCase = clients.find(c => c.id === context.clientId);
                if (clientForCase) {
                    const newCase: Case = {
                        id: `case-${Date.now()}`,
                        clientId: clientForCase.id,
                        subject: formData.subject || 'قضية بدون موضوع',
                        opponentName: formData.opponentName || '',
                        feeAgreement: formData.feeAgreement || '',
                        status: formData.status || 'active',
                        clientName: clientForCase.name,
                        updated_at: new Date(),
                        stages: [],
                    };
    
                    const { court, caseNumber, firstSessionDate, firstSessionReason } = formData;
                    if (court || caseNumber || firstSessionDate) {
                        const newStage: Stage = {
                            id: `stage-${Date.now()}`,
                            caseId: newCase.id,
                            court: court || 'غير محدد',
                            caseNumber: caseNumber || '',
                            firstSessionDate: firstSessionDate ? new Date(firstSessionDate) : undefined,
                            updated_at: new Date(),
                            sessions: [],
                        };
                        newCase.stages.push(newStage);
    
                        if (firstSessionDate) {
                            const newSession: Session = {
                                id: `session-${Date.now()}-first`,
                                stageId: newStage.id,
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
                    }
                    
                    setClients(prev => prev.map(c => 
                        c.id === context.clientId 
                        ? { ...c, cases: [...c.cases, newCase] } 
                        : c
                    ));
                }
            }
        } else if (type === 'stage') {
            const stageData = { ...formData, updated_at: new Date() };
            stageData.firstSessionDate = stageData.firstSessionDate ? new Date(stageData.firstSessionDate) : undefined;
            if(isEditing) {
                stageData.decisionDate = stageData.decisionDate ? new Date(stageData.decisionDate) : undefined;
            }

            setClients(prev => prev.map(client => client.id !== context.clientId ? client : {
                ...client,
                cases: client.cases.map(caseItem => caseItem.id !== context.case