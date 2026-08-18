# Thread View Performance Benchmark

## Method

- Renderer: Electrobun CEF with CDP
- Fixture: 10 generated Threads, 54 Markdown/JSON messages per Thread
- Data isolation: a temporary `LLM_SPACE_HOME`; no real workspace or settings
- Repetitions: five samples per overlay metric
- Dependency state: `bun install` completed from the checked-in lockfile
- Active-surface selection: overlay triggers are resolved inside the visible
  Thread View, never an inactive cached View
- First-run isolation: onboarding and other asynchronously mounted dialogs are
  dismissed after every renderer reload
- LRU state: the three most recent Thread Views are warmed before collecting
  counts and timings

## Baseline

The production UI matches `main` at
`437f297ffa95956c5a801a98c4cf10158062132e`. The harness ran from documentation
commit `7a896a63bba865eb7558e3195bc1f51cbcab8f9d`; no production source had changed.

| Rendering | Mounted views | DOM nodes | CodeMirror | Textareas |
| --- | ---: | ---: | ---: | ---: |
| Full | 10 | 49,094 | 550 | 0 |
| Fast | 10 | 31,089 | 0 | 540 |

Click-to-painted overlay timing in milliseconds:

| Rendering | Surface | Median | Maximum |
| --- | --- | ---: | ---: |
| Full | Settings | 45.5 | 275.5 |
| Full | Tools Add | 71.8 | 113.4 |
| Full | Examples | 148.9 | 161.8 |
| Full | Variables | 41.2 | 172.6 |
| Fast | Settings | 96.0 | 253.7 |
| Fast | Tools Add | 81.3 | 83.9 |
| Fast | Examples | 87.8 | 89.6 |
| Fast | Variables | 101.5 | 107.2 |

One Full/Examples sample timed out during close/reopen cycling and is excluded
from the median. Raw five-sample arrays remain in
`/tmp/llm-space-thread-view-baseline.json` for this development run.

The original baseline harness predated the View LRU and selected the first
matching menu trigger in the DOM. With all ten Views mounted, that trigger could
belong to an inactive View. It also dismissed onboarding only before the first
reload. The resource counts are directly comparable; overlay timing deltas are
useful directional evidence, but not a controlled before/after microbenchmark.

## Final comparison

The corrected final run is stored at
`/tmp/llm-space-thread-view-final-v2.json`. It measured the default View cache
size of three.

### Retained UI cost

| Rendering | Mounted views | DOM nodes | CodeMirror | Textareas | Static previews |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full, baseline | 10 | 49,094 | 550 | 0 | 0 |
| Full, final | 3 | 15,199 | 165 | 0 | 0 |
| Fast, baseline | 10 | 31,089 | 0 | 540 | 0 |
| Fast, final | 3 | 9,691 | 3 | 162 | 0 |
| On Demand, final | 3 | 11,959 | 3 | 0 | 162 |

The LRU reduces retained Full DOM by about 69% and CodeMirror instances by
70%. Fast retains about 69% fewer DOM nodes and 70% fewer message textareas.
The three CodeMirror instances in final Fast and On Demand are the deliberately
unchanged System Prompt editors, one per mounted View.

On Demand keeps all 162 repeated message editors as Lezer-highlighted static
previews while idle. Activating one took 25.8 ms in the recorded run and added
exactly one CodeMirror. Moving focus away restored the original three
CodeMirror instances and all 162 static previews.

### Unified enhancement follow-up

The editor-enhancement refactor was measured again at
`c26a72aa2d17b1145a88e6354015f2fca982e5a2` with the same CEF renderer,
10-Thread/54-message fixture, three-View cache, and five overlay samples. Its
raw output is `/tmp/llm-space-thread-view-enhancement-final-committed.json` for
this development run.

