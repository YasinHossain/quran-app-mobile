export type AyahWordLayout = {
  readonly position: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type CollapsedAyahWindow = {
  readonly lineCount: number;
  readonly startY: number;
  readonly height: number;
};

type AyahLine = {
  top: number;
  bottom: number;
  positions: number[];
};

const LINE_Y_TOLERANCE = 4;

function groupLayoutsIntoLines(layouts: readonly AyahWordLayout[]): readonly AyahLine[] {
  const sorted = [...layouts].sort((left, right) => left.y - right.y || right.x - left.x);
  const lines: AyahLine[] = [];

  for (const layout of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.top - layout.y) <= LINE_Y_TOLERANCE);
    if (line) {
      line.top = Math.min(line.top, layout.y);
      line.bottom = Math.max(line.bottom, layout.y + layout.height);
      line.positions.push(layout.position);
    } else {
      lines.push({
        top: layout.y,
        bottom: layout.y + layout.height,
        positions: [layout.position],
      });
    }
  }

  return lines.sort((left, right) => left.top - right.top);
}

export function getCollapsedAyahWindow(
  layouts: readonly AyahWordLayout[],
  selectedPosition: number,
  collapsedLineCount = 3
): CollapsedAyahWindow | null {
  if (collapsedLineCount < 1 || layouts.length === 0) return null;
  const lines = groupLayoutsIntoLines(layouts);
  if (lines.length <= collapsedLineCount) return null;

  const selectedLineIndex = lines.findIndex((line) => line.positions.includes(selectedPosition));
  if (selectedLineIndex < 0) return null;

  const centeredStart = selectedLineIndex - Math.floor(collapsedLineCount / 2);
  const startIndex = Math.max(0, Math.min(centeredStart, lines.length - collapsedLineCount));
  const visibleLines = lines.slice(startIndex, startIndex + collapsedLineCount);
  const startY = visibleLines[0]?.top ?? 0;
  const endY = visibleLines.at(-1)?.bottom ?? startY;

  return {
    lineCount: lines.length,
    startY,
    height: Math.max(0, endY - startY),
  };
}

