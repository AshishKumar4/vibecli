import { describe, expect, test } from 'bun:test';
import { insertAt, deleteBackward, deleteForward, moveCursor } from '../src/ui/utils/composer';
import type { ComposerState } from '../src/ui/types';

describe('insertAt', () => {
	test('inserts text at cursor position', () => {
		const state: ComposerState = { text: 'helo', cursor: 3 };
		const result = insertAt(state, 'l');
		expect(result).toEqual({ text: 'hello', cursor: 4 });
	});

	test('inserts at beginning', () => {
		const state: ComposerState = { text: 'world', cursor: 0 };
		const result = insertAt(state, 'hello ');
		expect(result).toEqual({ text: 'hello world', cursor: 6 });
	});

	test('inserts at end', () => {
		const state: ComposerState = { text: 'hello', cursor: 5 };
		const result = insertAt(state, ' world');
		expect(result).toEqual({ text: 'hello world', cursor: 11 });
	});

	test('inserts multi-character string', () => {
		const state: ComposerState = { text: 'ac', cursor: 1 };
		const result = insertAt(state, 'bb');
		expect(result).toEqual({ text: 'abbc', cursor: 3 });
	});
});

describe('deleteBackward', () => {
	test('deletes character before cursor', () => {
		const state: ComposerState = { text: 'hello', cursor: 3 };
		const result = deleteBackward(state);
		expect(result).toEqual({ text: 'helo', cursor: 2 });
	});

	test('does nothing at beginning', () => {
		const state: ComposerState = { text: 'hello', cursor: 0 };
		const result = deleteBackward(state);
		expect(result).toBe(state);
	});

	test('deletes last character', () => {
		const state: ComposerState = { text: 'abc', cursor: 3 };
		const result = deleteBackward(state);
		expect(result).toEqual({ text: 'ab', cursor: 2 });
	});
});

describe('deleteForward', () => {
	test('deletes character at cursor', () => {
		const state: ComposerState = { text: 'hello', cursor: 1 };
		const result = deleteForward(state);
		expect(result).toEqual({ text: 'hllo', cursor: 1 });
	});

	test('does nothing at end', () => {
		const state: ComposerState = { text: 'hello', cursor: 5 };
		const result = deleteForward(state);
		expect(result).toBe(state);
	});

	test('deletes first character', () => {
		const state: ComposerState = { text: 'abc', cursor: 0 };
		const result = deleteForward(state);
		expect(result).toEqual({ text: 'bc', cursor: 0 });
	});
});

describe('moveCursor', () => {
	test('moves cursor forward', () => {
		const state: ComposerState = { text: 'hello', cursor: 2 };
		const result = moveCursor(state, 1);
		expect(result).toEqual({ text: 'hello', cursor: 3 });
	});

	test('moves cursor backward', () => {
		const state: ComposerState = { text: 'hello', cursor: 2 };
		const result = moveCursor(state, -1);
		expect(result).toEqual({ text: 'hello', cursor: 1 });
	});

	test('clamps to beginning', () => {
		const state: ComposerState = { text: 'hello', cursor: 1 };
		const result = moveCursor(state, -5);
		expect(result).toEqual({ text: 'hello', cursor: 0 });
	});

	test('clamps to end', () => {
		const state: ComposerState = { text: 'hello', cursor: 3 };
		const result = moveCursor(state, 10);
		expect(result).toEqual({ text: 'hello', cursor: 5 });
	});

	test('handles zero delta', () => {
		const state: ComposerState = { text: 'hello', cursor: 2 };
		const result = moveCursor(state, 0);
		expect(result).toEqual({ text: 'hello', cursor: 2 });
	});
});