| Rendering | DOM before | DOM after | Editor resources after |
| --- | ---: | ---: | --- |
| Full | 15,199 | 15,199 | 165 CodeMirror |
| Fast | 9,691 | 9,691 | 3 CodeMirror + 162 textareas |
| On Demand | 11,959 | 11,797 | 3 CodeMirror + 162 static previews |

The shared Enhancement abstraction did not add a retained editor or DOM cost
to Full or Fast. On Demand retained 162 fewer DOM nodes (about 1.4%) because
the Static renderer now emits only style-bearing segments while preserving the
exact source text. Idle On Demand still mounted no message CodeMirror.

Activation took 27.9 ms in this run, temporarily increased CodeMirror from
three to four, focused the editing surface, and returned to three CodeMirror
plus all 162 previews after blur. The earlier single activation sample was
25.8 ms; the 2.1 ms difference is too small and too sparsely sampled to claim a
regression. Cached and evicted Tab-switch medians were 54.5 ms and 269.2 ms,
respectively, with the mounted View count remaining three.

### Overlay latency

Median click-to-painted time in milliseconds:

| Rendering | Surface | Baseline | Final | Directional change |
| --- | --- | ---: | ---: | ---: |
| Full | Settings | 45.5 | 42.8 | -5.9% |
| Full | Tools Add | 71.8 | 21.9 | -69.5% |
| Full | Examples | 148.9 | 26.8 | -82.0% |
| Full | Variables | 41.2 | 35.5 | -13.8% |
| Fast | Settings | 96.0 | 135.2 | +40.8% |
| Fast | Tools Add | 81.3 | 15.0 | -81.5% |
| Fast | Examples | 87.8 | 25.9 | -70.5% |
| Fast | Variables | 101.5 | 95.5 | -5.9% |
| On Demand | Settings | n/a | 33.6 | n/a |
| On Demand | Tools Add | n/a | 13.7 | n/a |
| On Demand | Examples | n/a | 25.9 | n/a |
| On Demand | Variables | n/a | 25.9 | n/a |

The ordinary Tools Add and Examples menus passed a real CEF behavior smoke:
pointer and keyboard open, arrow-key navigation, Escape close with trigger
focus restoration, outside dismissal, and menu-to-Dialog focus handoff. While
open, neither menu hides the app root from assistive technology nor applies a
Radix body scroll lock.

Settings still has a large first-mount lazy-loading outlier (474–512 ms in the
final run), and Fast Settings did not improve in this five-sample comparison.
That path is separate from Dropdown non-modality and remains a candidate for
future profiling. Maximums are intentionally not presented as steady-state
latency because lazy chunk loading dominates several first samples.

### Tab switching and session continuity

With three warmed Views, cached Tab switches had a 99.7 ms median. Switching to
an evicted View and rebuilding its 54-message UI had a 347.8 ms median. The
mounted View count remained three after all switches.

View eviction does not dispose the Thread Session. Automated lifecycle coverage
starts a real model transport, unmounts the View while events continue, waits
for the run to return to idle, and remounts the exact same store with the full
assistant output. Draft editors are committed before eviction, and the existing
rule that prevents closing a running Tab remains unchanged.

## Virtualization policy calibration

The configurable virtualization follow-up was measured on a MacBook Pro with
an Apple M2 Pro and 32 GB of physical memory. The renderer was Electrobun CEF
1.18.1, the Bun runtime was 1.3.14, and every run used a temporary
`LLM_SPACE_HOME`. No hardware identifiers or real workspace data were
collected. The working tree contained the uncommitted policy implementation,
so the recorded `benchmarkCommit` identifies its parent commit rather than the
complete measured source.

The final calibration fixture used six open Threads, a three-View cache, five
samples per mode/count, Virtualization Off, and a fixed 4,000 px/s scroll. The
fixed-speed run removes the earlier animation-duration bias. The table reports
the aggregate frame p95, percentage of frames slower than 33.3 ms, and median
initial mount. Overlay medians were also collected for every cell; Tools Add
and Examples stayed roughly 16-34 ms, while Settings and Variables were mostly
65-132 ms until the largest Full fixtures. Full raw samples, long-task arrays,
editor counts, and every overlay value remain in the JSON artifact.

