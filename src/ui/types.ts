export type Pane = 'input' | 'chat' | 'viewer' | 'files' | 'events';

export type ViewerMode = 'stream' | 'file' | 'blueprint';

export type ChatRole = 'you' | 'assistant' | 'tool' | 'system';

export type ChatMessage = {
	id: string;
	role: ChatRole;
	text: string;
};

export type EventItem = {
	id: string;
	text: string;
};

export type InlineSuggestions = {
	open: boolean;
	selected: number;
	items: Array<{ label: string; insert: string }>;
};

export type CommandDef = {
	cmd: string;
	usage: string;
	insert: string;
	desc: string;
};

export type TerminalLine = {
	id: string;
	type: 'command' | 'stdout' | 'stderr' | 'info' | 'log';
	content: string;
	timestamp: number;
	level?: 'info' | 'warn' | 'error' | 'debug';
};
