import fs from 'node:fs';
import path from 'node:path';

const CORE_MODULES = new Set(['auth','users','roles','permissions','companies','branches','audit','files','notifications']);
const FORBIDDEN_BUSINESS = new Set(['customers','suppliers','products','inventory','purchases','sales','pos','accounting','reports']);
const REQUIRED_MODULE_DIRS = ['backend/domain','backend/application','backend/infrastructure','backend/api','frontend','contracts','tests'];
const OWNED_MODELS = {
  auth: new Set(['coreAuthCredential','coreAuthSession']),
  users: new Set(['coreUser']),
  roles: new Set(['coreRole']),
  permissions: new Set(['corePermission','coreRolePermission','coreUserRoleAssignment']),
  companies: new Set(['coreCompany']),
  branches: new Set(['coreBranch']),
  audit: new Set(['coreAuditRecord']),
  files: new Set(['coreFileRecord']),
  notifications: new Set(['coreNotification']),
};

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
  const re=/(?:import|export)\s+(?:[^'\"]*?\s+from\s+)?['\"]([^'\"]+)['\"]/g;
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

export function checkArchitecture(root){
  const errors=[];
  const modulesDir=path.join(root,'modules');
  const moduleNames=fs.existsSync(modulesDir)?fs.readdirSync(modulesDir).filter((x)=>fs.statSync(path.join(modulesDir,x)).isDirectory()):[];

  for(const name of moduleNames){
    if(FORBIDDEN_BUSINESS.has(name)) errors.push(`Forbidden business module present: modules/${name}`);
    if(!CORE_MODULES.has(name)) errors.push(`Unexpected module in Core baseline: modules/${name}`);
    for(const dir of REQUIRED_MODULE_DIRS){
      if(!fs.existsSync(path.join(modulesDir,name,dir))) errors.push(`Module ${name} missing required directory ${dir}`);
    }
    for(const f of ['package.json','index.ts']){
      if(!fs.existsSync(path.join(modulesDir,name,f))) errors.push(`Module ${name} missing ${f}`);
    }
  }
  for(const name of CORE_MODULES){
    if(!moduleNames.includes(name)) errors.push(`Required Core module missing: modules/${name}`);
  }

  const graph=new Map(moduleNames.map((m)=>[m,new Set()]));
  const files=walk(root).filter(isSource);
  for(const file of files){
    const source=fs.readFileSync(file,'utf8');
    const rel=path.relative(root,file).replaceAll(path.sep,'/');
    const owner=moduleNameFromFile(root,file);
    const specs=importsOf(source);

    for(const spec of specs){
      const alias=moduleFromAlias(spec);
      if(owner&&alias&&CORE_MODULES.has(alias.name)&&alias.name!==owner){
        if(alias.sub!=='contracts') errors.push(`${rel}: cross-module import must use contracts only: ${spec}`);
        graph.get(owner)?.add(alias.name);
      }
      if(rel.startsWith('packages/')&&alias&&CORE_MODULES.has(alias.name)) errors.push(`${rel}: platform package cannot import module ${spec}`);
      if(rel.startsWith('apps/web/')&&alias&&CORE_MODULES.has(alias.name)&&alias.sub!=='frontend'&&alias.sub!=='contracts') errors.push(`${rel}: web app cannot import backend module surface ${spec}`);
      if(owner&&rel.startsWith(`modules/${owner}/frontend/`)&&(spec.includes('/backend/')||spec===`@elhafez/${owner}`)) errors.push(`${rel}: frontend cannot import backend: ${spec}`);
      if(owner&&rel.startsWith(`modules/${owner}/backend/domain/`)&&(spec.includes('/application/')||spec.includes('/infrastructure/')||spec.includes('/api/'))) errors.push(`${rel}: domain cannot depend on upper layer: ${spec}`);
      if(owner&&rel.startsWith(`modules/${owner}/backend/application/`)){
        if(spec.includes('/infrastructure/')||spec.includes('/api/')||spec==='@elhafez/database'||spec==='@prisma/client') errors.push(`${rel}: application cannot depend on infrastructure/database: ${spec}`);
      }
      if(owner&&rel.startsWith(`modules/${owner}/backend/api/`)&&spec.includes('/infrastructure/')) errors.push(`${rel}: API cannot depend on infrastructure: ${spec}`);
      if(owner&&spec.startsWith('.')&&spec.includes('modules/')) errors.push(`${rel}: relative escape across modules is forbidden: ${spec}`);
    }

    if(owner&&rel.includes('/backend/infrastructure/')){
      const refs=[...source.matchAll(/\.((?:core)[A-Z][A-Za-z0-9]*)\b/g)].map((m)=>m[1]);
      for(const model of refs){
        if(!OWNED_MODELS[owner]?.has(model)) errors.push(`${rel}: module ${owner} accesses Prisma model owned by another module: ${model}`);
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
    let pkg;
    try{pkg=JSON.parse(fs.readFileSync(manifest,'utf8'));}
    catch{errors.push(`${path.relative(root,manifest)}: invalid JSON`);continue;}
    for(const group of ['dependencies','devDependencies','peerDependencies','optionalDependencies']){
      for(const [dep,version] of Object.entries(pkg[group]??{})){
        if(typeof version!=='string') continue;
        if(version.startsWith('workspace:')) continue;
        if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) errors.push(`${path.relative(root,manifest)}: ${group}.${dep} must use exact version, got ${version}`);
      }
    }
  }
  return errors;
}
