import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.vibesdk');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface VibeConfig {
	recentAgentIds: string[];
	apiKey?: string;
	baseUrl?: string;
}

const DEFAULT_CONFIG: VibeConfig = {
	recentAgentIds: [],
};

export const DEFAULT_BASE_URL = 'https://build.cloudflare.dev';

export function getApiKey(): string | undefined {
	return process.env.VIBESDK_API_KEY ?? loadConfig().apiKey;
}

export function getBaseUrl(): string {
	return process.env.VIBESDK_BASE_URL ?? loadConfig().baseUrl ?? DEFAULT_BASE_URL;
}

export function saveCredentials(apiKey: string, baseUrl: string): void {
	saveConfig({ apiKey, baseUrl });
}

export function hasCredentials(): boolean {
	return !!getApiKey();
}

export function loadConfig(): VibeConfig {
	try {
		if (!existsSync(CONFIG_FILE)) {
			return DEFAULT_CONFIG;
		}
		const data = readFileSync(CONFIG_FILE, 'utf-8');
		return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
	} catch {
		return DEFAULT_CONFIG;
	}
}

export function saveConfig(config: Partial<VibeConfig>): void {
	try {
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		const existing = loadConfig();
		const merged = { ...existing, ...config };
		writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
	} catch {
		// Silently fail - config persistence is best-effort
	}
}

export function addRecentAgentId(agentId: string): string[] {
	const config = loadConfig();
	const ids = config.recentAgentIds.filter((id) => id !== agentId);
	const updated = [agentId, ...ids].slice(0, 10);
	saveConfig({ recentAgentIds: updated });
	return updated;
}

export function getRecentAgentIds(): string[] {
	return loadConfig().recentAgentIds;
}
