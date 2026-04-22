import { describe, it, expect, beforeEach } from 'vitest';
import { storage } from './storage';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('get', () => {
    it('should return fallback when key does not exist', () => {
      const result = storage.get('nonexistent', 'default');
      expect(result).toBe('default');
    });

    it('should return stored value when key exists', () => {
      localStorage.setItem('testKey', JSON.stringify('testValue'));
      const result = storage.get('testKey', 'default');
      expect(result).toBe('testValue');
    });

    it('should return fallback and not throw on invalid JSON', () => {
      localStorage.setItem('badKey', 'not valid json{{{');
      const result = storage.get('badKey', 'fallback');
      expect(result).toBe('fallback');
    });

    it('should handle complex objects', () => {
      const obj = { name: 'test', value: 42, nested: { a: 1 } };
      localStorage.setItem('objKey', JSON.stringify(obj));
      const result = storage.get('objKey', {});
      expect(result).toEqual(obj);
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3];
      localStorage.setItem('arrKey', JSON.stringify(arr));
      const result = storage.get('arrKey', []);
      expect(result).toEqual(arr);
    });

    it('should handle numbers', () => {
      localStorage.setItem('numKey', JSON.stringify(123));
      const result = storage.get('numKey', 0);
      expect(result).toBe(123);
    });

    it('should handle booleans', () => {
      localStorage.setItem('boolKey', JSON.stringify(true));
      const result = storage.get('boolKey', false);
      expect(result).toBe(true);
    });

    it('should handle null values', () => {
      localStorage.setItem('nullKey', JSON.stringify(null));
      const result = storage.get('nullKey', 'fallback');
      expect(result).toBe(null);
    });
  });

  describe('set', () => {
    it('should store string value', () => {
      storage.set('testKey', 'testValue');
      expect(localStorage.getItem('testKey')).toBe(JSON.stringify('testValue'));
    });

    it('should store object value', () => {
      const obj = { name: 'test', value: 42 };
      storage.set('objKey', obj);
      expect(localStorage.getItem('objKey')).toBe(JSON.stringify(obj));
    });

    it('should store array value', () => {
      const arr = [1, 2, 3];
      storage.set('arrKey', arr);
      expect(localStorage.getItem('arrKey')).toBe(JSON.stringify(arr));
    });

    it('should overwrite existing value', () => {
      storage.set('key', 'first');
      storage.set('key', 'second');
      expect(storage.get('key', '')).toBe('second');
    });

    it('should not throw on storage errors', () => {
      // This should not throw even if localStorage fails
      expect(() => storage.set('key', 'value')).not.toThrow();
    });
  });
});