/**
 * Shows or hides the loading spinner element with smooth animations.
 * @param {boolean} show - True to show the spinner, false to hide it.
 */
export function showSpinner(show) {
  const spinner = document.getElementById('spinner');
  if (spinner) {
    if (show) {
      spinner.style.display = 'flex';
      // Add a small delay for smooth appearance
      requestAnimationFrame(() => {
        spinner.style.opacity = '1';
        spinner.style.transform = 'scale(1)';
      });
    } else {
      spinner.style.opacity = '0';
      spinner.style.transform = 'scale(0.8)';
      setTimeout(() => {
        spinner.style.display = 'none';
      }, 150);
    }
  }
}

/**
 * Displays a toast notification message with enhanced animations and styling.
 * @param {string} message - The message to display.
 * @param {boolean} [persist=false] - If true, the toast remains until manually hidden or another toast replaces it.
 * @param {'info' | 'success' | 'error'} [type='info'] - The type of toast, affecting its appearance and duration.
 * @returns {HTMLElement} The toast DOM element.
 */
export function showToast(message, persist = false, type = 'info') {
  // Ensure toastElement is created if it doesn't exist on 'this'
  if (!this.ui.toastElement || !document.body.contains(this.ui.toastElement)) {
    this.ui.toastElement = document.createElement('div');
    this.ui.toastElement.className = 'toast';
    document.body.appendChild(this.ui.toastElement);
  }

  // Clear any existing timeout
  if (this.ui.toastTimeout) {
    clearTimeout(this.ui.toastTimeout);
    this.ui.toastTimeout = null;
  }

  // Set message and styling based on type
  this.ui.toastElement.textContent = message;
  
  // Enhanced styling based on type
  switch (type) {
    case 'error':
      this.ui.toastElement.style.background = 'rgba(255, 59, 48, 0.95)';
      this.ui.toastElement.style.borderColor = 'rgba(255, 59, 48, 0.3)';
      break;
    case 'success':
      this.ui.toastElement.style.background = 'rgba(52, 199, 89, 0.95)';
      this.ui.toastElement.style.borderColor = 'rgba(52, 199, 89, 0.3)';
      break;
    default:
      this.ui.toastElement.style.background = 'rgba(28, 28, 30, 0.95)';
      this.ui.toastElement.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  }

  // Use requestAnimationFrame to ensure the class addition triggers transition
  requestAnimationFrame(() => {
    this.ui.toastElement.classList.add('show');
    // Clear previous persistent state if any
    delete this.ui.toastElement.dataset.persistent;
    
    if (!persist) {
      const duration = type === 'error' ? 5000 : type === 'success' ? 3000 : 2500;
      this.ui.toastTimeout = setTimeout(() => {
        this.ui.toastElement.classList.remove('show');
        setTimeout(() => {
          if (this.ui.toastElement && !this.ui.toastElement.classList.contains('show')) {
            this.ui.toastElement.remove();
          }
        }, 250);
      }, duration);
    } else {
      this.ui.toastElement.dataset.persistent = 'true';
    }
  });

  return this.ui.toastElement;
}

/**
 * Opens an inline text input over the canvas at the given canvas position.
 * Committed via Enter, blur, or clicking elsewhere; cancelled via Escape.
 * @param {{x: number, y: number}} pos - Position in canvas (bitmap) coordinates.
 */
export function openTextInput(pos) {
  if (this.activeTextInput) this.commitTextInput();

  this.updateCanvasRect();
  const rect = this.ui.canvasRect;
  const scale = rect && rect.width > 0 ? rect.width / this.canvas.width : 1;
  const fontSize = this.defaultFontSize();

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'canvas-text-input';
  input.setAttribute('aria-label', 'Annotation text');
  input.placeholder = 'Type text…';
  input.style.left = `${rect.left + pos.x * scale}px`;
  input.style.top = `${rect.top + pos.y * scale}px`;
  input.style.fontSize = `${Math.max(12, fontSize * scale)}px`;
  document.body.appendChild(input);

  this.activeTextInput = { input, pos, fontSize };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') this.commitTextInput();
    else if (e.key === 'Escape') this.cancelTextInput();
  });
  input.addEventListener('blur', () => {
    // Let a same-tick commit/cancel win over the blur
    setTimeout(() => { if (this.activeTextInput && this.activeTextInput.input === input) this.commitTextInput(); }, 0);
  });
  // Focus immediately; the canvas mousedown is default-prevented so nothing
  // steals it back. The rAF is a fallback for browsers that ignore the
  // synchronous focus during event dispatch.
  input.focus({ preventScroll: true });
  requestAnimationFrame(() => {
    if (document.activeElement !== input) input.focus({ preventScroll: true });
  });
}

/**
 * Commits the open text input as a text element (if non-empty) and removes it.
 */
export function commitTextInput() {
  if (!this.activeTextInput) return;
  const { input, pos, fontSize } = this.activeTextInput;
  const text = input.value.trim();
  this.activeTextInput = null;
  input.remove();

  if (text) {
    const newText = {
      type: 'text',
      id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      x: pos.x, y: pos.y,
      text,
      fontSize,
      color: '#FF3B30'
    };
    this.elements.annotationElements.push(newText);
    this.showToast('Text added', false, 'success');
  }
  this.redrawCanvas();
}

/**
 * Discards the open text input without adding an element.
 */
export function cancelTextInput() {
  if (!this.activeTextInput) return;
  const { input } = this.activeTextInput;
  this.activeTextInput = null;
  input.remove();
  this.redrawCanvas();
}

/**
 * Adds smooth tool activation/deactivation animations.
 * @param {string} toolId - The ID of the tool to animate.
 * @param {boolean} isActive - Whether the tool is being activated or deactivated.
 */
export function animateToolActivation(toolId, isActive) {
  const toolElement = document.getElementById(toolId);
  if (!toolElement) return;

  if (isActive) {
    // Activation animation
    toolElement.style.transform = 'scale(1.1) translateY(-2px)';
    setTimeout(() => {
      toolElement.style.transform = 'scale(1.05) translateY(-1px)';
    }, 150);
  } else {
    // Deactivation animation
    toolElement.style.transform = 'scale(0.95) translateY(0px)';
    setTimeout(() => {
      toolElement.style.transform = '';
    }, 150);
  }
}

/**
 * Adds a subtle pulse animation to indicate successful actions.
 * @param {string} elementId - The ID of the element to animate.
 */
export function pulseAnimation(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return;

  element.style.animation = 'pulse 0.6s ease-in-out';
  setTimeout(() => {
    element.style.animation = '';
  }, 600);
}

/**
 * Enhances the canvas with a subtle focus animation.
 * @param {boolean} focused - Whether the canvas should appear focused.
 */
export function animateCanvasFocus(focused) {
  const canvas = document.getElementById('editorCanvas');
  if (!canvas) return;

  if (focused) {
    canvas.style.transform = 'translateY(-3px) scale(1.01)';
    canvas.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.15)';
  } else {
    canvas.style.transform = 'translateY(-2px) scale(1)';
    canvas.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.12)';
  }
}