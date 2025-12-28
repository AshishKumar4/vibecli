/** @jsxImportSource @opentui/react */
import { theme } from '../../ui/theme';

interface SeparatorProps {
	width?: number;
	color?: string;
	char?: string;
}

/**
 * A horizontal separator line.
 */
export function Separator({
	width = 50,
	color = theme.muted,
	char = '─',
}: SeparatorProps) {
	return <text fg={color}>{char.repeat(width)}</text>;
}
