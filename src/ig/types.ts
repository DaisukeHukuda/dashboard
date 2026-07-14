export interface IgMedia { id: string; caption: string; timestamp: string; mediaType: string; permalink: string; }
export interface IgPostRow extends IgMedia { reach: number; likes: number; comments: number; saved: number; engagement: number; }
export interface IgSeriesPoint { date: string; value: number; }
