export const TASK_STATUSES = ["questions_received", "assigned", "in_progress", "quality_check", "open_for_review", "approved", "needs_revision", "cancelled", "blocked"];
export const STATUS_LABELS = { questions_received: "Questions Received", assigned: "Assigned", in_progress: "In Progress", quality_check: "Quality Check", open_for_review: "Open for Review", approved: "Approved", needs_revision: "Needs Revision", cancelled: "Cancelled", blocked: "Blocked" };
export const CATEGORIES = ["Research", "Design", "Coding", "Writing", "Planning", "General"];
const TEAM = { Research: ["nova", "ziki", "echo", "quill"], Design: ["pixel", "ziki", "echo"], Coding: ["codey", "ziki", "echo"], Writing: ["quill", "ziki", "echo"], Planning: ["atlas", "ziki", "echo"], General: ["ziki", "atlas", "echo"] };
const clone = (value) => structuredClone(value);
const addEvent = (task, type, actor, detail, now) => task.activity.push({ id: `${task.id}-event-${task.activity.length + 1}`, type, actor, detail, occurredAt: now });

export function createTask(input, now = new Date().toISOString(), id = `ZK-${Date.now().toString(36).slice(-6).toUpperCase()}`) {
  const title = String(input.title ?? "").trim() || String(input.description ?? "").trim().slice(0, 64);
  const description = String(input.description ?? "").trim();
  if (!title || !description) throw new Error("Add a task title and description.");
  const category = CATEGORIES.includes(input.category) ? input.category : "General";
  const priority = ["Low", "Medium", "High", "Urgent"].includes(input.priority) ? input.priority : "Medium";
  const task = { id, title: title.slice(0, 120), description: description.slice(0, 1600), category, priority, status: "questions_received", progress: 0, createdAt: now, updatedAt: now, dueDate: input.dueDate || "", agentIds: ["ziki"], contributions: [], review: null, revisionRequest: "", activity: [] };
  addEvent(task, "task.received", "ziki", "Ziki received the brief. No work has started.", now);
  return task;
}

export function transitionTask(source, action, now = new Date().toISOString()) {
  const task = clone(source);
  const set = (status, progress, actor, detail, type = `task.${status}`) => { task.status = status; task.progress = progress; task.updatedAt = now; addEvent(task, type, actor, detail, now); return task; };
  switch (action.type) {
    case "ASSIGN":
      if (task.status !== "questions_received" && task.status !== "needs_revision") throw new Error("Only a new or revised brief can be assigned.");
      task.agentIds = [...TEAM[task.category]];
      task.revisionRequest = "";
      return set("assigned", 15, "ziki", `Ziki assembled ${task.agentIds.length} specialists for this ${task.category.toLowerCase()} task.`, "task.assigned");
    case "START":
      if (task.status !== "assigned") throw new Error("Assign the task before starting simulated work.");
      task.contributions = task.agentIds.filter((id) => id !== "echo").map((agentId) => ({ agentId, title: contributionTitle(agentId), text: contributionText(agentId, task), createdAt: now }));
      return set("in_progress", 58, "ziki", "The assigned crew prepared draft contributions from the supplied brief. This is a local simulation.", "task.work_simulated");
    case "CHECK":
      if (task.status !== "in_progress") throw new Error("The task must be in progress before quality review.");
      task.contributions.push({ agentId: "echo", title: "Quality check", text: `Checked the local draft against the task description. Human review is still required. No external sources or project files were checked.`, createdAt: now });
      return set("quality_check", 82, "echo", "Echo completed a local consistency check; the result still needs a human review.", "task.quality_checked");
    case "REVIEW":
      if (task.status !== "quality_check") throw new Error("Complete the quality check before requesting human review.");
      task.review = { summary: "The crew prepared a structured draft from the brief, recorded specialist contributions, and completed a local quality check. Please verify the content before approving it.", openedAt: now };
      return set("open_for_review", 100, "ziki", "The draft is ready for your review. No action is approved until you choose.", "task.review_opened");
    case "APPROVE":
      if (task.status !== "open_for_review") throw new Error("Only a result open for review can be approved.");
      return set("approved", 100, "contributor", "You explicitly approved this result.", "task.approved");
    case "REQUEST_REVISION": {
      if (task.status !== "open_for_review") throw new Error("Only a result open for review can be sent back.");
      const feedback = String(action.feedback ?? "").trim();
      if (!feedback) throw new Error("Describe what should change before requesting a revision.");
      task.revisionRequest = feedback;
      return set("needs_revision", 58, "contributor", `You requested a revision: ${feedback}`, "task.revision_requested");
    }
    case "RESUBMIT":
      if (task.status !== "needs_revision") throw new Error("No revision is waiting to be resubmitted.");
      task.contributions = task.contributions.filter((entry) => entry.agentId !== "echo");
      task.contributions.push({ agentId: task.agentIds[0] || "ziki", title: "Revision draft", text: `Revision prepared against your feedback: ${task.revisionRequest}. This is a local template and needs your review.`, createdAt: now });
      return set("in_progress", 66, task.agentIds[0] || "ziki", "The assigned crew prepared a revision from your feedback. Echo must check it again.", "task.revision_prepared");
    case "CANCEL":
      if (["approved", "cancelled"].includes(task.status)) throw new Error("This task can no longer be cancelled.");
      return set("cancelled", task.progress, "contributor", "You cancelled this task. No approval was given.", "task.cancelled");
    case "BLOCK":
      if (["approved", "cancelled", "blocked"].includes(task.status)) throw new Error("This task cannot be blocked from its current state.");
      return set("blocked", task.progress, "contributor", String(action.reason ?? "Waiting for input"), "task.blocked");
    case "UNBLOCK":
      if (task.status !== "blocked") throw new Error("Only a blocked task can resume.");
      return set("questions_received", 0, "contributor", "You reopened the brief for clarification. Assignments need to be reviewed again.", "task.unblocked");
    default: throw new Error(`Unsupported task action: ${action.type}`);
  }
}

function contributionTitle(agentId) { return ({ nova: "Research brief", pixel: "Design direction", codey: "Implementation outline", quill: "Draft and messaging", atlas: "Work plan", ziki: "Coordination summary" })[agentId] || "Team contribution"; }
function contributionText(agentId, task) {
  const context = task.description;
  return ({ nova: `Research framing based only on the supplied brief: ${context}\n\nQuestions to verify: which sources are authoritative, what evidence is needed, and what remains unknown? No web research was performed.`, pixel: `Design framing for: ${context}\n\nStart with the user's goal, map the simplest useful path, and validate the layout against accessibility and responsive behavior. No design file was created.`, codey: `Implementation framing for: ${context}\n\nClarify acceptance criteria, identify affected components, and add focused verification. No repository code was changed or executed.`, quill: `Drafting focus for: ${context}\n\nKeep the main point visible, use plain language, and confirm names, dates, and claims before sharing. This is a draft direction, not a sent message.`, atlas: `Suggested sequence for: ${context}\n\n1. Confirm the expected outcome.\n2. Gather required inputs.\n3. Complete a small reviewable step.\n4. Check the result with the requester.`, ziki: `Coordination note: ${context}\n\nThe crew's draft contributions are grouped here for your review. Decide whether the result is useful, needs changes, or should be cancelled.` })[agentId];
}
