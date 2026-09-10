import type { CentralDrugReferenceDetailView } from '../../contracts';
import type { CentralSearchQuery, CentralSearchResult } from './products.repository';

export const PRODUCTS_CENTRAL_QUERY_REPOSITORY = Symbol('PRODUCTS_CENTRAL_QUERY_REPOSITORY');

export interface CentralCompanyLinkView {
  productId: string;
  productCode: string;
  displayName: string;
  status: string;
}

export interface ProductsCentralQueryRepository {
  search(query: CentralSearchQuery): Promise<CentralSearchResult>;
  getDetail(referenceId: string): Promise<CentralDrugReferenceDetailView | null>;
  getCompanyLink(companyId: string, referenceId: string): Promise<CentralCompanyLinkView | null>;
}
