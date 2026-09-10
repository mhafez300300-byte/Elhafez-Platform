import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '@elhafez/database';
import { createTestApp, resetDatabase } from './test-app';

type Session={accessToken:string;userId:string};
type CreatedProduct={id:string;version:number;status:string;productCode:string;imageFileId:string|null;primaryBarcode:string|null;displayName:string;notes:string|null;centralReferenceId:string|null};

const PASSWORD='StrongPassword123!';

describe('Products v1 integration and API',()=>{
 let app:INestApplication;
 let prisma:PrismaService;
 let companyId:string;
 let branchId:string;
 let otherBranchId:string;
 let admin:Session;

 beforeAll(async()=>{app=await createTestApp();prisma=app.get(PrismaService);});
 beforeEach(async()=>{
  await resetDatabase(prisma);
  const company=await prisma.coreCompany.create({data:{code:'PROD-UAT',name:'Products UAT'}});companyId=company.id;
  branchId=(await prisma.coreBranch.create({data:{companyId,code:'MAIN',name:'Main'}})).id;
  otherBranchId=(await prisma.coreBranch.create({data:{companyId,code:'OTHER',name:'Other'}})).id;
  admin=await createSession('products-admin@example.com',true);
 });
 afterAll(()=>app.close());

 async function createSession(email:string,platformAdmin:boolean):Promise<Session>{
  const user=await prisma.coreUser.create({data:{email,displayName:email,platformAdmin}});
  await prisma.coreAuthCredential.create({data:{userId:user.id,login:email,passwordHash:await bcrypt.hash(PASSWORD,12)}});
  const login=await request(app.getHttpServer()).post('/api/auth/login').send({login:email,password:PASSWORD}).expect(201);
  return{accessToken:login.body.accessToken as string,userId:user.id};
 }
 function auth(session=admin){return{Authorization:`Bearer ${session.accessToken}`};}
 function scoped(session=admin,scopeCompanyId=companyId,scopeBranchId=branchId){return{...auth(session),'x-company-id':scopeCompanyId,'x-branch-id':scopeBranchId};}
 async function createImage(scopeCompanyId=companyId,scopeBranchId:string|null=branchId,mimeType='image/png'){
  return prisma.coreFileRecord.create({data:{originalName:'product.png',mimeType,size:512,storageKey:`products-test-${crypto.randomUUID()}`,checksumSha256:'a'.repeat(64),uploadedBy:admin.userId,companyId:scopeCompanyId,branchId:scopeBranchId}});
 }
 function body(overrides:Record<string,unknown>={}){return{
  productType:'NON_DRUG',displayName:'Scanner Item',notes:'initial',
  units:[{name:'Unit',conversionFactor:'1',isBase:true,defaultSale:true,defaultPurchase:true,active:true}],
  barcodes:[{value:'0001234567890',unitRef:'u0',symbology:'EAN-13',isPrimary:true,active:true}],activate:true,...overrides,
 };}
 async function createProduct(key:string,payload:Record<string,unknown>=body(),headers:Record<string,string>=scoped(),expected=201){
  return request(app.getHttpServer()).post('/api/products').set(headers).set('Idempotency-Key',key).send(payload).expect(expected);
 }

 it('creates atomically, validates FILE_READER scope, resolves leading-zero barcode, audits, and isolates companies',async()=>{
  const image=await createImage();
  const created=await createProduct('product-create-image-001',body({imageFileId:image.id}));
  expect(created.body.product.imageFileId).toBe(image.id);
  expect(created.body.product.status).toBe('ACTIVE');
  const exact=await request(app.getHttpServer()).get('/api/products/barcode/0001234567890').set(scoped()).expect(200);
  expect(exact.body.product.id).toBe(created.body.product.id);
  expect(exact.body.barcode.value).toBe('0001234567890');
  const audits=await prisma.coreAuditRecord.findMany({where:{entityId:created.body.product.id}});
  expect(audits.map(a=>a.action)).toContain('product.created');
  const other=await prisma.coreCompany.create({data:{code:'PROD-OTHER',name:'Other Company'}});
  await request(app.getHttpServer()).get(`/api/products/${created.body.product.id}`).set(scoped(admin,other.id,branchId)).expect(404);

  const wrongBranchFile=await createImage(companyId,otherBranchId);
  await createProduct('product-image-wrong-branch-002',body({displayName:'Wrong branch image',barcodes:[],imageFileId:wrongBranchFile.id}),scoped(),422);
  expect(await prisma.product.count({where:{displayName:'Wrong branch image'}})).toBe(0);

  const wrongCompanyFile=await createImage(other.id,null);
  await createProduct('product-image-wrong-company-003',body({displayName:'Wrong company image',barcodes:[],imageFileId:wrongCompanyFile.id}),scoped(),422);
  expect(await prisma.product.count({where:{displayName:'Wrong company image'}})).toBe(0);
 });

 it('is idempotent under double submit, rolls back duplicate-barcode creates, and rejects stale updates',async()=>{
  const payload=body({displayName:'Double Submit'});
  const [a,b]=await Promise.all([
   request(app.getHttpServer()).post('/api/products').set(scoped()).set('Idempotency-Key','product-double-001').send(payload),
   request(app.getHttpServer()).post('/api/products').set(scoped()).set('Idempotency-Key','product-double-001').send(payload),
  ]);
  expect([a.status,b.status]).toEqual([201,201]);
  expect(a.body.product.id).toBe(b.body.product.id);
  expect(await prisma.product.count({where:{companyId}})).toBe(1);

  await createProduct('duplicate-barcode-002',body({displayName:'Duplicate Barcode Attempt'}),scoped(),409);
  expect(await prisma.product.count({where:{companyId}})).toBe(1);
  expect(await prisma.productUnit.count()).toBe(1);
  expect(await prisma.productBarcode.count()).toBe(1);

  const current=a.body.product as CreatedProduct;
  const [u1,u2]=await Promise.all([
   request(app.getHttpServer()).patch(`/api/products/${current.id}`).set(scoped()).send({version:current.version,notes:'edit A'}),
   request(app.getHttpServer()).patch(`/api/products/${current.id}`).set(scoped()).send({version:current.version,notes:'edit B'}),
  ]);
  expect([u1.status,u2.status].sort((x,y)=>x-y)).toEqual([200,409]);
 });

 it('keeps a company import row atomic and makes chunk retry resumable/idempotent',async()=>{
  const start=await request(app.getHttpServer()).post('/api/products/import/sessions').set(scoped()).set('Idempotency-Key','company-import-001').send({mode:'CREATE_ONLY',totalRows:1,sourceName:'TEST FIXTURE - NOT A REAL DATASET'}).expect(201);
  const rejectedRow={row:2,displayName:'Rollback Import Row',productType:'DRUG',manufacturerName:'Must Roll Back',ingredientName:'Paracetamol',baseUnitName:'Tablet',barcode:'bad barcode !'};
  const chunk=await request(app.getHttpServer()).post(`/api/products/import/sessions/${start.body.id}/chunks`).set(scoped()).send({chunkKey:'rows-1',rows:[rejectedRow]}).expect(201);
  expect(chunk.body.result.rejected).toBe(1);
  expect(await prisma.product.count()).toBe(0);
  expect(await prisma.productManufacturer.count({where:{name:'Must Roll Back'}})).toBe(0);
  const replay=await request(app.getHttpServer()).post(`/api/products/import/sessions/${start.body.id}/chunks`).set(scoped()).send({chunkKey:'rows-1',rows:[rejectedRow]}).expect(201);
  expect(replay.body.replayed).toBe(true);
  expect(replay.body.result.rejected).toBe(1);

  const good=await request(app.getHttpServer()).post('/api/products/import/sessions').set(scoped()).set('Idempotency-Key','company-import-002').send({mode:'CREATE_ONLY',totalRows:1,sourceName:'TEST FIXTURE'}).expect(201);
  const accepted=await request(app.getHttpServer()).post(`/api/products/import/sessions/${good.body.id}/chunks`).set(scoped()).send({chunkKey:'rows-1',rows:[{row:2,productCode:'IMP-0001',displayName:'Imported Drug',productType:'DRUG',manufacturerName:'Fixture Pharma',ingredientName:'Fixture Ingredient',strengthValue:'500',strengthUnit:'mg',baseUnitName:'Tablet',packageUnitName:'Box',packageFactor:'20',barcode:'0000000000123'}]}).expect(201);
  expect(accepted.body.result.accepted).toBe(1);
  expect(await prisma.product.count({where:{companyId}})).toBe(1);
  const acceptedReplay=await request(app.getHttpServer()).post(`/api/products/import/sessions/${good.body.id}/chunks`).set(scoped()).send({chunkKey:'rows-1',rows:[]}).expect(400);
  expect(acceptedReplay.status).toBe(400);
  const exact=await request(app.getHttpServer()).get('/api/products/barcode/0000000000123').set(scoped()).expect(200);
  expect(exact.body.product.productCode).toBe('IMP-0001');
 });

 it('verifies Central Catalog capability with provenance, quarantine, search, retry, adoption and explicit compare/apply using test fixtures only',async()=>{
  await request(app.getHttpServer()).post('/api/products/central/sources').set(auth()).send({sourceKey:'bad-source',name:'Bad Source',provenance:'',active:true}).expect(422);
  const source=await request(app.getHttpServer()).post('/api/products/central/sources').set(auth()).send({sourceKey:'fixture-source',name:'TEST FIXTURE SOURCE',provenance:'Synthetic automated-test fixture; not an approved Egyptian medicine dataset.',licenseNote:'Test only',sourceUrl:null,active:true}).expect(201);
  const session=await request(app.getHttpServer()).post('/api/products/central/import/sessions').set(auth()).set('Idempotency-Key','central-import-001').send({sourceId:source.body.id,datasetKey:'fixture-v1',totalRows:2,sourceName:'TEST FIXTURE'}).expect(201);
  const firstRow={row:2,sourceRecordKey:'FIX-001',canonicalName:'Fixture Medicine',arabicName:'دواء اختباري',englishName:'Fixture Medicine',manufacturerName:'Fixture Pharma',ingredientName:'Fixture Ingredient',strengthValue:'500',strengthUnit:'mg',dosageForm:'Tablet',regulatoryId:'FIX-REG-001',atcCode:'N02BE01',baseUnitLabel:'Tablet',packageUnitLabel:'Box',conversionFactor:'20',barcode:'0001112223334',referencePrice:'25.50',marketStatus:'AVAILABLE'};
  const first=await request(app.getHttpServer()).post(`/api/products/central/import/sessions/${session.body.id}/chunks`).set(auth()).send({chunkKey:'central-1',rows:[firstRow]}).expect(201);
  expect(first.body.result.accepted).toBe(1);
  const centralId=first.body.result.rows[0].centralDrugId as string;

  const byBarcode=await request(app.getHttpServer()).get('/api/products/central?search=0001112223334&page=1&pageSize=25').set(auth()).expect(200);
  expect(byBarcode.body.items[0].id).toBe(centralId);
  const byArabic=await request(app.getHttpServer()).get(`/api/products/central?search=${encodeURIComponent('دواء اختباري')}&page=1&pageSize=25`).set(auth()).expect(200);
  expect(byArabic.body.items.some((x:{id:string})=>x.id===centralId)).toBe(true);
  const byIngredient=await request(app.getHttpServer()).get('/api/products/central?search=Fixture%20Ingredient&page=1&pageSize=25').set(auth()).expect(200);
  expect(byIngredient.body.items.some((x:{id:string})=>x.id===centralId)).toBe(true);

  const conflictRow={...firstRow,row:3,sourceRecordKey:'FIX-002',canonicalName:'Conflicting Fixture',regulatoryId:'FIX-REG-002'};
  const conflict=await request(app.getHttpServer()).post(`/api/products/central/import/sessions/${session.body.id}/chunks`).set(auth()).send({chunkKey:'central-2',rows:[conflictRow]}).expect(201);
  expect(conflict.body.result.quarantined).toBe(1);
  expect(conflict.body.result.rows[0].reason).toContain('BARCODE_CONFLICT');
  const conflictId=conflict.body.result.rows[0].centralDrugId as string;
  expect((await prisma.centralDrugReference.findUniqueOrThrow({where:{id:conflictId}})).status).toBe('QUARANTINED');
  const replay=await request(app.getHttpServer()).post(`/api/products/central/import/sessions/${session.body.id}/chunks`).set(auth()).send({chunkKey:'central-2',rows:[conflictRow]}).expect(201);
  expect(replay.body.replayed).toBe(true);

  const adopted=await request(app.getHttpServer()).post(`/api/products/central/${centralId}/adopt`).set(scoped()).set('Idempotency-Key','central-adopt-001').expect(201);
  expect(adopted.body.product.centralReferenceId).toBe(centralId);
  expect(adopted.body.product.status).toBe('ACTIVE');
  const adoptedAgain=await request(app.getHttpServer()).post(`/api/products/central/${centralId}/adopt`).set(scoped()).set('Idempotency-Key','central-adopt-001').expect(201);
  expect(adoptedAgain.body.product.id).toBe(adopted.body.product.id);
  expect(await prisma.product.count({where:{companyId,centralReferenceId:centralId}})).toBe(1);

  const local=await request(app.getHttpServer()).patch(`/api/products/${adopted.body.product.id}`).set(scoped()).send({version:adopted.body.product.version,displayName:'Local Override',notes:'keep-local-note'}).expect(200);
  const updateSession=await request(app.getHttpServer()).post('/api/products/central/import/sessions').set(auth()).set('Idempotency-Key','central-import-002').send({sourceId:source.body.id,datasetKey:'fixture-v2',totalRows:1,sourceName:'TEST FIXTURE UPDATE'}).expect(201);
  const updatedRow={...firstRow,canonicalName:'Fixture Medicine Updated',referencePrice:'30.00'};
  const centralUpdate=await request(app.getHttpServer()).post(`/api/products/central/import/sessions/${updateSession.body.id}/chunks`).set(auth()).send({chunkKey:'central-update-1',rows:[updatedRow]}).expect(201);
  expect(centralUpdate.body.result.updated).toBe(1);
  const beforeApply=await request(app.getHttpServer()).get(`/api/products/${local.body.id}/central-compare`).set(scoped()).expect(200);
  expect(beforeApply.body.product.displayName).toBe('Local Override');
  expect(beforeApply.body.central.canonicalName).toBe('Fixture Medicine Updated');
  const applied=await request(app.getHttpServer()).post(`/api/products/${local.body.id}/central-apply`).set(scoped()).send({version:local.body.version,sections:['names','reference-price']}).expect(201);
  expect(applied.body.displayName).toBe('Fixture Medicine Updated');
  expect(applied.body.notes).toBe('keep-local-note');
  expect(applied.body.referencePrice).toBe('30');

  const actions=(await prisma.coreAuditRecord.findMany({orderBy:{occurredAt:'asc'}})).map(a=>a.action);
  expect(actions).toEqual(expect.arrayContaining(['central.source-created','central.ingestion-started','central.ingestion-chunk-completed','central.reference-adopted','central.reference-update-applied']));
 });

 it('rejects central-management access for a normal user without global authorization',async()=>{
  const normal=await createSession('products-normal@example.com',false);
  await request(app.getHttpServer()).post('/api/products/central/sources').set(auth(normal)).send({sourceKey:'forbidden',name:'Forbidden',provenance:'test',active:true}).expect(403);
 });

 it('handles a 25,000+ row company catalog with server-side pagination and exact search',async()=>{
  const rows=Array.from({length:25050},(_,i)=>({companyId,productCode:`LOAD-${String(i).padStart(5,'0')}`,productType:'NON_DRUG',displayName:`Load Product ${i}`,normalizedName:`load product ${i}`,status:'DRAFT'}));
  await prisma.product.createMany({data:rows});
  const page=await request(app.getHttpServer()).get('/api/products?page=251&pageSize=100').set(scoped()).expect(200);
  expect(page.body.total).toBe(25050);
  expect(page.body.items).toHaveLength(50);
  const exact=await request(app.getHttpServer()).get('/api/products?search=LOAD-24999&page=1&pageSize=25').set(scoped()).expect(200);
  expect(exact.body.items.some((p:{productCode:string})=>p.productCode==='LOAD-24999')).toBe(true);
 });
});
