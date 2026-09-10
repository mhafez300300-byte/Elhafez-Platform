import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Products Files collaboration architecture',()=>{
 it('uses only @elhafez/files/contracts from the Products module',()=>{
  const root=path.resolve(process.cwd(),'modules/products');
  const files:string[]=[];
  const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(/\.(ts|tsx)$/.test(entry.name))files.push(full);}};
  walk(root);
  const source=files.map(file=>fs.readFileSync(file,'utf8')).join('\n');
  expect(source).toContain("@elhafez/files/contracts");
  expect(source).not.toMatch(/from\s+['"]@elhafez\/files['"]/);
  expect(source).not.toMatch(/files\.service|backend\/application\/files|backend\/infrastructure\/.*files/i);
 });
});
