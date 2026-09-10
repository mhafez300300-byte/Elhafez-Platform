export const COMPANY_STATUS_READER = Symbol('COMPANY_STATUS_READER');
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED';
export interface CompanyIdentity { id: string; code: string; name: string; status: CompanyStatus; }
export interface CompanyStatusReader { getCompany(companyId: string): Promise<CompanyIdentity | null>; }
export interface CompanyView extends CompanyIdentity { createdAt: string; updatedAt: string; }
