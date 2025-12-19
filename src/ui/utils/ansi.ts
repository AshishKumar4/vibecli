import chalk from 'chalk';
import stringWidth from 'string-width';
import { theme } from '../theme';

export function osc8Link(url: string, text: string): string {
	// Terminal hyperlink (supported by iTerm2, Kitty, WezTerm, many others)
	return `\u001b]8;;${url}\u0007${text}\u001b]8;;\u0007`;
}

export function linkifyAnsi(text: string): string {
	const urlRe = /(https?:\/\/[^\s)\]}>,]+)/g;
	return text.replace(urlRe, (m) => osc8Link(m, chalk.hex(theme.cyan).underline(m)));
}

export function stripAnsi(input: string): string {
	// Strip SGR/CSI sequences.
	let out = input.replace(/\u001b\[[0-9;]*m/g, '');
	// Strip OSC8 hyperlinks.
	out = out.replace(/\u001b\]8;;[^\u0007]*\u0007/g, '');
	out = out.replace(/\u001b\]8;;\u0007/g, '');
	return out;
}

export function visibleLength(input: string): number {
	return stringWidth(stripAnsi(input));
}

export function truncateToWidth(input: string, width: number): string {
	if (visibleLength(input) <= width) return input;
	const plain = stripAnsi(input);
	let out = '';
	for (const ch of plain) {
		if (stringWidth(out + ch) > Math.max(0, width - 1)) break;
		out += ch;
	}
	return `${out}…`;
}
