import type { RspressPlugin } from '@rspress/core';
import { fileURLToPath } from 'node:url';

/** Add full-pinyin and initial-letter matching to Rspress local search. */
export function pluginPinyinSearch(): RspressPlugin {
  return {
    name: 'rspress-plugin-pinyin-search',
    config(config) {
      if (config.search === false) return config;

      const search = typeof config.search === 'object' ? config.search : {};
      if (search.searchHooks) {
        throw new Error(
          '[rspress-plugin-pinyin-search] Remove search.searchHooks before enabling this plugin; it registers its own search hooks.',
        );
      }

      return {
        ...config,
        search: {
          ...search,
          searchHooks: fileURLToPath(new URL('./runtime/searchHooks.js', import.meta.url)),
        },
      };
    },
  };
}

export default pluginPinyinSearch;
