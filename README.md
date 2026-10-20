# Path Shelf Splitter

Splits paths into their component parts (root, directory segments, base name, extension) and reconstructs them, across POSIX and Windows drive-letter forms.

## Usage

```js
import { parse, join, detectStyle, PathStyle } from 'path-shelf-splitter';

const parts = parse('/usr/local/bin/script.sh');
// { style: 'posix', root: '/', dir: ['usr','local','bin'], base: 'script.sh', ext: '.sh' }

const back = join(parts); // '/usr/local/bin/script.sh'

const win = parse('C:\\Users\\Jane\\file.txt');
// { style: 'windows', root: 'C:\\', dir: ['Users','Jane'], base: 'file.txt', ext: '.txt' }
```

Run the tests with `node --test`.

## Why this exists

The problem is small but persistent: you have a path and you need its pieces —
the extension, the directory chain, whether it is absolute — without pulling in
Node's `path` module (which is platform-coupled) or a dependency. This library
makes one explicit decision per awkward case and stops.

The trade-off: `parse()` returns a *normalised* component view. Doubled
separators (`a//b`) collapse to a single directory segment, matching POSIX
filesystem resolution. This means `parse('a//b')` then `join()` yields `a/b`,
not the original `a//b`. If you need byte-exact round-tripping of malformed
input, this library is not it.

## Edge cases you will hit

- **`C:foo`** (drive letter, no separator) is treated as POSIX, not as a
  Windows drive-relative path. Only `C:\` or `C:/` trigger Windows parsing.
  This is deliberate; drive-relative semantics are a different problem.
- **Dotfiles** (`.bashrc`) have no extension. `ext` is `''` when the only dot
  in the base is the leading character.
- **Trailing separators** (`/var/log/`) produce an empty `base`. Rejoining
  reproduces the trailing separator.
- **`.` and `..`** segments are preserved verbatim; no canonicalisation.
- **Lowercase drive letters** (`c:\`) are normalised to uppercase in `root`.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

