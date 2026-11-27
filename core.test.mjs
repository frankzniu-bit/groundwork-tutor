import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const C = createRequire(import.meta.url)("./core.js");

let t = 0;
const att = (nodeId, o = {}) => ({
  nodeId, verdict: "correct", confidence: 80, hints: 0, told: false, isPrediction: false,
  delayed: false, crossSession: false, afterReveal: false, checkKind: "check", turn: ++t, at: t, ...o,
});
const node = (id, knowledge_type, o = {}) => ({ id, knowledge_type, kind: "step", misconceptions: ["m"], confusable_with: [], ...o });

test("level 3 needs one correct check; hints allowed", () => {
  const n = node("a", "fact");
  assert.equal(C.nodeLevel(n, []), 0);
  assert.equal(C.nodeLevel(n, [att("a", { verdict: "wrong" })]), 1);
  assert.equal(C.nodeLevel(n, [att("a", { hints: 2, confidence: 30 })]), 3);
});

test("predictions and told answers never give credit", () => {
  const n = node("a", "concept");
  assert.equal(C.nodeLevel(n, [att("a", { isPrediction: true })]), 1);
  assert.equal(C.nodeLevel(n, [att("a", { told: true, verdict: "wrong" })]), 2);
});

test("a learner who only uses just-tell-me never reaches 4", () => {
  const n = node("a", "fact");
  const A = Array.from({ length: 10 }, () => att("a", { told: true, verdict: "wrong", delayed: true, crossSession: true }));
  assert.ok(C.nodeLevel(n, A) < 4);
});

test("level 4 (fact): two independent correct, one delayed across sessions", () => {
  const n = node("a", "fact");
  const sameSession = [att("a"), att("a", { delayed: true })];
  assert.equal(C.nodeLevel(n, sameSession), 3);
  assert.equal(C.nodeLevel(n, [att("a"), att("a", { delayed: true, crossSession: true })]), 4);
});

test("level 4 rejects low confidence, hints and checks right after teaching", () => {
  const n = node("a", "perceptual_fluency");
  assert.equal(C.nodeLevel(n, [att("a", { confidence: 50 }), att("a", { delayed: true })]), 3);
  assert.equal(C.nodeLevel(n, [att("a", { hints: 1 }), att("a", { delayed: true })]), 3);
  assert.equal(C.nodeLevel(n, [att("a", { afterReveal: true }), att("a", { delayed: true })]), 3);
  assert.equal(C.nodeLevel(n, [att("a"), att("a", { delayed: true })]), 4);
});

test("level 4 (concept) needs a passed trap item", () => {
  const n = node("a", "concept");
  assert.equal(C.nodeLevel(n, [att("a"), att("a", { delayed: true })]), 3);
  assert.equal(C.nodeLevel(n, [att("a"), att("a", { delayed: true, checkKind: "trap" })]), 4);
});

test("level 4 (procedure) needs a correct why-check", () => {
  const n = node("a", "procedure");
  assert.equal(C.nodeLevel(n, [att("a"), att("a", { delayed: true })]), 3);
  assert.equal(C.nodeLevel(n, [att("a", { checkKind: "why" }), att("a", { delayed: true })]), 4);
});

test("level 5 needs an edge case and a teach-back on top of 4", () => {
  const n = node("a", "reasoning");
  const base = [att("a"), att("a", { delayed: true })];
  assert.equal(C.nodeLevel(n, base), 4);
  assert.equal(C.nodeLevel(n, [...base, att("a", { checkKind: "edge_case" })]), 4);
  assert.equal(C.nodeLevel(n, [...base, att("a", { checkKind: "edge_case" }), att("a", { checkKind: "teach_back" })]), 5);
});

test("a failed delayed check drops one level, and old evidence can't restore it", () => {
  const n = node("a", "fact");
  const base = [att("a"), att("a", { delayed: true, crossSession: true })];
  const lapse = att("a", { verdict: "wrong", delayed: true });
  assert.equal(C.nodeLevel(n, [...base, lapse]), 3);
  assert.equal(C.nodeLevel(n, [...base, lapse, att("a")]), 3);
  assert.equal(C.nodeLevel(n, [...base, lapse, att("a"), att("a", { delayed: true, crossSession: true })]), 4);
});

const course = () => ({
  ...C.newCourse("t", "teach", 0),
  phase: "teach", planConfirmed: true,
  nodes: [node("a", "fact", { kind: "foundation" }), node("b", "concept")],
  edges: [["a", "b"]],
});
const ctx = (o = {}) => ({ sessionId: "s1", now: 1, evaluate: (e) => Function(`return (${e})`)(), ...o });
const mcq = (o = {}) => ({ type: "multiple_choice", node_id: "a", prompt: "p", options: ["alpha", "bravo", "delta"], answer_key: 1, check_kind: "check", ...o });

test("prerequisite gate: b can't be taught until a reaches 3", () => {
  const c = course();
  const { errs } = C.validateTurn({ say: "", question: mcq({ node_id: "b" }) }, c, ctx());
  assert.ok(errs.some((e) => e.includes("prerequisites")));
  c.attempts = [att("a")];
  assert.deepEqual(C.validateTurn({ say: "", question: mcq({ node_id: "b" }) }, c, ctx()).errs, []);
});

