# v0.1.1 Direction

Updated: 2026-03-14

## Product Position

MemphisOS should stay a sovereignty-first control plane for agent workflows.

That means MemphisOS core focuses on:

- policy and approval gates
- audit trails and deterministic operational evidence
- secrets brokering
- managed-app planning and execution
- local-first workspace scaffolding and context sync

## What Stays Out Of Core

These belong in downstream integrations, not `main`:

- vendor-specific agent runtimes such as OpenClaw, Claude Code, or Codex CLI
- memory backends such as mem0, Qdrant, or Vertex Memory Bank
- browser-specific integrations such as Chrome DevTools MCP
- full swarm/research-graph frameworks
- chain anchoring or ZKP-heavy workflows as default operator paths

## Why

The surrounding ecosystem is moving toward:

- multi-agent supervision
- persistent project memory files
- browser-connected agent tools
- managed integrations instead of single monoliths

MemphisOS is strongest when it supplies the control layer around those systems, not when it tries to replace all of them.

## v0.1.1 Core Slice

The next useful slice is deliberately small:

1. `workspace init`
   - scaffold a shared workspace with `.memphis/context.json`, `AGENTS.md`, `CLAUDE.md`, and core directories
2. `context sync`
   - project the Memphis workspace context into common agent context files without rewriting unrelated local notes
3. managed-app capability metadata
   - label manifests with capabilities such as `workspace`, `memory`, `browser`, `mcp`, `secrets`, and `service`

## Immediate Follow-On Work

After this slice, the next decisions should stay narrow:

1. add capability-aware app discovery and doctor output
2. add a generic MCP-managed-app pattern for browser and memory integrations
3. keep concrete integrations downstream and upstream only reusable framework improvements
