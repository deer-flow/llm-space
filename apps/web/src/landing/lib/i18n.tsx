import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

// The languages the site ships in. English is the default; Chinese is the
// only alternative for now. `label` is the native name shown in the switcher.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'llm-space-lang';

// Every user-facing string on the page, keyed by language. `en` is the source
// of truth for shape — `zh` mirrors it exactly. Inline markup (the gradient
// wordmark, line breaks) is split into parts so each locale can place them.
const MESSAGES = {
  en: {
    nav: { quickStart: 'Quick start', userManual: 'User manual' },
    header: { star: 'Star on GitHub', language: 'Language' },
    hero: {
      badge: 'From the DeerFlow team',
      titleBefore: 'Build, trace, and debug agents in ',
      titleAfter: '',
      subtitle:
        'A local-first desktop app to prototype agents, inspect every harness step, replay failures, and evaluate performance.',
      download: 'Download',
      appleSilicon: 'Apple Silicon',
      intel: 'Intel',
      requirements: 'Requires macOS 15.7.3 or later',
      latest: 'Latest',
      seeReleases: 'See all releases',
    },
    showcase: {
      titleLine1: 'The entire agent loop,',
      titleLine2: 'now in one window',
      subtitle:
        'Build, run, extend, and evaluate — every step of your agent lives in a single window, so you always see exactly what it did, and why.',
      learnMore: 'Learn more',
      slides: [
        {
          title: 'Watch the whole loop, live',
          caption:
            'Set the model, tools, and system prompt on the left. Hit Run, and every thought, tool call, and raw response streams in on the right.',
          alt: 'The playground: model, tools, and system prompt on the left; a live run streaming thinking, tool calls, and responses on the right',
        },
        {
          title: 'Start from a proven template',
          caption:
            'Spin up a thread from ready-made prompts — general agent, deep research, translation, knowledge base, and more — instead of a blank page.',
          alt: 'The "Start from examples" dialog listing prompt templates like General Agent, Deep Research, and Translation',
        },
        {
          title: 'Draft a system prompt in seconds',
          caption:
            'Describe the behavior you want and let the built-in generator turn it into a structured prompt you can keep editing.',
          alt: 'Inline system-prompt generation turning a short description into a structured prompt',
        },
        {
          title: 'Every provider, one place',
          caption:
            '20+ providers built in and hundreds of models a toggle away — or bring your own with just a base URL and API key.',
          alt: 'The Models settings pane showing many providers and a long list of selectable models',
        },
        {
          title: 'Built-in tools, ready to run',
          caption:
            'Give a thread file access, web search, shell, and more — flip a switch to add any built-in tool.',
          alt: 'The "Add built-in tools" dialog with toggles for read, write, edit, grep, glob, and other tools',
        },
        {
          title: 'Extend with MCP servers',
          caption:
            'Connect MCP servers and pick exactly which of their tools a thread is allowed to call.',
          alt: 'The "Add MCP tools" dialog listing tools from a connected Tavily server',
        },
        {
          title: 'Define your own function tools',
          caption:
            'Add custom function tools with plain JSON Schema, then supply their responses at runtime.',
          alt: 'The "Add function tool" dialog editing a function definition in JSON Schema',
        },
        {
          title: 'Compare and evaluate runs',
          caption:
            'Put two runs side by side, diff their prompts and results, and save a structured evaluation with the thread.',
          alt: 'The "Evaluate Runs" dialog comparing two runs side by side',
        },
      ],
    },
    providers: {
      title: 'Bring any model, from any provider',
      subtitle:
        '20+ providers built in — OpenAI, Anthropic, Google, and more — or bring your own with just a base URL and API key.',
    },
    community: {
      title: 'Join our community',
      subtitle:
        'LLM Space is open source and built in public. If it helps you build better agents, drop a star — it helps others find the project and shapes what we build next.',
      star: 'Star us on GitHub',
    },
    footer: {
      documents: 'Documents',
      github: 'GitHub',
      releases: 'Releases',
      reportIssues: 'Report issues',
      rights: 'All rights reserved.',
    },
  },
  zh: {
    nav: { quickStart: '快速开始', userManual: '用户手册' },
    header: { star: 'GitHub', language: '语言' },
    hero: {
      badge: '来自 DeerFlow 团队',
      titleBefore: '在 ',
      // `\n` forces the wrap after the comma so line 1 reads exactly
      // "在 LLM Space 中构建，" regardless of breakpoint (see hero <h1>).
      titleAfter: ' 中构建，\n跟踪和调试 Agent',
      subtitle:
        '一款本地优先的桌面应用，用于快速搭建 Agent、检视每一步执行过程、回放失败并评估性能。',
      download: '下载',
      appleSilicon: 'Apple 芯片',
      intel: 'Intel 芯片',
      requirements: '需要 macOS 15.7.3 或更高版本',
      latest: '最新',
      seeReleases: '查看全部版本',
    },
    showcase: {
      titleLine1: '完整的 Agent Loop，',
      titleLine2: '尽在一个窗口',
      subtitle:
        '构建、运行、扩展与评估——Agent 的每一步都在同一个窗口里，让你始终清楚它做了什么、为什么这么做。',
      learnMore: '了解更多',
      slides: [
        {
          title: '实时观察整个循环',
          caption:
            '在左侧设置模型、工具和系统提示词。点击运行，右侧便会实时流式呈现每一次思考、工具调用与原始响应。',
          alt: '试验场：左侧为模型、工具和系统提示词，右侧实时流式呈现思考、工具调用与响应',
        },
        {
          title: '从成熟模板开始',
          caption:
            '基于现成提示词快速开启会话——通用 Agent、深度研究、翻译、知识库等等——无需从空白页开始。',
          alt: '“从示例开始”对话框，列出通用 Agent、深度研究、翻译等提示词模板',
        },
        {
          title: '几秒生成系统提示词',
          caption:
            '描述你想要的行为，内置生成器会将其转化为结构化提示词，供你继续编辑。',
          alt: '内联系统提示词生成，将简短描述转化为结构化提示词',
        },
        {
          title: '汇聚所有服务商',
          caption:
            '内置 20+ 服务商，数百个模型一键切换——或用一个 Base URL 和 API Key 接入你自己的模型。',
          alt: '模型设置面板，展示众多服务商和一长串可选模型',
        },
        {
          title: '内置工具，开箱即用',
          caption:
            '为会话赋予文件访问、网络搜索、命令行等能力——一键开关即可添加任意内置工具。',
          alt: '“添加内置工具”对话框，含 read、write、edit、grep、glob 等工具开关',
        },
        {
          title: '通过 MCP 服务器扩展',
          caption: '连接 MCP 服务器，并精确指定会话可以调用其中的哪些工具。',
          alt: '“添加 MCP 工具”对话框，列出已连接 Tavily 服务器的工具',
        },
        {
          title: '定义你自己的函数工具',
          caption:
            '用纯 JSON Schema 添加自定义函数工具，并在运行时提供它们的响应。',
          alt: '“添加函数工具”对话框，正在用 JSON Schema 编辑函数定义',
        },
        {
          title: '对比与评估运行结果',
          caption:
            '将两次运行并排放置，对比它们的提示词与结果，并将结构化的评估随会话一起保存。',
          alt: '“评估运行”对话框，并排对比两次运行',
        },
      ],
    },
    providers: {
      title: '接入任意服务商的任意模型',
      subtitle:
        '内置 20+ 服务商——OpenAI、Anthropic、Google 等等——或用一个 Base URL 和 API Key 接入你自己的模型。',
    },
    community: {
      title: '加入我们的社区',
      subtitle:
        'LLM Space 开源且 Build in Public。如果它帮你打造了更好的 Agent，欢迎点个 Star——这能帮助更多人发现这个项目，也会影响我们接下来的方向。',
      star: '支持我们的 GitHub',
    },
    footer: {
      documents: '文档',
      github: 'GitHub',
      releases: '版本发布',
      reportIssues: '反馈问题',
      rights: '保留所有权利。',
    },
  },
};

// The shape of a single locale's message tree — `en` is the canonical schema,
// so `zh` is checked against it structurally by TypeScript. (Not `as const`:
// widened string types let both locales share one type.)
export type Messages = (typeof MESSAGES)['en'];

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
};

const I18nContext = createContext<I18nValue | null>(null);

function _readInitialLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  // An explicit past choice always wins.
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  // Otherwise fall back to the browser's preferred language — any Chinese
  // variant (zh, zh-CN, zh-TW, …) opens in Chinese; everything else in English.
  const preferred = window.navigator.languages ?? [window.navigator.language];
  if (preferred.some((l) => l?.toLowerCase().startsWith('zh'))) return 'zh';
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(_readInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures (private mode, etc.) — the choice still applies
      // for this session.
    }
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: MESSAGES[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
