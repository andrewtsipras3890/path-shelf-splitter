import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, join, detectStyle, PathStyle } from '../src/index.js';

test('parse posix absolute path with extension', () => {
  const p = parse('/usr/local/bin/file.tar.gz');
  assert.deepEqual(p, {
    style: 'posix',
    root: '/',
    dir: ['usr', 'local', 'bin'],
    base: 'file.tar.gz',
    ext: '.gz',
  });
});

test('parse posix relative path', () => {
  const p = parse('foo/bar/baz.txt');
  assert.deepEqual(p, {
    style: 'posix',
    root: '',
    dir: ['foo', 'bar'],
    base: 'baz.txt',
    ext: '.txt',
  });
});

test('parse bare filename has no dir', () => {
  const p = parse('notes.md');
  assert.deepEqual(p, {
    style: 'posix',
    root: '',
    dir: [],
    base: 'notes.md',
    ext: '.md',
  });
});

test('parse dotfile has no extension', () => {
  const p = parse('/home/u/.bashrc');
  assert.deepEqual(p, {
    style: 'posix',
    root: '/',
    dir: ['home', 'u'],
    base: '.bashrc',
    ext: '',
  });
});

test('parse trailing separator drops base', () => {
  const p = parse('/var/log/');
  assert.deepEqual(p, {
    style: 'posix',
    root: '/',
    dir: ['var', 'log'],
    base: '',
    ext: '',
  });
});

test('parse repeated separators collapse', () => {
  const p = parse('//a//b//');
  assert.deepEqual(p.dir, ['a', 'b']);
  assert.equal(p.root, '/');
  assert.equal(p.base, '');
});

test('parse windows drive path', () => {
  const p = parse('C:\\Users\\Jane\\file.txt');
  assert.deepEqual(p, {
    style: 'windows',
    root: 'C:\\',
    dir: ['Users', 'Jane'],
    base: 'file.txt',
    ext: '.txt',
  });
});

test('parse windows with forward slashes', () => {
  const p = parse('D:/data/reports.csv');
  assert.deepEqual(p, {
    style: 'windows',
    root: 'D:\\',
    dir: ['data'],
    base: 'reports.csv',
    ext: '.csv',
  });
});

test('parse lowercase drive is normalised to uppercase', () => {
  const p = parse('c:\\tmp');
  assert.equal(p.root, 'C:\\');
});

test('detectStyle treats bare C:foo as posix', () => {
  assert.equal(detectStyle('C:foo'), 'posix');
  const p = parse('C:foo');
  assert.equal(p.style, 'posix');
  assert.equal(p.root, '');
  assert.equal(p.base, 'C:foo');
});

test('join reconstructs posix absolute', () => {
  const s = join({
    style: PathStyle.POSIX,
    root: '/',
    dir: ['etc', 'nginx'],
    base: 'nginx.conf',
  });
  assert.equal(s, '/etc/nginx/nginx.conf');
});

test('join reconstructs posix relative with empty root', () => {
  const s = join({
    style: PathStyle.POSIX,
    root: '',
    dir: ['a', 'b'],
    base: 'c',
  });
  assert.equal(s, 'a/b/c');
});

test('join reconstructs windows with backslash separator', () => {
  const s = join({
    style: PathStyle.WINDOWS,
    root: 'C:\\',
    dir: ['Users', 'Jane'],
    base: 'file.txt',
  });
  assert.equal(s, 'C:\\Users\\Jane\\file.txt');
});

test('join accepts explicit separator override', () => {
  const s = join({
    style: PathStyle.POSIX,
    root: '/',
    dir: ['a', 'b'],
    base: 'c',
  }, '\\');
  assert.equal(s, '\\a\\b\\c');
});

test('join handles empty base as trailing separator', () => {
  const s = join({
    style: PathStyle.POSIX,
    root: '/',
    dir: ['var', 'log'],
    base: '',
  });
  assert.equal(s, '/var/log/');
});

test('join with no dir produces root + base only', () => {
  const s = join({
    style: PathStyle.POSIX,
    root: '/',
    dir: [],
    base: 'file',
  });
  assert.equal(s, '/file');
});

test('round trip parse then join is lossless for simple posix', () => {
  const original = '/usr/local/bin/script.sh';
  const p = parse(original);
  assert.equal(join(p), original);
});

test('round trip parse then join is lossless for windows', () => {
  const original = 'C:\\Program Files\\App\\run.exe';
  const p = parse(original);
  assert.equal(join(p), original);
});

test('parse rejects non-string input', () => {
  assert.throws(() => parse(123), TypeError);
  assert.throws(() => parse(null), TypeError);
});

test('parse empty string yields empty everything', () => {
  const p = parse('');
  assert.deepEqual(p, { style: 'posix', root: '', dir: [], base: '', ext: '' });
});

test('parse path with dot and dot-dot segments preserves them verbatim', () => {
  const p = parse('/a/./b/../c');
  assert.deepEqual(p.dir, ['a', '.', 'b', '..']);
  assert.equal(p.base, 'c');
});