| Rendering | Messages / Thread | DOM | Scroll p95 | Frames >33.3 ms | Initial mount |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full | 20 | 6,187 | 17.6 ms | 2.4% | 428.1 ms |
| Full | 25 | 7,504 | 25.0 ms | 2.7% | 533.9 ms |
| Full | 30 | 8,797 | 41.6 ms | 11.9% | 627.5 ms |
| Full | 35 | 10,108 | 50.8 ms | 37.2% | 750.2 ms |
| Full | 40 | 11,386 | 65.9 ms | 47.3% | 842.8 ms |
| Full | 45 | 12,688 | 83.4 ms | 51.5% | 918.3 ms |
| Full | 50 | 13,966 | 142.0 ms | 58.0% | 1,135.8 ms |
| Full | 60 | 16,546 | 184.2 ms | 64.7% | 1,405.9 ms |
| Full | 80 | 21,706 | 208.5 ms | 72.8% | 1,938.3 ms |
| Full | 100 | 26,866 | 241.6 ms | 80.2% | 2,569.9 ms |
| On Demand | 20 | 4,927 | 17.2 ms | 1.7% | 276.5 ms |
| On Demand | 25 | 5,929 | 25.9 ms | 2.7% | 334.5 ms |
| On Demand | 30 | 6,907 | 41.7 ms | 13.1% | 440.5 ms |
| On Demand | 35 | 7,903 | 58.3 ms | 38.9% | 482.1 ms |
| On Demand | 40 | 8,866 | 66.6 ms | 47.6% | 508.8 ms |
| On Demand | 45 | 9,853 | 75.9 ms | 51.5% | 536.6 ms |
| On Demand | 50 | 10,816 | 149.9 ms | 58.1% | 606.2 ms |
| On Demand | 60 | 12,766 | 183.3 ms | 62.7% | 680.1 ms |
| On Demand | 80 | 16,666 | 209.2 ms | 68.6% | 811.6 ms |
| On Demand | 100 | 20,566 | 250.0 ms | 83.0% | 994.3 ms |
| Fast | 20 | 4,147 | 17.1 ms | 1.7% | 259.6 ms |
| Fast | 25 | 4,954 | 17.7 ms | 1.9% | 287.9 ms |
| Fast | 30 | 5,737 | 40.9 ms | 10.2% | 436.9 ms |
| Fast | 35 | 6,538 | 42.6 ms | 30.4% | 454.6 ms |
| Fast | 40 | 7,306 | 67.2 ms | 48.8% | 502.2 ms |
| Fast | 45 | 8,098 | 75.0 ms | 51.8% | 512.4 ms |
| Fast | 50 | 8,866 | 83.4 ms | 57.5% | 561.2 ms |
| Fast | 60 | 10,426 | 174.9 ms | 64.8% | 642.8 ms |
| Fast | 80 | 13,546 | 208.3 ms | 70.3% | 821.5 ms |
| Fast | 100 | 16,666 | 216.8 ms | 76.5% | 924.3 ms |

The first common scroll knee appears between 25 and 30 messages for all three
renderers, showing that complete-list layout and paint becomes the limiting
factor before editor count alone. Full 25 is the conservative 32-GB baseline.
On Demand and Fast still retain substantially fewer DOM/editor resources, so
the agreed product policy gives them bounded headroom without claiming linear
scroll scaling: On Demand is `x1.5` (38 after rounding) and Fast is `x2` (50).
Lower and higher memory tiers are conservative inferences, not direct
measurements:

| Physical memory | Full baseline |
| --- | ---: |
| up to 8 GiB | 10 |
| 9-16 GiB | 15 |
| 17-32 GiB | 25 |
| above 32 GiB | 30 |

