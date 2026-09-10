import type { CompanyIdentity, CompanyStatus, CompanyView } from '../../contracts';
export interface CompanyRepository { create(input: { code: string; name: string }): Promise<CompanyView>; list(): Promise<CompanyView[]>; findById(id: string): Promise<CompanyIdentity | null>; findByCode(code: string): Promise<CompanyIdentity | null>; setStatus(id: string, status: CompanyStatus): Promise<CompanyView | null>; }
export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');
