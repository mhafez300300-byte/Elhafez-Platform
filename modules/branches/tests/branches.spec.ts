import { describe, expect, it } from 'vitest';
import { Branch } from '../backend/domain/branch';
describe('branches domain',()=>{it('enforces core invariants',()=>{expect(new Branch('BR-1','Main')).toBeTruthy();expect(()=>new Branch('!','Main')).toThrow();});});
