# WHO
Open‑source contributors (developers who want to spend a few hours on a bug, feature, or documentation) and repository maintainers exposing issues for external help. The AI agent (Ziki Issue Scout) acts as a collaborative assistant that discovers matching issues, explains its reasoning, and drafts a concrete plan. The human is the ultimate decision‑maker who reviews, revises, and authorizes any work.

# INTENT
The contributor wants to find a realistic issue that fits their skills, time, and constraints, receive a transparent, step‑by‑step plan, and then decide whether to let the agent execute that exact plan. The agent helps by:
1. Ranking demo (or live) issue fixtures against the contributor’s preferences.
2. Explaining **why** each recommendation matches.
3. Producing a detailed implementation plan with scope, steps, assumptions, risks, and required permissions.
4. Respecting the contributor’s explicit approvals and re‑authorizing only after any material change.

# EMOTION
The experience should feel **clear, trustworthy, and empowering**. Contributors see the agent’s reasoning, know exactly what will be done, and retain full control. Success comes from reducing uncertainty (showing evidence & unknowns), confirming that the human’s choices are final, and offering smooth, responsive feedback.

# DECISION
1. **Select a recommendation** – simply browsing; does **not** authorize work.
2. **Approve a plan** – an explicit click that binds the current plan fingerprint and listed permissions.
3. **Request changes** – opens a revision form; the agent must propose a new plan that is re‑approved.
4. **Reject a plan** – records a rejection and stops any further work on that issue.
5. **Scope‑change pause** – if the plan is altered after approval, work is automatically paused; the contributor must re‑approve the revised scope before work resumes.

# OLD UI
The original prototype showed a single‑page “Issue Scout” with a dark background, a sidebar navigation, a preferences form, a list of issue cards, and a panel that displayed a plan and timeline. All data were demo fixtures; there were buttons for “Approve”, “Request changes”, and “Reject”, and an audit trail. The UI used a dark‑theme palette (navy blues, teal accents) defined by CSS custom properties. No dedicated component modules existed – all rendering logic lived in `src/app.js`.

# CHANGE
* **Visual redesign** – introduced a deep‑blue (`#071A36`) primary background with white content surfaces, vivid‑blue (`#2563EB`) primary actions, and a clean, professional look matching the supplied screenshot. Updated design tokens are in `styles.css`. 
* **Component scaffolding** – extracted the preferences page into `src/components/preferences.js` and added a shared utility module `src/utils.js`. (Other UI sections remain in `app.js` for now, preserving existing functionality.)
* **State model** – unchanged (the model already enforced explicit approvals, revision flow, scope‑change pausing, and audit logging). Tests verify all required transitions.
* **Demo‑only data** – fixtures remain in `src/fixtures.js`; all UI messages clearly label data as “demo” or “simulated”.
* **Persisted demo state** – stored in localStorage under `ziki-issue-scout-demo-v1`, unchanged from the original implementation.
* **Accessibility & responsiveness** – retained existing keyboard focus handling, ARIA attributes, and responsive grid layout. Colors now meet contrast requirements with the new palette.

# AI/HUMAN
* **Agent responsibilities** – discover issues, rank them, generate a plan (objective, scope, steps, assumptions, risks, dependencies, effort estimate, permission list), and propose revisions when requested. All actions are simulated unless a live integration is configured.
* **Human responsibilities** – review the displayed plan, explicitly approve the exact revision (including each requested permission), request or reject changes, and re‑approve after any material scope change. The agent never proceeds beyond a plan without a fresh, explicit human approval.