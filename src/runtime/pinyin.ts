import { pinyin as convertPinyin } from 'pinyin-pro';
import type { PageIndexInfo } from '@rspress/core';
import type { DefaultMatchResultItem } from '@rspress/core/theme';

export type SearchPage = Pick<
    PageIndexInfo,
    'routePath' | 'title' | 'toc' | 'content' | 'description'
>;

export type IndexedSearchPage = SearchPage & {
    titlePinyin: Set<string>;
    headerPinyin: Set<string>;
    contentPinyin: Set<string>;
};

type TextToken = {
    origin: string;
    start: number;
    initial: string;
    full: string;
};

const SEARCH_LIMIT = 7;
const CONTEXT_LENGTH = 48;
const MAX_QUERY_LENGTH = 64;

export function isPinyinQuery(query: string) {
    return query.length <= MAX_QUERY_LENGTH && /^[a-z]+$/i.test(query);
}

function tokenizePinyin(text: string): TextToken[] {
    let offset = 0;
    return convertPinyin(text, { type: 'all', toneType: 'none' }).map(
        ({ origin, pinyin: value, first, isZh }) => {
            const start = offset;
            offset += origin.length;
            return {
                origin,
                start,
                initial: isZh ? first : '',
                full: isZh ? value : '',
            };
        },
    );
}

export function getPinyinMatchIndices(text: string, query: string): number[] {
    const normalizedQuery = query.toLowerCase();
    // Keep each Chinese run separate so punctuation, Latin text and whitespace
    // cannot create a match spanning unrelated words.
    for (const part of text.matchAll(/[\u3400-\u9fff]+/g)) {
        const tokens = tokenizePinyin(part[0]);
        for (let start = 0; start < tokens.length; start++) {
            let initial = '';
            let full = '';
            for (let end = start; end < tokens.length; end++) {
                initial += tokens[end].initial;
                full += tokens[end].full;
                if (initial === normalizedQuery || full === normalizedQuery) {
                    const first = part.index! + tokens[start].start;
                    const last = part.index! + tokens[end].start + tokens[end].origin.length;
                    return Array.from({ length: last - first }, (_, offset) => first + offset);
                }
                if (initial.length > normalizedQuery.length && full.length > normalizedQuery.length) {
                    break;
                }
            }
        }
    }
    return [];
}

function hasPinyinMatch(page: IndexedSearchPage, query: string) {
    return (
        page.titlePinyin.has(query) ||
        page.headerPinyin.has(query) ||
        page.contentPinyin.has(query)
    );
}

function getSearchableChinesePinyin(text: string) {
    const values = new Set<string>();
    for (const part of text.split(/([\u3400-\u9fff]+)/)) {
        if (!/^[\u3400-\u9fff]+$/.test(part)) continue;
        const tokens = tokenizePinyin(part);
        for (let start = 0; start < tokens.length; start++) {
            let initial = '';
            let full = '';
            for (let end = start; end < tokens.length; end++) {
                initial += tokens[end].initial;
                full += tokens[end].full;
                // Queries longer than this are ignored, so do not build an
                // unbounded quadratic index for long paragraphs.
                if (initial.length <= MAX_QUERY_LENGTH) values.add(initial);
                if (full.length <= MAX_QUERY_LENGTH) values.add(full);
                if (initial.length >= MAX_QUERY_LENGTH) break;
            }
        }
    }
    return values;
}

function getPinyinScore(page: IndexedSearchPage, query: string) {
    const normalizedQuery = query.toLowerCase();
    if (page.titlePinyin.has(normalizedQuery)) {
        return 0;
    }
    if (page.headerPinyin.has(normalizedQuery)) {
        return 1;
    }
    return 2;
}

function getByteLength(text: string) {
    let length = 0;
    for (const char of text) {
        length += char.codePointAt(0)! > 255 ? 3 : 1;
    }
    return length;
}

export function indexPage(page: SearchPage): IndexedSearchPage {
    return {
        ...page,
        titlePinyin: getSearchableChinesePinyin(page.title),
        headerPinyin: getSearchableChinesePinyin(
            page.toc.map(({ text }) => text).join(' '),
        ),
        contentPinyin: getSearchableChinesePinyin(
            `${page.content || ''} ${page.description || ''}`,
        ),
    };
}


