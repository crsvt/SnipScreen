/**
 * Draws the cropping guides overlay on the main canvas.
 * Assumes the base image (from offscreenCanvas) is already drawn via redrawCanvas.
 */
export function drawCropGuides(x, y, width, height) {
  if (!this.ctx || !this.canvas) return;
  // Clamp coordinates
  const canvasWidth = this.canvas.width;
  const canvasHeight = this.canvas.height;
  x = Math.max(0, Math.min(x, canvasWidth));
  y = Math.max(0, Math.min(y, canvasHeight));
  width = Math.max(0, Math.min(width, canvasWidth - x));
  height = Math.max(0, Math.min(height, canvasHeight - y));

  // --- Redraw underlying canvas state FIRST ---
  this.redrawCanvas(); // Includes base image, annotations, text, arrows

  // --- Now draw crop overlay and guides on top ---
  this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; // Overlay color
  // Draw overlay rectangles outside the crop area
  this.ctx.fillRect(0, 0, canvasWidth, y); // Top
  this.ctx.fillRect(0, y + height, canvasWidth, canvasHeight - (y + height)); // Bottom
  this.ctx.fillRect(0, y, x, height); // Left
  this.ctx.fillRect(x + width, y, canvasWidth - (x + width), height); // Right

  // Draw dashed border for the crop area
  this.ctx.setLineDash([4, 4]);
  this.ctx.strokeStyle = '#FFFFFF';
  this.ctx.lineWidth = 1;
  this.ctx.strokeRect(x, y, width, height);

  // Draw solid outer border for emphasis
  this.ctx.setLineDash([]);
  this.ctx.strokeStyle = '#007AFF';
  this.ctx.lineWidth = 2;
  this.ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);

  // Draw corner handles if area is large enough
  if (width > 10 && height > 10) {
    this.drawCornerHandles(x, y, width, height);
  }
  this.ctx.setLineDash([]); // Reset just in case
}

/**
 * Draws the interactive square corner handles for the crop selection box.
 */
export function drawCornerHandles(x, y, width, height) {
  if (!this.ctx) return;
  const handleSize = 8;
  const handleOffset = handleSize / 2;
  const corners = [ [x, y], [x + width, y], [x, y + height], [x + width, y + height] ];
  this.ctx.fillStyle = '#007AFF';
  this.ctx.strokeStyle = '#FFFFFF'; // White border for contrast
  this.ctx.lineWidth = 1;
  corners.forEach(([cx, cy]) => {
    this.ctx.fillRect(cx - handleOffset, cy - handleOffset, handleSize, handleSize);
    this.ctx.strokeRect(cx - handleOffset, cy - handleOffset, handleSize, handleSize);
  });
}

/**
 * Renders a single annotation element (rect, arrow, or text) onto a context.
 * Arrows and text get a white casing/outline so red stays visible on any background.
 */
export function renderElement(ctx, element) {
  if (!element) return;
  if (element.type === 'rect') {
    ctx.fillStyle = element.color || '#000000';
    ctx.fillRect(element.x, element.y, element.width, element.height);
  } else if (element.type === 'arrow') {
    strokeArrowShape(ctx, element, '#FFFFFF', (element.width || 5) + 2); // slim white casing
    strokeArrowShape(ctx, element, element.color || '#FF3B30', element.width || 5);
  } else if (element.type === 'text') {
    ctx.font = textFont(element);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.5, element.fontSize / 12); // slim white outline
    ctx.strokeText(element.text, element.x, element.y);
    ctx.fillStyle = element.color || '#FF3B30';
    ctx.fillText(element.text, element.x, element.y);
  }
}

