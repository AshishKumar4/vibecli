import React from 'react';
import { render } from 'ink';

import { App } from './ui/app';

export async function main(): Promise<void> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		process.stderr.write('vibesdk: interactive TTY required\n');
		process.exit(1);
	}

	// Fullscreen TUI: alternate screen + black background.
	process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H\x1b[?25l\x1b[40m');
	process.on('exit', () => {
		process.stdout.write('\x1b[0m\x1b[?25h\x1b[?1049l');
	});

	const enableInput = true;
	render(React.createElement(App, { enableInput }), {
		stdin: process.stdin,
		stdout: process.stdout,
		exitOnCtrlC: true,
	});
}

if (import.meta.main) {
	void main();
}
