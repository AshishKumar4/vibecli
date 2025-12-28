import { theme } from '../../ui/theme';
import type { ChatRole } from '../../ui/types';

export type RoleStyle = {
	bg: string;
	border: string;
	fg: string;
	label: string;
};

export const ROLE_STYLES: Record<ChatRole, RoleStyle> = {
	you: {
		bg: theme.userBubbleBg,
		border: theme.accent,
		fg: theme.accent,
		label: '▸ You',
	},
	assistant: {
		bg: theme.assistantBubbleBg,
		border: theme.green,
		fg: theme.green,
		label: '◂ Assistant',
	},
	system: {
		bg: theme.systemBubbleBg,
		border: theme.borderInactive,
		fg: theme.muted,
		label: '◆ System',
	},
	tool: {
		bg: theme.toolBubbleBg,
		border: theme.magenta,
		fg: theme.magenta,
		label: '⚙ Tool',
	},
} as const;
