/**
 * Toggles the active state of a tool (e.g., crop, annotate, text, arrow).
 * Deactivates other mutually exclusive tools.
 * @param {'crop' | 'annotate' | 'text' | 'arrow'} tool - The name of the tool to toggle.
 */
export function toggleTool(tool) {
  const toolElement = document.getElementById(`${tool}Tool`);
  if (!toolElement || toolElement.style.display === 'none') {
    console.warn(`Tool element for ${tool} not found or is hidden.`);
    return;
  }

  // Define mutually exclusive drawing/interaction tools
  const drawingTools = ['crop', 'annotate', 'arrow', 'text'];
  const otherDrawingTools = drawingTools.filter(t => t !== tool);

  // Commit any open text input and clear the selection when switching tools
  if (this.activeTextInput) this.commitTextInput();
  if (this.state.selected) {
    this.state.selected = null;
    this.redrawCanvas();
  }

  // If the clicked tool is already active, deactivate it.
  if (this.isToolActive(tool)) {
    console.log(`Deactivating tool: ${tool}`);
    this.setToolActive(tool, false);
    
    // Animate tool deactivation
    toolElement.classList.remove('active');
    this.animateToolActivation(`${tool}Tool`, false);
    
    // Reset cursor only if NO other drawing tool remains active
    const anyDrawingToolActive = drawingTools.some(t => this.isToolActive(t));
    if (!anyDrawingToolActive && this.canvas) {
      this.canvas.style.cursor = 'default';
      // Reset canvas transform
      this.canvas.style.transform = '';
    }

    // If deactivating crop, redraw to remove guides
    if (tool === 'crop') {
      this.redrawCanvas();
    }

  } else {
    // --- Activate the selected tool ---
    console.log(`Activating tool: ${tool}`);

    // Deactivate other conflicting drawing tools first
    otherDrawingTools.forEach(otherTool => {
      if (this.isToolActive(otherTool)) {
        console.log(`Deactivating conflicting tool: ${otherTool}`);
        this.setToolActive(otherTool, false);
        const otherElement = document.getElementById(`${otherTool}Tool`);
        if (otherElement) {
          otherElement.classList.remove('active');
          this.animateToolActivation(`${otherTool}Tool`, false);
        }
      }
    });

    // Now activate the selected tool
    this.setToolActive(tool, true);
    toolElement.classList.add('active');
    
    // Animate tool activation
    this.animateToolActivation(`${tool}Tool`, true);

    // Set cursor and provide feedback
    if (drawingTools.includes(tool)) {
      if (this.canvas) {
        this.canvas.style.cursor = tool === 'text' ? 'text' : 'crosshair';
        // Add subtle canvas feedback
        this.canvas.style.transform = 'translateY(-1px) scale(1.002)';
      }
      const hints = {
        crop: "Drag to select crop area.",
        annotate: "Click and drag to draw rectangles.",
        arrow: "Drag to draw a red arrow.",
        text: "Click anywhere on the image to type red text."
      };
      this.showToast(hints[tool], false, 'info');
    }
  }
}

/**
 * Finalizes the crop operation based on the selected area.
 * Extracts the cropped section from the original high-resolution image.
 * Updates the main and offscreen canvases to the cropped, high-res data.
 * Adjusts positions AND SIZES of existing elements.
 * Exits cropOnlyMode if active.
 */
