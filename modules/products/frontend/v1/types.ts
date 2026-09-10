import type {
  CentralDrugReferenceView,
  CentralDrugSourceView,
  ProductDetail,
  ProductMarketStatus,
  ProductStatus,
  ProductSummary,
  ProductType,
} from '../../contracts';

export type Notice={kind:'success'|'error'|'info';text:string}|null;
export type Tab='catalog'|'central'|'masters'|'import';
export type Tri=''|'true'|'false';
export type MasterKind='category'|'tag'|'manufacturer'|'ingredient'|'dosage-form'|'route';
export type Master={id:string;name:string;active:boolean;parentId?:string|null};
export type MasterGroups={categories:Master[];tags:Master[];manufacturers:Master[];ingredients:Master[];dosageForms:Master[];routes:Master[]};
export type IngredientDraft={ingredientId:string;strengthValue:string;strengthUnit:string};
export type UnitDraft={name:string;shortLabel:string;conversionFactor:string;isBase:boolean;defaultSale:boolean;defaultPurchase:boolean;active:boolean};
export type BarcodeDraft={value:string;symbology:string;unitIndex:number;isPrimary:boolean;active:boolean;source:string};
export type ProductForm={
  productType:ProductType;displayName:string;arabicName:string;englishName:string;tradeName:string;description:string;notes:string;
  categoryId:string;tagIds:string[];manufacturerId:string;countryOfOrigin:string;dosageFormId:string;routeId:string;
  regulatoryId:string;atcCode:string;prescriptionClass:string;controlled:boolean;coldChain:boolean;storageNotes:string;
  marketStatus:ProductMarketStatus;referencePrice:string;referencePriceSource:string;referencePriceVerifiedAt:string;imageFileId:string;
  ingredients:IngredientDraft[];units:UnitDraft[];barcodes:BarcodeDraft[];
};
export type Filters={
  search:string;status:ProductStatus|'';productType:ProductType|'';categoryId:string;tagId:string;manufacturerId:string;ingredientId:string;dosageFormId:string;
  prescriptionClass:string;marketStatus:ProductMarketStatus|'';controlled:Tri;hasBarcode:Tri;hasImage:Tri;linkedCentral:Tri;
  createdFrom:string;createdTo:string;updatedFrom:string;updatedTo:string;
  sortBy:'NAME'|'PRODUCT_CODE'|'UPDATED_AT'|'CREATED_AT'|'MANUFACTURER'|'CATEGORY';sortDirection:'asc'|'desc';
};
export type ListResponse={items:ProductSummary[];page:number;pageSize:number;total:number};
export type AuditRecord={id:string;actorId:string|null;branchId:string|null;action:string;requestId:string|null;occurredAt:string};
export type AuditPage={items:AuditRecord[];page:number;pageSize:number;total:number};
export type ImportSession={id:string;kind:string;status:string;sourceName:string|null;datasetKey:string|null;totalRows:number|null;processedRows:number;acceptedRows:number;updatedRows:number;rejectedRows:number;quarantinedRows:number;createdAt:string;updatedAt:string};
export type ImportRowResult={row:number;status:string;reason?:string;productId?:string;centralDrugId?:string};
export type BulkPreview={requested:number;matched:number;missing:string[];wouldChange:number;valid:boolean;issues:Array<{productId:string;code:string;message:string}>};
export type CentralDataset={id:string;datasetKey:string;publishedAt:string|null;ingestedAt:string;status:string;source:{name:string;provenance:string;licenseNote:string|null}};
export type CentralAdmin={reference:CentralDrugReferenceView;source:CentralDrugSourceView;dataset:CentralDataset|null};
export type RequestFn=<T>(path:string,init?:RequestInit)=>Promise<T>;
export type ProductSelection={product:ProductDetail|null;creating:boolean;editing:boolean};

export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const initialFilters:Filters={search:'',status:'',productType:'',categoryId:'',tagId:'',manufacturerId:'',ingredientId:'',dosageFormId:'',prescriptionClass:'',marketStatus:'',controlled:'',hasBarcode:'',hasImage:'',linkedCentral:'',createdFrom:'',createdTo:'',updatedFrom:'',updatedTo:'',sortBy:'UPDATED_AT',sortDirection:'desc'};
export function newProductForm():ProductForm{return{productType:'DRUG',displayName:'',arabicName:'',englishName:'',tradeName:'',description:'',notes:'',categoryId:'',tagIds:[],manufacturerId:'',countryOfOrigin:'',dosageFormId:'',routeId:'',regulatoryId:'',atcCode:'',prescriptionClass:'',controlled:false,coldChain:false,storageNotes:'',marketStatus:'UNKNOWN',referencePrice:'',referencePriceSource:'',referencePriceVerifiedAt:'',imageFileId:'',ingredients:[{ingredientId:'',strengthValue:'',strengthUnit:''}],units:[{name:'وحدة',shortLabel:'',conversionFactor:'1',isBase:true,defaultSale:true,defaultPurchase:true,active:true}],barcodes:[]};}
export function nullable(value:string){const trimmed=value.trim();return trimmed||null;}
export function idempotencyKey(prefix:string){return`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,11)}`;}
export function formatDate(value:string){return new Intl.DateTimeFormat('ar-EG',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));}
export function errorMessage(payload:unknown,status:number){if(payload&&typeof payload==='object'&&'error'in payload){const error=(payload as{error?:{message?:unknown;code?:unknown}}).error;if(error?.message)return`${String(error.message)}${error.code?` (${String(error.code)})`:''}`;}return`Request failed (${status})`;}
export function showError(error:unknown,set:(notice:Notice)=>void){set({kind:'error',text:error instanceof Error?error.message:'حدث خطأ غير متوقع'});}
