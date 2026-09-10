import { describe, expect, it } from 'vitest';
import { buildScopeKey } from '../backend/domain/permission-scope';
describe('permission scope',()=>{
  it('builds exact non-expanding scope keys',()=>{
    expect(buildScopeKey('GLOBAL')).toBe('GLOBAL');
    expect(buildScopeKey('COMPANY','00000000-0000-0000-0000-000000000001')).toContain('COMPANY:');
    expect(()=>buildScopeKey('COMPANY',null,'00000000-0000-0000-0000-000000000002')).toThrow();
    expect(()=>buildScopeKey('BRANCH','00000000-0000-0000-0000-000000000001',null)).toThrow();
  });
});
