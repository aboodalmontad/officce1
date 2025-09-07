export interface Session {
  id: string;
  court: string;
  caseNumber: string;
  date: Date;
  clientName: string;
  opponentName: string;
  nextPostponementReason?: string;
  isPostponed: boolean;
  nextSessionDate?: Date;
  assignee?: string;
}

export interface Stage {
  id: string;
  court: string;
  caseNumber: string;
  firstSessionDate?: Date;
  sessions: Session[];
}

export interface Case {
  id: string;
  subject: string;
  clientName: string;
  opponentName: string;
  stages: Stage[];
  feeAgreement: string;
  status: 'active' | 'closed' | 'on_hold';
}

export interface Client {
  id: string;
  name: string;
  contactInfo: string;
  cases: Case[];
}

export interface AdminTask {
    id: string;
    task: string;
    dueDate: Date;
    completed: boolean;
    importance: 'normal' | 'important' | 'urgent';
    assignee?: string;
    location?: string;
}

export interface Appointment {
    id: string;
    title: string;
    time: string;
    date: Date;
    importance: 'normal' | 'important' | 'urgent';
}

export interface AccountingEntry {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    date: Date;
    description: string;
    clientId: string;
    caseId: string;
    clientName: string;
}