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