export async function completeCrop() {
  // Ensure prerequisites are met
  if (!this.drawingState.cropStart || !this.drawingState.cropEnd || !this.isToolActive('crop') || !this.offscreenCanvas) {
    console.warn("completeCrop prerequisites not met.");
    this.resetCropState();
    return;
  }

  // The canvas bitmap and offscreen canvas share the same resolution, so the
  // selection is already in source coordinates — crop 1:1 from the offscreen
  // canvas (this also keeps consecutive crops correct).
  const currentWidth = this.offscreenCanvas.width;
  const currentHeight = this.offscreenCanvas.height;
  if (currentWidth === 0 || currentHeight === 0) {
    this.showToast("Error: Invalid canvas dimensions before crop.", false, 'error');
    this.resetCropState();
    return;
  }

  const startX = Math.min(this.drawingState.cropStart.x, this.drawingState.cropEnd.x);
  const startY = Math.min(this.drawingState.cropStart.y, this.drawingState.cropEnd.y);
  const cropWidth = Math.abs(this.drawingState.cropEnd.x - this.drawingState.cropStart.x);
  const cropHeight = Math.abs(this.drawingState.cropEnd.y - this.drawingState.cropStart.y);

  // Clamp selection to canvas bounds
  const sx = Math.max(0, Math.min(Math.round(startX), currentWidth - 1));
  const sy = Math.max(0, Math.min(Math.round(startY), currentHeight - 1));
  const sw = Math.max(1, Math.min(Math.round(cropWidth), currentWidth - sx));
  const sh = Math.max(1, Math.min(Math.round(cropHeight), currentHeight - sy));

  console.log(`Cropping canvas region: x=${sx}, y=${sy}, w=${sw}, h=${sh}`);

  if (sw <= 1 || sh <= 1) {
    this.showToast("Crop area is too small.", false, 'error');
    this.resetCropState();
    return;
  }

  try {
    // Copy the selected region out before resizing the offscreen canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    tempCanvas.getContext('2d').drawImage(this.offscreenCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    // Resize editor canvases and draw the cropped region back
    this.canvas.width = sw;
    this.canvas.height = sh;
    this.offscreenCanvas.width = sw;
    this.offscreenCanvas.height = sh;
    this.offscreenCtx.clearRect(0, 0, sw, sh);
    this.offscreenCtx.drawImage(tempCanvas, 0, 0);
    const newCanvasWidth = sw;
    const newCanvasHeight = sh;

    // Shift all annotation elements by the crop offset; drop ones now outside
    this.state.selected = null;
    this.elements.annotationElements = this.elements.annotationElements
      .filter(Boolean)
      .map(element => {
        if (element.type === 'arrow') {
          return { ...element, x1: element.x1 - sx, y1: element.y1 - sy, x2: element.x2 - sx, y2: element.y2 - sy };
        }
        return { ...element, x: element.x - sx, y: element.y - sy };
      })
      .filter(element => {
        const b = this.getElementBounds(element);
        return b.x + b.width > 0 && b.y + b.height > 0 && b.x < newCanvasWidth && b.y < newCanvasHeight;
      });

    console.log("Adjusted annotation elements for crop.");

    // Refit the display size to the new bitmap and update the rect cache
    this.updateCanvasDisplaySize();
    this.redrawCanvas();
    this.showToast("Crop completed successfully!", false, 'success');
    this.setToolActive('crop', false);
    const cropToolElement = document.getElementById('cropTool');
    if (cropToolElement) {
      cropToolElement.classList.remove('active');
    }
    this.animateToolActivation('cropTool', false);

  } catch (error) {
    console.error("Error during crop finalization:", error);
    this.showToast(`Crop failed: ${error.message}`, false, 'error');
    this.redrawCanvas(); // Attempt redraw on error
  } finally {
    this.resetCropState(); // Reset selection state and redraw final result
    this.showSpinner(false);
  }
}

/**
 * Helper function to reset cropping state and redraw canvas.
 */
export function resetCropState() {
  this.drawingState.cropStart = null;
  this.drawingState.cropEnd = null;
  if (this.canvas) {
    // Determine appropriate cursor
    let newCursor = 'default';
    if (this.isToolActive('crop') || this.isToolActive('annotate')) newCursor = 'crosshair';
    this.canvas.style.cursor = newCursor;
    // Reset canvas transform
    this.canvas.style.transform = '';
    // Redraw to remove guides and show current elements
    this.redrawCanvas();
  }
}

/**
 * Copies the current canvas content to the clipboard as a PNG image.
 */
