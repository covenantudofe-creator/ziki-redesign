import test from "node:test";
import assert from "node:assert/strict";
import { createTask, transitionTask } from "../src/taskModel.js";

const now = "2026-11-09T12:00:00.000Z";
const run = (task, type, extra = {}) => transitionTask(task, { type, ...extra }, now);

test("task captures a brief and starts in Questions Received without authorizing work", () => {
  const task = createTask({ title: "Prepare launch plan", description: "Plan the next release", category: "Planning", priority: "High" }, now, "ZK-100001");
  assert.equal(task.status, "questions_received");
  assert.equal(task.progress, 0);
  assert.deepEqual(task.agentIds, ["ziki"]);
  assert.equal(task.activity.length, 1);
  assert.throws(() => run(task, "APPROVE"), /Only a result open for review/);
});

test("task follows specialist assignment, simulated contributions, quality check, and human approval", () => {
  let task = createTask({ title: "Draft a project update", description: "Summarize the supplied notes", category: "Writing" }, now, "ZK-100002");
  task = run(task, "ASSIGN");
  assert.deepEqual(task.agentIds, ["quill", "ziki", "echo"]);
  task = run(task, "START");
  assert.equal(task.status, "in_progress");
  assert.ok(task.contributions.some((item) => item.agentId === "quill"));
  assert.ok(task.contributions.every((item) => !/web research was performed/i.test(item.text)));
  task = run(task, "CHECK");
  assert.equal(task.status, "quality_check");
  task = run(task, "REVIEW");
  assert.equal(task.status, "open_for_review");
  assert.throws(() => run({ ...task, status: "in_progress" }, "APPROVE"), /Only a result open for review/);
  task = run(task, "APPROVE");
  assert.equal(task.status, "approved");
  assert.equal(task.activity.at(-1).actor, "contributor");
});

test("revision feedback is required and revised work must pass quality review again", () => {
  let task = createTask({ title: "Design a settings page", description: "Make controls clear", category: "Design" }, now, "ZK-100003");
  for (const type of ["ASSIGN", "START", "CHECK", "REVIEW"]) task = run(task, type);
  assert.throws(() => run(task, "REQUEST_REVISION", { feedback: " " }), /Describe what should change/);
  task = run(task, "REQUEST_REVISION", { feedback: "Include a mobile layout" });
  assert.equal(task.status, "needs_revision");
  task = run(task, "RESUBMIT");
  assert.equal(task.status, "in_progress");
  assert.ok(task.contributions.some((item) => /mobile layout/.test(item.text)));
  task = run(task, "CHECK");
  task = run(task, "REVIEW");
  assert.equal(task.status, "open_for_review");
});

test("blocked and cancelled tasks cannot bypass an explicit approval", () => {
  let task = createTask({ title: "Research options", description: "Compare supplied options", category: "Research" }, now, "ZK-100004");
  task = run(task, "BLOCK", { reason: "Need source documents" });
  assert.equal(task.status, "blocked");
  task = run(task, "UNBLOCK");
  assert.equal(task.status, "questions_received");
  task = run(task, "CANCEL");
  assert.equal(task.status, "cancelled");
  assert.throws(() => run(task, "APPROVE"), /Only a result open for review/);
});

test("required task fields are validated", () => {
  assert.throws(() => createTask({ title: "", description: " " }), /title and description/);
});
