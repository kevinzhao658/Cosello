# Cosello — Claude Code Project Instructions

## Project Overview

Cosello is a trust-first hyperlocal C2C secondhand marketplace, initially targeting Manhattan. The long-term vision extends beyond goods exchange to broader community functions.

**Core product thesis:** Community identity is a trust signal — shared community memberships between buyers and sellers surface dynamically as visual indicators. Communities are NOT market containers; they are identity and trust layers overlaid on listings.

**Initial GTM focus:** Clothing (transaction frequency, trust-building). Furniture is the logical second category. Cars are deferred due to regulatory complexity.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Frontend | React 18, Vite 6, TypeScript, Tailwind CSS v4, Radix UI |
| Backend | Python 3.14, FastAPI, Uvicorn, SQLAlchemy (SQLite) |
| Auth | PyJWT (phone-based OTP), no SMS provider yet |
| AI | Anthropic SDK (Claude Vision API for listing generation) |
| Image Processing | Pillow (server-side resize/compression) |
| Storage | Local disk (`backend/uploads/`), SQLite (via SQLAlchemy) |

Flag uncertainty about stack decisions rather than assume. Do not suggest technologies that conflict with this stack without flagging the trade-off explicitly.

### Planned API Integrations (Backlog — not yet implemented)

| API | Purpose |
|---|---|
| Stripe Connect | Payments (escrow model, virtual wallets) |
| Photoroom | Server-side image enhancement for listings |
| Twilio | Phone-based user authentication |
| Google | Location tracking and address verification |

**Do not write any code that depends on these integrations until explicitly instructed.** When designing features that will eventually touch them, note the dependency and stub accordingly.

---

## Key Product Features (MVP)

### Community Trust Signal
- Shared community memberships between buyer and seller surface as visual "trust tags" on listings
- Communities are identity signals, not containers — listings are not scoped to communities
- No comparable mechanic exists in current competitors (Depop, Facebook Marketplace, Poshmark)

### Local Pickup
- First-class feature, trust-enabled
- Uncontested by major competitors
- Treat as a core trust and UX primitive, not an afterthought

### AI-Assisted Bulk Photo Separation
- Seller batch-uploads photos → AI segments into discrete item clusters → auto-populates separate draft listings
- This feature is genuinely novel in the market — treat it as a differentiator, not a commodity feature
- Photoroom API will handle image enhancement once integrated (backlog — not yet implemented)

### Photo Display Pattern (target state for when Photoroom is integrated)
- Enhanced (Photoroom) photo = primary browse image
- Original seller photo = shown in listing detail view as authenticity/trust signal
- Both must always be shown — do not collapse them into one

---

## Competitor Context

- **Depop** — no bulk photo separation, no local pickup as a trust-enabled feature
- **Facebook Marketplace** — no bulk photo separation, community trust mechanic absent
- **Poshmark** — same gaps
- Do not recommend features that simply replicate these platforms. Push for differentiation.

---

## Branching Strategy

```
main        → always stable and deployable
dev         → integration branch; features merge here first
feature/xxx → one branch per feature, cut from dev
```

- Always cut feature branches from `dev`, never from `main`
- Agents should always confirm which branch they are working on before making changes
- Do not merge directly into `main` without explicit user instruction

---

## Coworkers Agent Team

This project uses a named agent team called **Coworkers** with five roles defined in `.claude/agents/`:

| Agent | Role |
|---|---|
| `tech-lead` | Orchestration, end-to-end impact analysis, task delegation |
| `frontend-dev` | React / Next.js / TypeScript UI implementation |
| `backend-dev` | Python / Node.js / Express API and data layer |
| `qa-tester` | Validation, regression checks, QA reporting |
| `project-scribe` | CLAUDE.md maintenance — user-invoked only |

### Orchestration Rules

**All new feature requests must go to the tech-lead first — no exceptions.**

The tech-lead must produce a **Pre-Implementation Brief** before any agent begins work. The brief must include:

1. Plain-language description of the feature
2. Every downstream function impacted (UI, API, DB, state, notifications, wallet, dashboard, etc.)
3. Front-end vs. back-end task breakdown with file-level scope where possible
4. Order of operations — what must be sequential vs. what can be parallelized
5. QA handoff criteria

**The tech-lead presents the brief to the user and waits for explicit greenlight before spawning any teammates.**

**The project-scribe is never spawned by the tech-lead or any other agent.** It is only invoked directly by the user to update CLAUDE.md. It operates independently of the feature development workflow.

### Task Routing

**Parallel dispatch** — all conditions must be met:
- Tasks are in independent domains (UI vs. API)
- No shared file overlap
- Clear file boundaries

**Sequential dispatch** — any condition triggers:
- Frontend depends on a backend API contract not yet finalized
- Shared config, schema, or migration changes involved
- Scope is unclear — tech-lead must clarify before dispatching

**QA always runs last** — after both frontend-dev and backend-dev confirm task completion.

### Communication Protocol
- All teammates send completion summaries to tech-lead
- frontend-dev and backend-dev communicate directly if API contracts need negotiation
- qa-tester sends QA report to tech-lead
- tech-lead synthesizes and presents final summary to user

---

## Sub-Agent Routing Rules (CLAUDE.md Global)

```
Parallel dispatch (ALL conditions met):
- 3+ unrelated tasks or independent domains
- No shared state between tasks
- Clear file boundaries with no overlap

Sequential dispatch (ANY condition triggers):
- Tasks have dependencies (B needs output from A)
- Shared files or state (merge conflict risk)
- Unclear scope (need to understand before proceeding)
```

---

## Code Conventions

- **TypeScript:** Never use `any`. All types must be explicit.
- **API responses:** Handle loading, error, and empty states on every client-side call — never assume success.
- **Backlog APIs:** Do not write implementation code for Stripe, Photoroom, Twilio, or Google integrations until explicitly instructed. Design with those integrations in mind but stub dependencies cleanly.
- **Component structure:** Keep components single-responsibility. If a component is doing too much, flag it before proceeding.

---

## What NOT To Do

- Do not use `any` in TypeScript
- Do not merge feature branches directly into `main`
- Do not begin implementation before the tech-lead Pre-Implementation Brief is greenlighted by the user
- Do not collapse the enhanced and original listing photos into one — both must always be shown
- Do not treat communities as market containers or scope listings to them
- Do not recommend features that replicate competitors without a differentiation angle
- Do not expose API keys or credentials in frontend code or shared config files
- Do not make broad multi-file changes without first mapping downstream impacts

---

## References

- **GitHub:** https://github.com/kevinzhao658/Cosello.git
  - Repo is public — fetch specific files or README when broader project context is needed
  - For code review tasks, paste `git log` or `git diff` output directly into the session for precise history

- **Notion:** Accessible via Notion MCP integration (do not use a static shared link)
  - Business Requirements Document (BRD) — canonical product spec
  - Product Discovery / Key Decisions Log — decision rationale and rejected alternatives
  - Always fetch current Notion content before making any updates to avoid duplicates

---


## Patents & IP (Awareness Only)

Two features are under consideration for provisional patent filing:
1. Community trust signal mechanic (dynamic visual identity tags)
2. Bulk photo separation into parallel listings

Do not publicly describe the implementation details of these features in generated documentation, comments, or README files without flagging it first.