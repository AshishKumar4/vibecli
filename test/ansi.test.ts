import { describe, expect, test } from 'bun:test';
import { osc8Link, stripAnsi, visibleLength, truncateToWidth } from '../src/ui/utils/ansi';

describe('osc8Link', () => {
	test('creates terminal hyperlink', () => {
		const result = osc8Link('https://example.com', 'click here');
		expect(result).toBe('\u001b]8;;https://example.com\u0007click here\u001b]8;;\u0007');
	});

	test('handles empty text', () => {
		const result = osc8Link('https://example.com', '');
		expect(result).toBe('\u001b]8;;https://example.com\u0007\u001b]8;;\u0007');
	});
});

describe('stripAnsi', () => {
	test('removes SGR color codes', () => {
		const input = '\u001b[31mred\u001b[0m';
		expect(stripAnsi(input)).toBe('red');
	});

	test('removes OSC8 hyperlinks', () => {
		const input = '\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007';
		expect(stripAnsi(input)).toBe('link');
	});

	test('preserves plain text', () => {
		expect(stripAnsi('hello world')).toBe('hello world');
	});

	test('handles multiple escape sequences', () => {
		const input = '\u001b[1m\u001b[32mbold green\u001b[0m';
		expect(stripAnsi(input)).toBe('bold green');
	});
});

describe('visibleLength', () => {
	test('counts visible characters only', () => {
		const input = '\u001b[31mred\u001b[0m';
		expect(visibleLength(input)).toBe(3);
	});

	test('handles plain text', () => {
		expect(visibleLength('hello')).toBe(5);
	});

	test('handles empty string', () => {
		expect(visibleLength('')).toBe(0);
	});
});

describe('truncateToWidth', () => {
	test('returns input when within width', () => {
		expect(truncateToWidth('hello', 10)).toBe('hello');
	});

	test('truncates with ellipsis when exceeds width', () => {
		const result = truncateToWidth('hello world', 6);
		expect(result).toBe('hello…');
	});

	test('handles very small width', () => {
		const result = truncateToWidth('hello', 2);
		expect(result).toBe('h…');
	});

	test('handles empty string', () => {
		expect(truncateToWidth('', 10)).toBe('');
	});

	test('strips ANSI before measuring', () => {
		const input = '\u001b[31mred\u001b[0m';
		expect(truncateToWidth(input, 10)).toBe(input);
	});
});
