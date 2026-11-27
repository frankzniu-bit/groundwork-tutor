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

## Where the method comes from

### Why not just chat with a model?

Groundwork exists because the evidence says an unguarded AI tutor can make learning worse.

- In a field experiment with about 1,000 high-school math students, an unrestricted ChatGPT-style tutor raised practice scores by 48%. Once the AI was taken away, those students scored 17% worse than students who never had it, and they overestimated how much they had learned. A version with learning guardrails raised practice scores by 127% without the exam loss (Bastani et al., 2025).
- At Harvard, a carefully designed AI physics tutor produced more than double the median learning gains of an already strong active-learning class, in less time (Kestin, Miller et al., 2025). It kept replies short, made students try before seeing answers, explained only after some struggle, and stayed grounded in correct reference solutions.

Every rule in Groundwork is a guardrail against the same failure: the AI doing the learner's thinking.

### Teaching doctrine

The tutoring style comes from two existing approaches:

- **Jane Street's `socratic-tutor` Claude skill** (MIT license). This is where the structure comes from: a diagnostic first, a 0 to 5 skill map, one checked step at a time, honest and dry feedback, and a final assessment.
- **The [LearnHarness](https://github.com/amosblomqvist/learnharness) teaching approach.** The aim is understanding, not recall: the topic should come to feel obviously true, derivable from a few foundations the learner already accepts. Teaching starts from those foundations and motivates each step ("how could I have discovered this?").

Groundwork's main change is moving the parts a model tends to drift on out of the prompt and into code. Claude proposes each turn as structured JSON, and the page checks it before the learner sees it. Mastery levels are computed from the attempt log, so Claude can't hand out a level. Prerequisite gates, hint limits, question formats and math answer keys are all enforced in `core.js`.

### Principles and the research behind them

| Principle | Evidence | How Groundwork applies it |
| --- | --- | --- |
| Retrieval beats re-reading. | Dunlosky et al. (2013) rated practice testing and distributed practice the two highest-utility techniques of the ten they reviewed; highlighting and rereading rated low. Retrieval-practice meta-analyses agree (Rowland, 2014; Adesope et al., 2017). | The core loop is questions, not explanations. Teaching stays short (about 120 words, except worked examples) and is always followed by a check. |
| Generate, don't receive. | The ICAP framework ranks engagement Interactive > Constructive > Active > Passive (Chi & Wylie, 2014). Self-explanation has a meta-analytic effect of g ≈ 0.55 (Bisra et al., 2018). | The learner produces something every turn: a prediction, an answer with reasoning, or an explanation in their own words. |
| Predict before the reveal. | Even unsuccessful attempts to answer before studying improve later learning (the pretesting effect; Kornell, Hays & Bjork, 2009), and a guess reveals the learner's existing model. | Prediction questions come before teaching. They are never graded, and the teaching opens by resolving the learner's guess. |
| Confidence is data; confident errors matter most. | Errors made with high confidence are more likely to be corrected after feedback (the hypercorrection effect; Butterfield & Metcalfe, 2001), but they are also more likely to return a week later (Butler, Fazio & Marsh, 2011). Rating confidence doesn't improve memory by itself (Double, Birney & Walker, 2018), so its value is diagnostic. | Every answer needs a confidence rating. A wrong answer given with 80% confidence or more is flagged as a misconception and comes back for a retest. |
| The method depends on the kind of knowledge, not the subject. | The Knowledge-Learning-Instruction framework: facts, concepts and principles are learned by different processes (Koedinger, Corbett & Perfetti, 2012). Fact quizzes don't build higher-order skill (Agarwal, 2019). | Every node on the map is tagged as a fact, concept, procedure, reasoning skill or perceptual skill. Its teaching move, allowed question formats, hint limit, grading and definition of mastery all switch on that tag. |
| Worked examples for novices, faded as skill grows. | The worked-example effect reverses with expertise: novices on complex material learn more from examples, while stronger learners learn more from solving (Chen, Kalyuga & Sweller, 2015). | Procedures at levels 0 to 2 start with a worked example and a "why does this step work?" question. From level 3, the learner gets problems only. |
| Interleave, but only where it helps. | Interleaved math practice scored 61% against 38% for blocked practice on a test a month later (Rohrer et al., 2020). Interleaving helps confusable categories (g ≈ 0.42) but hurts word-list learning (g ≈ −0.39) (Brunmair & Richter, 2019; see also Kornell & Bjork, 2008). | The tutor is told to mix problem types for concepts and procedures, and to keep new facts in small blocked sets until they reach level 3. |
| Never build on an unverified step. | Mastery learning (Bloom); tutoring meta-analysis (VanLehn, 2011). | An idea can't be taught until the ones under it reach level 3. Level 4 needs a delayed, unhinted, confident success, so understanding has to last past the moment it was taught. |
| Ground math; don't trust model arithmetic. | The Harvard tutor used step-by-step reference solutions to prevent errors. An expert-rated study found ChatGPT essay feedback sometimes affirmed student errors (Steiss et al., 2024). | Math answer keys are recomputed with math.js before the learner sees the question. A wrong key sends the turn back for repair, and a key that can't be checked is labelled "Unverified". |
| Honest, dry feedback. | Feedback works when it's about the task, not praise (Wisniewski, Zierer & Hattie, 2020). | No praise padding. "That's not right" is a normal reply, and progress shows on the map instead. |

**Not built yet:** spaced review scheduled with FSRS (Cepeda et al., 2008, on spacing gaps; FSRS is the scheduler now built into Anki) and a calibration chart comparing confidence with accuracy. The page already saves the attempts, confidence ratings and flagged misconceptions they need.

### Sources

- Adesope, Trevisan & Sundararajan (2017), retrieval practice meta-analysis, *Review of Educational Research*.
- Agarwal (2019), retrieval practice and higher-order learning, *Journal of Educational Psychology*.
- Bastani et al. (2025), *Generative AI without guardrails can harm learning*, PNAS 122(26).
- Bisra, Liu, Nesbit, Salimi & Winne (2018), self-explanation meta-analysis, *Educational Psychology Review*.
- Brunmair & Richter (2019), interleaving meta-analysis, *Psychological Bulletin*.
- Butler, Fazio & Marsh (2011), *The hypercorrection effect persists over a week, but high-confidence errors return*.
- Butterfield & Metcalfe (2001), the hypercorrection effect.
- Cepeda et al. (2008), optimal spacing gaps.
- Chen, Kalyuga & Sweller (2015), worked examples versus generation by element interactivity.
- Chi & Wylie (2014), *The ICAP Framework*, *Educational Psychologist* 49(4).
- Double, Birney & Walker (2018), reactivity of judgments of learning.
- Dunlosky, Rawson, Marsh, Nathan & Willingham (2013), *Improving Students' Learning With Effective Learning Techniques*, *Psychological Science in the Public Interest*.
- Kestin, Miller et al. (2025), *AI tutoring outperforms in-class active learning*, *Scientific Reports* 15:17458.
- Koedinger, Corbett & Perfetti (2012), *The Knowledge-Learning-Instruction framework*, *Cognitive Science*.
- Kornell & Bjork (2008), interleaving and inductive learning, *Psychological Science*.
- Kornell, Hays & Bjork (2009), *Unsuccessful retrieval attempts enhance subsequent learning*, *Journal of Experimental Psychology: Learning, Memory, and Cognition*.
- Rittle-Johnson, Schneider & Star (2015), conceptual and procedural knowledge in math.
- Rohrer, Dedrick, Hartwig & Cheung (2020), *A randomized controlled trial of interleaved mathematics practice*, *Journal of Educational Psychology* 112(1).
- Rowland (2014), testing effect meta-analysis, *Psychological Bulletin*.
- Steiss et al. (2024), ChatGPT versus expert feedback on student essays.
- VanLehn (2011), tutoring meta-analysis, *Educational Psychologist*.
- Wisniewski, Zierer & Hattie (2020), feedback meta-analysis, *Frontiers in Psychology*.

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

## License

MIT. See [LICENSE](LICENSE).
