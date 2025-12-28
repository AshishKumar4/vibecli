/** @jsxImportSource @opentui/react */
import { theme } from '../../ui/theme';

// ============================================================================
// Isometric 3D Frame Generation System
// ============================================================================

// Isometric 3D Monitor templates
const MONITOR_TOP = [
	'                  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
	'                 █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█▄',
	'                ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██▀',
	'               ▐██░░┌────────────────────────────────────┐░░░██▌▌',
];

const MONITOR_BOTTOM = [
	'               ▐██░░└────────────────────────────────────┘░░░██▌▌',
	'               ▐██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██▌▌',
	'               ▐██░░░░░░░░░░░░ ▒▓█ VIBECLI █▓▒ ░░░░░░░░░░░░░░██▌▌',
	'               ▐██▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄██▌▌',
	'                ▀██████████████████████████████████████████████▀▌',
	'                  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
	'                                ▐██████████████▌',
	'                               ▐████████████████▌',
	'                          ▄▄▄▄█████████████████████▄▄▄▄',
	'                          ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
];

// Screen line (36 char content width, with truncation safety)
const SCREEN_LINE = (content: string) => {
	const truncated = content.length > 36 ? content.slice(0, 36) : content;
	return `               ▐██░░│${truncated.padEnd(36)}│░░░██▌▌`;
};

// Isometric 3D Keyboard templates
const KEYBOARD_TOP = [
	'                 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
	'                █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░█▄',
	'               ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░██▀',
];

const KEYBOARD_BOTTOM = [
	'              ▐██     ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄     ██▌▌',
	'              ▐██     █        S P A C E  B A R        █     ██▌▌',
	'              ▐██     ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀     ██▌▌',
	'              ▐██▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄██▌▌',
	'               ▀█████████████████████████████████████████████▀▀▌',
	'                 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀',
];

// Keyboard layouts
const KEYBOARD_ROWS = [
	['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
	['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'],
];

// Generate key row (3 lines: top, letter, bottom)
function generateKeyRow(
	row: string[],
	pressedIndices: Set<number>,
	rowOffset: number
): [string, string, string] {
	let top = '';
	let mid = '';
	let bot = '';

	row.forEach((char, idx) => {
		const isPressed = pressedIndices.has(rowOffset + idx);
		if (isPressed) {
			top += '░░░░';
			mid += `░${char}░░`;
			bot += '▄▄▄▄';
		} else {
			top += '▄▄▄▄';
			mid += `█${char}██`;
			bot += '▀▀▀▀';
		}
	});

	return [top, mid, bot];
}

// Animation states
type FrameState = {
	messages: string[];
	pressedKeys: number[];
	cursorOn: boolean;
};

const ANIMATION_STATES: FrameState[] = [
	{
		messages: ['$ vibecli build', '> Waking up the edge nodes...'],
		pressedKeys: [0, 4],
		cursorOn: true,
	},
	{
		messages: ['$ vibecli build', '> Convincing electrons...'],
		pressedKeys: [10, 14],
		cursorOn: false,
	},
	{
		messages: ['$ vibecli build', '> Deploying carrier pigeons...'],
		pressedKeys: [2, 6],
		cursorOn: true,
	},
	{
		messages: ['$ vibecli build', '> Caffeinating the Workers...'],
		pressedKeys: [11, 15],
		cursorOn: false,
	},
	{
		messages: ['$ vibecli build', '> Teaching AI to write code...', "> (it's learning fast)"],
		pressedKeys: [1, 5, 8],
		cursorOn: true,
	},
	{
		messages: ['$ vibecli build', '> Spinning up 300+ data centers...'],
		pressedKeys: [3, 7],
		cursorOn: false,
	},
	{
		messages: ['$ vibecli build', '> Compiling hopes and dreams...'],
		pressedKeys: [0, 8, 12],
		cursorOn: true,
	},
	{
		messages: ['$ vibecli build', '> Generating blueprint...', '> Almost there!'],
		pressedKeys: [4, 13, 16],
		cursorOn: false,
	},
];

// Generate complete isometric frame
function generateFrame(state: FrameState): string[] {
	const lines: string[] = [];
	const pressed = new Set(state.pressedKeys);

	// Monitor top (isometric depth shown via offset)
	lines.push(...MONITOR_TOP);

	// Screen content (8 lines for proper CRT aspect)
	for (let i = 0; i < 8; i++) {
		const msg = state.messages[i] || '';
		const cursor = i === state.messages.length - 1 && state.cursorOn ? '█' : '';
		lines.push(SCREEN_LINE(msg + cursor));
	}

	// Monitor bottom with stand
	lines.push(...MONITOR_BOTTOM);
	lines.push(''); // Spacer

	// Keyboard top (isometric depth)
	lines.push(...KEYBOARD_TOP);

	// Row 1 keys (Q-P)
	const row1 = generateKeyRow(KEYBOARD_ROWS[0], pressed, 0);
	lines.push(`              ▐██ ${row1[0]}   ██▌▌`);
	lines.push(`              ▐██ ${row1[1]}   ██▌▌`);
	lines.push(`              ▐██ ${row1[2]}   ██▌▌`);

	// Row 2 keys (A-;)
	const row2 = generateKeyRow(KEYBOARD_ROWS[1], pressed, 10);
	lines.push(`              ▐██  ${row2[0]}  ██▌▌`);
	lines.push(`              ▐██  ${row2[1]}  ██▌▌`);
	lines.push(`              ▐██  ${row2[2]}  ██▌▌`);

	// Spacebar and keyboard bottom
	lines.push(...KEYBOARD_BOTTOM);

	return lines;
}

// Pre-generate all frames
export const LOADING_FRAMES = ANIMATION_STATES.map(generateFrame);
export const FRAME_COUNT = LOADING_FRAMES.length;

// Component
export function LoadingAnimation({ frame }: { frame: number }) {
	const lines = LOADING_FRAMES[frame % FRAME_COUNT];
	return (
		<box flexDirection="column" paddingTop={1}>
			{lines.map((line, i) => (
				<text key={i} fg={theme.accent}>
					{line}
				</text>
			))}
		</box>
	);
}
