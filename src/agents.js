const prompts = ["Break this request into clear steps", "Find the key questions we should answer", "Review the result before it goes to me"];

export const AGENTS = [
  { id: "ziki", name: "Ziki", title: "Team Coordinator", icon: "✦", color: "blue", role: "Team Coordinator", description: "Coordinates the crew, keeps the brief in view, and brings the work together.", specialisation: "Coordination · handoffs · summaries", prompts },
  { id: "nova", name: "Nova", title: "Research", icon: "⌕", color: "violet", role: "Research Specialist", description: "Organizes supplied information into findings, sources to check, and open questions.", specialisation: "Research briefs · supplied material", prompts },
  { id: "pixel", name: "Pixel", title: "Design", icon: "◈", color: "pink", role: "Design Specialist", description: "Shapes user needs into interface concepts and practical design considerations.", specialisation: "Interface concepts · usability", prompts },
  { id: "codey", name: "Codey", title: "Coding", icon: "⌘", color: "cyan", role: "Coding Specialist", description: "Turns supplied code and requirements into implementation plans and review points.", specialisation: "Code review · implementation plans", prompts },
  { id: "quill", name: "Quill", title: "Writing", icon: "✎", color: "amber", role: "Writing Specialist", description: "Creates clear drafts, outlines, and edits based on the context you provide.", specialisation: "Drafts · editing · communication", prompts },
  { id: "atlas", name: "Atlas", title: "Planning", icon: "▤", color: "green", role: "Planning Specialist", description: "Breaks a goal into reviewable work, dependencies, and decisions.", specialisation: "Plans · sequencing · dependencies", prompts },
  { id: "echo", name: "Echo", title: "Quality Assurance", icon: "✓", color: "indigo", role: "Quality Assurance", description: "Checks a proposed result for gaps, clarity, and alignment with the brief.", specialisation: "Quality checks · acceptance criteria", prompts }
];
export const DEFAULT_AGENT_ID = "ziki";
const replies = {
  ziki: (message) => `Team Coordinator · local response\n\nI’ve noted: ${message}\n\nI can help you shape this into a task, suggest which specialists to involve, and explain how review works. Replies are local examples; no connected AI or external services are active.`,
  nova: (message) => `Research framing · local template\n\nQuestion: ${message}\n\nUse supplied material only, identify which sources need checking, and keep unknowns visible. No web research was performed.`,
  pixel: (message) => `Design direction · local template\n\nGoal: ${message}\n\nStart with the user's need, map the shortest useful flow, then check responsive layout, readable hierarchy, and accessible controls. No design file was created.`,
  codey: (message) => `Coding brief · local template\n\nRequest: ${message}\n\nClarify expected behavior, identify relevant files, and define a small verification step. No repository was accessed and no code was executed.`,
  quill: (message) => `Writing draft · local template\n\nPurpose: ${message}\n\nShare your audience and preferred tone to shape a useful draft. Confirm all names, dates, and claims before sending; no message was sent.`,
  atlas: (message) => `Planning outline · local template\n\nGoal: ${message}\n\n1. Define the outcome.\n2. Gather inputs and dependencies.\n3. Complete a small reviewable step.\n4. Check the result and choose what comes next.`,
  echo: (message) => `Quality checklist · local template\n\nReview target: ${message}\n\nCheck that the result matches the brief, key claims have evidence, edge cases are covered, and the next decision is clear. No external files or sources were checked.`
};
export function getAgent(id) { const agent = AGENTS.find((item) => item.id === id) ?? AGENTS[0]; return { ...agent, respond: replies[agent.id] }; }
