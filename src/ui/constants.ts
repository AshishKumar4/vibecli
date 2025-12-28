// Display limits
export const MAX_CHAT_MESSAGES = 50;
export const MAX_EVENTS = 15;
export const MAX_SUGGESTIONS = 5;
export const MAX_FILES_DISPLAY = 20;
export const MAX_TERMINAL_BUFFER = 99;
export const INPUT_HISTORY_LIMIT = 200;
export const PUBLIC_APPS_LIMIT = 20;

// Truncation lengths
export const TRUNCATE_URL = 30;
export const TRUNCATE_ID = 20;
export const TRUNCATE_BASE_URL = 25;
export const TRUNCATE_DESCRIPTION = 60;
export const TRUNCATE_DETAILS_URL = 45;
export const TRUNCATE_APP_ID = 12;

// UI
export const COPY_FEEDBACK_TIMEOUT = 1500;
export const SEPARATOR_WIDTH = 50;
export const MODAL_SEPARATOR_WIDTH = 40;

// Colors
export const OVERLAY_BG = '#1a1a1a';

// ID Prefixes
export const ID_PREFIX = {
	SYSTEM: 'sys',
	EVENT: 'evt',
	MESSAGE: 'msg',
	TERMINAL: 'term',
	LOG: 'log',
	HISTORY: 'hist',
} as const;

// Error messages
export const NO_SESSION_MSG = 'No active session. Start a build with /build <prompt> first.';
