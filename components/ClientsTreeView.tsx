import * as React from 'react';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { formatDate } from '../utils/dateUtils';
import { ChevronDownIcon, ChevronLeftIcon, PlusIcon, PencilIcon, TrashIcon, PrintIcon, ScaleIcon } from './icons';
import SessionsTable from './SessionsTable';
import CaseAccounting from './CaseAccounting';

interface ClientsTreeViewProps {
    clients: Client[];
    setClients: (updater: (prevClients: Client[]) => Client[]) => void;
    accountingEntries: AccountingEntry[];
    setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void;
    onAddCase: (clientId: string) => void;
    onEditCase: (caseItem: Case, client: Client) => void;
    onDeleteCase: (caseId: string, clientId: string) => void;
    onAddStage: (clientId: string, caseId: string) => void;
    onEditStage: (stage: Stage, caseItem: Case, client: Client) => void;
    onDeleteStage: (stageId: string, caseId: string, clientId: string) => void;
    onAddSession: (clientId: string, caseId: string, stageId: string) => void;
    onEditSession: (session: Session, stage: Stage, caseItem: Case, client: Client) => void;
    onDeleteSession: (sessionId: string, stageId: string, caseId: string, clientId: string) => void;
    onPostponeSession: (sessionId: string, newDate: Date, reason: string) => void;
    onEditClient: (client: Client) => void;
    onDeleteClient: (clientId: string) => void;
    onPrintClientStatement: (clientId: string) => void;
    assistants: string[];
    onUpdateSession: (sessionId: string, updatedFields: Partial<Session>) => void;
    onDecide: (session: Session, stage: Stage) => void;
}

interface CaseDetailsProps {
    client: Client;
    caseData: Case;
    onAddStage: () => void;
    onEditStage: (stage: Stage) => void;
    onDeleteStage: (stageId: string) => void;
    onAddSession: (stageId: string) => void;
    onEditSession: (session: Session, stage: Stage) => void;
    onDeleteSession: (sessionId: string, stageId: string) => void;
    onPostponeSession: (sessionId: string, newDate: Date, reason: string) => void;
    onDecide: (session: Session, stage: Stage) => void;
    accountingEntries: AccountingEntry[];
    setAccountingEntries: (updater: (prev: AccountingEntry[]) => AccountingEntry[]) => void;
    setClients: (updater: (prevClients: Client[]) => Client[]) => void;
    assistants: string[];
    onUpdateSession: (sessionId: string, updatedFields: Partial<Session>) => void;
}

