
export const getDaysInMonth = (year: number, month: number): Date[] => {
    const date = new Date(year, month, 1);
    const days: Date[] = [];
    while (date.getMonth() === month) {
        days.push(new Date(date));
        date.setDate(date.getDate() + 1);
    }
    return days;
};

export const getFirstDayOfMonth = (year: number, month: number): number => {
    return new Date(year, month, 1).getDay();
};

export const isSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
};

export const isToday = (date: Date): boolean => {
    return isSameDay(date, new Date());
}

export const isBeforeToday = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today
    return date < today;
}

export const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('ar-SY', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
};