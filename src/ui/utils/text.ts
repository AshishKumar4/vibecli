export function wrapLines(text: string, width: number): string[] {
	const words = text.replaceAll('\r\n', '\n').split(/(\s+)/);
	const lines: string[] = [];
	let current = '';

	for (const w of words) {
		if (w === '') continue;
		// Hard newline
		if (w.includes('\n')) {
			const parts = w.split('\n');
			for (let i = 0; i < parts.length; i += 1) {
				const part = parts[i] ?? '';
				if (part) {
					if ((current + part).length > width && current.length) {
						lines.push(current);
						current = '';
					}
					current += part;
				}
				if (i < parts.length - 1) {
					lines.push(current);
					current = '';
				}
			}
			continue;
		}

		if (current.length + w.length > width && current.trim().length) {
			lines.push(current);
			current = '';
		}
		current += w;
	}
	if (current.length) lines.push(current);
	return lines.map((l) => l.trimEnd());
}

export function countNewlines(s: string): number {
	let count = 0;
	for (let i = 0; i < s.length; i += 1) {
		if (s[i] === '\n') count += 1;
	}
	return count;
}

export function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

export function nowId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function fuzzyScore(needle: string, haystack: string): number | null {
	const n = needle.toLowerCase();
	const h = haystack.toLowerCase();
	if (!n) return 0;

	const idx = h.indexOf(n);
	if (idx >= 0) return 10_000 - idx * 10 - h.length;

	let score = 0;
	let j = 0;
	let lastMatch = -1;
	for (let i = 0; i < h.length && j < n.length; i += 1) {
		if (h[i] !== n[j]) continue;
		const gap = lastMatch === -1 ? i : i - lastMatch - 1;
		score += 100 - gap;
		lastMatch = i;
		j += 1;
	}
	if (j !== n.length) return null;
	return score - h.length;
}
