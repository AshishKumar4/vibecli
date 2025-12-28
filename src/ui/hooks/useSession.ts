import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	PhasicClient,
	withTimeout,
	TimeoutError,
	type BuildSession,
	type SessionState,
	type ConnectionState,
	type PhaseInfo,
} from '@cf-vibesdk/sdk';
import type { ChatMessage, ChatRole, EventItem, TerminalLine } from '../types';
import { nowId } from '../utils';
import { getRecentAgentIds, addRecentAgentId as persistAgentId } from '../config';
import { MAX_TERMINAL_BUFFER, NO_SESSION_MSG } from '../constants';

export type UseSessionOptions = {
	baseUrl: string;
	apiKey?: string;
	operationTimeoutMs?: number;
	maxChatMessages?: number;
};

export type CLIStatus = {
	connection: ConnectionState;
	generation: SessionState['generation'];
	phase: SessionState['phase'];
	cloudflare: SessionState['cloudflare'];
	phases: PhaseInfo[];
	currentFile?: string;
	previewUrl?: string;
	startTime?: number;
	// App info for display
	appTitle?: string;
	originalPrompt?: string;
};

type ChatPusher = (role: ChatRole, text: string) => void;
type EventPusher = (text: string) => void;

export type ViewerEvents = {
	onBlueprintChunk?: (chunk: string) => void;
	onFileGenerating?: (filePath: string) => void;
	onFileChunk?: (filePath: string, chunk: string) => void;
	onBuildStart?: () => void;
};

export type UseSessionResult = {
	client: PhasicClient;
	session: BuildSession | null;
	status: CLIStatus;
	isThinking: boolean;
	recentAgentIds: string[];
	chatMessages: ChatMessage[];
	eventItems: EventItem[];
	workspacePaths: string[];
	terminalOutput: TerminalLine[];

	// Actions
	startBuild: (prompt: string, viewerEvents?: ViewerEvents) => Promise<void>;
	connectToAgent: (agentId: string) => Promise<void>;
	followUp: (message: string) => void;
	stop: () => void;
	resume: () => void;
	deployPreview: () => void;
	deployCloudflare: () => void;
	requestConversationState: () => void;
	closeSession: () => void;

	// Viewer event subscriptions
	setViewerEvents: (events: ViewerEvents) => void;

	// Helpers
	pushChat: ChatPusher;
	pushEvent: EventPusher;
	readFile: (path: string) => string | undefined;
};

const INITIAL_STATUS: CLIStatus = {
	connection: 'disconnected',
	generation: { status: 'idle' },
	phase: { status: 'idle' },
	cloudflare: { status: 'idle' },
	phases: [],
};

