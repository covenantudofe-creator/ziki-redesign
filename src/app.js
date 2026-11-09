import { DEFAULT_PREFERENCES, DEMO_ISSUES } from "./fixtures.js";
import { AGENTS, DEFAULT_AGENT_ID, getAgent } from "./agents.js";
import { renderAgentCard, renderAgentsPage } from "./components/agents.js";
import { CATEGORIES, STATUS_LABELS, TASK_STATUSES, createTask, transitionTask } from "./taskModel.js";
import { loadTasks, saveTasks, TASKS_STORAGE_KEY } from "./taskStore.js";
import {
  STORAGE_KEY,
  applyAction,
  createInitialState,
  isApprovalCurrent,
  isKnownState,
  rankIssues,
  validatePreferences
} from "./model.js";

const root = document.querySelector("#app");
const CONVERSATIONS_KEY = "ziki-conversations-v1";
const SETTINGS_KEY = "ziki-settings-v1";
const PROFILE_KEY = "ziki-profile-v1";
const NOTIFICATION_READ_KEY = "ziki-notifications-read-v1";
let state;
let view = "overview";
let tasks = loadTasks();
let selectedTaskId = "";
let taskFilter = "all";
let taskCategoryFilter = "all";
let taskSearch = "";
let taskToast = "";
let discoveryStatus = "idle";
let errorMessage = "";
let loadingTimer;
let companionState = "idle";
let companionExercise = "";
let companionMessage = "";
let companionMessageKind = "";
let companionVisible = false;
let companionGreetingDismissed = false;
let companionGreetingShown = false;
let companionIdleTimer;
let companionExerciseTimer;
let companionGreetingTimer;
let companionReactionTimer;
let companionGazeFrame = 0;
let companionPointer = null;
let companionLastActivity = 0;
let companionLastPointer = null;
let companionLastExercise = "";
let sidebarOpen = false;
const savedConversationState = readLocal(CONVERSATIONS_KEY, { items: [], currentId: "" });
let conversations = Array.isArray(savedConversationState) ? savedConversationState : Array.isArray(savedConversationState.items) ? savedConversationState.items.filter((item) => item && typeof item.id === "string" && Array.isArray(item.messages)) : [];
let currentConversationId = Array.isArray(savedConversationState) ? "" : savedConversationState.currentId || "";
let activeAgentId = DEFAULT_AGENT_ID;
let appSettings = readLocal(SETTINGS_KEY, { defaultAgentId: DEFAULT_AGENT_ID, notificationsEnabled: true, showCompanion: true });
let profile = readLocal(PROFILE_KEY, { name: "Contributor", email: "" });
let notificationsReadAt = Number(readLocal(NOTIFICATION_READ_KEY, 0)) || 0;
let conversationSearch = "";
let agentBusyConversationId = "";
let agentBusyTimer;
let copyMessageId = "";
let settingsMessage = "";
const reducedMotionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let companionPaused = document.hidden || reducedMotionPreference.matches;
if (companionPaused) companionState = "resting";

const companionExercises = ["stretch", "dance", "hop", "tilt", "wave", "yawn", "shuffle"];
const companionHelpMessage = "I can explain contribution examples, plan reviews, and simulated activity. Selecting an issue never authorizes work.";

function readLocal(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    errorMessage = `This browser could not save the change: ${error.message}`;
    return false;
  }
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function updateTask(taskId, action) {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) { taskToast = "That task is no longer available."; return; }
  try {
    tasks[index] = transitionTask(tasks[index], action);
    saveTasks(tasks);
    taskToast = action.type === "APPROVE" ? "Approved. The crew is celebrating your decision." : "Task updated.";
    render();
  } catch (error) { taskToast = error.message; render(); }
}

function taskById(id) { return tasks.find((task) => task.id === id); }
function activeTaskForAgent(agentId) { return tasks.find((task) => task.agentIds.includes(agentId) && ["assigned", "in_progress", "quality_check", "open_for_review", "needs_revision"].includes(task.status)); }

function newConversation() {
  const conversation = { id: makeId("conversation"), title: "New conversation", agentId: appSettings.defaultAgentId || DEFAULT_AGENT_ID, createdAt: Date.now(), updatedAt: Date.now(), messages: [] };
  conversations.unshift(conversation);
  currentConversationId = conversation.id;
  activeAgentId = conversation.agentId;
  persistConversations();
  return conversation;
}

function persistConversations() {
  conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  writeLocal(CONVERSATIONS_KEY, { items: conversations, currentId: currentConversationId });
}

function currentConversation() {
  return conversations.find((conversation) => conversation.id === currentConversationId) ?? null;
}

function ensureConversation() {
  let conversation = currentConversation();
  if (!conversation) conversation = newConversation();
  return conversation;
}

function selectConversation(id) {
  const conversation = conversations.find((item) => item.id === id);
  if (!conversation) return;
  currentConversationId = conversation.id;
  activeAgentId = getAgent(conversation.agentId).id;
  view = "scout";
  sidebarOpen = false;
  render();
}

function selectAgent(id) {
  const agent = AGENTS.find((item) => item.id === id);
  if (!agent) return;
  const conversation = ensureConversation();
  activeAgentId = agent.id;
  conversation.agentId = agent.id;
  conversation.updatedAt = Date.now();
  persistConversations();
  view = "scout";
  sidebarOpen = false;
  render();
  root.querySelector("#chat-input")?.focus();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    errorMessage = "";
  } catch (error) {
    errorMessage = `Your demo changes could not be saved in this browser: ${error.message}`;
  }
}

function load() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  const parsed = JSON.parse(saved);
  if (!isKnownState(parsed, DEMO_ISSUES)) throw new Error("Saved demo state is incompatible. Reset it to continue.");
  return parsed;
}

function dispatch(action) {
  try {
    state = applyAction(state, action, DEMO_ISSUES);
    persist();
  } catch (error) {
    errorMessage = error.message;
  }
  render();
}

function currentIssue() {
  return DEMO_ISSUES.find((issue) => issue.id === state.selectedIssueId) ?? null;
}

function renderCompanion() {
  const gazeX = companionPointer?.x ?? 0;
  const gazeY = companionPointer?.y ?? 0;
  return `<aside class="companion" id="issue-scout-companion" data-state="${companionState}" data-exercise="${companionExercise}" ${companionPaused ? "data-paused" : ""}>
    <div class="companion-message" id="companion-message" ${companionVisible ? "" : "hidden"}>
      <button class="companion-dismiss" type="button" aria-label="Dismiss robot message" title="Dismiss message" data-action="companion-dismiss">×</button>
      <p role="status" aria-live="polite">${escapeHtml(companionMessage)}</p>
    </div>
      <button class="companion-trigger" type="button" aria-label="Ask Ziki for help" aria-controls="companion-message" aria-expanded="${companionVisible}" data-action="companion-help">
      <svg class="companion-art" viewBox="0 0 112 126" role="img" aria-hidden="true" style="--gaze-x:${gazeX}px;--gaze-y:${gazeY}px">
        <ellipse class="bot-shadow" cx="56" cy="117" rx="27" ry="5"/>
        <g class="bot-legs"><path d="M43 91v13l-8 5a3 3 0 0 0 2 5h14v-23M67 91v13l8 5a3 3 0 0 1-2 5H59v-23" fill="var(--surface-raised)" stroke="var(--border-strong)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M39 110h10M63 110h10" stroke="var(--mint)" stroke-width="2" stroke-linecap="round"/></g>
        <g class="bot-arms"><path class="bot-arm bot-arm-left" d="M36 72 26 82l-3 13" fill="none" stroke="var(--border-strong)" stroke-width="6" stroke-linecap="round"/><circle cx="23" cy="96" r="4" fill="var(--blue)"/><path class="bot-arm bot-arm-right" d="M76 72 86 82l3 13" fill="none" stroke="var(--border-strong)" stroke-width="6" stroke-linecap="round"/><circle cx="89" cy="96" r="4" fill="var(--blue)"/></g>
        <g class="bot-body"><rect x="34" y="62" width="44" height="35" rx="13" fill="var(--surface-raised)" stroke="var(--border-strong)" stroke-width="2"/><rect x="43" y="70" width="26" height="18" rx="7" fill="var(--blue-dark)"/><circle cx="56" cy="79" r="4" fill="var(--mint)"/><path d="M50 92h12" stroke="var(--border-strong)" stroke-width="2" stroke-linecap="round"/></g>
        <g class="bot-head"><path d="M56 14v-5" stroke="var(--border-strong)" stroke-width="3" stroke-linecap="round"/><circle cx="56" cy="7" r="4" fill="var(--amber)"/><rect x="25" y="15" width="62" height="51" rx="18" fill="var(--surface-soft)" stroke="var(--border-strong)" stroke-width="2.5"/><rect x="32" y="22" width="48" height="37" rx="13" fill="var(--blue-dark)"/><circle class="bot-eye" cx="45" cy="38" r="7" fill="var(--text)"/><circle class="bot-eye" cx="67" cy="38" r="7" fill="var(--text)"/><circle class="bot-pupil" cx="45" cy="38" r="3" fill="var(--mint)"/><circle class="bot-pupil" cx="67" cy="38" r="3" fill="var(--mint)"/><path class="bot-mouth" d="M51 49q5 5 10 0" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round"/><circle cx="35" cy="47" r="2" fill="var(--red)" opacity=".8"/><circle cx="77" cy="47" r="2" fill="var(--red)" opacity=".8"/></g>
      </svg>
    </button>
  </aside>`;
}

function updateCompanion() {
  const companion = root.querySelector("#issue-scout-companion");
  if (!companion) return;
  companion.dataset.state = companionState;
  companion.dataset.exercise = companionExercise;
  if (companionPaused) companion.dataset.paused = "";
  else delete companion.dataset.paused;
  const message = companion.querySelector("#companion-message");
  message.hidden = !companionVisible;
  message.querySelector("p").textContent = companionMessage;
  const trigger = companion.querySelector(".companion-trigger");
  trigger.setAttribute("aria-expanded", String(companionVisible));
  const art = companion.querySelector(".companion-art");
  art.style.setProperty("--gaze-x", `${companionPointer?.x ?? 0}px`);
  art.style.setProperty("--gaze-y", `${companionPointer?.y ?? 0}px`);
}

