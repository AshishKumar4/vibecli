import type { FileEntry } from '../types';

type Node = {
	kind: 'dir' | 'file';
	name: string;
	path: string;
	children: Map<string, Node>;
};

export function buildFileEntries(paths: string[], expanded: Set<string>): FileEntry[] {
	const root: Node = { kind: 'dir', name: '', path: '', children: new Map() };

	for (const p of paths) {
		const parts = p.split('/').filter(Boolean);
		let curr = root;
		let currPath = '';
		for (let i = 0; i < parts.length; i += 1) {
			const part = parts[i]!;
			const isLast = i === parts.length - 1;
			currPath = currPath ? `${currPath}/${part}` : part;

			if (isLast) {
				if (!curr.children.has(part)) {
					curr.children.set(part, { kind: 'file', name: part, path: p, children: new Map() });
				}
				continue;
			}

			let next = curr.children.get(part);
			if (!next) {
				next = { kind: 'dir', name: part, path: currPath, children: new Map() };
				curr.children.set(part, next);
			}
			curr = next;
		}
	}

	const entries: FileEntry[] = [];
	function walk(node: Node, depth: number): void {
		const children = Array.from(node.children.values()).sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const child of children) {
			entries.push({ kind: child.kind, name: child.name, path: child.path, depth });
			if (child.kind === 'dir' && expanded.has(child.path)) walk(child, depth + 1);
		}
	}
	walk(root, 0);
	return entries;
}
