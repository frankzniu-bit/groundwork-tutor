// Groundwork core: pedagogy data, mastery rules, turn validation and prompt
// building. Pure functions, no DOM, so they run in the page and under Node tests.
(function (root) {
  "use strict";

  const KNOWLEDGE_TYPES = ["fact", "concept", "procedure", "reasoning", "perceptual_fluency"];
  const QUESTION_TYPES = ["multiple_choice", "free_response", "prediction", "teach_back"];
  const CHECK_KINDS = [
    "clarify", "probe", "check", "recall", "discrimination", "composition", "trap",
    "strategy_choice", "error_finding", "edge_case", "teach_back", "why",
  ];
  const VERDICTS = ["correct", "partial", "wrong", "dont_know"];
  const MISS_TYPES = ["cue_miss", "discrimination", "execution_slip", "careless", "misconception", "missing_background"];
  const PHASES = ["clarify", "probe", "plan", "teach", "practice", "final", "done"];
  const SUBJECT_MODES = ["math", "science", "history", "writing", "literature", "language"];

  // §1A switchboard, as data the app enforces and the prompt quotes.
  const PEDAGOGY = {
    fact: {
      move: "Pretest guess, then the answer plus one line of meaning or connection, then straight into retrieval. No Socratic chains; at most 'why would this make sense?' or breaking a word into roots.",
      formats: ["free_response", "multiple_choice", "prediction"],
      interleave: "Off while learning; keep new items in small blocked sets. After level 3, mix only confusable_with pairs.",
      hints: "One cue (first letter, related word, root), then the answer.",
      maxRung: 1,
      grading: "Normalized match; accept synonyms and small typos.",
      mastery4: "Recalled correctly in a later session, unprompted.",
      mastery5: "Recalled after weeks; both directions for vocabulary.",
    },
    concept: {
      move: "Predict (with confidence), resolve the prediction, show evidence or a counterexample, name and refute the misconception, then the learner re-explains and applies it to a new case.",
      formats: ["multiple_choice", "free_response", "prediction", "teach_back"],
      interleave: "On across confusable_with concepts.",
      hints: "Ask for a prediction, then a contrasting case, then name the misconception, then explain.",
      maxRung: 4,
      grading: "Check the reasoning against the expected explanation and the misconception list.",
      mastery4: "Resisted the tagged misconception on a trap item after a delay.",
      mastery5: "Applied in an unfamiliar context after a delay, plus a teach-back.",
    },
    procedure: {
      move: "Levels 0-2: worked example with a self-explanation prompt, a matched problem, then faded examples. Level 3+: independent problems only.",
      formats: ["free_response", "multiple_choice", "prediction", "teach_back"],
      interleave: "Off for the first 3-5 problems of a new skill, then on across similar-looking problem types that need different strategies.",
      hints: "Flag which step is off, name the principle, give a specific hint, then work the step and give a fresh parallel problem.",
      maxRung: 5,
      grading: "Check each step against the code-verified reference answer.",
      mastery4: "Solved independently and answered 'why does this step work?' (check_kind why).",
      mastery5: "Chose the right strategy in mixed practice and handled an edge case.",
    },
    reasoning: {
      move: "Authentic open question, push for evidence and warrant, voice a counter-position, learner rebuts. Writing: plan, draft, feedback, required revision.",
      formats: ["free_response", "prediction", "teach_back"],
      interleave: "On across eras or texts.",
      hints: "Point at unused evidence, then a sentence frame ('Although ___, ___ because ___'), then a model paragraph on a DIFFERENT prompt. Never write the learner's paragraph.",
      maxRung: 3,
      grading: "Analytic rubric: claim, evidence, warrant, counterargument, organization. Facts and quotes are right or wrong; interpretation is graded on support. verdict correct means at target level.",
      mastery4: "Hit the target rubric level on a new prompt.",
      mastery5: "Target level on a new prompt with no scaffolds, plus a teach-back of the method.",
    },
    perceptual_fluency: {
      move: "Short drills with instant right/wrong, or uninterrupted fluency tasks with errors listed afterward. No Socratic questioning.",
      formats: ["free_response", "multiple_choice"],
      interleave: "Off.",
      hints: "Slow down or restate, then the answer.",
      maxRung: 1,
      grading: "Right or wrong.",
      mastery4: "Accurate at normal speed.",
      mastery5: "Accurate in free production.",
    },
  };

  const MODE_RULES = {
    math: "Show steps; give step-level feedback. Every computed answer carries math_checks. Alternate 2-3 procedural reps with one 'why' probe. After one method is known, offer a comparison of two methods. No timers.",
    science: "Introduce concepts with predict, observe, explain plus confidence. In physics, ask for a sketch or free-body description before equations. Concrete scenario, then diagram, then symbols. Every science node gets misconception trap items.",
    history: "For a primary source, treat sourcing, contextualization, corroboration and close reading as separate reasoning skills. When a reading question fails, check for missing background knowledge first.",
    writing: "Show the rubric, learner plans with a template (thesis, reasons, evidence, counterargument, rebuttal), drafts, scores themselves first, then you score with quoted evidence and set 1-2 goals; a revision is required, then re-score. Never claim your feedback equals a teacher's.",
    literature: "Authentic questions with no single answer; build each follow-up from the learner's own words; require textual evidence; voice an alternative reading as a challenge, not a correction.",
    language: "Vocabulary is fact nodes in small blocked sets, both directions as separate items. Grammar: short explicit rule with examples, controlled practice, then free use. For a taught form, give one prompt to self-correct before giving the form; correct untaught forms directly. During fluency tasks don't interrupt; list errors at the end.",
  };

  // ---------- mastery (levels are derived, never stored) ----------

  const LEVEL_NAMES = ["unaware", "heard of it", "can follow along", "can do with help", "can do independently", "can teach it"];

  function evidenceLevel(node, ev) {
    const real = ev.filter((a) => !a.isPrediction);
    if (!real.length) return 0;
    let L = 1;
    if (real.some((a) => a.verdict === "correct" || a.verdict === "partial" || a.told)) L = 2;
    const credit = real.filter((a) => a.verdict === "correct" && !a.told);
    if (!credit.length) return L;
    L = 3;
    const indep = credit.filter((a) => a.hints === 0 && a.confidence >= 60 && !a.afterReveal);
    const kt = node.knowledge_type;
    const delayedOk = kt === "fact" ? indep.some((a) => a.delayed && a.crossSession) : indep.some((a) => a.delayed);
    const typeOk4 =
      kt === "concept" ? indep.some((a) => a.checkKind === "trap")
      : kt === "procedure" ? credit.some((a) => a.checkKind === "why")
      : true;
    if (!(indep.length >= 2 && delayedOk && typeOk4)) return L;
    L = 4;
    const edge = indep.some((a) => a.checkKind === "edge_case" || (kt === "procedure" && a.checkKind === "strategy_choice"));
    const teach = credit.some((a) => a.checkKind === "teach_back" && !a.afterReveal);
    if (edge && teach) L = 5;
    return L;
  }

  // Walks the node's attempts in order. A failed delayed check at level 3+
  // drops one level, and only evidence after that lapse can raise it again.
  function nodeLevel(node, attempts) {
    const A = attempts.filter((a) => a.nodeId === node.id).sort((x, y) => x.turn - y.turn || x.at - y.at);
    let L = node.exposed ? 1 : 0;
    let since = 0;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (a.isPrediction) { L = Math.max(L, 1); continue; }
      const failed = a.verdict !== "correct" && !a.told;
      if (failed && a.delayed && L >= 3) { L -= 1; since = i + 1; continue; }
      L = Math.max(L, evidenceLevel(node, A.slice(since, i + 1)));
    }
    return L;
  }

  function levels(course) {
    const out = {};
    for (const n of course.nodes || []) out[n.id] = nodeLevel(n, course.attempts || []);
    return out;
  }

  function prereqsOf(course, id) {
    return (course.edges || []).filter(([, to]) => to === id).map(([from]) => from);
  }

  function canStart(course, id, lv) {
    lv = lv || levels(course);
    return prereqsOf(course, id).every((p) => (lv[p] ?? 0) >= 3);
  }

  function masteryPct(course, lv) {
    const nodes = course.nodes || [];
    if (!nodes.length) return 0;
    lv = lv || levels(course);
    const target = course.targetLevel || 4;
    const sum = nodes.reduce((s, n) => s + Math.min(lv[n.id] ?? 0, target), 0);
    return Math.round((100 * sum) / (target * nodes.length));
  }

  function allAtTarget(course, lv) {
    lv = lv || levels(course);
    const target = course.targetLevel || 4;
    return (course.nodes || []).length > 0 && course.nodes.every((n) => (lv[n.id] ?? 0) >= target);
  }

  // Builds the attempt record for an answer to the pending question.
  function makeAttempt(course, pending, sub, grade, ctx) {
    const node = (course.nodes || []).find((n) => n.id === pending.node_id);
    const turn = course.turn;
    const lastTaught = node?.lastTaughtTurn;
    const taughtSession = node?.lastTaughtSession;
    const delayed = lastTaught != null && (taughtSession !== ctx.sessionId || turn - lastTaught >= 8);
    const afterReveal =
      (lastTaught != null && taughtSession === ctx.sessionId && turn - lastTaught <= 2) ||
      (node?.lastRevealTurn != null && turn - node.lastRevealTurn <= 2);
    const told = sub.action === "just_tell_me";
    return {
      questionId: pending.id,
      nodeId: pending.node_id || null,
      checkKind: pending.check_kind,
      isPrediction: !!pending.is_prediction || pending.type === "prediction",
      verdict: told ? "wrong" : sub.action === "dont_know" ? "dont_know" : grade?.verdict || "wrong",
      missType: grade?.miss_type || null,
      confidence: sub.action === "dont_know" || told ? 0 : Number(sub.confidence) || 0,
      hints: pending.hintRung || 0,
      told,
      delayed,
      crossSession: lastTaught != null && taughtSession !== ctx.sessionId,
      afterReveal: !!afterReveal,
      turn,
      sessionId: ctx.sessionId,
      ms: sub.ms || null,
      at: ctx.now,
    };
  }

  // ---------- validation of a tutor turn ----------

  function words(s) { return String(s || "").trim().split(/\s+/).filter(Boolean).length; }

  function validatePlan(plan) {
    const errs = [];
    if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length < 1) return ["plan.nodes must be a non-empty array"];
    if (plan.nodes.length > 24) errs.push("plan has more than 24 nodes; keep the map minimal");
    const ids = new Set();
    for (const n of plan.nodes) {
      if (!n.id || !/^[a-z0-9_-]{1,40}$/.test(n.id)) errs.push(`node id "${n.id}" must be lowercase letters, digits, _ or -`);
      if (ids.has(n.id)) errs.push(`duplicate node id "${n.id}"`);
      ids.add(n.id);
      if (!KNOWLEDGE_TYPES.includes(n.knowledge_type)) errs.push(`node ${n.id}: knowledge_type must be one of ${KNOWLEDGE_TYPES.join(", ")}`);
      if (!["foundation", "step", "goal"].includes(n.kind)) errs.push(`node ${n.id}: kind must be foundation, step or goal`);
      if (n.knowledge_type === "concept" && !(Array.isArray(n.misconceptions) && n.misconceptions.length)) {
        errs.push(`node ${n.id}: concept nodes need at least one misconception`);
      }
    }
    for (const n of plan.nodes) for (const c of n.confusable_with || []) if (!ids.has(c)) errs.push(`node ${n.id}: confusable_with "${c}" is not a node`);
    const edges = plan.edges || [];
    for (const e of edges) {
      if (!Array.isArray(e) || e.length !== 2 || !ids.has(e[0]) || !ids.has(e[1])) errs.push(`edge ${JSON.stringify(e)} must be [prereq_id, dependent_id] of existing nodes`);
    }
    if (hasCycle([...ids], edges)) errs.push("edges contain a cycle");
    return errs;
  }

  function hasCycle(ids, edges) {
    const out = Object.fromEntries(ids.map((i) => [i, []]));
    for (const [a, b] of edges) if (out[a]) out[a].push(b);
    const state = {};
    const visit = (n) => {
      if (state[n] === 1) return true;
      if (state[n] === 2) return false;
      state[n] = 1;
      for (const m of out[n] || []) if (visit(m)) return true;
      state[n] = 2;
      return false;
    };
    return ids.some((i) => visit(i));
  }

  // evaluate: (expr) => number, e.g. math.evaluate. Absent: checks are skipped.
  function runMathChecks(checks, evaluate) {
    if (!Array.isArray(checks) || !checks.length) return { status: "none", failures: [] };
    if (typeof evaluate !== "function") return { status: "unavailable", failures: [] };
    const failures = [];
    for (const c of checks) {
      let got;
      try { got = Number(evaluate(String(c.expr))); } catch (e) { failures.push(`${c.expr}: could not evaluate (${e.message})`); continue; }
      const want = Number(c.expect);
      if (!Number.isFinite(got) || !Number.isFinite(want)) { failures.push(`${c.expr}: not a finite number`); continue; }
      const tol = c.tolerance != null ? Number(c.tolerance) : 1e-9 * Math.max(1, Math.abs(want));
      if (Math.abs(got - want) > tol) failures.push(`${c.expr} evaluates to ${got}, not ${want}`);
    }
    return { status: failures.length ? "failed" : "passed", failures };
  }

  function validateQuestion(q, course, lv, ctx) {
    const errs = [];
    if (!QUESTION_TYPES.includes(q.type)) errs.push(`question.type must be one of ${QUESTION_TYPES.join(", ")}`);
    if (!String(q.prompt || "").trim()) errs.push("question.prompt is empty");
    if (!CHECK_KINDS.includes(q.check_kind)) errs.push(`question.check_kind must be one of ${CHECK_KINDS.join(", ")}`);
    const node = q.node_id ? (course.nodes || []).find((n) => n.id === q.node_id) : null;
    const planned = (course.nodes || []).length > 0;
    if (q.node_id && !node && planned) errs.push(`question.node_id "${q.node_id}" is not on the map`);
    if (planned && !q.node_id && !["clarify", "probe"].includes(q.check_kind)) errs.push("questions after the plan need a node_id");
    if (node) {
      const p = PEDAGOGY[node.knowledge_type];
      if (p && !p.formats.includes(q.type)) errs.push(`${q.type} is not allowed for ${node.knowledge_type} node ${node.id}; allowed: ${p.formats.join(", ")}`);
      if (!["probe", "clarify"].includes(q.check_kind) && !canStart(course, node.id, lv)) {
        errs.push(`node ${node.id} can't be taught yet: its prerequisites (${prereqsOf(course, node.id).join(", ")}) are below level 3`);
      }
    }
    if (q.type === "multiple_choice") {
      const opts = q.options;
      if (!Array.isArray(opts) || opts.length < 3 || opts.length > 5) errs.push("multiple_choice needs 3-5 options");
      else {
        const lens = opts.map((o) => String(o).length);
        if (Math.max(...lens) > 1.5 * Math.min(...lens)) errs.push("multiple_choice options differ too much in length (longest must be at most 1.5x the shortest)");
        const k = Number(q.answer_key);
        if (!Number.isInteger(k) || k < 0 || k >= opts.length) errs.push("multiple_choice answer_key must be the 0-based index of the correct option");
      }
    } else if (q.answer_key == null || String(q.answer_key).trim() === "") {
      if (!["clarify"].includes(q.check_kind)) errs.push("question.answer_key is required (the expected answer or explanation key)");
    }
    const math = runMathChecks(q.math_checks, ctx.evaluate);
    if (math.status === "failed") errs.push(`math_checks failed: ${math.failures.join("; ")}. Fix the problem or its reference answer.`);
    return { errs, math };
  }

  function validateTurn(out, course, ctx) {
    const errs = [];
    const warnings = [];
    if (!out || typeof out !== "object" || Array.isArray(out)) return { errs: ["reply must be one JSON object"], warnings, math: null };
    const lv = levels(course);
    if (out.say != null && typeof out.say !== "string") errs.push("say must be a string");
    if (words(out.say) > 220) warnings.push("long");
    const pending = course.pending;
    const sub = ctx.submission;
    const graded = pending && sub && ["answer", "dont_know", "just_tell_me"].includes(sub.action);
    if (graded && sub.action === "answer" && !pending.is_prediction && pending.check_kind !== "clarify") {
      if (!out.grade || !VERDICTS.includes(out.grade.verdict)) errs.push(`grade.verdict is required (one of ${VERDICTS.join(", ")}) for the learner's answer`);
      if (out.grade?.miss_type && !MISS_TYPES.includes(out.grade.miss_type)) errs.push(`grade.miss_type must be one of ${MISS_TYPES.join(", ")}`);
    }
    if (out.hint) {
      if (!(pending && sub?.action === "hint")) errs.push("hint is only for a hint request");
      else {
        const want = (pending.hintRung || 0) + 1;
        if (Number(out.hint.rung) !== want) errs.push(`hint.rung must be exactly ${want}`);
      }
    } else if (sub?.action === "hint" && pending) {
      errs.push("the learner asked for a hint: return hint {rung, text}");
    }
    if (out.hint && out.question) errs.push("a hint keeps the current question pending; return no new question");
    if (pending && ["harder", "easier"].includes(sub?.action) && !out.question) errs.push(`the learner asked for ${sub.action}: return a replacement question`);
    if (out.plan) {
      for (const e of validatePlan(out.plan)) errs.push(`plan: ${e}`);
      if (out.question) errs.push("when proposing a plan, ask no question; wait for confirmation");
    }
    let math = null;
    if (out.question) {
      const planned = { ...course, nodes: course.nodes || [] };
      const v = validateQuestion(out.question, planned, lv, ctx);
      errs.push(...v.errs);
      math = v.math;
    }
    if (out.phase != null && !PHASES.includes(out.phase)) errs.push(`phase must be one of ${PHASES.join(", ")}`);
    for (const f of out.flag_misconceptions || []) if (!f?.description) errs.push("flag_misconceptions entries need a description");
    if (out.taught_node && !(course.nodes || []).some((n) => n.id === out.taught_node)) errs.push(`taught_node "${out.taught_node}" is not on the map`);
    if (!out.question && !out.plan && !out.hint && !String(out.say || "").trim()) errs.push("reply has no say, question, hint or plan");
    return { errs, warnings, math };
  }

  // ---------- prompt ----------

  const RULES = `You are the tutor inside Groundwork, a learning app. Your job is to install genuine understanding of a topic, the kind where it feels obviously true and derivable from a few foundations the learner already accepts, not memorized recall. You handle all logistics (what to learn, in what order, checking facts) so the learner's effort goes into the material.

You never write progress in prose. The app keeps all state and enforces the mastery rules; you supply honest evidence through the JSON fields below. Each call you see the course state, recent conversation and the learner's latest submission; you remember nothing else.

## Every question
- Ask exactly ONE question per turn in the "question" field. Put no hints, examples or teaching after it.
- The learner replies with an answer, a confidence (0-100%), and optionally their thinking. Read the thinking closely. A right answer on a confused model is a warning; a wrong answer with sound reasoning is progress.
- Multiple choice: options of similar length and detail (the app rejects any set where the longest is over 1.5x the shortest). Make each wrong option the one a person with a specific wrong model would pick.
- Read confidence against the verdict: correct + high: move on. Correct + low: fragile; one reinforcing check later. Wrong + high: a committed misconception, the most valuable signal: add it to flag_misconceptions, probe how far it reaches, re-teach around it. Wrong + low: small correction. "I don't know": a real gap, not an error.

## Match the method to the knowledge type
Every node has a knowledge_type; the course state lists the rules for the types in play. Follow them.
- fact: guess, tell, retrieve. No Socratic chains on things that can't be reasoned out. One cue as a hint, then the answer.
- concept: predict, resolve, counterexample, name and refute the misconception, apply to a new case. Use trap items (check_kind "trap") built from the tagged misconceptions.
- procedure: for a novice, show a worked example and ask why a step works (check_kind "why") before asking them to solve; fade the example. Later, mix problem types and ask them to name the strategy before solving.
- reasoning: no single right answer. Grade on a rubric (evidence, warrant, counterargument); verdict "correct" means at target. Voice the counter-position as a challenge. Never write the learner's paragraph; give 1-2 prioritized fixes quoting their words, then require a revision.
- perceptual_fluency: quick drills, immediate feedback; during fluency tasks list errors at the end.
If a node is complex and the learner is at level 1 or below on it or its prerequisites, explain first, then ask. Never question someone about what they couldn't possibly infer.
Feedback is elaborated: what's wrong, why (name the misconception), what to do next. Check factual claims inside the learner's answers; never affirm an error to be encouraging.
When a learner fails a reading or history question, check for missing background knowledge before assuming a skill gap.
When you open a new node, say what it connects to and how it differs ("this is like X, except...").

## Phase: clarify
If the topic is vague, ask until it's concrete. If the learner doesn't know the terrain, the goal starts with orientation. Ask whether there's a test or deadline. Return "goal" once it is concrete and move to "probe". Teach nothing yet.

## Phase: probe
Work out the strands the goal depends on. For each, binary-search for a floor (reliably right) and a ceiling (wrong or unknown). Start near the top; let misses walk you down. Never re-ask what an answer already showed. 3-6 questions (check_kind "probe") is usually enough. Record each strand in probe_results. Teach nothing.

## Phase: plan (think hardest here)
Build the minimal prerequisite graph from what the learner already holds to the goal: re-teach nothing they hold, teach nothing off-path. Tag every node with its knowledge_type, list likely misconceptions for concept nodes, mark confusable_with pairs. Split nodes that mix types (the facts of an event vs. weighing its causes). For reading-heavy goals include the background-knowledge nodes the texts assume. Roots must be unconditional truths for THIS learner. Find the motivated path: why would anyone reach for each next step? If unsure of a fact, say so. Return "plan" with a 1-3 sentence rationale and ask no question; the learner confirms or adjusts. If teaching later reveals a missing foundation or an already-held branch, return a revised "plan" (same ids for unchanged nodes).

## Phase: teach, one step at a time
Cycle, one question per turn: prediction question, learner predicts, short teaching that opens by resolving their prediction (what they said, what's true, why), check question, grade, next.
- One step = one idea small enough to land at once. Keep teaching to a few sentences (under about 120 words, except a worked example). Motivate every step.
- Levels 0-2: you may show a short worked example, then ask why one step works. Level 3+: problems, not worked examples.
- Set "taught_node" only on a turn whose say explains NEW content of that node (not mere feedback). The app uses it to tell immediate checks from delayed ones.
- Checks must require reasoning from the session, prefer applying the idea to a new case, and must never be answerable by parroting your last sentence.
- When they're wrong on a concept, procedure or reasoning node: don't give the answer. Ask a narrower question that exposes the contradiction, or point at the first place their reasoning breaks. Explain directly only after 2-3 failed attempts, then re-check from a different angle.
- When they're right, sometimes push back ("are you sure? what about X?").
- Every few nodes, slip in an unannounced check on an earlier node. Only teach a node whose prerequisites are at level 3+ (the app rejects others).
- After a node's check passes, add 1-3 review_items: propositions (ideas, not frozen questions).
- Never build on an unverified step. Never cover missed ground in one long explanation.
- When the state says summary_due, return a fresh "summary" of the whole session so far (under 200 words).

## Phase: practice
Make the ideas come to mind unprompted in situations unlike the lesson. Per node: recall, then discrimination (near-twin situations where one feature decides), then composition. Interleave where the knowledge_type allows. Aim for ~85% success. Never announce which idea a problem targets. Before posing a problem, solve it yourself and look for shortcuts that skip the target idea.

## Phase: final
Mixed and interleaved: at least one question per node plus one integrative problem composing several nodes. Then summarize the weakest areas and set phase "done".

## Learner actions
- "hint": give exactly the next rung in "hint" (rung = current + 1). Ladder for problems: 0 re-read a given, 1 name the pattern class, 2 name the candidate ideas, 3 name the idea, 4 outline the move, 5 work the step. Keep the question pending: return no new question.
- "just_tell_me": answer that one question directly and clearly in say, then ask the next question. Don't lecture about it.
- "harder"/"easier": replace the pending question with one a notch harder or easier.
- "dont_know": a gap; teach the missing piece briefly, then re-check differently.
- "message": free text from the learner (often plan adjustments); respond to it.

## Math and science
Any question whose answer is computed must include math_checks: expressions a calculator can evaluate (mathjs syntax, numbers only, no variables) with the expected value, e.g. {"expr": "(3*4+2)/7", "expect": 2}. The app runs them before showing the question and rejects the question if one fails. If the answer can't be checked numerically, omit math_checks; the app labels the question unverified.

## Voice
- No praise, enthusiasm or performed reactions. Progress is acknowledged by moving on.
- No agreement bias. "That's not right" and "that's a misconception" are ordinary sentences.
- Dry, clear, brief. Write math in plain text or Unicode (x², √, ≤), not LaTeX.
- Accuracy is non-negotiable. If you're not sure, say "I'm not fully certain of this" before building on it.`;

  const OUTPUT_FORMAT = `## Reply format
Reply with ONLY one JSON object, no prose around it. Omit fields you don't use (or set them to null).
{
  "say": "markdown shown to the learner: feedback, teaching, or a short line before the question",
  "phase": "clarify|probe|plan|teach|practice|final|done (only when changing phase)",
  "goal": {"goal": "concrete goal", "subject_modes": ["math"], "exam_date": "YYYY-MM-DD or null"},
  "probe_results": [{"strand": "...", "floor": "...", "ceiling": "...", "misconceptions": ["..."]}],
  "plan": {"rationale": "1-3 sentences", "nodes": [{"id": "snake_id", "title": "short title", "claim": "the one-line truth or claim", "kind": "foundation|step|goal", "knowledge_type": "fact|concept|procedure|reasoning|perceptual_fluency", "secondary_type": null, "misconceptions": ["..."], "confusable_with": ["other_id"]}], "edges": [["prereq_id", "dependent_id"]]},
  "grade": {"verdict": "correct|partial|wrong|dont_know", "miss_type": "cue_miss|discrimination|execution_slip|careless|misconception|missing_background", "misconception": "the wrong model, if any"},
  "flag_misconceptions": [{"node_id": "id", "description": "the wrong model"}],
  "taught_node": "node id or null",
  "hint": {"rung": 1, "text": "..."},
  "review_items": [{"node_id": "id", "proposition": "the idea to retrieve later"}],
  "summary": "only when summary_due",
  "question": {"type": "multiple_choice|free_response|prediction|teach_back", "node_id": "id or null before the plan", "prompt": "markdown", "options": ["only for multiple_choice"], "answer_key": "index for multiple_choice, else the expected answer or explanation key", "check_kind": "clarify|probe|check|recall|discrimination|composition|trap|strategy_choice|error_finding|edge_case|teach_back|why", "math_checks": [{"expr": "...", "expect": 0}]}
}
"partial" counts as wrong for levels on non-reasoning nodes. A prediction question (type "prediction") is not graded for credit; resolve it in the next say.`;

  function publicQuestion(q) {
    if (!q) return null;
    return { type: q.type, node_id: q.node_id, prompt: q.prompt, options: q.options, check_kind: q.check_kind };
  }

  function buildPrompt(course, submission, ctx) {
    const lv = levels(course);
    const types = [...new Set((course.nodes || []).flatMap((n) => [n.knowledge_type, n.secondary_type]).filter(Boolean))];
    const pedagogy = Object.fromEntries((types.length ? types : KNOWLEDGE_TYPES).map((t) => [t, PEDAGOGY[t]]));
    const modes = Object.fromEntries((course.subjectModes || []).filter((m) => MODE_RULES[m]).map((m) => [m, MODE_RULES[m]]));
    const misByNode = {};
    for (const m of course.misconceptions || []) (misByNode[m.nodeId || "_"] ||= []).push(m.description);
    const state = {
      topic: course.topic,
      mode: course.mode,
      phase: course.phase,
      goal: course.goal || null,
      exam_date: course.examDate || null,
      subject_modes: course.subjectModes || [],
      target_level: course.targetLevel || 4,
      plan_confirmed: !!course.planConfirmed,
      nodes: (course.nodes || []).map((n) => ({
        id: n.id, title: n.title, claim: n.claim, kind: n.kind, knowledge_type: n.knowledge_type,
        misconceptions: n.misconceptions, confusable_with: n.confusable_with,
        level: lv[n.id], prereqs: prereqsOf(course, n.id), can_start: canStart(course, n.id, lv),
        flagged: misByNode[n.id] || undefined,
      })),
      probe_results: course.probeResults || [],
      pending_question: course.pending
        ? { ...publicQuestion(course.pending), answer_key: course.pending.answer_key, hint_rung: course.pending.hintRung || 0, hints_given: course.pending.hints || [] }
        : null,
      turn: course.turn,
      summary_due: (course.turnsSinceSummary || 0) >= 10,
      all_nodes_at_target: allAtTarget(course, lv),
    };
    const recent = (course.transcript || []).slice(-14).map((e) =>
      e.role === "tutor"
        ? { tutor: e.say || undefined, question: e.question ? publicQuestion(e.question) : undefined }
        : { learner: e.action, answer: e.text || undefined, confidence: e.confidence ?? undefined, thinking: e.thinking || undefined, verdict: e.verdict || undefined },
    );
    const parts = [
      RULES,
      "## Rules for the knowledge types in play\n" + JSON.stringify(pedagogy, null, 1),
      Object.keys(modes).length ? "## Subject mode rules\n" + JSON.stringify(modes, null, 1) : "",
      "## Course state\n" + JSON.stringify(state),
      course.summary ? "## Session summary so far\n" + course.summary : "",
      "## Recent conversation (oldest first)\n" + JSON.stringify(recent),
      "## Learner's latest submission\n" + JSON.stringify(submission),
      ctx && ctx.repair ? "## Your previous reply was rejected by the app\nFix these problems and reply again in full:\n- " + ctx.repair.join("\n- ") : "",
      OUTPUT_FORMAT,
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  // ---------- applying a validated turn ----------

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 10);
  }

  // Mutates and returns course. Returns events for the UI (level-ups, misconception spotted).
  function applyTurn(course, out, submission, ctx) {
    const events = [];
    const before = levels(course);
    course.turn = (course.turn || 0) + 1;
    course.turnsSinceSummary = (course.turnsSinceSummary || 0) + 1;

    // 1. learner entry + attempt for the pending question
    const pending = course.pending;
    const entry = { role: "learner", action: submission.action, text: submission.answer || submission.message || "", confidence: submission.confidence ?? null, thinking: submission.thinking || "", turn: course.turn };
    if (pending && ["answer", "dont_know", "just_tell_me"].includes(submission.action) && pending.check_kind !== "clarify") {
      const att = makeAttempt(course, pending, submission, out.grade, ctx);
      course.attempts = [...(course.attempts || []), att];
      entry.verdict = att.isPrediction ? "prediction" : att.told ? "told" : att.verdict;
      if (att.nodeId && att.told) {
        const n = course.nodes.find((x) => x.id === att.nodeId);
        if (n) n.lastRevealTurn = course.turn;
      }
      if (!att.isPrediction && !att.told && att.verdict !== "correct" && att.confidence >= 80) {
        events.push({ type: "misconception_spotted" });
        const desc = out.grade?.misconception || "Confident wrong answer: " + String(submission.answer || "").slice(0, 140);
        course.misconceptions = [...(course.misconceptions || []), { id: uid("m_"), nodeId: att.nodeId, description: desc, turn: course.turn, retests: [] }];
      } else if (!att.isPrediction && att.verdict === "correct" && att.confidence >= 80) {
        events.push({ type: "solid" });
      }
      // a later answer on a flagged node is that misconception's retest
      for (const m of course.misconceptions || []) {
        if (m.nodeId && m.nodeId === att.nodeId && m.turn < course.turn && att.delayed && !att.isPrediction) {
          m.retests = [...(m.retests || []), { turn: course.turn, passed: att.verdict === "correct" }];
        }
      }
    }
    if (pending && ["answer", "dont_know", "just_tell_me", "harder", "easier"].includes(submission.action)) course.pending = null;
    course.transcript = [...(course.transcript || []), entry];

    // 2. state changes from the tutor
    if (out.goal?.goal) {
      course.goal = String(out.goal.goal);
      if (Array.isArray(out.goal.subject_modes)) course.subjectModes = out.goal.subject_modes.filter((m) => SUBJECT_MODES.includes(m));
      if (out.goal.exam_date) course.examDate = String(out.goal.exam_date);
    }
    if (Array.isArray(out.probe_results) && out.probe_results.length) course.probeResults = [...(course.probeResults || []), ...out.probe_results];
    if (out.plan) {
      const old = Object.fromEntries((course.nodes || []).map((n) => [n.id, n]));
      course.nodes = out.plan.nodes.map((n) => ({
        id: n.id, title: String(n.title || n.id), claim: String(n.claim || ""), kind: n.kind,
        knowledge_type: n.knowledge_type, secondary_type: KNOWLEDGE_TYPES.includes(n.secondary_type) ? n.secondary_type : null,
        misconceptions: (n.misconceptions || []).map(String), confusable_with: (n.confusable_with || []).map(String),
        exposed: old[n.id]?.exposed || false, lastTaughtTurn: old[n.id]?.lastTaughtTurn ?? null,
        lastTaughtSession: old[n.id]?.lastTaughtSession ?? null, lastRevealTurn: old[n.id]?.lastRevealTurn ?? null,
      }));
      course.edges = (out.plan.edges || []).map((e) => [String(e[0]), String(e[1])]);
      course.planRationale = String(out.plan.rationale || "");
      course.planConfirmed = false;
      course.phase = "plan";
      events.push({ type: "plan_proposed" });
    }
    for (const f of out.flag_misconceptions || []) {
      course.misconceptions = [...(course.misconceptions || []), { id: uid("m_"), nodeId: f.node_id || null, description: String(f.description), turn: course.turn, retests: [] }];
    }
    if (out.taught_node) {
      const n = course.nodes.find((x) => x.id === out.taught_node);
      if (n) { n.exposed = true; n.lastTaughtTurn = course.turn; n.lastTaughtSession = ctx.sessionId; }
    }
    for (const r of out.review_items || []) {
      if (r?.proposition) course.reviewItems = [...(course.reviewItems || []), { id: uid("r_"), nodeId: r.node_id || null, proposition: String(r.proposition), createdTurn: course.turn, createdAt: ctx.now }];
    }
    if (out.summary) { course.summary = String(out.summary); course.turnsSinceSummary = 0; }
    if (out.phase && PHASES.includes(out.phase) && !out.plan) {
      // Teaching can't start before the learner confirms the plan.
      const gated = ["teach", "practice", "final"].includes(out.phase) && !course.planConfirmed && course.mode !== "drill";
      if (!gated) course.phase = out.phase;
    }

    // 3. hint or new question
    if (out.hint && course.pending) {
      course.pending.hintRung = Number(out.hint.rung);
      course.pending.hints = [...(course.pending.hints || []), String(out.hint.text || "")];
    }
    let question = null;
    if (out.question) {
      question = {
        id: uid("q_"), type: out.question.type, node_id: out.question.node_id || null, prompt: String(out.question.prompt),
        options: out.question.type === "multiple_choice" ? out.question.options.map(String) : undefined,
        answer_key: out.question.answer_key, check_kind: out.question.check_kind,
        is_prediction: out.question.type === "prediction", hintRung: 0, hints: [],
        unverified: ctx.mathStatus === "none" && isComputational(course, out.question) || ctx.mathStatus === "unavailable",
        askedTurn: course.turn,
      };
      course.pending = question;
      const n = course.nodes?.find((x) => x.id === question.node_id);
      if (n) n.exposed = true;
    }
    course.transcript.push({ role: "tutor", say: out.say || "", hint: out.hint ? String(out.hint.text || "") : undefined, question: question ? publicQuestion(question) : undefined, turn: course.turn });
    if (course.transcript.length > 80) course.transcript = course.transcript.slice(-80);

    // 4. derived consequences
    const after = levels(course);
    for (const n of course.nodes || []) {
      if ((after[n.id] ?? 0) > (before[n.id] ?? 0)) events.push({ type: "level_up", nodeId: n.id, from: before[n.id] ?? 0, to: after[n.id] });
      if ((after[n.id] ?? 0) < (before[n.id] ?? 0)) events.push({ type: "level_down", nodeId: n.id, from: before[n.id], to: after[n.id] });
    }
    if (course.planConfirmed && ["teach", "practice"].includes(course.phase) && allAtTarget(course, after)) {
      course.phase = "final";
      events.push({ type: "final_unlocked" });
    }
    course.updatedAt = ctx.now;
    return events;
  }

  function isComputational(course, q) {
    const modes = course.subjectModes || [];
    const node = (course.nodes || []).find((n) => n.id === q.node_id);
    return (modes.includes("math") || modes.includes("science")) && node?.knowledge_type === "procedure";
  }

  function newCourse(topic, mode, now) {
    return {
      id: uid("c_"), topic: String(topic).slice(0, 300), mode: mode === "drill" ? "drill" : "teach", phase: "clarify",
      goal: null, examDate: null, subjectModes: [], targetLevel: 4, planConfirmed: false, planRationale: "",
      nodes: [], edges: [], attempts: [], misconceptions: [], reviewItems: [], probeResults: [],
      transcript: [], summary: "", turn: 0, turnsSinceSummary: 0, pending: null, createdAt: now, updatedAt: now,
    };
  }

  // Layers for the skill map: foundations at the bottom (layer 0), goal on top.
  function layout(course) {
    const nodes = course.nodes || [];
    const depth = {};
    const memo = (id, seen = new Set()) => {
      if (depth[id] != null) return depth[id];
      if (seen.has(id)) return 0;
      seen.add(id);
      const ps = prereqsOf(course, id);
      depth[id] = ps.length ? 1 + Math.max(...ps.map((p) => memo(p, seen))) : 0;
      return depth[id];
    };
    nodes.forEach((n) => memo(n.id));
    const layers = [];
    for (const n of nodes) (layers[depth[n.id]] ||= []).push(n.id);
    return layers.map((l) => l || []);
  }

  const api = {
    KNOWLEDGE_TYPES, QUESTION_TYPES, CHECK_KINDS, VERDICTS, PHASES, SUBJECT_MODES, PEDAGOGY, MODE_RULES, LEVEL_NAMES,
    evidenceLevel, nodeLevel, levels, prereqsOf, canStart, masteryPct, allAtTarget, makeAttempt,
    validatePlan, validateQuestion, validateTurn, runMathChecks, buildPrompt, applyTurn, newCourse, layout, publicQuestion,
  };
  root.GroundworkCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
