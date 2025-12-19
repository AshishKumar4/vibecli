/// <reference types="bun-types" />

import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';

const outFile = new URL('../dist/cli.js', import.meta.url).pathname;

await mkdir(dirname(outFile), { recursive: true });

const result = await Bun.build({
	entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
	outdir: dirname(outFile),
	target: 'bun',
	packages: 'external',
	minify: false,
});

if (!result.success) {
	for (const log of result.logs) {
		// eslint-disable-next-line no-console
		console.error(log);
	}
	process.exit(1);
}

// Bun.build writes `index.js` by default for a single entrypoint.
const builtPath = new URL('../dist/index.js', import.meta.url).pathname;
const js = await readFile(builtPath, 'utf8');

const shebang = '#!/usr/bin/env bun\n';
const final = js.startsWith('#!') ? js : shebang + js;

await writeFile(outFile, final, 'utf8');
await chmod(outFile, 0o755);