function setCompanion(stateName, message = companionMessage, visible = companionVisible, duration = 0) {
  clearTimeout(companionReactionTimer);
  companionState = stateName;
  companionMessage = message;
  companionVisible = visible;
  updateCompanion();
  if (duration) {
    companionReactionTimer = setTimeout(() => {
      companionState = "idle";
      updateCompanion();
    }, duration);
  }
}

function scheduleCompanionExercise(delay = 8000 + Math.random() * 4000) {
  clearTimeout(companionIdleTimer);
  clearTimeout(companionExerciseTimer);
  companionIdleTimer = undefined;
  companionExerciseTimer = undefined;
  if (companionPaused) return;
  companionIdleTimer = setTimeout(() => {
    const choices = companionExercises.filter((name) => name !== companionLastExercise);
    companionExercise = choices[Math.floor(Math.random() * choices.length)];
    companionLastExercise = companionExercise;
    companionState = "idle";
    updateCompanion();
    companionExerciseTimer = setTimeout(() => {
      companionExercise = "";
      updateCompanion();
      scheduleCompanionExercise();
    }, 2300);
  }, delay);
}

function scheduleCompanionGreeting() {
  clearTimeout(companionGreetingTimer);
  companionGreetingTimer = undefined;
  if (document.hidden || companionGreetingDismissed || companionGreetingShown) return;
  companionGreetingTimer = setTimeout(() => {
    companionGreetingShown = true;
    companionMessageKind = "greeting";
    setCompanion("noticing", "Need help understanding a contribution plan? Ask me.", true);
  }, 18000);
}

function recordCompanionActivity() {
  const now = Date.now();
  if (now - companionLastActivity < 450) return;
  companionLastActivity = now;
  if (companionExercise) {
    companionExercise = "";
    updateCompanion();
  }
  scheduleCompanionExercise();
}

