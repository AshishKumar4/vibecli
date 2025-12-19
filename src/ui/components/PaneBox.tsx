import React from 'react';
import chalk from 'chalk';
import { Box, Text } from 'ink';
import { theme } from '../theme';

export type PaneBoxProps = {
	title: string;
	focused: boolean;
	children: React.ReactNode;
	width?: number | string;
	height?: number | string;
	flexGrow?: number;
};

export function PaneBox(props: PaneBoxProps): React.ReactNode {
	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor={props.focused ? theme.accent : theme.muted}
			paddingX={1}
			width={props.width}
			height={props.height}
			flexGrow={props.flexGrow}
		>
			<Text>
				{props.focused
					? chalk.hex(theme.accent).bold(props.title)
					: chalk.hex(theme.muted)(props.title)}
			</Text>
			<Box flexDirection="column" flexGrow={1}>
				{props.children}
			</Box>
		</Box>
	);
}
