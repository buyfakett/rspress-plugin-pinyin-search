# rspress-plugin-pinyin-search

Rspress 本地搜索插件，支持通过中文的全拼和拼音首字母查找文档。

## 特性

- 全拼搜索：输入 `bushu` 匹配“部署”。
- 首字母搜索：输入 `bs` 匹配“部署”，支持大写输入。
- 搜索页面标题、小标题、正文和描述，按标题、小标题、正文的顺序排列。
- 结果高亮对应的中文，支持跳转到小标题，同一页面只展示一条结果，最多展示 7 条。
- 没有拼音命中时保留 Rspress 原生搜索；有拼音命中时展示拼音结果，沿用 note 原实现的行为。

## 安装

```bash
pnpm add rspress-plugin-pinyin-search
```

## 配置

```ts
import { defineConfig } from '@rspress/core';
import { pluginPinyinSearch } from 'rspress-plugin-pinyin-search';

export default defineConfig({
  search: {
    codeBlocks: true,
  },
  plugins: [pluginPinyinSearch()],
});
```

也可以使用默认导出：

```ts
import pluginPinyinSearch from 'rspress-plugin-pinyin-search';
```

插件自动注册 `search.searchHooks`，无需复制主题文件或单独安装 `pinyin-pro`。已有的其它 `search` 配置会保留；`search: false` 时不启用插件。若项目已有 `search.searchHooks`，请先移除，该入口由插件管理。

## 本地开发与测试

先构建插件，再在站点中安装本地目录依赖：

```bash
# 插件目录
pnpm install
pnpm build
pnpm test

# note 目录（按实际目录调整路径）
pnpm add rspress-plugin-pinyin-search@file:../reactcode/rspress-plugin-pinyin-search
pnpm build:test
pnpm dev
```

站点的 `rspress.config.ts` 使用上面的导入和插件配置，并删除原来的 `search.searchHooks`。本地插件源码修改后，重新构建插件并在站点运行 `pnpm update rspress-plugin-pinyin-search` 刷新本地包。

## 搜索范围

- 使用 Rspress 生成的本地搜索索引，按当前页面语言和文档版本加载。
- 拼音查询只接受 1–64 个英文字母；查询会去除首尾空格并忽略大小写。
- 匹配连续中文片段的完整拼音或首字母，不支持声调、空格分词或汉字与拼音混输。
- 多音字读音由 `pinyin-pro` 按上下文判断。
