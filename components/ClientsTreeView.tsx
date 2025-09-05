
import React, { useState } from 'react';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { formatDate } from '../utils/dateUtils';
import { ChevronDownIcon, ChevronLeftIcon, PlusIcon } from './icons';
import SessionsTable from './SessionsTable';
import CaseAccounting from './CaseAccounting';

interface ClientsTreeViewProps {
    clients: Client[];
    setClients: (updater: (prevClients: Client[]) => Client[]) => void;
    accountingEntries: AccountingEntry[];
    setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void;
    onAddCase: (clientId: string) => void;
    onAddStage: (clientId: string, caseId: string) => void;
    onAddSession: (clientId: string, caseId: string, stageId: string) => void;
    onPostponeSession: (sessionId: string, newDate: Date, reason: string) => void;
}

const CaseDetails: React.FC<{ client: Client, caseData: Case, onAddStage: () => void, onAddSession: (stageId: string) => void, onPostponeSession: (sessionId: string, newDate: Date, reason: string) => void, accountingEntries: AccountingEntry[], setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void, setClients: (updater: (prevClients: Client[]) => Client[]) => void }> = ({ client, caseData, onAddStage, onAddSession, onPostponeSession, accountingEntries, setAccountingEntries, setClients }) => {
    const [activeTab, setActiveTab] = useState('stages');

    const handleFeeAgreementChange = (newFeeAgreement: string) => {
        setClients(prevClients => prevClients.map(c => c.id === client.id ? {
            ...c,
            cases: c.cases.map(cs => cs.id === caseData.id ? { ...cs, feeAgreement: newFeeAgreement } : cs)
        } : c));
    };

    return (
        <div className="bg-gray-50/50 p-4">
            <div className="flex border-b mb-4">
                <button onClick={() => setActiveTab('stages')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'stages' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    المراحل والجلسات
                </button>
                <button onClick={() => setActiveTab('accounting')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'accounting' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                    محاسبة القضية
                </button>
            </div>
            {activeTab === 'stages' && (
                <>
                    <div className="flex justify-end mb-2">
                         <button onClick={onAddStage} className="flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors">
                            <PlusIcon className="w-4 h-4" />
                            <span>إضافة مرحلة</span>
                        </button>
                    </div>
                    {caseData.stages.map(stage => (
                        <TreeItem key={stage.id} title={`مرحلة: ${stage.court}`} subtitle={`رقم الأساس: ${stage.caseNumber}${stage.firstSessionDate ? ` | أول جلسة: ${formatDate(stage.firstSessionDate)}` : ''}`} level={0} onAdd={() => onAddSession(stage.id)}>
                            <div className="p-2">
                                <SessionsTable sessions={stage.sessions} onPostpone={onPostponeSession} />
                            </div>
                        </TreeItem>
                    ))}
                </>
            )}
            {activeTab === 'accounting' && (
                <CaseAccounting
                    caseData={caseData}
                    client={client}
                    caseAccountingEntries={accountingEntries.filter(e => e.caseId === caseData.id)}
                    setAccountingEntries={setAccountingEntries}
                    onFeeAgreementChange={handleFeeAgreementChange}
                />
            )}
        </div>
    );
};

const TreeItem: React.FC<{ title: string, subtitle: string, children?: React.ReactNode, level: number, onAdd?: () => void }> = ({ title, subtitle, children, level, onAdd }) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = React.Children.count(children) > 0;
    const indentClass = `ms-${level * 6}`;

    return (
        <div className="border-b border-gray-200 last:border-b-0">
            <div
                className={`flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 ${indentClass}`}
                onClick={() => hasChildren && setIsOpen(!isOpen)}
            >
                <div className="flex items-center min-w-0">
                    {hasChildren && <div className="w-6 text-gray-500 flex-shrink-0">{isOpen ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}</div>}
                    {!hasChildren && level > 0 && <div className="w-6 flex-shrink-0"></div>}
                    <div className="truncate">
                        <p className="font-semibold text-gray-800 truncate">{title}</p>
                        <p className="text-sm text-gray-500 truncate">{subtitle}</p>
                    </div>
                </div>
                {onAdd && (
                    <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="ms-4 p-1 text-blue-600 rounded-full hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`إضافة إلى ${title}`}>
                        <PlusIcon className="w-5 h-5" />
                    </button>
                )}
            </div>
            {isOpen && <div>{children}</div>}
        </div>
    );
};

const ClientsTreeView: React.FC<ClientsTreeViewProps> = ({ clients, setClients, accountingEntries, setAccountingEntries, onAddCase, onAddStage, onAddSession, onPostponeSession }) => {
    return (
        <div className="w-full">
            {clients.map(client => (
                <TreeItem key={client.id} title={client.name} subtitle={client.contactInfo} level={0} onAdd={() => onAddCase(client.id)}>
                    {client.cases.map(c => (
                        <TreeItem key={c.id} title={`قضية: ${c.subject}`} subtitle={`الخصم: ${c.opponentName}`} level={1}>
                            <CaseDetails
                                client={client}
                                caseData={c}
                                onAddStage={() => onAddStage(client.id, c.id)}
                                onAddSession={(stageId) => onAddSession(client.id, c.id, stageId)}
                                onPostponeSession={onPostponeSession}
                                accountingEntries={accountingEntries}
                                setAccountingEntries={setAccountingEntries}
                                setClients={setClients}
                            />
                        </TreeItem>
                    ))}
                </TreeItem>
            ))}
        </div>
    );
};

export default ClientsTreeView;