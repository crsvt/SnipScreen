// Import the throttle utility
import { throttle } from './editor-utils.js';

/**
 * Sets up the primary event listeners for the canvas.
 */
export function setupEventListeners() {
  if (!this.canvas) {
    console.error("Canvas element not found for setting up event listeners.");
    return;
  }
  // Bind handlers to ensure 'this' context
  this.boundHandleMouseDown = this.handleMouseDown.bind(this);
  this.boundHandleMouseMove = this.handleMouseMove.bind(this);
  this.boundHandleMouseUp = this.handleMouseUp.bind(this);
  this.boundHandleMouseLeave = this.handleMouseLeave.bind(this);
  this.boundHandleKeyDown = this.handleKeyDown.bind(this);
  this.boundHandleDocumentMouseDown = this.handleDocumentMouseDown.bind(this);

  // Canvas Listeners
  this.canvas.addEventListener('mousedown', this.boundHandleMouseDown);
  this.canvas.addEventListener('mousemove', this.boundHandleMouseMove);
  this.canvas.addEventListener('mouseup', this.boundHandleMouseUp);
  this.canvas.addEventListener('mouseleave', this.boundHandleMouseLeave);
  document.addEventListener('keydown', this.boundHandleKeyDown);
  document.addEventListener('mousedown', this.boundHandleDocumentMouseDown);
}

/**
 * Removes event listeners added by setupEventListeners.
 */
export function removeEditorEventListeners() {
  console.log("Removing editor event listeners.");
  if (this.canvas) {
    this.canvas.removeEventListener('mousedown', this.boundHandleMouseDown);
    this.canvas.removeEventListener('mousemove', this.boundHandleMouseMove);
    this.canvas.removeEventListener('mouseup', this.boundHandleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundHandleMouseLeave);
  }
  if (this.boundHandleKeyDown) {
    document.removeEventListener('keydown', this.boundHandleKeyDown);
  }
  if (this.boundHandleDocumentMouseDown) {
    document.removeEventListener('mousedown', this.boundHandleDocumentMouseDown);
  }
}

/**
 * Clears the selection when clicking anywhere outside the canvas
 * (page background, toolbar, etc.). The inline text input is exempt.
 */
export function handleDocumentMouseDown(e) {
  if (!this.canvas || e.target === this.canvas) return;
  if (e.target.closest && e.target.closest('.canvas-text-input')) return;
  if (this.state.selected || this.state.dragging) {
    this.state.selected = null;
    this.state.dragging = null;
    this.redrawCanvas();
  }
}

/**
 * Handles keyboard shortcuts: Delete/Backspace removes the selected element,
 * Escape deselects. Ignored while the inline text input is open.
 */
export function handleKeyDown(e) {
  if (this.activeTextInput) return; // The input's own handlers manage keys
  if (!this.state.selected) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    const index = this.elements.annotationElements.indexOf(this.state.selected);
    if (index !== -1) this.elements.annotationElements.splice(index, 1);
    this.state.selected = null;
    this.redrawCanvas();
    this.showToast('Element deleted', false, 'info');
  } else if (e.key === 'Escape') {
    this.state.selected = null;
    this.redrawCanvas();
  }
}

/**
 * Calculates the mouse position relative to the canvas, considering scaling.
 */
export function getMousePos(e) {
  if (!this.ui.canvasRect) {
    this.updateCanvasRect();
    if (!this.ui.canvasRect) {
      console.error("Canvas rectangle information unavailable.");
      return { x: 0, y: 0};
    }
  }
  const rect = this.ui.canvasRect;
  const scaleX = rect.width === 0 ? 1 : this.canvas.width / rect.width;
  const scaleY = rect.height === 0 ? 1 : this.canvas.height / rect.height;
  const canvasX = (e.clientX - rect.left) * scaleX;
  const canvasY = (e.clientY - rect.top) * scaleY;
  const clampedX = Math.max(0, Math.min(canvasX, this.canvas.width));
  const clampedY = Math.max(0, Math.min(canvasY, this.canvas.height));
  return { x: clampedX, y: clampedY };
}

/**
 * Handles the mouse down event on the canvas.
 */
