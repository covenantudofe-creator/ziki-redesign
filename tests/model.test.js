import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PREFERENCES, DEMO_ISSUES } from "../src/fixtures.js";
import {
  applyAction,
  createInitialState,
  isApprovalCurrent,
  planFingerprint,
  rankIssues,
  validatePreferences
} from "../src/model.js";

const timestamp = "2026-01-02T03:04:05.000Z";
const permissionsFor = (state, issueId) => state.plans[issueId].requestedPermissions.map((permission) => permission.id);
const act = (state, action) => applyAction(state, action, DEMO_ISSUES, timestamp);

test("validates contributor preferences, including positive bounded time", () => {
  assert.deepEqual(validatePreferences(DEFAULT_PREFERENCES), {});
  assert.equal(validatePreferences({ ...DEFAULT_PREFERENCES, project: "" }).project, "This field is required.");
  assert.match(validatePreferences({ ...DEFAULT_PREFERENCES, hours: "0" }).hours, /between 1 and 168/);
});

test("ranks demo fixtures by stated preferences and time", () => {
  const ranked = rankIssues(DEMO_ISSUES, DEFAULT_PREFERENCES);
  assert.equal(ranked.length, DEMO_ISSUES.length);
  assert.ok(ranked.some((result) => result.rationale.some((reason) => reason.includes("Project fit is unknown"))));
  assert.ok(ranked.every((result) => result.matchScore <= 98));
  const unrelated = rankIssues(DEMO_ISSUES, {
    ...DEFAULT_PREFERENCES,
    focus: "quantum aerospace",
    skills: "zigbee",
    hours: "5"
  });
  assert.ok(unrelated.every((result) => result.matchScore < 68));
});

test("selection and rejection never authorize work", () => {
  let state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  state = act(state, { type: "SELECT_ISSUE", issueId: "demo-102" });
  assert.equal(state.workStatuses["demo-102"], "not_started");
  assert.match(state.auditEvents.at(-1).detail, /does not authorize/);
  state = act(state, { type: "REJECT_PLAN", issueId: "demo-102", reason: "Not a fit" });
  assert.equal(state.plans["demo-102"].status, "rejected");
  assert.equal(state.workStatuses["demo-102"], "not_started");
  assert.equal(isApprovalCurrent(state, "demo-102"), false);
  assert.throws(() => act(state, { type: "BEGIN_WORK", issueId: "demo-102" }), /only begin after/);
});

test("approval is explicit, permission-aware, and binds to the displayed exact plan", () => {
  let state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  const issueId = "demo-101";
  const originalFingerprint = planFingerprint(state.plans[issueId]);
  assert.throws(() => act(state, { type: "APPROVE_PLAN", issueId, acceptedPermissions: [] }), /explicitly approve every/);
  state = act(state, { type: "APPROVE_PLAN", issueId, acceptedPermissions: permissionsFor(state, issueId) });
  assert.equal(state.workStatuses[issueId], "authorized");
  assert.equal(isApprovalCurrent(state, issueId), true);
  assert.equal(state.approvals[0].planFingerprint, originalFingerprint);
  assert.equal(state.auditEvents.at(-1).type, "plan.approved");
  assert.throws(() => act(state, { type: "REJECT_PLAN", issueId }), /Only an unapproved proposal/);
});

test("requested revisions require approval of the new plan before work can begin", () => {
  let state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  const issueId = "demo-101";
  state = act(state, { type: "REQUEST_REVISION", issueId, request: "Add an explicit browser test." });
  assert.equal(state.plans[issueId].status, "revision_requested");
  state = act(state, { type: "PROPOSE_REVISION", issueId, change: state.plans[issueId].revisionRequest, actor: "agent" });
  assert.equal(state.plans[issueId].revision, 2);
  assert.equal(isApprovalCurrent(state, issueId), false);
  assert.throws(() => act(state, { type: "BEGIN_WORK", issueId }), /only begin after/);
  state = act(state, { type: "APPROVE_PLAN", issueId, acceptedPermissions: permissionsFor(state, issueId) });
  assert.equal(isApprovalCurrent(state, issueId), true);
  assert.equal(state.approvals[0].planRevision, 2);
});

test("material scope changes pause work and require renewed approval before resume", () => {
  let state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  const issueId = "demo-101";
  state = act(state, { type: "APPROVE_PLAN", issueId, acceptedPermissions: permissionsFor(state, issueId) });
  state = act(state, { type: "BEGIN_WORK", issueId });
  state = act(state, { type: "CHANGE_SCOPE", issueId, change: "Also update keyboard help text." });
  assert.equal(state.workStatuses[issueId], "paused");
  assert.equal(state.plans[issueId].status, "proposed");
  assert.equal(isApprovalCurrent(state, issueId), false);
  assert.throws(() => act(state, { type: "RESUME_WORK", issueId }), /only after the changed plan/);
  state = act(state, { type: "APPROVE_PLAN", issueId, acceptedPermissions: permissionsFor(state, issueId) });
  assert.equal(state.workStatuses[issueId], "paused");
  state = act(state, { type: "RESUME_WORK", issueId });
  assert.equal(state.workStatuses[issueId], "in_progress");
  assert.deepEqual(state.auditEvents.map((event) => event.type), [
    "plan.approved", "work.started", "work.paused_scope_change", "plan.approved", "work.resumed"
  ]);
});

test("invalid state transitions and empty revision requests are rejected", () => {
  const state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  assert.throws(() => act(state, { type: "PROPOSE_REVISION", issueId: "demo-101", change: "change" }), /only be proposed after/);
  assert.throws(() => act(state, { type: "REQUEST_REVISION", issueId: "demo-101", request: " " }), /Describe the change/);
  assert.throws(() => act(state, { type: "CHANGE_SCOPE", issueId: "demo-101", change: "new work" }), /currently approved/);
});
