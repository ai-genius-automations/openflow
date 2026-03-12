import stripAnsi from 'strip-ansi';

/** Remove all ANSI escape codes and normalize PTY line endings */
export function strip(input: string): string {
  return stripAnsi(input)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '');
}

/** Strip ANSI codes, normalize PTY line endings, collapse blank lines, and trim */
export function cleanOutput(input: string): string {
  return strip(input)
    .replace(/\r\n/g, '\n')   // CRLF → LF
    .replace(/\r/g, '')        // strip remaining CRs (overwrite sequences)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
