/// <reference types="bun-types" />

import { $ } from 'bun';
import { readFileSync } from 'node:fs';

const ROOT_DIR = new URL('..', import.meta.url).pathname;

const pkg = JSON.parse(readFileSync(`${ROOT_DIR}package.json`, 'utf-8'));
const VERSION = pkg.version;

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

async function main() {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');

	console.log(`\n${cyan('vibecli')} v${VERSION}\n`);

	// Build
	console.log(`${cyan('▶')} Building...`);
	await $`bun run build`.cwd(ROOT_DIR);
	console.log(`${green('✓')} Built\n`);

	// Publish
	if (dryRun) {
		console.log(`${yellow('▶')} Dry run - showing package contents:`);
		await $`npm pack --dry-run`.cwd(ROOT_DIR);
	} else {
		console.log(`${cyan('▶')} Publishing to npm...`);
		await $`npm publish --access public`.cwd(ROOT_DIR);
		console.log(`\n${green('✓')} Published ${pkg.name}@${VERSION}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