export function handleMouseDown(e) {
  e.preventDefault();
  if (e.button !== 0) return; // Only left clicks

  const pos = this.getMousePos(e);

  // Reset interaction states
  this.state.isDrawing = false;

  // An open text input commits on any canvas click
  if (this.activeTextInput) {
    this.commitTextInput();
    return;
  }

  // Crop and blackout take full priority while active
  if (this.isToolActive('crop')) {
    this.state.isDrawing = true;
    this.drawingState.cropStart = pos;
    this.drawingState.cropEnd = pos;
    if (this.canvas) {
      this.canvas.style.cursor = 'crosshair';
    }
    return;
  }

  if (this.isToolActive('annotate')) {
    this.state.isDrawing = true;
    this.drawingState.annotateStart = pos;
    this.saveCanvasState();
    return;
  }

  // Clicking directly on an existing arrow or text selects it — whether a
  // drawing tool is active or not. Drawing only starts on empty space.
  const hit = this.hitTestElement(pos);
  if (hit) {
    this.state.selected = hit.element;
    this.state.dragging = {
      part: hit.part,
      startPos: pos,
      original: { ...hit.element }
    };
    this.redrawCanvas();
    return;
  }

  // Empty space: clear any selection, then let the active tool draw
  if (this.state.selected) {
    this.state.selected = null;
    this.redrawCanvas();
  }

  if (this.isToolActive('arrow')) {
    this.state.isDrawing = true;
    this.drawingState.arrowStart = pos;
    return;
  }

  if (this.isToolActive('text')) {
    this.openTextInput(pos);
  }
}

/**
 * Handles the mouse move event on the canvas.
 */
export function handleMouseMove(e) {
  const pos = this.getMousePos(e);

  // Move / resize a selected element
  if (this.state.dragging) {
    const drag = this.state.dragging;
    const el = this.state.selected;
    const dx = pos.x - drag.startPos.x;
    const dy = pos.y - drag.startPos.y;
    if (drag.part === 'p1') {
      el.x1 = pos.x; el.y1 = pos.y;
    } else if (drag.part === 'p2') {
      el.x2 = pos.x; el.y2 = pos.y;
    } else if (drag.part === 'resize') {
      el.fontSize = Math.max(10, Math.round((pos.y - el.y) / 1.2));
    } else { // move
      if (el.type === 'arrow') {
        el.x1 = drag.original.x1 + dx; el.y1 = drag.original.y1 + dy;
        el.x2 = drag.original.x2 + dx; el.y2 = drag.original.y2 + dy;
      } else {
        el.x = drag.original.x + dx;
        el.y = drag.original.y + dy;
      }
    }
    requestAnimationFrame(() => { if (this.state.dragging) this.redrawCanvas(); });
    return;
  }

  // Update cursor based on active tools / hovered elements
  if (!this.state.isDrawing) {
    let cursor = 'default';
    if (this.isToolActive('crop') || this.isToolActive('annotate') || this.isToolActive('arrow')) {
      cursor = 'crosshair';
    } else if (this.isToolActive('text')) {
      cursor = 'text';
    }
    // Hovering an existing arrow/text shows move/resize affordances
    // (except while crop or blackout is active — those own the canvas)
    if (!this.isToolActive('crop') && !this.isToolActive('annotate')) {
      const hit = this.hitTestElement(pos);
      if (hit) {
        cursor = hit.part === 'body' ? 'move' : (hit.part === 'resize' ? 'nwse-resize' : 'pointer');
      }
    }
    if (this.canvas) this.canvas.style.cursor = cursor;
  }

  // Handle tool drawing previews
  if (!this.state.isDrawing) return;

  // 1. Crop Preview
  if (this.isToolActive('crop') && this.drawingState.cropStart) {
    this.drawingState.cropEnd = pos;
    this.throttledDrawCropGuides(this.drawingState.cropStart, this.drawingState.cropEnd);
  }
  // 2. Arrow Preview
  else if (this.isToolActive('arrow') && this.drawingState.arrowStart) {
    requestAnimationFrame(() => {
      if (!this.state.isDrawing || !this.drawingState.arrowStart) return;
      this.redrawCanvas();
      this.renderElement(this.ctx, {
        type: 'arrow',
        x1: this.drawingState.arrowStart.x, y1: this.drawingState.arrowStart.y,
        x2: pos.x, y2: pos.y,
        color: '#FF3B30', width: this.defaultArrowWidth()
      });
    });
  }
  // 3. Annotate Preview
  else if (this.isToolActive('annotate') && this.drawingState.annotateStart) {
    requestAnimationFrame(() => {
      if (!this.state.isDrawing || !this.isToolActive('annotate') || !this.drawingState.annotateStart) return;
      this.restoreCanvasState();
      const startX = Math.min(this.drawingState.annotateStart.x, pos.x);
      const startY = Math.min(this.drawingState.annotateStart.y, pos.y);
      const width = Math.abs(pos.x - this.drawingState.annotateStart.x);
      const height = Math.abs(pos.y - this.drawingState.annotateStart.y);
      if (width > 0 && height > 0) {
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(startX, startY, width, height);
      }
    });
  }
}

/**
 * Handles the mouse up event on the canvas.
 */
