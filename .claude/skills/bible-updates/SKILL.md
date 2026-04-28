---
name: bible-updates
description: Use when the user wants to add, update, or clean up an entry in the KevCon Bible Notion page. Triggers on phrases like "add to the KevCon bible", "update the KevCon bible", "write this up for the bible", "document X in the bible", "put this in my bible". Enforces the strict entry template — H2 heading, ALL CAPS numbered steps, double-quoted commands, EX: sub-bullets, optional Note: and variant labels (max 3) — and rejects drafts that violate the slot rules before writing to Notion.
---

# KevCon Bible Updates

The KevCon Bible is a personal reference doc of procedures, commands, and how-tos. Every entry must follow the strict template below so the page stays scannable.

## KevCon Bible Page
- Title: "KevCon Bible"
- ID: `2ffdb3ed-4155-807e-a5b4-f5dbc709189f`
- Read with: `notion-fetch`
- Write with: `notion-update-page`

## Workflow (every invocation)

1. Fetch the current Bible with `notion-fetch` ID `2ffdb3ed-4155-807e-a5b4-f5dbc709189f`
2. Determine: NEW entry or UPDATE to an existing one
3. Draft the entry following the Strict Entry Template below
4. Self-check against the Slot Rules and Anti-Patterns — fix any violations before showing it
5. Show the draft to the user (for updates, show a before/after diff)
6. Wait for explicit approval ("yes", "approved", "proceed", or equivalent)
7. Write via `notion-update-page`
8. Confirm the result back to the user

## Strict Entry Template

~~~markdown
## How to <action phrase, sentence case>

1. <STEP TITLE IN ALL CAPS>: "<command>"
    - EX: <concrete example>
2. <STEP TITLE IN ALL CAPS>: "<command>" (<inline parenthetical WHY — short, plain prose>)
    - EX: <concrete example>
3. <STEP TITLE IN ALL CAPS>: "<command containing \<placeholder\>>"
    - EX: <concrete example>
    - Note: <gotcha in one sentence — em-dash separates cause from clarification>
...
N. <STEP TITLE IN ALL CAPS>
    - <span underline="true">VARIANT A</span>: "<command>"
        - EX: <concrete example>
    - <span underline="true">VARIANT B</span>: "<command>"
        - EX: <concrete example>
    - <span underline="true">VARIANT C</span>: "<command>"
        - EX: <concrete example>
~~~

## Heading Variants
- **Action:** `How to <verb phrase>` — "How to create a new feature branch off of dev"
- **Question:** `How can I <question>?` — "How can I enable mouse navigation between tmux panes?"
- **Topic:** noun phrase — "GitHub Basics", "Branch Hygiene"

## Slot Rules (reject drafts that violate any of these)

| Slot | Required | Rule |
|---|---|---|
| `## How to <…>` | Yes | H2. Sentence case. Starts with `How to`, `How can I`, or a topic noun phrase. No trailing punctuation except `?` on literal questions. |
| Step count | Yes, **max 10** | Prefer fewer steps when clarity permits. If a procedure needs more than 10 steps, split into multiple entries. Rule of thumb: each terminal command gets its own step, but collapse related commands with `&&` to stay under the cap. |
| Step title | Yes | ALL CAPS, followed by `:` when a command follows. Omit colon if the step has only sub-bullets. |
| Command | Yes when step = one command | Double-quoted `"…"`. Placeholders use escaped angles `\<placeholder\>`. |
| Inline WHY | Optional | Parenthetical right after the command, same line, plain prose, ≤15 words. |
| `EX:` sub-bullet | **Required only when the command contains a dynamic value** (placeholder, user-specific path, user-chosen name). Omit when the command is fully concrete — repeating it adds noise. |
| `Note:` sub-bullet | Optional | Indented once. Single sentence, em-dash separates cause from clarification. Gotchas only. |
| Variant label | Optional, max 3 per step | `<span underline="true">LABEL</span>: "<command>"`. Split into separate steps if > 3. |

## Form C — Schema-only entry

When the entry's sole purpose is to communicate a schema, syntax, or config shape, skip the numbered procedure. Show the schema as a code block with inline comments, then add 1–3 `- Note:` bullets for critical gotchas.

~~~markdown
## <Topic>

*<One-sentence context>*

**<Schema name>:**

~~~<language>
<schema with inline comments explaining each field>
~~~

- Note: <critical gotcha 1>
- Note: <critical gotcha 2>
~~~

Use Form C when the reader only needs to understand *what goes where* — not to follow a sequence of actions.

## Anti-Patterns (auto-reject)
- Step titles not in ALL CAPS
- Unquoted commands outside `EX:` lines
- Inline parenthetical > ~15 words
- Mixed bullets + numbered steps in one entry
- Empty steps
- Procedure exceeding 10 steps (split the entry)
- More than 3 variant labels under a single step
- `EX:` on a command with no dynamic value (adds noise)
- Missing `EX:` when the command contains a dynamic value
- `Note:` used for alternatives (use variant labels instead)
- Bold/italic/links inside step titles
- Emojis
- Code fences on single commands (commands stay inline; code fences allowed only for schema blocks in Form C)

## Minimal valid entry
~~~markdown
## How to <action>

1. <STEP TITLE>: "<command>"
    - EX: <concrete example>
~~~

## Reference — real example from the Bible (revised to match template)
~~~markdown
## How to create a new feature branch off of dev

1. SWITCH TO DEV: "git checkout dev"
    - EX: git checkout dev
2. PULL LATEST CHANGES: "git pull origin dev" (ensure local dev is up to date before branching off it)
    - EX: git pull origin dev
3. CREATE AND SWITCH TO NEW BRANCH: "git checkout -b feature/\<new-branch-name\>"
    - EX: git checkout -b feature/user-authentication
    - Note: use -b, not -m — -b creates a new branch, -m renames an existing one
4. PUSH BRANCH TO REMOTE GIT
    - <span underline="true">NEW REMOTE BRANCH</span>: "git push -u origin \<insert name of branch\>"
        - EX: git push -u origin feature/user-authentication
~~~
