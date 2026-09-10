import { describe, expect, it } from 'vitest';
import { Role } from '../backend/domain/role';
describe('roles domain',()=>{it('enforces core invariants',()=>{expect(new Role('company.admin','Company Admin')).toBeTruthy();expect(()=>new Role('!','Admin')).toThrow();});});
