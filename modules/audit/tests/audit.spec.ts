import { describe, expect, it } from 'vitest';
import { AuditRecord } from '../backend/domain/audit-record';
describe('audit domain',()=>{it('enforces core invariants',()=>{expect(new AuditRecord('user','user.created')).toBeTruthy();expect(()=>new AuditRecord('','')).toThrow();});});
