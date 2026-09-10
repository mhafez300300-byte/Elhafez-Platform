import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@elhafez/database';
import type { CentralDrugReferenceDetailView, CentralDrugReferenceView } from '../../contracts';
import { normalizeBarcode, normalizeSearchText } from '../domain/product';
import type { CentralSearchQuery, CentralSearchResult } from '../application/products.repository';
import type { ProductsCentralQueryRepository } from '../application/products-central-query.repository';

const includeCentral = {
  ingredients: { orderBy: { sortOrder: 'asc' } },
  barcodes: { orderBy: { value: 'asc' } },
} satisfies Prisma.CentralDrugReferenceInclude;
type CentralRow = Prisma.CentralDrugReferenceGetPayload<{ include: typeof includeCentral }>;

function mapCentral(row: CentralRow): CentralDrugReferenceView {
  return {
    id: row.id,
    sourceId: row.sourceId,
    datasetId: row.datasetId,
    sourceRecordKey: row.sourceRecordKey,
    canonicalName: row.canonicalName,
    arabicName: row.arabicName,
    englishName: row.englishName,
    tradeName: row.tradeName,
    manufacturerName: row.manufacturerName,
    dosageForm: row.dosageForm,
    route: row.route,
    regulatoryId: row.regulatoryId,
    atcCode: row.atcCode,
    prescriptionClass: row.prescriptionClass,
    controlled: row.controlled,
    packageDescription: row.packageDescription,
    baseUnitLabel: row.baseUnitLabel,
    packageUnitLabel: row.packageUnitLabel,
    conversionFactor: row.conversionFactor?.toString() ?? null,
    referencePrice: row.referencePrice?.toString() ?? null,
    marketStatus: row.marketStatus as CentralDrugReferenceView['marketStatus'],
    sourceEffectiveDate: row.sourceEffectiveDate?.toISOString() ?? null,
    lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null,
    status: row.status as CentralDrugReferenceView['status'],
    version: row.version,
    quarantineReason: row.quarantineReason,
    ingredients: row.ingredients.map((item) => ({
      name: item.name,
      strengthValue: item.strengthValue?.toString() ?? null,
      strengthUnit: item.strengthUnit,
      sortOrder: item.sortOrder,
    })),
    barcodes: row.barcodes.map((item) => ({ value: item.value, symbology: item.symbology })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaProductsCentralQueryRepository implements ProductsCentralQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: CentralSearchQuery): Promise<CentralSearchResult> {
    const statusFilter: Prisma.CentralDrugReferenceWhereInput = query.status ? { status: query.status } : { status: { not: 'QUARANTINED' } };
    const base: Prisma.CentralDrugReferenceWhereInput = {
      ...statusFilter,
      ...(query.manufacturer ? { manufacturerName: { contains: query.manufacturer, mode: 'insensitive' } } : {}),
      ...(query.dosageForm ? { dosageForm: { contains: query.dosageForm, mode: 'insensitive' } } : {}),
      ...(query.controlled !== undefined ? { controlled: query.controlled } : {}),
      ...(query.strength && decimalOrNull(query.strength) ? { ingredients: { some: { strengthValue: new Prisma.Decimal(query.strength) } } } : {}),
    };

    if (query.search && query.page === 1) {
      const exactBarcode = normalizeBarcodeSafe(query.search);
      const barcode = await this.prisma.centralDrugBarcode.findUnique({ where: { value: exactBarcode }, select: { centralDrugId: true } });
      if (barcode) {
        const exact = await this.prisma.centralDrugReference.findFirst({ where: { ...base, id: barcode.centralDrugId }, include: includeCentral });
        if (exact) return { items: [mapCentral(exact)], page: 1, pageSize: query.pageSize, total: 1 };
      }
    }

    const normalized = query.search ? normalizeSearchText(query.search) : undefined;
    const numericSearch = query.search ? decimalOrNull(query.search) : null;
    const where: Prisma.CentralDrugReferenceWhereInput = {
      ...base,
      ...(normalized ? {
        OR: [
          { normalizedName: { contains: normalized } },
          { normalizedArabicName: { contains: normalized } },
          { normalizedEnglishName: { contains: normalized } },
          { normalizedTradeName: { contains: normalized } },
          { manufacturerName: { contains: query.search!, mode: 'insensitive' } },
          { dosageForm: { contains: query.search!, mode: 'insensitive' } },
          { regulatoryId: { equals: query.search!, mode: 'insensitive' } },
          { atcCode: { equals: query.search!, mode: 'insensitive' } },
          { ingredients: { some: { normalizedName: { contains: normalized } } } },
          ...(numericSearch ? [{ ingredients: { some: { strengthValue: new Prisma.Decimal(numericSearch) } } } as Prisma.CentralDrugReferenceWhereInput] : []),
        ],
      } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.centralDrugReference.findMany({
        where,
        include: includeCentral,
        orderBy: [{ canonicalName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.centralDrugReference.count({ where }),
    ]);
    return { items: rows.map(mapCentral), page: query.page, pageSize: query.pageSize, total };
  }

  async getDetail(referenceId: string): Promise<CentralDrugReferenceDetailView | null> {
    const row = await this.prisma.centralDrugReference.findUnique({
      where: { id: referenceId },
      include: { ...includeCentral, source: true, dataset: true },
    });
    if (!row) return null;
    return {
      reference: mapCentral(row),
      source: {
        id: row.source.id,
        sourceKey: row.source.sourceKey,
        name: row.source.name,
        provenance: row.source.provenance,
        licenseNote: row.source.licenseNote,
        sourceUrl: row.source.sourceUrl,
        active: row.source.active,
      },
      dataset: row.dataset ? {
        id: row.dataset.id,
        datasetKey: row.dataset.datasetKey,
        publishedAt: row.dataset.publishedAt?.toISOString() ?? null,
        ingestedAt: row.dataset.ingestedAt.toISOString(),
        status: row.dataset.status,
      } : null,
    };
  }

  async getCompanyLink(companyId: string, referenceId: string) {
    const product = await this.prisma.product.findFirst({
      where: { companyId, centralReferenceId: referenceId },
      select: { id: true, productCode: true, displayName: true, status: true },
    });
    return product ? { productId: product.id, productCode: product.productCode, displayName: product.displayName, status: product.status } : null;
  }
}

function decimalOrNull(value: string): string | null {
  const trimmed = value.trim();
  return /^\d+(?:\.\d{1,6})?$/.test(trimmed) ? trimmed : null;
}

function normalizeBarcodeSafe(value: string) {
  try { return normalizeBarcode(value); } catch { return value.trim(); }
}
