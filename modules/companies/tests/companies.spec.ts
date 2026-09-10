import { describe, expect, it } from 'vitest';
import { Company } from '../backend/domain/company';
describe('companies domain',()=>{it('enforces core invariants',()=>{expect(new Company('ABC-001','Acme')).toBeTruthy();expect(()=>new Company('x','Acme')).toThrow();});});
