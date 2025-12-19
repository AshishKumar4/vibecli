import React from 'react';
import { Text } from 'ink';
import { clamp } from '../utils/text';

export function renderComposer(text: string, cursor: number): React.ReactNode {
	const safeCursor = clamp(cursor, 0, text.length);
	const before = text.slice(0, safeCursor);
	const at = text.slice(safeCursor, safeCursor + 1);
	const after = text.slice(safeCursor + 1);
	return (
		<Text>
			{before}
			<Text inverse>{at.length ? at : ' '}</Text>
			{after}
		</Text>
	);
}
