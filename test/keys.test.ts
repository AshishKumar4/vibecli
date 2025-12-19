import { describe, expect, test } from 'bun:test';
import {
	isPageUp,
	isPageDown,
	isHome,
	isEnd,
	defaultPageSize,
	isDeleteForward,
	isBackspace,
} from '../src/ui/utils/keys';
import type { KeyLike } from '../src/ui/types';

const emptyKey: KeyLike = {};

describe('isPageUp', () => {
	test('returns true for key.pageUp', () => {
		expect(isPageUp('', { pageUp: true })).toBe(true);
	});

	test('returns true for escape sequence', () => {
		expect(isPageUp('\u001b[5~', emptyKey)).toBe(true);
	});

	test('returns false for other input', () => {
		expect(isPageUp('x', emptyKey)).toBe(false);
	});
});

describe('isPageDown', () => {
	test('returns true for key.pageDown', () => {
		expect(isPageDown('', { pageDown: true })).toBe(true);
	});

	test('returns true for escape sequence', () => {
		expect(isPageDown('\u001b[6~', emptyKey)).toBe(true);
	});

	test('returns false for other input', () => {
		expect(isPageDown('x', emptyKey)).toBe(false);
	});
});

describe('isHome', () => {
	test('returns true for key.home', () => {
		expect(isHome('', { home: true })).toBe(true);
	});

	test('returns true for ESC[H sequence', () => {
		expect(isHome('\u001b[H', emptyKey)).toBe(true);
	});

	test('returns true for ESC[1~ sequence', () => {
		expect(isHome('\u001b[1~', emptyKey)).toBe(true);
	});

	test('returns false for other input', () => {
		expect(isHome('x', emptyKey)).toBe(false);
	});
});

describe('isEnd', () => {
	test('returns true for key.end', () => {
		expect(isEnd('', { end: true })).toBe(true);
	});

	test('returns true for ESC[F sequence', () => {
		expect(isEnd('\u001b[F', emptyKey)).toBe(true);
	});

	test('returns true for ESC[4~ sequence', () => {
		expect(isEnd('\u001b[4~', emptyKey)).toBe(true);
	});

	test('returns false for other input', () => {
		expect(isEnd('x', emptyKey)).toBe(false);
	});
});

describe('defaultPageSize', () => {
	test('returns half of rows', () => {
		expect(defaultPageSize(40)).toBe(20);
	});

	test('returns minimum of 5', () => {
		expect(defaultPageSize(8)).toBe(5);
	});

	test('handles very small values', () => {
		expect(defaultPageSize(2)).toBe(5);
	});
});

describe('isDeleteForward', () => {
	test('returns true for delete key with escape sequence', () => {
		expect(isDeleteForward('\u001b[3~', { delete: true })).toBe(true);
	});

	test('returns false for delete key without escape sequence', () => {
		expect(isDeleteForward('', { delete: true })).toBe(false);
	});

	test('returns false for other input', () => {
		expect(isDeleteForward('x', emptyKey)).toBe(false);
	});
});

describe('isBackspace', () => {
	test('returns true for key.backspace', () => {
		expect(isBackspace('', { backspace: true })).toBe(true);
	});

	test('returns true for DEL character (0x7f)', () => {
		expect(isBackspace('\u007f', emptyKey)).toBe(true);
	});

	test('returns true for BS character (0x08)', () => {
		expect(isBackspace('\b', emptyKey)).toBe(true);
	});

	test('returns true for Ctrl+H', () => {
		expect(isBackspace('h', { ctrl: true })).toBe(true);
		expect(isBackspace('H', { ctrl: true })).toBe(true);
	});

	test('returns true for delete as backspace (empty input)', () => {
		expect(isBackspace('', { delete: true })).toBe(true);
	});

	test('returns false for other input', () => {
		expect(isBackspace('x', emptyKey)).toBe(false);
	});
});
