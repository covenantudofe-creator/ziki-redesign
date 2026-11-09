export const STORAGE_KEY = "ziki-issue-scout-demo-v1";

const PLAN_STATUSES = new Set(["proposed", "revision_requested", "approved", "rejected"]);
const WORK_STATUSES = new Set(["not_started", "authorized", "in_progress", "paused"]);
const STOPWORDS = new Set([
  "and", "the", "with", "for", "from", "your", "you", "work", "projects", "project",
  "open", "source", "available", "prefer", "that", "this", "into", "about", "not",
  "any", "are", "was", "have", "has", "can", "will", "who", "what", "how", "but",
  "all", "some", "more", "less", "than", "then", "only", "also", "e.g"
]);

export function createInitialState(issues, preferences) {
  const plans = Object.fromEntries(issues.map((issue) => [
    issue.id,
    {
      id: `plan-${issue.id}`,
      issueId: issue.id,
      revision: 1,
      status: "proposed",
      objective: issue.plan.objective,
      scope: issue.plan.scope,
      steps: [...issue.plan.steps],
      assumptions: [...issue.plan.assumptions],
      risks: [...issue.plan.risks],
      dependencies: [...issue.plan.dependencies],
      estimate: issue.plan.estimate,
      requestedPermissions: issue.plan.requestedPermissions.map((permission) => ({ ...permission })),
      revisionRequest: ""
    }
  ]));

  return {
    preferences: { ...preferences },
    selectedIssueId: issues[0]?.id ?? null,
    plans,
    approvals: [],
    workStatuses: Object.fromEntries(issues.map((issue) => [issue.id, "not_started"])),
    auditEvents: [],
    hasSearched: true
  };
}

export function validatePreferences(preferences) {
  const errors = {};
  const required = ["project", "focus", "skills", "hours"];
  for (const field of required) {
    if (!String(preferences[field] ?? "").trim()) errors[field] = "This field is required.";
  }
  const hours = Number(preferences.hours);
  if (preferences.hours && (!Number.isFinite(hours) || hours <= 0 || hours > 168)) {
    errors.hours = "Enter a number of hours between 1 and 168.";
  }
  return errors;
}

