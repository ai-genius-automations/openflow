/**
 * Shared diff rendering components used by GitPanel and FileExplorer.
 */
import { useState, useEffect, useRef, useMemo, forwardRef } from 'react';
import { FileDiff } from 'lucide-react';

/* ================================================================
   Types & parsing
   ================================================================ */

export interface HunkInfo {
  index: number;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  oldLines: string[];    // lines removed (without the - prefix)
  newLines: string[];    // lines added (without the + prefix)
  oldContent: string[];  // full old side in order: context + removed lines
  newContent: string[];  // full new side in order: context + added lines
}

export interface SplitRow {
  leftNum: number | null; leftText: string; leftType: 'normal' | 'removed' | 'header' | 'separator';
  rightNum: number | null; rightText: string; rightType: 'normal' | 'added' | 'header' | 'separator';
  hunkIndex: number | null;
}

export type MarkerType = 'added' | 'removed' | 'modified' | null;

/** Parse hunk metadata from raw unified diff text for a single file */
export function parseHunks(diff: string): HunkInfo[] {
  const lines = diff.split('\n');
  const hunks: HunkInfo[] = [];
  let hunkIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        hunkIdx++;
        hunks.push({
          index: hunkIdx,
          oldStart: parseInt(m[1]),
          oldCount: m[2] ? parseInt(m[2]) : 1,
          newStart: parseInt(m[3]),
          newCount: m[4] ? parseInt(m[4]) : 1,
          oldLines: [],
          newLines: [],
          oldContent: [],
          newContent: [],
        });
      }
      continue;
    }

    if (hunkIdx < 0) continue;
    const hunk = hunks[hunkIdx];
    if (!hunk) continue;

    if (line.startsWith('-') && !line.startsWith('---')) {
      hunk.oldLines.push(line.slice(1));
      hunk.oldContent.push(line.slice(1));
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      hunk.newLines.push(line.slice(1));
      hunk.newContent.push(line.slice(1));
    } else if (line.startsWith(' ')) {
      // Context line — present in both old and new
      // (In unified diff, even empty source lines are prefixed with a space)
      hunk.oldContent.push(line.slice(1));
      hunk.newContent.push(line.slice(1));
    }
  }
  return hunks;
}

export function parseSplitRows(raw: string): SplitRow[] {
  const lines = raw.split('\n');
  const result: SplitRow[] = [];
  let lNum = 0, rNum = 0;
  let currentHunkIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('diff --git')) {
      const name = extractFileName(line);
      result.push({ leftNum: null, leftText: name, leftType: 'separator', rightNum: null, rightText: name, rightType: 'separator', hunkIndex: null });
      continue;
    }

    if (line.startsWith('@@')) {
      currentHunkIdx++;
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (m) { lNum = parseInt(m[1]) - 1; rNum = parseInt(m[2]) - 1; }
      result.push({ leftNum: null, leftText: line, leftType: 'header', rightNum: null, rightText: '', rightType: 'header', hunkIndex: currentHunkIdx });
      continue;
    }

    if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('\\')) {
      result.push({ leftNum: null, leftText: line, leftType: 'header', rightNum: null, rightText: '', rightType: 'header', hunkIndex: null });
      continue;
    }

    if (line.startsWith('-')) {
      const removed: string[] = [], added: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith('-')) { removed.push(lines[j].slice(1)); j++; }
      while (j < lines.length && lines[j].startsWith('+')) { added.push(lines[j].slice(1)); j++; }
      const max = Math.max(removed.length, added.length);
      for (let k = 0; k < max; k++) {
        const hasL = k < removed.length, hasR = k < added.length;
        result.push({
          leftNum: hasL ? ++lNum : null, leftText: hasL ? removed[k] : '', leftType: hasL ? 'removed' : 'normal',
          rightNum: hasR ? ++rNum : null, rightText: hasR ? added[k] : '', rightType: hasR ? 'added' : 'normal',
          hunkIndex: currentHunkIdx,
        });
      }
      i = j - 1;
      continue;
    }

    if (line.startsWith('+')) {
      rNum++;
      result.push({ leftNum: null, leftText: '', leftType: 'normal', rightNum: rNum, rightText: line.slice(1), rightType: 'added', hunkIndex: currentHunkIdx });
      continue;
    }

    if (line.length > 0 || i < lines.length - 1) {
      lNum++; rNum++;
      const text = line.startsWith(' ') ? line.slice(1) : line;
      result.push({ leftNum: lNum, leftText: text, leftType: 'normal', rightNum: rNum, rightText: text, rightType: 'normal', hunkIndex: currentHunkIdx });
    }
  }
  return result;
}

