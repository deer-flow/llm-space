# LLM Space 学习 Wiki

本目录包含学习网站的全部内容。

## 目录

- `index.html`：最终交付的单文件学习网站。
- `content/`：课程 Markdown 源文档。
- `scripts/generate-learning-wiki.mjs`：HTML 生成器。
- `design/`：设计源文件与验证报告。
- `reference/`：视觉参考资料。
- `generation-plan.md`：网站生成规划与验证记录。

## 重新生成

在仓库任意目录执行：

```bash
node llm-space-learning-wiki/scripts/generate-learning-wiki.mjs
```

生成结果会写入本目录的 `index.html`。
