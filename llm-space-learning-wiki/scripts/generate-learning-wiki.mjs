import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(siteRoot, "content");
const outputFile = path.join(siteRoot, "index.html");

const chapters = [
  ["00-foundations", "零基础预备", "程序、前端、异步与 Agent 基础"],
  ["01-learning-map", "全局地图", "从产品概念到完整调用链"],
  ["02-core-domain", "Core 领域层", "Thread、流式协议、模板与存储"],
  ["03-agent-runtime", "Agent Runtime", "模型、工具、MCP、Skills 与插件"],
  ["04-desktop-app", "桌面应用", "Electrobun、RPC、标签页与持久化"],
  ["05-remote-runtime", "Remote Runtime", "Server、SSH、SSE 与连接状态机"],
  ["06-ui-engineering", "UI 与工程", "共享 UI、Web、测试与发布"],
];

const chapterMeta = {
  "00-foundations": {
    level: 0,
    levelLabel: "零基础",
    prerequisite: "无",
    color: "#2a814b",
  },
  "01-learning-map": {
    level: 1,
    levelLabel: "入门",
    prerequisite: "预备课或基本编程概念",
    color: "#1664ff",
  },
  "02-core-domain": {
    level: 2,
    levelLabel: "核心",
    prerequisite: "TypeScript、JSON、异步基础",
    color: "#7b61c8",
  },
  "03-agent-runtime": {
    level: 2,
    levelLabel: "核心",
    prerequisite: "Agent、Tool、MCP 基础",
    color: "#bd7e00",
  },
  "04-desktop-app": {
    level: 3,
    levelLabel: "进阶",
    prerequisite: "React、RPC、Runtime",
    color: "#d25f00",
  },
  "05-remote-runtime": {
    level: 3,
    levelLabel: "进阶",
    prerequisite: "HTTP、SSH、流式协议",
    color: "#d7312a",
  },
  "06-ui-engineering": {
    level: 2,
    levelLabel: "实践",
    prerequisite: "React、状态管理、构建工具",
    color: "#1677a8",
  },
};

const visualModels = {
  "00-foundations": [
    ["代码", "精确说明书"],
    ["运行时", "执行代码的环境"],
    ["数据", "程序处理的内容"],
    ["界面", "状态的可视结果"],
  ],
  "01-learning-map": [
    ["UI", "接收用户操作"],
    ["Transport", "跨边界传递请求"],
    ["Runtime", "管理真实能力"],
    ["Core", "执行与持久化"],
  ],
  "02-core-domain": [
    ["Thread", "可保存的实验文档"],
    ["Context", "模型运行输入"],
    ["AgentEvent", "流式运行事件"],
    ["History", "可回放证据"],
  ],
  "03-agent-runtime": [
    ["Model", "生成与推理"],
    ["Tool", "执行外部动作"],
    ["MCP", "标准化外部连接"],
    ["Registry", "管理能力集合"],
  ],
  "04-desktop-app": [
    ["React", "界面与交互"],
    ["RPC", "跨进程桥梁"],
    ["Bun", "系统特权进程"],
    ["Runtime", "本地或远程能力"],
  ],
  "05-remote-runtime": [
    ["Desktop", "本机交互入口"],
    ["SSH Tunnel", "安全传输通道"],
    ["Server", "远端 HTTP 服务"],
    ["Linux Runtime", "远端能力与数据"],
  ],
  "06-ui-engineering": [
    ["Component", "可复用界面单元"],
    ["Store", "Thread 交互状态"],
    ["Host", "注入平台能力"],
    ["Quality", "测试构建与发布"],
  ],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(value) {
  const codeSpans = [];
  const protectedValue = String(value).replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });
  return escapeHtml(protectedValue)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (_, label, href) =>
        `<a href="${escapeHtml(href)}" data-wiki-link="${escapeHtml(href)}">${label}</a>`
    )
    .replace(
      /\u0000CODE(\d+)\u0000/g,
      (_, index) => `<code>${escapeHtml(codeSpans[Number(index)])}</code>`
    );
}

