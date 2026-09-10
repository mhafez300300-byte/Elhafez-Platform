import { describe, expect, it } from 'vitest';
import { FileRecord } from '../backend/domain/file-record';
describe('files domain',()=>{it('enforces core invariants',()=>{expect(new FileRecord('a.txt','text/plain',1)).toBeTruthy();expect(()=>new FileRecord('','text/plain',1)).toThrow();});});
