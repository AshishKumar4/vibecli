/** @jsxImportSource @opentui/react */
import { theme } from '../../ui/theme';

interface Tab {
	id: string;
	label: string;
}

interface TabBarProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (id: string) => void;
	suffix?: string;
}

/**
 * A horizontal tab bar with active state indication.
 */
export function TabBar({ tabs, activeTab, onTabChange, suffix }: TabBarProps) {
	return (
		<box flexDirection="row" marginBottom={1}>
			{tabs.map((tab, idx) => (
				<>
					{idx > 0 && <text fg={theme.muted}> │ </text>}
					<text
						key={tab.id}
						fg={activeTab === tab.id ? theme.accent : theme.muted}
						onMouseDown={() => onTabChange(tab.id)}
					>
						{activeTab === tab.id ? '◆' : '○'} {tab.label}
					</text>
				</>
			))}
			{suffix && <text fg={theme.muted}>{suffix}</text>}
		</box>
	);
}
