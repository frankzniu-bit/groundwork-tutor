# Groundwork

A tutor that checks every step. Groundwork runs as a [claude.ai](https://claude.ai) artifact: the tutor is Claude, running on the signed-in viewer's own Claude plan, so there is no API key and no server.

It finds what you already know, maps the ideas your goal depends on, teaches one checked step at a time, and only marks something mastered when the evidence says so.

## How it teaches

- **Diagnose first.** It clarifies your goal and probes what you already know before teaching anything.
- **A skill map you confirm.** It proposes a small prerequisite map. Teaching starts only after you approve it, and an idea can't be taught until the ones under it reach level 3.
- **Teaching matched to the kind of knowledge.** Facts, concepts, procedures, reasoning and perceptual skills each get their own teaching move, question formats and hint limit.
- **Evidence-based mastery, levels 0 to 5.** The page computes your levels from your attempts; Claude never sets them directly.
  - Level 3: one correct check.
  - Level 4: two independent correct answers, with no hints and at least 60% confidence, one of them delayed. Concepts also need a passed trap question, and procedures a correct "why does this step work?".
  - Level 5: an edge case plus explaining it back.
  - Failing a delayed check drops one level.
- **Confidence on every answer.** A confident wrong answer is flagged as a likely misconception and comes back for a retest.
- **Hints and "Just tell me".** Hints step up one rung at a time. "Just tell me" shows the answer but earns no credit.
- **Checked math.** Math answer keys are verified with [math.js](https://mathjs.org) before you see the question; anything that can't be checked that way is labelled "Unverified".

## Run your own copy

You need a Claude account. The page has to be published as an artifact so it can use Claude.

1. Clone this repo.
2. In [Claude Code](https://claude.com/claude-code), open the folder and ask Claude to publish `index.html` as an artifact with `core.js` as a supporting file and the `sample`, `db` and `user` capabilities.
3. Open the artifact's link while signed in, and allow it to use Claude when asked.

Each turn uses your own Claude usage and takes roughly 10 to 60 seconds. Progress saves to a private area of your account that only you can read. Opened outside Claude, the page loads but can't run the tutor, and progress falls back to the browser's local storage.

## Files

| File | What it holds |
| --- | --- |
| `index.html` | The page: home, session view, question cards, skill map and storage. |
| `core.js` | The teaching rules, mastery levels, validation of Claude's replies, the prompt builder and state updates. No DOM; also loads in Node. |
| `core.test.mjs` | Tests for the mastery rules, validators and prompt. |

## Tests

Needs Node 18 or later, with nothing to install:

```bash
node --test core.test.mjs
```
