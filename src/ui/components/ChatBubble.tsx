import React from 'react';
import chalk from 'chalk';
import { Box, Text } from 'ink';
import { theme } from '../theme';
import type { ChatRole, ChatTurn, ChatMessage } from '../types';
import { wrapLines } from '../utils/text';
import { truncateToWidth, linkifyAnsi } from '../utils/ansi';

function roleLabel(role: ChatRole): string {
	return role === 'you' ? 'You' : role === 'assistant' ? 'Assistant' : role === 'tool' ? 'Tool' : 'System';
}

function roleColor(role: ChatRole): string {
	return role === 'you'
		? theme.accent
		: role === 'assistant'
			? theme.green
			: role === 'tool'
				? theme.magenta
				: theme.muted;
}

export function estimateTurnHeight(turn: ChatTurn, innerWidth: number): number {
	// Approximate Ink box height:
	// - 2 border rows
	// - 1 header row
	// - N wrapped content rows
	// - 1 blank margin row between turns
	const contentLines = wrapLines(turn.text, Math.max(10, innerWidth - 2)).length;
	return 2 + 1 + contentLines + 1;
}

export function ChatTurnBubble(props: { turn: ChatTurn; width: number }): React.ReactElement {
	const border = roleColor(props.turn.role);
	const label = roleLabel(props.turn.role);
	const innerWidth = Math.max(10, props.width - 4);
	const contentLines = wrapLines(props.turn.text, innerWidth).map((l) => truncateToWidth(linkifyAnsi(l), innerWidth));

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box
				borderStyle="round"
				borderColor={border}
				paddingX={1}
				width={props.width}
			>
				<Box flexDirection="column">
					<Text>{chalk.hex(border).bold(label)}</Text>
					{contentLines.map((line, idx) => (
						<Text key={`${props.turn.key}_${idx}`}>{line}</Text>
					))}
				</Box>
			</Box>
		</Box>
	);
}

export function groupChatTurns(messages: ChatMessage[]): ChatTurn[] {
	const turns: ChatTurn[] = [];
	for (const m of messages) {
		const prev = turns[turns.length - 1];
		if (prev && prev.role === m.role) {
			prev.text = `${prev.text}\n${m.text}`;
			continue;
		}
		turns.push({ role: m.role, text: m.text, key: m.id });
	}
	return turns;
}

export function bubbleAnsi(role: ChatRole, text: string, innerWidth: number): string[] {
	const border = roleColor(role);
	const label = roleLabel(role);
	const lines = wrapLines(text, innerWidth).map((l) => truncateToWidth(linkifyAnsi(l), innerWidth));
	return [chalk.hex(border).bold(label), ...lines];
}
