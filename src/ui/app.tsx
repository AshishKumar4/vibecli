import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import chalk from 'chalk';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import type {
	Pane,
	ViewerMode,
	ChatTurn,
	OutlineEntry,
	FileSearchState,
	CommandPaletteState,
	InlineSuggestions,
	ComposerState,
	KeyLike,
} from './types';
import { theme, COMMANDS, KEYBOARD_SHORTCUTS, HISTORY_LIMIT } from './theme';
import {
	clamp,
	fuzzyScore,
	countNewlines,
	truncateToWidth,
	osc8Link,
	buildFileEntries,
	parseCommand,
	BlueprintStreamParser,
	parseMarkdownOutline,
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
} from './utils';
import { PaneBox } from './components/PaneBox';
import { ChatTurnBubble, groupChatTurns, estimateTurnHeight } from './components/ChatBubble';
import { renderComposer } from './components/Composer';
import { useSession, type ViewerEvents } from './hooks';


export function App(props: { enableInput: boolean }): React.ReactElement {
	const { exit } = useApp();
	const { stdout } = useStdout();
	const cols = stdout.columns ?? 120;
	const rows = stdout.rows ?? 40;

	const baseUrl = process.env.VIBESDK_BASE_URL ?? 'http://localhost:5173';
	const apiKey = process.env.VIBESDK_API_KEY;
	const MAX_BUFFER_SIZE = 500_000; // 500KB

	// Use the session hook for all session/state management
	const {
		session,
		status,
		isThinking,
		recentAgentIds,
		chatMessages,
		eventItems,
		workspacePaths,
		startBuild,
		connectToAgent,
		followUp,
		stop,
		resume,
		deployPreview,
		deployCloudflare,
		requestConversationState,
		setViewerEvents,
		pushChat,
		pushEvent,
		readFile,
	} = useSession({ baseUrl, apiKey });

	const [pane, setPane] = useState<Pane>('input');

	// Spinner animation
	const SPINNER = useMemo(() => ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], []);
	const [spinnerTick, setSpinnerTick] = useState(0);
	useEffect(() => {
		if (status.generation.status !== 'running') return;
		const t = setInterval(() => setSpinnerTick((x) => x + 1), 80);
		return () => clearInterval(t);
	}, [status.generation]);

	// Viewer state
	const [viewerMode, setViewerMode] = useState<ViewerMode>('stream');
	const [viewerTitle, setViewerTitle] = useState<string>('stream');
	const [viewerText, setViewerText] = useState<string>('');

	// Blueprint state
	const blueprintParserRef = useRef(new BlueprintStreamParser());
	const [outline, setOutline] = useState<OutlineEntry[]>([]);
	const [outlineSelection, setOutlineSelection] = useState(0);
	const viewerMaxLinesRef = useRef(20);

	// File browser state
	const expandedDirsRef = useRef<Set<string>>(new Set());
	const [fileSelection, setFileSelection] = useState<number>(0);

	// Scroll state
	const [chatScroll, setChatScroll] = useState<number>(0);
	const [eventScroll, setEventScroll] = useState<number>(0);
	const [viewerScroll, setViewerScroll] = useState<number>(0);

	// Modal state
	const [fileSearch, setFileSearch] = useState<FileSearchState>({ open: false });
	const [palette, setPalette] = useState<CommandPaletteState>({ open: false });
	const [suggestions, setSuggestions] = useState<InlineSuggestions>({ open: false, selected: 0, items: [] });

	// Input state
	const [composer, setComposer] = useState<ComposerState>({ text: '', cursor: 0 });
	const [inputHistory, setInputHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number | null>(null);

	// Chunk aggregation for events
	const chunkAggRef = useRef<{ path: string | null; chunks: number; bytes: number; timer: ReturnType<typeof setTimeout> | null }>({
		path: null,
		chunks: 0,
		bytes: 0,
		timer: null,
	});

	const blueprintAggRef = useRef<{ chunks: number; bytes: number; timer: ReturnType<typeof setTimeout> | null }>({
		chunks: 0,
		bytes: 0,
		timer: null,
	});

	// Cleanup timers on unmount
	useEffect(() => {
		return () => {
			if (chunkAggRef.current.timer) clearTimeout(chunkAggRef.current.timer);
			if (blueprintAggRef.current.timer) clearTimeout(blueprintAggRef.current.timer);
		};
	}, []);

	function appendViewer(chunk: string): void {
		const addedLines = countNewlines(chunk);
		setViewerScroll((s) => (s === 0 ? 0 : s + addedLines));
		setViewerText((prev) => (prev + chunk).slice(-200_000));
	}

	function flushChunkAgg(): void {
		const agg = chunkAggRef.current;
		if (!agg.path) return;
		pushEvent(`[chunks] ${agg.path} chunks=${agg.chunks} bytes=${agg.bytes}`);
		agg.path = null;
		agg.chunks = 0;
		agg.bytes = 0;
	}

	function scheduleChunkAggFlush(): void {
		const agg = chunkAggRef.current;
		if (agg.timer) return;
		agg.timer = setTimeout(() => {
			agg.timer = null;
			flushChunkAgg();
		}, 500);
	}

	function flushBlueprintAgg(): void {
		const agg = blueprintAggRef.current;
		if (agg.chunks === 0) return;
		pushEvent(`[blueprint] chunks=${agg.chunks} bytes=${agg.bytes}`);
		agg.chunks = 0;
		agg.bytes = 0;
	}

	function scheduleBlueprintAggFlush(): void {
		const agg = blueprintAggRef.current;
		if (agg.timer) return;
		agg.timer = setTimeout(() => {
			agg.timer = null;
			flushBlueprintAgg();
		}, 500);
	}

	function openFile(path: string): void {
		const content = readFile(path) ?? '';
		setViewerMode('file');
		setViewerTitle(`file: ${path}`);
		setViewerText(content);
		setViewerScroll(0);
	}

	const applyBlueprintChunk = useCallback((chunk: string): void => {
		const markdown = blueprintParserRef.current.append(chunk);
		setOutline(parseMarkdownOutline(markdown));
		setOutlineSelection(0);

		setViewerMode((mode) => {
			if (mode === 'blueprint') {
				setViewerTitle('blueprint');
				setViewerText(markdown);
				setViewerScroll(0);
			}
			return mode;
		});
	}, []);

	// Set up viewer events
	const viewerEventsRef = useRef<ViewerEvents>({});

	useEffect(() => {
		viewerEventsRef.current = {
			onBlueprintChunk: (chunk) => {
				blueprintAggRef.current.chunks += 1;
				blueprintAggRef.current.bytes += chunk.length;
				scheduleBlueprintAggFlush();
				applyBlueprintChunk(chunk);
			},
			onFileGenerating: (filePath) => {
				setViewerMode((mode) => {
					if (mode !== 'file') {
						setViewerTitle(`stream: ${filePath}`);
						setViewerText('');
						setViewerScroll(0);
						return 'stream';
					}
					return mode;
				});
			},
			onFileChunk: (filePath, chunk) => {
				const agg = chunkAggRef.current;
				agg.path = filePath;
				agg.chunks += 1;
				agg.bytes += chunk.length;
				scheduleChunkAggFlush();

				setViewerMode((mode) => {
					if (mode !== 'file') {
						appendViewer(chunk);
					}
					return mode;
				});
			},
		};
		setViewerEvents(viewerEventsRef.current);
	}, [setViewerEvents, applyBlueprintChunk]);

	function setViewerBlueprint(): void {
		setViewerMode('blueprint');
		setViewerTitle('blueprint');
		setViewerText(blueprintParserRef.current.toMarkdown());
		setViewerScroll(0);
	}

	function setViewerStream(): void {
		setViewerMode('stream');
		setViewerTitle(status.currentFile ? `stream: ${status.currentFile}` : 'stream');
		setViewerScroll(0);
	}

	function openFileSearch(): void {
		if (!session) return;
		setFileSearch({ open: true, query: '', selected: 0, results: workspacePaths.slice(0, 50) });
		setPane('input');
	}

	function updateFileSearch(query: string): void {
		const scored = workspacePaths
			.map((p) => {
				const score = fuzzyScore(query, p);
				return score === null ? null : { p, score };
			})
			.filter((v): v is { p: string; score: number } => v !== null)
			.sort((a, b) => b.score - a.score)
			.slice(0, 200)
			.map((x) => x.p);
		setFileSearch({ open: true, query, selected: 0, results: scored });
	}

	function openCommandPalette(): void {
		const connectItems = recentAgentIds.map((id) => ({ label: `/connect ${id}`, value: `/connect ${id}` }));
		const baseItems = COMMANDS.map((c) => ({ label: `${c.usage} — ${c.desc}`, value: c.insert }));
		setPalette({ open: true, selected: 0, items: [...connectItems, ...baseItems] });
	}

	function computeInlineSuggestions(text: string): Array<{ label: string; insert: string }> {
		if (text.includes('\n')) return [];
		const trimmedStart = text.trimStart();
		if (!trimmedStart.startsWith('/')) return [];

		const parts = trimmedStart.slice(1).split(' ');
		const cmdToken = parts[0] ?? '';
		const argToken = parts.slice(1).join(' ').trim();

		if (cmdToken === 'connect' && trimmedStart.includes(' ')) {
			return recentAgentIds
				.filter((id) => (argToken ? id.startsWith(argToken) : true))
				.slice(0, 10)
				.map((id) => ({ label: `/connect ${id}`, insert: `/connect ${id}` }));
		}

		return COMMANDS.filter((c) => (cmdToken ? c.cmd.startsWith(cmdToken) : true)).map((c) => ({
			label: `${c.usage} — ${c.desc}`,
			insert: c.insert,
		}));
	}

	function refreshInlineSuggestions(nextText: string): void {
		if (fileSearch.open || palette.open) return;
		const items = computeInlineSuggestions(nextText);
		setSuggestions((s) => ({
			open: items.length > 0,
			selected: clamp(s.selected, 0, Math.max(0, items.length - 1)),
			items,
		}));
	}

	function acceptInlineSuggestion(): void {
		if (!suggestions.open) return;
		const item = suggestions.items[suggestions.selected];
		if (!item) return;
		const value = `${item.insert} `;
		setComposer({ text: value, cursor: value.length });
		setSuggestions({ open: false, selected: 0, items: [] });
		setHistoryIndex(null);
	}

	async function handleStartBuild(prompt: string): Promise<void> {
		setViewerBlueprint();
		setViewerText('');
		blueprintAggRef.current.chunks = 0;
		blueprintAggRef.current.bytes = 0;
		blueprintParserRef.current.clear();
		setOutline([]);
		setOutlineSelection(0);

		await startBuild(prompt, viewerEventsRef.current);
	}

	async function runCommand(line: string): Promise<void> {
		const { cmd, arg } = parseCommand(line);
		switch (cmd) {
			case 'exit':
				exit();
				return;
			case 'help': {
				const commandsHelp = COMMANDS.map((c) => `  ${c.usage.padEnd(24)} ${c.desc}`).join('\n');
				const helpText = `COMMANDS\n${commandsHelp}\n${KEYBOARD_SHORTCUTS}`;
				pushChat('system', helpText);
				return;
			}
			case 'build':
				await handleStartBuild(arg);
				return;
			case 'connect':
				await connectToAgent(arg);
				return;
			case 'preview':
				deployPreview();
				return;
			case 'deploy':
				deployCloudflare();
				return;
			case 'state':
				requestConversationState();
				return;
			case 'stop':
				stop();
				return;
			case 'resume':
				resume();
				return;
			case 'follow': {
				// Main UX: if there is no session yet, treat the first message as a build prompt.
				if (!session) {
					await handleStartBuild(arg);
					return;
				}
				if (!arg) return;
				followUp(arg);
				return;
			}
			default:
				pushChat('system', `Unknown command: /${cmd}`);
		}
	}

	const fileEntries = useMemo(() => buildFileEntries(workspacePaths, expandedDirsRef.current), [workspacePaths]);

	// Ensure TS treats historyIndex as used (logic uses setHistoryIndex closures).
	void historyIndex;

	useEffect(() => {
		setFileSelection((idx) => clamp(idx, 0, Math.max(0, fileEntries.length - 1)));
	}, [fileEntries.length]);

	useInput(
		(input, keyRaw) => {
			const key = keyRaw as KeyLike;

			// Mouse escape sequences can appear in raw input; ignore them.
			if (input.startsWith('\u001b[<')) return;

			const page = defaultPageSize(rows);

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

			// Special case: if input pane has suggestions, Tab accepts suggestion.
			if (pane === 'input' && suggestions.open && key.tab) {
				acceptInlineSuggestion();
				return;
			}

			// Global shortcuts
			if (key.ctrl && input === 'c') return void exit();
			if (key.ctrl && input === 'p') return void openFileSearch();
			if (key.ctrl && input === 'k') return void openCommandPalette();
			if (key.escape) return void setPane('input');

			// Global focus cycling (Tab) when not accepting suggestions.
			if (key.tab) {
				const order: Pane[] = ['input', 'chat', 'viewer', 'files', 'events'];
				return void setPane(order[(order.indexOf(pane) + 1) % order.length]!);
			}
			if (key.shift && key.tab) {
				const order: Pane[] = ['input', 'chat', 'viewer', 'files', 'events'];
				return void setPane(order[(order.indexOf(pane) - 1 + order.length) % order.length]!);
			}

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
							return [...prev, raw].slice(-HISTORY_LIMIT);
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

				// Suggestions navigation.
				if (suggestions.open && key.upArrow) return void setSuggestions((s) => ({ ...s, selected: clamp(s.selected - 1, 0, s.items.length - 1) }));
				if (suggestions.open && key.downArrow) return void setSuggestions((s) => ({ ...s, selected: clamp(s.selected + 1, 0, s.items.length - 1) }));

				// Input history: only when not showing suggestions.
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

			if (pane === 'files') {
				// When blueprint mode is active, the Files pane becomes a Blueprint Outline pane.
				// Toggle with 'o' in the files pane.
				if (viewerMode === 'blueprint' || input === 'o') {
					const max = Math.max(0, outline.length - 1);
					if (key.upArrow) return void setOutlineSelection((i) => clamp(i - 1, 0, max));
					if (key.downArrow) return void setOutlineSelection((i) => clamp(i + 1, 0, max));
					if (isPageUp(input, key)) return void setOutlineSelection((i) => clamp(i - page, 0, max));
					if (isPageDown(input, key)) return void setOutlineSelection((i) => clamp(i + page, 0, max));
					if (isHome(input, key) || input === 'g') return void setOutlineSelection(0);
					if (isEnd(input, key) || input === 'G') return void setOutlineSelection(max);
					if (input === 'o') {
						// Toggle back to file list.
						setViewerMode('stream');
						setViewerTitle('stream');
						return;
					}
					if (key.return) {
						const selected = outline[outlineSelection];
						if (!selected) return;
						// Jump viewer scroll to show selected line.
						const lines = viewerText.split('\n');
						const targetLine = selected.line;
						const maxLines = viewerMaxLinesRef.current;
						const scroll = clamp(lines.length - targetLine - Math.floor(maxLines / 2), 0, Math.max(0, lines.length - 1));
						setViewerScroll(scroll);
						setPane('viewer');
						return;
					}
					return;
				}

				const max = Math.max(0, fileEntries.length - 1);
				if (key.upArrow) return void setFileSelection((i) => clamp(i - 1, 0, max));
				if (key.downArrow) return void setFileSelection((i) => clamp(i + 1, 0, max));
				if (isPageUp(input, key)) return void setFileSelection((i) => clamp(i - page, 0, max));
				if (isPageDown(input, key)) return void setFileSelection((i) => clamp(i + page, 0, max));
				if (isHome(input, key) || input === 'g') return void setFileSelection(0);
				if (isEnd(input, key) || input === 'G') return void setFileSelection(max);
				if (key.return) {
					const e = fileEntries[fileSelection];
					if (!e) return;
					if (e.kind === 'dir') {
						const set = expandedDirsRef.current;
						if (set.has(e.path)) set.delete(e.path);
						else set.add(e.path);
						return;
					}
					openFile(e.path);
					return;
				}
				return;
			}

			if (pane === 'chat') {
				const maxScroll = Math.max(0, turns.length - 1);
				if (key.upArrow) return void setChatScroll((s) => clamp(s + 1, 0, maxScroll));
				if (key.downArrow) return void setChatScroll((s) => clamp(s - 1, 0, maxScroll));
				if (isPageUp(input, key)) return void setChatScroll((s) => clamp(s + 3, 0, maxScroll));
				if (isPageDown(input, key)) return void setChatScroll((s) => clamp(s - 3, 0, maxScroll));
				if (isHome(input, key) || input === 'g') return void setChatScroll(maxScroll);
				if (isEnd(input, key) || input === 'G') return void setChatScroll(0);
				return;
			}

			if (pane === 'events') {
				const maxScroll = Math.max(0, eventItems.length - 1);
				if (key.upArrow) return void setEventScroll((s) => clamp(s + 1, 0, maxScroll));
				if (key.downArrow) return void setEventScroll((s) => clamp(s - 1, 0, maxScroll));
				if (isPageUp(input, key)) return void setEventScroll((s) => clamp(s + page, 0, maxScroll));
				if (isPageDown(input, key)) return void setEventScroll((s) => clamp(s - page, 0, maxScroll));
				if (isHome(input, key) || input === 'g') return void setEventScroll(maxScroll);
				if (isEnd(input, key) || input === 'G') return void setEventScroll(0);
				return;
			}

			if (pane === 'viewer') {
				const viewerLinesCount = viewerText.split('\n').length;
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
					const e = fileEntries[fileSelection];
					if (e?.kind === 'file') openFile(e.path);
					return;
				}
				return;
			}
		},
		{ isActive: props.enableInput },
	);

	// Rendering
	const spinnerChar = status.generation.status === 'running' ? SPINNER[spinnerTick % SPINNER.length] : '';
	const phaseLabel = status.phase?.status === 'idle' ? '—' : status.phase?.status ?? '—';
	const genStatus = status.generation.status;
	const agentLabel = session?.agentId ?? '—';
	const fileLabel = status.currentFile ?? '';

	const viewerHeight = Math.max(8, Math.floor(rows * 0.33));
	const sideHeight = viewerHeight;
	const chatMaxLines = Math.max(10, rows - viewerHeight - 8);
	const viewerMaxLines = Math.max(5, viewerHeight - 3);
	viewerMaxLinesRef.current = viewerMaxLines;
	const eventsMaxLines = Math.max(5, sideHeight - 3);

	const chatPaneWidth = Math.max(40, Math.floor(cols * 0.75) - 4);
	const turns = groupChatTurns(chatMessages) as ChatTurn[];

	// Scroll by turns (not lines). `chatScroll` now represents number of turns above the bottom.
	const maxTurnScroll = Math.max(0, turns.length - 1);
	const chatTurnScroll = clamp(chatScroll, 0, maxTurnScroll);

	const endExclusive = turns.length - chatTurnScroll;
	let start = endExclusive;
	let budget = chatMaxLines;
	while (start > 0 && budget > 0) {
		const next = turns[start - 1]!;
		const h = estimateTurnHeight(next, chatPaneWidth);
		if (budget - h < 0) break;
		budget -= h;
		start -= 1;
	}
	const visibleTurns = turns.slice(start, endExclusive);
	const visibleEvents = eventItems
		.slice(Math.max(0, eventItems.length - eventsMaxLines - eventScroll), eventItems.length - eventScroll)
		.map((e) => ({ ...e, text: truncateToWidth(e.text, Math.max(10, Math.floor(cols * 0.25) - 6)) }));

	const viewerLines = viewerText.split('\n');
	const viewerPaneWidth = Math.max(20, Math.floor(cols * 0.75) - 6);
	const visibleViewer = viewerLines
		.slice(Math.max(0, viewerLines.length - viewerMaxLines - viewerScroll), viewerLines.length - viewerScroll)
		.map((l) => truncateToWidth(l, viewerPaneWidth));

	const filesMaxLines = Math.max(8, rows - sideHeight - 8);
	const fileWindowStart = clamp(fileSelection - Math.floor(filesMaxLines / 2), 0, Math.max(0, fileEntries.length - filesMaxLines));
	const fileWindow = fileEntries.slice(fileWindowStart, fileWindowStart + filesMaxLines);

	const focusedTitle = (name: string, p: Pane): string => `${name}${pane === p ? ' *' : ''}`;

	return (
		<Box flexDirection="column" width={cols} height={rows}>
			<Box flexDirection="column">
				<Box>
					<Text>{chalk.hex(theme.accent).bold('vibesdk')}</Text>
					<Text dimColor>  {baseUrl}</Text>
				</Box>
				<Box>
					<Text dimColor>conn</Text>
					<Text>
						{status.connection === 'connected'
							? chalk.hex(theme.green)(' connected ')
							: status.connection === 'connecting'
								? chalk.hex(theme.orange)(` connecting${spinnerChar ? ` ${spinnerChar}` : ''} `)
								: chalk.hex(theme.muted)(' disconnected ')}
					</Text>
					<Text dimColor>agent</Text>
					<Text> {chalk.hex(theme.cyan)(agentLabel)} </Text>
					<Text dimColor>gen</Text>
					<Text>
						{genStatus === 'running'
							? chalk.hex(theme.orange)(`${genStatus}${spinnerChar ? ` ${spinnerChar}` : ''}`)
							: genStatus === 'complete'
								? chalk.hex(theme.green)(genStatus)
								: genStatus === 'stopped'
									? chalk.hex(theme.red)(genStatus)
									: chalk.hex(theme.muted)(genStatus)}
					</Text>
					<Text dimColor>phase</Text>
					<Text>{status.phase?.status !== 'idle' ? chalk.hex(theme.magenta)(phaseLabel) : chalk.hex(theme.muted)(phaseLabel)}</Text>
					<Text dimColor>files</Text>
					<Text> {chalk.hex(theme.fg)(String(workspacePaths.length))} </Text>
					{fileLabel ? (
						<>
							<Text dimColor>file</Text>
							<Text> {chalk.hex(theme.cyan)(fileLabel)}</Text>
						</>
					) : null}
				</Box>
				{status.previewUrl ? (
					<Text>
						{chalk.bgHex(theme.highlightBg).hex(theme.fg).bold(
							` PREVIEW ${osc8Link(status.previewUrl, status.previewUrl)} `,
						)}
					</Text>
				) : (
					<Text dimColor>
						viewer {viewerMode}
					</Text>
				)}
			</Box>

			<Box flexDirection="row" flexGrow={1}>
				<Box flexDirection="column" width="75%">
					<PaneBox title={focusedTitle('Chat', 'chat')} focused={pane === 'chat' || pane === 'input'} flexGrow={1}>
						{visibleTurns.map((t) => (
							<ChatTurnBubble key={t.key} turn={t} width={chatPaneWidth} />
						))}
						{isThinking && (
							<Box marginBottom={1}>
								<Text>{chalk.hex(theme.muted)(`Assistant is thinking${spinnerChar ? ` ${spinnerChar}` : '...'}`)}</Text>
							</Box>
						)}
						<Box marginTop={1} flexDirection="column">
							<Text dimColor={pane !== 'input'}>{renderComposer(composer.text, composer.cursor)}</Text>
							{suggestions.open ? (
								<Box flexDirection="column" marginTop={1}>
									<Text dimColor>hint: {suggestions.items[0]?.insert} (Tab to accept)</Text>
									{suggestions.items.slice(0, 6).map((it, i) => (
										<Text key={`${it.insert}_${i}`} inverse={i === suggestions.selected} dimColor={i !== suggestions.selected}>
											{it.label}
										</Text>
									))}
								</Box>
							) : null}
						</Box>
						<Text dimColor>Enter send · Shift+Enter newline · Tab accept suggestion · Ctrl+K palette · Ctrl+P files</Text>
					</PaneBox>

					<PaneBox title={`Viewer (${viewerTitle})`} focused={pane === 'viewer'} height={viewerHeight}>
						<Box>
							<Text>
								{viewerMode === 'blueprint'
									? chalk.bgHex(theme.highlightBg).hex(theme.fg).bold(' 1 Blueprint ')
									: chalk.hex(theme.muted)(' 1 Blueprint ')}
							</Text>
							<Text> </Text>
							<Text>
								{viewerMode === 'stream'
									? chalk.bgHex(theme.highlightBg).hex(theme.fg).bold(' 2 Stream ')
									: chalk.hex(theme.muted)(' 2 Stream ')}
							</Text>
							<Text> </Text>
							<Text>
								{viewerMode === 'file'
									? chalk.bgHex(theme.highlightBg).hex(theme.fg).bold(' 3 File ')
									: chalk.hex(theme.muted)(' 3 File ')}
							</Text>
							<Text dimColor>   (PgUp/PgDn scroll)</Text>
						</Box>
						{visibleViewer.length > 0 ? (
							visibleViewer.map((l, idx) => (
								<Text key={`${idx}_${l}`}>{l}</Text>
							))
						) : (
							<Text dimColor>Start a build to see content here</Text>
						)}
					</PaneBox>
				</Box>

				<Box flexDirection="column" width="25%">
					<PaneBox title={focusedTitle(viewerMode === 'blueprint' ? 'Outline' : 'Files', 'files')} focused={pane === 'files'} flexGrow={1}>
						{viewerMode === 'blueprint' ? (() => {
							if (outline.length === 0) {
								return <Text dimColor>No outline</Text>;
							}
							const ostart = clamp(
								outlineSelection - Math.floor(filesMaxLines / 2),
								0,
								Math.max(0, outline.length - filesMaxLines),
							);
							return outline.slice(ostart, ostart + filesMaxLines).map((o, idx) => {
								const globalIdx = ostart + idx;
								const isSelected = globalIdx === outlineSelection;
								const indent = '  '.repeat(Math.max(0, o.level - 1));
								return (
									<Text key={`${o.title}_${o.line}`} inverse={isSelected}>
										{indent}
										<Text>{chalk.hex(o.level > 2 ? theme.muted : theme.cyan)(`▸ ${o.title}`)}</Text>
									</Text>
								);
							});
						})() : fileWindow.length > 0 ? fileWindow.map((e, idx) => {
							const globalIdx = fileWindowStart + idx;
							const isSelected = globalIdx === fileSelection;
							const indent = '  '.repeat(e.depth);
							const isDir = e.kind === 'dir';
							const glyph = isDir ? (expandedDirsRef.current.has(e.path) ? '▾' : '▸') : ' ';
							return (
								<Text key={e.path} inverse={isSelected}>
									{indent}
									<Text>
										{isDir
											? chalk.hex(theme.cyan)(`${glyph} ${e.name}`)
											: chalk.hex(theme.fg)(`${glyph} ${e.name}`)}
									</Text>
								</Text>
							);
						}) : <Text dimColor>No files</Text>}
					</PaneBox>

					<PaneBox title={focusedTitle('Events', 'events')} focused={pane === 'events'} height={sideHeight}>
						{visibleEvents.map((e) => {
							const isWs = e.text.startsWith('[ws]');
							const isBuild = e.text.startsWith('[build]') || e.text.startsWith('[connect]');
							const isError = e.text.startsWith('[error]');
							const colored = isError
								? chalk.hex(theme.red)(e.text)
								: isBuild
									? chalk.hex(theme.accent)(e.text)
									: isWs
										? chalk.hex(theme.muted)(e.text)
										: chalk.hex(theme.magenta)(e.text);
							return (
								<Text key={e.id}>
									<Text>{colored}</Text>
								</Text>
							);
						})}
					</PaneBox>
				</Box>
			</Box>

			{fileSearch.open ? (
				<Box
					position="absolute"
					flexDirection="column"
					borderStyle="round"
					borderColor="blue"
					paddingX={1}
					paddingY={1}
					width="90%"
					height="80%"
				>
					<Text color="blue">File search (Ctrl+P, Esc to close)</Text>
					<Text color="gray">Query: {fileSearch.query}</Text>
					<Box flexDirection="column" marginTop={1}>
						{fileSearch.results.slice(0, 20).map((p, i) => (
							<Text key={p} inverse={i === fileSearch.selected}>
								{p}
							</Text>
						))}
					</Box>
				</Box>
			) : null}

			{palette.open ? (
				<Box
					position="absolute"
					flexDirection="column"
					borderStyle="round"
					borderColor="blue"
					paddingX={1}
					paddingY={1}
					width="90%"
					height="80%"
				>
					<Text color="blue">Command palette (Ctrl+K, Esc to close)</Text>
					<Box flexDirection="column" marginTop={1}>
						{palette.items.slice(0, 20).map((it, i) => (
							<Text key={it.value} inverse={i === palette.selected}>
								{it.label}
							</Text>
						))}
					</Box>
				</Box>
			) : null}

			<Box>
				<Text dimColor>Tab focus · PgUp/PgDn/Home/End scroll · Ctrl+P files · Ctrl+K commands · Esc input</Text>
			</Box>
		</Box>
	);
}
