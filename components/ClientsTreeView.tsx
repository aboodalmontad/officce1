import * as React from 'react';
import { Client, Case, Stage, Session, AccountingEntry } from '../types';
import { PlusIcon, PencilIcon, TrashIcon, PrintIcon, ChevronLeftIcon, UserIcon, FolderIcon, ClipboardDocumentIcon, CalendarDaysIcon, GavelIcon, BuildingLibraryIcon, ShareIcon, DocumentTextIcon } from './icons';
import SessionsTable from './SessionsTable';
import CaseAccounting from './CaseAccounting';
import { formatDate } from '../utils/dateUtils';
import { MenuItem } from './ContextMenu';

type ExpandedState = { [key: string]: boolean };

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
    onDecide: (session: Session) => void;
    showContextMenu: (event: React.MouseEvent, menuItems: MenuItem[]) => void;
    onOpenAdminTaskModal: (initialData?: any) => void;
    onCreateInvoice: (clientId: string, caseId?: string) => void;
}

const StageItem: React.FC<{ stage: Stage; caseItem: Case; client: Client; props: ClientsTreeViewProps; expanded: boolean; onToggle: () => void }> = ({ stage, caseItem, client, props, expanded, onToggle }) => {
    
    const handleContextMenu = (event: React.MouseEvent) => {
        const menuItems: MenuItem[] = [{
            label: 'إرسال إلى المهام الإدارية',
            icon: <BuildingLibraryIcon className="w-4 h-4" />,
            onClick: () => {
                const description = `متابعة مرحلة قضية "${caseItem.subject}" في محكمة ${stage.court} (أساس: ${stage.caseNumber}).`;
                props.onOpenAdminTaskModal({ task: description });
            }
        },
        {
            label: 'مشاركة عبر واتساب',
            icon: <ShareIcon className="w-4 h-4" />,
            onClick: () => {
                const message = [
                    `*مرحلة قضائية:*`,
                    `*القضية:* ${caseItem.subject}`,
                    `*المحكمة:* ${stage.court}`,
                    `*رقم الأساس:* ${stage.caseNumber}`
                ].join('\n');
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            }
        }];
        props.showContextMenu(event, menuItems);
    };

    const handleSessionContextMenu = (event: React.MouseEvent, session: Session) => {
        const menuItems: MenuItem[] = [{
            label: 'إرسال إلى المهام الإدارية',
            icon: <BuildingLibraryIcon className="w-4 h-4" />,
            onClick: () => {
                 const description = `متابعة جلسة قضية (${session.clientName} ضد ${session.opponentName}) يوم ${formatDate(session.date)} في محكمة ${session.court} (أساس: ${session.caseNumber}).\nسبب التأجيل السابق: ${session.postponementReason || 'لا يوجد'}.\nالمكلف بالحضور: ${session.assignee}.`;
                props.onOpenAdminTaskModal({ 
                    task: description,
                    assignee: session.assignee,
                });
            }
        },
        {
            label: 'مشاركة عبر واتساب',
            icon: <ShareIcon className="w-4 h-4" />,
            onClick: () => {
                const message = [
                    `*جلسة قضائية:*`,
                    `*القضية:* ${session.clientName} ضد ${session.opponentName}`,
                    `*المحكمة:* ${session.court} (أساس: ${session.caseNumber})`,
                    `*التاريخ:* ${formatDate(session.date)}`,
                    `*المسؤول:* ${session.assignee || 'غير محدد'}`,
                    `*سبب التأجيل السابق:* ${session.postponementReason || 'لا يوجد'}`
                ].join('\n');
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            }
        }];
        props.showContextMenu(event, menuItems);
    };
    
    return (
        <div className="border rounded-lg mb-2 overflow-hidden bg-yellow-50">
            <div 
                className="flex justify-between items-start p-3 hover:bg-yellow-100 cursor-pointer" 
                onClick={onToggle}
                onContextMenu={handleContextMenu}
            >
                <div className="flex-grow">
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 font-semibold text-yellow-800">
                        <div className="flex items-center gap-3">
                            <ClipboardDocumentIcon className="w-5 h-5 text-yellow-600" />
                            <span>{stage.court}</span>
                            <span className="text-gray-600 font-normal">({stage.caseNumber})</span>
                        </div>
                    </div>
                     {stage.decisionDate && (
                        <div className="mt-3 ps-8 animate-fade-in text-sm font-normal text-gray-700">
                            <div className="p-3 bg-green-100 border border-green-200 rounded-lg">
                                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                                    <div className="flex items-center">
                                        <GavelIcon className="w-4 h-4 text-green-700 me-2 flex-shrink-0" />
                                        <strong className="font-semibold">تاريخ الحسم:</strong>
                                        <span className="ms-1">{formatDate(new Date(stage.decisionDate))}</span>
                                    </div>
                                    {stage.decisionNumber && (
                                        <div className="flex items-center">
                                            <strong className="font-semibold">رقم القرار:</strong>
                                            <span className="ms-1">{stage.decisionNumber}</span>
                                        </div>
                                    )}
                                    {stage.decisionSummary && (
                                        <div className="flex items-baseline">
                                            <strong className="font-semibold flex-shrink-0">ملخص القرار:</strong>
                                            <span className="ms-1 whitespace-pre-wrap">{stage.decisionSummary}</span>
                                        </div>
                                    )}
                                    {stage.decisionNotes && (
                                        <div className="flex items-baseline">
                                            <strong className="font-semibold flex-shrink-0">ملاحظات:</strong>
                                            <span className="ms-1 whitespace-pre-wrap">{stage.decisionNotes}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex-shrink-0 flex items-center gap-2 ms-4">
                    <button onClick={(e) => { e.stopPropagation(); props.onAddSession(client.id, caseItem.id, stage.id); }} className="p-1 text-gray-500 hover:text-blue-600"><PlusIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onEditStage(stage, caseItem, client); }} className="p-1 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onDeleteStage(stage.id, caseItem.id, client.id); }} className="p-1 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
            {expanded && (
                <div className="p-3 bg-green-50 border-t border-green-200">
                     <h5 className="flex items-center gap-2 text-md font-semibold text-gray-700 mb-2">
                        <CalendarDaysIcon className="w-5 h-5 text-gray-500"/>
                        الجلسات
                    </h5>
                    <SessionsTable
                        sessions={stage.sessions}
                        onPostpone={props.onPostponeSession}
                        onEdit={(session) => props.onEditSession(session, stage, caseItem, client)}
                        onDelete={(sessionId) => props.onDeleteSession(sessionId, stage.id, caseItem.id, client.id)}
                        onUpdate={props.onUpdateSession}
                        assistants={props.assistants}
                        onDecide={props.onDecide}
                        stage={stage}
                        showSessionDate={true}
                        onContextMenu={handleSessionContextMenu}
                    />
                </div>
            )}
        </div>
    );
};

const StageItemContainer: React.FC<{ stage: Stage; caseItem: Case; client: Client; props: ClientsTreeViewProps }> = ({ stage, caseItem, client, props }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    return <StageItem stage={stage} caseItem={caseItem} client={client} props={props} expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} />
}

const CaseItem: React.FC<{ caseItem: Case; client: Client; props: ClientsTreeViewProps; expanded: boolean; onToggle: () => void }> = ({ caseItem, client, props, expanded, onToggle }) => {
    const [activeTab, setActiveTab] = React.useState<'stages' | 'accounting'>('stages');
    const caseAccountingEntries = props.accountingEntries.filter(e => e.caseId === caseItem.id);

    const handleFeeChange = (newFee: string) => {
        props.setClients(clients => clients.map(c => c.id === client.id ? {
            ...c,
            updated_at: new Date(),
            cases: c.cases.map(cs => cs.id === caseItem.id ? {...cs, feeAgreement: newFee, updated_at: new Date()} : cs)
        } : c));
    };

    const handleContextMenu = (event: React.MouseEvent) => {
        const statusMap = { active: 'نشطة', closed: 'مغلقة', on_hold: 'معلقة'};
        const menuItems: MenuItem[] = [{
            label: 'إنشاء فاتورة لهذه القضية',
            icon: <DocumentTextIcon className="w-4 h-4" />,
            onClick: () => props.onCreateInvoice(client.id, caseItem.id),
        }, {
            label: 'إرسال إلى المهام الإدارية',
            icon: <BuildingLibraryIcon className="w-4 h-4" />,
            onClick: () => {
                const description = `متابعة قضية "${caseItem.subject}" (الموكل: ${client.name} ضد ${caseItem.opponentName}).\nالحالة: ${statusMap[caseItem.status]}.\nالاتفاق المالي: ${caseItem.feeAgreement || 'لم يحدد'}.`;
                props.onOpenAdminTaskModal({ task: description });
            }
        },
        {
            label: 'مشاركة عبر واتساب',
            icon: <ShareIcon className="w-4 h-4" />,
            onClick: () => {
                const message = [
                    `*ملف قضية:*`,
                    `*الموضوع:* ${caseItem.subject}`,
                    `*الموكل:* ${client.name}`,
                    `*الخصم:* ${caseItem.opponentName}`,
                    `*الحالة:* ${statusMap[caseItem.status]}`,
                    `*الاتفاق المالي:* ${caseItem.feeAgreement || 'لم يحدد'}`
                ].join('\n');
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            }
        }];
        props.showContextMenu(event, menuItems);
    };

    return (
        <div className="border rounded-lg mb-2 bg-indigo-50 overflow-hidden">
            <div 
                className="flex justify-between items-center p-3 hover:bg-indigo-100 cursor-pointer" 
                onClick={onToggle}
                onContextMenu={handleContextMenu}
            >
                <div className="flex items-center gap-3 font-semibold text-indigo-800">
                    <FolderIcon className="w-5 h-5 text-indigo-600" />
                    <span>{caseItem.subject}</span>
                    <span className="text-gray-600 font-normal">(ضد: {caseItem.opponentName})</span>
                    <span className={`px-2 py-1 text-xs rounded-full ${caseItem.status === 'active' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>{caseItem.status === 'active' ? 'نشطة' : (caseItem.status === 'closed' ? 'مغلقة' : 'معلقة')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); props.onCreateInvoice(client.id, caseItem.id); }} className="p-1 text-gray-500 hover:text-green-600" title="إنشاء فاتورة"><DocumentTextIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onAddStage(client.id, caseItem.id); }} className="p-1 text-gray-500 hover:text-blue-600"><PlusIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onEditCase(caseItem, client); }} className="p-1 text-gray-500 hover:text-blue-600"><PencilIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onDeleteCase(caseItem.id, client.id); }} className="p-1 text-gray-500 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                </div>
            </div>
            {expanded && (
                <div className="p-3 bg-white">
                    <div className="flex border-b mb-3">
                        <button onClick={() => setActiveTab('stages')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'stages' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>المراحل والجلسات</button>
                        <button onClick={() => setActiveTab('accounting')} className={`px-4 py-2 text-sm font-medium ${activeTab === 'accounting' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}>المحاسبة</button>
                    </div>
                    {activeTab === 'stages' && (
                        <div>
                            {caseItem.stages.map(stage => (
                                <StageItemContainer key={stage.id} stage={stage} caseItem={caseItem} client={client} props={props} />
                            ))}
                        </div>
                    )}
                    {activeTab === 'accounting' && (
                        <CaseAccounting
                            caseData={caseItem}
                            client={client}
                            caseAccountingEntries={props.accountingEntries.filter(e => e.caseId === caseItem.id)}
                            setAccountingEntries={props.setAccountingEntries}
                            onFeeAgreementChange={handleFeeChange}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

const CaseItemContainer: React.FC<{ caseItem: Case; client: Client; props: ClientsTreeViewProps }> = ({ caseItem, client, props }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    return <CaseItem caseItem={caseItem} client={client} props={props} expanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} />
}

const ClientItem: React.FC<{ client: Client; props: ClientsTreeViewProps; expanded: boolean; onToggle: () => void; }> = ({ client, props, expanded, onToggle }) => {
    
    const handleContextMenu = (event: React.MouseEvent) => {
        const menuItems: MenuItem[] = [{
            label: 'إرسال إلى المهام الإدارية',
            icon: <BuildingLibraryIcon className="w-4 h-4" />,
            onClick: () => {
                const description = `متابعة ملف الموكل: ${client.name}.\nمعلومات الاتصال: ${client.contactInfo || 'لا يوجد'}.`;
                props.onOpenAdminTaskModal({ task: description });
            }
        },
        {
            label: 'مشاركة عبر واتساب',
            icon: <ShareIcon className="w-4 h-4" />,
            onClick: () => {
                const message = [
                    `*ملف موكل:*`,
                    `*الاسم:* ${client.name}`,
                    `*معلومات الاتصال:* ${client.contactInfo || 'لا يوجد'}`,
                    `*عدد القضايا:* ${client.cases.length}`
                ].join('\n');
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
            }
        }];
        props.showContextMenu(event, menuItems);
    };

    return (
        <div className="bg-sky-50 border rounded-lg shadow-sm">
            <header 
                className="flex justify-between items-center p-4 cursor-pointer bg-sky-100 hover:bg-sky-200"
                onClick={onToggle}
                onContextMenu={handleContextMenu}
            >
                <div className="flex items-center gap-3">
                    <UserIcon className="w-6 h-6 text-sky-700" />
                    <div>
                        <h3 className="font-bold text-lg text-sky-900">{client.name}</h3>
                        <p className="text-sm text-gray-500">{client.contactInfo}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-gray-600 bg-gray-200 px-2 py-1 rounded-full">{client.cases.length} قضايا</span>
                    <button onClick={(e) => { e.stopPropagation(); props.onPrintClientStatement(client.id); }} className="p-2 text-gray-500 hover:text-green-600" title="طباعة كشف حساب"><PrintIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onAddCase(client.id); }} className="p-2 text-gray-500 hover:text-blue-600" title="إضافة قضية"><PlusIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onEditClient(client); }} className="p-2 text-gray-500 hover:text-blue-600" title="تعديل الموكل"><PencilIcon className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); props.onDeleteClient(client.id); }} className="p-2 text-gray-500 hover:text-red-600" title="حذف الموكل"><TrashIcon className="w-4 h-4" /></button>
                    <ChevronLeftIcon className={`w-5 h-5 transition-transform text-gray-500 ${expanded ? '-rotate-90' : ''}`} />
                </div>
            </header>
            {expanded && (
                <div className="border-t border-sky-200 p-4 space-y-3 bg-white">
                    {client.cases.length > 0 ? (
                        client.cases.map(caseItem => (
                            <CaseItemContainer key={caseItem.id} caseItem={caseItem} client={client} props={props} />
                        ))
                    ) : (
                        <p className="text-center text-gray-500 py-3">لا توجد قضايا لهذا الموكل.</p>
                    )}
                </div>
            )}
        </div>
    );
};

const ClientsTreeView: React.FC<ClientsTreeViewProps> = (props) => {
    const [expanded, setExpanded] = React.useState<ExpandedState>({});

    const toggle = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    if (props.clients.length === 0) {
        return <p className="p-6 text-center text-gray-500">لا يوجد موكلون لعرضهم. ابدأ بإضافة موكل جديد.</p>;
    }

    return (
        <div className="p-4 space-y-4">
            {props.clients.map(client => (
                <ClientItem 
                    key={client.id} 
                    client={client} 
                    props={props} 
                    expanded={!!expanded[client.id]} 
                    onToggle={() => toggle(client.id)}
                />
            ))}
        </div>
    );
};

export default ClientsTreeView;