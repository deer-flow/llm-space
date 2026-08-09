English | [中文](./compaction.zh-CN.md)

---

# Conversation compaction

Conversation compaction replaces older turns with a structured checkpoint while
keeping the most recent turns unchanged. It is useful when a long-running thread
has accumulated context that is still important but no longer needs to be sent
to the model verbatim.

LLM Space implements compaction as a preview-first, progressive workflow. The
original thread is never overwritten: applying a compaction creates a new thread
next to it.

## Using compaction

1. Open a thread with at least two user turns.
2. Open the **More Actions** (`...`) menu in the thread header.
3. Choose **Compact Conversation**.
4. Read the introduction, then choose **Next**.
5. Configure how many recent turns to keep verbatim. Optionally add compaction
   instructions for facts or decisions that the checkpoint must preserve.
6. Choose **Start compact**. LLM Space renders prompt variables and generates a
   live checkpoint preview. The thread has not changed at this point.
7. Review the preview. Regenerate it if necessary, or choose **Apply
   compaction** to create the compacted copy.

The compacted thread is written alongside the source thread and opened in a new
tab. Its name uses an increasing suffix:

```text
feature-design.json
feature-design-compact-1.json
feature-design-compact-2.json
```

Recompacting `feature-design-compact-2.json` continues the same sequence instead
of producing a nested name.

## What “keep recent turns” means

A turn begins with a user message and includes the assistant response and tool
activity that follow it. If a thread has eight turns and **Keep recent turns** is
set to three, the first five turns become one checkpoint and the final three
remain byte-for-byte unchanged.

```text
Before                              After
┌──────────────────────────┐        ┌──────────────────────────┐
│ older turn 1             │        │ structured checkpoint    │
│ older turn 2             │        │ (turns 1–5)              │
│ older turn 3             │   →    ├──────────────────────────┤
│ older turn 4             │        │ recent turn 6 (exact)    │
│ older turn 5             │        │ recent turn 7 (exact)    │
│ recent turns 6–8         │        │ recent turn 8 (exact)    │
└──────────────────────────┘        └──────────────────────────┘
```

The UI always leaves at least one real turn outside the checkpoint so the new
thread retains a verbatim continuation point.

## Compaction instructions

The optional **Compaction instructions** field adds thread-specific guidance to
the summarizer, for example:

```text
Preserve exact file paths, API decisions, unresolved errors, and the user's UI
preferences.
```

Instructions are saved in `thread.meta.compactionInstructions`. They are reused
the next time the thread is compacted, but they are not added to ordinary model
runs.

## Resulting message layout

The checkpoint is a synthetic user message wrapped in a system reminder:

```xml
<system-reminder>
The earlier conversation was compacted into the checkpoint below. Use it as
context to continue the task; it is not a new user request.

# Context checkpoint

## Goal
...
</system-reminder>
```

The complete message order is:

1. The meta user prompt, when the thread has one.
2. The synthetic compaction checkpoint.
3. The configured number of recent turns, unchanged.

When no meta user prompt exists, the checkpoint becomes the first user message.
This keeps reusable runtime instructions ahead of the checkpoint without
mistaking them for conversation history.

## Progressive compaction

Compaction is progressive rather than destructive. When a compacted thread is
compacted again, LLM Space sends both the previous checkpoint and the newly
aged-out turns to the summarizer. The model updates the checkpoint, preserving
still-relevant goals, constraints, decisions, paths, errors, and progress while
recent turns continue moving through the verbatim window.

```text
First compaction:   [turns 1–5]        → checkpoint A + turns 6–8
Next compaction:    [checkpoint A + 6] → checkpoint B + turns 7–9
```

The existing checkpoint message ID is reused inside the cloned thread so it is
treated as an evolving checkpoint rather than an additional conversation turn.

## Implementation

The compaction semantics belong to LLM Space rather than to a pi-agent-core
compaction API:

- `packages/core/src/thread/compaction.ts` identifies turn boundaries, separates
  the summarizable and retained spans, serializes messages and tool activity,
  constructs the summarizer prompt, detects previous checkpoints, and rebuilds
  the final message list.
- `packages/ui/src/components/thread-playground/thread-compaction-dialog.tsx`
  implements the three-step wizard, instruction persistence, prompt rendering,
  streaming preview, and confirmation flow.
- `packages/ui/src/components/thread-playground/use-stream-text.ts` sends the
  summarizer request through the normal LLM Space streaming transport.
- `apps/desktop/src/components/thread-tabs/thread-tab-pane.tsx` writes and opens
  the compacted clone after confirmation.

Prompt variables, enabled skills, and included files are rendered before the
conversation is serialized. This prevents raw placeholders such as
`{{current_date}}` from leaking into the checkpoint prompt. Tool results are
included with a per-result size cap, and image attachments are represented by
their count rather than embedded binary data.

The final model request still travels through the existing agent streaming
stack, whose desktop backend uses pi-agent-core's generic agent loop. In other
words, pi-agent-core performs the underlying model execution; LLM Space owns the
compaction planning, prompts, progressive checkpoint semantics, preview, and
message transformation.

## Preview and apply guarantees

- Opening the wizard does not start a model request.
- Changing options does not mutate the thread.
- Starting compaction generates only a preview.
- Closing or cancelling the wizard leaves the messages unchanged.
- Applying creates a new `-compact-N.json` thread; the source file remains
  unchanged.
