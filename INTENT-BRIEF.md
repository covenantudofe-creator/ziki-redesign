# Ziki Issue Scout · Human ↔ Agent interaction intent brief

## WHO

**Verified facts:** The public Ziki homepage describes issue workflows for people and AI agents, with attributable actions and owner approval. The `/issues` URL redirects to sign-in.  
**Assumptions:** The prototype's contributor is a developer looking for a suitable open-source contribution; no authenticated account, repository connection, or existing prototype code was available in the configured folder.  
**Proposed behaviour:** Let the contributor state a target project or area, work preferences, skills, available time, and constraints before ranking clearly labelled demo fixtures.

## INTENT

**Verified facts:** The public homepage presents a report → confirm → authorize → deliver → prove → merge workflow. It says agents consult their owner before bidding, independent reviewers verify work, and actions are attributable.  
**Assumptions:** Issue Scout is a companion concept for discovering contribution opportunities, not a paid-gig marketplace and not a replacement for the live Ziki product.  
**Proposed behaviour:** Explain each recommendation, show evidence and unknowns, and present a reviewable plan with scope, steps, assumptions, risks, dependencies, illustrative estimate, and requested permissions. Persist the demo state locally in the browser.

## EMOTION

**Verified facts:** The public product copy emphasizes human control, independent gates, and traceability.  
**Assumptions:** Contributors should feel informed and in control rather than pressured to accept work.  
**Proposed behaviour:** Keep uncertainty visible, distinguish demo data from live evidence, and make “not authorized” explicit until the contributor approves the exact plan.

## DECISION

**Verified facts:** The public site says an agent shares its approach and estimate and waits for owner approval before bidding or accepting work.  
**Assumptions:** This prototype has no authorized issue or repository integration.  
**Proposed behaviour:** Selecting an issue, drafting a plan, ranking, and requesting a revision do not authorize work. Only the explicit approval action authorizes the displayed plan fingerprint and its separately enumerated permissions. Rejecting a proposal authorizes nothing. A revised plan or material scope change gets a new revision and requires renewed approval; scope changes pause simulated work immediately.

## OLD UI

**Verified facts:** The public `/issues` route redirects to a sign-in screen. Its visible marketing content describes issue tracking, report/vote/track, and an agent workflow. No local source files, screenshots, or authenticated UI were present in the supplied empty folder.  
**Limitation:** The authenticated original interface could not be accessed, so this work does not claim to reproduce it. No baseline screenshot was available to preserve or compare.

## CHANGE

**Proposed behaviour:** Build a responsive contributor workspace with a validated preference brief, ranked demo recommendations and rationales, issue evidence/unknowns, a detailed plan, permission checkboxes, approve/request-revision/reject actions, simulated work status, scope-change pause/reapproval, and an audit history. Demo state is saved in browser local storage. The audit history is ordered but not tamper-proof and is cleared by Reset demo. All fixtures, estimates, approval outcomes, and work transitions are visibly simulated. No real issue is fetched, no repository is read or changed, and no PR or merge is claimed.

## AI/HUMAN

**Verified facts:** Ziki's public homepage says agents discover issues, propose a plan, deliver fixes, and validate work on behalf of an owner; it describes owner consultation and independent review.  
**Proposed behaviour — agent may act independently:** Rank local demo fixtures against the contributor's brief, explain a match, and draft or revise a proposed plan. These are non-authorizing, simulated actions only.  
**Proposed behaviour — explicit human authorization required:** Approve the exact displayed plan and each listed permission before work is authorized; approve a revised plan again after changes; approve a material scope change before simulated work can resume; reject or request a revision. The prototype performs none of the underlying live repository, issue-tracker, delivery, testing, or merge actions.
