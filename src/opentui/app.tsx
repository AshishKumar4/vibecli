/** @jsxImportSource @opentui/react */
import { useKeyboard, useTerminalDimensions, useAppContext } from '@opentui/react';
import type { KeyEvent, PasteEvent } from '@opentui/core';
import { SyntaxStyle, RGBA } from '@opentui/core';
import { useState, useCallback, useEffect } from 'react';
import { spawn, exec } from 'child_process';
import { useSession } from '../ui/hooks';
import { theme, COMMANDS } from '../ui/theme';
import { parseCommand } from '../ui/utils';
import { COPY_FEEDBACK_TIMEOUT } from '../ui/constants';
import { getApiKey, getBaseUrl, saveCredentials, hasCredentials, DEFAULT_BASE_URL } from '../ui/config';
import { ROLE_STYLES } from './styles/roles';
import { LoadingAnimation, FRAME_COUNT, Separator, TabBar } from './components';
import type { InlineSuggestions, ChatMessage, ChatRole } from '../ui/types';
import type { AppListItem, AppWithFavoriteStatus, AppDetails } from '@cf-vibesdk/sdk';

type AppItem = AppListItem | AppWithFavoriteStatus;

type AppDetailsViewState = {
	app: AppDetails | null;
	loading: boolean;
	error?: string;
	fromTab: 'none' | 'myapps' | 'public' | 'recent' | 'favorites';
};

function copyToClipboard(text: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = process.platform === 'darwin'
			? spawn('pbcopy')
			: process.platform === 'win32'
				? spawn('clip')
				: spawn('xclip', ['-selection', 'clipboard']);

		proc.stdin?.write(text);
		proc.stdin?.end();
		proc.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`Clipboard command exited with code ${code}`));
		});
		proc.on('error', reject);
	});
}

function openInBrowser(url: string): void {
	const cmd = process.platform === 'darwin' ? 'open'
		: process.platform === 'win32' ? 'start'
			: 'xdg-open';
	exec(`${cmd} "${url}"`);
}

type Pane = 'input' | 'chat' | 'viewer' | 'files' | 'events';
type ViewerMode = 'none' | 'file' | 'stream' | 'blueprint';

function getFileType(path: string | null): string {
	if (!path) return 'text';
	const ext = path.split('.').pop()?.toLowerCase();
	const typeMap: Record<string, string> = {
		ts: 'typescript',
		tsx: 'typescript',
		js: 'javascript',
		jsx: 'javascript',
		json: 'json',
		md: 'markdown',
		css: 'css',
		html: 'html',
		py: 'python',
		rs: 'rust',
		go: 'go',
	};
	return typeMap[ext || ''] || 'text';
}

function filterSystemContext(text: string): string {
	return text.replace(/<system_context>[\s\S]*?<\/system_context>/g, '').trim();
}

type MessageGroup = {
	role: ChatRole;
	texts: string[];
	id: string;
	toolMessages?: string[];
};

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
	const groups: MessageGroup[] = [];
	for (const msg of messages) {
		const last = groups[groups.length - 1];

		// Tool messages nest into preceding assistant group
		if (msg.role === 'tool' && last?.role === 'assistant') {
			last.toolMessages = last.toolMessages || [];
			last.toolMessages.push(msg.text);
		} else if (last && last.role === msg.role) {
			last.texts.push(msg.text);
		} else {
			groups.push({ role: msg.role, texts: [msg.text], id: msg.id });
		}
	}
	return groups;
}

function getEventColor(text: string): string {
	if (text.includes('[error]')) return theme.red;
	if (text.includes('[build]')) return theme.green;
	if (text.includes('[preview]')) return theme.cyan;
	if (text.includes('[deploy]')) return theme.magenta;
	if (text.includes('[connect]')) return theme.yellow;
	if (text.includes('[session]')) return theme.orange;
	if (text.includes('[state]')) return theme.yellow;
	if (text.includes('[ws]')) return theme.cyan;
	if (text.includes('[ui]')) return theme.pink;
	if (text.includes('[file]')) return theme.green;
	if (text.includes('[phase]')) return theme.magenta;
	if (text.includes('blueprint')) return theme.magenta;
	if (text.includes('file_generating')) return theme.orange;
	if (text.includes('file_chunk')) return theme.cyan;
	if (text.includes('agent_connected')) return theme.green;
	return theme.muted;
}

function getFileColor(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase();
	const colorMap: Record<string, string> = {
		ts: theme.cyan,
		tsx: theme.cyan,
		js: theme.yellow,
		jsx: theme.yellow,
		json: theme.orange,
		md: theme.green,
		css: theme.magenta,
		html: theme.red,
		py: theme.green,
		rs: theme.orange,
		go: theme.cyan,
		sh: theme.green,
		yml: theme.pink,
		yaml: theme.pink,
		toml: theme.orange,
		svg: theme.magenta,
		png: theme.magenta,
		jpg: theme.magenta,
	};
	return colorMap[ext || ''] || theme.fg;
}

const syntaxStyle = SyntaxStyle.fromStyles({
	keyword: { fg: RGBA.fromHex(theme.magenta), bold: true },
	string: { fg: RGBA.fromHex(theme.green) },
	comment: { fg: RGBA.fromHex(theme.muted), italic: true },
	number: { fg: RGBA.fromHex(theme.yellow) },
	function: { fg: RGBA.fromHex(theme.accent) },
	type: { fg: RGBA.fromHex(theme.cyan) },
	variable: { fg: RGBA.fromHex(theme.fg) },
	operator: { fg: RGBA.fromHex(theme.yellow) },
	punctuation: { fg: RGBA.fromHex(theme.muted) },
	default: { fg: RGBA.fromHex(theme.fg) },
});

const VIBESDK_LOGO = [
	'██╗   ██╗██╗██████╗ ███████╗███████╗██████╗ ██╗  ██╗',
	'██║   ██║██║██╔══██╗██╔════╝██╔════╝██╔══██╗██║ ██╔╝',
	'██║   ██║██║██████╔╝█████╗  ███████╗██║  ██║█████╔╝ ',
	'╚██╗ ██╔╝██║██╔══██╗██╔══╝  ╚════██║██║  ██║██╔═██╗ ',
	' ╚████╔╝ ██║██████╔╝███████╗███████║██████╔╝██║  ██╗',
	'  ╚═══╝  ╚═╝╚═════╝ ╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝',
];

// Parse partial blueprint JSON - extract completed fields incrementally
function parsePartialBlueprint(content: string): Record<string, unknown> | null {
	if (!content || content.length < 10) return null;

	// Try complete parse first
	try {
		return JSON.parse(content);
	} catch {
		// Fall through to partial parsing
	}

	const result: Record<string, unknown> = {};

	// Extract simple string fields: "key": "value"
	const stringFields = ['title', 'projectName', 'description', 'detailedDescription', 'dataFlow'];
	for (const field of stringFields) {
		const regex = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
		const match = content.match(regex);
		if (match) {
			result[field] = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
		}
	}

	// Extract string arrays: "key": ["a", "b", "c"]
	const arrayFields = ['pitfalls', 'frameworks', 'colorPalette'];
	for (const field of arrayFields) {
		const regex = new RegExp(`"${field}"\\s*:\\s*\\[([^\\]]*)\\]`);
		const match = content.match(regex);
		if (match) {
			try {
				result[field] = JSON.parse(`[${match[1]}]`);
			} catch {
				// Array not complete yet
			}
		}
	}

	// Extract views array (objects)
	const viewsMatch = content.match(/"views"\s*:\s*\[([\s\S]*?)\]/);
	if (viewsMatch) {
		try {
			result.views = JSON.parse(`[${viewsMatch[1]}]`);
		} catch {
			// Views not complete
		}
	}

	// Extract userFlow object
	const userFlowMatch = content.match(/"userFlow"\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
	if (userFlowMatch) {
		try {
			result.userFlow = JSON.parse(userFlowMatch[1]);
		} catch {
			// userFlow not complete
		}
	}

	// Extract implementationRoadmap
	const roadmapMatch = content.match(/"implementationRoadmap"\s*:\s*\[([\s\S]*?)\]\s*[,}]/);
	if (roadmapMatch) {
		try {
			result.implementationRoadmap = JSON.parse(`[${roadmapMatch[1]}]`);
		} catch {
			// roadmap not complete
		}
	}

	// Extract initialPhase
	const initialPhaseMatch = content.match(/"initialPhase"\s*:\s*(\{[\s\S]*?\})\s*[,}]?$/);
	if (initialPhaseMatch) {
		try {
			result.initialPhase = JSON.parse(initialPhaseMatch[1]);
		} catch {
			// initialPhase not complete
		}
	}

	return Object.keys(result).length > 0 ? result : null;
}

