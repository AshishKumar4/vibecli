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

export type FileEntry = {
	kind: 'dir' | 'file';
	name: string;
	path: string;
	depth: number;
};

export type OutlineEntry = {
	level: number;
	title: string;
	line: number;
};

export type FileSearchState =
	| { open: false }
	| { open: true; query: string; selected: number; results: string[] };

export type CommandPaletteState =
	| { open: false }
	| { open: true; selected: number; items: Array<{ label: string; value: string }> };

export type InlineSuggestions = {
	open: boolean;
	selected: number;
	items: Array<{ label: string; insert: string }>;
};

export type ComposerState = {
	text: string;
	cursor: number;
};

export type KeyLike = {
	pageUp?: boolean;
	pageDown?: boolean;
	home?: boolean;
	end?: boolean;
	upArrow?: boolean;
	downArrow?: boolean;
	leftArrow?: boolean;
	rightArrow?: boolean;
	return?: boolean;
	shift?: boolean;
	ctrl?: boolean;
	tab?: boolean;
	backspace?: boolean;
	delete?: boolean;
	escape?: boolean;
};

export type ChatTurn = {
	role: ChatRole;
	text: string;
	key: string;
};

export type CommandDef = {
	cmd: string;
	usage: string;
	insert: string;
	desc: string;
};
