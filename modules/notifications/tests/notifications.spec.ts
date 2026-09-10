import { describe, expect, it } from 'vitest';
import { Notification } from '../backend/domain/notification';
describe('notifications domain',()=>{it('enforces core invariants',()=>{expect(new Notification('00000000-0000-0000-0000-000000000001','Hello','Body')).toBeTruthy();expect(()=>new Notification('','','')).toThrow();});});
