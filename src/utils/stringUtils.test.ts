import { describe, it, expect } from 'vitest';
import { cleanAIResponse, capitalize, parseMultiFileResponse } from './stringUtils';

describe('stringUtils', () => {
  describe('cleanAIResponse', () => {
    it('should remove markdown code blocks', () => {
      const input = '```typescript\nconst x = 1;\n```';
      const result = cleanAIResponse(input);
      expect(result).toBe('const x = 1;');
    });

    it('should remove code blocks with language identifiers', () => {
      const input = '```js\nconsole.log("hello");\n```';
      const result = cleanAIResponse(input);
      expect(result).toBe('console.log("hello");');
    });

    it('should trim whitespace', () => {
      const input = '  hello world  ';
      const result = cleanAIResponse(input);
      expect(result).toBe('hello world');
    });

    it('should handle plain text without code blocks', () => {
      const input = 'This is plain text';
      const result = cleanAIResponse(input);
      expect(result).toBe('This is plain text');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('should handle already capitalized strings', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });

    it('should handle empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('should handle single character', () => {
      expect(capitalize('a')).toBe('A');
    });

    it('should preserve rest of string', () => {
      expect(capitalize('hello WORLD')).toBe('Hello WORLD');
    });
  });

  describe('parseMultiFileResponse', () => {
    it('should parse single file with marker', () => {
      const input = '=== FILE: src/index.ts ===\nconsole.log("hello");';
      const result = parseMultiFileResponse(input, 'default.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/index.ts');
      expect(result[0].content).toBe('console.log("hello");');
    });

    it('should parse multiple files', () => {
      const input = `=== FILE: src/index.ts ===
console.log("hello");

=== FILE: src/utils.ts ===
export const add = (a, b) => a + b;`;
      const result = parseMultiFileResponse(input, 'default.ts');
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('src/index.ts');
      expect(result[0].content).toBe('console.log("hello");');
      expect(result[1].path).toBe('src/utils.ts');
      expect(result[1].content).toBe('export const add = (a, b) => a + b;');
    });

    it('should use fallback path when no markers found', () => {
      const input = 'Just some code without markers';
      const result = parseMultiFileResponse(input, 'fallback.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('fallback.ts');
      expect(result[0].content).toBe('Just some code without markers');
    });

    it('should handle markdown code blocks', () => {
      const input = '```typescript\n=== FILE: src/app.ts ===\nconst app = 1;\n```';
      const result = parseMultiFileResponse(input, 'default.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/app.ts');
      expect(result[0].content).toBe('const app = 1;');
    });

    it('should trim content', () => {
      const input = '=== FILE: test.ts ===\n  content with spaces  \n';
      const result = parseMultiFileResponse(input, 'default.ts');
      expect(result[0].content).toBe('content with spaces');
    });

    it('should handle empty content', () => {
      const input = '=== FILE: empty.ts ===\n\n\n=== FILE: content.ts ===\nreal content';
      const result = parseMultiFileResponse(input, 'default.ts');
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('content.ts');
      expect(result[0].content).toBe('real content');
    });
  });
});