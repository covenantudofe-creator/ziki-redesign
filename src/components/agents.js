import { AGENTS } from "../agents.js";

export function renderRobot(agent, state = "idle") {
  return `<span class="robot-avatar agent-${agent.color}" data-robot-state="${state}" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M32 8V4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="4" r="3" fill="currentColor"/><rect x="10" y="14" width="44" height="33" rx="12" fill="white" stroke="currentColor" stroke-width="2.5"/><rect x="15" y="19" width="34" height="22" rx="8" fill="currentColor"/><circle cx="24" cy="29" r="3" fill="white"/><circle cx="40" cy="29" r="3" fill="white"/><path d="M26 35q6 5 12 0" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/><rect x="21" y="49" width="22" height="8" rx="4" fill="currentColor" opacity=".8"/><path d="M16 28H8m48 0h-8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><i>${agent.icon}</i></span>`;
}

export function renderAgentCard(agent, activeAgentId = "", compact = false, status = "Available") {
  return `<article class="crew-card ${compact ? "crew-card-compact" : ""}">${renderRobot(agent, status === "Working" ? "working" : "idle")}<div class="crew-card-copy"><div class="crew-card-title"><h2>${agent.name}</h2><span class="agent-availability"><i></i>${status}</span></div><p class="crew-role">${agent.title}</p>${compact ? "" : `<p>${agent.description}</p><small>${agent.specialisation}</small>`}</div><button class="button button-secondary crew-action" type="button" data-action="agent-details" data-agent-id="${agent.id}">Profile <span aria-hidden="true">↗</span></button></article>`;
}

export function renderAgentsPage(statusForAgent = () => "Available") {
  return `<section class="page-wrap"><header class="page-heading"><div><p class="eyebrow">YOUR SPECIALIST ROBOTS</p><h1>Meet your Agent Crew</h1><p>Seven focused teammates coordinate on tasks. Every result comes back to you for review.</p></div></header><div class="crew-grid">${AGENTS.map((agent) => renderAgentCard(agent, "", false, statusForAgent(agent.id))).join("")}</div><p class="demo-disclosure">This workspace demonstrates agent collaboration with local templates. It does not connect to external research, coding, or AI services.</p></section>`;
}