export function rankIssues(issues, preferences) {
  const terms = `${preferences.focus} ${preferences.skills}`.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean);
  const availableHours = Number(preferences.hours);
  return issues
    .map((issue) => {
      const text = `${issue.title} ${issue.summary} ${issue.labels.join(" ")} ${issue.language}`.toLowerCase();
      const matched = [...new Set(terms.filter((term) =>
        term.length > 2 && !STOPWORDS.has(term) && text.includes(term)
      ))];
      const fitsTime = issue.estimatedHours.max <= availableHours;
      const matchScore = Math.min(98, 50 + matched.length * 12 + (fitsTime ? 10 : 0));
      const rationale = [
        ...matched.map((term) => `Your preference “${term}” is reflected in this fixture.`),
        fitsTime
          ? "The illustrative estimate fits within your available time."
          : "The illustrative estimate is longer than your available time.",
        "Project fit is unknown; this fixture is not linked to a verified repository."
      ];
      return { issue, matchScore, matchedTerms: matched, fitsTime, rationale };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function planFingerprint(plan) {
  const exactDisplayedPlan = {
    id: plan.id,
    issueId: plan.issueId,
    revision: plan.revision,
    objective: plan.objective,
    scope: plan.scope,
    steps: plan.steps,
    assumptions: plan.assumptions,
    risks: plan.risks,
    dependencies: plan.dependencies,
    estimate: plan.estimate,
    requestedPermissions: plan.requestedPermissions
  };
  return JSON.stringify(exactDisplayedPlan);
}

export function isApprovalCurrent(state, issueId) {
  const plan = state.plans[issueId];
  const approval = [...state.approvals].reverse().find((item) => item.issueId === issueId);
  return Boolean(
    plan &&
    approval &&
    plan.status === "approved" &&
    approval.planFingerprint === planFingerprint(plan)
  );
}

export function applyAction(state, action, issues, now = new Date().toISOString()) {
  const next = structuredClone(state);
  const issue = issues.find((item) => item.id === action.issueId);
  const plan = next.plans[action.issueId];

  const addEvent = (type, detail, revision = plan?.revision ?? null) => {
    next.auditEvents.push({
      id: `event-${next.auditEvents.length + 1}`,
      type,
      issueId: action.issueId ?? null,
      actor: action.actor ?? "contributor",
      detail,
      planRevision: revision,
      occurredAt: now,
      simulated: true
    });
  };

  if (action.type === "SAVE_PREFERENCES") {
    const errors = validatePreferences(action.preferences);
    if (Object.keys(errors).length) throw new Error("Please correct the highlighted preference fields.");
    next.preferences = { ...action.preferences };
    next.hasSearched = true;
    addEvent("preferences.saved", "Contributor preferences were updated; no issue was selected or authorized.", null);
    return next;
  }

  if (action.type === "SELECT_ISSUE") {
    if (!issue) throw new Error("That demo issue is not available.");
    next.selectedIssueId = issue.id;
    addEvent("issue.selected", "Contributor opened a recommendation. Selection does not authorize work.", null);
    return next;
  }

  if (!issue || !plan) throw new Error("The requested plan is not available.");

  switch (action.type) {
    case "APPROVE_PLAN": {
      if (plan.status !== "proposed") throw new Error("Only a proposed plan can be approved.");
      const requiredPermissions = plan.requestedPermissions.map((permission) => permission.id);
      const acceptedPermissions = [...new Set(action.acceptedPermissions ?? [])];
      if (requiredPermissions.some((permission) => !acceptedPermissions.includes(permission))) {
        throw new Error("Review and explicitly approve every requested permission before approving this plan.");
      }
      const fingerprint = planFingerprint(plan);
      next.approvals.push({
        issueId: issue.id,
        planRevision: plan.revision,
        planFingerprint: fingerprint,
        acceptedPermissions,
        approvedAt: now,
        actor: "contributor",
        simulated: true
      });
      plan.status = "approved";
      if (next.workStatuses[issue.id] === "not_started") next.workStatuses[issue.id] = "authorized";
      addEvent("plan.approved", `Contributor approved plan revision ${plan.revision} and its listed permissions. Approval applies only to the displayed plan fingerprint.`, plan.revision);
      return next;
    }
    case "REQUEST_REVISION": {
      if (plan.status !== "proposed") throw new Error("Changes can only be requested on a proposed plan.");
      const request = String(action.request ?? "").trim();
      if (!request) throw new Error("Describe the change you want before requesting a revision.");
      plan.status = "revision_requested";
      plan.revisionRequest = request;
      addEvent("plan.revision_requested", `Contributor requested a plan revision: ${request}`);
      return next;
    }
    case "PROPOSE_REVISION": {
      if (plan.status !== "revision_requested") throw new Error("A revision can only be proposed after the contributor requests changes.");
      const change = String(action.change ?? "").trim();
      if (!change) throw new Error("Describe the revised scope before proposing it.");
      plan.revision += 1;
      plan.scope = `${plan.scope} Revised per contributor request: ${change}`;
      plan.steps = [...plan.steps, `Address the requested revision: ${change}`];
      plan.status = "proposed";
      plan.revisionRequest = "";
      addEvent("plan.revised", `Simulated agent proposed revision ${plan.revision}: ${change}`);
      return next;
    }
    case "REJECT_PLAN": {
      if (!["proposed", "revision_requested"].includes(plan.status)) throw new Error("Only an unapproved proposal can be rejected.");
      const reason = String(action.reason ?? "").trim();
      plan.status = "rejected";
      addEvent("plan.rejected", reason ? `Contributor rejected the proposal: ${reason}` : "Contributor rejected the proposed plan. No work was authorized.");
      return next;
    }
    case "BEGIN_WORK": {
      if (!isApprovalCurrent(next, issue.id) || next.workStatuses[issue.id] !== "authorized") {
        throw new Error("Work can only begin after the exact current plan has been approved.");
      }
      next.workStatuses[issue.id] = "in_progress";
      addEvent("work.started", "Simulated work started within the approved plan scope.");
      return next;
    }
    case "CHANGE_SCOPE": {
      if (!isApprovalCurrent(next, issue.id) || !["authorized", "in_progress"].includes(next.workStatuses[issue.id])) {
        throw new Error("A scope change requires a currently approved plan with authorized work.");
      }
      const change = String(action.change ?? "").trim();
      if (!change) throw new Error("Describe the material scope change.");
      next.workStatuses[issue.id] = "paused";
      plan.revision += 1;
      plan.scope = `${plan.scope} Additional requested scope: ${change}`;
      plan.status = "proposed";
      addEvent("work.paused_scope_change", `Work paused. The changed scope requires renewed approval: ${change}`, plan.revision);
      return next;
    }
    case "RESUME_WORK": {
      if (!isApprovalCurrent(next, issue.id) || next.workStatuses[issue.id] !== "paused") {
        throw new Error("Paused work can resume only after the changed plan is explicitly approved.");
      }
      next.workStatuses[issue.id] = "in_progress";
      addEvent("work.resumed", "Simulated work resumed under the newly approved plan scope.");
      return next;
    }
    default:
      throw new Error(`Unsupported action: ${action.type}`);
  }
}

export function isKnownState(value, issues) {
  return Boolean(
    value &&
    typeof value === "object" &&
    value.preferences &&
    value.plans &&
    value.approvals instanceof Array &&
    value.auditEvents instanceof Array &&
    value.workStatuses &&
    issues.every((issue) => {
      const plan = value.plans[issue.id];
      return plan && PLAN_STATUSES.has(plan.status) && WORK_STATUSES.has(value.workStatuses[issue.id]);
    })
  );
}
