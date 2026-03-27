# Agent Teams Reference Guide

> Coordinate multiple Claude Code instances working together as a team, with shared tasks, inter-agent messaging, and centralized management.

**Requires**: Claude Code v2.1.32 or later (`claude --version` to check)

**Status**: Experimental — enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.

---

## Table of Contents

- [Overview](#overview)
- [When to Use Agent Teams](#when-to-use-agent-teams)
- [Agent Teams vs Subagents](#agent-teams-vs-subagents)
- [Enabling Agent Teams](#enabling-agent-teams)
- [Starting a Team](#starting-a-team)
- [Display Modes](#display-modes)
- [Controlling Your Team](#controlling-your-team)
- [Architecture](#architecture)
- [Permissions](#permissions)
- [Context and Communication](#context-and-communication)
- [Token Usage](#token-usage)
- [Hooks for Quality Gates](#hooks-for-quality-gates)
- [Use Case Examples](#use-case-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)

---

## Overview

Agent teams let you coordinate multiple Claude Code instances working together. One session acts as the **team lead**, coordinating work, assigning tasks, and synthesizing results. **Teammates** work independently, each in its own context window, and communicate directly with each other.

Unlike subagents (which run within a single session and can only report back to the main agent), you can also interact with individual teammates directly without going through the lead.

---

## When to Use Agent Teams

Agent teams are most effective for tasks where **parallel exploration adds real value**:

- **Research and review**: multiple teammates investigate different aspects simultaneously, then share and challenge each other's findings
- **New modules or features**: teammates each own a separate piece without stepping on each other
- **Debugging with competing hypotheses**: teammates test different theories in parallel and converge on the answer faster
- **Cross-layer coordination**: changes that span frontend, backend, and tests, each owned by a different teammate

### When NOT to Use Agent Teams

Agent teams add coordination overhead and use significantly more tokens than a single session. They work best when teammates can operate independently. For these scenarios, use a single session or subagents instead:

- Sequential tasks
- Same-file edits
- Work with many dependencies between steps

---

## Agent Teams vs Subagents

|                   | Subagents                                        | Agent Teams                                         |
| :---------------- | :----------------------------------------------- | :-------------------------------------------------- |
| **Context**       | Own context window; results return to the caller | Own context window; fully independent               |
| **Communication** | Report results back to the main agent only       | Teammates message each other directly               |
| **Coordination**  | Main agent manages all work                      | Shared task list with self-coordination             |
| **Best for**      | Focused tasks where only the result matters      | Complex work requiring discussion and collaboration |
| **Token cost**    | Lower: results summarized back to main context   | Higher: each teammate is a separate Claude instance |

**Rule of thumb**: Use subagents when you need quick, focused workers that report back. Use agent teams when teammates need to share findings, challenge each other, and coordinate on their own.

---

## Enabling Agent Teams

Set the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable to `1` in your settings:

```json
// .claude/settings.local.json or .claude/settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Or set it in your shell environment before launching Claude Code.

---

## Starting a Team

Tell Claude to create an agent team and describe the task and team structure in natural language. Claude creates the team, spawns teammates, and coordinates work based on your prompt.

### Example Prompt

```text
I'm designing a CLI tool that helps developers track TODO comments across
their codebase. Create an agent team to explore this from different angles: one
teammate on UX, one on technical architecture, one playing devil's advocate.
```

From there, Claude will:
1. Create a team with a shared task list
2. Spawn teammates for each perspective
3. Have them explore the problem
4. Synthesize findings
5. Clean up the team when finished

### How Teams Get Started

There are two ways:

- **You request a team**: explicitly ask for an agent team. Claude creates one based on your instructions.
- **Claude proposes a team**: if Claude determines your task would benefit from parallel work, it may suggest creating a team. You confirm before it proceeds.

Claude won't create a team without your approval.

---

## Display Modes

Agent teams support two display modes:

### In-Process Mode (Default)

All teammates run inside your main terminal.

- Use **Shift+Down** to cycle through teammates and type to message them directly
- Press **Enter** to view a teammate's session, then **Escape** to interrupt their current turn
- Press **Ctrl+T** to toggle the task list
- After the last teammate, Shift+Down wraps back to the lead
- Works in any terminal, no extra setup required

### Split-Pane Mode

Each teammate gets its own pane.

- See everyone's output at once
- Click into a pane to interact with their session directly
- Requires **tmux** or **iTerm2**

### Configuration

The default is `"auto"` (uses split panes if already running inside tmux, in-process otherwise).

In settings:
```json
{
  "teammateMode": "in-process"
}
```

Per-session flag:
```bash
claude --teammate-mode in-process
```

### Installing Split-Pane Dependencies

- **tmux**: install through your system's package manager. See the [tmux wiki](https://github.com/tmux/tmux/wiki/Installing).
- **iTerm2**: install the [`it2` CLI](https://github.com/mkusaka/it2), then enable the Python API in **iTerm2 > Settings > General > Magic > Enable Python API**.

> **Note**: `tmux` traditionally works best on macOS. Using `tmux -CC` in iTerm2 is the suggested entrypoint.

---

## Controlling Your Team

Tell the lead what you want in natural language. It handles team coordination, task assignment, and delegation.

### Specify Teammates and Models

Claude decides the number of teammates based on your task, or you can be explicit:

```text
Create a team with 4 teammates to refactor these modules in parallel.
Use Sonnet for each teammate.
```

### Require Plan Approval

For complex or risky tasks, require teammates to plan before implementing:

```text
Spawn an architect teammate to refactor the authentication module.
Require plan approval before they make any changes.
```

When a teammate finishes planning:
1. It sends a plan approval request to the lead
2. The lead reviews and either approves or rejects with feedback
3. If rejected, the teammate revises and resubmits
4. Once approved, the teammate exits plan mode and begins implementation

The lead makes approval decisions autonomously. Influence its judgment via your prompt (e.g., "only approve plans that include test coverage").

### Talk to Teammates Directly

Each teammate is a full, independent Claude Code session.

- **In-process mode**: Shift+Down to cycle, then type to send a message
- **Split-pane mode**: click into a teammate's pane

### Task Assignment and Claiming

The shared task list coordinates work. Tasks have three states: **pending**, **in progress**, and **completed**. Tasks can depend on other tasks (blocked until dependencies complete).

- **Lead assigns**: tell the lead which task to give to which teammate
- **Self-claim**: after finishing a task, a teammate picks up the next unassigned, unblocked task

Task claiming uses file locking to prevent race conditions.

### Shutting Down Teammates

```text
Ask the researcher teammate to shut down
```

The lead sends a shutdown request. The teammate can approve (exits gracefully) or reject with an explanation.

### Cleaning Up the Team

```text
Clean up the team
```

This removes shared team resources. The lead checks for active teammates and fails if any are still running — shut them down first.

> **Important**: Always use the lead to clean up. Teammates should not run cleanup because their team context may not resolve correctly, potentially leaving resources in an inconsistent state.

---

## Architecture

An agent team consists of:

| Component     | Role                                                                                       |
| :------------ | :----------------------------------------------------------------------------------------- |
| **Team lead** | The main Claude Code session that creates the team, spawns teammates, and coordinates work |
| **Teammates** | Separate Claude Code instances that each work on assigned tasks                            |
| **Task list** | Shared list of work items that teammates claim and complete                                |
| **Mailbox**   | Messaging system for communication between agents                                          |

### Storage Locations

- **Team config**: `~/.claude/teams/{team-name}/config.json`
- **Task list**: `~/.claude/tasks/{team-name}/`

The team config contains a `members` array with each teammate's name, agent ID, and agent type. Teammates can read this file to discover other team members.

### Task Dependencies

The system manages task dependencies automatically. When a teammate completes a task that other tasks depend on, blocked tasks unblock without manual intervention.

---

## Permissions

Teammates start with the lead's permission settings. If the lead runs with `--dangerously-skip-permissions`, all teammates do too.

After spawning, you can change individual teammate modes, but you **cannot** set per-teammate modes at spawn time.

---

## Context and Communication

Each teammate has its own context window. When spawned, a teammate loads the same project context as a regular session:
- CLAUDE.md files
- MCP servers
- Skills

It also receives the spawn prompt from the lead. **The lead's conversation history does not carry over.**

### How Teammates Share Information

- **Automatic message delivery**: messages are delivered automatically to recipients; the lead doesn't need to poll
- **Idle notifications**: when a teammate finishes and stops, they automatically notify the lead
- **Shared task list**: all agents can see task status and claim available work

### Messaging Types

- **message**: send to one specific teammate
- **broadcast**: send to all teammates simultaneously (use sparingly — costs scale with team size)

---

## Token Usage

Agent teams use **significantly more tokens** than a single session. Each teammate has its own context window, and token usage scales with the number of active teammates.

- For research, review, and new feature work: the extra tokens are usually worthwhile
- For routine tasks: a single session is more cost-effective

---

## Hooks for Quality Gates

Use hooks to enforce rules when teammates finish work or tasks are created/completed:

| Hook | When It Runs | Behavior on Exit Code 2 |
| :--- | :----------- | :---------------------- |
| `TeammateIdle` | When a teammate is about to go idle | Sends feedback, keeps teammate working |
| `TaskCreated` | When a task is being created | Prevents creation, sends feedback |
| `TaskCompleted` | When a task is being marked complete | Prevents completion, sends feedback |

### Example Hook Configuration

```json
{
  "hooks": {
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "your-validation-script-here",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

---

## Use Case Examples

### Parallel Code Review

```text
Create an agent team to review PR #142. Spawn three reviewers:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

Why this works: splitting review criteria into independent domains means security, performance, and test coverage all get thorough attention simultaneously. The lead synthesizes findings after they finish.

### Investigating with Competing Hypotheses

```text
Users report the app exits after one message instead of staying connected.
Spawn 5 agent teammates to investigate different hypotheses. Have them talk to
each other to try to disprove each other's theories, like a scientific
debate. Update the findings doc with whatever consensus emerges.
```

Why this works: sequential investigation suffers from anchoring (once one theory is explored, subsequent investigation is biased). Multiple independent investigators actively trying to disprove each other means the surviving theory is much more likely to be the actual root cause.

---

## Best Practices

### 1. Give Teammates Enough Context

Teammates load project context automatically (CLAUDE.md, MCP servers, skills) but don't inherit the lead's conversation history. Include task-specific details in the spawn prompt:

```text
Spawn a security reviewer teammate with the prompt: "Review the authentication module
at src/auth/ for security vulnerabilities. Focus on token handling, session
management, and input validation. The app uses JWT tokens stored in
httpOnly cookies. Report any issues with severity ratings."
```

### 2. Choose an Appropriate Team Size

- Start with **3-5 teammates** for most workflows
- **5-6 tasks per teammate** keeps everyone productive without excessive context switching
- If you have 15 independent tasks, 3 teammates is a good starting point
- Three focused teammates often outperform five scattered ones
- Scale up only when work genuinely benefits from simultaneous parallel effort

### 3. Size Tasks Appropriately

| Size | Problem |
| :--- | :------ |
| Too small | Coordination overhead exceeds the benefit |
| Too large | Teammates work too long without check-ins, risking wasted effort |
| Just right | Self-contained units that produce a clear deliverable (a function, a test file, a review) |

> The lead breaks work into tasks and assigns them automatically. If it isn't creating enough tasks, ask it to split the work into smaller pieces.

### 4. Wait for Teammates to Finish

Sometimes the lead starts implementing tasks itself. If you notice this:

```text
Wait for your teammates to complete their tasks before proceeding
```

### 5. Start with Research and Review

If you're new to agent teams, start with tasks that have clear boundaries and don't require writing code: reviewing a PR, researching a library, or investigating a bug.

### 6. Avoid File Conflicts

Two teammates editing the same file leads to overwrites. Break the work so each teammate owns a different set of files.

### 7. Monitor and Steer

Check in on teammates' progress, redirect approaches that aren't working, and synthesize findings as they come in. Letting a team run unattended for too long increases the risk of wasted effort.

---

## Troubleshooting

### Teammates Not Appearing

- In in-process mode, they may already be running but not visible — press **Shift+Down** to cycle
- Check that the task was complex enough to warrant a team
- For split panes, verify tmux is installed: `which tmux`
- For iTerm2, verify the `it2` CLI is installed and Python API is enabled

### Too Many Permission Prompts

Pre-approve common operations in your permission settings before spawning teammates to reduce interruptions.

### Teammates Stopping on Errors

Check their output (Shift+Down or click pane), then either:
- Give additional instructions directly
- Spawn a replacement teammate

### Lead Shuts Down Before Work is Done

Tell it to keep going. You can also preemptively say "wait for teammates to finish before proceeding."

### Orphaned tmux Sessions

```bash
tmux ls
tmux kill-session -t <session-name>
```

---

## Known Limitations

- **No session resumption with in-process teammates**: `/resume` and `/rewind` do not restore in-process teammates. After resuming, the lead may try to message teammates that no longer exist. Tell the lead to spawn new teammates.
- **Task status can lag**: teammates sometimes fail to mark tasks completed, blocking dependent tasks. Check and update manually if needed.
- **Shutdown can be slow**: teammates finish their current request/tool call before shutting down.
- **One team per session**: clean up the current team before starting a new one.
- **No nested teams**: teammates cannot spawn their own teams. Only the lead can manage the team.
- **Lead is fixed**: the session that creates the team is the lead for its lifetime. No promotion or transfer.
- **Permissions set at spawn**: all teammates start with the lead's permission mode. Can be changed after spawning, not at spawn time.
- **Split panes require tmux or iTerm2**: not supported in VS Code integrated terminal, Windows Terminal, or Ghostty.

> **CLAUDE.md works normally**: teammates read CLAUDE.md files from their working directory. Use this to provide project-specific guidance to all teammates.

---

## Related Approaches

- **Subagents**: lightweight delegation for research or verification within your session — better for tasks that don't need inter-agent coordination
- **Git worktrees**: run multiple Claude Code sessions manually without automated team coordination
