export const PRODUCT_READER = Symbol('PRODUCT_READER');

export type ProductType = 'DRUG' | 'NON_DRUG';
export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type ProductMarketStatus = 'AVAILABLE' | 'DISCONTINUED' | 'UNKNOWN';
export type CentralDrugStatus = 'ACTIVE' | 'SUPERSEDED' | 'RETIRED' | 'QUARANTINED';
export type ImportSessionKind = 'COMPANY' | 'CENTRAL';
export type ImportSessionStatus = 'OPEN' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ProductCategoryView { id:string; companyId:string; name:string; parentId:string|null; active:boolean; createdAt:string; updatedAt:string; }
export interface ProductTagView { id:string; companyId:string; name:string; active:boolean; createdAt:string; updatedAt:string; }
export interface ProductManufacturerView { id:string; companyId:string; name:string; active:boolean; createdAt:string; updatedAt:string; }
export interface ProductIngredientMasterView { id:string; companyId:string; name:string; active:boolean; createdAt:string; updatedAt:string; }
export interface ProductDosageFormView { id:string; companyId:string; name:string; active:boolean; createdAt:string; updatedAt:string; }
export interface ProductRouteView { id:string; companyId:string; name:string; active:boolean; createdAt:string; updatedAt:string; }

export interface ProductIngredientView { id:string; productId:string; ingredient:ProductIngredientMasterView; strengthValue:string|null; strengthUnit:string|null; sortOrder:number; }
export interface ProductUnitView { id:string; productId:string; name:string; shortLabel:string|null; conversionFactor:string; isBase:boolean; defaultSale:boolean; defaultPurchase:boolean; active:boolean; version:number; createdAt:string; updatedAt:string; }
export interface ProductBarcodeView { id:string; productId:string; unitId:string; value:string; symbology:string|null; isPrimary:boolean; active:boolean; source:string|null; version:number; createdAt:string; updatedAt:string; }

export interface ProductSummary {
  id:string; companyId:string; productCode:string; productType:ProductType; displayName:string; arabicName:string|null; englishName:string|null; tradeName:string|null;
  category:ProductCategoryView|null; manufacturer:ProductManufacturerView|null; dosageForm:ProductDosageFormView|null; route:ProductRouteView|null;
  regulatoryId:string|null; atcCode:string|null; prescriptionClass:string|null; controlled:boolean; coldChain:boolean; marketStatus:ProductMarketStatus;
  referencePrice:string|null; referencePriceSource:string|null; referencePriceVerifiedAt:string|null; imageFileId:string|null; centralReferenceId:string|null;
  primaryBarcode:string|null; baseUnit:ProductUnitView|null; status:ProductStatus; version:number; createdAt:string; updatedAt:string;
}
export interface ProductDetail extends ProductSummary {
  description:string|null; notes:string|null; countryOfOrigin:string|null; storageNotes:string|null; tags:ProductTagView[];
  ingredients:ProductIngredientView[]; units:ProductUnitView[]; barcodes:ProductBarcodeView[]; centralSnapshot:unknown;
}

export interface BarcodeResolution { product:ProductSummary; unit:ProductUnitView; barcode:ProductBarcodeView; }

export interface CentralDrugIngredientView { name:string; strengthValue:string|null; strengthUnit:string|null; sortOrder:number; }
export interface CentralDrugBarcodeView { value:string; symbology:string|null; }
export interface CentralDrugSourceView { id:string; sourceKey:string; name:string; provenance:string; licenseNote:string|null; sourceUrl:string|null; active:boolean; createdAt:string; updatedAt:string; }
export interface CentralDrugReferenceView {
  id:string; sourceId:string; datasetId:string|null; sourceRecordKey:string; canonicalName:string; arabicName:string|null; englishName:string|null; tradeName:string|null;
  manufacturerName:string|null; dosageForm:string|null; route:string|null; regulatoryId:string|null; atcCode:string|null; prescriptionClass:string|null;
  controlled:boolean; packageDescription:string|null; baseUnitLabel:string|null; packageUnitLabel:string|null; conversionFactor:string|null; referencePrice:string|null;
  marketStatus:ProductMarketStatus; sourceEffectiveDate:string|null; lastVerifiedAt:string|null; status:CentralDrugStatus; version:number; quarantineReason:string|null;
  ingredients:CentralDrugIngredientView[]; barcodes:CentralDrugBarcodeView[]; createdAt:string; updatedAt:string;
}

export interface ProductReader {
  getProductSummary(companyId:string, productId:string):Promise<ProductSummary|null>;
  resolveBarcode(companyId:string, barcode:string):Promise<BarcodeResolution|null>;
  isProductAvailable(companyId:string, productId:string):Promise<boolean>;
}

export interface ProductChangedEvent {
  type:'products.product.created'|'products.product.updated'|'products.product.status-changed'|'products.product.barcode-changed'|'products.product.unit-changed'|'products.central-reference.adopted';
  occurredAt:string; companyId:string; productId:string; status:ProductStatus;
}
