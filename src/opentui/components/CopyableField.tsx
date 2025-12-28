/** @jsxImportSource @opentui/react */
import { theme } from '../../ui/theme';

interface CopyableFieldProps {
	label: string;
	value: string;
	iconColor?: string;
	valueColor?: string;
	copied: boolean;
	onCopy: () => void;
	truncateLength?: number;
	showOpenAction?: boolean;
	onOpen?: () => void;
}

/**
 * A reusable component for displaying copyable text with visual feedback.
 * Shows "✓ copied!" when copied, otherwise shows the truncated value with a [copy] button.
 */
export function CopyableField({
	label,
	value,
	iconColor = theme.muted,
	valueColor = theme.cyan,
	copied,
	onCopy,
	truncateLength = 30,
	showOpenAction = false,
	onOpen,
}: CopyableFieldProps) {
	const displayValue = copied
		? '✓ copied!'
		: value.length > truncateLength
			? value.slice(0, truncateLength)
			: value;

	return (
		<box flexDirection="row">
			<text onMouseDown={onCopy}>
				<span fg={iconColor}>{label}</span>
				<span fg={copied ? theme.green : valueColor}>{displayValue}</span>
				{!copied && <span fg={theme.cyan}> [copy]</span>}
			</text>
			{showOpenAction && onOpen && (
				<text fg={theme.yellow} onMouseDown={onOpen}>
					{' '}[open]
				</text>
			)}
		</box>
	);
}
