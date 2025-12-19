import { isRecord, blueprintToMarkdown, BlueprintStreamParser, type Blueprint } from '@cf-vibesdk/sdk';
import type { OutlineEntry } from '../types';

export { isRecord, blueprintToMarkdown, BlueprintStreamParser };
export type { Blueprint };

export function parseMarkdownOutline(md: string): OutlineEntry[] {
	const lines = md.split('\n');
	const entries: OutlineEntry[] = [];
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? '';
		const m = /^(#{1,6})\s+(.*)$/.exec(line);
		if (!m) continue;
		const level = m[1]!.length;
		const title = m[2]!.trim();
		if (!title) continue;
		entries.push({ level, title, line: i });
	}
	return entries;
}
