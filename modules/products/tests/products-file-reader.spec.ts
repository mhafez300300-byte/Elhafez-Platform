import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@elhafez/errors';
import type { FileReader, FileSummary } from '@elhafez/files/contracts';
import type { EventBus } from '@elhafez/events';
import type { StructuredLogger } from '@elhafez/logging';
import type { ProductDetail } from '../contracts';
import type { ProductsRepository } from '../backend/application/products.repository';
import { ProductsService, type ProductMutationContext } from '../backend/application/products.service';

const COMPANY_ID='11111111-1111-4111-8111-111111111111';
const BRANCH_ID='22222222-2222-4222-8222-222222222222';
const FILE_ID='33333333-3333-4333-8333-333333333333';

function product(imageFileId:string|null):ProductDetail{return{
 id:'44444444-4444-4444-8444-444444444444',companyId:COMPANY_ID,productCode:'PRD-TEST000001',productType:'NON_DRUG',displayName:'Image product',arabicName:null,englishName:null,tradeName:null,
 category:null,manufacturer:null,dosageForm:null,route:null,regulatoryId:null,atcCode:null,prescriptionClass:null,controlled:false,coldChain:false,marketStatus:'UNKNOWN',referencePrice:null,referencePriceSource:null,referencePriceVerifiedAt:null,imageFileId,centralReferenceId:null,primaryBarcode:null,baseUnit:null,status:'DRAFT',version:1,createdAt:new Date(0).toISOString(),updatedAt:new Date(0).toISOString(),
 description:null,notes:null,countryOfOrigin:null,storageNotes:null,tags:[],ingredients:[],units:[],barcodes:[],centralSnapshot:null,
};}

function harness(summary:FileSummary|null){
 const create=vi.fn(async(record:{draft:{imageFileId:string|null}})=>product(record.draft.imageFileId));
 const repository={
  findByCreateRequestKey:vi.fn(async()=>null),findLikelyDuplicates:vi.fn(async()=>[]),create,
 } as unknown as ProductsRepository;
 const getFileSummary=vi.fn(async()=>summary);
 const files={getFileSummary,isFileAccessible:vi.fn()} as unknown as FileReader;
 const events={publish:vi.fn(async()=>undefined)} as unknown as EventBus;
 const logger={log:vi.fn()} as unknown as StructuredLogger;
 return{service:new ProductsService(repository,files,events,logger),create,getFileSummary};
}

const context:ProductMutationContext={companyId:COMPANY_ID,branchId:BRANCH_ID,actorId:'55555555-5555-4555-8555-555555555555',requestId:'image-test'};
const input={productType:'NON_DRUG' as const,displayName:'Image product',imageFileId:FILE_ID};

function summary(mimeType='image/png'):FileSummary{return{id:FILE_ID,originalName:'product.png',mimeType,size:512,companyId:COMPANY_ID,branchId:BRANCH_ID,createdAt:new Date(0).toISOString()};}

describe('Products FILE_READER collaboration',()=>{
 it('accepts an accessible image and passes authenticated company/branch scope to the public reader',async()=>{
  const h=harness(summary());
  const result=await h.service.create(input,'image-create-0001',context);
  expect(result.product.imageFileId).toBe(FILE_ID);
  expect(h.getFileSummary).toHaveBeenCalledWith(FILE_ID,{companyId:COMPANY_ID,branchId:BRANCH_ID});
  expect(h.create).toHaveBeenCalledTimes(1);
 });

 it('rejects a missing or inaccessible file before Products persistence',async()=>{
  const h=harness(null);
  await expect(h.service.create(input,'image-create-0002',context)).rejects.toBeInstanceOf(ValidationError);
  expect(h.create).not.toHaveBeenCalled();
 });

 it('rejects a wrong-company/wrong-branch result represented as inaccessible by the public contract',async()=>{
  const h=harness(null);
  const otherScope={...context,companyId:'66666666-6666-4666-8666-666666666666',branchId:'77777777-7777-4777-8777-777777777777'};
  await expect(h.service.create(input,'image-create-0003',otherScope)).rejects.toBeInstanceOf(ValidationError);
  expect(h.getFileSummary).toHaveBeenCalledWith(FILE_ID,{companyId:otherScope.companyId,branchId:otherScope.branchId});
  expect(h.create).not.toHaveBeenCalled();
 });

 it('rejects an accessible non-image file before Products persistence',async()=>{
  const h=harness(summary('application/pdf'));
  await expect(h.service.create(input,'image-create-0004',context)).rejects.toBeInstanceOf(ValidationError);
  expect(h.create).not.toHaveBeenCalled();
 });

 it('does not consult Files when no product image reference is supplied',async()=>{
  const h=harness(null);
  await h.service.create({productType:'NON_DRUG',displayName:'No image'},'image-create-0005',context);
  expect(h.getFileSummary).not.toHaveBeenCalled();
  expect(h.create).toHaveBeenCalledTimes(1);
 });
});
