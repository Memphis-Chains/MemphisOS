import { describe, expect, it } from 'vitest';

import { runCli } from '../helpers/cli.js';

describe('CLI completion', () => {
  it('prints bash completion script', async () => {
    const out = await runCli(['completion', 'bash']);
    expect(out).toContain('complete -F _memphis_completions memphis');
    expect(out).toContain('setup configure init workspace context');
    expect(out).toContain('--provider');
    expect(out).toContain('decentralized-llm');
    expect(out).toContain('insight insights connections');
    expect(out).toContain('insight|insights) flag_candidates="--weekly --input --query --save --json"');
    expect(out).toContain('workspace) COMPREPLY=( $(compgen -W "init sync" -- "${cur}") ); return 0 ;;');
    expect(out).toContain('context) COMPREPLY=( $(compgen -W "sync" -- "${cur}") ); return 0 ;;');
  });

  it('prints zsh completion script', async () => {
    const out = await runCli(['completion', 'zsh']);
    expect(out).toContain('#compdef memphis');
    expect(out).toContain('bashcompinit');
  });

  it('prints fish completion script', async () => {
    const out = await runCli(['completion', 'fish']);
    expect(out).toContain('complete -c $c -f -n "__fish_use_subcommand"');
    expect(out).toContain('completion" -a "bash zsh fish');
    expect(out).toContain('__fish_seen_subcommand_from workspace" -a "init sync"');
    expect(out).toContain('__fish_seen_subcommand_from context" -a "sync"');
  });
});
