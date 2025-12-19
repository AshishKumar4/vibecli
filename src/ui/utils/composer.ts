import type { ComposerState } from '../types';
import { clamp } from './text';

export function insertAt(state: ComposerState, value: string): ComposerState {
	const before = state.text.slice(0, state.cursor);
	const after = state.text.slice(state.cursor);
	return { text: before + value + after, cursor: state.cursor + value.length };
}

export function deleteBackward(state: ComposerState): ComposerState {
	if (state.cursor <= 0) return state;
	const before = state.text.slice(0, state.cursor - 1);
	const after = state.text.slice(state.cursor);
	return { text: before + after, cursor: state.cursor - 1 };
}

export function deleteForward(state: ComposerState): ComposerState {
	if (state.cursor >= state.text.length) return state;
	const before = state.text.slice(0, state.cursor);
	const after = state.text.slice(state.cursor + 1);
	return { text: before + after, cursor: state.cursor };
}

export function moveCursor(state: ComposerState, delta: number): ComposerState {
	return { ...state, cursor: clamp(state.cursor + delta, 0, state.text.length) };
}
