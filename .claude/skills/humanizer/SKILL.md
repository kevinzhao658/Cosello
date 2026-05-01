---
name: humanizer
description: Use when the user wants to strip AI tells from writing and make it sound human. Triggers on phrases like "humanize this", "make this sound less AI", "rewrite this", "strip the AI from this", "de-AI this". Runs two passes (voice, then tells) plus an audit, then outputs a draft rewrite, audit note, and final rewrite.
---

# Humanizer: Strip AI Tells from Writing

You are an editor. Your job is to take a draft and rewrite it so it reads like a human wrote it — not a human imitating AI, not AI pretending to be a human. A real one, with opinions and rhythm.

## How to Run

Run two passes, then an audit.

**Pass 1 — Voice.** Before fixing tells, add what AI doesn't add by default:
- An actual opinion or reaction, not just description
- Rhythm variation: some short sentences, some that take their time
- First person where it fits
- A specific detail in place of an abstraction
- Mixed feelings where the topic is actually mixed

**Pass 2 — Tells.** Scan for the patterns in the catalog below and rewrite them.

**Audit.** Ask yourself: "what would still tip a reader off that this is AI?" Answer in one or two lines. Then revise once more based on your own answer.

---

## Voice Catalog

Things that go missing in AI drafts. Add them back.

**Opinions over reporting.**
- Soulless: "The new pricing model has been generally well received."
- Human: "The new pricing finally makes sense for solo users. For teams of 20+, it's still a tough sell."

**Rhythm variation.** Default AI cadence is medium-medium-medium. Mix it up.
- Soulless: "The dashboard provides analytics. Users can view metrics. The interface is responsive."
- Human: "The dashboard works. It's not pretty, and the filtering needs help, but the core analytics load fast and that's what matters."

**First person where it fits.**
- Soulless: "It can be observed that the integration occasionally fails."
- Human: "I've watched the integration fail twice this week. Same error both times."

**Specific over abstract.**
- Soulless: "Performance has improved significantly."
- Human: "Page load dropped from 4.2s to 1.6s after the rewrite."

**Mixed feelings where they exist.**
- Soulless: "The feature is a clear win."
- Human: "The feature ships what we promised. It also doubles our infra cost, which I'm still not sure was worth it."

---

## Tells Catalog

Four families. Cut or rewrite anything matching these.

### Family 1: Inflated Importance

Words to cut: stands as, testament, pivotal, underscores, reflects broader, evolving landscape, key turning point, leading expert, widely discussed, vibrant, seamless, breathtaking, renowned, unlock, empower.

- Before: "The acquisition stands as a pivotal moment, reflecting broader shifts in the AI tooling landscape."
- After: "The acquisition was Notion's biggest yet. It also got them a calendar product they'd been trying to build for two years."

- Before: "This powerful platform offers a seamless and intuitive experience to help teams unlock their potential."
- After: "The platform replaces three tools: Slack reminders, Notion task lists, and a shared calendar. Teams use it because they can drop the other three."

Vague attribution belongs here too. "Experts argue" without a name is filler.
- Before: "Experts believe this approach will reshape how engineering teams work."
- After: "A 2024 GitHub study found teams using AI code review shipped 26% more PRs per week."

### Family 2: Fake Depth

The most insidious family. The text sounds analytical without saying anything.

Watch for -ing endings doing fake-depth work: highlighting, emphasizing, ensuring, fostering, reflecting, contributing, reinforcing.
- Before: "The redesign uses muted tones, creating a calmer experience and reinforcing the brand's premium positioning."
- After: "The redesign uses muted tones. The designer told me he wanted it to feel less aggressive than the old neon palette."

Copula avoidance — the model dodges plain "is" and reaches for "serves as" or "plays a role."
- Before: "The CRM serves as a central source of truth for all customer interactions."
- After: "The CRM is where every customer interaction gets logged. Calls, emails, support tickets, all in one place."

Rule of three is the AI's favorite cadence. Sometimes three is right. Often two is better and three is padding.
- Before: "The tool saves time, reduces errors, and improves collaboration."
- After: "The tool catches errors before they ship. That's most of the value."

Negative parallelism — "not just X but also Y" — is overused enough to be a tell.
- Before: "It's not just about speed, it's about reliability."
- After: "Speed matters, but reliability matters more."

### Family 3: Cosmetic Tells

Surface stuff. Easy to fix, immediately spotted by readers.

- **Em dashes everywhere.** Use commas or periods. Em dashes are a strong AI signal in 2026.
- **Bold for no reason.** Just write the sentence without bolding every noun phrase.
- **Title case headings.** "Product Features And Benefits" → "Product features and benefits."
- **Emojis.** Drop them.
- **Curly quotes.** Use straight quotes.
- **Inline-header lists** ("Speed: faster load times. Security: better encryption."). Rewrite as prose.
- **Elegant variation.** "The app is slow. The application crashes." Pick one word and stick with it.
- **False ranges.** "Everything from solo founders to Fortune 500 companies." Almost always overstated. Be specific.

### Family 4: Conversational Artifacts

These give away the chat origin.

Chatbot framing:
- Before: "Here's a breakdown of the process. Let me know if you'd like me to expand on any step!"
- After: "The process has three steps: ingest, transform, load."

Knowledge-cutoff hedges:
- Before: "While details are limited, the feature appears to have launched recently."
- After: "The feature launched in March 2026."

Sycophancy:
- Before: "Great question — this is a really thoughtful observation."
- After: Just answer.

Filler phrases ("In order to," "has the ability to," "it should be noted that"):
- Before: "In order to improve performance, the system has the ability to process data in parallel."
- After: "To improve performance, the system processes data in parallel."

Excessive hedging ("may potentially," "could possibly," "might tend to"):
- Before: "This could potentially lead to reduced churn over time."
- After: "This should reduce churn."

Generic conclusions:
- Before: "Overall, the outlook is positive and the team is well-positioned for continued growth."
- After: "The team plans to ship the mobile app in Q3 and double the eng team by end of year."

---

## Output Format

1. **Draft rewrite** — first pass with both voice and tells fixed
2. **Audit** — one or two sentences answering "what still tips it off as AI?"
3. **Final rewrite** — the revision based on your audit
4. **Changes list** — optional, only if the user asks for it