function cleanMarkdownText(value) {
  return String(value)
    .replace(/^>\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDescription(markdown) {
  let inCode = false;
  for (const rawLine of markdown.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (
      inCode ||
      !line ||
      line.startsWith("#") ||
      line.startsWith(">") ||
      line.startsWith("|") ||
      /^[-*]\s+/.test(line) ||
      /^\d+\.\s+/.test(line)
    ) {
      continue;
    }
    const cleaned = cleanMarkdownText(line);
    if (cleaned) return cleaned;
  }
  return "";
}

function extractVisualNodes(markdown, chapterId) {
  const sections = markdown
    .replace(/\r/g, "")
    .split(/^##\s+/gm)
    .slice(1)
    .map((section) => {
      const [heading = "", ...bodyLines] = section.split("\n");
      const title = cleanMarkdownText(heading);
      const description = extractDescription(bodyLines.join("\n"));
      return {
        title,
        description: description || `了解“${title}”在本节中的作用与边界。`,
      };
    })
    .filter((section) => section.title);
  if (sections.length >= 4) return sections.slice(0, 4);
  return (visualModels[chapterId] ?? visualModels["01-learning-map"]).map(
    ([title, description]) => ({ title, description })
  );
}

function splitSvgLabel(value) {
  const text = cleanMarkdownText(value);
  if (text.length <= 12) return [text];
  const words = text.split(/\s+/);
  if (words.length > 1) {
    const midpoint = Math.ceil(words.length / 2);
    return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
  }
  const midpoint = Math.ceil(text.length / 2);
  return [text.slice(0, midpoint), text.slice(midpoint)];
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r/g, "").split("\n");
  const out = [];
  let paragraph = [];
  let list = null;
  let quote = [];
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    out.push(`<aside class="callout">${quote.map(inline).join("<br>")}</aside>`);
    quote = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (code) {
      if (line.startsWith("```")) {
        out.push(
          `<div class="code-wrap"><button class="copy-code">复制</button><pre><code class="language-${escapeHtml(code.language)}">${escapeHtml(code.lines.join("\n"))}</code></pre></div>`
        );
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      flushQuote();
      code = { language: line.slice(3).trim(), lines: [] };
      continue;
    }
    if (/^\|.+\|$/.test(line) && /^\|[\s:|-]+\|$/.test(lines[index + 1] ?? "")) {
      flushParagraph();
      flushList();
      const headers = line.slice(1, -1).split("|").map((cell) => cell.trim());
      index += 2;
      const rows = [];
      while (index < lines.length && /^\|.+\|$/.test(lines[index])) {
        rows.push(lines[index].slice(1, -1).split("|").map((cell) => cell.trim()));
        index += 1;
      }
      index -= 1;
      out.push(
        `<div class="table-scroll"><table><thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      flushQuote();
      const level = heading[1].length;
      const text = heading[2];
      const id = `s-${out.length}-${text.replace(/[^\w\u4e00-\u9fff]+/g, "-")}`;
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      flushQuote();
      const type = ordered ? "ol" : "ul";
      if (list?.type !== type) flushList();
      list ??= { type, items: [] };
      list.items.push(`<li>${inline((unordered || ordered)[1])}</li>`);
      continue;
    }
    if (line.startsWith("> ")) {
      flushParagraph();
      flushList();
      quote.push(line.slice(2));
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      flushQuote();
      out.push("<hr>");
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushQuote();
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushQuote();
  if (code) {
    out.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
  }
  return out.join("\n");
}

function createVisual(chapterId, title, visualNodes, kind = "chapter") {
  const nodes =
    visualNodes ??
    (visualModels[chapterId] ?? visualModels["01-learning-map"]).map(
      ([nodeTitle, description]) => ({ title: nodeTitle, description })
    );
  if (kind === "lesson") {
    const cards = nodes
      .map(
        ({ title: nodeTitle, description }, index) =>
          `<div class="lesson-outline-card"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(nodeTitle)}</strong><p>${escapeHtml(description)}</p></div>`
      )
      .join("");
    return `<section class="lesson-outline"><div class="lesson-outline-head"><span>本节脉络</span><strong>${escapeHtml(title)}</strong></div><div class="lesson-outline-grid">${cards}</div></section>`;
  }
  const positions = [90, 290, 490, 690];
  const arrows = positions
    .slice(0, -1)
    .map(
      (x, index) =>
        `<path class="flow-line" d="M${x + 120} 88 H${positions[index + 1] - 12}" />`
    )
    .join("");
  const groups = nodes
    .map(
      ({ title: nodeTitle }, index) => {
        const labelLines = splitSvgLabel(nodeTitle);
        const titleMarkup = labelLines
          .map(
            (line, lineIndex) =>
              `<tspan x="60" y="${labelLines.length === 1 ? 41 : 34 + lineIndex * 16}">${escapeHtml(line)}</tspan>`
          )
          .join("");
        return `<g class="visual-node${index === 0 ? " active" : ""}"
        transform="translate(${positions[index]} 48)">
        <rect width="120" height="80" rx="8"></rect>
        <circle cx="20" cy="20" r="8"></circle>
        <text class="node-title" text-anchor="middle">${titleMarkup}</text>
      </g>`;
      }
    )
    .join("");
  const legend = nodes
    .map(
      ({ title: nodeTitle, description }, index) =>
        `<button class="visual-legend-button${index === 0 ? " active" : ""}" data-title="${escapeHtml(nodeTitle)}" data-description="${escapeHtml(description)}"><span>${index + 1}</span>${escapeHtml(nodeTitle)}</button>`
    )
    .join("");
  return `<div class="lesson-visual">
    <div class="visual-head">
      <div><span class="visual-kicker">交互图解</span><strong>${escapeHtml(title)}的核心关系</strong></div>
      <span class="visual-hint">点击节点查看解释</span>
    </div>
    <svg viewBox="0 0 900 180" role="img" aria-label="${escapeHtml(title)}概念关系图">
      <defs><marker id="arrow-${chapterId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>
      <g class="flow-lines" marker-end="url(#arrow-${chapterId})">${arrows}</g>
      ${groups}
    </svg>
    <div class="visual-legend">${legend}</div>
    <div class="visual-detail"><strong>${escapeHtml(nodes[0].title)}：</strong><span>${escapeHtml(nodes[0].description)}</span></div>
  </div>`;
}

function createChapterGuide(title, childPages) {
  const cards = childPages
    .map(
      (page, index) =>
        `<a class="chapter-guide-card" href="#${escapeHtml(page.id)}"><span class="chapter-guide-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(page.title)}</strong><p>${escapeHtml(page.description)}</p></div><span class="chapter-guide-action">${escapeHtml(page.duration)} · 进入课程 →</span></a>`
    )
    .join("");
  return `<section class="chapter-guide"><div class="chapter-guide-head"><div><span>章节导读</span><strong>${escapeHtml(title)}</strong></div><p>按以下顺序完成本章课程。每一项都对应一篇独立学习材料。</p></div><div class="chapter-guide-grid">${cards}</div></section>`;
}

function readPage(file, chapterId, kind) {
  const markdown = fs.readFileSync(file, "utf8");
  const relative = path.relative(sourceRoot, file).replaceAll(path.sep, "/");
  const title = markdown.match(/^#\s+(.+)$/m)?.[1] ?? relative;
  const id =
    kind === "chapter"
      ? chapterId
      : `${chapterId}/${path.basename(file, ".md")}`;
  const description = extractDescription(markdown);
  const meta = chapterMeta[chapterId] ?? chapterMeta["01-learning-map"];
  const visualNodes = extractVisualNodes(markdown, chapterId);
  return {
    id,
    chapterId,
    kind,
    title,
    description,
    source: relative,
    level: meta.level,
    levelLabel: meta.levelLabel,
    prerequisite: meta.prerequisite,
    duration: kind === "chapter" ? "10 分钟" : meta.level === 0 ? "35 分钟" : "30 分钟",
    visual: createVisual(chapterId, title, visualNodes, kind),
    html: markdownToHtml(markdown),
    markdown,
    text: markdown.replace(/[#*`>|[\]()_-]/g, " ").replace(/\s+/g, " "),
  };
}

const homeMarkdown = `# LLM Space 4 完全开发课程

## 你将学到什么

这不是 API 清单，而是一条可执行的分级学习路径。没有开发经验的读者先完成零基础预备课；初级开发者可以从全局地图开始，再逐步进入 Agent 流式运行、工具执行、桌面双进程、SSH Remote Runtime 与工程发布。每节均提供概念图、类比、关键源码位置、常见误区和动手练习。

## 推荐学习顺序

1. **补齐基础**：程序、JSON、TypeScript、React、异步、Agent 和 MCP。
2. **建立地图**：理解 Thread、Runtime 和三大边界接口。
3. **掌握 Core**：阅读数据模型、流式 reducer、模板和原子存储。
4. **进入 Runtime**：掌握模型、MCP、Tools、Skills、Plugins 与 Trace。
5. **拆解桌面端与远程端**：跟踪 RPC、Tabs、SSH、Server 和持久化。
6. **独立交付功能**：完成共享 UI、测试、构建和发布实践。

## 如何使用本课程

- 从左侧按顺序阅读，完成专题后点击“标记完成”。
- 使用顶部全文搜索定位函数、类型、协议或开发流程。
- 每节可在页面内查看对应 Markdown 源文档。
- 先完成章节练习，再进入下一章；遇到概念时返回全局地图复习主链路。

## 掌握标准

最终你应能从 Run 按钮完整追踪到 Provider Event，再返回 React UI；能安全修改 Thread schema 和 Remote protocol；能新增 Runtime Scoped 能力，并为本地、远程、共享 UI 和发布链补齐验证。`;

const pages = [
  {
    id: "home",
    chapterId: "00-foundations",
    kind: "home",
    title: "LLM Space 4 完全开发课程",
    description:
      "从小白起步，沿真实源码调用链掌握 Thread、Agent Runtime、Electrobun 桌面架构、Remote Runtime、共享 UI 与工程发布。",
    source: "00-foundations.md",
    level: 0,
    levelLabel: "自适应路径",
    prerequisite: "无",
    duration: "按基础选择 8-16 小时",
    visual: createVisual("01-learning-map", "LLM Space 全栈学习路径"),
    html: markdownToHtml(homeMarkdown),
    markdown: homeMarkdown,
    text:
      "LLM Space 完全开发课程 Thread Runtime Agent Electrobun Remote Runtime UI 测试 发布 学习路径",
  },
];
for (const [chapterId] of chapters) {
  const chapterFile = path.join(sourceRoot, `${chapterId}.md`);
  const chapterPage = readPage(chapterFile, chapterId, "chapter");
  const childPages = [];
  const dir = path.join(sourceRoot, chapterId);
  for (const filename of fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort()) {
    childPages.push(readPage(path.join(dir, filename), chapterId, "lesson"));
  }
  chapterPage.visual = createChapterGuide(chapterPage.title, childPages);
  pages.push(chapterPage);
  pages.push(...childPages);
}

const data = JSON.stringify({ pages, chapters }).replaceAll("</script>", "<\\/script>");
const css = `
:root{--primary:#1664ff;--primary-hover:#0055ff;--primary-soft:#f3f7ff;--text:#0c0d0e;--regular:#1d2129;--muted:#86909c;--disabled:#c9cdd4;--border:#dde2e9;--surface:#fff;--subtle:#f7f9fb;--sidebar:#f6f8fa;--success:#2a814b;--success-bg:#e2f5eb;--warning:#bd7e00;--warning-bg:#fdf3de;--danger:#d7312a;--danger-bg:#feeced;--shadow:0 2px 6px rgba(12,13,14,.08);--radius:4px;--top:48px;--side:248px;--sans:"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;--mono:"SFMono-Regular","SF Mono",Consolas,monospace}
*{box-sizing:border-box}[hidden]{display:none!important}html{scroll-behavior:smooth}body{margin:0;color:var(--regular);font-family:var(--sans);font-size:14px;line-height:1.75;background:var(--surface)}button,input{font:inherit}a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}code{font-family:var(--mono);font-size:.9em;background:#f1f4f8;border-radius:3px;padding:2px 5px;color:#243b62}
.top-nav{position:fixed;z-index:30;inset:0 0 auto;height:var(--top);display:flex;align-items:center;gap:12px;padding:0 18px;background:#fff;box-shadow:var(--shadow)}.brand{display:flex;align-items:center;gap:10px;width:210px;font-weight:600;color:var(--text)}.brand-mark{display:grid;place-items:center;width:26px;height:26px;color:#fff;background:var(--primary);border-radius:6px;font-size:12px}.menu-btn{border:0;background:transparent;padding:7px;cursor:pointer;color:var(--regular)}.search{position:relative;max-width:620px;flex:1}.search input{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius);background:var(--subtle);padding:0 36px 0 12px;outline:0}.search input:focus{border-color:var(--primary);box-shadow:0 0 0 2px rgba(22,100,255,.12);background:#fff}.search kbd{position:absolute;right:8px;top:6px;border:1px solid var(--border);border-radius:3px;padding:0 5px;color:var(--muted);background:#fff;font-size:10px}.top-meta{display:none}
.sidenav{position:fixed;z-index:20;top:var(--top);bottom:0;left:0;width:var(--side);overflow:auto;background:var(--sidebar);border-right:1px solid var(--border);padding:14px 12px 22px;transition:transform .2s ease}.side-label{padding:8px 8px 6px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.side-filter{display:block;width:100%;height:34px;margin:0 0 12px;border:1px solid var(--border);border-radius:var(--radius);background:#fff;padding:0 10px;color:var(--regular);font-size:12px}.menu-group{margin-bottom:4px}.menu-item{display:flex;align-items:center;gap:8px;min-height:36px;padding:7px 8px;border-radius:var(--radius);color:var(--regular);cursor:pointer}.menu-item:hover{background:rgba(0,0,0,.04);text-decoration:none}.menu-item.active{background:rgba(22,100,255,.08);color:var(--primary);font-weight:500}.menu-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.menu-num{display:grid;place-items:center;min-width:20px;height:20px;border-radius:3px;background:#e8edf5;color:#607086;font-size:10px}.menu-item.active .menu-num{color:#fff;background:var(--primary)}.subnav{margin:2px 0 8px}.subnav .menu-item{min-height:32px;padding:5px 8px 5px 36px;font-size:12px;line-height:1.45}.completion{margin:16px 6px 0;padding:12px;background:#fff;border:1px solid var(--border);border-radius:6px}.progress-track{height:4px;overflow:hidden;background:#eceded;border-radius:2px}.progress-fill{height:100%;width:0;background:var(--primary);transition:width .25s}.completion-row{display:flex;justify-content:space-between;margin-bottom:8px;font-size:11px}
.app-main{margin-left:var(--side);padding-top:var(--top);min-height:100vh;transition:margin .2s ease}.content-shell{max-width:1180px;margin:0 auto;padding:26px 42px 72px}.breadcrumb{display:flex;gap:7px;color:var(--muted);font-size:12px;margin-bottom:12px}.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:1px solid var(--border)}.eyebrow{color:var(--primary);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}.page-header h1{margin:5px 0 8px;color:var(--text);font-size:26px;line-height:1.28}.lede{max-width:760px;margin:0;color:var(--muted)}.complete-btn{height:34px;border:1px solid var(--border);border-radius:var(--radius);background:#fff;padding:0 14px;cursor:pointer;white-space:nowrap}.complete-btn.done{border-color:#8dd8b3;color:var(--success);background:var(--success-bg)}
.overview{display:grid;grid-template-columns:1.4fr .8fr;gap:16px;margin:22px 0}.arch-card,.stat-card{border:1px solid var(--border);border-radius:8px;background:#fff}.arch-card{padding:20px}.arch-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.status-tag{display:inline-flex;align-items:center;border-radius:3px;padding:2px 7px;font-size:11px;background:var(--primary-soft);color:var(--primary)}.arch-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-items:center}.arch-node{position:relative;padding:12px;border:1px solid var(--border);border-radius:5px;background:var(--subtle);text-align:center;font-size:12px}.arch-node.hot{border-color:#a0c0ff;background:var(--primary-soft);color:var(--primary)}.arch-node:not(:last-child)::after{content:"→";position:absolute;right:-17px;top:10px;color:var(--primary);z-index:2}.stat-card{padding:18px}.stat{display:flex;align-items:baseline;justify-content:space-between;padding:10px 0;border-bottom:1px solid #edf0f3}.stat:last-child{border:0}.stat strong{font-size:22px;color:var(--text)}.stat span{color:var(--muted);font-size:12px}
.tabs{display:flex;gap:24px;border-bottom:1px solid var(--border);margin:24px 0 0}.tab{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;padding:8px 0;color:var(--muted);font-size:13px;cursor:pointer}.tab.active{color:var(--primary);border-color:var(--primary);font-weight:500}.article-layout{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:42px}.article{min-width:0;padding-top:14px}.article h1{display:none}.article h2{margin:34px 0 12px;padding-top:8px;color:var(--text);font-size:20px;line-height:1.4}.article h2,.article h3{scroll-margin-top:72px}.article h2::before{content:"";display:inline-block;width:3px;height:17px;margin-right:9px;vertical-align:-2px;background:var(--primary);border-radius:2px}.article h3{margin:25px 0 9px;color:var(--text);font-size:16px}.article h4{margin:20px 0 8px;color:var(--text);font-size:14px}.article p{max-width:820px;margin:10px 0}.article ul,.article ol{padding-left:23px;margin:10px 0}.article li{margin:5px 0}.article hr{border:0;border-top:1px solid var(--border);margin:28px 0}.callout{margin:16px 0;padding:12px 14px;border-left:3px solid var(--primary);background:var(--primary-soft);color:#31486e}.code-wrap{position:relative;margin:14px 0}.copy-code{position:absolute;right:8px;top:8px;border:1px solid #3d4b61;border-radius:3px;color:#bdc8d8;background:#202938;padding:3px 8px;cursor:pointer;font-size:11px}pre{overflow:auto;margin:0;padding:18px;border-radius:6px;background:#111827;color:#d9e2f1;line-height:1.6}pre code{padding:0;color:inherit;background:transparent}.table-scroll{overflow:auto;margin:14px 0;border:1px solid var(--border);border-radius:6px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:var(--subtle);color:var(--text);font-weight:600}th,td{padding:9px 12px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}tr:last-child td{border-bottom:0}
.toc{position:sticky;top:70px;align-self:start;border-left:1px solid var(--border);padding-left:16px}.toc-title{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.toc a{display:block;padding:4px 0;color:var(--muted);font-size:11px;line-height:1.5}.toc a:hover,.toc a.current{color:var(--primary);text-decoration:none}.lesson-nav{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:42px;padding-top:20px;border-top:1px solid var(--border)}.lesson-link{padding:13px;border:1px solid var(--border);border-radius:6px;color:var(--regular)}.lesson-link:hover{border-color:#a0c0ff;background:var(--primary-soft);text-decoration:none}.lesson-link.next{text-align:right}.lesson-link small{display:block;color:var(--muted)}
.search-panel{position:fixed;z-index:50;top:44px;left:calc(var(--side) + 18px);width:min(620px,calc(100vw - var(--side) - 48px));max-height:70vh;overflow:auto;border:1px solid var(--border);border-radius:6px;background:#fff;box-shadow:0 12px 32px rgba(12,13,14,.16);padding:8px}.search-panel[hidden]{display:none}.search-result{display:block;padding:10px;border-radius:4px;color:var(--regular)}.search-result:hover{background:var(--primary-soft);text-decoration:none}.search-result strong{display:block;color:var(--text)}.search-result span{font-size:11px;color:var(--muted)}.empty{padding:24px;text-align:center;color:var(--muted)}
.menu-level{margin-left:auto;flex:none;padding:1px 5px;border-radius:3px;background:#eef1f5;color:var(--muted);font-size:9px}.lesson-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.meta-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--subtle);color:var(--muted);font-size:11px}.meta-chip.level{border-color:#a0c0ff;background:var(--primary-soft);color:var(--primary)}
.lesson-visual{margin:24px 0;border:1px solid var(--border);border-radius:10px;background:linear-gradient(180deg,#fff,#f8faff);overflow:hidden}.visual-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}.visual-head>div{display:flex;align-items:center;gap:10px}.visual-kicker{padding:2px 6px;border-radius:3px;background:var(--primary-soft);color:var(--primary);font-size:10px}.visual-hint{color:var(--muted);font-size:10px}.lesson-visual svg{display:block;width:100%;height:auto;min-height:150px}.flow-line{fill:none;stroke:var(--primary);stroke-width:2;stroke-dasharray:7 6;animation:flow 1.2s linear infinite}.flow-lines marker path{fill:var(--primary)}@keyframes flow{to{stroke-dashoffset:-26}}.visual-node{cursor:pointer;outline:none}.visual-node rect{fill:#fff;stroke:#c8d5ed;stroke-width:1.5;transition:.18s}.visual-node circle{fill:var(--primary-soft);stroke:var(--primary)}.visual-node:hover rect,.visual-node:focus rect,.visual-node.active rect{fill:var(--primary-soft);stroke:var(--primary);filter:drop-shadow(0 4px 6px rgba(22,100,255,.15))}.node-title{font:600 13px var(--sans);fill:var(--text)}.node-caption{font:10px var(--sans);fill:var(--muted)}.visual-legend{display:flex;justify-content:center;gap:8px;padding:0 16px 12px}.visual-legend-button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;background:#fff;padding:5px 10px;color:var(--regular);cursor:pointer;font-size:11px}.visual-legend-button span{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-size:9px}.visual-legend-button:hover,.visual-legend-button.active{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.visual-detail{display:flex;gap:10px;padding:11px 16px;border-top:1px solid var(--border);background:var(--primary-soft);font-size:12px}.visual-detail[hidden]{display:none}.visual-detail strong{color:var(--primary)}
.lesson-outline{margin:20px 0 10px;border:1px solid var(--border);border-radius:8px;background:var(--subtle);overflow:hidden}.lesson-outline-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);background:#fff}.lesson-outline-head span{padding:2px 6px;border-radius:3px;background:var(--primary-soft);color:var(--primary);font-size:10px}.lesson-outline-head strong{color:var(--text);font-size:13px}.lesson-outline-grid{display:grid;grid-template-columns:repeat(4,1fr)}.lesson-outline-card{min-width:0;padding:14px 16px;border-right:1px solid var(--border)}.lesson-outline-card:last-child{border-right:0}.lesson-outline-card>span{display:block;color:var(--primary);font-family:var(--mono);font-size:10px}.lesson-outline-card strong{display:block;margin:4px 0 6px;color:var(--text);font-size:13px}.lesson-outline-card p{margin:0;color:var(--muted);font-size:11px;line-height:1.55}
.chapter-guide{margin:20px 0 10px}.chapter-guide-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:12px}.chapter-guide-head>div>span{display:block;color:var(--primary);font-size:10px;font-weight:600}.chapter-guide-head strong{display:block;margin-top:2px;color:var(--text);font-size:18px}.chapter-guide-head>p{max-width:430px;margin:0;color:var(--muted);font-size:11px;text-align:right}.chapter-guide-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.chapter-guide-card{position:relative;display:block;min-height:154px;padding:16px;border:1px solid var(--border);border-radius:8px;background:var(--subtle);color:var(--regular);transition:border-color .15s,background .15s}.chapter-guide-card:hover{border-color:#9dbbff;background:#fff;text-decoration:none}.chapter-guide-number{display:block;color:var(--primary);font-family:var(--mono);font-size:10px}.chapter-guide-card strong{display:block;margin:6px 0;color:var(--text);font-size:14px}.chapter-guide-card p{margin:0 0 26px;color:var(--muted);font-size:11px;line-height:1.55}.chapter-guide-action{position:absolute;right:16px;bottom:13px;color:var(--primary);font-size:10px}
.beginner-note{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.learning-card{padding:13px;border:1px solid var(--border);border-radius:6px;background:#fff}.learning-card small{display:block;color:var(--muted);font-size:10px}.learning-card strong{display:block;margin:3px 0;color:var(--text);font-size:13px}.learning-card span{color:var(--muted);font-size:11px}.article details{margin:14px 0;border:1px solid var(--border);border-radius:6px;background:#fff}.article summary{padding:10px 13px;cursor:pointer;color:var(--text);font-weight:500}.article details>div{padding:0 13px 12px;color:var(--regular)}.glossary-btn{height:30px;border:1px solid var(--border);border-radius:4px;background:#fff;padding:0 10px;color:var(--regular);cursor:pointer;font-size:11px}.glossary-drawer{position:fixed;z-index:60;top:48px;right:0;bottom:0;width:min(390px,100vw);overflow:auto;padding:20px;background:#fff;border-left:1px solid var(--border);box-shadow:-10px 0 30px rgba(12,13,14,.12);transform:translateX(100%);transition:transform .2s}.glossary-drawer[hidden]{display:none}.glossary-drawer.open{transform:translateX(0)}.drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.drawer-head h2{margin:0;font-size:18px}.drawer-close{border:0;background:transparent;font-size:20px;cursor:pointer}.glossary-item{padding:12px 0;border-bottom:1px solid var(--border)}.glossary-item strong{display:block;color:var(--text)}.glossary-item span{font-size:12px;color:var(--muted)}.source-inline{display:block;margin-top:4px;border:0;background:transparent;padding:0;color:var(--primary);cursor:pointer;text-align:left;font-size:11px}.source-dialog{width:min(900px,calc(100vw - 32px));height:min(760px,calc(100vh - 32px));padding:0;border:1px solid var(--border);border-radius:8px;background:#fff;box-shadow:0 24px 60px rgba(12,13,14,.2)}.source-dialog::backdrop{background:rgba(12,13,14,.42)}.source-dialog-inner{display:flex;height:100%;flex-direction:column}.source-dialog-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)}.source-dialog-title{min-width:0}.source-dialog-title strong,.source-dialog-title span{display:block}.source-dialog-title span{overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.source-actions{display:flex;gap:8px}.source-action{height:30px;border:1px solid var(--border);border-radius:4px;background:#fff;padding:0 10px;cursor:pointer}.source-pre{flex:1;margin:0;border-radius:0;white-space:pre-wrap;word-break:break-word}
.home-page .sidenav,.home-page .menu-btn{display:none}.home-page .app-main{margin-left:0}.home-page .brand{margin-left:24px}.home-page .content-shell{max-width:1120px;padding:36px 32px 80px}.home-page .page-header{display:block;padding:0 0 22px;border-bottom:1px solid var(--border)}.home-page .page-header h1{max-width:760px;margin:6px 0 8px;font-size:36px;letter-spacing:-.025em}.home-page .page-header .lede{max-width:900px;font-size:14px;line-height:1.7}.home-page .lesson-meta{display:none}.home-dashboard{padding-top:24px}.home-section+.home-section{margin-top:46px}.home-section-head{display:block;margin-bottom:14px}.home-section-head span{color:var(--primary);font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.12em}.home-section-head h2{margin:2px 0 0;color:var(--text);font-size:22px}.home-section-head p{max-width:620px;margin:4px 0 0;color:var(--muted);font-size:12px;text-align:left}.home-route-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.home-route-card{position:relative;display:grid;grid-template-columns:auto 1fr;gap:14px;min-height:154px;padding:18px;border:1px solid var(--border);border-radius:8px;background:#fff;color:var(--regular);transition:border-color .15s,box-shadow .15s,transform .15s}.home-route-card:hover{border-color:#9dbbff;box-shadow:0 8px 24px rgba(22,100,255,.08);text-decoration:none;transform:translateY(-2px)}.home-route-index{display:grid;place-items:center;width:28px;height:28px;border-radius:5px;background:var(--primary-soft);color:var(--primary);font-family:var(--mono);font-size:11px}.home-route-card small{display:block;color:var(--muted);font-size:10px}.home-route-card strong{display:block;margin:3px 0 6px;color:var(--text);font-size:16px}.home-route-card p{margin:0;color:var(--muted);font-size:12px;line-height:1.55}.home-route-meta{position:absolute;right:18px;bottom:14px;color:var(--primary);font-size:11px}.home-chapter-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.home-chapter-card{display:block;padding:18px 20px;border:1px solid var(--border);border-radius:8px;background:var(--subtle);color:var(--regular);transition:border-color .15s,background .15s}.home-chapter-card:hover{border-color:#a9c3f8;background:#fff;text-decoration:none}.home-chapter-head,.home-chapter-foot{display:flex;align-items:center;justify-content:space-between}.home-chapter-number{color:var(--primary);font-family:var(--mono);font-size:11px}.home-chapter-level{padding:2px 6px;border-radius:3px;background:#eaf0f8;color:var(--muted);font-size:9px}.home-chapter-card>strong{display:block;margin:10px 0 4px;color:var(--text);font-size:16px}.home-chapter-card>p{min-height:40px;margin:0 0 14px;color:var(--muted);font-size:12px}.home-chapter-foot{padding-top:11px;border-top:1px solid var(--border);color:var(--muted);font-size:10px}.home-chapter-foot span:last-child{color:var(--primary)}
body.side-closed .sidenav{transform:translateX(-100%)}body.side-closed .app-main{margin-left:0}
@media(max-width:900px){.overview{grid-template-columns:1fr}.article-layout{grid-template-columns:1fr}.toc{display:none}.content-shell{padding:22px 24px 56px}.home-route-grid{grid-template-columns:1fr}.home-route-card{min-height:142px}.home-chapter-grid{grid-template-columns:1fr}.lesson-outline-grid{grid-template-columns:repeat(2,1fr)}.lesson-outline-card:nth-child(2){border-right:0}.lesson-outline-card:nth-child(-n+2){border-bottom:1px solid var(--border)}.chapter-guide-grid{grid-template-columns:1fr}.chapter-guide-card{min-height:132px}}
@media(max-width:720px){:root{--side:280px}.sidenav{transform:translateX(-100%);box-shadow:8px 0 24px rgba(0,0,0,.12)}body:not(.side-closed) .sidenav{transform:translateX(0)}.app-main{margin-left:0}.brand{width:auto}.brand span:last-child{display:none}.content-shell{padding:18px 16px 48px}.page-header{display:block}.complete-btn{margin-top:14px}.arch-flow{grid-template-columns:1fr}.arch-node:not(:last-child)::after{content:"↓";right:50%;top:auto;bottom:-21px}.search-panel{left:12px;width:calc(100vw - 24px)}.lesson-nav,.beginner-note{grid-template-columns:1fr}.visual-hint,.lesson-visual svg{display:none}.lesson-visual{overflow:visible}.visual-legend{display:grid;grid-template-columns:1fr;gap:18px;padding:16px}.visual-legend-button{position:relative;width:100%;justify-content:flex-start;border-radius:6px;padding:10px 12px}.visual-legend-button:not(:last-child)::after{content:"↓";position:absolute;left:50%;bottom:-19px;color:var(--primary)}.visual-detail{display:block}.visual-detail strong{display:block}.lesson-outline-grid{grid-template-columns:1fr}.lesson-outline-card{border-right:0;border-bottom:1px solid var(--border)}.lesson-outline-card:last-child{border-bottom:0}.chapter-guide-head{display:block}.chapter-guide-head>p{margin-top:4px;text-align:left}.source-dialog{width:calc(100vw - 16px);height:calc(100vh - 16px)}.home-page .content-shell{padding:34px 16px 64px}.home-page .page-header h1{font-size:32px}.home-section-head{display:block}.home-section-head p{margin-top:6px;text-align:left}}
@media print{.top-nav,.sidenav,.toc,.complete-btn,.lesson-nav{display:none!important}.app-main{margin:0;padding:0}.content-shell{max-width:none;padding:0}.article-layout{display:block}.article h1{display:block}.overview{break-inside:avoid}a{color:inherit}}
`;

const script = `
const DATA=${data};
const state={pageId:location.hash.slice(1)||DATA.pages[0].id,query:"",level:-1};
const byId=new Map(DATA.pages.map(p=>[p.id,p]));
const completed=new Set(JSON.parse(localStorage.getItem("llm-space-course-progress")||"[]"));
const allLessons=DATA.pages.filter(p=>p.kind==="lesson");
const el=id=>document.getElementById(id);
const glossary=[
["Runtime","真正执行代码并提供系统能力的环境。本项目有本地与远程 Runtime。"],
["Thread","一份可保存、编辑、运行和评测的 Agent 实验文档。"],
["Context","本次模型运行能看到的提示词、消息、变量与工具。"],
["State","程序当前记住的数据；变化后可能推动界面更新。"],
["Store","集中保存状态和更新动作的对象。每个 Thread Tab 有独立 Store。"],
["RPC","把跨进程或跨机器调用编码成请求与响应。"],
["SSE","服务端持续发送文本事件的一种流式格式。"],
["AsyncGenerator","可以随时间多次产出异步事件，而不只返回一个最终值。"],
["AbortController","向一个或多个异步任务发出取消信号。"],
["Schema","数据结构的规则，描述字段、类型与约束。"],
["Provider","模型服务及其连接、认证与模型目录配置。"],
["Tool Call","模型提出的结构化工具执行请求。"],
["ReAct","模型决定行动、执行工具、观察结果并继续推理的循环。"],
["MCP","连接 AI 应用与外部数据、工具和提示的开放协议。"],
["HostServices","共享 UI 向桌面或 Web 宿主索取能力的接口。"],
["Dependency Injection","把外部能力作为参数传入，使实现可替换、可测试。"],
["Atomic Write","通过临时文件和重命名避免留下半写入文件。"],
["Monorepo","在一个仓库中管理多个相关 Package 与应用。"]
];
function saveProgress(){localStorage.setItem("llm-space-course-progress",JSON.stringify([...completed]));renderProgress()}
function renderProgress(){const pct=Math.round(completed.size/allLessons.length*100);el("progress-fill").style.width=pct+"%";el("progress-text").textContent=completed.size+" / "+allLessons.length;el("progress-pct").textContent=pct+"%"}
function renderSide(){
  const current=byId.get(state.pageId)||DATA.pages[0];
  el("side-nav").innerHTML=DATA.chapters.map(([id,title],i)=>{
    const chapterPage=byId.get(id);
    if(state.level>=0&&chapterPage.level!==state.level)return "";
    const expanded=current.chapterId===id&&current.kind!=="home";
    const children=expanded?DATA.pages.filter(p=>p.chapterId===id&&p.kind==="lesson"):[];
    return '<div class="menu-group '+(expanded?"expanded":"")+'"><a class="menu-item '+(state.pageId===id?"active":"")+'" href="#'+id+'"><span class="menu-num">'+String(i).padStart(2,"0")+'</span><span class="menu-title">'+title+'</span><span class="menu-level">'+chapterPage.levelLabel+'</span></a>'+(expanded?'<div class="subnav">'+children.map(p=>'<a class="menu-item '+(state.pageId===p.id?"active":"")+'" href="#'+p.id+'">'+p.title+'</a>').join("")+'</div>':"")+'</div>'
  }).join("")
}
let sourceTrigger=null;
function openSource(trigger){const p=byId.get(state.pageId)||DATA.pages[0];sourceTrigger=trigger;el("source-dialog-title").textContent=p.title;el("source-dialog-path").textContent=p.source;el("source-content").textContent=p.markdown;el("source-dialog").showModal();el("source-close").focus()}
function renderHomeDashboard(){
  const routes=[
    {label:"完全零基础",title:"从预备课开始",desc:"先理解程序、JSON、TypeScript、React、异步与 Agent。",href:"#00-foundations",meta:"5 节基础课"},
    {label:"初级开发者",title:"先建立项目全景",desc:"从产品概念和调用链入手，再进入 Core 与 Runtime。",href:"#01-learning-map",meta:"推荐起点"},
    {label:"有工程经验",title:"直接阅读核心架构",desc:"从 Thread 领域模型、Runtime 边界和远程协议开始。",href:"#02-core-domain",meta:"源码路径"}
  ];
  const routeHtml=routes.map((route,index)=>'<a class="home-route-card" href="'+route.href+'"><span class="home-route-index">0'+(index+1)+'</span><div><small>'+route.label+'</small><strong>'+route.title+'</strong><p>'+route.desc+'</p></div><span class="home-route-meta">'+route.meta+' →</span></a>').join("");
  const chapterHtml=DATA.chapters.map(([id,title,description],index)=>{
    const chapterPage=byId.get(id);
    const lessons=DATA.pages.filter(p=>p.chapterId===id&&p.kind==="lesson").length;
    return '<a class="home-chapter-card" href="#'+id+'"><div class="home-chapter-head"><span class="home-chapter-number">'+String(index).padStart(2,"0")+'</span><span class="home-chapter-level">'+chapterPage.levelLabel+'</span></div><strong>'+title+'</strong><p>'+description+'</p><div class="home-chapter-foot"><span>'+lessons+' 个专题</span><span>进入章节 →</span></div></a>'
  }).join("");
  el("home-dashboard").innerHTML='<section class="home-section"><div class="home-section-head"><div><span>学习起点</span><h2>选择适合你的进入方式</h2></div><p>不需要从第一页硬读到最后一页。按当前经验进入对应路径。</p></div><div class="home-route-grid">'+routeHtml+'</div></section><section class="home-section"><div class="home-section-head"><div><span>完整目录</span><h2>课程地图</h2></div><p>7 个阶段，23 个专题，从基础概念推进到独立开发与发布。</p></div><div class="home-chapter-grid">'+chapterHtml+'</div></section>';
}
function renderPage(){
  const p=byId.get(state.pageId)||DATA.pages[0];state.pageId=p.id;
  const isHome=p.kind==="home";
  const isLesson=p.kind==="lesson";
  document.body.classList.toggle("home-page",isHome);
  const chapter=DATA.chapters.find(c=>c[0]===p.chapterId);
  const siblings=p.kind==="home"?[]:DATA.pages.filter(x=>x.chapterId===p.chapterId&&x.kind==="lesson");
  const sequence=DATA.pages;const idx=sequence.indexOf(p);const prev=sequence[idx-1],next=sequence[idx+1];
  el("breadcrumb").hidden=isHome;
  el("breadcrumb").innerHTML=isHome?"":'<a href="#'+p.chapterId+'">'+chapter[1]+'</a><span>/</span><span>'+p.title+'</span>';
  el("eyebrow").textContent=isHome?"从零基础到独立开发":p.kind==="chapter"?"章节总览":"分步源码课程";
  el("title").textContent=p.title;el("lede").textContent=p.description;
  el("lesson-meta").innerHTML='<span class="meta-chip level">难度 · '+p.levelLabel+'</span><span class="meta-chip">预计 · '+p.duration+'</span><span class="meta-chip">前置 · '+p.prerequisite+'</span>';
  el("learning-guidance").innerHTML="";
  el("home-dashboard").hidden=!isHome;
  if(isHome)renderHomeDashboard();
  el("overview").hidden=true;
  el("learning-guidance").hidden=true;
  el("visual").hidden=isHome;
  el("visual").innerHTML=isHome?"":p.visual;
  el("article").innerHTML=p.html;
  el("source-link").textContent=p.source;el("source-link").onclick=e=>openSource(e.currentTarget);
  el("complete-btn").hidden=p.kind!=="lesson";el("complete-btn").classList.toggle("done",completed.has(p.id));el("complete-btn").textContent=completed.has(p.id)?"✓ 已完成":"标记完成";
  el("tabs").hidden=isHome;
  el("article-layout").hidden=isHome;
  el("lesson-nav").hidden=isHome;
  el("tabs").innerHTML=isHome?"":'<a class="tab active" href="#'+p.id+'">课程正文</a><button class="tab" id="open-source-tab">Markdown 源文档</button>';
  if(!isHome)el("open-source-tab").onclick=e=>openSource(e.currentTarget);
  el("lesson-nav").innerHTML=(prev?'<a class="lesson-link" href="#'+prev.id+'"><small>上一节</small>'+prev.title+'</a>':"<span></span>")+(next?'<a class="lesson-link next" href="#'+next.id+'"><small>下一节</small>'+next.title+'</a>':"");
  buildToc();wireArticle();wireVisual();renderSide();document.title=p.title+" · LLM Space 开发课程";window.scrollTo(0,0)
}
function buildToc(){const hs=[...el("article").querySelectorAll("h2,h3")];el("toc-links").innerHTML=hs.map(h=>'<a href="#'+state.pageId+'" data-section="'+h.id+'" class="'+(h.tagName==="H3"?"sub":"")+'">'+h.textContent+'</a>').join("")||'<span class="empty">本页无目录</span>';el("toc-links").querySelectorAll("[data-section]").forEach(link=>{link.onclick=e=>{e.preventDefault();document.getElementById(link.dataset.section)?.scrollIntoView({behavior:"smooth",block:"start"})}})}
function wireArticle(){el("article").querySelectorAll(".copy-code").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.nextElementSibling.textContent);b.textContent="已复制";setTimeout(()=>b.textContent="复制",1200)});el("article").querySelectorAll("[data-wiki-link]").forEach(a=>{const raw=a.getAttribute("data-wiki-link");const clean=raw.replace(/^\\.\\.\\//,"").replace(/^\\.\\//,"").replace(/\\.md$/,"");const target=[...byId.keys()].find(id=>id===clean||id.endsWith("/"+clean.split("/").pop()));if(target){a.href="#"+target}})}
function wireVisual(){const buttons=[...el("visual").querySelectorAll(".visual-legend-button")];const nodes=[...el("visual").querySelectorAll(".visual-node")];buttons.forEach((button,index)=>{button.onclick=()=>{buttons.forEach(item=>item.classList.remove("active"));nodes.forEach(item=>item.classList.remove("active"));button.classList.add("active");nodes[index]?.classList.add("active");const detail=el("visual").querySelector(".visual-detail");detail.querySelector("strong").textContent=button.dataset.title+"：";detail.querySelector("span").textContent=button.dataset.description}})}
function search(query){const q=query.trim().toLowerCase();const panel=el("search-panel");if(!q){panel.hidden=true;return}const matches=DATA.pages.map(p=>({p,score:(p.title.toLowerCase().includes(q)?8:0)+(p.text.toLowerCase().split(q).length-1)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);panel.innerHTML=matches.length?matches.map(({p})=>'<a class="search-result" href="#'+p.id+'"><strong>'+p.title+'</strong><span>'+p.source+'</span></a>').join(""):'<div class="empty">没有找到相关课程</div>';panel.hidden=false}
addEventListener("hashchange",()=>{const nextPageId=location.hash.slice(1);if(!byId.has(nextPageId))return;state.pageId=nextPageId;renderPage();el("search-panel").hidden=true;if(innerWidth<720)document.body.classList.add("side-closed")});
el("menu-btn").onclick=()=>document.body.classList.toggle("side-closed");
el("complete-btn").onclick=()=>{completed.has(state.pageId)?completed.delete(state.pageId):completed.add(state.pageId);saveProgress();renderPage()};
el("search-input").addEventListener("input",e=>search(e.target.value));
el("level-filter").addEventListener("change",e=>{state.level=Number(e.target.value);renderSide()});
function openGlossary(){const drawer=el("glossary-drawer");drawer.hidden=false;drawer.inert=false;drawer.setAttribute("aria-hidden","false");drawer.classList.add("open");el("glossary-btn").setAttribute("aria-expanded","true");el("drawer-close").focus()}
function closeGlossary({restoreFocus=true}={}){const drawer=el("glossary-drawer");drawer.classList.remove("open");drawer.hidden=true;drawer.inert=true;drawer.setAttribute("aria-hidden","true");el("glossary-btn").setAttribute("aria-expanded","false");if(restoreFocus)el("glossary-btn").focus()}
el("glossary-btn").onclick=openGlossary;
el("drawer-close").onclick=()=>closeGlossary();
el("glossary-list").innerHTML=glossary.map(([term,definition])=>'<div class="glossary-item"><strong>'+term+'</strong><span>'+definition+'</span></div>').join("");
el("source-close").onclick=()=>el("source-dialog").close();
el("source-copy").onclick=async()=>{await navigator.clipboard.writeText(el("source-content").textContent);el("source-copy").textContent="已复制";setTimeout(()=>el("source-copy").textContent="复制",1200)};
el("source-dialog").addEventListener("close",()=>{sourceTrigger?.focus();sourceTrigger=null});
document.addEventListener("keydown",e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();el("search-input").focus()}if(e.key==="Escape"){el("search-panel").hidden=true;el("search-input").blur();if(!el("glossary-drawer").hidden)closeGlossary()}});
document.addEventListener("click",e=>{if(!e.target.closest(".search")&&!e.target.closest(".search-panel"))el("search-panel").hidden=true;if(!el("glossary-drawer").hidden&&!e.target.closest("#glossary-drawer")&&!e.target.closest("#glossary-btn"))closeGlossary({restoreFocus:false})});
if(innerWidth<720)document.body.classList.add("side-closed");renderProgress();renderPage();
`;

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="基于 LLM Space 4 完整源码编写的小白友好开发课程"><title>LLM Space 4 完全开发课程</title><style>${css}</style></head>
<body>
<header class="top-nav"><button id="menu-btn" class="menu-btn" aria-label="展开或收起目录">☰</button><a class="brand" href="#home"><span class="brand-mark">LS</span><span>LLM Space 开发课程</span></a><div class="search"><input id="search-input" type="search" placeholder="搜索架构、类型、函数与开发流程…" aria-label="全文搜索"><kbd>⌘ K</kbd></div><button id="glossary-btn" class="glossary-btn" aria-controls="glossary-drawer" aria-expanded="false">术语表</button><div class="top-meta">分级源码学习 Wiki · ${pages.length} 页</div></header>
<aside class="sidenav"><label class="side-label" for="level-filter">难度筛选</label><select id="level-filter" class="side-filter"><option value="-1">全部难度</option><option value="0">零基础</option><option value="1">入门</option><option value="2">核心与实践</option><option value="3">进阶</option></select><div class="side-label">课程目录</div><nav id="side-nav"></nav><div class="completion"><div class="completion-row"><span>学习进度</span><strong id="progress-pct">0%</strong></div><div class="progress-track"><div id="progress-fill" class="progress-fill"></div></div><div class="completion-row" style="margin:7px 0 0"><span>已完成</span><span id="progress-text">0 / ${pages.filter((page) => page.kind === "lesson").length}</span></div></div></aside>
<main class="app-main"><div class="content-shell"><div id="breadcrumb" class="breadcrumb"></div><section class="page-header"><div><div id="eyebrow" class="eyebrow"></div><h1 id="title"></h1><p id="lede" class="lede"></p><div id="lesson-meta" class="lesson-meta"></div></div><button id="complete-btn" class="complete-btn">标记完成</button></section>
<section id="overview" class="overview"><div class="arch-card"><div class="arch-title"><strong>渐进学习路径</strong><span class="status-tag">从概念到源码</span></div><div class="arch-flow"><div class="arch-node">零基础<br><small>编程 · 前端 · Agent</small></div><div class="arch-node hot">源码核心<br><small>Thread · Runtime · Tools</small></div><div class="arch-node">工程实践<br><small>Desktop · Remote · Release</small></div></div></div><div class="stat-card"><div class="stat"><span>课程页面</span><strong>${pages.length}</strong></div><div class="stat"><span>分级专题</span><strong>${pages.filter((page) => page.kind === "lesson").length}</strong></div><div class="stat"><span>交互图解</span><strong>每页 1+</strong></div></div></section>
<div id="home-dashboard" class="home-dashboard" hidden></div><div id="learning-guidance" class="beginner-note"></div><div id="visual"></div><nav id="tabs" class="tabs"></nav><div id="article-layout" class="article-layout"><article id="article" class="article"></article><aside class="toc"><div class="toc-title">本页目录</div><nav id="toc-links"></nav><div class="toc-title" style="margin-top:20px">课程源文件</div><button id="source-link" class="source-inline"></button></aside></div><nav id="lesson-nav" class="lesson-nav"></nav></div></main>
<div id="search-panel" class="search-panel" hidden></div><aside id="glossary-drawer" class="glossary-drawer" role="dialog" aria-modal="true" aria-label="术语表" aria-hidden="true" hidden inert><div class="drawer-head"><h2>核心术语表</h2><button id="drawer-close" class="drawer-close" aria-label="关闭">×</button></div><p class="lede">遇到陌生词先在这里建立直觉，再回到源码理解精确定义。</p><div id="glossary-list"></div></aside>
<dialog id="source-dialog" class="source-dialog" aria-labelledby="source-dialog-title"><div class="source-dialog-inner"><div class="source-dialog-head"><div class="source-dialog-title"><strong id="source-dialog-title"></strong><span id="source-dialog-path"></span></div><div class="source-actions"><button id="source-copy" class="source-action">复制</button><button id="source-close" class="source-action">关闭</button></div></div><pre class="source-pre"><code id="source-content"></code></pre></div></dialog><script>${script}</script></body></html>`;

fs.writeFileSync(outputFile, html);
console.log(`${outputFile}: ${pages.length} pages, ${html.length} bytes`);
