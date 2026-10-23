import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getPinyinMatchIndices,
    indexPage,
    searchPinyinPages,
} from '../dist/runtime/pinyin.js';
import { getSearchIndexUrl } from '../dist/runtime/searchHooks.js';

function page(overrides = {}) {
    return indexPage({
        title: 'Guide',
        routePath: '/guide',
        toc: [],
        content: '',
        ...overrides,
    });
}

function search(pages, query) {
    return searchPinyinPages(pages, query);
}

test('full pinyin and initials highlight the original Chinese title', () => {
    const pages = [page({ title: '工具数据库指南' })];
    for (const query of ['shujuku', 'SJK']) {
        const [result] = search(pages, query);
        assert.equal(result.type, 'title');
        assert.equal(result.query, '数据库');
        assert.deepEqual(result.highlightInfoList, [{ start: 2, length: 9 }]);
    }
});

test('punctuation, whitespace and Latin text separate Chinese matching runs', () => {
    for (const title of ['中 文', '中，文', '中Docker文', '中\n文']) {
        assert.deepEqual(search([page({ title })], 'zw'), []);
        assert.deepEqual(getPinyinMatchIndices(title, 'zhongwen'), []);
    }
    const [result] = search([page({ title: '中 文 中文' })], 'zhongwen');
    assert.deepEqual(result.highlightInfoList, [{ start: 4, length: 6 }]);
});

test('headings link to the heading and account for the title prefix in highlights', () => {
    const [result] = search([page({
        title: '使用指南',
        toc: [{ id: 'database', text: '配置数据库', depth: 2, charIndex: 0 }],
    })], 'sjk');
    assert.equal(result.type, 'header');
    assert.equal(result.header, '使用指南 > 配置数据库');
    assert.equal(result.link, '/guide#database');
    assert.deepEqual(result.highlightInfoList, [{ start: 9, length: 9 }]);
});

test('body snippets retain the nearest heading and correct truncated highlights', () => {
    const content = `Introduction\n${'x'.repeat(80)}数据库${'x'.repeat(80)}`;
    const [result] = search([page({
        content,
        toc: [{ id: 'setup', text: '配置', depth: 2, charIndex: 13 }],
    })], 'shujuku');
    assert.equal(result.type, 'content');
    assert.equal(result.link, '/guide#setup');
    assert.equal(result.header, '配置');
    assert.equal(result.statement, `...${'x'.repeat(48)}数据库${'x'.repeat(48)}...`);
    assert.deepEqual(result.highlightInfoList, [{ start: 51, length: 9 }]);
});

test('description matches fall back to the page and use Chinese highlights', () => {
    const [result] = search([page({ description: '介绍数据库的用法' })], 'sjk');
    assert.equal(result.type, 'content');
    assert.equal(result.statement, '介绍数据库的用法');
    assert.equal(result.link, '/guide');
    assert.deepEqual(result.highlightInfoList, [{ start: 2, length: 9 }]);
});

test('title, heading and body priorities are stable and results are deduplicated by page', () => {
    const results = search([
        page({ routePath: '/body', content: '数据库' }),
        page({ routePath: '/heading', toc: [{ id: 'db', text: '数据库', depth: 2, charIndex: 0 }] }),
        page({ routePath: '/title', title: '数据库' }),
        page({ routePath: '/title', title: '数据库副本' }),
    ], 'sjk');
    assert.deepEqual(results.map(({ link }) => link), ['/title', '/heading#db', '/body']);
});

test('the limit counts unique pages and leaves enough room after duplicates', () => {
    const pages = Array.from({ length: 10 }, (_, index) => page({
        routePath: `/page-${index}`,
        title: '数据库',
    }));
    const results = search([pages[0], pages[0], ...pages], 'sjk');
    assert.equal(results.length, 7);
    assert.equal(new Set(results.map(({ link }) => link)).size, 7);
});

test('non-pinyin and overlong queries leave the normal search untouched', () => {
    const pages = [page({ title: '数据库' })];
    for (const query of ['', '数据库', 'shu ju ku', 'sjk1', 's'.repeat(65)]) {
        assert.deepEqual(search(pages, query), []);
    }
});

test('long Chinese paragraphs still match within the supported query length', () => {
    const [result] = search([page({ content: `${'测'.repeat(100)}数据库${'试'.repeat(100)}` })], 'shujuku');
    assert.equal(result.query, '数据库');
});

test('index URLs follow Rspress language, version and base-path naming', () => {
    const hashes = { '1.2.3###zh': 'versionHash', '###zh': 'sharedHash', '###': 'defaultHash' };
    assert.equal(getSearchIndexUrl(hashes, 'zh', '1.2.3', '/notes/'), '/notes/static/search_index.1_2.3.zh.versionHash.json');
    assert.equal(getSearchIndexUrl(hashes, 'zh', '2.0', '/notes/'), '/notes/static/search_index.zh.sharedHash.json');
    assert.equal(getSearchIndexUrl(hashes, 'zh', '', 'https://cdn.example.com/assets/'), 'https://cdn.example.com/assets/static/search_index.zh.sharedHash.json');
    assert.equal(getSearchIndexUrl(hashes, '', '', '/'), '/static/search_index.defaultHash.json');
    assert.equal(getSearchIndexUrl(hashes, '', ''), '/static/search_index.defaultHash.json');
    assert.equal(getSearchIndexUrl(hashes, 'en', '1.2.3', '/'), undefined);
});
