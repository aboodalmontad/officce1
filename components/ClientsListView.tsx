import * as React from 'react';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, PrintIcon } from './icons';
import SessionsTable from './SessionsTable';
import CaseAccounting from './CaseAccounting';

interface ClientsListViewProps {
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
}

const statusMap: Record<Case['status'], { text: string, className: string }> = {
    active: { text: 'نشطة', className: 'bg-blue-100 text-blue-800' },
    closed: { text: 'مغلقة', className: 'bg-gray-100 text-gray-800' },
    on_hold: { text: 'معلقة', className: 'bg-yellow-100 text-yellow-800' }
};

const ClientsListView: React.FC<ClientsListViewProps> = (props) => {
    const { 
        clients, onEditClient, onDeleteClient, onAddCase, 
        onEditCase, onDeleteCase, onAddStage, 
        onEditStage, onDeleteStage, onAddSession, 
        onEditSession, onDeleteSession, onPrintClientStatement, 
        assistants, onUpdateSession, ...rest 
    } = props;
    const [openClientId, setOpenClientId] = React.useState<string | null>(null);
    
    if (clients.length === 0) {
        return <p className="text-center text-gray-500 py-8">لا يوجد موكلين لعرضهم. قم بإضافة موكل جديد للبدء.</p>;
    }

    return (
        <div className="space-y-8">
            {clients.map(client => (
                <div key={client.id} className="bg-gray-50 rounded-xl p-4 shadow-sm border border-gray-200">
                    <div 
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-gray-200 mb-4 cursor-pointer"
                        onClick={() => setOpenClientId(prev => (prev === client.id ? null : client.id))}
                    >
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">{client.name}</h3>
                            <p className="text-sm text-gray-500">{client.contactInfo}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                            <button onClick={() => onPrintClientStatement(client.id)} className="p-2 text-gray-500 rounded-full hover:bg-gray-200" aria-label="طباعة كشف حساب"><PrintIcon className="w-4 h-4" /></button>
                            <button onClick={() => onEditClient(client)} className="p-2 text-gray-500 rounded-full hover:bg-gray-200" aria-label="تعديل الموكل"><PencilIcon className="w-4 h-4" /></button>
                            <button onClick={() => onDeleteClient(client.id)} className="p-2 text-red-500 rounded-full hover:bg-red-100" aria-label="حذف الموكل"><TrashIcon className="w-4 h-4" /></button>
                            <button onClick={() => onAddCase(client.id)} className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-200 transition-colors">
                                <PlusIcon className="w-4 h-4" />
                                <span>قضية جديدة</span>
                            </button>
                        </div>
                    </div>

                    {openClientId === client.id && (
                        <div className="space-y-4">
                            {client.cases.length > 0 ? client.cases.map(caseItem => (
                                <div key={caseItem.id} className="bg-white rounded-lg p-4 border border-gray-200">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-100 mb-3">
                                        <div>
                                            <h4 className="font-semibold text-blue-700">{caseItem.subject}</h4>
                                            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                                <span>الخصم: {caseItem.opponentName}</span>
                                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusMap[caseItem.status].className}`}>
                                                    {statusMap[caseItem.status].text}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button onClick={() => onEditCase(caseItem, client)} className="p-2 text-gray-500 rounded-full hover:bg-gray-200" aria-label="تعديل القضية"><PencilIcon className="w-4 h-4" /></button>
                                            <button onClick={() => onDeleteCase(caseItem.id, client.id)} className="p-2 text-red-500 rounded-full hover:bg-red-100" aria-label="حذف القضية"><TrashIcon className="w-4 h-4" /></button>
                                            <button onClick={() => onAddStage(client.id, caseItem.id)} className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors">
                                                <PlusIcon className="w-4 h-4" />
                                                <span>مرحلة</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {caseItem.stages.length > 0 ? caseItem.stages.map(stage => (
                                            <div key={stage.id} className="bg-gray-50/50 p-3 rounded-md">
                                                <div className="flex justify-between items-center mb-2">
                                                     <p className="text-sm font-semibold text-gray-600">{stage.court} - <span className="font-normal">رقم الأساس: {stage.caseNumber}</span></p>
                                                     <div className="flex items-center gap-1 flex-shrink-0">
                                                         <button onClick={() => onEditStage(stage, caseItem, client)} className="p-2 text-gray-500 rounded-full hover:bg-gray-200" aria-label="تعديل المرحلة"><PencilIcon className="w-4 h-4" /></button>
                                                         <button onClick={() => onDeleteStage(stage.id, caseItem.id, client.id)} className="p-2 text-red-500 rounded-full hover:bg-red-100" aria-label="حذف المرحلة"><TrashIcon className="w-4 h-4" /></button>
                                                         <button onClick={() => onAddSession(client.id, caseItem.id, stage.id)} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors">
                                                             <PlusIcon className="w-3 h-3" />
                                                             <span>جلسة</span>
                                                         </button>
                                                     </div>
                                                </div>
                                                <SessionsTable 
                                                    sessions={stage.sessions} 
                                                    onPostpone={props.onPostponeSession}
                                                    onEdit={(session) => onEditSession(session, stage, caseItem, client)}
                                                    onDelete={(sessionId) => onDeleteSession(sessionId, stage.id, caseItem.id, client.id)}
                                                    showSessionDate={true}
                                                    onUpdate={onUpdateSession}
                                                    assistants={assistants}
                                                />
                                            </div>
                                        )) : <p className="text-sm text-gray-500 text-center py-4">لا توجد مراحل لهذه القضية. قم بإضافة مرحلة جديدة.</p>}
                                    </div>
                                </div>
                            )) : <p className="text-center text-gray-500 py-4">لا توجد قضايا لهذا الموكل. قم بإضافة قضية جديدة.</p>}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default ClientsListView;