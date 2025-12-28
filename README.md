# vibecli

An unofficial CLI for [Cloudflare VibeSDK](https://github.com/cloudflare/vibesdk) — the vibe coding platform that for building full stack apps, that you can use to build your own vibe coding platform!

Built with [@cf-vibesdk/sdk](https://www.npmjs.com/package/@cf-vibesdk/sdk).

## Installation

```bash
npm install -g @cf-vibesdk/cli
```

Or download standalone binaries from [Releases](https://github.com/AshishKumar4/vibecli/releases).

## Usage

```bash
vibecli
```

This launches an interactive terminal UI where you can:

- Describe your app idea in natural language
- Watch as AI generates your fullstack application
- Preview your app in real-time
- Deploy to Cloudflare with a single command

## Requirements

- [Bun](https://bun.sh) runtime (for development)
- Cloudflare account (for deployment)

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for distribution
bun run build

# Type check
bun run typecheck
```

## Links

- [Cloudflare VibeSDK](https://github.com/cloudflare/vibesdk) — The official vibe coding platform
- [VibeSDK SDK](https://www.npmjs.com/package/@cf-vibesdk/sdk) — The SDK this CLI is built on

## License

MIT
