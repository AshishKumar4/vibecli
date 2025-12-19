import { useCallback } from 'react';
import type { Pane, KeyLike, FileSearchState, CommandPaletteState, InlineSuggestions, ComposerState } from '../types';
import {
	clamp,
	insertAt,
	deleteBackward,
	deleteForward,
	moveCursor,
	isPageUp,
	isPageDown,
	isHome,
	isEnd,
	defaultPageSize,
	isDeleteForward,
	isBackspace,
} from '../utils';

export type KeyboardContext = {
	pane: Pane;
	setPane: (pane: Pane) => void;
	rows: number;

	// Modal states
	fileSearch: FileSearchState;
	setFileSearch: (state: FileSearchState | ((prev: FileSearchState) => FileSearchState)) => void;
	palette: CommandPaletteState;
	setPalette: (state: CommandPaletteState | ((prev: CommandPaletteState) => CommandPaletteState)) => void;
	suggestions: InlineSuggestions;
	setSuggestions: (state: InlineSuggestions | ((prev: InlineSuggestions) => InlineSuggestions)) => void;

	// Input state
	composer: ComposerState;
	setComposer: (state: ComposerState | ((prev: ComposerState) => ComposerState)) => void;
	inputHistory: string[];
	setInputHistory: (state: string[] | ((prev: string[]) => string[])) => void;
	historyIndex: number | null;
	setHistoryIndex: (state: number | null | ((prev: number | null) => number | null)) => void;

	// Scroll state
	chatScroll: number;
	setChatScroll: (state: number | ((prev: number) => number)) => void;
	eventScroll: number;
	setEventScroll: (state: number | ((prev: number) => number)) => void;
	viewerScroll: number;
	setViewerScroll: (state: number | ((prev: number) => number)) => void;

	// Counts for scroll limits
	turnsCount: number;
	eventsCount: number;
	viewerLinesCount: number;
	outlineCount: number;
	fileEntriesCount: number;

	// Outline state
	outlineSelection: number;
	setOutlineSelection: (state: number | ((prev: number) => number)) => void;

	// File state
	fileSelection: number;
	setFileSelection: (state: number | ((prev: number) => number)) => void;

	// Viewer state
	viewerMode: 'stream' | 'file' | 'blueprint';

	// Actions
	exit: () => void;
	openFileSearch: () => void;
	openCommandPalette: () => void;
	acceptInlineSuggestion: () => void;
	runCommand: (line: string) => Promise<void>;
	openFile: (path: string) => void;
	toggleDir: (path: string) => void;
	setViewerBlueprint: () => void;
	setViewerStream: () => void;
	refreshInlineSuggestions: (text: string) => void;
	updateFileSearch: (query: string) => void;
	jumpToOutline: (lineNumber: number) => void;

	// Config
	historyLimit: number;
};

export type KeyHandler = (input: string, key: KeyLike) => void;