function trackCompanionPointer(event) {
  const point = { x: event.clientX, y: event.clientY };
  if (companionLastPointer) {
    const moved = Math.hypot(point.x - companionLastPointer.x, point.y - companionLastPointer.y);
    if (moved >= 12) recordCompanionActivity();
  }
  companionLastPointer = point;
  companionPointer = point;
  if (!companionGazeFrame) {
    companionGazeFrame = requestAnimationFrame(() => {
      companionGazeFrame = 0;
      const art = root.querySelector(".companion-art");
      const companion = root.querySelector("#issue-scout-companion");
      if (!art || !companion || !companionPointer) return;
      const bounds = companion.getBoundingClientRect();
      const x = Math.max(-1.7, Math.min(1.7, ((companionPointer.x - (bounds.left + bounds.width / 2)) / bounds.width) * 3.4));
      const y = Math.max(-1.7, Math.min(1.7, ((companionPointer.y - (bounds.top + bounds.height / 2)) / bounds.height) * 3.4));
      companionPointer = { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
      art.style.setProperty("--gaze-x", `${companionPointer.x}px`);
      art.style.setProperty("--gaze-y", `${companionPointer.y}px`);
    });
  }
}

function pauseCompanion() {
  companionPaused = document.hidden || reducedMotionPreference.matches;
  if (companionPaused) {
    clearTimeout(companionIdleTimer);
    clearTimeout(companionExerciseTimer);
    companionExercise = "";
    companionState = "resting";
  } else {
    if (companionState === "resting") companionState = "idle";
    scheduleCompanionExercise();
  }
  if (document.hidden) clearTimeout(companionGreetingTimer);
  else scheduleCompanionGreeting();
  updateCompanion();
}

function recommendationResults() {
  const ranked = rankIssues(DEMO_ISSUES, state.preferences);
  return ranked.filter((result) => result.fitsTime && result.matchScore >= 68);
}

function renderList() {
  const results = recommendationResults();
  if (!state.hasSearched) return `<div class="empty-state"><span class="empty-icon">⌕</span><h3>Ready when you are</h3><p>Enter your contribution preferences, then discover matching demo fixtures.</p></div>`;
  if (!results.length) return `<div class="empty-state"><span class="empty-icon">⌕</span><h3>No matching demo issues</h3><p>Try broadening your focus or adjusting your available time. No live search was performed.</p><button class="button button-secondary" data-action="edit-preferences">Adjust preferences</button></div>`;

  return results.map(({ issue, matchScore, rationale }) => {
    const active = issue.id === state.selectedIssueId;
    const plan = state.plans[issue.id];
    return `<button class="issue-card ${active ? "is-selected" : ""}" type="button" data-action="select-issue" data-issue-id="${escapeHtml(issue.id)}" aria-pressed="${active}">
      <div class="issue-card-top"><span class="match-pill" title="Heuristic score based on text overlap and illustrative estimate fit; not a probability.">Heuristic fit ${matchScore}/100</span><span class="issue-unknown">Status & priority unknown</span></div>
      <h3>${escapeHtml(issue.title)}</h3>
      <p class="issue-summary">${escapeHtml(issue.summary)}</p>
      <p class="issue-rationale"><strong>Why it may fit</strong>${rationale.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</p>
      <div class="tag-row">${issue.labels.map((label) => `<span class="tag">${escapeHtml(label)}</span>`).join("")}<span class="tag tag-muted">${escapeHtml(issue.language)}</span></div>
      <p class="issue-evidence"><strong>Evidence:</strong> ${escapeHtml(issue.evidence)}</p>
      <p class="issue-unknowns"><strong>Unknown:</strong> ${escapeHtml(issue.unknowns.join(" "))}</p>
      <div class="issue-card-footer"><span>${escapeHtml(issue.estimatedHours.label)}</span><span class="arrow">↗</span></div>
      <span class="sr-only">${active ? "Currently selected. " : ""}Opens proposed plan. Project fit is unknown. This is demo fixture data.</span>
      <span class="sr-only">Plan revision ${plan.revision}; ${escapeHtml(plan.status)}.</span>
    </button>`;
  }).join("");
}

function listBlock(items, className = "") {
  if (!items?.length) return `<p class="muted">None listed.</p>`;
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderPermissions(plan, approvalCurrent) {
  if (approvalCurrent) {
    const approval = [...state.approvals].reverse().find((item) => item.issueId === plan.issueId);
    return `<div class="approved-permissions">${plan.requestedPermissions.map((permission) => `<span class="permission-approved">✓ ${escapeHtml(permission.label)}</span>`).join("")}<p>Each listed permission was explicitly approved for revision ${approval.planRevision}.</p></div>`;
  }
  return `<fieldset class="permissions"><legend>Requested permissions · review each before approval</legend>
    ${plan.requestedPermissions.map((permission) => `<label class="permission-check"><input type="checkbox" name="permission" value="${escapeHtml(permission.id)}"><span>${escapeHtml(permission.label)}</span></label>`).join("")}
    <p class="permission-note">These permissions are descriptive only. This prototype has no repository integration and cannot access files or act on a live issue.</p>
  </fieldset>`;
}

function renderPlan(issue) {
  if (!issue) return `<section class="plan-empty"><div class="empty-icon">↖</div><h2>Select a recommendation</h2><p>Choose an issue fixture to inspect its evidence and proposed plan.</p></section>`;
  const plan = state.plans[issue.id];
  const workStatus = state.workStatuses[issue.id];
  const approvalCurrent = isApprovalCurrent(state, issue.id);
  const rejected = plan.status === "rejected";

  return `<section class="plan-panel" aria-labelledby="plan-heading">
    <div class="plan-header">
      <div><p class="eyebrow">PROPOSED PLAN · REVISION ${plan.revision}</p><h2 id="plan-heading">${escapeHtml(issue.title)}</h2></div>
      <span class="status-chip ${approvalCurrent ? "status-approved" : rejected ? "status-rejected" : "status-proposed"}">${approvalCurrent ? "Approved" : rejected ? "Rejected" : plan.status === "revision_requested" ? "Revision requested" : "Needs your approval"}</span>
    </div>
    <div class="plan-notice"><span class="notice-symbol">${approvalCurrent ? "✓" : "!"}</span><p><strong>${approvalCurrent ? "This exact plan revision was approved." : "Nothing is authorized yet."}</strong> ${approvalCurrent ? "Approval applies only to the displayed plan fingerprint. Work remains a separate simulated action." : "Drafting, ranking, and selecting a fixture do not grant permission to act. Approval applies only to this exact plan revision."}</p></div>
    ${plan.status === "revision_requested" ? `<div class="revision-callout"><strong>Revision requested</strong><p>${escapeHtml(plan.revisionRequest)}</p><button class="button button-secondary" data-action="propose-revision" data-issue-id="${escapeHtml(issue.id)}">Propose revised plan</button></div>` : ""}
    ${approvalCurrent ? `<div class="approval-callout"><span class="approval-check">✓</span><div><strong>Exact plan revision approved</strong><p>Revision ${plan.revision} · ${escapeHtml(new Date([...state.approvals].reverse().find((item) => item.issueId === issue.id).approvedAt).toLocaleString())} · simulated only</p></div></div>` : ""}
    ${rejected ? `<div class="rejection-callout"><strong>Proposal rejected</strong><p>This plan did not authorize work. You can continue exploring other recommendations.</p></div>` : ""}
    <div class="plan-section"><h3>Objective</h3><p>${escapeHtml(plan.objective)}</p></div>
    <div class="plan-section"><h3>Agreed scope <span class="scope-version">v${plan.revision}</span></h3><p>${escapeHtml(plan.scope)}</p></div>
    <div class="plan-grid">
      <div class="plan-section"><h3>Steps</h3>${listBlock(plan.steps, "numbered-list")}</div>
      <div class="plan-section"><h3>Estimate</h3><p class="estimate">${escapeHtml(plan.estimate)}</p><p class="muted">Illustrative only; not a commitment or verified project estimate.</p></div>
      <div class="plan-section"><h3>Assumptions</h3>${listBlock(plan.assumptions)}</div>
      <div class="plan-section"><h3>Risks</h3>${listBlock(plan.risks)}</div>
      <div class="plan-section"><h3>Dependencies</h3>${listBlock(plan.dependencies)}</div>
      <div class="plan-section"><h3>Evidence & unknowns</h3><p>${escapeHtml(issue.evidence)}</p>${listBlock(issue.unknowns)}</div>
    </div>
    ${approvalCurrent ? renderPermissions(plan, true) : !rejected && plan.status !== "revision_requested" ? renderPermissions(plan, false) : ""}
    ${!approvalCurrent && !rejected && plan.status === "proposed" ? `<div class="plan-actions">
      <button class="button button-primary" data-action="approve-plan" data-issue-id="${escapeHtml(issue.id)}">Approve this exact plan</button>
      <button class="button button-secondary" data-action="show-revision" data-issue-id="${escapeHtml(issue.id)}">Request changes</button>
      <button class="button button-danger" data-action="reject-plan" data-issue-id="${escapeHtml(issue.id)}">Reject</button>
    </div>` : ""}
    ${plan.status === "revision_requested" ? `<div class="revision-pending"><p>Work is not authorized. The revised proposal must be reviewed and approved separately.</p><button class="button button-danger" data-action="reject-plan" data-issue-id="${escapeHtml(issue.id)}">Reject proposal</button></div>` : ""}
    ${approvalCurrent && workStatus === "authorized" ? `<div class="work-action"><p>Authorized for the exact approved scope. No work has been performed by this prototype.</p><button class="button button-primary" data-action="begin-work" data-issue-id="${escapeHtml(issue.id)}">Begin simulated work</button><button class="button button-secondary" data-action="show-scope-change" data-issue-id="${escapeHtml(issue.id)}">Request scope change</button></div>` : ""}
    ${approvalCurrent && workStatus === "in_progress" ? `<div class="work-action"><p>Simulated work is tracked against approved revision ${plan.revision}.</p><button class="button button-secondary" data-action="show-scope-change" data-issue-id="${escapeHtml(issue.id)}">Request scope change</button></div>` : ""}
    ${workStatus === "paused" ? `<div class="paused-callout"><strong>Work paused</strong><p>A material scope change invalidated the earlier approval. Approve this revised plan to authorize it; resume is a separate action.</p>${approvalCurrent ? `<button class="button button-primary" data-action="resume-work" data-issue-id="${escapeHtml(issue.id)}">Resume simulated work</button>` : ""}</div>` : ""}
    ${!approvalCurrent && !rejected && plan.status === "proposed" ? `<div class="revision-form hidden" id="revision-form"><label for="revision-request">What should change?</label><textarea id="revision-request" rows="3" placeholder="Describe the requested clarification or change"></textarea><div><button class="button button-secondary" data-action="cancel-revision">Cancel</button><button class="button button-primary" data-action="request-revision" data-issue-id="${escapeHtml(issue.id)}">Send revision request</button></div></div>` : ""}
    ${approvalCurrent && ["authorized", "in_progress"].includes(workStatus) ? `<div class="revision-form hidden" id="scope-form"><label for="scope-change">Describe the material scope change</label><textarea id="scope-change" rows="3" placeholder="For example: also update the related keyboard shortcut documentation"></textarea><p>Submitting this change pauses simulated work immediately and invalidates the previous approval.</p><div><button class="button button-secondary" data-action="cancel-scope-change">Cancel</button><button class="button button-danger" data-action="submit-scope-change" data-issue-id="${escapeHtml(issue.id)}">Pause and propose new scope</button></div></div>` : ""}
  </section>`;
}

function renderTimeline(issue) {
  if (!issue) return `<p class="muted">Select a recommendation to view its work timeline.</p>`;
  const status = state.workStatuses[issue.id];
  const labels = [
    ["not_started", "Proposal drafted"],
    ["authorized", "Plan approved"],
    ["in_progress", "Simulated work in progress"],
    ["paused", "Paused for scope approval"]
  ];
  const events = state.auditEvents.filter((event) => event.issueId === issue.id).slice().reverse();
  return `<section class="timeline-panel"><div class="section-title"><div><p class="eyebrow">WORK TRACKING</p><h2>Timeline</h2></div><span class="demo-tag">SIMULATED</span></div>
    <ol class="status-timeline">${labels.map(([key, label]) => {
      const done = key === "not_started" || (key === "authorized" && ["authorized", "in_progress", "paused"].includes(status)) || (key === "in_progress" && status === "in_progress");
      const active = key === "paused" && status === "paused" || key === status;
      return `<li class="${done ? "is-done" : ""} ${active ? "is-active" : ""}"><span class="timeline-dot">${done ? "✓" : ""}</span><div><strong>${label}</strong>${active ? `<span class="timeline-state">Current</span>` : ""}</div></li>`;
    }).join("")}</ol>
    <div class="audit-heading"><h3>Decision & action history</h3><span>${events.length} ${events.length === 1 ? "event" : "events"}</span></div>
    ${events.length ? `<ol class="audit-list">${events.map((event) => `<li><span class="audit-marker"></span><div><div class="audit-meta"><strong>${escapeHtml(event.actor === "contributor" ? "You" : "Demo agent")}</strong><time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(new Date(event.occurredAt).toLocaleString())}</time></div><p>${escapeHtml(event.detail)}</p><small>${escapeHtml(event.type.replaceAll(".", " · "))} · plan rev ${event.planRevision ?? "—"} · simulated</small></div></li>`).join("")}</ol>` : `<div class="audit-empty">No decisions recorded for this fixture yet. Opening a recommendation does not authorize work.</div>`}
  </section>`;
}

function renderActivity() {
  const events = state.auditEvents.slice().reverse();
  if (!events.length) return `<section class="activity-page"><p class="eyebrow">AUDIT HISTORY</p><h1>Nothing recorded yet</h1><p class="muted">Important demo decisions and actions will appear here. Activity is stored in this browser only.</p><button class="button button-secondary" data-action="go-scout">Back to issue scout</button></section>`;
  return `<section class="activity-page"><p class="eyebrow">AUDIT HISTORY</p><h1>Decision & action history</h1><p class="muted">Ordered demo history stored locally in this browser; Reset demo clears it. Entries are simulated.</p><ol class="audit-list audit-list-large">${events.map((event) => {
    const issue = DEMO_ISSUES.find((item) => item.id === event.issueId);
    return `<li><span class="audit-marker"></span><div><div class="audit-meta"><strong>${escapeHtml(event.actor === "contributor" ? "You" : "Demo agent")}</strong><time datetime="${escapeHtml(event.occurredAt)}">${escapeHtml(new Date(event.occurredAt).toLocaleString())}</time></div><p>${escapeHtml(event.detail)}</p><small>${escapeHtml(event.type.replaceAll(".", " · "))} · ${escapeHtml(issue?.title ?? "Preferences")} · rev ${event.planRevision ?? "—"} · simulated</small></div></li>`;
  }).join("")}</ol><button class="button button-secondary" data-action="go-scout">Back to issue scout</button></section>`;
}

function renderApprovals() {
  const entries = DEMO_ISSUES.map((issue) => ({ issue, plan: state.plans[issue.id], approved: isApprovalCurrent(state, issue.id) }));
  return `<section class="secondary-page"><header class="page-heading"><div><p class="eyebrow">HUMAN REVIEW</p><h1>Approvals</h1><p>Review proposed demo plans and the permissions they request. Approval only affects this local simulation.</p></div></header>
    <div class="approval-list">${entries.map(({ issue, plan, approved }) => `<article class="approval-row"><span class="approval-icon ${approved ? "approved" : "pending"}" aria-hidden="true">${approved ? "✓" : "◷"}</span><div class="approval-copy"><h2>${escapeHtml(issue.title)}</h2><p>Revision ${plan.revision} · ${plan.requestedPermissions.length} requested ${plan.requestedPermissions.length === 1 ? "permission" : "permissions"}</p><span class="status-chip ${approved ? "status-approved" : plan.status === "rejected" ? "status-rejected" : ""}">${approved ? "Approved" : plan.status === "rejected" ? "Rejected" : plan.status === "revision_requested" ? "Revision requested" : "Needs review"}</span></div><button class="button button-secondary" data-action="open-approval" data-issue-id="${escapeHtml(issue.id)}">Review plan</button></article>`).join("")}</div>
    <p class="availability-note">No work starts from this page. Open a plan to inspect its scope, evidence, and permission checklist.</p>
  </section>`;
}

function renderNotifications() {
  const events = state.auditEvents.slice().reverse();
  const unread = events.filter((event) => new Date(event.occurredAt).getTime() > notificationsReadAt).length;
  return `<section class="secondary-page"><header class="page-heading page-heading-actions"><div><p class="eyebrow">WORKSPACE UPDATES</p><h1>Notifications</h1><p>Only decisions recorded in this browser appear here.</p></div>${unread ? `<button class="button button-secondary" data-action="mark-notifications-read">Mark all as read</button>` : ""}</header>
    ${events.length ? `<ol class="notification-list">${events.map((event) => `<li class="notification-item ${new Date(event.occurredAt).getTime() > notificationsReadAt ? "is-unread" : ""}"><span class="notification-dot" aria-hidden="true"></span><div><p>${escapeHtml(event.detail)}</p><small>${escapeHtml(event.type.replaceAll(".", " · "))} · ${escapeHtml(new Date(event.occurredAt).toLocaleString())}</small></div></li>`).join("")}</ol>` : `<div class="empty-page-state"><span class="agent-icon agent-blue" aria-hidden="true">◷</span><h2>You’re all caught up</h2><p>When you make a simulated decision, it will appear here.</p></div>`}
  </section>`;
}

function renderSettings() {
  return `<section class="secondary-page"><header class="page-heading"><div><p class="eyebrow">WORKSPACE PREFERENCES</p><h1>Settings</h1><p>These preferences are stored locally in this browser.</p></div></header>
    <form class="settings-form" id="settings-form"><div class="field"><label for="default-agent">Default agent for new conversations</label><select id="default-agent" name="defaultAgentId">${AGENTS.map((agent) => `<option value="${agent.id}" ${appSettings.defaultAgentId === agent.id ? "selected" : ""}>${agent.name}</option>`).join("")}</select><small>Changing this does not switch the agent in an existing conversation.</small></div>
      <label class="setting-toggle"><input type="checkbox" name="notificationsEnabled" ${appSettings.notificationsEnabled ? "checked" : ""}><span><strong>Workspace notifications</strong><small>Show simulated activity updates in the notifications page.</small></span></label>
      <label class="setting-toggle"><input type="checkbox" name="showCompanion" ${appSettings.showCompanion ? "checked" : ""}><span><strong>Robot companion</strong><small>Show Ziki’s animated helper in the workspace.</small></span></label>
      <button class="button button-primary" type="submit">Save settings</button>${settingsMessage ? `<p class="save-confirmation" role="status">${escapeHtml(settingsMessage)}</p>` : ""}
    </form>
  </section>`;
}

function renderProfile() {
  return `<section class="secondary-page"><header class="page-heading"><div><p class="eyebrow">YOUR ACCOUNT</p><h1>Profile</h1><p>Update the local profile label shown in this demo workspace.</p></div></header>
    <form class="settings-form" id="profile-form"><div class="field"><label for="profile-name">Display name</label><input id="profile-name" name="name" maxlength="80" required value="${escapeHtml(profile.name)}"></div><div class="field"><label for="profile-email">Email <span class="optional-label">Optional</span></label><input id="profile-email" name="email" type="email" maxlength="160" value="${escapeHtml(profile.email)}" placeholder="name@example.com"><small>This is local profile text only; no account is connected.</small></div><button class="button button-primary" type="submit">Save profile</button>${settingsMessage ? `<p class="save-confirmation" role="status">${escapeHtml(settingsMessage)}</p>` : ""}</form>
  </section>`;
}

function renderConversations() {
  const query = conversationSearch.trim().toLowerCase();
  const matches = conversations.filter((conversation) => (conversation.messages.length || conversation.id === currentConversationId) && conversation.title.toLowerCase().includes(query));
  return `<div class="recent-heading"><span>RECENT CONVERSATIONS</span><button class="icon-button" type="button" aria-label="Clear conversation search" data-action="clear-search" title="Clear search">×</button></div>
    <div class="conversation-search"><label class="sr-only" for="conversation-search">Search conversations</label><input id="conversation-search" type="search" placeholder="Search conversations" value="${escapeHtml(conversationSearch)}"><span aria-hidden="true">⌕</span></div>
    <div class="recent-list">${matches.length ? matches.slice(0, 8).map((conversation) => `<div class="recent-row"><button class="recent-conversation ${conversation.id === currentConversationId ? "is-current" : ""}" data-action="select-conversation" data-conversation-id="${escapeHtml(conversation.id)}" aria-current="${conversation.id === currentConversationId ? "page" : "false"}"><span class="recent-conversation-icon" aria-hidden="true">◷</span><span><strong>${escapeHtml(conversation.title)}</strong><small>${escapeHtml(getAgent(conversation.agentId).name)} · ${conversation.messages.length} ${conversation.messages.length === 1 ? "message" : "messages"}</small></span></button><button class="recent-delete" aria-label="Delete conversation: ${escapeHtml(conversation.title)}" data-action="delete-conversation" data-conversation-id="${escapeHtml(conversation.id)}">×</button></div>`).join("") : `<p class="no-conversations">${query ? "No matching conversations." : "Your conversations will appear here."}</p>`}</div>`;
}

function renderConversation() {
  const conversation = ensureConversation();
  const agent = getAgent(conversation.agentId);
  const messages = conversation.messages;
  const isBusy = agentBusyConversationId === conversation.id;
  return `<section class="conversation-panel" aria-label="Conversation with ${escapeHtml(agent.name)}">
    <div class="conversation-heading"><div class="agent-identity"><span class="agent-icon agent-${agent.color}" aria-hidden="true">${agent.icon}</span><div><strong>${escapeHtml(agent.name)}</strong><span><i class="presence-dot"></i> ${escapeHtml(agent.role)} · Local demo</span></div></div><div class="conversation-actions"><button class="button button-secondary" data-action="browse-agents">Switch agent</button><button class="icon-button" type="button" aria-label="Clear this conversation" title="Clear conversation" data-action="clear-conversation">⌫</button><button class="button button-secondary new-chat" data-action="new-conversation" aria-label="Start a new conversation">＋ <span>New conversation</span></button></div></div>
    <div class="conversation-messages" id="conversation-messages" aria-live="polite" aria-relevant="additions text">
      ${messages.length ? messages.map((message, index) => { const messageAgent = getAgent(message.agentId || agent.id); const isLastAgent = message.role === "agent" && index === messages.length - 1; return `<article class="chat-message chat-${message.role}" data-message-id="${escapeHtml(message.id)}"><span class="message-avatar ${message.role === "agent" ? `agent-${messageAgent.color}` : "user-avatar"}" aria-hidden="true">${message.role === "agent" ? messageAgent.icon : escapeHtml((profile.name || "C").slice(0, 1).toUpperCase())}</span><div class="message-content"><span class="message-author">${message.role === "agent" ? escapeHtml(messageAgent.name) : escapeHtml(profile.name || "You")}</span><p>${escapeHtml(message.text)}</p>${message.action ? `<button class="button button-secondary message-action" data-action="${message.action}">${escapeHtml(message.actionLabel)}</button>` : ""}${message.role === "agent" ? `<div class="message-tools"><button data-action="copy-message" data-message-id="${escapeHtml(message.id)}" aria-label="Copy response">${copyMessageId === message.id ? "Copied" : "Copy"}</button>${isLastAgent ? `<button data-action="retry-response" aria-label="Retry response">Retry</button>` : ""}</div>` : ""}</div></article>`; }).join("") : `<div class="chat-welcome"><span class="welcome-mark agent-${agent.color}" aria-hidden="true">${agent.icon}</span><h2>${escapeHtml(agent.name)} is ready to help</h2><p>${escapeHtml(agent.description)} Replies use local templates; there is no connected AI service.</p><div class="prompt-suggestions">${agent.prompts.map((prompt) => `<button type="button" data-action="send-prompt" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)} <span aria-hidden="true">↗</span></button>`).join("")}</div></div>`}
      ${isBusy ? `<div class="chat-message chat-agent thinking-message" role="status"><span class="message-avatar agent-${agent.color}">${agent.icon}</span><div class="message-content"><span class="message-author">${escapeHtml(agent.name)} · preparing a local response</span><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div></div>` : ""}
      ${errorMessage && view === "scout" ? `<div class="chat-error" role="alert">${escapeHtml(errorMessage)}<button class="text-button" data-action="dismiss-error">Dismiss</button></div>` : ""}
    </div>
    <form class="chat-composer" id="chat-form"><label class="sr-only" for="chat-input">Message ${escapeHtml(agent.name)}</label><textarea id="chat-input" name="message" rows="1" maxlength="1200" placeholder="Message ${escapeHtml(agent.name)}…" required ${isBusy ? "disabled" : ""}></textarea><div class="composer-footer"><span>Local template response · no external service</span><button class="send-button" type="submit" ${isBusy ? "disabled" : ""}>Send <span aria-hidden="true">↑</span></button></div></form>
  </section>`;
}

function renderPreferences() {
  const preferences = state.preferences;
  return `<section class="preference-page"><div><p class="eyebrow">YOUR CONTRIBUTOR BRIEF</p><h1>Find work that fits</h1><p class="muted">Tell the demo scout what you want to contribute to. These details rank local fixtures only; they are not sent to Ziki or a repository.</p></div>
    ${preferenceForm(preferences, "preferences-page-form")}
    ${discoveryStatus === "loading" ? `<div class="loading-banner" role="status"><span class="spinner"></span>Finding matching demo fixtures…</div>` : ""}
    <div class="demo-source-note"><strong>Live discovery unavailable</strong><p>No authorized issue integration is configured. You can search labelled demo fixtures; no live API requests are made.</p><button class="button button-secondary" data-action="live-search">Check live sources</button></div>
  </section>`;
}

function preferenceForm(preferences, id) {
  return `<form class="preferences-form" id="${id}" novalidate>
    <div class="field"><label for="project">Target project or area <span class="required">*</span></label><input id="project" name="project" required maxlength="120" value="${escapeHtml(preferences.project)}" placeholder="Project name or area"><small>Use a project name or a broad search area.</small><span class="field-error" data-error="project"></span></div>
    <div class="field"><label for="focus">Work preferences <span class="required">*</span></label><textarea id="focus" name="focus" rows="3" required maxlength="300" placeholder="What kind of work interests you?">${escapeHtml(preferences.focus)}</textarea><span class="field-error" data-error="focus"></span></div>
    <div class="field-row"><div class="field"><label for="skills">Skills <span class="required">*</span></label><input id="skills" name="skills" required maxlength="200" value="${escapeHtml(preferences.skills)}" placeholder="e.g. TypeScript, testing"><small>Separate skills with commas.</small><span class="field-error" data-error="skills"></span></div>
      <div class="field"><label for="hours">Time available <span class="required">*</span></label><div class="input-suffix"><input id="hours" name="hours" type="number" min="1" max="168" step="any" required value="${escapeHtml(preferences.hours)}"><span>hours</span></div><span class="field-error" data-error="hours"></span></div></div>
    <div class="field"><label for="constraints">Constraints</label><textarea id="constraints" name="constraints" rows="2" maxlength="300" placeholder="Anything to avoid or account for?">${escapeHtml(preferences.constraints)}</textarea></div>
    <button class="button button-primary" type="submit">${id === "preferences-page-form" ? "Save preferences" : "Discover demo issues"} <span aria-hidden="true">→</span></button>
  </form>`;
}

function renderScout() {
  const issue = currentIssue();
  const results = recommendationResults();
  return `<div class="scout-page">
    <section class="welcome-row"><div><p class="eyebrow">YOUR CONTRIBUTION PARTNER</p><h1>Good work starts with a conversation.</h1><p>Tell Ziki what you have in mind. You stay in control at every step.</p></div><div class="demo-banner"><span class="live-dot"></span><div><strong>Demo workspace</strong><small>Local examples · no live connections</small></div></div></section>
    <div class="prototype-notice"><span aria-hidden="true">ⓘ</span><p><strong>No live actions are possible here.</strong> Fixtures, estimates, approvals, work updates, and history are simulated. No issue was fetched, no repository was modified, and no contribution was submitted.</p></div>
    ${discoveryStatus === "loading" ? `<div class="loading-banner" role="status"><span class="spinner"></span>Finding matching demo fixtures…</div>` : ""}
    ${discoveryStatus === "error" ? `<div class="error-banner" role="alert"><strong>Live discovery unavailable.</strong> ${escapeHtml(errorMessage || "No authorized issue source is configured. No request was made.")}<button class="text-button" data-action="dismiss-error">Dismiss</button></div>` : ""}
    ${errorMessage && discoveryStatus !== "error" ? `<div class="error-banner" role="alert">${escapeHtml(errorMessage)}<button class="text-button" data-action="dismiss-error">Dismiss</button></div>` : ""}
    ${renderConversation()}
    <div class="workspace-grid">
      <aside class="left-column">
        <section class="brief-card"><div class="section-title"><div><p class="eyebrow">CONTRIBUTOR BRIEF</p><h2>Your preferences</h2></div><button class="icon-button" aria-label="Edit contributor preferences" title="Edit contributor preferences" data-action="edit-preferences">✎</button></div>
          <dl class="brief-list"><div><dt>Target</dt><dd>${escapeHtml(state.preferences.project)}</dd></div><div><dt>Focus</dt><dd>${escapeHtml(state.preferences.focus)}</dd></div><div><dt>Skills</dt><dd>${escapeHtml(state.preferences.skills)}</dd></div><div><dt>Time</dt><dd>${escapeHtml(state.preferences.hours)} hours</dd></div>${state.preferences.constraints ? `<div><dt>Constraints</dt><dd>${escapeHtml(state.preferences.constraints)}</dd></div>` : ""}</dl>
          <button class="text-button" data-action="edit-preferences">Update your brief <span aria-hidden="true">→</span></button>
        </section>
        <section class="recommendations"><div class="section-title"><div><p class="eyebrow">DEMO FIXTURES</p><h2>Recommendations <span class="count-pill">${results.length}</span></h2></div><button class="icon-button" aria-label="Refresh demo recommendations" title="Refresh demo recommendations" data-action="refresh-demo">↻</button></div>
          <p class="section-caption">A text-and-time heuristic; project linkage and constraint fit remain unknown.</p>
          <div class="recommendation-list">${renderList()}</div>
        </section>
      </aside>
      <div class="right-column">${renderPlan(issue)}${renderTimeline(issue)}</div>
    </div>
  </div>`;
}

function taskStatus(task) { return STATUS_LABELS[task.status] || task.status; }
function taskCard(task) {
  return `<article class="task-card"><div class="task-card-head"><span class="task-id">${escapeHtml(task.id)}</span><span class="status-pill status-${task.status.replaceAll("_", "-")}">${escapeHtml(taskStatus(task))}</span></div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.description)}</p><div class="task-meta"><span>${escapeHtml(task.category)}</span><span class="priority priority-${task.priority.toLowerCase()}">${escapeHtml(task.priority)} priority</span></div><div class="task-agents">${task.agentIds.map((id) => { const agent = getAgent(id); return `<span class="task-agent-chip" title="${escapeHtml(agent.name)}">${agent.icon} ${agent.name}</span>`; }).join("")}</div><div class="progress-track"><span style="width:${task.progress}%"></span></div><div class="task-card-foot"><span>${task.progress}% complete · ${new Date(task.updatedAt).toLocaleDateString()}</span><button class="text-button" data-action="task-details" data-task-id="${escapeHtml(task.id)}">View details →</button></div></article>`;
}

function renderTaskForm() {
  return `<form class="task-form" id="task-form"><div class="form-title"><span class="form-icon">＋</span><div><strong>Start a new task</strong><small>Your crew will prepare a draft for your review.</small></div></div><label for="task-title">Task title</label><input id="task-title" name="title" maxlength="120" placeholder="What would you like your crew to do?" required><label for="task-description">Description</label><textarea id="task-description" name="description" rows="3" maxlength="1600" placeholder="Add context, goals, and what a good result looks like" required></textarea><div class="task-form-row"><label>Category<select name="category">${CATEGORIES.map((c) => `<option>${c}</option>`).join("")}</select></label><label>Priority<select name="priority"><option>Medium</option><option>Low</option><option>High</option><option>Urgent</option></select></label><label>Due date<input type="date" name="dueDate"></label></div><button class="button button-primary" type="submit">Send to Ziki <span aria-hidden="true">→</span></button><small class="form-note">Submitting creates a local task. The crew only runs a clearly labelled simulation.</small></form>`;
}

function renderOverview() {
  const reviewCount = tasks.filter((t) => t.status === "open_for_review").length;
  return `<section class="page-wrap overview-page"><header class="overview-hero"><div><p class="eyebrow">YOUR COLLABORATIVE WORKSPACE</p><h1>Meet your Agent Crew</h1><p>Describe the work. Ziki will coordinate a specialist team, prepare a draft, and bring it back for your approval.</p><div class="hero-pills"><span>✦ 7 specialist robots</span><span>✓ You approve every result</span></div></div><div class="hero-art">${renderRobotMarkup(getAgent("ziki"), "idle")}<span class="orbit-dot orbit-one">⌕</span><span class="orbit-dot orbit-two">⌘</span><span class="orbit-dot orbit-three">✎</span></div></header>${taskToast ? `<div class="task-toast" role="status">${escapeHtml(taskToast)}<button data-action="clear-task-toast" aria-label="Dismiss">×</button></div>` : ""}<div class="overview-grid"><div class="overview-main">${renderTaskForm()}<section class="task-section"><div class="section-heading"><div><p class="eyebrow">YOUR WORK</p><h2>Task queue</h2></div><button class="button button-secondary" data-action="go-workflow">View all tasks <span aria-hidden="true">→</span></button></div>${tasks.length ? `<div class="task-card-grid">${tasks.slice(0, 3).map(taskCard).join("")}</div>` : `<div class="empty-task"><span>✧</span><h3>Your crew is ready when you are</h3><p>Create a task to see the workflow, team contributions, and review steps here.</p></div>`}</section></div><aside class="overview-rail"><section class="rail-card"><div class="section-heading"><div><p class="eyebrow">TEAM STATUS</p><h2>Agent crew</h2></div><button class="text-button" data-action="go-agents">View all</button></div>${AGENTS.slice(0, 4).map((agent) => `<button class="agent-status-row" data-action="agent-details" data-agent-id="${agent.id}">${renderRobotMarkup(agent, activeTaskForAgent(agent.id) ? "working" : "idle")}<span><strong>${agent.name}</strong><small>${activeTaskForAgent(agent.id) ? "Working on a task" : agent.title}</small></span><i class="presence-dot"></i></button>`).join("")}</section><section class="review-callout"><span class="review-callout-icon">✓</span><div><strong>${reviewCount ? `${reviewCount} task${reviewCount === 1 ? "" : "s"} awaiting your review` : "Human review stays in your hands"}</strong><p>${reviewCount ? "Your crew has completed a draft. Check it before approving." : "Nothing is approved until you choose to approve it."}</p><button class="text-button" data-action="go-review">Open review queue →</button></div></section><div class="demo-disclosure">Local demonstration only. No external services are connected; draft content is generated from your task brief.</div></aside></div></section>`;
}

function renderRobotMarkup(agent, status) {
  return `<span class="robot-avatar agent-${agent.color}" data-robot-state="${status}" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M32 8V4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="4" r="3" fill="currentColor"/><rect x="10" y="14" width="44" height="33" rx="12" fill="white" stroke="currentColor" stroke-width="2.5"/><rect x="15" y="19" width="34" height="22" rx="8" fill="currentColor"/><circle cx="24" cy="29" r="3" fill="white"/><circle cx="40" cy="29" r="3" fill="white"/><path d="M26 35q6 5 12 0" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><rect x="21" y="49" width="22" height="8" rx="4" fill="currentColor" opacity=".8"/><path d="M16 28H8m48 0h-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><i>${agent.icon}</i></span>`;
}

function renderWorkflow() {
  const filtered = tasks.filter((task) => (taskFilter === "all" || task.status === taskFilter) && (taskCategoryFilter === "all" || task.category === taskCategoryFilter) && `${task.title} ${task.description} ${task.id}`.toLowerCase().includes(taskSearch.toLowerCase()));
  return `<section class="page-wrap"><header class="page-heading page-heading-actions"><div><p class="eyebrow">COORDINATED WORK</p><h1>Task Workflow</h1><p>Follow every brief from intake through specialist work and human review.</p></div><button class="button button-primary" data-action="go-overview">＋ New task</button></header><div class="workflow-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><input id="task-search" type="search" placeholder="Search tasks" value="${escapeHtml(taskSearch)}"></label><label>Status<select id="task-status-filter"><option value="all">All statuses</option>${TASK_STATUSES.map((s) => `<option value="${s}" ${taskFilter === s ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}</select></label><label>Category<select id="task-category-filter"><option value="all">All categories</option>${CATEGORIES.map((c) => `<option ${taskCategoryFilter === c ? "selected" : ""}>${c}</option>`).join("")}</select></label></div><div class="task-card-grid workflow-grid">${filtered.length ? filtered.map(taskCard).join("") : `<div class="empty-task"><span>⌕</span><h3>${tasks.length ? "No tasks match these filters" : "No tasks yet"}</h3><p>Change your filters or create a task from Overview.</p><button class="button button-secondary" data-action="go-overview">Create a task</button></div>`}</div></section>`;
}

function renderTaskDetails(task) {
  return `<section class="page-wrap task-detail-page"><button class="back-link" data-action="go-workflow">← Back to task workflow</button>${taskToast ? `<div class="task-toast" role="status">${escapeHtml(taskToast)}<button data-action="clear-task-toast" aria-label="Dismiss">×</button></div>` : ""}<header class="task-detail-heading"><div><p class="eyebrow">${escapeHtml(task.id)} · ${escapeHtml(task.category)} · ${escapeHtml(task.priority)} priority</p><h1>${escapeHtml(task.title)}</h1><p>${escapeHtml(task.description)}</p></div><span class="status-pill status-${task.status.replaceAll("_", "-")}">${escapeHtml(taskStatus(task))}</span></header><div class="task-detail-grid"><div><section class="detail-card"><h2>Workflow progress</h2><ol class="workflow-steps">${["questions_received", "assigned", "in_progress", "quality_check", "open_for_review", "approved"].map((s) => `<li class="${task.status === s ? "is-current" : ""} ${task.progress >= ({questions_received:0,assigned:15,in_progress:58,quality_check:82,open_for_review:100,approved:100}[s]) && task.status !== "needs_revision" ? "is-done" : ""}"><i></i><span>${STATUS_LABELS[s]}</span></li>`).join("")}</ol><div class="progress-track"><span style="width:${task.progress}%"></span></div><p class="progress-caption">${task.progress}% complete</p><div class="workflow-controls">${task.status === "questions_received" ? `<button class="button button-primary" data-action="task-assign" data-task-id="${escapeHtml(task.id)}">Assign specialist team</button>` : ""}${task.status === "assigned" ? `<button class="button button-primary" data-action="task-start" data-task-id="${escapeHtml(task.id)}">Run simulated team work</button>` : ""}${task.status === "in_progress" ? `<button class="button button-primary" data-action="task-check" data-task-id="${escapeHtml(task.id)}">Run quality check</button>` : ""}${task.status === "quality_check" ? `<button class="button button-primary" data-action="task-review-open" data-task-id="${escapeHtml(task.id)}">Open for my review</button>` : ""}${task.status === "needs_revision" ? `<button class="button button-primary" data-action="task-resubmit" data-task-id="${escapeHtml(task.id)}">Prepare revised draft</button>` : ""}${["questions_received", "assigned", "in_progress", "quality_check", "needs_revision"].includes(task.status) ? `<button class="button button-secondary" data-action="task-block" data-task-id="${escapeHtml(task.id)}">Mark blocked</button><button class="button button-danger" data-action="task-cancel" data-task-id="${escapeHtml(task.id)}">Cancel task</button>` : ""}${task.status === "blocked" ? `<button class="button button-primary" data-action="task-unblock" data-task-id="${escapeHtml(task.id)}">Reopen task</button>` : ""}</div></section><section class="detail-card"><div class="section-heading"><div><p class="eyebrow">SPECIALIST OUTPUTS</p><h2>Team contributions</h2></div><span class="output-count">${task.contributions.length}</span></div>${task.contributions.length ? task.contributions.map((entry) => { const agent = getAgent(entry.agentId); return `<article class="contribution"><div class="contribution-heading">${renderRobotMarkup(agent, "idle")}<div><strong>${agent.name}</strong><span>${escapeHtml(entry.title)} · ${new Date(entry.createdAt).toLocaleString()}</span></div></div><div class="contribution-copy"><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.text)}</p></div></article>`; }).join("") : `<p class="muted">Agent contributions appear here after you assign the team and start the simulated work.</p>`}</section></div><aside><section class="detail-card review-card"><p class="eyebrow">HUMAN REVIEW</p><h2>${task.status === "open_for_review" ? "Your decision is needed" : task.status === "approved" ? "Approved by you" : "You stay in control"}</h2><p>${task.review ? escapeHtml(task.review.summary) : "No task result is approved automatically. Review the specialist outputs and decide what happens next."}</p>${task.status === "open_for_review" ? `<button class="button button-primary review-approve" data-action="task-approve" data-task-id="${escapeHtml(task.id)}">✓ Approve result</button><label for="revision-feedback">Request a change</label><textarea id="revision-feedback" rows="3" placeholder="Tell your crew what to revise"></textarea><button class="button button-secondary" data-action="task-revision" data-task-id="${escapeHtml(task.id)}">Send back for revision</button>` : ""}</section><section class="detail-card"><h2>Assigned agents</h2>${task.agentIds.map((id) => { const agent = getAgent(id); return `<div class="assigned-agent">${renderRobotMarkup(agent, ["assigned", "in_progress", "quality_check"].includes(task.status) ? "working" : "idle")}<span><strong>${agent.name}</strong><small>${agent.title}</small></span></div>`; }).join("")}</section></aside></div><section class="detail-card history-card"><h2>Activity history</h2><ol class="task-history">${[...task.activity].reverse().map((event) => `<li><i></i><div><strong>${escapeHtml(event.actor === "contributor" ? "You" : getAgent(event.actor).name)}</strong><p>${escapeHtml(event.detail)}</p><time>${new Date(event.occurredAt).toLocaleString()}</time></div></li>`).join("")}</ol></section><p class="demo-disclosure">Drafts are generated from task text using local templates. No web research, repository access, external actions, or approval occurs in this demo.</p></section>`;
}

function renderReviewQueue() {
  const pending = tasks.filter((t) => t.status === "open_for_review");
  return `<section class="page-wrap"><header class="page-heading"><div><p class="eyebrow">YOUR DECISION</p><h1>Review Queue</h1><p>Nothing moves to approved until you explicitly approve it.</p></div></header>${pending.length ? `<div class="review-queue-list">${pending.map((task) => `<article class="review-queue-card"><span class="review-queue-symbol">✓</span><div><span class="task-id">${escapeHtml(task.id)}</span><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(task.review?.summary || "Crew draft ready for review.")}</p><div class="task-agents">${task.agentIds.map((id) => `<span class="task-agent-chip">${getAgent(id).icon} ${getAgent(id).name}</span>`).join("")}</div></div><button class="button button-primary" data-action="task-details" data-task-id="${escapeHtml(task.id)}">Review result →</button></article>`).join("")}</div>` : `<div class="empty-task review-empty"><span>✓</span><h2>Your review queue is clear</h2><p>When a crew completes a draft, it will wait here for your decision.</p><button class="button button-secondary" data-action="go-workflow">View task workflow</button></div>`}</section>`;
}

function renderAgentProfile() {
  const agent = getAgent(activeAgentId);
  const task = activeTaskForAgent(agent.id);
  return `<section class="page-wrap agent-profile-page"><button class="back-link" data-action="go-agents">← Back to Agent Crew</button><article class="agent-profile-card">${renderRobotMarkup(agent, task ? "working" : "idle")}<p class="eyebrow">SPECIALIST ROBOT</p><h1>${escapeHtml(agent.name)}</h1><h2>${escapeHtml(agent.title)}</h2><p>${escapeHtml(agent.description)}</p><div class="agent-profile-speciality"><strong>Specialises in</strong><span>${escapeHtml(agent.specialisation)}</span></div><div class="agent-profile-speciality"><strong>Current status</strong><span>${task ? `Working on ${escapeHtml(task.id)} · ${escapeHtml(task.title)}` : "Available for a new task"}</span></div><p class="demo-disclosure">Contributions are generated from the task brief using local templates. This agent does not access external services or act outside this workspace.</p><div class="agent-profile-actions"><button class="button button-primary" data-action="go-overview">Create a task</button><button class="button button-secondary" data-action="agent-chat">Chat with ${escapeHtml(agent.name)}</button></div></article></section>`;
}

function renderTaskActivity() {
  const entries = tasks.flatMap((task) => task.activity.map((event) => ({ ...event, task }))).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return `<section class="page-wrap"><header class="page-heading"><div><p class="eyebrow">TASK AUDIT TRAIL</p><h1>Activity</h1><p>Recorded task state changes and review decisions from this browser.</p></div></header>${entries.length ? `<ol class="task-activity-list">${entries.map((event) => `<li><i></i><div><strong>${escapeHtml(event.actor === "contributor" ? "You" : getAgent(event.actor).name)}</strong><p>${escapeHtml(event.detail)}</p><button class="text-button" data-action="task-details" data-task-id="${escapeHtml(event.task.id)}">${escapeHtml(event.task.id)} · ${escapeHtml(event.task.title)}</button><time>${new Date(event.occurredAt).toLocaleString()}</time></div></li>`).join("")}</ol>` : `<div class="empty-task"><span>◷</span><h2>No activity yet</h2><p>Task updates and decisions will be recorded here.</p></div>`}</section>`;
}

function render() {
  const active = view === "overview" ? renderOverview() : view === "workflow" ? renderWorkflow() : view === "task-details" && taskById(selectedTaskId) ? renderTaskDetails(taskById(selectedTaskId)) : view === "review" ? renderReviewQueue() : view === "task-activity" ? renderTaskActivity() : view === "activity" ? renderActivity() : view === "preferences" ? renderPreferences() : view === "agent-profile" ? renderAgentProfile() : view === "agents" ? renderAgentsPage((id) => activeTaskForAgent(id) ? "Working" : "Available") : view === "approvals" ? renderApprovals() : view === "settings" ? renderSettings() : view === "profile" ? renderProfile() : view === "notifications" ? renderNotifications() : renderScout();
  const unreadNotifications = appSettings.notificationsEnabled ? state.auditEvents.filter((event) => new Date(event.occurredAt).getTime() > notificationsReadAt).length : 0;
  root.innerHTML = `<div class="app-shell ${sidebarOpen ? "sidebar-open" : ""}"><aside class="sidebar" aria-label="Workspace navigation"><div class="sidebar-brand-row"><button class="brand" type="button" data-action="go-overview" aria-label="Ziki home"><span class="brand-mark">z</span><span>ziki</span></button><button class="sidebar-close" data-action="close-sidebar" aria-label="Close navigation">×</button></div>
    <button class="button button-primary sidebar-new-chat" data-action="go-overview">＋ Create a task</button>
    <nav class="workspace-nav primary-workspace-nav" aria-label="Workspace"><button class="nav-link ${view === "overview" ? "is-current" : ""}" data-action="go-overview"><span class="nav-icon">⌂</span> Overview</button><button class="nav-link ${view === "agents" ? "is-current" : ""}" data-action="go-agents"><span class="nav-icon">✦</span> Agent Crew</button><button class="nav-link ${["workflow", "task-details"].includes(view) ? "is-current" : ""}" data-action="go-workflow"><span class="nav-icon">▤</span> Task Workflow <span class="nav-count">${tasks.length}</span></button><button class="nav-link ${view === "task-activity" ? "is-current" : ""}" data-action="go-task-activity"><span class="nav-icon">◷</span> Activity</button><button class="nav-link ${view === "review" ? "is-current" : ""}" data-action="go-review"><span class="nav-icon">✓</span> Review Queue <span class="nav-count">${tasks.filter((t) => t.status === "open_for_review").length}</span></button><button class="nav-link ${view === "settings" ? "is-current" : ""}" data-action="go-settings"><span class="nav-icon">⚙</span> Settings</button></nav>
    <div class="sidebar-section agents-sidebar-section"><div class="sidebar-section-heading"><span>YOUR AGENT CREW</span></div><nav class="agent-nav" aria-label="Agent team">${AGENTS.map((agent) => `<button class="agent-nav-item" data-action="agent-details" data-agent-id="${agent.id}"><span class="agent-icon agent-${agent.color}" aria-hidden="true">${agent.icon}</span><span>${agent.name}</span></button>`).join("")}</nav></div>
    <nav class="workspace-nav secondary-workspace-nav" aria-label="More workspace features"><button class="nav-link ${view === "scout" ? "is-current" : ""}" data-action="go-scout"><span class="nav-icon">⌕</span> Contribution Scout</button><button class="nav-link" data-action="new-conversation"><span class="nav-icon">✉</span> Agent Chat</button><button class="nav-link ${view === "approvals" ? "is-current" : ""}" data-action="go-approvals"><span class="nav-icon">◉</span> Plan Approvals</button></nav>
    <div class="sidebar-bottom"><button class="profile-link" data-action="go-profile"><span class="avatar">${escapeHtml((profile.name || "C").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(profile.name || "Contributor")}</strong><small>Local profile</small></span><span aria-hidden="true">···</span></button><span class="prototype-label"><span></span> SIMULATED WORKSPACE</span><button class="text-button reset-link" data-action="reset">Reset demo data</button></div></aside><button class="sidebar-backdrop" data-action="close-sidebar" aria-label="Close navigation"></button><div class="app-main"><header class="topbar"><button class="mobile-menu" data-action="toggle-sidebar" aria-label="Toggle navigation" aria-expanded="${sidebarOpen}">☰</button><div class="topbar-context">${view === "overview" ? "Overview" : view === "workflow" || view === "task-details" ? "Task Workflow" : view === "task-activity" ? "Activity" : view === "review" ? "Review Queue" : view === "activity" ? "Contribution Activity" : view === "preferences" ? "Your contributor brief" : view === "agents" ? "Agent Crew" : view === "approvals" ? "Plan Approvals" : view === "settings" ? "Settings" : view === "profile" ? "Profile" : view === "notifications" ? "Notifications" : "Contribution Scout"}</div><div class="topbar-right"><button class="icon-button notification-button" data-action="go-notifications" aria-label="Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ""}" title="Notifications">♧${unreadNotifications ? `<span class="notification-badge">${unreadNotifications}</span>` : ""}</button><button class="avatar profile-avatar" data-action="go-profile" aria-label="Open profile">${escapeHtml((profile.name || "C").slice(0, 1).toUpperCase())}</button></div></header>
    <main id="main-content">${active}</main>
    <footer class="footer"><span>Ziki · multi-agent workspace</span><span>Local demo state only · <button class="text-button" data-action="reset">Reset demo</button></span></footer>
    <div class="sr-only" aria-live="polite" id="announcer">${discoveryStatus === "loading" ? "Loading recommendations" : ""}</div>
    ${appSettings.showCompanion ? renderCompanion() : ""}</div></div>`;
}

function createAgentReply(conversationId, sourceText) {
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  try {
    const response = getAgent(conversation.agentId).respond(sourceText);
    const reply = typeof response === "string" ? { text: response } : response;
    conversation.messages.push({ id: makeId("message"), role: "agent", agentId: conversation.agentId, text: reply.text, action: reply.action, actionLabel: reply.actionLabel, createdAt: Date.now() });
    conversation.updatedAt = Date.now();
    persistConversations();
  } catch (error) {
    errorMessage = `The local response could not be prepared: ${error.message}`;
  }
  if (agentBusyConversationId === conversationId) agentBusyConversationId = "";
  if (currentConversationId === conversationId && view === "scout") {
    render();
    root.querySelector("#chat-input")?.focus();
    const panel = root.querySelector("#conversation-messages");
    panel?.scrollTo({ top: panel.scrollHeight, behavior: "smooth" });
  }
}

function respondToMessage(value) {
  const text = value.trim();
  if (!text || agentBusyConversationId) return;
  const conversation = ensureConversation();
  conversation.agentId = activeAgentId;
  if (!conversation.messages.length) conversation.title = text.length > 48 ? `${text.slice(0, 45)}…` : text;
  conversation.messages.push({ id: makeId("message"), role: "user", agentId: activeAgentId, text, createdAt: Date.now() });
  conversation.updatedAt = Date.now();
  persistConversations();
  agentBusyConversationId = conversation.id;
  render();
  clearTimeout(agentBusyTimer);
  agentBusyTimer = setTimeout(() => createAgentReply(conversation.id, text), 300);
}

function retryLastResponse() {
  const conversation = currentConversation();
  if (!conversation || agentBusyConversationId) return;
  const lastUserMessage = [...conversation.messages].reverse().find((message) => message.role === "user");
  if (!lastUserMessage) return;
  if (conversation.messages.at(-1)?.role === "agent") conversation.messages.pop();
  agentBusyConversationId = conversation.id;
  render();
  clearTimeout(agentBusyTimer);
  agentBusyTimer = setTimeout(() => createAgentReply(conversation.id, lastUserMessage.text), 300);
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setFormErrors(form, errors) {
  form.querySelectorAll(".field-error").forEach((node) => { node.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach((node) => node.removeAttribute("aria-invalid"));
  for (const [field, message] of Object.entries(errors)) {
    const input = form.elements.namedItem(field);
    const error = form.querySelector(`[data-error="${field}"]`);
    if (input) input.setAttribute("aria-invalid", "true");
    if (error) error.textContent = message;
  }
  const firstInvalid = form.querySelector('[aria-invalid="true"]');
  if (firstInvalid) firstInvalid.focus();
}

root.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.matches("#task-form")) {
    event.preventDefault();
    try {
      const task = createTask(formValues(form));
      tasks.unshift(task);
      saveTasks(tasks);
      selectedTaskId = task.id;
      taskToast = "Task received. Assign your specialist crew when you're ready.";
      view = "task-details";
      render();
    } catch (error) { taskToast = error.message; render(); }
    return;
  }
  if (form.matches("#chat-form")) {
    event.preventDefault();
    const input = form.elements.namedItem("message");
    respondToMessage(input.value);
    return;
  }
  if (form.matches("#settings-form")) {
    event.preventDefault();
    const values = formValues(form);
    appSettings = { ...appSettings, defaultAgentId: getAgent(values.defaultAgentId).id, notificationsEnabled: form.elements.namedItem("notificationsEnabled").checked, showCompanion: form.elements.namedItem("showCompanion").checked };
    writeLocal(SETTINGS_KEY, appSettings);
    settingsMessage = "Settings saved in this browser.";
    pauseCompanion();
    render();
    return;
  }
  if (form.matches("#profile-form")) {
    event.preventDefault();
    const values = formValues(form);
    profile = { name: values.name.trim() || "Contributor", email: values.email.trim() };
    writeLocal(PROFILE_KEY, profile);
    settingsMessage = "Profile updated in this browser.";
    render();
    return;
  }
  if (!form.matches(".preferences-form")) return;
  event.preventDefault();
  const values = formValues(form);
  const errors = validatePreferences(values);
  setFormErrors(form, errors);
  if (Object.keys(errors).length) return;

  discoveryStatus = "loading";
  render();
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    dispatch({ type: "SAVE_PREFERENCES", preferences: values, actor: "contributor" });
    discoveryStatus = "idle";
    view = "scout";
    render();
  }, 350);
});

root.addEventListener("keydown", (event) => {
  if (event.target.matches("#chat-input") && event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.target.form.requestSubmit();
  }
  if (event.key === "Escape" && sidebarOpen) {
    sidebarOpen = false;
    render();
    root.querySelector(".mobile-menu")?.focus();
  }
  if (event.target.matches(".recent-delete") && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    event.target.click();
  }
});

root.addEventListener("input", (event) => {
  if (event.target.matches("#task-search")) { taskSearch = event.target.value; const query = taskSearch.toLowerCase(); const cards = [...root.querySelectorAll(".workflow-grid .task-card")]; cards.forEach((card) => { card.hidden = !card.textContent.toLowerCase().includes(query); }); const grid = root.querySelector(".workflow-grid"); const hasMatch = cards.some((card) => !card.hidden); let empty = root.querySelector(".workflow-search-empty"); if (!hasMatch && cards.length && !empty) { grid.insertAdjacentHTML("afterend", `<div class="empty-task workflow-search-empty"><span>⌕</span><h3>No matching tasks</h3><p>Try another title, task ID, or description.</p></div>`); empty = root.querySelector(".workflow-search-empty"); } else if (hasMatch && empty) empty.remove(); return; }
  if (!event.target.matches("#conversation-search")) return;
  conversationSearch = event.target.value;
  const query = conversationSearch.trim().toLowerCase();
  root.querySelectorAll(".recent-row").forEach((row) => {
    row.hidden = !row.querySelector(".recent-conversation strong").textContent.toLowerCase().includes(query);
  });
  const visible = [...root.querySelectorAll(".recent-row")].some((row) => !row.hidden);
  const list = root.querySelector(".recent-list");
  const empty = list.querySelector(".no-conversations");
  if (!visible && !empty) list.insertAdjacentHTML("beforeend", `<p class="no-conversations">${query ? "No matching conversations." : "Your conversations will appear here."}</p>`);
  else if (visible && empty) empty.remove();
});

root.addEventListener("change", (event) => {
  if (event.target.matches("#task-status-filter")) taskFilter = event.target.value;
  else if (event.target.matches("#task-category-filter")) taskCategoryFilter = event.target.value;
  else return;
  render();
});

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  recordCompanionActivity();
  const action = button.dataset.action;
  const issueId = button.dataset.issueId ?? currentIssue()?.id;
  if (["go-overview", "go-workflow", "go-review", "go-task-activity", "go-agents", "go-scout", "new-conversation", "go-settings", "go-profile", "go-notifications"].includes(action) && companionMessageKind !== "help") {
    companionVisible = false;
    companionMessageKind = "";
  }

  if (action === "companion-help") {
    companionMessageKind = "help";
    setCompanion("greeting", companionHelpMessage, true);
    return;
  }
  if (action === "companion-dismiss") {
    if (companionMessageKind === "greeting") companionGreetingDismissed = true;
    companionMessageKind = "";
    setCompanion("idle", companionMessage, false);
    return;
  }
  if (action === "close-sidebar") { sidebarOpen = false; render(); root.querySelector(".mobile-menu")?.focus(); return; }
  if (action === "toggle-sidebar") { sidebarOpen = !sidebarOpen; render(); return; }
  if (action === "go-overview") { view = "overview"; sidebarOpen = false; taskToast = ""; render(); return; }
  if (action === "go-workflow") { view = "workflow"; sidebarOpen = false; render(); return; }
  if (action === "go-review") { view = "review"; sidebarOpen = false; render(); return; }
  if (action === "go-task-activity") { view = "task-activity"; sidebarOpen = false; render(); return; }
  if (action === "clear-task-toast") { taskToast = ""; render(); return; }
  if (action === "task-details") { selectedTaskId = button.dataset.taskId; view = "task-details"; sidebarOpen = false; taskToast = ""; render(); return; }
  if (action === "agent-details") { activeAgentId = button.dataset.agentId; view = "agent-profile"; sidebarOpen = false; render(); return; }
  if (action === "agent-chat") { selectAgent(activeAgentId); return; }
  if (action === "task-assign") { updateTask(button.dataset.taskId, { type: "ASSIGN" }); return; }
  if (action === "task-start") { updateTask(button.dataset.taskId, { type: "START" }); return; }
  if (action === "task-check") { updateTask(button.dataset.taskId, { type: "CHECK" }); return; }
  if (action === "task-review-open") { updateTask(button.dataset.taskId, { type: "REVIEW" }); return; }
  if (action === "task-approve") { updateTask(button.dataset.taskId, { type: "APPROVE" }); return; }
  if (action === "task-revision") { updateTask(button.dataset.taskId, { type: "REQUEST_REVISION", feedback: root.querySelector("#revision-feedback")?.value || "" }); return; }
  if (action === "task-resubmit") { updateTask(button.dataset.taskId, { type: "RESUBMIT" }); return; }
  if (action === "task-cancel") { updateTask(button.dataset.taskId, { type: "CANCEL" }); return; }
  if (action === "task-block") { updateTask(button.dataset.taskId, { type: "BLOCK", reason: "Waiting for more information from the task owner." }); return; }
  if (action === "task-unblock") { updateTask(button.dataset.taskId, { type: "UNBLOCK" }); return; }
  if (action === "new-conversation") { newConversation(); view = "scout"; sidebarOpen = false; errorMessage = ""; render(); root.querySelector("#chat-input")?.focus(); return; }
  if (action === "send-prompt") { respondToMessage(button.dataset.prompt ?? ""); return; }
  if (action === "select-agent") { selectAgent(button.dataset.agentId); return; }
  if (action === "browse-agents" || action === "go-agents") { view = "agents"; sidebarOpen = false; render(); return; }
  if (action === "select-conversation") { selectConversation(button.dataset.conversationId); return; }
  if (action === "delete-conversation") {
    const id = button.dataset.conversationId;
    const conversation = conversations.find((item) => item.id === id);
    if (!conversation || !window.confirm(`Delete “${conversation.title}”? This removes it from this browser.`)) return;
    conversations = conversations.filter((item) => item.id !== id);
    if (currentConversationId === id) currentConversationId = "";
    persistConversations();
    ensureConversation();
    render();
    return;
  }
  if (action === "clear-search") { conversationSearch = ""; render(); root.querySelector("#conversation-search")?.focus(); return; }
  if (action === "go-scout") { view = "scout"; sidebarOpen = false; errorMessage = ""; render(); return; }
  if (action === "go-activity") { view = "activity"; sidebarOpen = false; render(); return; }
  if (action === "go-approvals") { view = "approvals"; sidebarOpen = false; render(); return; }
  if (action === "go-settings") { view = "settings"; settingsMessage = ""; sidebarOpen = false; render(); return; }
  if (action === "go-profile") { view = "profile"; settingsMessage = ""; sidebarOpen = false; render(); return; }
  if (action === "go-notifications") { view = "notifications"; sidebarOpen = false; render(); return; }
  if (action === "edit-preferences") { view = "preferences"; sidebarOpen = false; render(); root.querySelector("#project")?.focus(); return; }
  if (action === "open-approval") {
    dispatch({ type: "SELECT_ISSUE", issueId: button.dataset.issueId, actor: "contributor" });
    view = "scout";
    sidebarOpen = false;
    render();
    return;
  }
  if (action === "mark-notifications-read") {
    notificationsReadAt = Date.now();
    writeLocal(NOTIFICATION_READ_KEY, notificationsReadAt);
    render();
    return;
  }
  if (action === "clear-conversation") {
    if (!window.confirm("Clear the messages in this conversation?")) return;
    const conversation = currentConversation();
    if (conversation) { conversation.messages = []; conversation.title = "New conversation"; conversation.updatedAt = Date.now(); persistConversations(); }
    render();
    return;
  }
  if (action === "copy-message") {
    const message = currentConversation()?.messages.find((item) => item.id === button.dataset.messageId);
    if (!message) return;
    if (!navigator.clipboard?.writeText) { errorMessage = "Clipboard access is unavailable in this browser."; render(); return; }
    navigator.clipboard.writeText(message.text).then(() => { copyMessageId = message.id; render(); setTimeout(() => { copyMessageId = ""; render(); }, 1400); }).catch(() => { errorMessage = "Clipboard access is unavailable in this browser."; render(); });
    return;
  }
  if (action === "retry-response") { retryLastResponse(); return; }
  if (action === "dismiss-error") { errorMessage = ""; discoveryStatus = "idle"; render(); return; }
  if (action === "live-search") {
    view = "scout";
    discoveryStatus = "error";
    errorMessage = "No authorized live integration is configured. No request was made.";
    render();
    return;
  }
  if (action === "refresh-demo") {
    discoveryStatus = "loading";
    render();
    clearTimeout(loadingTimer);
    loadingTimer = setTimeout(() => { discoveryStatus = "idle"; render(); }, 350);
    return;
  }
  if (action === "reset") {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { errorMessage = `Could not clear local demo state: ${error.message}`; render(); return; }
    clearTimeout(loadingTimer);
    state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
    try { localStorage.removeItem(CONVERSATIONS_KEY); localStorage.removeItem(NOTIFICATION_READ_KEY); localStorage.removeItem(TASKS_STORAGE_KEY); } catch {}
    tasks = [];
    conversations = [];
    currentConversationId = "";
    conversationSearch = "";
    newConversation();
    view = "overview";
    discoveryStatus = "idle";
    errorMessage = "";
    render();
    return;
  }
  if (action === "select-issue") {
    companionMessageKind = "context";
    setCompanion("thinking", "Let's inspect its evidence. Selecting a fixture does not authorize work.", true);
    dispatch({ type: "SELECT_ISSUE", issueId, actor: "contributor" });
    return;
  }
  if (action === "show-revision") { root.querySelector("#revision-form")?.classList.remove("hidden"); root.querySelector("#revision-request")?.focus(); return; }
  if (action === "cancel-revision") { root.querySelector("#revision-form")?.classList.add("hidden"); return; }
  if (action === "request-revision") {
    const request = root.querySelector("#revision-request")?.value ?? "";
    companionMessageKind = "context";
    setCompanion("thinking", "I'll help refine the proposal; a revision request does not authorize work.", true);
    dispatch({ type: "REQUEST_REVISION", issueId, request, actor: "contributor" });
    return;
  }
  if (action === "propose-revision") {
    const request = state.plans[issueId].revisionRequest;
    companionMessageKind = "context";
    setCompanion("thinking", "Review the revised plan carefully; material changes need renewed approval.", true);
    dispatch({ type: "PROPOSE_REVISION", issueId, change: request, actor: "agent" });
    return;
  }
  if (action === "reject-plan") {
    companionMessageKind = "context";
    setCompanion("concerned", "Proposal declined. Nothing is authorized, and no work will start.", true);
    dispatch({ type: "REJECT_PLAN", issueId, reason: "Contributor declined this proposed plan.", actor: "contributor" });
    return;
  }
  if (action === "approve-plan") {
    const acceptedPermissions = [...root.querySelectorAll('input[name="permission"]:checked')].map((input) => input.value);
    const previousApprovalCount = state.approvals.length;
    companionMessageKind = "context";
    setCompanion("thinking", "Checking the exact plan version and permissions you chose.", true);
    dispatch({ type: "APPROVE_PLAN", issueId, acceptedPermissions, actor: "contributor" });
    if (state.approvals.length > previousApprovalCount) {
      setCompanion("celebrating", "This exact plan revision is approved. Work remains simulated.", true);
    }
    return;
  }
  if (action === "begin-work") {
    companionMessageKind = "context";
    setCompanion("celebrating", "The explicitly approved plan is now running as a local simulation.", true);
    dispatch({ type: "BEGIN_WORK", issueId });
    return;
  }
  if (action === "show-scope-change") { root.querySelector("#scope-form")?.classList.remove("hidden"); root.querySelector("#scope-change")?.focus(); return; }
  if (action === "cancel-scope-change") { root.querySelector("#scope-form")?.classList.add("hidden"); return; }
  if (action === "submit-scope-change") {
    const change = root.querySelector("#scope-change")?.value ?? "";
    companionMessageKind = "context";
    setCompanion("concerned", "The scope changed. This plan needs renewed approval before work can continue.", true);
    dispatch({ type: "CHANGE_SCOPE", issueId, change });
    return;
  }
  if (action === "resume-work") {
    companionMessageKind = "context";
    setCompanion("thinking", "Resuming only under the current approved plan.", true);
    dispatch({ type: "RESUME_WORK", issueId });
  }
});

let hoveredIssueId = "";
root.addEventListener("pointerover", (event) => {
  const card = event.target.closest?.(".issue-card");
  if (!card || card.dataset.issueId === hoveredIssueId) return;
  hoveredIssueId = card.dataset.issueId;
  companionMessageKind = "context";
  setCompanion("noticing", "Curious about this one? Opening it only shows the demo plan.", true);
});

root.addEventListener("pointerout", (event) => {
  const card = event.target.closest?.(".issue-card");
  if (!card || card.contains(event.relatedTarget)) return;
  if (card.dataset.issueId === hoveredIssueId) hoveredIssueId = "";
  if (companionMessageKind === "context") setCompanion("idle", companionMessage, false);
});

root.addEventListener("focusin", (event) => {
  const card = event.target.closest?.(".issue-card");
  if (!card) return;
  companionMessageKind = "context";
  setCompanion("noticing", "Curious about this one? Opening it only shows the demo plan.", true);
});

root.addEventListener("pointermove", trackCompanionPointer, { passive: true });
root.addEventListener("pointerdown", (event) => {
  trackCompanionPointer(event);
  recordCompanionActivity();
}, { passive: true });
root.addEventListener("keydown", recordCompanionActivity);
window.addEventListener("scroll", recordCompanionActivity, { passive: true });
document.addEventListener("visibilitychange", pauseCompanion);
reducedMotionPreference.addEventListener("change", pauseCompanion);

try {
  state = load();
} catch (error) {
  state = createInitialState(DEMO_ISSUES, DEFAULT_PREFERENCES);
  errorMessage = `${error.message} Your previous data was not overwritten. Use Reset demo to start cleanly.`;
}
if (!currentConversation()) {
  currentConversationId = conversations.find((conversation) => conversation.messages.length)?.id ?? "";
}
if (!currentConversation()) newConversation();
activeAgentId = getAgent(currentConversation().agentId || appSettings.defaultAgentId).id;
currentConversation().agentId = activeAgentId;
render();
pauseCompanion();
window.addEventListener("beforeunload", () => {
  clearTimeout(loadingTimer);
  clearTimeout(companionIdleTimer);
  clearTimeout(companionExerciseTimer);
  clearTimeout(companionGreetingTimer);
  clearTimeout(companionReactionTimer);
  if (companionGazeFrame) cancelAnimationFrame(companionGazeFrame);
});