test("question format must fit the node's knowledge type", () => {
  const { errs } = C.validateTurn({ question: mcq({ type: "teach_back", options: undefined, answer_key: "x" }) }, course(), ctx());
  assert.ok(errs.some((e) => e.includes("not allowed for fact")));
});

test("MCQ options must be similar in length and the key must be an index", () => {
  let r = C.validateTurn({ question: mcq({ options: ["a", "bb", "a much longer option"] }) }, course(), ctx());
  assert.ok(r.errs.some((e) => e.includes("length")));
  r = C.validateTurn({ question: mcq({ answer_key: 7 }) }, course(), ctx());
  assert.ok(r.errs.some((e) => e.includes("answer_key")));
});

test("a wrong reference answer is caught before the learner sees it", () => {
  const q = mcq({ math_checks: [{ expr: "(3*4+2)/7", expect: 3 }] });
  const r = C.validateTurn({ question: q }, course(), ctx());
  assert.ok(r.errs.some((e) => e.includes("math_checks failed")));
  const ok = C.validateTurn({ question: { ...q, math_checks: [{ expr: "(3*4+2)/7", expect: 2 }] } }, course(), ctx());
  assert.equal(ok.math.status, "passed");
});

test("hints must be exactly the next rung and keep the question pending", () => {
  const c = course();
  c.pending = { ...mcq(), id: "q1", hintRung: 1 };
  const sub = { action: "hint" };
  assert.ok(C.validateTurn({ hint: { rung: 3, text: "x" } }, c, ctx({ submission: sub })).errs.some((e) => e.includes("exactly 2")));
  assert.deepEqual(C.validateTurn({ hint: { rung: 2, text: "x" } }, c, ctx({ submission: sub })).errs, []);
  assert.ok(C.validateTurn({ say: "x" }, c, ctx({ submission: sub })).errs.length);
});

test("an answer must be graded", () => {
  const c = course();
  c.pending = { ...mcq(), id: "q1", hintRung: 0 };
  const r = C.validateTurn({ say: "ok" }, c, ctx({ submission: { action: "answer", answer: "1", confidence: 70 } }));
  assert.ok(r.errs.some((e) => e.includes("grade.verdict")));
});

test("plans must be acyclic, typed, and give concepts misconceptions", () => {
  assert.deepEqual(C.validatePlan({ nodes: [node("a", "fact"), node("b", "concept")], edges: [["a", "b"]] }), []);
  assert.ok(C.validatePlan({ nodes: [node("a", "fact"), node("b", "fact")], edges: [["a", "b"], ["b", "a"]] }).some((e) => e.includes("cycle")));
  assert.ok(C.validatePlan({ nodes: [node("a", "concept", { misconceptions: [] })], edges: [] }).some((e) => e.includes("misconception")));
});

test("applyTurn records attempts, flags confident errors, and teaching can't start before confirmation", () => {
  const c = C.newCourse("x", "teach", 0);
  C.applyTurn(c, { say: "plan", plan: { rationale: "r", nodes: [node("a", "fact", { kind: "foundation" })], edges: [] } }, { action: "message", message: "hi" }, ctx());
  assert.equal(c.phase, "plan");
  C.applyTurn(c, { say: "go", phase: "teach" }, { action: "message", message: "?" }, ctx());
  assert.equal(c.phase, "plan", "phase stays until the learner confirms");
  c.planConfirmed = true;
  C.applyTurn(c, { say: "q", phase: "teach", taught_node: "a", question: mcq() }, { action: "message", message: "go" }, ctx({ mathStatus: "none" }));
  assert.equal(c.phase, "teach");
  assert.equal(c.pending.answer_key, 1);
  const events = C.applyTurn(c, { say: "no", grade: { verdict: "wrong", misconception: "thinks X" } }, { action: "answer", answer: "0", confidence: 90 }, ctx());
  assert.ok(events.some((e) => e.type === "misconception_spotted"));
  assert.equal(c.misconceptions.length, 1);
  assert.equal(c.attempts[0].afterReveal, true);
  assert.equal(c.pending, null);
});

test("buildPrompt keeps answer keys only for the pending question", () => {
  const c = course();
  c.transcript = [{ role: "tutor", say: "s", question: C.publicQuestion({ ...mcq(), answer_key: "SECRET_OLD" }) }];
  c.pending = { ...mcq(), id: "q", answer_key: "CURRENT_KEY" };
  const p = C.buildPrompt(c, { action: "answer", answer: "1", confidence: 50 }, {});
  assert.ok(!p.includes("SECRET_OLD"));
  assert.ok(p.includes("CURRENT_KEY"));
  assert.ok(Buffer.byteLength(p) < 256 * 1024);
});

test("layout puts foundations in the bottom layer", () => {
  assert.deepEqual(C.layout(course()), [["a"], ["b"]]);
});