export function useSession(options: UseSessionOptions): UseSessionResult {
	const { baseUrl, apiKey, operationTimeoutMs = 30_000, maxChatMessages = 500 } = options;

	const client = useMemo(() => {
		return new PhasicClient({
			baseUrl,
			apiKey: apiKey ?? '',
		});
	}, [baseUrl, apiKey]);

	const [session, setSession] = useState<BuildSession | null>(null);
	const [recentAgentIds, setRecentAgentIds] = useState<string[]>(() => getRecentAgentIds());
	const [status, setStatus] = useState<CLIStatus>(INITIAL_STATUS);
	const [isThinking, setIsThinking] = useState(false);

	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
		{ id: nowId('sys'), role: 'system', text: 'Ready. Type a message to build, or use /help for commands.' },
	]);
	const [eventItems, setEventItems] = useState<EventItem[]>([
		{ id: nowId('evt'), text: '[ui] ready' },
	]);
	const [workspacePaths, setWorkspacePaths] = useState<string[]>([]);
	const [terminalOutput, setTerminalOutput] = useState<TerminalLine[]>([]);

	const cleanupRef = useRef<(() => void)[]>([]);
	const viewerEventsRef = useRef<ViewerEvents>({});

	const setViewerEvents = useCallback((events: ViewerEvents) => {
		viewerEventsRef.current = events;
	}, []);

	const pushChat = useCallback<ChatPusher>((role, text) => {
		setChatMessages((prev) => {
			const next = [...prev, { id: nowId('msg'), role, text }];
			return next.length > maxChatMessages ? next.slice(-maxChatMessages) : next;
		});
	}, [maxChatMessages]);

	const pushEvent = useCallback<EventPusher>((text) => {
		setEventItems((prev) => {
			const next = [...prev, { id: nowId('evt'), text }];
			return next.length > maxChatMessages ? next.slice(-maxChatMessages) : next;
		});
	}, [maxChatMessages]);

	const clearChat = useCallback(() => {
		setChatMessages([]);
		setEventItems([]);
	}, []);

	const addRecentAgent = useCallback((agentId: string) => {
		const updated = persistAgentId(agentId);
		setRecentAgentIds(updated);
	}, []);

	useEffect(() => {
		if (!session) return;

		const offStateChange = session.state.onChange((next: SessionState, prev: SessionState) => {
			if (next.connection !== prev.connection) {
				pushEvent(`[state] connection: ${prev.connection} → ${next.connection}`);
			}
			if (next.generation.status !== prev.generation.status) {
				const filesInfo = 'filesGenerated' in next.generation
					? ` (${next.generation.filesGenerated} files)`
					: '';
				pushEvent(`[state] generation: ${prev.generation.status} → ${next.generation.status}${filesInfo}`);
			}
			if (next.phase.status !== prev.phase.status) {
				const phaseName = 'name' in next.phase ? ` "${next.phase.name}"` : '';
				pushEvent(`[state] phase: ${prev.phase.status} → ${next.phase.status}${phaseName}`);
				if (next.phase.status === 'implementing' && prev.phase.status !== 'implementing') {
					pushChat('system', 'Code generation started...');
				}
			}

			setStatus((s) => ({
				...s,
				connection: next.connection,
				generation: next.generation,
				phase: next.phase,
				cloudflare: next.cloudflare,
				currentFile: next.currentFile,
				previewUrl: next.previewUrl,
			}));

			if (next.lastConversationResponse && next.lastConversationResponse !== prev.lastConversationResponse) {
				setIsThinking(false);
				const response = next.lastConversationResponse;
				if (response.tool) {
					pushChat('tool', `${response.tool.name} ${response.tool.status}`);
				} else if (response.message) {
					pushChat('assistant', response.message);
				}
			}

			if (next.conversationState && next.conversationState !== prev.conversationState) {
				hydrateConversationHistory(next.conversationState);
			}

			if (next.currentFile && next.currentFile !== prev.currentFile) {
				pushChat('system', `[file] generating ${next.currentFile}`);
			}

			if (next.generation.status === 'complete' && prev.generation.status !== 'complete') {
				const filesGenerated = 'filesGenerated' in next.generation ? next.generation.filesGenerated : 0;
				const preview = 'previewURL' in next.generation ? next.generation.previewURL : undefined;
				setStatus((s) => {
					const elapsed = s.startTime ? Math.round((Date.now() - s.startTime) / 1000) : 0;
					const mins = Math.floor(elapsed / 60);
					const secs = elapsed % 60;
					const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
					const previewStr = preview ? `\nPreview: ${preview}` : '';
					pushChat('system', `Generation complete: ${filesGenerated} files in ${timeStr}${previewStr}`);
					return s;
				});
			}

			if (next.connection === 'disconnected' && prev.connection === 'connected') {
				pushChat('system', 'Connection closed unexpectedly. Use /connect to reconnect.');
			}
		});

		const offWorkspace = session.workspace.onChange(() => {
			setWorkspacePaths(session.files.listPaths());
		});

		setWorkspacePaths(session.files.listPaths());
		pushEvent(`[session] connected agentId=${session.agentId}`);

		const offError = session.on('ws:error', (e: unknown) => {
			const err = e as { error?: unknown };
			pushEvent(`[ws] error ${String(err.error ?? e)}`);
		});

		const offOpen = session.on('ws:open', () => {
			pushEvent('[ws] connection opened');
		});

		const offClose = session.on('ws:close', (data: unknown) => {
			const d = data as { code?: number; reason?: string };
			pushEvent(`[ws] connection closed (code=${d.code ?? 'unknown'})`);
		});

		const offMessage = session.on('ws:message', (data: unknown) => {
			const m = data as { type: string; chunk?: string; filePath?: string; [key: string]: unknown };
			try {
				if (m.type === 'blueprint_chunk' && m.chunk) {
					pushEvent(`[ws] blueprint_chunk (+${m.chunk.length} chars)`);
					viewerEventsRef.current.onBlueprintChunk?.(m.chunk);
				} else if (m.type === 'file_generating' && m.filePath) {
					pushEvent(`[ws] file_generating: ${m.filePath}`);
					viewerEventsRef.current.onFileGenerating?.(m.filePath);
				} else if (m.type === 'file_chunk_generated' && m.filePath && m.chunk) {
					pushEvent(`[ws] file_chunk: ${m.filePath} (+${m.chunk.length} chars)`);
					viewerEventsRef.current.onFileChunk?.(m.filePath, m.chunk);
				} else if (m.type === 'terminal_command') {
					const cmd = m.command as string;
					pushEvent(`[ws] terminal_command: ${cmd}`);
					setTerminalOutput((prev) => [
						...prev.slice(-MAX_TERMINAL_BUFFER),
						{ id: nowId('term'), type: 'command', content: cmd, timestamp: m.timestamp as number ?? Date.now() },
					]);
				} else if (m.type === 'terminal_output') {
					const output = m.output as string;
					const outputType = (m.outputType as string) || 'stdout';
					pushEvent(`[ws] terminal_output: ${outputType}`);
					setTerminalOutput((prev) => [
						...prev.slice(-MAX_TERMINAL_BUFFER),
						{
							id: nowId('term'),
							type: outputType === 'stderr' ? 'stderr' : outputType === 'info' ? 'info' : 'stdout',
							content: output,
							timestamp: m.timestamp as number ?? Date.now(),
						},
					]);
				} else if (m.type === 'server_log') {
					const message = m.message as string;
					const level = (m.level as 'info' | 'warn' | 'error' | 'debug') || 'info';
					pushEvent(`[ws] server_log: [${level}] ${message.slice(0, 50)}`);
					setTerminalOutput((prev) => [
						...prev.slice(-MAX_TERMINAL_BUFFER),
						{
							id: nowId('log'),
							type: 'log',
							content: message,
							timestamp: m.timestamp as number ?? Date.now(),
							level,
						},
					]);
				} else if (m.type === 'agent_connected') {
					const templateDetails = m.templateDetails as { title?: string; originalPrompt?: string } | undefined;
					if (templateDetails) {
						setStatus((s) => ({
							...s,
							appTitle: templateDetails.title || s.appTitle,
							originalPrompt: templateDetails.originalPrompt || s.originalPrompt,
						}));
						pushEvent(`[ws] agent_connected: ${templateDetails.title || 'untitled'}`);
						pushChat('system', `Template selected: ${templateDetails.title || 'untitled'}`);
					} else {
						pushEvent(`[ws] agent_connected`);
					}
				} else if (m.type === 'template_selected') {
					const templateId = m.templateId as string || m.template as string || 'unknown';
					pushEvent(`[ws] template_selected: ${templateId}`);
					pushChat('system', 'Template selected, generating blueprint...');
				} else if (m.type === 'thinking' || m.type === 'agent_thinking') {
					pushEvent(`[ws] agent thinking...`);
				} else if (m.type === 'status' || m.type === 'status_update') {
					const statusMsg = m.status as string || m.message as string || 'processing';
					pushEvent(`[ws] status: ${statusMsg}`);
				} else if (m.type === 'generation_started') {
					pushEvent(`[ws] generation started`);
					pushChat('system', 'Generation starting...');
				} else if (m.type === 'phase_started') {
					const phaseName = m.phase as string || m.name as string || 'unknown';
					pushEvent(`[ws] phase started: ${phaseName}`);
				} else if (m.type === 'phase_completed') {
					const phaseName = m.phase as string || m.name as string || 'unknown';
					pushEvent(`[ws] phase completed: ${phaseName}`);
				} else {
					const keys = Object.keys(m).filter((k) => k !== 'type').join(', ');
					pushEvent(`[ws] ${m.type}${keys ? ` (${keys})` : ''}`);
				}
			} catch (err) {
				pushEvent(`[error] Message handler: ${err instanceof Error ? err.message : String(err)}`);
			}
		});

		const offPhases = session.phases.onChange((event) => {
			setStatus((s) => {
				// Push chat message when phase completes
				if (event.type === 'updated' && event.phase.status === 'completed') {
					const previewStr = s.previewUrl ? `, preview at ${s.previewUrl}` : '';
					pushChat('system', `[phase] ${event.phase.name} completed${previewStr}`);
				}
				return { ...s, phases: event.allPhases };
			});
			pushEvent(`[phase] ${event.type}: ${event.phase.name} (${event.phase.status})`);
		});

		const initialPhases = session.phases.list();
		if (initialPhases.length > 0) {
			setStatus((s) => ({ ...s, phases: initialPhases }));
		}

		cleanupRef.current = [offStateChange, offWorkspace, offError, offOpen, offClose, offMessage, offPhases];

		return () => {
			cleanupRef.current.forEach((fn) => fn());
			cleanupRef.current = [];
		};
	}, [session, pushChat, pushEvent]);

	const hydrateConversationHistory = useCallback((state: unknown) => {
		type ContentPart = { type?: unknown; text?: unknown };
		type HistoryMsg = { role?: unknown; content?: unknown };

		const history =
			state && typeof state === 'object'
				? ((state as { runningHistory?: unknown; fullHistory?: unknown }).runningHistory ??
					(state as { fullHistory?: unknown }).fullHistory ??
					[]) as unknown
				: [];

		const list = Array.isArray(history) ? (history as HistoryMsg[]) : [];
		const mapped: ChatMessage[] = list
			.map((msg, idx) => {
				const roleRaw = msg.role;
				const content = msg.content;
				let text = '';
				if (typeof content === 'string') text = content;
				else if (Array.isArray(content)) {
					text = (content as ContentPart[])
						.map((c) => (typeof c.text === 'string' ? c.text : ''))
						.filter(Boolean)
						.join(' ');
				}

				const chatRole: ChatRole =
					roleRaw === 'user'
						? 'you'
						: roleRaw === 'assistant'
							? 'assistant'
							: roleRaw === 'tool' || roleRaw === 'function'
								? 'tool'
								: 'system';

				return { id: nowId(`hist_${idx}`), role: chatRole, text };
			})
			.filter((x) => x.text.trim().length > 0);

		if (mapped.length) {
			setChatMessages(mapped.length > maxChatMessages ? mapped.slice(-maxChatMessages) : mapped);
		}
	}, [maxChatMessages]);

	const startBuild = useCallback(async (prompt: string, viewerEvents?: ViewerEvents): Promise<void> => {
		if (!apiKey) {
			pushChat('system', 'Missing VIBESDK_API_KEY');
			return;
		}
		const trimmed = prompt.trim();
		if (!trimmed) {
			pushChat('system', 'Build prompt is empty. Usage: /build <prompt>');
			return;
		}

		if (viewerEvents) {
			viewerEventsRef.current = viewerEvents;
		}

		clearChat();

		// Trigger loading animation
		viewerEventsRef.current.onBuildStart?.();

		pushChat('you', trimmed);
		pushChat('system', 'Starting build...');
		pushEvent('[build] starting');
		setStatus((s) => ({
			...s,
			connection: 'connecting',
			generation: { status: 'running', filesGenerated: 0 },
			phase: { status: 'idle' },
			previewUrl: undefined,
			startTime: Date.now(),
			currentFile: undefined,
			originalPrompt: trimmed,
			appTitle: undefined,
		}));

		try {
			pushEvent('[build] calling API...');
			const s = await client.build(trimmed, {
				projectType: 'app',
				autoGenerate: true,
				credentials: {},
				onBlueprintChunk: viewerEventsRef.current.onBlueprintChunk,
			});

			pushEvent(`[build] API returned session`);
			pushEvent(`[build] agentId=${s.agentId}`);
			pushChat('system', 'Connected to agent. Generating blueprint...');
			setSession(s);
			addRecentAgent(s.agentId);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			pushChat('system', `Build failed: ${message}`);
			pushEvent(`[error] build failed: ${message}`);
			setStatus((s) => ({ ...s, connection: 'disconnected', generation: { status: 'idle' } }));
		}
	}, [client, apiKey, pushChat, pushEvent, addRecentAgent, clearChat]);

	const connectToAgent = useCallback(async (agentId: string): Promise<void> => {
		if (!apiKey) {
			pushChat('system', 'Missing VIBESDK_API_KEY');
			return;
		}
		if (!agentId) {
			pushChat('system', 'Usage: /connect <agentId>');
			return;
		}

		pushChat('you', `/connect ${agentId}`);
		pushEvent(`[connect] ${agentId}`);
		session?.close();
		setStatus((s) => ({ ...s, connection: 'connecting' }));

		try {
			const s = await withTimeout(
				client.connect(agentId, { credentials: {} }),
				operationTimeoutMs,
				'Connect operation timed out. Please try again.'
			);

			if (!s) {
				pushChat('system', 'Failed to connect: no session returned');
				pushEvent('[error] connect failed: no session returned');
				setStatus((st) => ({ ...st, connection: 'disconnected' }));
				return;
			}

			s.connect({ credentials: {} });
			setSession(s);
			addRecentAgent(s.agentId);

			try {
				const appResp = await client.apps.get(agentId);
				if (appResp.success && appResp.data) {
					setStatus((st) => ({
						...st,
						appTitle: appResp.data!.title || 'Untitled',
						originalPrompt: appResp.data!.originalPrompt || '',
					}));
				}
			} catch {
				// Metadata fetch is optional
			}

			pushEvent('[preview] auto-requesting preview URL');
			s.deployPreview();
		} catch (err) {
			const isTimeout = err instanceof TimeoutError;
			const message = err instanceof Error ? err.message : String(err);
			pushChat('system', isTimeout ? message : `Connect failed: ${message}`);
			pushEvent(`[error] connect failed: ${message}`);
			setStatus((st) => ({ ...st, connection: 'disconnected' }));
		}
	}, [client, apiKey, operationTimeoutMs, session, pushChat, pushEvent, addRecentAgent]);

	const followUp = useCallback((message: string) => {
		if (!session) {
			pushChat('system', NO_SESSION_MSG);
			return;
		}
		pushChat('you', message);
		setIsThinking(true);
		session.followUp(message);
	}, [session, pushChat]);

	const stop = useCallback(() => {
		if (!session) {
			pushChat('system', NO_SESSION_MSG);
			return;
		}
		pushChat('you', '/stop');
		session.stop();
	}, [session, pushChat]);

	const resume = useCallback(() => {
		if (!session) {
			pushChat('system', NO_SESSION_MSG);
			return;
		}
		pushChat('you', '/resume');
		session.resume();
	}, [session, pushChat]);

	const deployPreview = useCallback(() => {
		if (!session) {
			pushChat('system', NO_SESSION_MSG);
			return;
		}
		pushChat('you', '/preview');
		pushEvent('[preview] deploy');
		session.deployPreview();
	}, [session, pushChat, pushEvent]);

	const deployCloudflare = useCallback(() => {
		if (!session) {
			pushChat('system', NO_SESSION_MSG);
			return;
		}
		pushChat('you', '/deploy');
		pushEvent('[deploy] cloudflare');
		session.deployCloudflare();
	}, [session, pushChat, pushEvent]);

	const requestConversationState = useCallback(() => {
		if (!session) {
			pushChat('system', NO_SESSION_MSG);
			return;
		}
		pushChat('you', '/state');
		session.requestConversationState();
	}, [session, pushChat]);

	const closeSession = useCallback(() => {
		session?.close();
		setSession(null);
		setStatus(INITIAL_STATUS);
	}, [session]);

	const readFile = useCallback((path: string): string | undefined => {
		return session?.files.read(path) ?? undefined;
	}, [session]);

	return {
		client,
		session,
		status,
		isThinking,
		recentAgentIds,
		chatMessages,
		eventItems,
		workspacePaths,
		terminalOutput,
		startBuild,
		connectToAgent,
		followUp,
		stop,
		resume,
		deployPreview,
		deployCloudflare,
		requestConversationState,
		closeSession,
		setViewerEvents,
		pushChat,
		pushEvent,
		readFile,
	};
}
