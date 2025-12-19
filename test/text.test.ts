import { describe, expect, test } from 'bun:test';
import { wrapLines, countNewlines, clamp, nowId, fuzzyScore } from '../src/ui/utils/text';

describe('wrapLines', () => {
	test('wraps text at specified width', () => {
		const result = wrapLines('hello world', 6);
		expect(result).toEqual(['hello', 'world']);
	});

	test('preserves newlines in input', () => {
		const result = wrapLines('line1\nline2', 80);
		expect(result).toEqual(['line1', 'line2']);
	});

	test('handles CRLF newlines', () => {
		const result = wrapLines('line1\r\nline2', 80);
		expect(result).toEqual(['line1', 'line2']);
	});

	test('returns single line when text fits width', () => {
		const result = wrapLines('short', 80);
		expect(result).toEqual(['short']);
	});

	test('handles empty string', () => {
		const result = wrapLines('', 80);
		expect(result).toEqual([]);
	});

	test('trims trailing whitespace from lines', () => {
		const result = wrapLines('word   \ntest', 80);
		expect(result).toEqual(['word', 'test']);
	});

	test('handles multiple consecutive newlines', () => {
		const result = wrapLines('a\n\nb', 80);
		expect(result).toEqual(['a', '', 'b']);
	});
});

describe('countNewlines', () => {
	test('counts newlines in string', () => {
		expect(countNewlines('a\nb\nc')).toBe(2);
	});

	test('returns 0 for empty string', () => {
		expect(countNewlines('')).toBe(0);
	});

	test('returns 0 for string without newlines', () => {
		expect(countNewlines('hello world')).toBe(0);
	});

	test('counts trailing newline', () => {
		expect(countNewlines('text\n')).toBe(1);
	});
});

describe('clamp', () => {
	test('returns value when within range', () => {
		expect(clamp(5, 0, 10)).toBe(5);
	});

	test('clamps to minimum', () => {
		expect(clamp(-5, 0, 10)).toBe(0);
	});

	test('clamps to maximum', () => {
		expect(clamp(15, 0, 10)).toBe(10);
	});

	test('handles equal min and max', () => {
		expect(clamp(5, 5, 5)).toBe(5);
	});

	test('handles negative range', () => {
		expect(clamp(0, -10, -5)).toBe(-5);
	});
});

describe('nowId', () => {
	test('generates unique ids with prefix', () => {
		const id1 = nowId('test');
		const id2 = nowId('test');
		expect(id1).toMatch(/^test_\d+_[0-9a-f]+$/);
		expect(id2).toMatch(/^test_\d+_[0-9a-f]+$/);
		expect(id1).not.toBe(id2);
	});

	test('uses provided prefix', () => {
		const id = nowId('msg');
		expect(id.startsWith('msg_')).toBe(true);
	});
});

describe('fuzzyScore', () => {
	test('returns 0 for empty needle', () => {
		expect(fuzzyScore('', 'hello')).toBe(0);
	});

	test('returns high score for exact substring match', () => {
		const score = fuzzyScore('hel', 'hello');
		expect(score).not.toBeNull();
		expect(score!).toBeGreaterThan(0);
	});

	test('returns null when needle not found', () => {
		expect(fuzzyScore('xyz', 'hello')).toBeNull();
	});

	test('is case-insensitive', () => {
		const score1 = fuzzyScore('HELLO', 'hello');
		const score2 = fuzzyScore('hello', 'HELLO');
		expect(score1).not.toBeNull();
		expect(score2).not.toBeNull();
	});

	test('prefers matches at start of string', () => {
		const scoreStart = fuzzyScore('he', 'hello');
		const scoreEnd = fuzzyScore('lo', 'hello');
		expect(scoreStart).not.toBeNull();
		expect(scoreEnd).not.toBeNull();
		expect(scoreStart!).toBeGreaterThan(scoreEnd!);
	});

	test('supports fuzzy character matching', () => {
		const score = fuzzyScore('hw', 'helloworld');
		expect(score).not.toBeNull();
	});
});
