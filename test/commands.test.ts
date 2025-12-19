import { describe, expect, test } from 'bun:test';
import { parseCommand } from '../src/ui/utils/commands';

describe('parseCommand', () => {
	test('parses slash command with no argument', () => {
		const result = parseCommand('/help');
		expect(result).toEqual({ cmd: 'help', arg: '' });
	});

	test('parses slash command with argument', () => {
		const result = parseCommand('/connect abc123');
		expect(result).toEqual({ cmd: 'connect', arg: 'abc123' });
	});

	test('handles multi-word arguments', () => {
		const result = parseCommand('/build create a todo app');
		expect(result).toEqual({ cmd: 'build', arg: 'create a todo app' });
	});

	test('returns follow command for non-slash input', () => {
		const result = parseCommand('just some text');
		expect(result).toEqual({ cmd: 'follow', arg: 'just some text' });
	});

	test('trims whitespace from input', () => {
		const result = parseCommand('  /help  ');
		expect(result).toEqual({ cmd: 'help', arg: '' });
	});

	test('handles CRLF newlines', () => {
		const result = parseCommand('/cmd\r\n');
		expect(result).toEqual({ cmd: 'cmd', arg: '' });
	});

	test('handles slash-only input', () => {
		const result = parseCommand('/');
		expect(result).toEqual({ cmd: '', arg: '' });
	});

	test('ignores leading whitespace before slash', () => {
		const result = parseCommand('   /quit');
		expect(result).toEqual({ cmd: 'quit', arg: '' });
	});

	test('trims argument whitespace', () => {
		const result = parseCommand('/cmd    arg1   arg2   ');
		expect(result).toEqual({ cmd: 'cmd', arg: 'arg1   arg2' });
	});
});
