export const TASKS_STORAGE_KEY = "ziki-team-tasks-v1";
export function loadTasks(storage = globalThis.localStorage) {
  try { const parsed = JSON.parse(storage.getItem(TASKS_STORAGE_KEY) || "[]"); return Array.isArray(parsed) ? parsed.filter((task) => task && typeof task.id === "string" && Array.isArray(task.activity) && Array.isArray(task.contributions)) : []; }
  catch { return []; }
}
export function saveTasks(tasks, storage = globalThis.localStorage) {
  try { storage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks)); return true; } catch { return false; }
}
