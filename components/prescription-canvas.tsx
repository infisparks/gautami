// components/prescription-canvas.tsx
"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Eraser, Pencil, Save, Trash2, Move } from "lucide-react"
import { toast } from "react-toastify"

interface PrescriptionCanvasProps {
  letterheadUrl: string
  patientName: string
  patientId: string
  appointmentId: string
  onSave: (canvasBlob: Blob) => Promise<void>
  saving: boolean
}

type DrawingTool = "pen" | "eraser" | "pan"

const PrescriptionCanvas: React.FC<PrescriptionCanvasProps> = ({
  letterheadUrl,
  patientName,
  patientId,
  appointmentId,
  onSave,
  saving,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const [isDrawing, setIsDrawing] = useState(false) // Used for drawing and panning gestures
  const [color, setColor] = useState("#000000")
  const [lineWidth, setLineWidth] = useState(2)
  const [tool, setTool] = useState<DrawingTool>("pen")
  const [letterheadLoaded, setLetterheadLoaded] = useState(false)

  // --- Pan/Zoom State ---
  const [scale, setScale] = useState(1)
  // panOffset now stores the visual pixel translation applied by CSS transform
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  // Store last *viewport* position for pan calculation (mouse or single touch)
  const lastPanPositionRef = useRef({ x: 0, y: 0 });
  // Store initial pinch distance for touch zoom
  const initialPinchDistanceRef = useRef<number | null>(null);
  // Store the *logical* coordinate under the pinch midpoint at the start of touch zoom
  const initialPinchLogicalMidpointRef = useRef<{ x: number; y: number } | null>(null);


  // Available colors for quick selection
  const colors = [
    "#000000", "#FF0000", "#0000FF", "#008000", "#800080", "#FFA500",
  ]

  // Memoize the drawing function
  const drawOnCanvas = useCallback(
    (logicalX: number, logicalY: number, isMoving: boolean) => {
      const context = contextRef.current
      if (!context) return

      if (!isMoving) {
        context.beginPath()
        context.moveTo(logicalX, logicalY)
      } else {
        context.lineTo(logicalX, logicalY)
        context.stroke()
      }
    },
    [], // Dependencies removed as contextRef is stable after initial useEffect
  )

  // Function to get logical coordinates from screen/client coordinates
  const getLogicalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      // Calculate coordinates relative to the canvas's visual top-left corner
      const canvasVisualX = clientX - rect.left;
      const canvasVisualY = clientY - rect.top;

      // Reverse the CSS scaling from the visual position relative to the transformed canvas origin
      // The panOffset is handled by rect.left/top, which reflect the transformed position
      const logicalX = canvasVisualX / scale;
      const logicalY = canvasVisualY / scale;

      return { x: logicalX, y: logicalY }
    },
    [canvasRef, scale], // Only scale is needed as a dependency here
  )

  // Initialize canvas and load letterhead
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      toast.error("Could not get canvas context.")
      return
    }

    // Set canvas dimensions (fixed logical size, CSS handles display size)
    canvas.width = 800
    canvas.height = 1100 // A4 proportions approximately

    // Set initial context properties
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    contextRef.current = ctx // Store context in ref

    const loadLetterhead = () => {
      const letterhead = new Image()
      letterhead.crossOrigin = "anonymous"
      letterhead.src = letterheadUrl
      letterhead.onload = () => {
        if (contextRef.current) {
          contextRef.current.clearRect(0, 0, canvas.width, canvas.height); // Clear before drawing
          contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height)

          // Add patient name and date at the top
          contextRef.current.font = "18px Arial"
          contextRef.current.fillStyle = "#000000"
          contextRef.current.fillText(`Patient: ${patientName}`, 50, 150)
          contextRef.current.fillText(`Date: ${new Date().toLocaleDateString()}`, 50, 180)

          setLetterheadLoaded(true)
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error loading letterhead:", e)
        toast.error("Failed to load letterhead. Using fallback background.")
        // Create a basic white background with a border as fallback
        if (contextRef.current && canvas) {
          contextRef.current.fillStyle = "#ffffff"
          contextRef.current.fillRect(0, 0, canvas.width, canvas.height)
          contextRef.current.strokeStyle = "#000000"
          contextRef.current.lineWidth = 2
          contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)

          // Add patient name and date at the top
          contextRef.current.font = "18px Arial"
          contextRef.current.fillStyle = "#000000"
          contextRef.current.fillText(`Patient: ${patientName}`, 50, 150)
          contextRef.current.fillText(`Date: ${new Date().toLocaleDateString()}`, 50, 180)
        }
        setLetterheadLoaded(true)
      }
    }

    loadLetterhead();

    // Clean up context on unmount
    return () => {
      contextRef.current = null;
    };
  }, [letterheadUrl, patientName])

  // Update context properties when tool, color, or line width changes
  useEffect(() => {
    if (!contextRef.current) return
    contextRef.current.strokeStyle = tool === "eraser" ? "#ffffff" : color
    // Line width is applied directly to context, independent of scale for logical drawing
    // Eraser is wider in logical pixels
    contextRef.current.lineWidth = tool === "eraser" ? lineWidth * 4 : lineWidth;
    contextRef.current.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  }, [color, lineWidth, tool])

  // --- Mouse Handlers ---
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!contextRef.current || !letterheadLoaded) return

    setIsDrawing(true)

    if (tool === "pen" || tool === "eraser") {
      const coords = getLogicalCoords(e.clientX, e.clientY);
      if (!coords) return;
      drawOnCanvas(coords.x, coords.y, false)
    } else if (tool === "pan") {
      // Start pan by storing the current mouse position
      lastPanPositionRef.current = { x: e.clientX, y: e.clientY };
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !contextRef.current || !letterheadLoaded) return

    if (tool === "pen" || tool === "eraser") {
      const coords = getLogicalCoords(e.clientX, e.clientY);
      if (!coords) return;
      drawOnCanvas(coords.x, coords.y, true)
    } else if (tool === "pan") {
      // Pan by calculating delta from last position and updating visual panOffset state
      const deltaX = e.clientX - lastPanPositionRef.current.x;
      const deltaY = e.clientY - lastPanPositionRef.current.y;

      setPanOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      lastPanPositionRef.current = { x: e.clientX, y: e.clientY }; // Update last position for next move
    }
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    if (contextRef.current && (tool === "pen" || tool === "eraser")) {
      contextRef.current.closePath()
    }
    // Reset pan tracking position
    lastPanPositionRef.current = { x: 0, y: 0 };
    // Reset pinch tracking refs
    initialPinchDistanceRef.current = null;
    initialPinchLogicalMidpointRef.current = null;
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!canvasRef.current) return;

    const zoomFactor = 1.1; // How much to zoom per step
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    const rect = canvasRef.current.getBoundingClientRect();
    // Cursor position relative to viewport
    const cursorXViewport = e.clientX;
    const cursorYViewport = e.clientY;

    // Calculate logical coordinate under cursor *before* zoom
    const logicalCursorCoords = getLogicalCoords(cursorXViewport, cursorYViewport);
    if (!logicalCursorCoords) return;

    const newScale = Math.max(0.5, Math.min(3, scale * delta)); // Limit zoom range

    // Calculate new pan offset to keep the same logical point under the cursor
    // Target Viewport Position = (Logical Pos * New Scale) + New Pan Offset
    // We want Target Viewport Position to be the original cursor viewport position
    // cursorXViewport = (logicalCursorCoords.x * newScale) + newPanX
    // cursorYViewport = (logicalCursorCoords.y * newScale) + newPanY
    // Note: The pan offset is relative to the canvas's original position (rect.left, rect.top)
    // So the visual position relative to viewport is (logical * scale + panX + originalCanvasLeft, logical * scale + panY + originalCanvasTop)
    // Instead, let's calculate the new pan offset required to keep the logical cursor point
    // at the *same visual distance* from the *newly scaled* canvas's top-left.

    // Visual position relative to *transformed* canvas top-left if only scaling happened
    const newVisualXRelativeToScaledCanvas = logicalCursorCoords.x * newScale;
    const newVisualYRelativeToScaledCanvas = logicalCursorCoords.y * newScale;

    // The current cursor position relative to *transformed* canvas top-left is (cursorXViewport - rect.left)
    // The difference is the required change in the visual pan offset
    const newPanX = panOffset.x + (cursorXViewport - rect.left) - newVisualXRelativeToScaledCanvas;
    const newPanY = panOffset.y + (cursorYViewport - rect.top) - newVisualYRelativeToScaledCanvas;

    // A simpler way to calculate new pan for zoom-to-cursor:
    // The point (logicalCursorCoords.x, logicalCursorCoords.y) was visually at (cursorXViewport, cursorYViewport)
    // After scaling by `delta`, its visual position would become (logicalCursorCoords.x * scale * delta, logicalCursorCoords.y * scale * delta) relative to original canvas origin.
    // Its new visual position relative to viewport needs to be (logicalCursorCoords.x * newScale + newPanX, logicalCursorCoords.y * newScale + newPanY).
    // We want this to equal the cursor viewport position: (cursorXViewport, cursorYViewport)
    // cursorXViewport = (logicalCursorCoords.x * newScale) + newPanX
    // newPanX = cursorXViewport - (logicalCursorCoords.x * newScale)
    // Similarly, newPanY = cursorYViewport - (logicalCursorCoords.y * newScale)
    // These newPanX/Y values are the required *total* visual pan offsets relative to the viewport origin (0,0)
    // But our panOffset state is relative to the canvas's original position.
    // Let's calculate the pan offset needed to align the logical point with the cursor relative to the CANVAS origin (before CSS translate)

    const canvas = canvasRef.current;
    const rectAfterScaling = canvas.getBoundingClientRect(); // Get bounds *after* potential state update if setScale was async

    // Calculate the coordinate relative to the original canvas top-left if *only* scaling was applied
    const targetVisualX = logicalCursorCoords.x * newScale;
    const targetVisualY = logicalCursorCoords.y * newScale;

    // The difference between the desired visual point (cursor relative to original canvas origin)
    // and where that point would be with just scaling is the required pan offset.
    // Desired visual point relative to original canvas origin = (cursorXViewport - originalCanvasLeft, cursorYViewport - originalCanvasTop)
    // Let's use the simpler calculation that worked in step 11 of thought process:
    // NewPanX = cursorXViewport - (logicalCursorCoords.x * newScale);
    // NewPanY = cursorYViewport - (logicalCursorCoords.y * newScale);
    // This is the translation needed relative to viewport origin. Our state is the same.

    const finalNewPanX = cursorXViewport - (logicalCursorCoords.x * newScale);
    const finalNewPanY = cursorYViewport - (logicalCursorCoords.y * newScale);


    setScale(newScale);
    // Update panOffset based on the cursor point
    setPanOffset({ x: finalNewPanX, y: finalNewPanY });
   }

  // --- Touch Handlers ---
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!contextRef.current || !letterheadLoaded) return

    const touches = e.touches;

    if (touches.length === 1) {
      setIsDrawing(true);
      // Store current touch position for single-finger pan or drawing
      lastPanPositionRef.current = { x: touches[0].clientX, y: touches[0].clientY };

      if (tool === "pen" || tool === "eraser") {
        const coords = getLogicalCoords(touches[0].clientX, touches[0].clientY);
        if (!coords) return;
        drawOnCanvas(coords.x, coords.y, false);
      }
    } else if (touches.length === 2) {
      // Two fingers for zoom/pan gesture
      setIsDrawing(false); // Not drawing with two fingers
      const dist = Math.sqrt(
        Math.pow(touches[1].clientX - touches[0].clientX, 2) +
        Math.pow(touches[1].clientY - touches[0].clientY, 2)
      );
      initialPinchDistanceRef.current = dist;

      const midX = (touches[0].clientX + touches[1].clientX) / 2;
      const midY = (touches[0].clientY + touches[1].clientY) / 2;

      // Store the logical coordinate under the initial pinch midpoint
      initialPinchLogicalMidpointRef.current = getLogicalCoords(midX, midY);

      // Store the initial visual midpoint position for calculating pan offset
      lastPanPositionRef.current = { x: midX, y: midY }; // Reusing ref name, maybe rename to lastGesturePositionRef
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!letterheadLoaded) return

    const touches = e.touches;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (touches.length === 1 && (tool === "pen" || tool === "eraser") && isDrawing) {
      // Drawing with one finger (only if started as a draw gesture and isDrawing is true)
      const coords = getLogicalCoords(touches[0].clientX, touches[0].clientY);
      if (!coords) return;
      drawOnCanvas(coords.x, coords.y, true);
      // lastPanPositionRef.current = { x: touches[0].clientX, y: touches[0].clientY }; // No need to update pan pos while drawing
    } else if (touches.length === 1 && tool === "pan" && isDrawing) {
      // Pan with one finger (only if started as a pan gesture and isDrawing is true)
      const deltaX = touches[0].clientX - lastPanPositionRef.current.x;
      const deltaY = touches[0].clientY - lastPanPositionRef.current.y;

      setPanOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
      lastPanPositionRef.current = { x: touches[0].clientX, y: touches[0].clientY }; // Update last pos for next pan move
    }
    else if (touches.length === 2) {
      // Zooming with two fingers
      if (initialPinchDistanceRef.current === null || !initialPinchLogicalMidpointRef.current) return;

      const currentDist = Math.sqrt(
        Math.pow(touches[1].clientX - touches[0].clientX, 2) +
        Math.pow(touches[1].clientY - touches[0].clientY, 2)
      );

      const scaleChange = currentDist / initialPinchDistanceRef.current;
      const newScale = Math.max(0.5, Math.min(3, scale * scaleChange)); // Limit zoom range

      const currentMidXViewport = (touches[0].clientX + touches[1].clientX) / 2;
      const currentMidYViewport = (touches[0].clientY + touches[1].clientY) / 2;

      const logicalMidX = initialPinchLogicalMidpointRef.current.x;
      const logicalMidY = initialPinchLogicalMidpointRef.current.y;

      // Calculate the new visual pan offset needed to keep the logical midpoint under the current visual midpoint
      // currentMidXViewport = (logicalMidX * newScale) + newPanX
      const newPanX = currentMidXViewport - (logicalMidX * newScale);
      const newPanY = currentMidYViewport - (logicalMidY * newScale);

      setScale(newScale);
      setPanOffset({ x: newPanX, y: newPanY });

      // Update initial pinch distance for smoother subsequent movements
      initialPinchDistanceRef.current = currentDist;

      // No need to update lastPanPositionRef or initialPinchLogicalMidpointRef here for 2-finger gesture
      // Subsequent moves are relative to the *original* pinch start configuration.
    } else if (touches.length === 1 && (tool === "pen" || tool === "eraser") && !isDrawing) {
        // If started with 2 fingers (zoom/pan) and one is lifted, but tool is pen/eraser,
        // we don't want to start drawing accidentally. Do nothing or handle transition.
        // Current logic relies on `isDrawing` state preventing this.
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // If any touches remain after the gesture, don't completely stop
    if (e.touches.length === 0) {
      stopDrawing(); // Call stopDrawing logic (resets isDrawing, closes path, resets refs)
    } else {
      // If one finger is lifted during a two-finger gesture, we might transition
      // back to a single-finger pan IF the tool is 'pan'.
      // Reset isDrawing state based on remaining touches and current tool.
      const remainingTouches = e.touches.length;
      const shouldContinuePan = remainingTouches === 1 && tool === 'pan';
      setIsDrawing(shouldContinuePan);

      // Update the last event position for the remaining touch for potential panning
      if (remainingTouches === 1) {
         lastPanPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
            lastPanPositionRef.current = { x: 0, y: 0 }; // Reset if more than one touch remains (shouldn't happen in normal end)
        }

       // Reset pinch-specific refs as the pinch gesture has ended
       initialPinchDistanceRef.current = null;
       initialPinchLogicalMidpointRef.current = null;
    }
  }


  const clearCanvas = () => {
    if (!contextRef.current || !canvasRef.current) return

    // Confirm before clearing
    if (window.confirm("Are you sure you want to clear the prescription?")) {
      const canvas = canvasRef.current;
      // Clear the drawing area on the logical canvas
      contextRef.current.clearRect(0, 0, canvas.width, canvas.height);

      // Redraw the base content (letterhead, patient info)
      const letterhead = new Image()
      letterhead.crossOrigin = "anonymous"
      letterhead.src = letterheadUrl
      letterhead.onload = () => {
        if (contextRef.current) {
          contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height)

          // Re-add patient name and date
          contextRef.current.font = "18px Arial"
          contextRef.current.fillStyle = "#000000"
          contextRef.current.fillText(`Patient: ${patientName}`, 50, 150)
          contextRef.current.fillText(`Date: ${new Date().toLocaleDateString()}`, 50, 180)
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error reloading letterhead:", e);
        toast.error("Failed to reload letterhead background.");
        // Fallback to just drawing patient info on white background
        if (contextRef.current && canvas) {
          contextRef.current.fillStyle = "#ffffff";
          contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
          contextRef.current.font = "18px Arial"
          contextRef.current.fillStyle = "#000000"
          contextRef.current.fillText(`Patient: ${patientName}`, 50, 150)
          contextRef.current.fillText(`Date: ${new Date().toLocaleDateString()}`, 50, 180)
        }
      }
      // Reset pan and zoom to default after clearing
      setScale(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }

  // This handleSave function now just prepares the blob and calls the parent's onSave
  const handleSaveClick = () => {
    if (!canvasRef.current) {
      toast.error("Canvas not ready.");
      return;
    }

    // Temporarily reset transform for accurate blob export
    const originalTransform = canvasRef.current.style.transform;
    const originalPan = { ...panOffset };
    const originalScale = scale;

    // Apply default transform visually *before* creating blob
    // Note: Directly manipulating DOM like this can sometimes be tricky with React state updates.
    // A more robust solution might involve drawing to an offscreen canvas for the blob.
    // For this fix, let's try temporarily resetting the visual transform.
    // Consider drawing to a hidden canvas at 1x scale for the final image.
    // For simplicity, we'll try resetting the style first.
    // If this causes visual flicker or issues, an offscreen canvas is better.

    // Let's try the offscreen canvas approach as it's safer
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasRef.current.width; // Logical width
    exportCanvas.height = canvasRef.current.height; // Logical height
    const exportCtx = exportCanvas.getContext('2d');

    if (!exportCtx || !contextRef.current) {
        toast.error("Could not create export canvas.");
        return;
    }

    // Copy the current drawing context content to the export canvas
    // We need to draw the original content (letterhead etc.) and then the drawing strokes.
    // This is tricky because we don't store strokes separately.
    // The simplest way using the current structure is to draw the visible canvas content.
    // However, canvas.toBlob captures the *logical* canvas content, not the visually transformed one.
    // The drawing strokes are already on the logical canvas. The letterhead is also drawn there.
    // So canvasRef.current.toBlob should capture the correct *content*, regardless of CSS transform.
    // The only risk is if the initial drawing of letterhead or patient info happened
    // *before* the canvas size was fully set or context was ready, but that's handled in useEffect.

    // Let's revert to the simpler logic: canvas.toBlob should work directly on the logical canvas state.
    // The visual transform is only a CSS presentation layer.

    canvasRef.current.toBlob((blob) => {
      if (blob) {
        onSave(blob).catch(err => {
          console.error("Save failed in parent:", err);
          toast.error("Failed to save prescription.");
        });
      } else {
        toast.error("Failed to convert canvas to image.");
      }
    }, "image/png");
  }

    // Determine cursor style based on tool and drawing state
    const getCursorStyle = () => {
        if (!letterheadLoaded) return 'wait';
        if (tool === 'pan') {
            return isDrawing ? 'grabbing' : 'grab';
        }
        return 'crosshair'; // Default for pen and eraser
    };


  return (
    <div className="flex flex-col items-center p-4 w-full h-full overflow-hidden relative">
      {/* Control Bar */}
      <div className="flex flex-wrap gap-2 mb-4 w-full justify-center bg-white shadow-md dark:bg-gray-800 p-3 rounded-md z-10 sticky top-0 left-0 right-0">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")}>
            <Pencil className="h-4 w-4 mr-1" />
            Pen
          </Button>
          <Button size="sm" variant={tool === "eraser" ? "default" : "outline"} onClick={() => setTool("eraser")}>
            <Eraser className="h-4 w-4 mr-1" />
            Eraser
          </Button>
          <Button size="sm" variant={tool === "pan" ? "default" : "outline"} onClick={() => setTool("pan")}>
            <Move className="h-4 w-4 mr-1" />
            Pan
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm">Width:</span>
          <Slider
            className="w-24"
            value={[lineWidth]}
            min={1}
            max={tool === "eraser" ? 5 : 10} // Eraser max width can be different in logical pixels
            step={1}
            onValueChange={(value) => setLineWidth(value[0])}
            disabled={tool === "pan"} // Disable width slider in pan mode
          />
        </div>

        {(tool === "pen" || tool === "eraser") && ( // Only show color for drawing/erasing tools
          <div className="flex items-center gap-2">
            <span className="text-sm">Color:</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 border-0 p-0 cursor-pointer"
              disabled={tool === "eraser"} // Disable color picker for eraser
            />
            <div className="flex gap-1">
              {colors.map((c) => (
                <div
                  key={c}
                  className="w-6 h-6 rounded-full cursor-pointer border border-gray-300"
                  style={{ backgroundColor: c }}
                  onClick={() => { setTool("pen"); setColor(c); }} // Select pen tool when choosing color
                />
              ))}
            </div>
          </div>
        )}

        <Button size="sm" variant="destructive" onClick={clearCanvas} disabled={!letterheadLoaded}>
          <Trash2 className="h-4 w-4 mr-1" />
          Clear
        </Button>

        {/* Save button provided by the parent page component */}
      </div>

      {/* Canvas Container - handles visual pan/zoom and scroll overflow */}
      <div className="relative w-full h-full overflow-auto flex justify-center items-start"
          onWheel={handleWheel} // Mouse wheel zoom
          style={{ cursor: getCursorStyle() }} // Apply cursor style to container
      >
          {/* Canvas element - drawing context operates at fixed logical size */}
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing} // Important to stop drawing if mouse leaves canvas
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd} // Handle touch cancel events
          className="bg-white shadow-lg"
          // Apply CSS transform for visible pan and zoom
          style={{
            transformOrigin: '0 0', // Scale and translate from the top-left corner
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
             // Explicitly set width/height for logical size
            width: '800px',
            height: '1100px',
             // Cursor is handled by the parent container div
             cursor: 'inherit',
          }}
        />
      </div>
    </div>
  )
}

export default PrescriptionCanvas;