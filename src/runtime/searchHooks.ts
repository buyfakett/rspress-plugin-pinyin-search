import type {
    AfterSearch,
    DefaultMatchResultItem,
    OnSearch,
} from '@rspress/core/theme';
import {
    indexPage,
    isPinyinQuery,
    searchPinyinPages,
    type IndexedSearchPage,
    type SearchPage,
} from './pinyin.js';

declare const __webpack_public_path__: string;

// Use the same asset prefix as Rspress's local provider, including CDN and
// development prefixes. The fallback allows the pure URL helper to run in Node.
const basePath = typeof __webpack_public_path__ === 'undefined'
    ? '/'
    : __webpack_public_path__;
const pagesCache = new Map<string, Promise<IndexedSearchPage[]>>();
const pendingPinyinMatches = new WeakMap<object, DefaultMatchResultItem[]>();

export function getSearchIndexUrl(
    hashes: Record<string, string>,
    lang: string,
    version: string,
    base = basePath,
) {
    // Rspress emits a shared index without a version when search.versioned is
    // false, while page metadata still contains the current version.
    const indexVersion = hashes[`${version}###${lang}`] ? version : '';
    const hash = hashes[`${indexVersion}###${lang}`];
    if (!hash) return;

    const versionPart = indexVersion ? `.${indexVersion.replace('.', '_')}` : '';
    const langPart = lang ? `.${lang}` : '';
    return `${base.replace(/\/$/, '')}/static/search_index${versionPart}${langPart}.${hash}.json`;
}

function loadPages(url: string) {
    let promise = pagesCache.get(url);
    if (!promise) {
        promise = fetch(url)
            .then(async response => {
                if (!response.ok) throw new Error(`Failed to fetch search index: ${url}`);
                return ((await response.json()) as SearchPage[]).map(indexPage);
            })
            .catch(error => {
                pagesCache.delete(url);
                throw error;
            });
        pagesCache.set(url, promise);
    }
    return promise;
}

export const onSearch: OnSearch = async (query, results) => {
    const normalizedQuery = query.trim();
    if (!isPinyinQuery(normalizedQuery)) return [];

    try {
        const runtime = await import('@rspress/core/runtime');
        // Hooks run outside React, so use the public page loader rather than
        // calling React hooks or inferring language/version from the URL.
        const page = await runtime.initPageData(runtime.removeBase(window.location.pathname));
        const url = getSearchIndexUrl(runtime.searchIndexHash, page.lang || '', page.version || '');
        if (!url) return [];

        const pinyinMatches = searchPinyinPages(await loadPages(url), normalizedQuery);
        if (pinyinMatches.length) pendingPinyinMatches.set(results, pinyinMatches);
    } catch (error) {
        console.error('Pinyin search failed:', error);
    }
    return [];
};

export const afterSearch: AfterSearch = async (_query, results) => {
    const pinyinMatches = pendingPinyinMatches.get(results);
    if (!pinyinMatches) return;
    pendingPinyinMatches.delete(results);

    const builtInGroup = results[0];
    if (!builtInGroup) return;

    // Preserve the original search experience: a matching pinyin query uses
    // Chinese snippets and the default renderer, with one result per page.
    results.splice(0, results.length, {
        group: builtInGroup.group,
        renderType: 'default',
        result: pinyinMatches,
    } as typeof builtInGroup);
};
