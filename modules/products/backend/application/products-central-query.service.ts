import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '@elhafez/errors';
import type { CentralSearchQuery } from './products.repository';
import { PRODUCTS_CENTRAL_QUERY_REPOSITORY, type ProductsCentralQueryRepository } from './products-central-query.repository';

@Injectable()
export class ProductsCentralQueryService {
  constructor(@Inject(PRODUCTS_CENTRAL_QUERY_REPOSITORY) private readonly repository: ProductsCentralQueryRepository) {}

  search(query: CentralSearchQuery) {
    return this.repository.search(query);
  }

  async getDetail(referenceId: string) {
    const detail = await this.repository.getDetail(referenceId);
    if (!detail) throw new NotFoundError('Central drug reference not found');
    return detail;
  }
}