export function createKeyHandler(ctx: KeyboardContext): KeyHandler {
	const {
		pane,
		setPane,
		rows,
		fileSearch,
		setFileSearch,
		palette,
		setPalette,
		suggestions,
		setSuggestions,
		composer,
		setComposer,
		inputHistory,
		setInputHistory,
		setHistoryIndex,
		setChatScroll,
		setEventScroll,
		setViewerScroll,
		turnsCount,
		eventsCount,
		viewerLinesCount,
		outlineCount,
		fileEntriesCount,
		outlineSelection,
		setOutlineSelection,
		fileSelection,
		setFileSelection,
		viewerMode,
		exit,
		openFileSearch,
		openCommandPalette,
		acceptInlineSuggestion,
		runCommand,
		openFile,
		toggleDir,
		setViewerBlueprint,
		setViewerStream,
		refreshInlineSuggestions,
		updateFileSearch,
		jumpToOutline,
		historyLimit,
	} = ctx;

	return (input: string, key: KeyLike) => {
		// Mouse escape sequences can appear in raw input; ignore them.
		if (input.startsWith('\u001b[<')) return;

		const page = defaultPageSize(rows);

		// File search modal
		if (fileSearch.open) {
			if (key.escape) return void setFileSearch({ open: false });
			if (key.upArrow) return void setFileSearch((s) => (s.open ? { ...s, selected: clamp(s.selected - 1, 0, s.results.length - 1) } : s));
			if (key.downArrow) return void setFileSearch((s) => (s.open ? { ...s, selected: clamp(s.selected + 1, 0, s.results.length - 1) } : s));
			if (key.return) {
				const picked = fileSearch.results[fileSearch.selected];
				if (picked) openFile(picked);
				return void setFileSearch({ open: false });
			}
			if (isBackspace(input, key) || key.delete) return void updateFileSearch(fileSearch.query.slice(0, -1));
			if (input) return void updateFileSearch(fileSearch.query + input);
			return;
		}

		// Command palette modal
		if (palette.open) {
			if (key.escape) return void setPalette({ open: false });
			if (key.upArrow) return void setPalette((p) => (p.open ? { ...p, selected: clamp(p.selected - 1, 0, p.items.length - 1) } : p));
			if (key.downArrow) return void setPalette((p) => (p.open ? { ...p, selected: clamp(p.selected + 1, 0, p.items.length - 1) } : p));
			if (key.return) {
				const item = palette.items[palette.selected];
				if (item) {
					const value = `${item.value} `;
					setComposer({ text: value, cursor: value.length });
					refreshInlineSuggestions(value);
				}
				setPalette({ open: false });
				return void setPane('input');
			}
			return;
		}

		// Tab accepts inline suggestion when in input pane
		if (pane === 'input' && suggestions.open && key.tab) {
			acceptInlineSuggestion();
			return;
		}

		// Global shortcuts
		if (key.ctrl && input === 'c') return void exit();
		if (key.ctrl && input === 'p') return void openFileSearch();
		if (key.ctrl && input === 'k') return void openCommandPalette();
		if (key.escape) return void setPane('input');

		// Global focus cycling
		if (key.tab) {
			const order: Pane[] = ['input', 'chat', 'viewer', 'files', 'events'];
			return void setPane(order[(order.indexOf(pane) + 1) % order.length]!);
		}
		if (key.shift && key.tab) {
			const order: Pane[] = ['input', 'chat', 'viewer', 'files', 'events'];
			return void setPane(order[(order.indexOf(pane) - 1 + order.length) % order.length]!);
		}

		// Input pane handlers
		if (pane === 'input') {
			if (key.return && key.shift) {
				setComposer((s) => {
					const next = insertAt(s, '\n');
					refreshInlineSuggestions(next.text);
					return next;
				});
				return;
			}

			if (key.return) {
				const raw = composer.text;
				setComposer({ text: '', cursor: 0 });
				setSuggestions({ open: false, selected: 0, items: [] });
				setHistoryIndex(null);

				if (raw.trim().length > 0) {
					setInputHistory((prev) => {
						if (prev[prev.length - 1] === raw) return prev;
						return [...prev, raw].slice(-historyLimit);
					});
				}

				void runCommand(raw);
				return;
			}

			if (isBackspace(input, key)) {
				setHistoryIndex(null);
				setComposer((s) => {
					const next = deleteBackward(s);
					refreshInlineSuggestions(next.text);
					return next;
				});
				return;
			}

			if (isDeleteForward(input, key)) {
				setHistoryIndex(null);
				setComposer((s) => {
					const next = deleteForward(s);
					refreshInlineSuggestions(next.text);
					return next;
				});
				return;
			}

			if (key.leftArrow) return void setComposer((s) => moveCursor(s, -1));
			if (key.rightArrow) return void setComposer((s) => moveCursor(s, 1));
			if (key.ctrl && input === 'a') return void setComposer((s) => ({ ...s, cursor: 0 }));
			if (key.ctrl && input === 'e') return void setComposer((s) => ({ ...s, cursor: s.text.length }));

			// Suggestions navigation
			if (suggestions.open && key.upArrow) return void setSuggestions((s) => ({ ...s, selected: clamp(s.selected - 1, 0, s.items.length - 1) }));
			if (suggestions.open && key.downArrow) return void setSuggestions((s) => ({ ...s, selected: clamp(s.selected + 1, 0, s.items.length - 1) }));

			// Input history
			if (!suggestions.open && key.upArrow) {
				if (inputHistory.length === 0) return;
				setHistoryIndex((idx) => {
					const nextIdx = idx === null ? inputHistory.length - 1 : Math.max(0, idx - 1);
					const entry = inputHistory[nextIdx] ?? '';
					setComposer({ text: entry, cursor: entry.length });
					refreshInlineSuggestions(entry);
					return nextIdx;
				});
				return;
			}

			if (!suggestions.open && key.downArrow) {
				if (inputHistory.length === 0) return;
				setHistoryIndex((idx) => {
					if (idx === null) return null;
					const nextIdx = idx + 1;
					if (nextIdx >= inputHistory.length) {
						setComposer({ text: '', cursor: 0 });
						refreshInlineSuggestions('');
						return null;
					}
					const entry = inputHistory[nextIdx] ?? '';
					setComposer({ text: entry, cursor: entry.length });
					refreshInlineSuggestions(entry);
					return nextIdx;
				});
				return;
			}

			if (input && input.length > 0 && input !== '\t') {
				setHistoryIndex(null);
				setComposer((s) => {
					const next = insertAt(s, input);
					refreshInlineSuggestions(next.text);
					return next;
				});
				return;
			}

			return;
		}

		// Files/Outline pane handlers
		if (pane === 'files') {
			if (viewerMode === 'blueprint' || input === 'o') {
				const max = Math.max(0, outlineCount - 1);
				if (key.upArrow) return void setOutlineSelection((i) => clamp(i - 1, 0, max));
				if (key.downArrow) return void setOutlineSelection((i) => clamp(i + 1, 0, max));
				if (isPageUp(input, key)) return void setOutlineSelection((i) => clamp(i - page, 0, max));
				if (isPageDown(input, key)) return void setOutlineSelection((i) => clamp(i + page, 0, max));
				if (isHome(input, key) || input === 'g') return void setOutlineSelection(0);
				if (isEnd(input, key) || input === 'G') return void setOutlineSelection(max);
				if (input === 'o') {
					setViewerStream();
					return;
				}
				if (key.return) {
					jumpToOutline(outlineSelection);
					setPane('viewer');
					return;
				}
				return;
			}

			const max = Math.max(0, fileEntriesCount - 1);
			if (key.upArrow) return void setFileSelection((i) => clamp(i - 1, 0, max));
			if (key.downArrow) return void setFileSelection((i) => clamp(i + 1, 0, max));
			if (isPageUp(input, key)) return void setFileSelection((i) => clamp(i - page, 0, max));
			if (isPageDown(input, key)) return void setFileSelection((i) => clamp(i + page, 0, max));
			if (isHome(input, key) || input === 'g') return void setFileSelection(0);
			if (isEnd(input, key) || input === 'G') return void setFileSelection(max);
			if (key.return) {
				// Toggle or open handled by caller
				return;
			}
			return;
		}

		// Chat pane handlers
		if (pane === 'chat') {
			const maxScroll = Math.max(0, turnsCount - 1);
			if (key.upArrow) return void setChatScroll((s) => clamp(s + 1, 0, maxScroll));
			if (key.downArrow) return void setChatScroll((s) => clamp(s - 1, 0, maxScroll));
			if (isPageUp(input, key)) return void setChatScroll((s) => clamp(s + 3, 0, maxScroll));
			if (isPageDown(input, key)) return void setChatScroll((s) => clamp(s - 3, 0, maxScroll));
			if (isHome(input, key) || input === 'g') return void setChatScroll(maxScroll);
			if (isEnd(input, key) || input === 'G') return void setChatScroll(0);
			return;
		}

		// Events pane handlers
		if (pane === 'events') {
			const maxScroll = Math.max(0, eventsCount - 1);
			if (key.upArrow) return void setEventScroll((s) => clamp(s + 1, 0, maxScroll));
			if (key.downArrow) return void setEventScroll((s) => clamp(s - 1, 0, maxScroll));
			if (isPageUp(input, key)) return void setEventScroll((s) => clamp(s + page, 0, maxScroll));
			if (isPageDown(input, key)) return void setEventScroll((s) => clamp(s - page, 0, maxScroll));
			if (isHome(input, key) || input === 'g') return void setEventScroll(maxScroll);
			if (isEnd(input, key) || input === 'G') return void setEventScroll(0);
			return;
		}

		// Viewer pane handlers
		if (pane === 'viewer') {
			const maxScroll = Math.max(0, viewerLinesCount - 1);
			if (key.upArrow) return void setViewerScroll((s) => clamp(s + 1, 0, maxScroll));
			if (key.downArrow) return void setViewerScroll((s) => clamp(s - 1, 0, maxScroll));
			if (isPageUp(input, key)) return void setViewerScroll((s) => clamp(s + page, 0, maxScroll));
			if (isPageDown(input, key)) return void setViewerScroll((s) => clamp(s - page, 0, maxScroll));
			if (isHome(input, key) || input === 'g') return void setViewerScroll(maxScroll);
			if (isEnd(input, key) || input === 'G') return void setViewerScroll(0);
			if (input === '1' || input === 'b') return void setViewerBlueprint();
			if (input === '2' || input === 's') return void setViewerStream();
			if (input === '3' || input === 'f') {
				// Open file handled by caller
				return;
			}
			return;
		}
	};
}
