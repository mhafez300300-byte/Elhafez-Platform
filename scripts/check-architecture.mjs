import path from 'node:path';
import { checkArchitecture } from './architecture-rules.mjs';
const root=path.resolve(process.argv[2]??process.cwd());
const errors=checkArchitecture(root);
if(errors.length){
  console.error(`ARCHITECTURE FAIL (${errors.length})`);
  for(const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log(`ARCHITECTURE PASS: ${root}`);