export async function copyToClipboard() {
  if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
    this.showToast("Cannot copy empty image.", false, 'error'); 
    return; 
  }
  if (this.state.isDrawing && this.isToolActive('crop')) {
    this.showToast("Finalize cropping before copying.", false, 'warning'); 
    return; 
  }

  this.showSpinner(true);
  this.showToast('Preparing high-quality image for clipboard...', true, 'info');
  
  // Add visual feedback
  this.pulseAnimation('shareTool');
  
  try {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') {
      throw new Error('Clipboard API (write with ClipboardItem) is not supported.'); 
    }
    if (!document.hasFocus()) { 
      console.warn("Document focus lost, clipboard write might fail."); 
    }

    // NOTE: This action is directly initiated by the user clicking the 'Copy' button.
    const finalCanvas = this.prepareFinalCanvas();
    
    // Create high-quality blob with maximum quality settings
    const blob = await new Promise((resolve, reject) => {
      finalCanvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed.')), 
        'image/png', 
        1.0 // Maximum quality
      );
    });
    
    // Ensure the blob has the correct MIME type
    const highQualityBlob = new Blob([blob], { type: 'image/png' });
    
    await navigator.clipboard.write([ 
      new ClipboardItem({ 
        'image/png': highQualityBlob 
      }) 
    ]);
    
    this.showToast('High-quality screenshot copied to clipboard!', false, 'success');
  } catch (error) {
    console.error('Copy to clipboard failed:', error);
    this.showToast(`Copy failed: ${error.message || 'Unknown error'}`, false, 'error');
  } finally {
    this.showSpinner(false);
  }
}

/**
 * Saves the current canvas content as a PNG image file.
 */
export async function saveImage() {
  if (!this.canvas || this.canvas.width === 0 || this.canvas.height === 0) {
    this.showToast("Cannot save empty image.", false, 'error'); 
    return; 
  }
  if (this.state.isDrawing && this.isToolActive('crop')) {
    this.showToast("Finalize cropping before saving.", false, 'warning'); 
    return; 
  }

  this.showSpinner(true);
  this.showToast('Preparing image for download...', true, 'info');
  
  // Add visual feedback
  this.pulseAnimation('saveTool');
  
  try {
    const finalCanvas = this.prepareFinalCanvas();
    const dataUrl = finalCanvas.toDataURL('image/png', 1.0);
    const { saveLocation } = await chrome.storage.sync.get({ saveLocation: 'SnipScreen' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z','');
    const sanitizedSaveLocation = saveLocation.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9_\-\/]/g, '_');
    const filename = `${sanitizedSaveLocation}/SnipScreen-${timestamp}.png`;

    console.log(`Attempting to download to: ${filename}`);
    await this.tryDownload(dataUrl, filename, 0); // Reduced retries to 0 unless specific need
    this.showToast('Screenshot saved successfully!', false, 'success');
  } catch (error) {
    console.error('Save image failed:', error);
    if (error.message.includes('USER_CANCELED')) { 
      this.showToast('Save cancelled by user.', false, 'info'); 
    }
    else if (error.message.includes('INVALID_FILENAME')) { 
      this.showToast(`Save failed: Invalid path "${error.filename}".`, false, 'error'); 
    }
    else { 
      this.showToast(`Save failed: ${error.message || 'Unknown error'}`, false, 'error'); 
    }
  } finally {
    this.showSpinner(false);
  }
}

/**
 * Attempts to download a file using chrome.downloads.download with retries.
 */
export async function tryDownload(url, filename, retries) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const downloadId = await chrome.downloads.download({ url: url, filename: filename, saveAs: false });
      console.log(`Download started with ID: ${downloadId}`);
      return; // Success
    } catch (error) {
      console.warn(`Download attempt ${attempt + 1} failed:`, error.message);
      if (attempt === retries) {
        const finalError = new Error(`Download failed after ${retries + 1} attempts: ${error.message}`);
        finalError.filename = filename; 
        throw finalError;
      }
      // Only wait if retrying
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 300 + attempt * 200));
      }
    }
  }
}
