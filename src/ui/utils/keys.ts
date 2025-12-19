import type { KeyLike } from '../types';

export function isPageUp(input: string, key: KeyLike): boolean {
	return Boolean(key.pageUp) || input === '\u001b[5~';
}

export function isPageDown(input: string, key: KeyLike): boolean {
	return Boolean(key.pageDown) || input === '\u001b[6~';
}

export function isHome(input: string, key: KeyLike): boolean {
	return Boolean(key.home) || input === '\u001b[H' || input === '\u001b[1~';
}

export function isEnd(input: string, key: KeyLike): boolean {
	return Boolean(key.end) || input === '\u001b[F' || input === '\u001b[4~';
}

export function defaultPageSize(rows: number): number {
	return Math.max(5, Math.floor(rows / 2));
}

export function isDeleteForward(input: string, key: KeyLike): boolean {
	// Delete key is typically ESC [ 3 ~
	return Boolean(key.delete) && input === '\u001b[3~';
}

export function isBackspace(input: string, key: KeyLike): boolean {
	// Backspace varies across terminals:
	// - key.backspace
	// - input is DEL (0x7f)
	// - input is BS (0x08)
	// - Ctrl+H
	// - sometimes surfaces as key.delete with empty input
	const ctrlH = Boolean(key.ctrl) && input.toLowerCase() === 'h';
	const deleteAsBackspace = Boolean(key.delete) && (input === '' || input === undefined);
	return Boolean(key.backspace) || input === '\u007f' || input === '\b' || ctrlH || deleteAsBackspace;
}
