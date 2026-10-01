/**
 * Core path-splitting and reconstruction logic.
 *
 * Design decision: a single "normalized" form is used internally for the
 * `components` arrays produced by `parse()` — the directory entries never
 * contain a bare separator character and there are no empty string entries
 * between doubled separators. This keeps join() a trivial `Array.join()`
 * and makes round-tripping `parse -> join` lossless for meaningful content.
 * Repeated separators (`a//b`) collapse to a single `b` entry; this mirrors
 * POSIX filesystem semantics where `a//b` resolves to `a/b`.
 */

/**
 * Recognised path styles.
 *
 * `windows` here means "drive-prefixed, backslash-or-forward-slash separated"
 * as accepted by the Win32 API. `posix` means everything else.
 */
export const PathStyle = Object.freeze({
  POSIX: 'posix',
  WINDOWS: 'windows',
});

const POSIX_SEP = '/';
const WINDOWS_SEP = '\\';

/**
 * Determine whether a path string uses Windows drive-letter semantics.
 *
 * We treat a leading `X:\` or `X:/` (single ASCII letter) as Windows. A bare
 * `C:` without a following separator is a POSIX path-segment in our model
 * (e.g. `C:foo`), matching how a POSIX shell would see it, and is returned as
 * posix. This is the one deliberate ambiguity we resolve in favour of POSIX.
 *
 * @param {string} path
 * @returns {'posix' | 'windows'}
 */
export function detectStyle(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }
  if (path.length >= 3 && isAsciiLetter(path.charCodeAt(0)) && path.charCodeAt(1) === 58 /* ':' */ && (path.charCodeAt(2) === 92 || path.charCodeAt(2) === 47)) {
    return PathStyle.WINDOWS;
  }
  return PathStyle.POSIX;
}

/**
 * Default separator for a given style.
 *
 * @param {string} style
 * @returns {string}
 */
export function defaultSeparator(style) {
  switch (style) {
    case PathStyle.POSIX:
      return POSIX_SEP;
    case PathStyle.WINDOWS:
      return WINDOWS_SEP;
    default:
      throw new Error(`Unknown style: ${style}`);
  }
}

/**
 * Split a path into a structured record.
 *
 * Fields:
 *   - style:       'posix' | 'windows'
 *   - root:        the leading root indicator; '' if none. For POSIX this is
 *                  '/' when absolute, else ''. For Windows this is 'C:\\' (the
 *                  drive letter is normalised to upper-case and the separator
 *                  to backslash).
 *   - dir:         array of directory segments, never containing separators.
 *                  Empty entries from doubled separators are dropped.
 *   - base:        the final filename component, or '' if the path ends with a
 *                  separator. `.` and `..` are returned verbatim as segments.
 *   - ext:         the final dot-extension of `base`, including the dot, or ''
 *                  if `base` has none or is itself a dotfile (leading dot only).
 *
 * @param {string} path
 * @returns {{style: string, root: string, dir: string[], base: string, ext: string}}
 */
export function parse(path) {
  if (typeof path !== 'string') {
    throw new TypeError('path must be a string');
  }

  const style = detectStyle(path);
  let root = '';
  let rest = path;
  let trailingSep = false;

  if (style === PathStyle.WINDOWS) {
    const drive = path[0].toUpperCase();
    root = `${drive}:${WINDOWS_SEP}`;
    rest = path.slice(2); // drop "X:"
    if (rest.length > 0 && (rest[0] === WINDOWS_SEP || rest[0] === POSIX_SEP)) {
      rest = rest.slice(1);
    } else {
      // `C:foo` form: drive-relative. We keep root as 'C:\\' is NOT accurate
      // here, but the brief explicitly resolves this case toward POSIX, so we
      // should not have entered the Windows branch. detectStyle guarantees a
      // trailing separator, so this branch is defensive only.
      rest = path.slice(2);
    }
  } else {
    // Collapse any run of leading slashes to a single POSIX root.
    while (rest.length > 0 && rest[0] === POSIX_SEP) {
      if (root === '') root = POSIX_SEP;
      rest = rest.slice(1);
    }
  }

  // Normalise backslashes to forward slashes for splitting under Windows so
  // that mixed-separator inputs (`C:\\foo/bar`) split consistently.
  if (style === PathStyle.WINDOWS) {
    rest = rest.split(WINDOWS_SEP).join(POSIX_SEP);
  }

  if (rest.length > 0 && rest[rest.length - 1] === POSIX_SEP) {
    trailingSep = true;
  }

  const allSegments = rest.length === 0 ? [] : rest.split(POSIX_SEP);
  // Drop empty entries produced by doubled/trailing separators.
  const segments = allSegments.filter((s) => s.length > 0);

  let base = '';
  let dir = segments;
  if (trailingSep) {
    // Path ends with a separator: base is empty, dir is all real segments.
    base = '';
    dir = segments;
  } else if (segments.length > 0) {
    base = segments[segments.length - 1];
    dir = segments.slice(0, -1);
  }

  return {
    style,
    root,
    dir,
    base,
    ext: extractExt(base),
  };
}

/**
 * Reconstruct a path string from parsed parts.
 *
 * @param {{style?: string, root?: string, dir?: string[], base?: string, ext?: string}} parts
 * @param {string} [separator]  Optional override; defaults to the style's separator.
 * @returns {string}
 */
export function join(parts, separator) {
  if (parts === null || typeof parts !== 'object') {
    throw new TypeError('parts must be an object');
  }
  const style = parts.style || PathStyle.POSIX;
  const sep = separator || defaultSeparator(style);
  const dir = Array.isArray(parts.dir) ? parts.dir : [];
  const rootIn = typeof parts.root === 'string' ? parts.root : '';
  const base = typeof parts.base === 'string' ? parts.base : '';

  // When an explicit separator override is supplied, also rewrite the root's
  // leading separator character so the override applies consistently.
  let root = rootIn;
  if (separator && rootIn.length > 0) {
    const first = rootIn[0];
    const last = rootIn[rootIn.length - 1];
    if (first === POSIX_SEP || first === WINDOWS_SEP) {
      root = separator + rootIn.slice(1);
    } else if (last === POSIX_SEP || last === WINDOWS_SEP) {
      root = rootIn.slice(0, -1) + separator;
    }
  }

  const dirPart = dir.length > 0 ? dir.join(sep) + sep : '';
  return `${root}${dirPart}${base}`;
}

/**
 * Extract the extension from a filename, including the leading dot.
 *
 * A leading-dot-only filename (`.bashrc`) returns '' — there is no extension.
 * A filename with no dot returns ''. Multiple dots yield the last dot-group.
 *
 * @param {string} base
 * @returns {string}
 */
function extractExt(base) {
  if (base.length === 0) return '';
  // A single leading dot with nothing after, or a name whose only dot is at
  // index 0, has no extension.
  const lastDot = base.lastIndexOf('.');
  if (lastDot <= 0) return '';
  return base.slice(lastDot);
}

/**
 * @param {number} c
 * @returns {boolean}
 */
function isAsciiLetter(c) {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}
