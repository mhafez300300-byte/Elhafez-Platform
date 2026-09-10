import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const defaultRoot=path.resolve(scriptDir,'..');
function pascal(name){return name.split('-').filter(Boolean).map((p)=>p[0].toUpperCase()+p.slice(1)).join('');}
function camel(name){const p=pascal(name);return p[0].toLowerCase()+p.slice(1);}
async function copyTemplate(templateDir,dest,replacements){
  for(const entry of await fs.readdir(templateDir,{withFileTypes:true})){
    const source=path.join(templateDir,entry.name);
    const name=entry.name.endsWith('.tpl')?entry.name.slice(0,-4):entry.name;
    const target=path.join(dest,name);
    if(entry.isDirectory()){await fs.mkdir(target,{recursive:true});await copyTemplate(source,target,replacements);continue;}
    let content=await fs.readFile(source,'utf8');
    for(const [key,value]of Object.entries(replacements))content=content.replaceAll(key,value);
    await fs.writeFile(target,content,'utf8');
  }
}
export async function createModule(name,root=defaultRoot){
  if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name))throw new Error('Module name must be kebab-case');
  await fs.mkdir(path.join(root,'modules'),{recursive:true});
  const target=path.join(root,'modules',name);
  try{await fs.access(target);throw new Error(`Module already exists: ${name}`);}catch(error){if(error instanceof Error&&error.message.startsWith('Module already exists'))throw error;}
  await fs.mkdir(target,{recursive:false});
  const replacements={__MODULE_KEBAB__:name,__MODULE_PASCAL__:pascal(name),__MODULE_CAMEL__:camel(name),__MODULE_UPPER__:name.replaceAll('-','_').toUpperCase()};
  await copyTemplate(path.join(defaultRoot,'templates/module-template'),target,replacements);
  return target;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const name=args[0];if(!name){console.error('Usage: node scripts/create-module.mjs <module-name> [--root <path>]');process.exit(2);}const i=args.indexOf('--root');const root=i>=0&&args[i+1]?path.resolve(args[i+1]):defaultRoot;createModule(name,root).then((target)=>console.log(`Created ${target}`)).catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exit(1);});
}
