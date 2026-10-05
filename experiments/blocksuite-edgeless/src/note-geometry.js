export const NOTE_MIN_WIDTH = 120;
export const NOTE_MIN_HEIGHT = 48;

// Every move uses the original bounds, including after dragging past an edge.
export function resizeNote([x, y, width, height], direction, dx, dy, scale = 1) {
  const right = x + width;
  const bottom = y + height;
  const minWidth = NOTE_MIN_WIDTH * scale;
  const minHeight = NOTE_MIN_HEIGHT * scale;
  if (direction.includes('left')) {
    x = Math.min(x + dx, right - minWidth);
    width = right - x;
  } else if (direction.includes('right')) {
    width = Math.max(minWidth, width + dx);
  }
  if (direction.includes('top')) {
    y = Math.min(y + dy, bottom - minHeight);
    height = bottom - y;
  } else if (direction.includes('bottom')) {
    height = Math.max(minHeight, height + dy);
  }
  return [x, y, width, height];
}
