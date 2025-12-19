import type { CommandDef } from './types';

export const theme = {
	// TokyoNight-ish pastels on black
	accent: '#7aa2f7',
	cyan: '#7dcfff',
	green: '#9ece6a',
	magenta: '#bb9af7',
	orange: '#ff9e64',
	red: '#f7768e',
	fg: '#c0caf5',
	muted: '#565f89',
	highlightBg: '#33467C',
};

export const COMMANDS: CommandDef[] = [
	{ cmd: 'help', usage: '/help', insert: '/help', desc: 'Show help and keyboard shortcuts' },
	{ cmd: 'build', usage: '/build <prompt>', insert: '/build', desc: 'Create a new build session' },
	{ cmd: 'connect', usage: '/connect <agentId>', insert: '/connect', desc: 'Connect to an existing agent' },
	{ cmd: 'preview', usage: '/preview', insert: '/preview', desc: 'Deploy preview' },
	{ cmd: 'deploy', usage: '/deploy', insert: '/deploy', desc: 'Deploy to Cloudflare' },
	{ cmd: 'state', usage: '/state', insert: '/state', desc: 'Request conversation state' },
	{ cmd: 'stop', usage: '/stop', insert: '/stop', desc: 'Stop generation' },
	{ cmd: 'resume', usage: '/resume', insert: '/resume', desc: 'Resume generation' },
	{ cmd: 'exit', usage: '/exit', insert: '/exit', desc: 'Exit' },
];

export const KEYBOARD_SHORTCUTS = `
GLOBAL
  Ctrl+C          Exit
  Ctrl+P          Open file search
  Ctrl+K          Open command palette
  Tab / Shift+Tab Cycle panes
  Escape          Return to input

INPUT PANE
  Enter           Send message
  Shift+Enter     New line
  Tab             Accept suggestion
  Up/Down         Navigate history

CHAT / VIEWER / EVENTS
  Up/Down         Scroll
  PageUp/PageDown Scroll by half page
  g / G           Jump to top / bottom

VIEWER
  1 / b           Switch to blueprint
  2 / s           Switch to stream
  3 / f           Switch to file

FILES PANE
  Enter           Open file / toggle dir
  o               Toggle outline view
`;

export const HISTORY_LIMIT = 200;
