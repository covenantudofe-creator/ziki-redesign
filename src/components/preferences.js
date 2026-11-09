// Preferences component
// Renders the contributor preferences page and form
// Reuses the existing preferenceForm helper from app.js

export function renderPreferences(state, discoveryStatus, errorMessage) {
  const preferences = state.preferences;
  return `
    <section class="preference-page">
      <div>
        <p class="eyebrow">YOUR CONTRIBUTOR BRIEF</p>
        <h1>Find work that fits</h1>
        <p class="muted">Tell the demo scout what you want to contribute to. These details rank local fixtures only; they are not sent to Ziki or a repository.</p>
      </div>
      ${preferenceForm(preferences, "preferences-page-form")}
      ${discoveryStatus === "loading" ? `<div class="loading-banner" role="status"><span class="spinner"></span>Finding matching demo fixtures…</div>` : ""}
      <div class="demo-source-note">
        <strong>Live discovery unavailable</strong>
        <p>No authorized issue integration is configured. You can search labelled demo fixtures; no live API requests are made.</p>
        <button class="button button-secondary" data-action="live-search">Check live sources</button>
      </div>
    </section>
  `;
}