export function extractFileName(diffLine: string): string {
  const m = diffLine.match(/diff --git a\/(.*?) b\//);
  return m ? m[1] : diffLine;
}

export function filterDiffToFile(diff: string, filePath: string): string {
  const lines = diff.split('\n');
  let capturing = false;
  const result: string[] = [];
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      capturing = line.includes(`a/${filePath}`) || line.includes(`b/${filePath}`);
    }
    if (capturing) result.push(line);
  }
  return result.join('\n');
}

export function lineStyle(line: string) {
  if (line.startsWith('+') && !line.startsWith('+++')) return { color: 'var(--success)', bg: 'rgba(63,185,80,0.08)' };
  if (line.startsWith('-') && !line.startsWith('---')) return { color: 'var(--error)', bg: 'rgba(248,81,73,0.08)' };
  if (line.startsWith('@@')) return { color: 'var(--accent)', bg: 'transparent' };
  if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) return { color: 'var(--text-tertiary)', bg: 'transparent' };
  return { color: 'inherit', bg: 'transparent' };
}

/* ================================================================
   Constants
   ================================================================ */

export const GUTTER_W = 44;
export const ROW_H = 20;
export const MONO = "var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace)";
export const HUNK_HIGHLIGHT = 'rgba(234,179,8,0.08)';

/* ================================================================
   FileSeparator
   ================================================================ */

export function FileSeparator({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold" style={{ background: 'var(--accent)', color: '#fff', minHeight: 28 }}>
      <FileDiff className="w-3.5 h-3.5 shrink-0" />
      {name}
    </div>
  );
}

/* ================================================================
   SplitHalf
   ================================================================ */

export const SplitHalf = forwardRef<HTMLDivElement, {
  num: number | null;
  text: string;
  type: string;
  side: 'left' | 'right';
  isCurrentHunk: boolean;
  isEditable: boolean;
  isEdited?: boolean;
  onEdit?: (text: string) => void;
  onClick?: () => void;
}>(function SplitHalf({ num, text, type, side: _side, isCurrentHunk, isEditable, isEdited, onEdit, onClick }, ref) {
  if (type === 'separator') {
    return (
      <div ref={ref} className="flex items-center px-2 text-xs font-semibold" style={{ height: ROW_H + 8, background: 'var(--accent)', color: '#fff', letterSpacing: '0.02em' }}>
        <FileDiff className="w-3.5 h-3.5 mr-1.5 shrink-0" />
        <span className="truncate">{text}</span>
      </div>
    );
  }

  if (type === 'header') {
    return (
      <div ref={ref} className="text-xs leading-5 px-1" style={{
        height: ROW_H,
        color: 'var(--accent)',
        background: isCurrentHunk ? HUNK_HIGHLIGHT : 'var(--bg-secondary)',
        whiteSpace: 'pre',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : undefined,
      }} onClick={onClick}>
        {text}
      </div>
    );
  }

  const isRemoved = type === 'removed';
  const isAdded = type === 'added';
  const baseBg = isRemoved ? 'rgba(248,81,73,0.12)' : isAdded ? 'rgba(63,185,80,0.12)' : 'transparent';
  const hunkBg = isCurrentHunk ? HUNK_HIGHLIGHT : 'transparent';
  const bg = isCurrentHunk && !isRemoved && !isAdded ? hunkBg : baseBg;
  const gutterBg = isRemoved ? 'rgba(248,81,73,0.2)' : isAdded ? 'rgba(63,185,80,0.2)' : 'var(--bg-secondary)';
  const textColor = isEdited ? 'var(--accent)' : isRemoved ? 'var(--error)' : isAdded ? 'var(--success)' : 'var(--text-primary)';
  const marker = isRemoved ? '-' : isAdded ? '+' : ' ';

  const handleBlur = (e: React.FocusEvent<HTMLSpanElement>) => {
    if (onEdit) {
      const newText = e.currentTarget.textContent ?? '';
      if (newText !== text) {
        onEdit(newText);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      (e.target as HTMLElement).blur();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLElement).blur();
    }
  };

  return (
    <div ref={ref} className="flex text-xs" style={{ height: ROW_H, background: bg, outline: isCurrentHunk ? `1px solid rgba(234,179,8,0.15)` : undefined }}>
      <span className="shrink-0 text-right pr-1.5 select-none leading-5" style={{ width: GUTTER_W, color: 'var(--text-tertiary)', background: gutterBg }}>
        {num ?? ''}
      </span>
      <span className="shrink-0 w-4 text-center select-none leading-5" style={{ color: textColor }}>{num !== null ? marker : ''}</span>
      <span
        className="flex-1 min-w-0 leading-5"
        style={{
          color: textColor,
          whiteSpace: 'pre',
          outline: 'none',
          cursor: isEditable ? 'text' : undefined,
          borderBottom: isEdited ? '1px dashed var(--accent)' : undefined,
        }}
        contentEditable={isEditable}
        suppressContentEditableWarning
        onBlur={handleBlur}
        onKeyDown={isEditable ? handleKeyDown : undefined}
        spellCheck={false}
      >
        {text}
      </span>
    </div>
  );
});

