import type { CommandDef } from './types';

export const theme = {
	// Cloudflare brand colors
	accent: '#f38020', // Cloudflare Orange - primary
	orange: '#f38020', // Cloudflare Orange
	yellow: '#faae40', // Yellow Orange - secondary

	// Extended palette
	blue: '#0051c3', // Cloudflare dashboard blue
	cyan: '#36bef7', // Light blue for types
	green: '#2ecc71', // Success green
	red: '#e74c3c', // Error red
	magenta: '#9b59b6', // Purple for keywords
	pink: '#faae40', // Use yellow-orange as pink

	// Text colors
	fg: '#ffffff', // White primary text
	muted: '#888888', // Gray muted text

	// Chat bubble backgrounds (dark grays)
	userBubbleBg: '#2a2a2a',
	assistantBubbleBg: '#333333',
	systemBubbleBg: '#3d3d3d',
	toolBubbleBg: '#363636',

	// Highlights and viewer
	highlightBg: '#4a3520', // Dark orange tint for highlights
	viewerBg: '#1a1a1a', // Deepest black for code

	// Borders
	borderActive: '#f38020', // Orange active border
	borderInactive: '#404041', // Ship Gray inactive border
};

export const COMMANDS: CommandDef[] = [
	{ cmd: 'help', usage: '/help', insert: '/help', desc: 'Show help and keyboard shortcuts' },
	{ cmd: 'login', usage: '/login', insert: '/login', desc: 'Configure API key and base URL' },
	{ cmd: 'build', usage: '/build <prompt>', insert: '/build', desc: 'Create a new build session' },
	{ cmd: 'connect', usage: '/connect <agentId>', insert: '/connect', desc: 'Connect to an existing agent' },
	{ cmd: 'continue', usage: '/continue', insert: '/continue', desc: 'Continue with a recent app' },
	{ cmd: 'myapps', usage: '/myapps', insert: '/myapps', desc: 'List your apps' },
	{ cmd: 'apps', usage: '/apps [search]', insert: '/apps', desc: 'List public apps' },
	{ cmd: 'recent', usage: '/recent', insert: '/recent', desc: 'List recent apps' },
	{ cmd: 'favorites', usage: '/favorites', insert: '/favorites', desc: 'List favorite apps' },
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