function textFont(element) {
  return `bold ${element.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
}

function strokeArrowShape(ctx, el, color, width) {
  const headLen = Math.max(12, width * 3);
  const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Shaft, stopped short of the tip so it doesn't poke past the head
  const shaftX = el.x2 - Math.cos(angle) * headLen * 0.6;
  const shaftY = el.y2 - Math.sin(angle) * headLen * 0.6;
  ctx.beginPath();
  ctx.moveTo(el.x1, el.y1);
  ctx.lineTo(shaftX, shaftY);
  ctx.stroke();
  // Head
  ctx.beginPath();
  ctx.moveTo(el.x2, el.y2);
  ctx.lineTo(el.x2 - headLen * Math.cos(angle - Math.PI / 7), el.y2 - headLen * Math.sin(angle - Math.PI / 7));
  ctx.lineTo(el.x2 - headLen * Math.cos(angle + Math.PI / 7), el.y2 - headLen * Math.sin(angle + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Default arrow stroke width, scaled to the canvas resolution. */
export function defaultArrowWidth() {
  return Math.max(4, Math.round(this.canvas.width * 0.004));
}

/** Default text size, scaled to the canvas resolution. */
export function defaultFontSize() {
  return Math.max(20, Math.round(this.canvas.width * 0.028));
}

/**
 * Returns the bounding box {x, y, width, height} of an element in canvas coordinates.
 */
export function getElementBounds(element) {
  if (element.type === 'rect') {
    return { x: element.x, y: element.y, width: element.width, height: element.height };
  }
  if (element.type === 'arrow') {
    const x = Math.min(element.x1, element.x2);
    const y = Math.min(element.y1, element.y2);
    return { x, y, width: Math.abs(element.x2 - element.x1), height: Math.abs(element.y2 - element.y1) };
  }
  if (element.type === 'text') {
    this.ctx.font = textFont(element);
    const width = this.ctx.measureText(element.text).width;
    return { x: element.x, y: element.y, width, height: element.fontSize * 1.2 };
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

/**
 * Hit tolerance in canvas (bitmap) pixels, compensating for display scaling.
 */
export function getHitTolerance() {
  const rectWidth = this.ui.canvasRect && this.ui.canvasRect.width > 0 ? this.ui.canvasRect.width : this.canvas.width;
  return 10 * (this.canvas.width / rectWidth);
}

/**
 * Finds the topmost element under a canvas-space point.
 * @returns {{element, part} | null} part is 'body', an arrow endpoint ('p1'/'p2'),
 *          or 'resize' (text corner handle). Handles are only reported for the
 *          currently selected element.
 */
export function hitTestElement(pos) {
  const tol = this.getHitTolerance();
  const selected = this.state.selected;
  const elements = this.elements.annotationElements;

  // Handles of the selected element take priority
  if (selected) {
    if (selected.type === 'arrow') {
      if (Math.hypot(pos.x - selected.x1, pos.y - selected.y1) <= tol * 1.5) return { element: selected, part: 'p1' };
      if (Math.hypot(pos.x - selected.x2, pos.y - selected.y2) <= tol * 1.5) return { element: selected, part: 'p2' };
    } else if (selected.type === 'text') {
      const b = this.getElementBounds(selected);
      if (Math.hypot(pos.x - (b.x + b.width), pos.y - (b.y + b.height)) <= tol * 1.5) return { element: selected, part: 'resize' };
    }
  }

  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!el) continue;
    if (el.type === 'rect') continue; // Blackout boxes are permanent, not adjustable
    if (el.type === 'arrow') {
      if (distToSegment(pos, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= tol) return { element: el, part: 'body' };
    } else {
      const b = this.getElementBounds(el);
      if (pos.x >= b.x - tol && pos.x <= b.x + b.width + tol && pos.y >= b.y - tol && pos.y <= b.y + b.height + tol) {
        return { element: el, part: 'body' };
      }
    }
  }
  return null;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Draws selection handles for the given element on the visible canvas only
 * (never part of the exported image).
 */
export function drawSelectionOverlay(ctx, element) {
  const tol = this.getHitTolerance();
  const handle = Math.max(6, tol * 0.9);
  ctx.save();
  if (element.type === 'arrow') {
    drawHandle(ctx, element.x1, element.y1, handle);
    drawHandle(ctx, element.x2, element.y2, handle);
  } else {
    const b = this.getElementBounds(element);
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#007AFF';
    ctx.lineWidth = Math.max(1, tol * 0.15);
    ctx.strokeRect(b.x - 4, b.y - 4, b.width + 8, b.height + 8);
    ctx.setLineDash([]);
    if (element.type === 'text') {
      drawHandle(ctx, b.x + b.width, b.y + b.height, handle);
    }
  }
  ctx.restore();
}

function drawHandle(ctx, x, y, size) {
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, size * 0.3);
  ctx.strokeStyle = '#007AFF';
  ctx.stroke();
}

/**
 * Creates a new canvas containing the final composed image (base + elements).
 * Used for saving or copying.
 * @returns {HTMLCanvasElement} A new canvas element with the final image data.
 */
export function prepareFinalCanvas() {
  const finalCanvas = document.createElement('canvas');
  const finalCtx = finalCanvas.getContext('2d', {
    alpha: true, // Keep alpha for PNG transparency
    willReadFrequently: false // Not reading back from this final canvas
  });

  if (!this.offscreenCanvas || this.offscreenCanvas.width === 0 || this.offscreenCanvas.height === 0) {
    console.error("Cannot prepare final canvas: Offscreen canvas is invalid.");
    finalCanvas.width = 1; 
    finalCanvas.height = 1; 
    return finalCanvas;
  }

  // Use the original image dimensions for maximum quality
  const sourceWidth = this.offscreenCanvas.width;
  const sourceHeight = this.offscreenCanvas.height;
  finalCanvas.width = sourceWidth;
  finalCanvas.height = sourceHeight;

  // Enable high-quality rendering for the final canvas
  finalCtx.imageSmoothingEnabled = true;
  finalCtx.imageSmoothingQuality = 'high';

  // Clear the canvas with a white background for better compatibility
  finalCtx.fillStyle = '#FFFFFF';
  finalCtx.fillRect(0, 0, sourceWidth, sourceHeight);

  // 1. Draw the base image with high quality
  finalCtx.drawImage(this.offscreenCanvas, 0, 0);

  // 2. Draw annotation elements (blackout rects, arrows, text)
  if (this.elements.annotationElements && this.elements.annotationElements.length > 0) {
    this.elements.annotationElements.forEach(element => {
      this.renderElement(finalCtx, element);
    });
  }

  console.log(`Prepared final canvas at ${sourceWidth}x${sourceHeight} resolution.`);
  return finalCanvas;
}