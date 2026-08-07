---
name: atlas-release-readiness
description: Review a release candidate against the Atlas evidence checklist and report missing proof.
---

# Atlas release readiness

Use this Skill when the user asks whether a release is ready, requests a
release checklist, or provides release evidence for review.

1. Read [`references/checklist.md`](references/checklist.md).
2. Identify the claimed version, channel, and target platforms.
3. Map the supplied evidence to every checklist item.
4. Separate blockers from follow-up improvements.
5. Never invent a passing test, signature, deployment, or approval.

Return a concise verdict followed by passed items, blockers, and the next
verification command or owner for each blocker.
