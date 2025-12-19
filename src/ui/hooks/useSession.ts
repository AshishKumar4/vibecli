import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	PhasicClient,
	withTimeout,
	TimeoutError,
	type BuildSession,
	type SessionState,
	type ConnectionState,
} from '@cf-vibesdk/sdk';
import { createNodeWebSocketFactory } from '@cf-vibesdk/sdk/node';
import type { ChatMessage, ChatRole, EventItem } from '../types';
import { nowId } from '../utils';

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
	currentFile?: string;
	previewUrl?: string;
	startTime?: number;
};

type ChatPusher = (role: ChatRole, text: string) => void;
type EventPusher = (text: string) => void;

export type ViewerEvents = {
	onBlueprintChunk?: (chunk: string) => void;
	onFileGenerating?: (filePath: string) => void;
	onFileChunk?: (filePath: string, chunk: string) => void;
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
};

export function useSession(options: UseSessionOptions): UseSessionResult {
	const { baseUrl, apiKey, operationTimeoutMs = 30_000, maxChatMessages = 500 } = options;

	const client = useMemo(() => {
		return new PhasicClient({
			baseUrl,
			apiKey: apiKey ?? '',
			webSocketFactory: createNodeWebSocketFactory(),
		});
	}, [baseUrl, apiKey]);

	const [session, setSession] = useState<BuildSession | null>(null);
	const [recentAgentIds, setRecentAgentIds] = useState<string[]>([]);
	const [status, setStatus] = useState<CLIStatus>(INITIAL_STATUS);
	const [isThinking, setIsThinking] = useState(false);

	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
		{ id: nowId('sys'), role: 'system', text: 'Ready. Type a message to build, or use /commands.' },
	]);
	const [eventItems, setEventItems] = useState<EventItem[]>([
		{ id: nowId('evt'), text: '[ui] ready' },
	]);
	const [workspacePaths, setWorkspacePaths] = useState<string[]>([]);

	// Refs for cleanup and viewer events
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

	const addRecentAgent = useCallback((agentId: string) => {
		setRecentAgentIds((prev) =>
			prev.includes(agentId) ? prev : [agentId, ...prev].slice(0, 10)
		);
	}, []);

	// Subscribe to session state changes via SDK's onChange
	useEffect(() => {
		if (!session) return;

		// Subscribe to SDK's unified state store - connection, generation, phase, currentFile all tracked
		const offStateChange = session.state.onChange((next, prev) => {
			setStatus((s) => ({
				...s,
				connection: next.connection,
				generation: next.generation,
				phase: next.phase,
				currentFile: next.currentFile,
				previewUrl: next.previewUrl,
			}));

			// Handle conversation response
			if (next.lastConversationResponse && next.lastConversationResponse !== prev.lastConversationResponse) {
				setIsThinking(false);
				const response = next.lastConversationResponse;
				if (response.tool) {
					pushChat('tool', `${response.tool.name} ${response.tool.status}`);
				} else if (response.message) {
					pushChat('assistant', response.message);
				}
			}

			// Handle conversation state hydration
			if (next.conversationState && next.conversationState !== prev.conversationState) {
				hydrateConversationHistory(next.conversationState);
			}

			// Handle file generating notification
			if (next.currentFile && next.currentFile !== prev.currentFile) {
				pushChat('system', `[file] generating ${next.currentFile}`);
			}

			// Handle generation complete summary
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

			// Handle unexpected disconnection
			if (next.connection === 'disconnected' && prev.connection === 'connected') {
				pushChat('system', 'Connection closed unexpectedly. Use /connect to reconnect.');
			}
		});

		// Subscribe to workspace changes
		const offWorkspace = session.workspace.onChange(() => {
			setWorkspacePaths(session.files.listPaths());
		});

		// Initial workspace sync
		setWorkspacePaths(session.files.listPaths());
		pushEvent(`[session] connected agentId=${session.agentId}`);

		// Subscribe to ws:error for event logging
		const offError = session.on('ws:error', (e: { error: unknown }) => {
			pushEvent(`[ws] error ${String(e.error)}`);
		});

		// Subscribe to file events for streaming display (viewer-specific callbacks)
		const offMessage = session.on('ws:message', (m) => {
			try {
				pushEvent(`[ws] ${m.type}`);

				if (m.type === 'blueprint_chunk') {
					viewerEventsRef.current.onBlueprintChunk?.(m.chunk);
				}

				if (m.type === 'file_generating') {
					viewerEventsRef.current.onFileGenerating?.(m.filePath);
				}

				if (m.type === 'file_chunk_generated') {
					viewerEventsRef.current.onFileChunk?.(m.filePath, m.chunk);
				}
			} catch (err) {
				pushEvent(`[error] Message handler: ${err instanceof Error ? err.message : String(err)}`);
			}
		});

		cleanupRef.current = [offStateChange, offWorkspace, offError, offMessage];

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

		if (mapped.length) setChatMessages(mapped);
	}, []);

	const startBuild = useCallback(async (prompt: string, viewerEvents?: ViewerEvents): Promise<void> => {
		if (!apiKey) {
			pushChat('system', 'Missing VIBESDK_API_KEY');
			return;
		}
		const trimmed = prompt.trim();
		if (!trimmed) {
			pushChat('system', 'Build prompt is empty');
			return;
		}

		// Set viewer events before building
		if (viewerEvents) {
			viewerEventsRef.current = viewerEvents;
		}

		pushChat('you', trimmed);
		pushEvent('[build] starting');
		setStatus((s) => ({
			...s,
			connection: 'connecting',
			generation: { status: 'running', filesGenerated: 0 },
			phase: { status: 'idle' },
			previewUrl: undefined,
			startTime: Date.now(),
			currentFile: undefined,
		}));

		try {
			const s = await withTimeout(
				client.build(trimmed, {
					projectType: 'app',
					autoGenerate: true,
					credentials: {},
					onBlueprintChunk: viewerEvents?.onBlueprintChunk,
				}),
				operationTimeoutMs,
				'Build operation timed out. Please try again.'
			);

			pushEvent(`[build] agentId=${s.agentId}`);
			setSession(s);
			addRecentAgent(s.agentId);
		} catch (err) {
			const isTimeout = err instanceof TimeoutError;
			const message = err instanceof Error ? err.message : String(err);
			pushChat('system', isTimeout ? message : `Build failed: ${message}`);
			pushEvent(`[error] build failed: ${message}`);
			setStatus((s) => ({ ...s, connection: 'disconnected', generation: { status: 'idle' } }));
		}
	}, [client, apiKey, operationTimeoutMs, pushChat, pushEvent, addRecentAgent]);

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
		} catch (err) {
			const isTimeout = err instanceof TimeoutError;
			const message = err instanceof Error ? err.message : String(err);
			pushChat('system', isTimeout ? message : `Connect failed: ${message}`);
			pushEvent(`[error] connect failed: ${message}`);
			setStatus((st) => ({ ...st, connection: 'disconnected' }));
		}
	}, [client, apiKey, operationTimeoutMs, session, pushChat, pushEvent, addRecentAgent]);

	const followUp = useCallback((message: string) => {
		if (!session) return;
		pushChat('you', message);
		setIsThinking(true);
		session.followUp(message);
	}, [session, pushChat]);

	const stop = useCallback(() => {
		if (!session) return;
		pushChat('you', '/stop');
		session.stop();
	}, [session, pushChat]);

	const resume = useCallback(() => {
		if (!session) return;
		pushChat('you', '/resume');
		session.resume();
	}, [session, pushChat]);

	const deployPreview = useCallback(() => {
		if (!session) return;
		pushChat('you', '/preview');
		pushEvent('[preview] deploy');
		session.deployPreview();
	}, [session, pushChat, pushEvent]);

	const deployCloudflare = useCallback(() => {
		if (!session) return;
		pushChat('you', '/deploy');
		pushEvent('[deploy] cloudflare');
		session.deployCloudflare();
	}, [session, pushChat, pushEvent]);

	const requestConversationState = useCallback(() => {
		if (!session) return;
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