// Check if blueprint has essential fields
function isCompleteBlueprint(bp: Record<string, unknown>): boolean {
	return Boolean(bp.title && bp.views && bp.implementationRoadmap);
}

// BlueprintViewer component for rendering parsed blueprint as formatted markdown
function BlueprintViewer({
	blueprint,
	collapsed,
	toggleSection,
}: {
	blueprint: Record<string, unknown>;
	collapsed: Set<string>;
	toggleSection: (section: string) => void;
}) {
	const title = blueprint.title as string || 'Untitled';
	const description = blueprint.description as string || '';
	const detailedDescription = blueprint.detailedDescription as string || '';
	const views = blueprint.views as Array<{ name: string; description: string }> || [];
	const userFlow = blueprint.userFlow as { uiLayout?: string; uiDesign?: string; userJourney?: string } || {};
	const pitfalls = blueprint.pitfalls as string[] || [];
	const frameworks = blueprint.frameworks as string[] || [];
	const implementationRoadmap = blueprint.implementationRoadmap as Array<{ phase: string; description: string }> || [];
	const initialPhase = blueprint.initialPhase as { name?: string; description?: string; files?: Array<{ path: string; purpose: string }> } || {};
	const colorPalette = blueprint.colorPalette as string[] || [];

	return (
		<box flexDirection="column" paddingLeft={1} paddingRight={1}>
			{/* Title */}
			<text fg={theme.accent}>📋 {title}</text>
			{description && <text fg={theme.fg}>{description}</text>}
			<text fg={theme.muted}>─────────────────────────────────</text>

			{/* Detailed Description */}
			{detailedDescription && (
				<>
					<text fg={theme.yellow}>📝 Description</text>
					<text fg={theme.fg}>{detailedDescription.slice(0, 500)}{detailedDescription.length > 500 ? '...' : ''}</text>
					<text> </text>
				</>
			)}

			{/* Views */}
			{views.length > 0 && (
				<>
					<text
						fg={theme.yellow}
						onMouseDown={() => toggleSection('views')}
					>
						{collapsed.has('views') ? '▶' : '▼'} 🖼 Views ({views.length})
					</text>
					{!collapsed.has('views') && views.map((v, i) => (
						<text key={i} fg={theme.fg} paddingLeft={2}>• {v.name}: {v.description}</text>
					))}
					<text> </text>
				</>
			)}

			{/* User Flow */}
			{(userFlow.uiLayout || userFlow.userJourney) && (
				<>
					<text
						fg={theme.yellow}
						onMouseDown={() => toggleSection('userFlow')}
					>
						{collapsed.has('userFlow') ? '▶' : '▼'} 🔄 User Flow
					</text>
					{!collapsed.has('userFlow') && (
						<>
							{userFlow.uiLayout && <text fg={theme.fg} paddingLeft={2}>Layout: {userFlow.uiLayout}</text>}
							{userFlow.uiDesign && <text fg={theme.fg} paddingLeft={2}>Design: {userFlow.uiDesign}</text>}
							{userFlow.userJourney && <text fg={theme.fg} paddingLeft={2}>Journey: {userFlow.userJourney.slice(0, 200)}...</text>}
						</>
					)}
					<text> </text>
				</>
			)}

			{/* Frameworks */}
			{frameworks.length > 0 && (
				<>
					<text fg={theme.cyan}>🛠 Frameworks: {frameworks.join(', ')}</text>
					<text> </text>
				</>
			)}

			{/* Implementation Roadmap */}
			{implementationRoadmap.length > 0 && (
				<>
					<text
						fg={theme.yellow}
						onMouseDown={() => toggleSection('roadmap')}
					>
						{collapsed.has('roadmap') ? '▶' : '▼'} 🗺 Implementation Roadmap ({implementationRoadmap.length} phases)
					</text>
					{!collapsed.has('roadmap') && implementationRoadmap.map((r, i) => (
						<text key={i} fg={theme.fg} paddingLeft={2}>{i + 1}. {r.phase}: {r.description.slice(0, 100)}{r.description.length > 100 ? '...' : ''}</text>
					))}
					<text> </text>
				</>
			)}

			{/* Initial Phase Files */}
			{initialPhase.files && initialPhase.files.length > 0 && (
				<>
					<text
						fg={theme.yellow}
						onMouseDown={() => toggleSection('files')}
					>
						{collapsed.has('files') ? '▶' : '▼'} 📁 Initial Files ({initialPhase.files.length})
					</text>
					{!collapsed.has('files') && initialPhase.files.map((f, i) => (
						<text key={i} fg={theme.green} paddingLeft={2}>• {f.path}</text>
					))}
					<text> </text>
				</>
			)}

			{/* Pitfalls - collapsed by default */}
			{pitfalls.length > 0 && (
				<>
					<text
						fg={theme.red}
						onMouseDown={() => toggleSection('pitfalls')}
					>
						{collapsed.has('pitfalls') ? '▶' : '▼'} ⚠ Pitfalls ({pitfalls.length})
					</text>
					{!collapsed.has('pitfalls') && pitfalls.map((p, i) => (
						<text key={i} fg={theme.red} paddingLeft={2}>• {p}</text>
					))}
					<text> </text>
				</>
			)}

			{/* Color Palette - collapsed by default */}
			{colorPalette.length > 0 && (
				<>
					<text
						fg={theme.magenta}
						onMouseDown={() => toggleSection('colorPalette')}
					>
						{collapsed.has('colorPalette') ? '▶' : '▼'} 🎨 Colors ({colorPalette.length})
					</text>
					{!collapsed.has('colorPalette') && (
						<text fg={theme.fg} paddingLeft={2}>{colorPalette.join(' · ')}</text>
					)}
				</>
			)}
		</box>
	);
}

type LoginStep = 'api_key' | 'base_url' | 'done';