export function handleMouseUp(e) {
  if (e.button !== 0) return;

  // Finish moving/resizing a selection
  if (this.state.dragging) {
    this.state.dragging = null;
    this.redrawCanvas();
    return;
  }

  const wasDrawingTool = this.state.isDrawing;

  // Finalize tool drawing
  if (wasDrawingTool) {
    const pos = this.getMousePos(e);
    this.state.isDrawing = false;

    let activeToolName = null;
    if (this.isToolActive('crop') && this.drawingState.cropStart) activeToolName = 'crop';
    else if (this.isToolActive('annotate') && this.drawingState.annotateStart) activeToolName = 'annotate';
    else if (this.isToolActive('arrow') && this.drawingState.arrowStart) activeToolName = 'arrow';

    // Finalize based on the active tool
    if (activeToolName === 'crop') {
      this.drawingState.cropEnd = pos;
      this.completeCrop();
    } else if (activeToolName === 'arrow') {
      const start = this.drawingState.arrowStart;
      if (Math.hypot(pos.x - start.x, pos.y - start.y) > 10) {
        const newArrow = {
          type: 'arrow',
          id: `arrow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          x1: start.x, y1: start.y, x2: pos.x, y2: pos.y,
          color: '#FF3B30', width: this.defaultArrowWidth()
        };
        this.elements.annotationElements.push(newArrow);
        this.showToast('Arrow added', false, 'success');
      }
      this.drawingState.arrowStart = null;
      this.redrawCanvas();
    } else if (activeToolName === 'annotate') {
      const startX = Math.min(this.drawingState.annotateStart.x, pos.x);
      const startY = Math.min(this.drawingState.annotateStart.y, pos.y);
      const width = Math.abs(pos.x - this.drawingState.annotateStart.x);
      const height = Math.abs(pos.y - this.drawingState.annotateStart.y);
      if (width > 1 && height > 1) {
        const newAnnotation = {
          type: 'rect',
          id: `anno-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          x: startX, y: startY, width: width, height: height, color: '#000000' 
        };
        this.elements.annotationElements.push(newAnnotation);
        this.redrawCanvas();
        this.showToast("Annotation added", false, 'success');
      } else {
        this.restoreCanvasState();
      }
      this.drawingState.annotateStart = null;
      if (this.isToolActive('annotate') && this.canvas) this.canvas.style.cursor = 'crosshair';
    }

    // General cleanup & cursor reset
    if (!this.state.activeTools.size && this.canvas) {
      this.canvas.style.cursor = 'default';
    }
  }
}

/**
 * Handles the mouse leave event on the canvas.
 */
export function handleMouseLeave(e) {
  // Stop a selection drag where it is (element keeps its new position)
  if (this.state.dragging) {
    this.state.dragging = null;
    this.redrawCanvas();
    return;
  }

  // Cancel tool drawing
  if (this.state.isDrawing) {
    console.log("Mouse left canvas during drawing, cancelling operation.");
    const toolWasCrop = this.isToolActive('crop');
    const toolWasAnnotate = this.isToolActive('annotate');
    const toolWasArrow = this.isToolActive('arrow');
    this.state.isDrawing = false;

    let cursor = 'default';

    if (toolWasCrop) {
      this.resetCropState();
      this.showToast("Crop cancelled (mouse left canvas).", false, 'info');
      if (this.isToolActive('crop')) cursor = 'crosshair';
    }
    if (toolWasAnnotate) {
      this.restoreCanvasState();
      this.drawingState.annotateStart = null;
      this.showToast("Annotation cancelled (mouse left canvas).", false, 'info');
      if (this.isToolActive('annotate')) cursor = 'crosshair';
    }
    if (toolWasArrow) {
      this.drawingState.arrowStart = null;
      this.redrawCanvas();
      this.showToast("Arrow cancelled (mouse left canvas).", false, 'info');
      if (this.isToolActive('arrow')) cursor = 'crosshair';
    }

    if (this.canvas) {
      this.canvas.style.cursor = cursor;
    }
  }
}

// Throttled draw crop guides
export const throttledDrawCropGuides = throttle(function(startPos, endPos) {
  if (!this.state.isDrawing || !this.drawingState.cropStart || !this.isToolActive('crop')) return;
  if (!startPos || typeof startPos.x !== 'number' ) { return; }
  try {
    const startX = Math.min(startPos.x, endPos.x);
    const startY = Math.min(startPos.y, endPos.y);
    const width = Math.abs(endPos.x - startPos.x);
    const height = Math.abs(endPos.y - startPos.y);
    this.drawCropGuides(startX, startY, width, height);
  } catch (error) { 
    console.error("Error in throttledDrawCropGuides:", error); 
  }
}, 16);