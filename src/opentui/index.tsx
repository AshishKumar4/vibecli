/** @jsxImportSource @opentui/react */
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { App } from './app';

export async function startOpenTUI() {
	const renderer = await createCliRenderer();
	createRoot(renderer).render(<App />);
}
