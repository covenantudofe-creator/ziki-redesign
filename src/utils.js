// Utility functions shared across components

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]));
}

export function listBlock(items, className = "") {
  if (!items?.length) return `<p class="muted">None listed.</p>`;
  return `<ul class="${className}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString();
}
