/** Choose one adjacent page without making short flicks cross half the screen. */
export function getTafsirSnapIndex(
  startOffset: number,
  releaseOffset: number,
  velocity: number,
  pageWidth: number,
  pageCount: number
): number {
  'worklet';
  const distance = releaseOffset - startOffset;
  const direction = Math.abs(velocity) > 0.15
    ? Math.sign(velocity)
    : Math.abs(distance) > Math.min(48, pageWidth * 0.12)
      ? Math.sign(distance)
      : 0;
  const startIndex = Math.round(startOffset / pageWidth);
  return Math.max(0, Math.min(pageCount - 1, startIndex + direction));
}
