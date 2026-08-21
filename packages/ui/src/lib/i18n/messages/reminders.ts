/**
 * One-time feature-reminder copy, keyed by the camelCase form of the reminder
 * `id` (`jinja-templates` → `jinjaTemplates`). `FeatureReminder` entries carry
 * `eyebrowKey`/`titleKey`/`descriptionKey` dot paths; consumers resolve the
 * subtree by id via `t.reminders[reminder.id as keyof typeof t.reminders]`.
 * The `{% for %}` / `{{ variable }}` literals stay verbatim in every locale.
 */
export const reminders = {
  jinjaTemplates: {
    eyebrow: "New feature",
    title: "Jinja templating in your prompts",
    description:
      "Write prompts with real Jinja — loops, conditionals, and variables like " +
      "{% for %}, {% if %}, and {{ variable }}. Build dynamic, reusable prompt " +
      "templates that adapt to your data instead of editing text by hand.",
  },
};
