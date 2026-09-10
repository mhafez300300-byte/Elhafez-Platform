import fs from 'node:fs';
import path from 'node:path';

const CORE_MODULES = new Set(['auth','users','roles','permissions','companies','branches','audit','files','notifications']);
const REQUIRED_MODULE_DIRS = ['backend/domain','backend/application','backend/infrastructure','backend/api','frontend','contracts','tests'];
const MODULE_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REQUIRED_EXPORTS = {
  '.': './index.ts',
  './contracts': './contracts/index.ts',
  './frontend': './frontend/index.ts',
};
const CORE_MODEL_OWNERS = new Map([
  ['coreAuthCredential','auth'],
  ['coreAuthSession','auth'],
  ['coreUser','users'],
  ['coreRole','roles'],
  ['corePermission','permissions'],
  ['coreRolePermission','permissions'],
  ['coreUserRoleAssignment','permissions'],
  ['coreCompany','companies'],
  ['coreBranch','branches'],
  ['coreAuditRecord','audit'],
  ['coreFileRecord','files'],
  ['coreNotification','notifications'],
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=> {
    const full=path.join(dir,entry.name);
    if(entry.name==='node_modules'||entry.name==='dist'||entry.name==='.git'||entry.name==='coverage') return [];
    return entry.isDirectory()?walk(full):[full];
  });
}
function importsOf(source){
  const out=[];
  const re=/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match; while((match=re.exec(source))) out.push(match[1]);
  return out;
}
function moduleNameFromFile(root,file){
  const modulesRoot=path.join(root,'modules');
  const relative=path.relative(modulesRoot,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)) return null;
  const rel=relative.split(path.sep);
  return rel.length>1?rel[0]:null;
}
function moduleFromAlias(spec){
  const m=spec.match(/^@elhafez\/([^/]+)(?:\/(.*))?$/);
  return m?{name:m[1],sub:m[2]??''}:null;
}
function isSource(file){return /\.(?:ts|tsx|js|mjs|cjs)$/.test(file);}
function prismaClientProperty(modelName){return modelName[0].toLowerCase()+modelName.slice(1);}
function parsePrismaModelProperties(source){
  return [...source.matchAll(/^\s*model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm)].map((match)=>prismaClientProperty(match[1]));
}
function moduleStructureErrors(root,name){
  const errors=[];
  const moduleDir=path.join(root,'modules',name);
  for(const dir of REQUIRED_MODULE_DIRS){
    if(!fs.existsSync(path.join(moduleDir,dir))) errors.push(`Module ${name} missing required directory ${dir}`);
  }
  for(const file of ['package.json','index.ts']){
    if(!fs.existsSync(path.join(moduleDir,file))) errors.push(`Module ${name} missing ${file}`);
  }
  return errors;
}
function readJson(file,errors,label){
  try{return JSON.parse(fs.readFileSync(file,'utf8'));}
  catch{errors.push(`${label}: invalid JSON`);return null;}
}
function validateModuleManifest(root,name,errors){
  const manifest=path.join(root,'modules',name,'package.json');
  if(!fs.existsSync(manifest)) return;
  const pkg=readJson(manifest,errors,`modules/${name}/package.json`);
  if(!pkg) return;
  if(pkg.name!==`@elhafez/${name}`) errors.push(`Module ${name} package name must be @elhafez/${name}`);
  if(pkg.private!==true) errors.push(`Module ${name} package must be private`);
  for(const [key,value] of Object.entries(REQUIRED_EXPORTS)){
    if(pkg.exports?.[key]!==value) errors.push(`Module ${name} package export ${key} must be ${value}`);
  }
}
function discoverModelOwners(root,moduleNames,errors){
  const owners=new Map(CORE_MODEL_OWNERS);
  const schemaDir=path.join(root,'prisma/schema/modules');
  if(!fs.existsSync(schemaDir)) return owners;
  for(const entry of fs.readdirSync(schemaDir,{withFileTypes:true})){
    if(!entry.isFile()||!entry.name.endsWith('.prisma')) continue;
    const moduleName=entry.name.slice(0,-'.prisma'.length);
    if(CORE_MODULES.has(moduleName)){
      errors.push(`Core module ${moduleName} must not declare ownership in prisma/schema/modules`);
      continue;
    }
    if(!moduleNames.has(moduleName)){
      errors.push(`Business Prisma schema ${entry.name} has no matching module`);
      continue;
    }
    if(!MODULE_NAME_PATTERN.test(moduleName)){
      errors.push(`Business Prisma schema ${entry.name} has invalid module name`);
      continue;
    }
    const file=path.join(schemaDir,entry.name);
    for(const property of parsePrismaModelProperties(fs.readFileSync(file,'utf8'))){
      const previous=owners.get(property);
      if(previous&&previous!==moduleName){
        errors.push(`Prisma model ${property} is declared for both ${previous} and ${moduleName}`);
        continue;
      }
      owners.set(property,moduleName);
    }
  }
  return owners;
}
function accessedOwnedModels(source,modelOwners){
  const found=new Set();
  for(const match of source.matchAll(/\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\b/g)){
    if(modelOwners.has(match[1])) found.add(match[1]);
  }
  for(const match of source.matchAll(/\[\s*['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]\s*\]/g)){
    if(modelOwners.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

export function checkArchitecture(root){
  const errors=[];
  const modulesDir=path.join(root,'modules');
  const moduleNamesList=fs.existsSync(modulesDir)?fs.readdirSync(modulesDir).filter((x)=>fs.statSync(path.join(modulesDir,x)).isDirectory()):[];
  const moduleNames=new Set(moduleNamesList);
  const moduleKinds=new Map();

  for(const name of CORE_MODULES){
    if(!moduleNames.has(name)) errors.push(`Required Core module missing: modules/${name}`);
  }

  for(const name of moduleNamesList){
    const structureErrors=moduleStructureErrors(root,name);
    errors.push(...structureErrors);
    const validName=MODULE_NAME_PATTERN.test(name);
    if(!validName) errors.push(`Invalid module directory name: modules/${name}`);
    const kind=CORE_MODULES.has(name)?'CORE':validName&&structureErrors.length===0?'BUSINESS':'INVALID';
    moduleKinds.set(name,kind);
    validateModuleManifest(root,name,errors);
  }

  const modelOwners=discoverModelOwners(root,moduleNames,errors);
  const graph=new Map(moduleNamesList.map((m)=>[m,new Set()]));
  const files=walk(root).filter(isSource);
  for(const file of files){
    const source=fs.readFileSync(file,'utf8');
    const rel=path.relative(root,file).replaceAll(path.sep,'/');
    const owner=moduleNameFromFile(root,file);
    const specs=importsOf(source);

    for(const spec of specs){
      const alias=moduleFromAlias(spec);
      if(owner&&alias&&moduleNames.has(alias.name)&&alias.name!==owner){
        if(alias.sub!=='contracts') errors.push(`${rel}: cross-module import must use contracts only: ${spec}`);
        graph.get(owner)?.add(alias.name);
      }
      if(rel.startsWith('packages/')&&alias&&moduleNames.has(alias.name)) errors.push(`${rel}: platform package cannot import module ${spec}`);
      if(rel.startsWith('apps/web/')&&alias&&moduleNames.has(alias.name)&&alias.sub!=='frontend'&&alias.sub!=='contracts') errors.push(`${rel}: web app cannot import backend module surface ${spec}`);
      if(owner&&rel.startsWith(`modules/${owner}/frontend/`)&&(spec.includes('/backend/')||spec===`@elhafez/${owner}`)) errors.push(`${rel}: frontend cannot import backend: ${spec}`);
      if(owner&&rel.startsWith(`modules/${owner}/backend/domain/`)&&(spec.includes('/application/')||spec.includes('/infrastructure/')||spec.includes('/api/'))) errors.push(`${rel}: domain cannot depend on upper layer: ${spec}`);
      if(owner&&rel.startsWith(`modules/${owner}/backend/application/`)){
        if(spec.includes('/infrastructure/')||spec.includes('/api/')||spec==='@elhafez/database'||spec==='@prisma/client') errors.push(`${rel}: application cannot depend on infrastructure/database: ${spec}`);
      }
      if(owner&&rel.startsWith(`modules/${owner}/backend/api/`)&&spec.includes('/infrastructure/')) errors.push(`${rel}: API cannot depend on infrastructure: ${spec}`);
      if(owner&&spec.startsWith('.')){
        const targetOwner=moduleNameFromFile(root,path.resolve(path.dirname(file),spec));
        if(targetOwner&&targetOwner!==owner) errors.push(`${rel}: relative escape across modules is forbidden: ${spec}`);
      }
    }

    if(owner&&rel.includes('/backend/infrastructure/')){
      for(const model of accessedOwnedModels(source,modelOwners)){
        const modelOwner=modelOwners.get(model);
        if(modelOwner!==owner) errors.push(`${rel}: module ${owner} accesses Prisma model owned by another module: ${model}`);
      }
    }
    if(owner&&!rel.includes('/backend/infrastructure/')&&(source.includes('@prisma/client')||source.includes('@elhafez/database'))){
      if(rel!==`modules/${owner}/index.ts`) errors.push(`${rel}: Prisma/database access allowed only in infrastructure`);
    }
  }

  const visiting=new Set(),visited=new Set();
  function dfs(node,stack){
    if(visiting.has(node)){
      errors.push(`Circular module dependency: ${[...stack,node].join(' -> ')}`);
      return;
    }
    if(visited.has(node)) return;
    visiting.add(node);
    for(const next of graph.get(node)??[]) dfs(next,[...stack,node]);
    visiting.delete(node);
    visited.add(node);
  }
  for(const node of graph.keys()) dfs(node,[]);

  for(const manifest of walk(root).filter((f)=>path.basename(f)==='package.json')){
    const pkg=readJson(manifest,errors,path.relative(root,manifest));
    if(!pkg) continue;
    for(const group of ['dependencies','devDependencies','peerDependencies','optionalDependencies']){
      for(const [dep,version] of Object.entries(pkg[group]??{})){
        if(typeof version!=='string') continue;
        if(version.startsWith('workspace:')) continue;
        if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) errors.push(`${path.relative(root,manifest)}: ${group}.${dep} must use exact version, got ${version}`);
      }
    }
  }

  void moduleKinds;
  return errors;
}