Auto then applies the approved rendering multipliers: Full `x1`, On Demand
`x1.5`, and Fast `x2`, clamped to 10-200. The multiplier is deliberately a
resource heuristic, not a claim that scroll cost scales linearly: the 40/80
Off measurements show that a large complete DOM can still dominate after
CodeMirror is removed. Users can select Custom or On when their content is
heavier than the deterministic fixture, or Off when a modest list is already
responsive and uninterrupted fast scrolling matters more.

A clean 40-message Full Auto sample confirmed that virtualization was actually
active: three cached Views retained 1,776 DOM nodes, 12 CodeMirror instances,
and 9 currently rendered message rows, versus 11,386 / 123 / 120 with Off.
The evicted-remount sample improved from 741.9 ms to 259.9 ms. A two-sample
rapid-scroll p95 was 83.4 ms versus 75.1 ms with Off, so virtualization reduces
retained and remount work but does not promise smoother large-distance scrolls;
this is why Virtualization remains independent from Message rendering and
defaults to Auto rather than always On.

### Message navigator follow-up

The first Off implementation preserved navigator highlighting by measuring
every message row on each scroll animation frame. A follow-up replaces that
O(message count) hot path with center-point hit testing, capped at one
progressive update every two frames, followed by one exact reconciliation after
two stable frames. Virtualized lists instead reuse the virtualizer's mounted-row
measurements.

The CEF smoke instrumented `getBoundingClientRect()` specifically on message
rows while scrolling 40-message Full fixtures:

| Virtualization | Mounted rows | Row reads during 20 scroll frames | Extra row reads after settle | Final anchor |
| --- | ---: | ---: | ---: | --- |
| Off | 40 | 0 | 40 | correct |
| On | 15 | 27 (virtualizer mount measurement) | 0 | correct |

Off therefore removes the previous 40 row reads per scroll frame and pays one
40-row scan after scrolling stops. On performs no navigator-owned full-list
scan; its 27 reads came from TanStack Virtual measuring rows as they mounted.

A five-sample Full 40 / Off follow-up with three mounted Views recorded scroll
p95 at 58.4 ms versus the earlier 65.9 ms (about 11% lower), while frames over
33.3 ms were effectively unchanged at 48.0% versus 47.3%. This run-to-run
comparison is directionally useful, not a claim that navigator tracking was the
only cost: complete-DOM layout, paint, and CodeMirror still dominate many
frames. The direct row-read smoke is the deterministic evidence for the hot-path
removal.

Raw results for this development run are stored at:

- `/tmp/llm-space-performance-matrix-2026-08-18.json`
- `/tmp/llm-space-virtualization-toggle-smoke.json`
- `/tmp/llm-space-calibration-rich-off-20-v2.json`
- `/tmp/llm-space-calibration-rich-off-30.json`
- `/tmp/llm-space-calibration-rich-off-40.json`
- `/tmp/llm-space-calibration-on-demand-off-20.json`
- `/tmp/llm-space-calibration-on-demand-off-40.json`
- `/tmp/llm-space-calibration-lite-off-40.json`
- `/tmp/llm-space-calibration-lite-off-80.json`
- `/tmp/llm-space-calibration-rich-auto-40-clean.json`
- `/tmp/llm-space-dropdown-fusion.json`
- `/tmp/llm-space-navigator-optimized-full40-off.json`
- `/tmp/llm-space-navigator-tracking-smoke.json`
- `/tmp/llm-space-navigator-tracking-virtual-smoke.json`

The dropdown smoke again passed pointer opening, keyboard navigation, Escape
focus return, outside dismissal, selection, and menu-to-Dialog focus handoff.
Neither Tools Add nor Examples hid the app root or enabled body scroll lock.
The CEF virtualization-toggle smoke started with a 6,673.5 px virtual
container and translated rows, switched the Settings policy from On to Off,
then observed all 40 rows in normal flow with container `height: auto` and row
`transform: none`, `top: auto`, and `left: auto`.
