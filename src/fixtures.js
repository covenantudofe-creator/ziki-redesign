export const DEFAULT_PREFERENCES = {
  project: "Open source projects",
  focus: "Accessibility, documentation, and developer experience",
  skills: "JavaScript, accessibility, testing",
  hours: "5",
  constraints: "Prefer self-contained changes; no production credentials"
};

export const DEMO_ISSUES = [
  {
    id: "demo-101",
    title: "Keyboard users cannot reach the command palette actions",
    summary: "The illustrative report describes a command palette whose action list is not reachable with the keyboard.",
    labels: ["accessibility", "frontend"],
    language: "JavaScript",
    status: "Unknown",
    priority: "Unknown",
    evidence: "Illustrative fixture description only; not fetched from a repository or issue tracker.",
    unknowns: ["Reproduction steps have not been independently verified.", "Affected versions and repository context are unknown."],
    estimatedHours: { min: 3, max: 5, label: "3–5 hours (illustrative demo estimate)" },
    plan: {
      objective: "Investigate the keyboard access gap and propose a narrowly scoped, testable fix.",
      scope: "Inspect command-palette focus handling, implement keyboard access for the listed actions, and add focused regression tests. No unrelated refactor.",
      steps: ["Reproduce the reported interaction in a local/demo context.", "Trace focus and keyboard event handling.", "Implement the smallest accessible change.", "Add regression coverage and summarize validation."],
      assumptions: ["The issue description is accurate enough to guide investigation.", "A relevant component and test harness exist in the target project."],
      risks: ["The fixture may not represent a real or current issue.", "Keyboard behavior could vary across browsers and assistive technologies."],
      dependencies: ["Repository and test instructions would need to be supplied by an authorized integration."],
      estimate: "3–5 hours (illustrative demo estimate)",
      requestedPermissions: [
        { id: "read-issue", label: "Read issue details and comments (simulated; no live source connected)." },
        { id: "read-files", label: "Inspect relevant repository files (simulated; no repository access granted)." }
      ]
    }
  },
  {
    id: "demo-102",
    title: "Document how to configure a local development environment",
    summary: "The illustrative report describes missing setup guidance for contributors starting the project locally.",
    labels: ["documentation", "good first issue"],
    language: "Markdown",
    status: "Unknown",
    priority: "Unknown",
    evidence: "Illustrative fixture description only; not fetched from a repository or issue tracker.",
    unknowns: ["The current documentation and supported environments are unknown.", "No maintainer confirmation is available."],
    estimatedHours: { min: 1, max: 3, label: "1–3 hours (illustrative demo estimate)" },
    plan: {
      objective: "Identify the missing local setup details and draft a focused contributor guide.",
      scope: "Document prerequisites, setup steps, and a basic verification command based on maintainer-provided facts. Do not guess environment-specific values.",
      steps: ["Review existing project documentation.", "List setup facts that require maintainer confirmation.", "Draft the verified steps only.", "Check links and instructions for consistency."],
      assumptions: ["A maintainer can confirm project-specific setup commands.", "The existing documentation is available to an authorized integration."],
      risks: ["Unverified commands could mislead contributors.", "The fixture may duplicate existing documentation."],
      dependencies: ["Access to current project setup instructions."],
      estimate: "1–3 hours (illustrative demo estimate)",
      requestedPermissions: [
        { id: "read-docs", label: "Read existing project documentation (simulated; no repository access granted)." }
      ]
    }
  },
  {
    id: "demo-103",
    title: "Add a regression test for a stale search result",
    summary: "The illustrative report describes outdated results briefly appearing after a new search is submitted.",
    labels: ["testing", "bug"],
    language: "TypeScript",
    status: "Unknown",
    priority: "Unknown",
    evidence: "Illustrative fixture description only; not fetched from a repository or issue tracker.",
    unknowns: ["The behavior and reproduction sequence are unverified.", "The search implementation and existing tests are unknown."],
    estimatedHours: { min: 2, max: 4, label: "2–4 hours (illustrative demo estimate)" },
    plan: {
      objective: "Reproduce the stale-result behavior and add a focused regression test before proposing a fix.",
      scope: "Test overlapping searches and stale response handling. Any production behavior change requires a revised plan if it extends beyond this test-first scope.",
      steps: ["Inspect the existing search test strategy.", "Create a deterministic overlapping-request test.", "Confirm the test fails for the reported behavior.", "Report findings without claiming a fix until verified."],
      assumptions: ["The application has a testable search flow.", "The reported behavior can be reproduced without external credentials."],
      risks: ["Timing-dependent tests can be flaky.", "The issue may not reproduce in the current project."],
      dependencies: ["Access to the search module and test runner."],
      estimate: "2–4 hours (illustrative demo estimate)",
      requestedPermissions: [
        { id: "read-search", label: "Inspect search implementation and tests (simulated; no repository access granted)." }
      ]
    }
  }
];