function getContentMatch(
    page: IndexedSearchPage,
    text: string,
    indices: number[],
): DefaultMatchResultItem[] {
    if (!indices.length) return [];
    const ranges: Array<[number, number]> = [];
    for (const index of indices) {
        const lastRange = ranges[ranges.length - 1];
        if (lastRange && index === lastRange[1]) {
            lastRange[1] += 1;
        } else {
            ranges.push([index, index + 1]);
        }
    }

    return ranges.map(([start, end]) => {
        const lineStart = text.lastIndexOf('\n', start) + 1;
        const lineEndCandidate = text.indexOf('\n', end);
        const lineEnd = lineEndCandidate === -1 ? text.length : lineEndCandidate;
        const line = text.slice(lineStart, lineEnd);
        let statementStart = lineStart;
        let statement = line;

        if (line.length > 100) {
            const contextStart = Math.max(start - lineStart - CONTEXT_LENGTH, 0);
            const contextEnd = Math.min(
                end - lineStart + CONTEXT_LENGTH,
                line.length,
            );
            const prefix = contextStart > 0 ? '...' : '';
            const suffix = contextEnd < line.length ? '...' : '';
            statement = `${prefix}${line.slice(contextStart, contextEnd)}${suffix}`;
            statementStart = lineStart + contextStart - prefix.length;
        }

        const header = [...page.toc]
            .reverse()
            .find(({ charIndex }) => charIndex <= start);
        return {
            type: 'content',
            title: page.title,
            header: header?.text ?? page.title,
            statement,
            link: `${page.routePath}${header ? `#${header.id}` : ''}`,
            query: text.slice(start, end),
            highlightInfoList: [
                {
                    start: start - statementStart,
                    length: getByteLength(text.slice(start, end)),
                },
            ],
        } satisfies DefaultMatchResultItem;
    });
}

function getPinyinMatch(
    page: IndexedSearchPage,
    query: string,
): DefaultMatchResultItem[] {
    const titleMatch = getPinyinMatchIndices(page.title, query);
    if (titleMatch.length) {
        const start = titleMatch[0];
        const end = titleMatch[titleMatch.length - 1] + 1;
        return [
            {
                type: 'title',
                title: page.title,
                header: page.title,
                link: page.routePath,
                query: page.title.slice(start, end),
                highlightInfoList: [
                    {
                        start,
                        length: getByteLength(page.title.slice(start, end)),
                    },
                ],
            },
        ];
    }

    for (const header of page.toc) {
        const headerMatch = getPinyinMatchIndices(header.text, query);
        if (!headerMatch.length) continue;
        const start = headerMatch[0];
        const end = headerMatch[headerMatch.length - 1] + 1;
        return [
            {
                type: 'header',
                title: page.title,
                header: `${page.title} > ${header.text}`,
                link: `${page.routePath}#${header.id}`,
                query: header.text.slice(start, end),
                highlightInfoList: [
                    {
                        start: page.title.length + 3 + start,
                        length: getByteLength(header.text.slice(start, end)),
                    },
                ],
            },
        ];
    }

    const content = page.content || '';
    const contentMatch = getPinyinMatchIndices(content, query);
    if (contentMatch.length) {
        return getContentMatch(page, content, contentMatch);
    }

    const description = page.description || '';
    const descriptionMatch = getPinyinMatchIndices(description, query);
    if (descriptionMatch.length) {
        const start = descriptionMatch[0];
        const end = descriptionMatch[descriptionMatch.length - 1] + 1;
        return [
            {
                type: 'content',
                title: page.title,
                header: page.title,
                statement: description,
                link: page.routePath,
                query: description.slice(start, end),
                highlightInfoList: [
                    {
                        start,
                        length: getByteLength(description.slice(start, end)),
                    },
                ],
            },
        ];
    }

    return [];
}

export function searchPinyinPages(pages: IndexedSearchPage[], query: string) {
    if (!isPinyinQuery(query)) return [];

    const normalizedQuery = query.toLowerCase();
    const matches: DefaultMatchResultItem[] = [];
    const sortedPages = pages
        .filter(page => hasPinyinMatch(page, normalizedQuery))
        .sort((a, b) => getPinyinScore(a, normalizedQuery) - getPinyinScore(b, normalizedQuery));
    const matchedPages = new Set<string>();

    for (const page of sortedPages) {
        if (matches.length >= SEARCH_LIMIT) break;
        const pagePath = page.routePath.split('#', 1)[0];
        if (matchedPages.has(pagePath)) continue;
        const pageMatches = getPinyinMatch(page, normalizedQuery);
        if (!pageMatches.length) continue;
        matchedPages.add(pagePath);
        matches.push(...pageMatches);
    }
    return matches.slice(0, SEARCH_LIMIT);
}