/* ================================================================
   OverviewRuler (minimap scrollbar)
   ================================================================ */

export function OverviewRuler({ markers, scrollRef, onJump }: {
  markers: MarkerType[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onJump?: (scrollTop: number) => void;
}) {
  const rulerRef = useRef<HTMLDivElement>(null);
  const [viewportRatio, setViewportRatio] = useState({ top: 0, height: 1 });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) { setViewportRatio({ top: 0, height: 1 }); return; }
      setViewportRatio({ top: scrollTop / scrollHeight, height: clientHeight / scrollHeight });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [scrollRef, markers]);

  const handleClick = (e: React.MouseEvent) => {
    const ruler = rulerRef.current;
    const el = scrollRef.current;
    if (!ruler || !el) return;
    const rect = ruler.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const target = ratio * el.scrollHeight - el.clientHeight / 2;
    const clamped = Math.max(0, Math.min(target, el.scrollHeight - el.clientHeight));
    if (onJump) onJump(clamped);
    else el.scrollTop = clamped;
  };

  if (markers.length === 0) return null;

  const bands: { type: MarkerType; start: number; end: number }[] = [];
  for (let i = 0; i < markers.length; i++) {
    if (!markers[i]) continue;
    const type = markers[i];
    let end = i;
    while (end + 1 < markers.length && markers[end + 1] === type) end++;
    bands.push({ type, start: i, end });
    i = end;
  }

  const total = markers.length;

  return (
    <div ref={rulerRef} onClick={handleClick}
      className="shrink-0 relative"
      style={{ width: 14, background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border)', cursor: 'pointer' }}>
      {bands.map((b, i) => {
        const top = `${(b.start / total) * 100}%`;
        const heightPct = ((b.end - b.start + 1) / total) * 100;
        const color = b.type === 'removed' ? 'rgba(248,81,73,0.8)'
          : b.type === 'added' ? 'rgba(63,185,80,0.8)'
          : 'rgba(88,166,255,0.8)';
        return (
          <div key={i} className="absolute left-0.5 right-0.5" style={{ top, height: `max(2px, ${heightPct}%)`, background: color, borderRadius: 1 }} />
        );
      })}
      <div className="absolute left-0 right-0 pointer-events-none" style={{
        top: `${viewportRatio.top * 100}%`,
        height: `max(8px, ${viewportRatio.height * 100}%)`,
        background: 'rgba(255,255,255,0.08)',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
      }} />
    </div>
  );
}

/* ================================================================
   UnifiedDiff
   ================================================================ */

