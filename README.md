# LLM Space 4

![LLM Space 4](./docs/images/screenshot-01.png)

**LLM Space** v4 is a desktop tool made for people who build agents. Try out new agent ideas, watch what your agent does step by step, debug it, and measure how well it works — all in one app.

The first version of LLM Space was born in March 2023, and this is its fourth major version.

LLM Space is a side project of our honored open source project [DeerFlow](https://github.com/bytedance/deer-flow). And every version of DeerFlow is built with LLM Space.

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project layout](#project-layout)
- [Install](#install)
- [Run the app](#run-the-app)
- [User guide](#user-guide)
- [Contributing](#contributing)
- [Sponsors](#sponsors)
- [Donate](#donate)
- [License](#license)

## Features

- **Build** — write and version your prompts, system messages, tools, and model settings.
- **Trace** — see every model call and tool run inside the agent loop as it happens.
- **Debug** — replay a run from history and step through it to find what went wrong.
- **Evaluate** — measure how your agent performs across runs.
- **Manage** — keep your threads organized as files on your own machine.

Your files and API keys stay on your local computer. LLM Space collects a small amount of anonymous usage data to improve the app - see [TELEMETRY.md](./TELEMETRY.md) for exactly what is collected and how to opt out.

## Tech stack

- **Language & tooling** — TypeScript, built and managed with [Bun](https://bun.com).
- **Desktop shell** — [Electrobun](https://electrobun.dev), a lightweight way to ship a native app.
- **UI** — React with Tailwind CSS and shadcn/ui.
- **Agent framework** — [Pi Agent Core](https://github.com/earendil-works/pi), a lightweight agent framework for building agents.

## Project layout

LLM Space is a Bun monorepo:

```
packages/
  core/       # Shared logic: types, the agent loop, thread storage
apps/
  desktop/    # The desktop app (Electrobun shell + React UI)
```

## Install

You need [Bun](https://bun.com) first. Bun is a fast, all-in-one runtime and package manager for JavaScript — think of it as a drop-in replacement for Node.js and npm. Follow the [official install guide](https://bun.com/docs/installation).

Once Bun is ready, install the project from the repo root:

```bash
bun install
```

## Run the app

Start the desktop app for local development:

```bash
bun dev
```

Build a canary release:

```bash
bun run build:canary
```

## User guide

The full user manual lives here:

**[LLM Space User Guide →](https://my.feishu.cn/wiki/QnGGwGkoti8nwok2cEOc2oMvnrd)**

## Contributing

For now, we only merge pull requests from the [DeerFlow](https://github.com/bytedance/deer-flow) core team members.

Everyone else is very welcome to help by [opening an issue](https://github.com/llm-space/llm-space/issues) — bug reports, ideas, and feedback all make the project better.

## Sponsors

LLM Space is free and open source, and it stays that way thanks to our sponsors. We are proud and grateful to be backed by them.

### 🏆 Platinum sponsor

<p align="center">
  <a href="https://superdesign.dev" target="_blank" rel="noopener">
    <img src="./docs/images/sponsor-superdesign.svg" alt="Superdesign - AI product design agent that turns prompts into designs on an infinite canvas (Platinum Sponsor)" width="600" />
  </a>
</p>

<p align="center">
  <strong><a href="https://superdesign.dev">Superdesign</a></strong> is an AI product design agent that turns natural-language prompts into UI mockups, components, and full designs on an infinite canvas. Thank you for making LLM Space possible. 💜
</p>

Want to see your logo here? We would love to talk - [reach out by opening an issue](https://github.com/llm-space/llm-space/issues) or [support the project](#donate).

## Donate

If LLM Space is useful to you and you would like to support its development, you can donate here:

**[Support LLM Space →](https://my.feishu.cn/wiki/OvLBwVuSkiCR1ik5wGEcBXZfnye)**

Thank you.

## License

LLM Space is released under the [MIT License](LICENSE).
