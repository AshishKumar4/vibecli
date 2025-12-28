import { startOpenTUI } from './opentui';

export async function main(): Promise<void> {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		process.stderr.write('vibesdk: interactive TTY required\n');
		process.exit(1);
	}

	await startOpenTUI();
}

if (import.meta.main) {
	void main();
}
