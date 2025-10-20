import * as React from 'react';
import { GoogleGenAI } from '@google/genai';
import { Client, AdminTask, Appointment, AccountingEntry } from '../types';
import { APP_DATA_KEY } from './useSupabaseData';

export type AnalysisStatus = 'idle' | 'analyzing' | 'success' | 'error';

type AppData = {
    clients: Client[];
    adminTasks: AdminTask[];
    appointments: Appointment[];
    accountingEntries: AccountingEntry[];
};

const dateReviver = (key: string, value: any) => {
    const dateKeys = ['date', 'dueDate', 'firstSessionDate', 'nextSessionDate'];
    if (dateKeys.includes(key) && typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return value;
};

export const useAnalysis = () => {
    const [analysisStatus, setAnalysisStatus] = React.useState<AnalysisStatus>('idle');
    const [analysisReport, setAnalysisReport] = React.useState<string | null>(null);
    const [lastAnalysis, setLastAnalysis] = React.useState<Date | null>(() => {
        try {
            const saved = localStorage.getItem('lastAnalysis');
            return saved ? new Date(saved) : null;
        } catch (error) {
            console.error("Failed to load last analysis date from localStorage", error);
            return null;
        }
    });

    const triggerAnalysis = React.useCallback(async () => {
        setAnalysisStatus('analyzing');
        setAnalysisReport("### ⏳ جاري تحليل بياناتك الحالية...");
        
        let ai: GoogleGenAI;
        try {
            ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        } catch (e) {
            console.error("Failed to initialize GoogleGenAI", e);
            setAnalysisStatus('error');
            setAnalysisReport("### ❌ فشلت عملية التحليل\nالسبب: لم يتم تهيئة عميل الذكاء الاصطناعي. يرجى التحقق من إعدادات مفتاح API.");
            setTimeout(() => setAnalysisStatus('idle'), 5000);
            return;
        }
        
        try {
            const rawData = localStorage.getItem(APP_DATA_KEY);
            if (!rawData) {
                throw new Error("لا توجد بيانات محلية للتحليل.");
            }
            const data: AppData = JSON.parse(rawData, dateReviver);

            const simplifiedData = {
                clientCount: data.clients?.length || 0,
                totalCases: (data.clients || []).reduce((acc, c) => acc + (c.cases?.length || 0), 0),
                activeCases: (data.clients || []).flatMap(c => c.cases).filter(c => c.status === 'active').length,
                pendingTasks: (data.adminTasks || []).filter(t => !t.completed).length,
                upcomingAppointments: (data.appointments || []).filter(a => new Date(a.date) >= new Date()).length,
                totalIncome: (data.accountingEntries || []).filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0),
                totalExpenses: (data.accountingEntries || []).filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0),
            };

            const prompt = `
                You are an expert legal office management consultant. Based on the following summary data from a lawyer's management application, provide a concise, actionable intelligence report in Arabic. 
                The report should be encouraging and professional, suitable for a lawyer to quickly understand the state of their practice.
                
                Structure your response with these exact markdown headings:
                ### 📊 ملخص الأداء
                ### 💡 توصيات استراتيجية
                
                Under "ملخص الأداء", provide a brief overview of the key metrics.
                Under "توصيات استراتيجية", offer one or two clear, actionable recommendations for improving efficiency or client management.
                Keep the entire response brief and to the point.

                Data Summary:
                - Total Clients: ${simplifiedData.clientCount}
                - Total Cases: ${simplifiedData.totalCases}
                - Active Cases: ${simplifiedData.activeCases}
                - Pending Administrative Tasks: ${simplifiedData.pendingTasks}
                - Upcoming Appointments: ${simplifiedData.upcomingAppointments}
                - Total Income: ${simplifiedData.totalIncome.toLocaleString()}
                - Total Expenses: ${simplifiedData.totalExpenses.toLocaleString()}

                Generate the report now.
            `;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });
            
            const reportText = response.text;
            setAnalysisReport(reportText);

            const now = new Date();
            setLastAnalysis(now);
            localStorage.setItem('lastAnalysis', now.toISOString());
            setAnalysisStatus('success');

        } catch (error) {
            console.error("Analysis process failed:", error);
            setAnalysisStatus('error');
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            setAnalysisReport(`### ❌ فشلت عملية التحليل\nالسبب: ${errorMessage}`);
        } finally {
            setTimeout(() => setAnalysisStatus('idle'), 5000);
        }
    }, []);

    return { analysisStatus, lastAnalysis, triggerAnalysis, analysisReport };
};