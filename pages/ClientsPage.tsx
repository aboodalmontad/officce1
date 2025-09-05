import React, { useState, useMemo } from 'react';
import ClientsTreeView from '../components/ClientsTreeView';
import { PlusIcon, SearchIcon } from '../components/icons';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';

interface ClientsPageProps {
    clients: Client[];
    setClients: (updater: (prevClients: Client[]) => Client[]) => void;
    accountingEntries: AccountingEntry[];
    setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void;
}

const ClientsPage: React.FC<ClientsPageProps> = ({ clients, setClients, accountingEntries, setAccountingEntries }) => {
    const [modal, setModal] = useState<{ type: 'client' | 'case' | 'stage' | 'session' | null, context?: any }>({ type: null });
    const [formData, setFormData] = useState<any>({});
    const [searchQuery, setSearchQuery] = useState('');

    const filteredClients = useMemo(() => {
        if (!searchQuery) return clients;
        const lowercasedQuery = searchQuery.toLowerCase();
        return clients.filter(client =>
            client.name.toLowerCase().includes(lowercasedQuery) ||
            client.contactInfo.toLowerCase().includes(lowercasedQuery)
        );
    }, [clients, searchQuery]);

    const handleOpenModal = (type: 'client' | 'case' | 'stage' | 'session', context = {}) => {
        setModal({ type, context });
        setFormData({});
    };

    const handleCloseModal = () => {
        setModal({ type: null });
    };

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
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
        const { type, context } = modal;

        if (type === 'client') {
            const newClient: Client = {
                id: `client-${Date.now()}`,
                name: formData.name,
                contactInfo: formData.contactInfo,
                cases: [],
            };
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
                        id: `stage-${Date.now()}`,
                        court: formData.court,
                        caseNumber: formData.caseNumber,
                        sessions: [],
                    };
                    
                    return {
                        ...c,
                        stages: [...c.stages, newStage]
                    };
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
                        nextPostponementReason: formData.nextPostponementReason,
                    };

                    return prevClients.map(cl => cl.id === context.clientId ? {
                        ...cl,
                        cases: cl.cases.map(c => c.id === context.caseId ? {
                            ...c,
                            stages: c.stages.map(s => s.id === context.stageId ? {
                                ...s,
                                sessions: [...s.sessions, newSession]
                            } : s)
                        } : c)
                    } : cl);
                }
                return prevClients;
             });
        }

        handleCloseModal();
    };

    const renderModalContent = () => {
        if (!modal.type) return null;

        const titles = {
            client: 'إضافة موكل جديد',
            case: 'إضافة قضية جديدة',
            stage: 'إضافة مرحلة جديدة',
            session: 'إضافة جلسة جديدة',
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
                                    <input type="text" id="name" name="name" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="contactInfo" className="block text-sm font-medium text-gray-700">معلومات الاتصال</label>
                                    <input type="text" id="contactInfo" name="contactInfo" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                            </>}
                             {modal.type === 'case' && <>
                                <div>
                                    <label htmlFor="subject" className="block text-sm font-medium text-gray-700">موضوع القضية</label>
                                    <input type="text" id="subject" name="subject" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="opponentName" className="block text-sm font-medium text-gray-700">اسم الخصم</label>
                                    <input type="text" id="opponentName" name="opponentName" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                            </>}
                            {modal.type === 'stage' && <>
                                <div>
                                    <label htmlFor="court" className="block text-sm font-medium text-gray-700">المحكمة</label>
                                    <input type="text" id="court" name="court" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="caseNumber" className="block text-sm font-medium text-gray-700">رقم الأساس</label>
                                    <input type="text" id="caseNumber" name="caseNumber" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                            </>}
                            {modal.type === 'session' && <>
                                <div>
                                    <label htmlFor="date" className="block text-sm font-medium text-gray-700">تاريخ الجلسة</label>
                                    <input type="date" id="date" name="date" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" required />
                                </div>
                                <div>
                                    <label htmlFor="nextPostponementReason" className="block text-sm font-medium text-gray-700">سبب التأجيل</label>
                                    <input type="text" id="nextPostponementReason" name="nextPostponementReason" onChange={handleFormChange} className="mt-1 w-full p-2 border rounded" />
                                </div>
                            </>}
                        </div>
                        <div className="mt-6 flex justify-end gap-4">
                            <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">إلغاء</button>
                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">إضافة</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h1 className="text-3xl font-bold text-gray-800">الموكلين</h1>
                 <div className="flex items-center gap-4">
                    <div className="relative">
                        <input 
                            type="search" 
                            placeholder="ابحث عن موكل..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full sm:w-64 p-2 ps-10 text-sm border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500" 
                        />
                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                            <SearchIcon className="w-4 h-4 text-gray-500" />
                        </div>
                    </div>
                    <button onClick={() => handleOpenModal('client')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
                        <PlusIcon className="w-5 h-5" />
                        <span>إضافة موكل</span>
                    </button>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
                <ClientsTreeView
                    clients={filteredClients}
                    setClients={setClients}
                    accountingEntries={accountingEntries}
                    setAccountingEntries={setAccountingEntries}
                    onAddCase={(clientId) => handleOpenModal('case', { clientId })}
                    onAddStage={(clientId, caseId) => handleOpenModal('stage', { clientId, caseId })}
                    onAddSession={(clientId, caseId, stageId) => handleOpenModal('session', { clientId, caseId, stageId })}
                    onPostponeSession={handlePostponeSession}
                />
            </div>
            {renderModalContent()}
        </div>
    );
};

export default ClientsPage;