export function App() {
	const { width: cols, height: rows } = useTerminalDimensions();
	const { keyHandler } = useAppContext();

	// Login state
	const [loginMode, setLoginMode] = useState<LoginStep | null>(() => hasCredentials() ? null : 'api_key');
	const [loginApiKey, setLoginApiKey] = useState('');
	const [loginBaseUrl, setLoginBaseUrl] = useState(DEFAULT_BASE_URL);

	// Credentials - reload when login completes
	const [baseUrl, setBaseUrl] = useState(getBaseUrl);
	const [apiKey, setApiKey] = useState(getApiKey);

	// Session state from hook
	const {
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
		pushChat,
		setViewerEvents,
		readFile,
	} = useSession({ baseUrl, apiKey });

	// UI state
	const [pane, setPane] = useState<Pane>('input');
	const [inputText, setInputText] = useState('');
	const [chatScroll, setChatScroll] = useState(0);
	const [suggestions, setSuggestions] = useState<InlineSuggestions>({
		open: false,
		selected: 0,
		items: [],
	});
	const [inputHistory, setInputHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number | null>(null);

	// Viewer state
	const [viewerMode, setViewerMode] = useState<ViewerMode>('none');
	const [viewerContent, setViewerContent] = useState('');
	const [viewerFilePath, setViewerFilePath] = useState<string | null>(null);
	const [blueprintContent, setBlueprintContent] = useState('');
	const [streamingContent, setStreamingContent] = useState('');
	const [selectedFileIndex, setSelectedFileIndex] = useState(0);

	// Phase timeline state
	const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

	// Blueprint viewer state
	const [parsedBlueprint, setParsedBlueprint] = useState<Record<string, unknown> | null>(null);
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['pitfalls', 'colorPalette']));

	// Loading animation state
	const [loadingFrame, setLoadingFrame] = useState(0);
	const [isWaitingForBlueprint, setIsWaitingForBlueprint] = useState(false);

	// Generation complete modal state
	const [showGenerationCompleteModal, setShowGenerationCompleteModal] = useState(false);

	// Deploy spinner state
	const [deploySpinnerFrame, setDeploySpinnerFrame] = useState(0);
	const DEPLOY_SPINNER = ['◐', '◓', '◑', '◒'];

	// Apps overlay state
	type AppsMode = 'none' | 'myapps' | 'public' | 'recent' | 'favorites';
	const [appsMode, setAppsMode] = useState<AppsMode>('none');
	const [appsList, setAppsList] = useState<AppItem[]>([]);
	const [appSearchQuery, setAppSearchQuery] = useState('');
	const [appsLoading, setAppsLoading] = useState(false);
	const [selectedAppIndex, setSelectedAppIndex] = useState(0);

	type CloneModalData = {
		appId: string;
		appTitle: string;
		isOwned: boolean;
		loading: boolean;
		token?: string;
		cloneUrl?: string;
		expiresAt?: string;
		error?: string;
	};
	const [cloneModal, setCloneModal] = useState<CloneModalData | null>(null);
	const [cloneCopiedField, setCloneCopiedField] = useState<'token' | 'url' | 'command' | null>(null);

	const [appDetailsView, setAppDetailsView] = useState<AppDetailsViewState | null>(null);
	const [detailsCopiedField, setDetailsCopiedField] = useState<'preview' | 'cloudflare' | 'clone' | null>(null);

	const createCopyHandler = <T extends string>(
		setField: React.Dispatch<React.SetStateAction<T | null>>
	) => (field: T, value: string) => {
		copyToClipboard(value).then(() => {
			setField(field);
			setTimeout(() => setField(null), COPY_FEEDBACK_TIMEOUT);
		}).catch(() => {
			pushChat('system', `Failed to copy ${field}`);
		});
	};

	const handleDetailsCopy = createCopyHandler(setDetailsCopiedField);

	const handleAppSelect = useCallback(async (app: AppItem) => {
		setAppDetailsView({ app: null, loading: true, fromTab: appsMode });
		try {
			const resp = await client.apps.get(app.id);
			if (!resp.success || !resp.data) {
				throw new Error(resp.error?.message || 'Failed to fetch app details');
			}
			setAppDetailsView({ app: resp.data, loading: false, fromTab: appsMode });
		} catch (err) {
			setAppDetailsView({
				app: null,
				loading: false,
				error: err instanceof Error ? err.message : String(err),
				fromTab: appsMode,
			});
		}
	}, [client, appsMode]);

	const switchAppTab = useCallback(async (mode: AppsMode) => {
		if (mode === 'none') {
			setAppsMode('none');
			return;
		}
		setAppsLoading(true);
		setAppsMode(mode);
		setSelectedAppIndex(0);
		try {
			let apps: AppItem[] = [];
			switch (mode) {
				case 'myapps': {
					const resp = await client.apps.listMine();
					if (!resp.success || !resp.data) throw new Error(resp.error?.message);
					apps = resp.data.apps;
					break;
				}
				case 'public': {
					const resp = await client.apps.listPublic({ search: appSearchQuery || undefined, limit: 20 });
					if (!resp.success || !resp.data) throw new Error(resp.error?.message);
					apps = resp.data.apps;
					break;
				}
				case 'recent': {
					const resp = await client.apps.listRecent();
					if (!resp.success || !resp.data) throw new Error(resp.error?.message);
					apps = resp.data.apps;
					break;
				}
				case 'favorites': {
					const resp = await client.apps.listFavorites();
					if (!resp.success || !resp.data) throw new Error(resp.error?.message);
					apps = resp.data.apps;
					break;
				}
			}
			setAppsList(apps);
		} catch (err) {
			pushChat('system', `Error: ${err instanceof Error ? err.message : String(err)}`);
			setAppsMode('none');
		} finally {
			setAppsLoading(false);
		}
	}, [client, appSearchQuery, pushChat]);

	const handleCloneClick = useCallback(async (app: { id: string; title?: string | null }, isOwned: boolean) => {
		setCloneModal({
			appId: app.id,
			appTitle: app.title || 'Untitled',
			isOwned,
			loading: isOwned, // Only loading if we need to fetch token
			cloneUrl: isOwned ? undefined : `${baseUrl}/apps/${app.id}.git`,
		});

		if (isOwned) {
			try {
				const resp = await client.apps.getGitCloneToken(app.id);
				if (!resp.success || !resp.data) throw new Error(resp.error?.message);
				setCloneModal(prev => prev ? {
					...prev,
					loading: false,
					token: resp.data!.token,
					cloneUrl: resp.data!.cloneUrl,
					expiresAt: resp.data!.expiresAt,
				} : null);
			} catch (err) {
				setCloneModal(prev => prev ? {
					...prev,
					loading: false,
					error: err instanceof Error ? err.message : String(err),
				} : null);
			}
		}
	}, [client, baseUrl]);

	const handleCloneCopy = createCopyHandler(setCloneCopiedField);

	const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
	const toggleToolExpand = useCallback((groupId: string) => {
		setExpandedTools((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	}, []);

	const [copiedField, setCopiedField] = useState<'agentId' | 'previewUrl' | 'cloudflareUrl' | null>(null);
	const handleCopy = createCopyHandler(setCopiedField);

	useEffect(() => {
		if (!keyHandler) return;

		const handlePaste = (event: PasteEvent) => {
			const pastedText = event.text;
			if (!pastedText) return;

			if (loginMode === 'api_key') {
				setLoginApiKey((prev) => prev + pastedText);
				return;
			}

			if (loginMode === 'base_url') {
				setLoginBaseUrl((prev) => prev + pastedText);
				return;
			}

			if (pane === 'input' && appsMode === 'none' && !cloneModal) {
				setInputText((prev) => {
					const newText = prev + pastedText;
					if (newText.startsWith('/')) {
						const query = newText.slice(1).toLowerCase();
						const matches = COMMANDS
							.filter((c) => c.cmd.toLowerCase().startsWith(query))
							.map((c) => ({ label: `${c.usage} - ${c.desc}`, insert: c.insert }));
						setSuggestions({
							open: matches.length > 0,
							selected: 0,
							items: matches,
						});
					} else {
						setSuggestions({ open: false, selected: 0, items: [] });
					}
					return newText;
				});
				setHistoryIndex(null);
			}
		};

		keyHandler.on('paste', handlePaste);
		return () => {
			keyHandler.off('paste', handlePaste);
		};
	}, [keyHandler, pane, loginMode, appsMode, cloneModal]);

	useEffect(() => {
		setViewerEvents({
			onBlueprintChunk: (chunk) => {
				setIsWaitingForBlueprint(false); // Stop animation when blueprint starts
				setBlueprintContent((prev) => prev + chunk);
				setViewerMode('blueprint');
			},
			onFileGenerating: (filePath) => {
				setStreamingContent('');
				setViewerFilePath(filePath);
				setViewerMode('stream');
			},
			onFileChunk: (filePath, chunk) => {
				setStreamingContent((prev) => prev + chunk);
				setViewerFilePath(filePath);
			},
			onBuildStart: () => {
				// Start the loading animation
				setIsWaitingForBlueprint(true);
				setLoadingFrame(0);
				setViewerMode('blueprint');
			},
		});
	}, [setViewerEvents]);

	useEffect(() => {
		if (status.generation.status === 'running' && status.phase.status === 'generating') {
			setBlueprintContent('');
			setParsedBlueprint(null);
		}
	}, [status.generation.status, status.phase.status]);

	// Parse blueprint JSON when content changes
	useEffect(() => {
		if (!blueprintContent) {
			setParsedBlueprint(null);
			return;
		}
		const parsed = parsePartialBlueprint(blueprintContent);
		if (parsed) {
			setParsedBlueprint(parsed);
		}
	}, [blueprintContent]);

	// Loading animation timer
	useEffect(() => {
		if (!isWaitingForBlueprint) return;

		const interval = setInterval(() => {
			setLoadingFrame((f) => (f + 1) % FRAME_COUNT);
		}, 400); // Update every 400ms for smooth animation

		return () => clearInterval(interval);
	}, [isWaitingForBlueprint]);

	// Show generation complete modal when generation finishes
	useEffect(() => {
		if (status.generation.status === 'complete') {
			setShowGenerationCompleteModal(true);
		}
	}, [status.generation.status]);

	// Deploy spinner animation
	useEffect(() => {
		if (status.cloudflare.status !== 'running') return;

		const interval = setInterval(() => {
			setDeploySpinnerFrame((f) => (f + 1) % 4);
		}, 200);

		return () => clearInterval(interval);
	}, [status.cloudflare.status]);

	const refreshSuggestions = useCallback((text: string) => {
		if (!text.startsWith('/')) {
			setSuggestions({ open: false, selected: 0, items: [] });
			return;
		}

		const query = text.slice(1).toLowerCase();
		const matches = COMMANDS
			.filter((c) => c.cmd.toLowerCase().startsWith(query))
			.map((c) => ({ label: `${c.usage} - ${c.desc}`, insert: c.insert }));

		setSuggestions({
			open: matches.length > 0,
			selected: 0,
			items: matches,
		});
	}, []);

	const acceptSuggestion = useCallback(() => {
		if (!suggestions.open || suggestions.items.length === 0) return;

		const item = suggestions.items[suggestions.selected];
		if (item) {
			const newText = item.insert + ' ';
			setInputText(newText);
			setSuggestions({ open: false, selected: 0, items: [] });
		}
	}, [suggestions]);

	useKeyboard((key: KeyEvent) => {
		if (key.raw?.includes('[<') || key.raw?.includes(';')) {
			return;
		}

		if (key.ctrl && key.name === 'c') {
			process.exit(0);
		}

		if (cloneModal && key.name === 'escape') {
			setCloneModal(null);
			return;
		}

		if (showGenerationCompleteModal && key.name === 'escape') {
			setShowGenerationCompleteModal(false);
			return;
		}

		if (loginMode !== null) {
			if (key.name === 'escape' && hasCredentials()) {
				setLoginMode(null);
			}
			return;
		}

		if (pane === 'input' && loginMode === null && appsMode === 'none' && !cloneModal) {
			if (key.name === 'escape') {
				if (suggestions.open) {
					setSuggestions({ open: false, selected: 0, items: [] });
					return;
				}
				if (viewerMode !== 'none') {
					setViewerMode('none');
					return;
				}
				return;
			}
			if (key.name === 'tab') {
				if (suggestions.open) {
					acceptSuggestion();
				} else {
					const order: Pane[] = ['input', 'chat', 'viewer', 'files', 'events'];
					setPane(order[(order.indexOf(pane) + 1) % order.length]!);
				}
				return;
			}
			if (key.name === 'up') {
				if (suggestions.open) {
					setSuggestions((s) => ({ ...s, selected: Math.max(0, s.selected - 1) }));
				} else if (inputHistory.length > 0) {
					setHistoryIndex((idx) => {
						const nextIdx = idx === null ? inputHistory.length - 1 : Math.max(0, idx - 1);
						const entry = inputHistory[nextIdx] ?? '';
						setInputText(entry);
						refreshSuggestions(entry);
						return nextIdx;
					});
				}
				return;
			}
			if (key.name === 'down') {
				if (suggestions.open) {
					setSuggestions((s) => ({ ...s, selected: Math.min(s.items.length - 1, s.selected + 1) }));
				} else if (inputHistory.length > 0) {
					setHistoryIndex((idx) => {
						if (idx === null) return null;
						const nextIdx = idx + 1;
						if (nextIdx >= inputHistory.length) {
							setInputText('');
							setSuggestions({ open: false, selected: 0, items: [] });
							return null;
						}
						const entry = inputHistory[nextIdx] ?? '';
						setInputText(entry);
						refreshSuggestions(entry);
						return nextIdx;
					});
				}
				return;
			}
			return;
		}

		if (appsMode !== 'none') {
			if (key.name === 'escape') {
				if (appDetailsView) {
					setAppDetailsView(null);
					return;
				}
				setAppsMode('none');
				setAppsList([]);
				setSelectedAppIndex(0);
				return;
			}
			if (key.name === 'up') {
				setSelectedAppIndex((i) => Math.max(0, i - 1));
				return;
			}
			if (key.name === 'down') {
				setSelectedAppIndex((i) => Math.min(appsList.length - 1, i + 1));
				return;
			}
			if (appDetailsView?.app) {
				if (key.name === 'return') {
					setAppsMode('none');
					setAppsList([]);
					const appId = appDetailsView.app.id;
					setAppDetailsView(null);
					void connectToAgent(appId);
					return;
				}
			}
			if (key.name === 'return') {
				const app = appsList[selectedAppIndex];
				if (app) {
					void handleAppSelect(app);
				}
				return;
			}
			return;
		}

		if (key.name === 'escape') {
			if (suggestions.open) {
				setSuggestions({ open: false, selected: 0, items: [] });
				return;
			}
			if (viewerMode !== 'none') {
				setViewerMode('none');
				setPane('input');
				return;
			}
			setPane('input');
			return;
		}

		if (key.name === 'tab') {
			if (pane === 'input' && suggestions.open) {
				acceptSuggestion();
				return;
			}
			const order: Pane[] = ['input', 'chat', 'viewer', 'files', 'events'];
			setPane(order[(order.indexOf(pane) + 1) % order.length]!);
			return;
		}

		if (pane === 'chat') {
			if (key.name === 'up') {
				setChatScroll((s) => Math.min(s + 1, chatMessages.length - 1));
			}
			if (key.name === 'down') {
				setChatScroll((s) => Math.max(s - 1, 0));
			}
		}

		if (pane === 'files') {
			if (key.name === 'up') {
				setSelectedFileIndex((i) => Math.max(0, i - 1));
				return;
			}
			if (key.name === 'down') {
				setSelectedFileIndex((i) => Math.min(workspacePaths.length - 1, i + 1));
				return;
			}
			if (key.name === 'return') {
				const path = workspacePaths[selectedFileIndex];
				if (path) {
					const content = readFile(path);
					if (content !== undefined) {
						setViewerContent(content);
						setViewerFilePath(path);
						setViewerMode('file');
						setPane('viewer');
					}
				}
				return;
			}
		}

		if (pane !== 'input') {
			if (key.raw === 'b' || key.raw === '1') {
				if (blueprintContent) {
					setViewerMode('blueprint');
					setPane('viewer');
				}
				return;
			}
			if (key.raw === 's' || key.raw === '2') {
				if (streamingContent) {
					setViewerMode('stream');
					setPane('viewer');
				}
				return;
			}
			if (key.raw === 'f' || key.raw === '3') {
				if (viewerContent) {
					setViewerMode('file');
					setPane('viewer');
				}
				return;
			}
		}
	});

	async function runCommand(line: string) {
		const { cmd, arg } = parseCommand(line);
		switch (cmd) {
			case 'exit':
				process.exit(0);
				break;
			case 'help':
				pushChat('system', 'Commands: /login, /build <prompt>, /connect <id>, /preview, /deploy, /state, /stop, /resume, /exit');
				break;
			case 'login':
				setLoginMode('api_key');
				setLoginApiKey('');
				setLoginBaseUrl(DEFAULT_BASE_URL);
				break;
			case 'build':
				await startBuild(arg);
				break;
			case 'connect':
				await connectToAgent(arg);
				break;
			case 'continue':
				if (recentAgentIds.length === 0) {
					pushChat('system', 'No recent apps. Use /build to start a new session.');
				} else {
					pushChat('system', 'Recent apps:');
					recentAgentIds.forEach((id, i) => {
						pushChat('system', `  ${i + 1}. ${id}`);
					});
					pushChat('system', 'Use /connect <agentId> to reconnect.');
				}
				break;
			case 'myapps':
				await switchAppTab('myapps');
				break;
			case 'apps':
				setAppSearchQuery(arg || '');
				await switchAppTab('public');
				break;
			case 'recent':
				await switchAppTab('recent');
				break;
			case 'favorites':
				await switchAppTab('favorites');
				break;
			case 'preview':
				deployPreview();
				break;
			case 'deploy':
				deployCloudflare();
				break;
			case 'state':
				requestConversationState();
				break;
			case 'stop':
				stop();
				break;
			case 'resume':
				resume();
				break;
			case 'follow':
				if (!session) {
					await startBuild(arg);
				} else if (arg) {
					followUp(arg);
				}
				break;
			default:
				if (!line.startsWith('/')) {
					if (session) {
						followUp(line);
					} else {
						await startBuild(line);
					}
				} else {
					pushChat('system', `Unknown command: /${cmd}`);
				}
		}
	}

	const connColor =
		status.connection === 'connected' ? theme.green : status.connection === 'connecting' ? theme.orange : theme.muted;
	const genColor =
		status.generation.status === 'running' ? theme.orange : status.generation.status === 'complete' ? theme.green : theme.muted;
	const phaseColor =
		status.phase.status === 'generating' || status.phase.status === 'generated'
			? theme.magenta
			: status.phase.status === 'implementing' || status.phase.status === 'implemented'
				? theme.cyan
				: status.phase.status === 'validating' || status.phase.status === 'validated'
					? theme.yellow
					: theme.muted;

	const cloudflareUrl = status.cloudflare.status === 'complete' ? status.cloudflare.deploymentUrl : null;
	const cloudflareError = status.cloudflare.status === 'failed' ? status.cloudflare.error : null;
	const headerHeight = session ? 8 : 4;

	return (
		<box width={cols} height={rows} flexDirection="column">
			{/* Header */}
			<box height={headerHeight} borderStyle="single" border={['bottom']} borderColor={theme.borderInactive} flexDirection="row">
				<box width="50%" flexDirection="column">
					<text>
						<span fg={theme.accent}>☁ </span>
						<span fg={theme.accent}>vibesdk</span>
						<span fg={theme.muted}> · </span>
						<span fg={theme.yellow}>{baseUrl}</span>
					</text>
					<text>
						<span fg={connColor}>● </span>
						<span fg={theme.fg}>{status.connection}</span>
						<span fg={theme.muted}> │ </span>
						<span fg={genColor}>◉ </span>
						<span fg={theme.fg}>{status.generation.status}</span>
						{status.phase.status !== 'idle' && (
							<>
								<span fg={theme.muted}> → </span>
								<span fg={phaseColor}>{status.phase.status}</span>
							</>
						)}
					</text>
					{session && (
						<text onMouseDown={() => handleCopy('agentId', session.agentId)}>
							<span fg={theme.muted}>id: </span>
							<span fg={copiedField === 'agentId' ? theme.green : theme.magenta}>
								{copiedField === 'agentId' ? '✓ copied!' : session.agentId}
							</span>
							<span fg={theme.cyan}> [copy]</span>
						</text>
					)}
					{status.previewUrl && (
						<box flexDirection="row">
							<text onMouseDown={() => handleCopy('previewUrl', status.previewUrl!)}>
								<span fg={theme.green}>▶ </span>
								<span fg={copiedField === 'previewUrl' ? theme.green : theme.cyan}>
									{copiedField === 'previewUrl' ? '✓ copied!' : (status.previewUrl.length > 55 ? status.previewUrl.slice(0, 52) + '...' : status.previewUrl)}
								</span>
								<span fg={theme.cyan}> [copy]</span>
							</text>
							<text fg={theme.yellow} onMouseDown={() => openInBrowser(status.previewUrl!)}>
								{' '}[open]
							</text>
						</box>
					)}
					{status.cloudflare.status === 'running' && (
						<box borderStyle="single" borderColor={theme.orange}>
							<text>
								<span fg={theme.orange}> ☁ DEPLOYING {DEPLOY_SPINNER[deploySpinnerFrame]} </span>
							</text>
						</box>
					)}
					{cloudflareUrl && (
						<box flexDirection="row">
							<text onMouseDown={() => handleCopy('cloudflareUrl', cloudflareUrl)}>
								<span fg={theme.orange}>☁ </span>
								<span fg={copiedField === 'cloudflareUrl' ? theme.green : theme.cyan}>
									{copiedField === 'cloudflareUrl' ? '✓ copied!' : (cloudflareUrl.length > 50 ? cloudflareUrl.slice(0, 47) + '...' : cloudflareUrl)}
								</span>
								<span fg={theme.cyan}> [copy]</span>
							</text>
							<text fg={theme.yellow} onMouseDown={() => openInBrowser(cloudflareUrl)}>
								{' '}[open]
							</text>
						</box>
					)}
					{cloudflareError && (
						<text fg={theme.red}>☁ Failed: {cloudflareError.slice(0, 30)}</text>
					)}
					{!session && (
						<text fg={theme.muted}>
							<span fg={theme.yellow}>{workspacePaths.length}</span> files │ Type to build or /help
						</text>
					)}
				</box>

				<box width="50%" flexDirection="column" borderStyle="single" border={['left']} borderColor={theme.borderInactive} paddingLeft={1}>
					{session ? (
						<>
							<text fg={theme.accent}>
								{status.appTitle || 'Building...'}
							</text>
							<scrollbox height={3}>
								<text fg={theme.muted}>
									{(status.originalPrompt || 'Loading prompt...').slice(0, 200)}{(status.originalPrompt?.length ?? 0) > 200 ? '...' : ''}
								</text>
							</scrollbox>
						</>
					) : (
						<>
							<text fg={theme.accent}>Welcome to VibeSDK CLI</text>
							<text fg={theme.muted}>Type a prompt to start building</text>
							<text fg={theme.muted}>or use /apps to browse</text>
						</>
					)}
				</box>
			</box>

			{/* Main content */}
			<box flexDirection="row" flexGrow={1}>
				{/* Left panel - Chat/Viewer */}
				<box width="75%" flexDirection="column">
					<box flexDirection="row" height={1} paddingLeft={1} borderStyle="single" border={['bottom']} borderColor={theme.borderInactive}>
						<text
							fg={viewerMode === 'blueprint' ? theme.accent : blueprintContent ? theme.magenta : theme.muted}
							onMouseDown={() => { if (blueprintContent) { setViewerMode('blueprint'); setPane('viewer'); } }}
						>
							{blueprintContent ? '[b] Blueprint' : '    Blueprint'}{viewerMode === 'blueprint' ? '*' : ' '}
						</text>
						<text fg={theme.muted}> | </text>
						<text
							fg={viewerMode === 'stream' ? theme.accent : streamingContent ? theme.orange : theme.muted}
							onMouseDown={() => { if (streamingContent) { setViewerMode('stream'); setPane('viewer'); } }}
						>
							{streamingContent ? '[s] Stream' : '    Stream'}{viewerMode === 'stream' ? '*' : ' '}
						</text>
						<text fg={theme.muted}> | </text>
						<text
							fg={viewerMode === 'file' ? theme.accent : viewerContent ? theme.cyan : theme.muted}
							onMouseDown={() => { if (viewerContent) { setViewerMode('file'); setPane('viewer'); } }}
						>
							{viewerContent ? '[f] File' : '    File'}{viewerMode === 'file' ? '*' : ' '}
						</text>
						<text fg={theme.muted}> | </text>
						<text fg={theme.muted}>Esc=close</text>
					</box>
					{viewerMode === 'none' ? (
					<box
						flexDirection="column"
						flexGrow={1}
					>
						<scrollbox
							flexGrow={1}
							borderStyle="single"
							borderColor={pane === 'chat' || pane === 'input' ? theme.accent : theme.borderInactive}
							stickyScroll={true}
							stickyStart="bottom"
						>
							<text fg={theme.accent}>Chat {pane === 'chat' ? '*' : ''}</text>
							{groupMessages(chatMessages.slice(-50)).map((group) => (
								<box
									key={group.id}
									flexDirection="column"
									backgroundColor={ROLE_STYLES[group.role].bg}
									borderStyle="rounded"
									borderColor={ROLE_STYLES[group.role].border}
									paddingLeft={1}
									paddingRight={1}
									marginBottom={1}
								>
									<text fg={ROLE_STYLES[group.role].fg}>
										{ROLE_STYLES[group.role].label}
									</text>
									{group.texts.map((text, i) => {
										const filtered = filterSystemContext(text);
										return filtered ? (
											<text key={i} fg={group.role === 'system' ? theme.muted : theme.fg}>
												{filtered}
											</text>
										) : null;
									})}
									{group.role === 'assistant' && group.toolMessages && group.toolMessages.length > 0 && (
										<box
											marginTop={1}
											backgroundColor={theme.toolBubbleBg}
											borderStyle="rounded"
											borderColor={theme.magenta}
											paddingLeft={1}
											paddingRight={1}
											onMouseDown={() => toggleToolExpand(group.id)}
										>
											<text fg={theme.magenta}>
												{expandedTools.has(group.id) ? '▼' : '▶'} ⚙ Tools ({group.toolMessages.length})
											</text>
											{expandedTools.has(group.id) && group.toolMessages.map((t, i) => (
												<text key={i} fg={theme.muted}>{t}</text>
											))}
										</box>
									)}
								</box>
							))}
							{isThinking && (
								<box
									backgroundColor={theme.assistantBubbleBg}
									borderStyle="rounded"
									borderColor={theme.orange}
									paddingLeft={1}
									paddingRight={1}
								>
									<text fg={theme.orange}>⏳ Assistant is thinking...</text>
								</box>
							)}
						</scrollbox>
						<box position="relative" height={1}>
							{suggestions.open && suggestions.items.length > 0 && (
								<box
									position="absolute"
									bottom={2}
									left={0}
									backgroundColor="#1a1a1a"
									borderStyle="single"
									borderColor={theme.accent}
									flexDirection="column"
									zIndex={50}
									paddingLeft={1}
									paddingRight={1}
								>
									{suggestions.items.map((item, idx) => (
										<text
											key={item.insert}
											fg={idx === suggestions.selected ? theme.accent : theme.muted}
											bg={idx === suggestions.selected ? theme.highlightBg : undefined}
										>
											{idx === suggestions.selected ? '▸ ' : '  '}
											{item.label}
										</text>
									))}
									<text fg={theme.muted}>Tab to accept · Esc to dismiss</text>
								</box>
							)}
							<box flexDirection="row">
								<text fg={theme.accent}>{'> '}</text>
								<input
									flexGrow={1}
									value={inputText}
									focused={pane === 'input' && loginMode === null && appsMode === 'none' && !cloneModal}
									onInput={(value) => {
										setInputText(value);
										refreshSuggestions(value);
										setHistoryIndex(null);
									}}
									onSubmit={() => {
										if (suggestions.open && suggestions.items.length > 0) {
											acceptSuggestion();
											return;
										}
										const text = inputText.trim();
										if (text) {
											setInputHistory((prev) => {
												if (prev[prev.length - 1] === text) return prev;
												return [...prev, text].slice(-200);
											});
											void runCommand(text);
										}
										setInputText('');
										setSuggestions({ open: false, selected: 0, items: [] });
										setHistoryIndex(null);
									}}
								/>
							</box>
						</box>
					</box>
					) : (
						<box flexDirection="column" flexGrow={1}>
							<box borderStyle="single" border={['bottom']} borderColor={theme.accent}>
								<text>
									<span fg={viewerMode === 'file' ? theme.cyan : viewerMode === 'stream' ? theme.orange : theme.magenta}>
										{viewerMode === 'file' ? '📄 ' : viewerMode === 'stream' ? '⚡ ' : '📋 '}
									</span>
									<span fg={theme.fg}>
										{viewerFilePath || (viewerMode === 'blueprint' ? 'Blueprint' : 'Viewer')}
									</span>
									<span fg={theme.muted}> (Esc to close)</span>
								</text>
							</box>
							<scrollbox
								flexGrow={1}
								borderStyle="single"
								borderColor={theme.accent}
								backgroundColor={theme.viewerBg}
								stickyScroll={true}
								stickyStart="bottom"
							>
								{viewerMode === 'blueprint' ? (
									parsedBlueprint ? (
										<>
											{!isCompleteBlueprint(parsedBlueprint) && (
												<text fg={theme.orange}>◐ Streaming blueprint...</text>
											)}
											<BlueprintViewer
												blueprint={parsedBlueprint}
												collapsed={collapsedSections}
												toggleSection={(s) => setCollapsedSections(prev => {
													const next = new Set(prev);
													if (next.has(s)) next.delete(s);
													else next.add(s);
													return next;
												})}
											/>
										</>
									) : isWaitingForBlueprint ? (
										<LoadingAnimation frame={loadingFrame} />
									) : (
										<text fg={theme.muted}>{blueprintContent ? 'Parsing blueprint...' : 'Waiting for blueprint...'}</text>
									)
								) : (viewerMode === 'stream' ? streamingContent : viewerContent) ? (
									<code
										content={viewerMode === 'stream' ? streamingContent : viewerContent}
										filetype={getFileType(viewerFilePath)}
										syntaxStyle={syntaxStyle}
										streaming={viewerMode === 'stream'}
									/>
								) : (
									<text fg={theme.muted}>
										{viewerMode === 'stream' ? 'Waiting for code...' : 'No content'}
									</text>
								)}
							</scrollbox>
						</box>
					)}
				</box>

				{/* Right panel - Sidebar */}
				<box width="25%" flexDirection="column">
					{/* Files pane */}
					<scrollbox
						height="40%"
						borderStyle="single"
						borderColor={pane === 'files' ? theme.accent : theme.borderInactive}
					>
						<text fg={theme.accent}>Files {pane === 'files' ? '*' : ''}</text>
						{workspacePaths.length === 0 ? (
							<text fg={theme.muted}>No files yet</text>
						) : (
							workspacePaths.slice(0, 20).map((path, idx) => {
								const isSelected = idx === selectedFileIndex;
								const fileColor = getFileColor(path);
								return (
									<text
										key={path}
										fg={isSelected ? theme.accent : fileColor}
										bg={isSelected ? theme.highlightBg : undefined}
										onMouseDown={() => {
											setSelectedFileIndex(idx);
											const content = readFile(path);
											if (content !== undefined) {
												setViewerContent(content);
												setViewerFilePath(path);
												setViewerMode('file');
												setPane('viewer');
											}
										}}
									>
										{isSelected ? '▶ ' : '  '}
										{path}
									</text>
								);
							})
						)}
						{pane === 'files' && workspacePaths.length > 0 && (
							<text fg={theme.muted}>Click or Enter to view</text>
						)}
					</scrollbox>

					{/* Phases pane */}
					<box
						height="30%"
						borderStyle="single"
						borderColor={theme.borderInactive}
						flexDirection="column"
						paddingLeft={1}
					>
						{/* Force phases to completed when generation is done */}
						{(() => {
							const displayPhases = status.phases.map(phase => {
								// If generation is complete, mark all non-pending phases as completed
								if (status.generation.status === 'complete' && phase.status !== 'pending') {
									return { ...phase, status: 'completed' as const };
								}
								return phase;
							});
							const completedCount = displayPhases.filter(p => p.status === 'completed').length;

							return (
								<>
									<text fg={theme.accent}>Phases {displayPhases.length > 0 ? `(${completedCount}/${displayPhases.length})` : ''}</text>
									{displayPhases.map((phase) => {
										const isExpanded = expandedPhases.has(phase.id);
										const statusIcon = phase.status === 'completed' ? '✓' :
											phase.status === 'generating' ? '◐' :
											phase.status === 'implementing' ? '●' :
											phase.status === 'validating' ? '◑' : '○';
										const statusColor = phase.status === 'completed' ? theme.green :
											phase.status === 'pending' ? theme.muted : theme.orange;
										const hasFiles = phase.files && phase.files.length > 0;

										return (
											<box key={phase.id} flexDirection="column">
												<box
													flexDirection="row"
													onMouseDown={() => {
														if (hasFiles) {
															setExpandedPhases(prev => {
																const next = new Set(prev);
																if (next.has(phase.id)) next.delete(phase.id);
																else next.add(phase.id);
																return next;
															});
														}
													}}
												>
													<text fg={statusColor}>
														{hasFiles ? (isExpanded ? '▼' : '▶') : ' '} {statusIcon} {phase.name}
														{hasFiles ? ` (${phase.files!.length})` : ''}
														{phase.status !== 'completed' && phase.status !== 'pending' ? ` [${phase.status}]` : ''}
													</text>
												</box>
												{isExpanded && phase.files?.map((file) => (
													<text
														key={file.path}
														fg={file.status === 'completed' ? theme.green :
															file.status === 'generating' ? theme.orange : theme.muted}
														paddingLeft={3}
													>
														{file.status === 'completed' ? '✓' :
														 file.status === 'generating' ? '◐' : '○'} {file.path}
													</text>
												))}
											</box>
										);
									})}
									{displayPhases.length === 0 && (
										<text fg={theme.muted}>○ waiting...</text>
									)}
								</>
							);
						})()}
					</box>

					{/* Events pane */}
					<scrollbox
						height="30%"
						borderStyle="single"
						borderColor={pane === 'events' ? theme.accent : theme.borderInactive}
						stickyScroll={true}
						stickyStart="bottom"
					>
						<text fg={theme.accent}>Events {pane === 'events' ? '*' : ''}</text>
						{eventItems.slice(-15).map((evt) => (
							<text key={evt.id} fg={getEventColor(evt.text)}>
								{evt.text}
							</text>
						))}
					</scrollbox>
				</box>
			</box>

			{/* Apps overlay */}
			{appsMode !== 'none' && (
				<box
					position="absolute"
					top={4}
					left={4}
					right={4}
					bottom={4}
					borderStyle="double"
					borderColor={theme.accent}
					backgroundColor="#1a1a1a"
					flexDirection="column"
					paddingLeft={1}
					paddingRight={1}
					zIndex={100}
				>
					{appDetailsView ? (
						<>
							<box flexDirection="row" marginBottom={1}>
								<text
									fg={theme.cyan}
									onMouseDown={() => setAppDetailsView(null)}
								>
									← Back
								</text>
								<text fg={theme.muted}> │ App Details │ Esc to go back</text>
							</box>

							{appDetailsView.loading ? (
								<text fg={theme.orange}>Loading app details...</text>
							) : appDetailsView.error ? (
								<text fg={theme.red}>Error: {appDetailsView.error}</text>
							) : appDetailsView.app ? (
								<scrollbox flexGrow={1}>
									<text fg={theme.accent}>
										📱 {appDetailsView.app.title || 'Untitled'}
									</text>

									{appDetailsView.app.description && (
										<text fg={theme.muted}>{appDetailsView.app.description}</text>
									)}

									<Separator />

									<text fg={theme.yellow}>Original Prompt:</text>
									<text fg={theme.fg}>{appDetailsView.app.originalPrompt}</text>

									<Separator />

									<text>
										<span fg={theme.yellow}>★ {appDetailsView.app.starCount || 0}</span>
										<span fg={theme.muted}> │ </span>
										<span fg={theme.cyan}>👁 {appDetailsView.app.viewCount || 0}</span>
										<span fg={theme.muted}> │ </span>
										<span fg={appDetailsView.app.visibility === 'public' ? theme.green : theme.orange}>
											{appDetailsView.app.visibility === 'public' ? '🌐 Public' : '🔒 Private'}
										</span>
										<span fg={theme.muted}> │ </span>
										<span fg={appDetailsView.app.status === 'completed' ? theme.green : theme.orange}>
											{appDetailsView.app.status === 'completed' ? '✓ Complete' : '⏳ Generating'}
										</span>
									</text>

									<Separator />

									{appDetailsView.app.previewUrl && (
										<text
											onMouseDown={() => handleDetailsCopy('preview', appDetailsView.app!.previewUrl!)}
										>
											<span fg={theme.green}>▶ Preview: </span>
											<span fg={detailsCopiedField === 'preview' ? theme.green : theme.cyan}>
												{detailsCopiedField === 'preview' ? '✓ copied!' : appDetailsView.app.previewUrl.slice(0, 45)}
											</span>
											{detailsCopiedField !== 'preview' && <span fg={theme.cyan}> [copy]</span>}
										</text>
									)}

									{appDetailsView.app.cloudflareUrl && (
										<text
											onMouseDown={() => handleDetailsCopy('cloudflare', appDetailsView.app!.cloudflareUrl!)}
										>
											<span fg={theme.orange}>☁ Deployed: </span>
											<span fg={detailsCopiedField === 'cloudflare' ? theme.green : theme.cyan}>
												{detailsCopiedField === 'cloudflare' ? '✓ copied!' : appDetailsView.app.cloudflareUrl.slice(0, 45)}
											</span>
											{detailsCopiedField !== 'cloudflare' && <span fg={theme.cyan}> [copy]</span>}
										</text>
									)}

									<text
										onMouseDown={() => handleDetailsCopy('clone', `${baseUrl}/apps/${appDetailsView.app!.id}.git`)}
									>
										<span fg={theme.magenta}>⎇ Clone: </span>
										<span fg={detailsCopiedField === 'clone' ? theme.green : theme.cyan}>
											{detailsCopiedField === 'clone' ? '✓ copied!' : `${baseUrl}/apps/${appDetailsView.app.id}.git`.slice(0, 45)}
										</span>
										{detailsCopiedField !== 'clone' && <span fg={theme.cyan}> [copy]</span>}
									</text>

									<Separator />

									<box flexDirection="row">
										<text
											fg={theme.green}
											onMouseDown={() => {
												setAppsMode('none');
												setAppsList([]);
												setAppDetailsView(null);
												void connectToAgent(appDetailsView.app!.id);
											}}
										>
											[▶ Connect]
										</text>
										<text fg={theme.muted}>  </text>
										<text
											fg={theme.cyan}
											onMouseDown={() => {
												if (appDetailsView.app) {
													void handleCloneClick(
														appDetailsView.app,
														appDetailsView.fromTab === 'myapps'
													);
												}
											}}
										>
											[⎇ Clone Details]
										</text>
									</box>
								</scrollbox>
							) : null}
						</>
					) : (
						<>
							<TabBar
								tabs={[
									{ id: 'myapps', label: 'My Apps' },
									{ id: 'public', label: 'Public' },
									{ id: 'recent', label: 'Recent' },
									{ id: 'favorites', label: 'Favorites' },
								]}
								activeTab={appsMode}
								onTabChange={(id) => {
									setAppDetailsView(null);
									void switchAppTab(id as AppsMode);
								}}
								suffix="  │  ↑↓ Enter to view, Esc to close"
							/>

							{appsLoading ? (
								<text fg={theme.muted}>Loading...</text>
							) : appsList.length === 0 ? (
								<text fg={theme.muted}>No apps found</text>
							) : (
								<scrollbox flexGrow={1} stickyScroll={false}>
									{appsList.map((app, idx) => {
										const isSelected = idx === selectedAppIndex;
										return (
											<box
												key={app.id}
												backgroundColor={isSelected ? theme.highlightBg : undefined}
												flexDirection="column"
												onMouseDown={() => {
													setSelectedAppIndex(idx);
													void handleAppSelect(app);
												}}
											>
												<text fg={isSelected ? theme.accent : theme.fg}>
													{isSelected ? '▶ ' : '  '}
													{app.title || 'Untitled'}
													{'starCount' in app && app.starCount > 0 && (
														<span fg={theme.yellow}> ★{app.starCount}</span>
													)}
													{'userName' in app && app.userName && (
														<span fg={theme.muted}> by {app.userName}</span>
													)}
												</text>
												{app.description && (
													<text fg={theme.muted}>
														{'    '}{app.description.slice(0, 60)}{app.description.length > 60 ? '...' : ''}
													</text>
												)}
												<text fg={theme.muted}>
													{'    '}<span fg={theme.cyan}>{app.id.length > 36 ? app.id.slice(0, 32) + '...' : app.id}</span>
													{app.status === 'completed' && <span fg={theme.magenta}> ✓</span>}
												</text>
											</box>
										);
									})}
								</scrollbox>
							)}
						</>
					)}
				</box>
			)}

			{/* Clone modal */}
			{cloneModal && (() => {
				const modalHeight = cloneModal.token ? 12 : 9;
				const modalWidth = Math.min(60, cols - 4);
				const modalTop = Math.max(2, Math.floor((rows - modalHeight) / 2));
				const modalLeft = Math.max(2, Math.floor((cols - modalWidth) / 2));
				return (
					<box
						position="absolute"
						top={modalTop}
						left={modalLeft}
						width={modalWidth}
						height={modalHeight}
						borderStyle="double"
						borderColor={theme.accent}
						backgroundColor="#1a1a1a"
						flexDirection="column"
						paddingLeft={2}
						paddingRight={2}
						zIndex={200}
					>
						<text fg={theme.accent}>⎇ Clone: {cloneModal.appTitle.slice(0, modalWidth - 15)}</text>
						<Separator width={Math.min(40, modalWidth - 6)} />

						{cloneModal.loading ? (
							<text fg={theme.orange}>Loading token...</text>
						) : cloneModal.error ? (
							<text fg={theme.red}>Error: {cloneModal.error.slice(0, modalWidth - 10)}</text>
						) : (
							<>
								{cloneModal.token && (
									<>
										<text fg={theme.muted}>Token:</text>
										<text
											fg={cloneCopiedField === 'token' ? theme.green : theme.yellow}
											onMouseDown={() => handleCloneCopy('token', cloneModal.token!)}
										>
											{cloneCopiedField === 'token' ? '✓ copied!' : cloneModal.token.slice(0, modalWidth - 20)}
											{cloneCopiedField !== 'token' && <span fg={theme.cyan}> [copy]</span>}
										</text>
									</>
								)}

								<text fg={theme.muted}>URL:</text>
								<text
									fg={cloneCopiedField === 'url' ? theme.green : theme.cyan}
									onMouseDown={() => handleCloneCopy('url', cloneModal.cloneUrl!)}
								>
									{cloneCopiedField === 'url' ? '✓ copied!' : cloneModal.cloneUrl!.slice(0, modalWidth - 12)}
									{cloneCopiedField !== 'url' && <span fg={theme.cyan}> [copy]</span>}
								</text>

								<text fg={theme.muted}>Command:</text>
								<text
									fg={cloneCopiedField === 'command' ? theme.green : theme.fg}
									onMouseDown={() => handleCloneCopy('command', `git clone ${cloneModal.cloneUrl}`)}
								>
									{cloneCopiedField === 'command' ? '✓ copied!' : `git clone ${cloneModal.cloneUrl}`.slice(0, modalWidth - 12)}
									{cloneCopiedField !== 'command' && <span fg={theme.cyan}> [copy]</span>}
								</text>
							</>
						)}

						<Separator width={Math.min(40, modalWidth - 6)} />
						<text onMouseDown={() => setCloneModal(null)}>
							<span fg={theme.cyan}>[Close]</span>
							<span fg={theme.muted}> Esc</span>
						</text>
					</box>
				);
			})()}

			{/* Login screen */}
			{loginMode !== null && (
				<box
					position="absolute"
					top={0}
					left={0}
					right={0}
					bottom={0}
					backgroundColor="#0d0d0d"
					flexDirection="column"
					alignItems="center"
					zIndex={300}
				>
					<box
						width={Math.min(70, cols - 4)}
						flexDirection="column"
						marginTop={Math.max(2, Math.floor((rows - 25) / 3))}
					>
						<box flexDirection="column" alignItems="center" marginBottom={2}>
							{VIBESDK_LOGO.map((line, i) => (
								<text key={i} fg={theme.accent}>{line}</text>
							))}
						</box>

						<text fg={theme.fg}>Build and deploy fullstack apps with AI</text>
						<text fg={theme.muted}>Powered by Cloudflare</text>

						<Separator />

						<text fg={theme.muted}>
							GitHub: <span fg={theme.cyan}>https://github.com/cloudflare/vibesdk</span>
						</text>

						<Separator />

						{loginMode === 'api_key' ? (
							<>
								<text fg={theme.yellow}>Welcome! To get started, you'll need an API key.</text>
								<text fg={theme.muted}></text>
								<text fg={theme.fg}>1. Go to <span fg={theme.cyan}>build.cloudflare.dev</span></text>
								<text fg={theme.fg}>2. Sign up or log in</text>
								<text fg={theme.fg}>3. Click Settings (gear icon)</text>
								<text fg={theme.fg}>4. Create a new API key</text>
								<text fg={theme.muted}></text>
								<text fg={theme.accent}>Paste your API key:</text>
								<box borderStyle="single" borderColor={theme.accent} height={3}>
									<input
										value={loginApiKey}
										focused={loginMode === 'api_key'}
										placeholder="your-api-key"
										onInput={(value) => setLoginApiKey(value)}
										onSubmit={() => {
											if (loginApiKey.trim()) {
												setLoginMode('base_url');
											}
										}}
									/>
								</box>
								<text fg={theme.muted}>Press Enter to continue</text>
							</>
						) : loginMode === 'base_url' ? (
							<>
								<text fg={theme.green}>✓ API key saved</text>
								<text fg={theme.muted}></text>
								<text fg={theme.accent}>Confirm base URL (press Enter to accept default):</text>
								<box borderStyle="single" borderColor={theme.accent} height={3}>
									<input
										value={loginBaseUrl}
										focused={loginMode === 'base_url'}
										placeholder={DEFAULT_BASE_URL}
										onInput={(value) => setLoginBaseUrl(value)}
										onSubmit={() => {
											saveCredentials(loginApiKey.trim(), loginBaseUrl.trim() || DEFAULT_BASE_URL);
											setApiKey(loginApiKey.trim());
											setBaseUrl(loginBaseUrl.trim() || DEFAULT_BASE_URL);
											setLoginMode(null);
											pushChat('system', '✓ Credentials saved! You can now use /build or /apps to get started.');
										}}
									/>
								</box>
								<text fg={theme.muted}>Press Enter to save and continue</text>
							</>
						) : null}

						{hasCredentials() && (
							<>
								<text fg={theme.muted}></text>
								<text fg={theme.muted}>Press Esc to cancel</text>
							</>
						)}
					</box>
				</box>
			)}

			{/* Generation Complete Modal */}
			{showGenerationCompleteModal && status.generation.status === 'complete' && (() => {
				const modalWidth = 55;
				const modalHeight = 10;
				const modalTop = Math.max(2, Math.floor((rows - modalHeight) / 2));
				const modalLeft = Math.max(2, Math.floor((cols - modalWidth) / 2));
				return (
				<box
					position="absolute"
					top={modalTop}
					left={modalLeft}
					width={modalWidth}
					height={modalHeight}
					borderStyle="double"
					borderColor={theme.green}
					backgroundColor="#1a1a1a"
					flexDirection="column"
					paddingLeft={2}
					paddingRight={2}
					paddingTop={1}
					zIndex={250}
				>
					<text fg={theme.green}>✓ App Generation Complete!</text>
					<text> </text>
					{status.previewUrl && (
						<text fg={theme.cyan}>Preview: {status.previewUrl.slice(0, 45)}</text>
					)}
					<text> </text>
					<box flexDirection="row">
						{status.previewUrl && (
							<text fg={theme.green} onMouseDown={() => openInBrowser(status.previewUrl!)}>
								[Open Preview]
							</text>
						)}
						<text>  </text>
						<text fg={theme.muted} onMouseDown={() => setShowGenerationCompleteModal(false)}>
							[Close]
						</text>
					</box>
					<text fg={theme.muted}>Press Esc or click Close to dismiss</text>
				</box>
				);
			})()}

			{/* Footer */}
			<box borderStyle="single" border={['top']} borderColor={theme.borderInactive}>
				<text>
					<span fg={theme.cyan}>Tab</span>
					<span fg={theme.muted}>: focus  </span>
					<span fg={theme.cyan}>↑↓</span>
					<span fg={theme.muted}>: nav  </span>
					<span fg={theme.cyan}>Enter</span>
					<span fg={theme.muted}>: select  </span>
					<span fg={theme.cyan}>Esc</span>
					<span fg={theme.muted}>: back  </span>
					<span fg={theme.red}>Ctrl+C</span>
					<span fg={theme.muted}>: exit  </span>
					<span fg={theme.magenta}>/help</span>
				</text>
			</box>
		</box>
	);
}
