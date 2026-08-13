# LLM Space 学习 Wiki 生成计划

```yaml
project:
  name: LLM Space 4 完全开发课程
  source: ./content
  output: ./index.html
  language: zh-CN
  delivery: single-file-html
  total_pages: 31

design:
  reference: ./reference/Volcengine Copy-1.zip
  system: 源力设计系统
  shell: 48px-topnav + 200px-sidenav + content
  tokens: Yuanli blue / neutral / status / 4px spacing
  constraints:
    - no-external-css
    - no-external-js
    - responsive
    - keyboard-accessible

navigation:
  - 00-foundations: 5
  - 01-learning-map: 3
  - 02-core-domain: 3
  - 03-agent-runtime: 3
  - 04-desktop-app: 3
  - 05-remote-runtime: 3
  - 06-ui-engineering: 3

features:
  - difficulty-level-filter
  - beginner-prerequisite-course
  - per-page-interactive-svg
  - glossary-drawer
  - prerequisite-and-duration-tags
  - learning-guidance-cards
  - full-text-search
  - hierarchical-sidebar
  - previous-next-navigation
  - reading-progress
  - local-learning-progress
  - source-path-links
  - copy-code
  - responsive-mobile-navigation
  - print-styles

verification:
  page_data: 31
  chapters: 7
  lessons: 23
  foundation_lessons: 5
  interactive_diagrams: 31
  external_assets: 0
  desktop_overflow: false
  tested:
    - initial-render
    - hash-navigation
    - full-text-search
    - progress-persistence
    - table-and-code-rendering
    - previous-next-navigation

status: done
```
