import { describe, expect, it } from 'vitest';
import { User } from '../backend/domain/user';
describe('users domain',()=>{it('enforces core invariants',()=>{expect(new User('00000000-0000-0000-0000-000000000001','a@example.com','A','ACTIVE',false,0)).toBeTruthy();expect(()=>new User('1','bad','A','ACTIVE',false,0)).toThrow();});});
