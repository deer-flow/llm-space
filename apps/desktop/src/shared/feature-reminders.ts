/**
 * One-time "what's new" reminders. Each entry is shown to the user at most once
 * ever — once seen, its `id` is recorded in `settings/reminders.json`
 * (`featureRemindersSeen`) and it never pops again. At most one reminder appears
 * per launch; the bun side (`resolveNextFeatureReminder`) picks the first unseen
 * entry in order and records it, and the renderer only has to display it.
 *
 * Definitions live in code and ship with the app: adding a new reminder is an
 * app update. Images are uploaded to GitHub and referenced here by URL.
 */
export interface FeatureReminder {
  /**
   * Stable key, stored in `featureRemindersSeen`. Never rename or reuse an id —
   * already-seen users would re-see it (or a renamed one would re-fire).
   */
  id: string;
  /** Small label above the title, e.g. "New feature". */
  eyebrow?: string;
  title: string;
  description: string;
  /** Remote (GitHub-hosted) banner image URL. */
  imageUrl: string;
  /**
   * Optional "Learn more" target. When omitted, the action falls back to the
   * `openDocument` command (the docs home).
   */
  link?: string;
}

/** Show order — append new reminders to the end, never reorder or reuse ids. */
export const FEATURE_REMINDERS: FeatureReminder[] = [
  {
    id: "jinja-templates",
    eyebrow: "New feature",
    title: "Jinja templating in your prompts",
    description:
      "Write prompts with real Jinja — loops, conditionals, and variables like " +
      "{% for %}, {% if %}, and {{ variable }}. Build dynamic, reusable prompt " +
      "templates that adapt to your data instead of editing text by hand.",
    imageUrl:
      "https://raw.githubusercontent.com/deer-flow/llm-space/main/docs/images/reminders/jinja-templates.png",
    link: "https://github.com/deer-flow/llm-space/blob/main/docs/variables-and-templates.md",
  },
];
