export interface Ga4ReportSpec { key: string; dimensions: string[]; metrics: string[]; limit?: number; dimensionFilter?: { fieldName: string; values: string[] }; }
export interface Ga4Row { dims: string[]; mets: number[]; }
