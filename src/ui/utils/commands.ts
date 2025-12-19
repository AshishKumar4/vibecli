export function parseCommand(line: string): { cmd: string; arg: string } {
	const normalized = line.replaceAll('\r\n', '\n');
	const trimmedStart = normalized.trimStart();
	if (!trimmedStart.startsWith('/')) return { cmd: 'follow', arg: normalized.trim() };
	const trimmed = trimmedStart.trim();
	const [cmd, ...rest] = trimmed.slice(1).split(' ');
	return { cmd: cmd ?? '', arg: rest.join(' ').trim() };
}
