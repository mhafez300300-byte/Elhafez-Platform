import { describe, expect, it } from 'vitest';
import { AuthSession } from '../backend/domain/session';
describe('auth domain',()=>{it('enforces core invariants',()=>{expect(new AuthSession('s','u',new Date(Date.now()+1000),null)).toBeTruthy();expect(()=>new AuthSession('s','u',new Date(-1),null)).toThrow();});});