const CaseDetails: React.FC<CaseDetailsProps> = ({ client, caseData, onAddStage, onEditStage, onDeleteStage, onAddSession, onEditSession, onDeleteSession, onPostponeSession, onDecide, accountingEntries, setAccountingEntries, setClients, assistants, onUpdateSession }) => {
    const [activeTab, setActiveTab] = React.useState('stages');

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
                        <TreeItem 
                            key={stage.id} 
                            title={`مرحلة: ${stage.court}`} 
                            subtitle={`رقم الأساس: ${stage.caseNumber}${stage.firstSessionDate ? ` | أول جلسة: ${formatDate(stage.firstSessionDate)}` : ''}`} 
                            level={0} 
                            onAdd={() => onAddSession(stage.id)}
                            onEdit={() => onEditStage(stage)}
                            onDelete={() => onDeleteStage(stage.id)}
                        >
                            <div className="p-2 space-y-2">
                                {stage.decisionDate && (
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm space-y-1">
                                        <h5 className="font-bold text-green-800 flex items-center gap-2"><ScaleIcon className="w-4 h-4" />القرار الحاسم</h5>
                                        <p><strong>تاريخ الحسم:</strong> {formatDate(stage.decisionDate)}</p>
                                        <p><strong>رقم القرار:</strong> {stage.decisionNumber || 'غير محدد'}</p>
                                        <p><strong>ملخص القرار:</strong> {stage.decisionSummary || 'لا يوجد'}</p>
                                        {stage.decisionNotes && <p><strong>ملاحظات:</strong> {stage.decisionNotes}</p>}
                                    </div>
                                )}
                                <SessionsTable 
                                    sessions={stage.sessions} 
                                    onPostpone={onPostponeSession}
                                    onEdit={(session) => onEditSession(session, stage)}
                                    onDelete={(sessionId) => onDeleteSession(sessionId, stage.id)}
                                    onDecide={(session) => onDecide(session, stage)}
                                    showSessionDate={true}
                                    onUpdate={onUpdateSession}
                                    assistants={assistants}
                                    stage={stage}
                                />
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

const TreeItem: React.FC<{ title: string, subtitle: string, children?: React.ReactNode, level: number, onAdd?: () => void, onEdit?: () => void, onDelete?: () => void }> = ({ title, subtitle, children, level, onAdd, onEdit, onDelete }) => {
    const [isOpen, setIsOpen] = React.useState(false);
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
                <div className="flex items-center flex-shrink-0 ms-4">
                    {onAdd && (
                        <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="p-1 text-blue-600 rounded-full hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`إضافة إلى ${title}`}>
                            <PlusIcon className="w-5 h-5" />
                        </button>
                    )}
                    {onEdit && (
                         <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 text-gray-500 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label={`تعديل ${title}`}>
                            <PencilIcon className="w-4 h-4" />
                        </button>
                    )}
                    {onDelete && (
                         <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 text-red-500 rounded-full hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400" aria-label={`حذف ${title}`}>
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {isOpen && <div>{children}</div>}
        </div>
    );
};

const ClientsTreeView: React.FC<ClientsTreeViewProps> = (props) => {
    const { 
        clients, setClients, accountingEntries, setAccountingEntries, 
        onAddCase, onEditCase, onDeleteCase,
        onAddStage, onEditStage, onDeleteStage,
        onAddSession, onEditSession, onDeleteSession,
        onPostponeSession, onEditClient, onDeleteClient, onPrintClientStatement,
        assistants, onUpdateSession, onDecide
    } = props;
    const [openClientId, setOpenClientId] = React.useState<string | null>(null);

    return (
        <div className="w-full">
            {clients.map(client => (
                <div key={client.id} className="border-b border-gray-200 last:border-b-0">
                    <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                        onClick={() => setOpenClientId(prevId => (prevId === client.id ? null : client.id))}
                    >
                        <div className="flex items-center min-w-0">
                            {client.cases.length > 0 && <div className="w-6 text-gray-500 flex-shrink-0">{openClientId === client.id ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}</div>}
                            <div className="truncate">
                                <p className="font-semibold text-gray-800 truncate">{client.name}</p>
                                <p className="text-sm text-gray-500 truncate">{client.contactInfo}</p>
                            </div>
                        </div>
                        <div className="flex items-center flex-shrink-0 ms-4 flex-wrap justify-end gap-x-1">
                             <button onClick={(e) => { e.stopPropagation(); onPrintClientStatement(client.id); }} className="p-1 text-gray-500 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label={`طباعة كشف حساب ${client.name}`}>
                                <PrintIcon className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onAddCase(client.id); }} className="p-1 text-blue-600 rounded-full hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`إضافة إلى ${client.name}`}>
                                <PlusIcon className="w-5 h-5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onEditClient(client); }} className="p-1 text-gray-500 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400" aria-label={`تعديل ${client.name}`}>
                                <PencilIcon className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteClient(client.id); }} className="p-1 text-red-500 rounded-full hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400" aria-label={`حذف ${client.name}`}>
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {openClientId === client.id && <div>
                        {client.cases.map(c => (
                            <TreeItem 
                                key={c.id} 
                                title={`قضية: ${c.subject}`} 
                                subtitle={`الخصم: ${c.opponentName}`} 
                                level={1}
                                onEdit={() => onEditCase(c, client)}
                                onDelete={() => onDeleteCase(c.id, client.id)}
                            >
                                <CaseDetails
                                    client={client}
                                    caseData={c}
                                    onAddStage={() => onAddStage(client.id, c.id)}
                                    onEditStage={(stage) => onEditStage(stage, c, client)}
                                    onDeleteStage={(stageId) => onDeleteStage(stageId, c.id, client.id)}
                                    onAddSession={(stageId) => onAddSession(client.id, c.id, stageId)}
                                    onEditSession={(session, stage) => onEditSession(session, stage, c, client)}
                                    onDeleteSession={(sessionId, stageId) => onDeleteSession(sessionId, stageId, c.id, client.id)}
                                    onPostponeSession={onPostponeSession}
                                    onDecide={onDecide}
                                    accountingEntries={accountingEntries}
                                    setAccountingEntries={setAccountingEntries}
                                    setClients={setClients}
                                    assistants={assistants}
                                    onUpdateSession={onUpdateSession}
                                />
                            </TreeItem>
                        ))}
                    </div>}
                </div>
            ))}
        </div>
    );
};

export default ClientsTreeView;