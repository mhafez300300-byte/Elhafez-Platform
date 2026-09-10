import path from 'node:path';import { defineConfig } from 'vite';import react from '@vitejs/plugin-react';
const root=path.resolve(__dirname,'../..');
export default defineConfig({root:__dirname,plugins:[react()],resolve:{alias:{
'@elhafez/auth/frontend':path.resolve(root,'modules/auth/frontend/index.ts'),
'@elhafez/users/frontend':path.resolve(root,'modules/users/frontend/index.ts'),
'@elhafez/roles/frontend':path.resolve(root,'modules/roles/frontend/index.ts'),
'@elhafez/permissions/frontend':path.resolve(root,'modules/permissions/frontend/index.ts'),
'@elhafez/companies/frontend':path.resolve(root,'modules/companies/frontend/index.ts'),
'@elhafez/branches/frontend':path.resolve(root,'modules/branches/frontend/index.ts'),
'@elhafez/audit/frontend':path.resolve(root,'modules/audit/frontend/index.ts'),
'@elhafez/files/frontend':path.resolve(root,'modules/files/frontend/index.ts'),
'@elhafez/notifications/frontend':path.resolve(root,'modules/notifications/frontend/index.ts'),
'@elhafez/ui':path.resolve(root,'packages/ui/src/index.tsx'),
}},build:{outDir:path.resolve(root,'dist/web'),emptyOutDir:true}});