export function UnifiedDiff({ diff, currentHunk, hunks: _hunks, onHunkClick, revertedHunks }: {
  diff: string; currentHunk: number; hunks: HunkInfo[]; onHunkClick: (idx: number) => void; revertedHunks: Set<number>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lines = diff.split('\n');

  const lineHunkMap = useMemo(() => {
    const map = new Map<number, number>();
    let hunkIdx = -1;
    let inHunk = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('@@')) {
        hunkIdx++;
        inHunk = true;
        map.set(i, hunkIdx);
        continue;
      }
      if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
        inHunk = false;
        continue;
      }
      if (inHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
        map.set(i, hunkIdx);
      }
    }
    return map;
  }, [lines]);

  const markers = lines.map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return 'added' as const;
    if (line.startsWith('-') && !line.startsWith('---')) return 'removed' as const;
    return null;
  });

  useEffect(() => {
    const el = hunkRefs.current[currentHunk];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentHunk]);

  let hunkRefIdx = -1;

  return (
    <div className="flex-1 min-h-0 flex">
      <div ref={scrollRef} className="flex-1 min-w-0 overflow-auto" style={{ fontFamily: MONO }}>
        <div style={{ minWidth: 'fit-content' }}>
          {lines.map((line, i) => {
            const isFileSep = line.startsWith('diff --git');
            if (isFileSep) {
              const fileName = extractFileName(line);
              return <FileSeparator key={i} name={fileName} />;
            }

            const hunkIdx = lineHunkMap.get(i);
            const isCurrentHunk = hunkIdx === currentHunk;
            const isHunkHeader = line.startsWith('@@');
            const isReverted = hunkIdx !== undefined && revertedHunks.has(hunkIdx);

            if (isReverted && !isHunkHeader) {
              if (line.startsWith('+') && !line.startsWith('+++')) return null;
              if (line.startsWith('-') && !line.startsWith('---')) {
                const displayLine = ' ' + line.slice(1);
                const { color: ctxColor } = lineStyle(displayLine);
                return (
                  <div key={i} className="px-3 text-xs leading-5"
                    style={{ color: ctxColor, background: isCurrentHunk ? HUNK_HIGHLIGHT : 'transparent', whiteSpace: 'pre' }}>
                    {displayLine}
                  </div>
                );
              }
            }

            const { color, bg } = lineStyle(line);

            let refCallback: ((el: HTMLDivElement | null) => void) | undefined;
            if (isHunkHeader) {
              hunkRefIdx++;
              const idx = hunkRefIdx;
              refCallback = (el) => { hunkRefs.current[idx] = el; };
            }

            const highlightBg = isCurrentHunk ? HUNK_HIGHLIGHT : bg;

            return (
              <div
                key={i}
                ref={refCallback}
                className="px-3 text-xs leading-5"
                style={{ color, background: highlightBg, whiteSpace: 'pre', cursor: isHunkHeader ? 'pointer' : undefined }}
                onClick={isHunkHeader && hunkIdx !== undefined ? () => onHunkClick(hunkIdx) : undefined}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
      <OverviewRuler markers={markers} scrollRef={scrollRef} />
    </div>
  );
}

/* ================================================================
   SplitDiff with synced dual-panel scroll
   ================================================================ */

export function SplitDiff({ diff, currentHunk, hunks: _hunks, onHunkClick, isEditable, onLineEdit, editedLines, revertedHunks }: {
  diff: string; currentHunk: number; hunks: HunkInfo[]; onHunkClick: (idx: number) => void;
  isEditable: boolean; onLineEdit: (lineNum: number, text: string) => void; editedLines: Map<number, string>; revertedHunks: Set<number>;
}) {
  const rows = useMemo(() => parseSplitRows(diff), [diff]);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const hunkRefs = useRef<(HTMLDivElement | null)[]>([]);

  const markers = rows.map(r => {
    if (r.leftType === 'removed' || r.rightType === 'added') {
      if (r.leftType === 'removed' && r.rightType === 'added') return 'modified' as const;
      if (r.leftType === 'removed') return 'removed' as const;
      return 'added' as const;
    }
    return null;
  });

  function syncScroll(source: 'left' | 'right') {
    if (syncing.current) return;
    syncing.current = true;
    const from = source === 'left' ? leftRef.current : rightRef.current;
    const to = source === 'left' ? rightRef.current : leftRef.current;
    if (from && to) {
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
    }
    requestAnimationFrame(() => { syncing.current = false; });
  }

  const handleRulerScroll = (scrollTop: number) => {
    if (leftRef.current) leftRef.current.scrollTop = scrollTop;
    if (rightRef.current) rightRef.current.scrollTop = scrollTop;
  };

  useEffect(() => {
    const el = hunkRefs.current[currentHunk];
    if (el && leftRef.current) {
      const containerRect = leftRef.current.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const scrollTarget = leftRef.current.scrollTop + (elRect.top - containerRect.top) - containerRect.height / 3;
      leftRef.current.scrollTop = Math.max(0, scrollTarget);
      if (rightRef.current) rightRef.current.scrollTop = leftRef.current.scrollTop;
    }
  }, [currentHunk]);

  let hunkRefIdx = -1;

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Left panel (original) */}
      <div ref={leftRef} onScroll={() => syncScroll('left')}
        className="flex-1 min-w-0 overflow-auto"
        style={{ fontFamily: MONO, borderRight: '1px solid var(--border)' }}>
        <div style={{ minWidth: 'fit-content' }}>
          {rows.map((r, i) => {
            const isReverted = r.hunkIndex !== null && revertedHunks.has(r.hunkIndex);
            const isHunkHeader = r.leftType === 'header' && r.leftText.startsWith('@@');
            let refCb: ((el: HTMLDivElement | null) => void) | undefined;
            if (isHunkHeader) {
              hunkRefIdx++;
              const idx = hunkRefIdx;
              refCb = (el) => { hunkRefs.current[idx] = el; };
            }

            if (isReverted && !isHunkHeader && r.leftType !== 'separator') {
              if (r.leftNum === null && r.rightType === 'added') return null;
              return (
                <SplitHalf
                  key={i} ref={refCb}
                  num={r.leftNum} text={r.leftText}
                  type={r.leftType === 'removed' ? 'normal' : r.leftType}
                  side="left"
                  isCurrentHunk={r.hunkIndex === currentHunk}
                  isEditable={false}
                  onClick={undefined}
                />
              );
            }

            return (
              <SplitHalf
                key={i}
                ref={refCb}
                num={r.leftNum}
                text={r.leftText}
                type={r.leftType}
                side="left"
                isCurrentHunk={r.hunkIndex === currentHunk}
                isEditable={false}
                onClick={isHunkHeader && r.hunkIndex !== null ? () => onHunkClick(r.hunkIndex!) : undefined}
              />
            );
          })}
        </div>
      </div>
      {/* Right panel (modified) */}
      <div ref={rightRef} onScroll={() => syncScroll('right')}
        className="flex-1 min-w-0 overflow-auto"
        style={{ fontFamily: MONO }}>
        <div style={{ minWidth: 'fit-content' }}>
          {(() => { hunkRefIdx = -1; return null; })()}
          {rows.map((r, i) => {
            const isReverted = r.hunkIndex !== null && revertedHunks.has(r.hunkIndex);
            const isHunkHeader = r.rightType === 'header';

            if (isReverted && !isHunkHeader && r.rightType !== 'separator') {
              if (r.leftNum === null && r.rightType === 'added') return null;
              return (
                <SplitHalf
                  key={i}
                  num={r.leftNum} text={r.leftText}
                  type="normal"
                  side="right"
                  isCurrentHunk={r.hunkIndex === currentHunk}
                  isEditable={false}
                  onClick={undefined}
                />
              );
            }

            const edited = r.rightNum !== null ? editedLines.get(r.rightNum) : undefined;
            return (
              <SplitHalf
                key={i}
                num={r.rightNum}
                text={edited !== undefined ? edited : r.rightText}
                type={r.rightType}
                side="right"
                isCurrentHunk={r.hunkIndex === currentHunk}
                isEditable={isEditable && r.rightType !== 'header' && r.rightType !== 'separator' && r.rightNum !== null}
                isEdited={edited !== undefined}
                onEdit={r.rightNum !== null ? (text) => onLineEdit(r.rightNum!, text) : undefined}
                onClick={r.rightType === 'header' && r.rightText === '' && r.hunkIndex !== null ? () => onHunkClick(r.hunkIndex!) : undefined}
              />
            );
          })}
        </div>
      </div>
      <OverviewRuler markers={markers} scrollRef={rightRef} onJump={handleRulerScroll} />
    </div>
  );
}
