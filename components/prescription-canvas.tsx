// components/prescription-canvas.tsx
"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Eraser, Pencil, Save, Trash2, Move, ZoomIn, ZoomOut } from "lucide-react" // Re-added Move and Zoom icons (though pan/zoom is touch only)
import { toast } from "react-toastify"

interface PrescriptionCanvasProps {
  letterheadUrl: string
  patientName: string // Keeping in props, though not drawn on canvas
  patientId: string // Keeping in props
  appointmentId: string // Keeping in props
  onSave: (canvasBlob: Blob) => Promise<void>
  saving: boolean
}

// Reintroduced 'pan' but it will be touch-only behavior, not a selectable tool
type DrawingTool = "pen" | "eraser" // Removed 'pan' from selectable tools

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
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the container div

  const [isDrawing, setIsDrawing] = useState(false) // For single-touch drawing
  const [isPanning, setIsPanning] = useState(false); // For two-touch panning
  const [color, setColor] = useState("#000000")
  const [lineWidth, setLineWidth] = useState(2)
  const [tool, setTool] = useState<DrawingTool>("pen") // Default tool is pen
  const [letterheadLoaded, setLetterheadLoaded] = useState(false)

  // Pan/Zoom State and Refs
  const [scale, setScale] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const lastPanPositionRef = useRef<{ x: number; y: number } | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialPinchLogicalMidpointRef = useRef<{ x: number; y: number } | null>(null);
  const initialPanOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const initialScaleRef = useRef<number | null>(null);

  const minScale = 0.3; // Adjusted min scale
  const maxScale = 5; // Adjusted max scale

  // Available colors for quick selection
  const colors = [
    "#000000", "#FF0000", "#0000FF", "#008000", "#800080", "#FFA500",
  ]

  // Define the logical canvas dimensions
  const logicalCanvasWidth = 800;
  const logicalCanvasHeight = 1100;

  // Function to get logical coordinates from screen/client coordinates
  // Now accounts for pan and zoom (CSS transform)
  const getLogicalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      // Get coordinates relative to the canvas display element
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      // Apply the inverse of the CSS transform
      // screenX = (logicalX * scale) + panOffset.x  => logicalX = (screenX - panOffset.x) / scale
      // screenY = (logicalY * scale) + panOffset.y  => logicalY = (screenY - panOffset.y) / scale

      const logicalX = (screenX - panOffset.x) / scale;
      const logicalY = (screenY - panOffset.y) / scale;


      // Clamp logical coordinates to canvas boundaries if needed (optional but can prevent drawing far outside)
      // const clampedLogicalX = Math.max(0, Math.min(logicalCanvasWidth, logicalX));
      // const clampedLogicalY = Math.max(0, Math.min(logicalCanvasHeight, logicalY));

      return { x: logicalX, y: logicalY } // Use raw logical coords for drawing
    },
    [canvasRef, panOffset, scale, logicalCanvasWidth, logicalCanvasHeight], // Dependencies include panOffset and scale
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

    // Set canvas logical dimensions (the internal drawing surface size)
    canvas.width = logicalCanvasWidth;
    canvas.height = logicalCanvasHeight;

    // Set initial context properties for drawing
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    // Other drawing properties (strokeStyle, lineWidth, globalCompositeOperation) will be set by the tool effect

    contextRef.current = ctx // Store context in ref

    const loadLetterhead = () => {
      const letterhead = new Image()
      letterhead.crossOrigin = "anonymous"
      letterhead.src = letterheadUrl
      letterhead.onload = () => {
        if (contextRef.current) {
          // Draw letterhead onto the logical canvas at its native resolution
          contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
          contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height)
          setLetterheadLoaded(true)
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error loading letterhead:", e)
        toast.error("Failed to load letterhead. Using fallback background.")
        // Create a basic white background with a border as fallback on the logical canvas
        if (contextRef.current && canvas) {
          contextRef.current.fillStyle = "#ffffff"
          contextRef.current.fillRect(0, 0, canvas.width, canvas.height)
          contextRef.current.strokeStyle = "#000000"
          contextRef.current.lineWidth = 2
          contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
        }
        setLetterheadLoaded(true)
      }
    }

    loadLetterhead();

    // Clean up context on unmount
    return () => {
      contextRef.current = null;
    };
  }, [letterheadUrl, logicalCanvasWidth, logicalCanvasHeight]) // Dependencies include logical dimensions

  // Update context properties when tool, color, or line width changes
  // These properties are applied to the *logical* drawing context
  useEffect(() => {
    if (!contextRef.current) return
    contextRef.current.strokeStyle = tool === "eraser" ? "#ffffff" : color
    // Line width applied directly to context
    // Eraser is wider in logical pixels
    contextRef.current.lineWidth = tool === "eraser" ? lineWidth * 4 : lineWidth;
    contextRef.current.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  }, [color, lineWidth, tool])

  // --- Mouse Handlers ---
  // Mouse handlers are for drawing/erasing only
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!contextRef.current || !letterheadLoaded) return

    // Only start drawing with mouse if tool is pen or eraser
    if (tool === "pen" || tool === "eraser") {
        setIsDrawing(true);
        const coords = getLogicalCoords(e.clientX, e.clientY);
        if (!coords) return;
        contextRef.current.beginPath();
        contextRef.current.moveTo(coords.x, coords.y);
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Only draw with mouse if isDrawing is true and tool is pen/eraser
    if (!isDrawing || !contextRef.current || !letterheadLoaded || (tool !== "pen" && tool !== "eraser")) return

    const coords = getLogicalCoords(e.clientX, e.clientY);
    if (!coords) return;
    contextRef.current.lineTo(coords.x, coords.y);
    contextRef.current.stroke();
  }

  const stopDrawing = () => {
    // Only stop drawing if the event was related to drawing (mouse up/leave)
    if (isDrawing && contextRef.current) {
      contextRef.current.closePath();
      setIsDrawing(false);
    }
    // Reset pan/pinch refs here in case a touch gesture ended abruptly or mixed input happened
    lastPanPositionRef.current = null;
    initialPinchDistanceRef.current = null;
    initialPinchLogicalMidpointRef.current = null;
    initialPanOffsetRef.current = null;
    initialScaleRef.current = null;
    setIsPanning(false); // Ensure panning state is reset
  }

  // --- Touch Handlers ---
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault(); // Prevent default scrolling/zooming
      if (!contextRef.current || !letterheadLoaded) return;

      const touches = e.touches;

      if (touches.length === 1) {
          // Single touch: Start drawing if tool is pen/eraser
          if (tool === "pen" || tool === "eraser") {
              setIsDrawing(true);
              // Do NOT set isPanning here
              const coords = getLogicalCoords(touches[0].clientX, touches[0].clientY);
              if (!coords) return;
              contextRef.current.beginPath();
              contextRef.current.moveTo(coords.x, coords.y);
          }
      } else if (touches.length === 2) {
          // Two touches: Start panning/pinching
          setIsDrawing(false); // Stop drawing if it was active
          setIsPanning(true); // Indicate panning/pinching
          lastPanPositionRef.current = { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
          initialPanOffsetRef.current = { ...panOffset }; // Store current pan offset
          initialScaleRef.current = scale; // Store current scale

          const dx = touches[0].clientX - touches[1].clientX;
          const dy = touches[0].clientY - touches[1].clientY;
          initialPinchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);

          // Calculate logical midpoint at the start of the pinch
          const midX = (touches[0].clientX + touches[1].clientX) / 2;
          const midY = (touches[0].clientY + touches[1].clientY) / 2;
          initialPinchLogicalMidpointRef.current = getLogicalCoords(midX, midY);
      }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault(); // Prevent default scrolling/zooming
      if (!contextRef.current || !letterheadLoaded) return;

      const touches = e.touches;

      if (touches.length === 1 && isDrawing && (tool === "pen" || tool === "eraser")) {
          // Single touch and drawing is active
          const coords = getLogicalCoords(touches[0].clientX, touches[0].clientY);
          if (!coords) return;
          contextRef.current.lineTo(coords.x, coords.y);
          contextRef.current.stroke();
      } else if (touches.length === 2 && isPanning) {
          // Two touches and panning/pinching is active
          const currentMidX = (touches[0].clientX + touches[1].clientX) / 2;
          const currentMidY = (touches[0].clientY + touches[1].clientY) / 2;

          const currentPinchDistance = Math.sqrt(
              Math.pow(touches[0].clientX - touches[1].clientX, 2) +
              Math.pow(touches[0].clientY - touches[1].clientY, 2)
          );

          const lastMidPosition = lastPanPositionRef.current;
          const initialPinchDistance = initialPinchDistanceRef.current;
          const initialLogicalMidpoint = initialPinchLogicalMidpointRef.current;
          const initialPan = initialPanOffsetRef.current;
          const initialScale = initialScaleRef.current;

          if (!lastMidPosition || !initialPinchDistance || !initialLogicalMidpoint || !initialPan || !initialScale) {
              // Should not happen if touchstart was handled correctly, but for safety
              return;
          }

          // Calculate new scale
          let newScale = initialScale * (currentPinchDistance / initialPinchDistance);
          newScale = Math.max(minScale, Math.min(maxScale, newScale)); // Clamp scale

          // Calculate pan adjustment needed to keep the initial logical midpoint under the current screen midpoint
          // Current screen midpoint corresponds to some logical point based on initial pan/scale
          // We want the *same* initial logical midpoint to now correspond to the *current* screen midpoint with the *new* scale.
          // currentMidX = (initialLogicalMidpoint.x * newScale) + newPanX  => newPanX = currentMidX - (initialLogicalMidpoint.x * newScale)
          // currentMidY = (initialLogicalMidpoint.y * newScale) + newPanY  => newPanY = currentMidY - (initialLogicalMidpoint.y * newScale)

          const canvasRect = canvasRef.current?.getBoundingClientRect();
          if (!canvasRect) return;

           // Screen coordinates relative to canvas rect for the midpoint
          const midScreenXRelativeToCanvas = currentMidX - canvasRect.left;
          const midScreenYRelativeToCanvas = currentMidY - canvasRect.top;


          // Calculate the *new* pan offset
          const newPanX = midScreenXRelativeToCanvas - (initialLogicalMidpoint.x * newScale);
          const newPanY = midScreenYRelativeToCanvas - (initialLogicalMidpoint.y * newScale);


          // Optional: Clamp pan offset to keep canvas somewhat in view
          // This clamping logic can be complex depending on desired behavior.
          // A simple approach is to prevent panning too far off the edges.
          // When zoomed out (scale < 1), the whole canvas might fit, no pan needed.
          // When zoomed in (scale > 1), we can pan.
          const clampedPanX = Math.max(
              canvasRect.width * (1 - newScale), // Don't pan right edge past container right edge
              Math.min(0, newPanX) // Don't pan left edge past container left edge
          );
           const clampedPanY = Math.max(
               canvasRect.height * (1 - newScale), // Don't pan bottom edge past container bottom edge
               Math.min(0, newPanY) // Don't pan top edge past container top edge
           );

           // Simple clamping: Ensure panOffset keeps the canvas within some bounds relative to the container size
           // This requires knowing the container size. Let's use the canvas display size for simplicity here.
           const canvasDisplayWidth = canvasRect.width; // This is the transformed width (logical * scale)
           const canvasDisplayHeight = canvasRect.height; // This is the transformed height (logical * scale)
           const container = containerRef.current;
           const containerRect = container?.getBoundingClientRect();

           if(containerRect) {
                const maxPanX = Math.max(0, newScale * logicalCanvasWidth - containerRect.width);
                const maxPanY = Math.max(0, newScale * logicalCanvasHeight - containerRect.height);

                const boundedPanX = Math.max(-maxPanX, Math.min(containerRect.width * 0.5, newPanX)); // Allow some boundary pan
                const boundedPanY = Math.max(-maxPanY, Math.min(containerRect.height * 0.5, newPanY));

               setPanOffset({ x: boundedPanX, y: boundedPanY });
           } else {
               // Fallback simple update if container size is unknown
                setPanOffset({ x: newPanX, y: newPanY });
           }


          setScale(newScale);

          // Update last pan position for potential future pan calculations within the same gesture
          lastPanPositionRef.current = { x: currentMidX, y: currentMidY };
      }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
      // Note: touchEnd fires for *each* finger lifting off.
      // Check touches.length *after* the finger is lifted to see how many are left.
      // If e.touches.length is 0, it means all fingers are off.
      // If e.touches.length is 1, a two-finger gesture might be transitioning to a single touch.

      if (e.touches.length === 0) {
          // All fingers lifted - end drawing/panning
          setIsDrawing(false);
          setIsPanning(false);
          if (contextRef.current && (tool === "pen" || tool === "eraser")) {
             contextRef.current.closePath();
           }
          // Reset refs
          lastPanPositionRef.current = null;
          initialPinchDistanceRef.current = null;
          initialPinchLogicalMidpointRef.current = null;
          initialPanOffsetRef.current = null;
          initialScaleRef.current = null;
      } else if (e.touches.length === 1) {
          // One finger remaining - potential transition from pan/zoom to drawing?
          // If we were panning, stop panning state. Don't start drawing yet,
          // the next touchStart/touchMove will handle it.
           if (isPanning) {
              setIsPanning(false);
              // Reset refs relevant to the just-ended two-finger gesture
              initialPinchDistanceRef.current = null;
              initialPinchLogicalMidpointRef.current = null;
              initialPanOffsetRef.current = null;
              initialScaleRef.current = null;
           }
          // If we were drawing with one finger and lifted, setIsDrawing will be false above when touches.length === 0
      }
       // If touches.length > 1, some fingers are still down, continue gesture
  };


  const clearCanvas = () => {
    if (!contextRef.current || !canvasRef.current) return

    // Confirm before clearing
    if (window.confirm("Are you sure you want to clear the prescription?")) {
      const canvas = canvasRef.current;
      const ctx = contextRef.current;

       // Temporarily reset transform for clearing and redrawing base
       // Note: This is NOT how we should handle rendering with CSS transforms.
       // The context drawing operations always happen on the logical canvas (800x1100).
       // Clearing should clear that entire area.

      // Clear the drawing area on the logical canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Redraw the base content (letterhead) onto the logical canvas
      const letterhead = new Image()
      letterhead.crossOrigin = "anonymous"
      letterhead.src = letterheadUrl
      letterhead.onload = () => {
        if (contextRef.current) {
          contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height)
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error reloading letterhead:", e);
        toast.error("Failed to reload letterhead background.");
        // Fallback to just drawing white background on the logical canvas
        if (contextRef.current && canvas) {
          contextRef.current.fillStyle = "#ffffff";
          contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
          contextRef.current.strokeStyle = "#000000" // Redraw border for fallback
          contextRef.current.lineWidth = 2
          contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
        }
      }
      // Reset pan and zoom state
      setScale(1);
      setPanOffset({ x: 0, y: 0 });
    }
  }

  // This handleSave function prepares the blob and calls the parent's onSave
  const handleSaveClick = () => {
    if (!canvasRef.current) {
      toast.error("Canvas not ready.");
      return;
    }

    // The canvas.toBlob() method captures the *logical* content of the canvas.
    // The pan/zoom transform is applied via CSS for display, it does not affect the
    // content of the canvas itself or the output of toBlob().
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

    // Determine cursor style based on tool and state
    const getCursorStyle = () => {
        if (!letterheadLoaded) return 'wait';
        if (isPanning) return 'grabbing'; // Indicate panning is active
        // Mouse cursor is always crosshair for drawing/erasing tools
        return 'crosshair';
    };


  return (
    <div className="flex flex-col items-center p-4 w-full h-full relative">
      {/* Control Bar - Positioned at the top */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4 w-full justify-center bg-white shadow-md dark:bg-gray-800 p-3 rounded-md z-10 sticky top-0 left-0 right-0">

        {/* Drawing Tools */}
        <div className="flex items-center gap-2 justify-center">
          <Button size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")}>
            <Pencil className="h-4 w-4 mr-1" />
            Pen
          </Button>
          <Button size="sm" variant={tool === "eraser" ? "default" : "outline"} onClick={() => setTool("eraser")}>
            <Eraser className="h-4 w-4 mr-1" />
            Eraser
          </Button>
             {/* Pan/Zoom are touch-only, no dedicated button */}
        </div>

        {/* Color and Width Controls */}
        {/* Only show color/width controls when Pen or Eraser is selected */}
        {(tool === "pen" || tool === "eraser") && (
           <div className="flex items-center gap-2 justify-center">
              <span className="text-sm">Width:</span>
              <Slider
                className="w-24"
                value={[lineWidth]}
                min={1}
                max={tool === "eraser" ? 10 : 10} // Adjusted max width for eraser
                step={1}
                onValueChange={(value) => setLineWidth(value[0])}
                 // Disabled if panning with mouse (not implemented) or touch is active (prevents changing width mid-gesture)
                disabled={isPanning || isDrawing}
              />

              {tool === "pen" && ( // Only show color picker for Pen tool
                 <div className="flex items-center gap-2">
                    <span className="text-sm">Color:</span>
                      <input
                       type="color"
                       value={color}
                       onChange={(e) => setColor(e.target.value)}
                       className="w-8 h-8 border-0 p-0 cursor-pointer"
                       disabled={isPanning || isDrawing} // Disabled if touch is active
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
           </div>
        )}

        {/* Display Scale (Optional) */}
        {/* <div className="flex items-center gap-2 justify-center">
             <ZoomIn className="h-4 w-4"/>
             <span className="text-sm">{scale.toFixed(1)}x</span>
             <ZoomOut className="h-4 w-4"/>
           </div> */}


        {/* Action Buttons */}
        <div className="flex items-center gap-2 justify-center">
           <Button size="sm" variant="destructive" onClick={clearCanvas} disabled={!letterheadLoaded || isPanning || isDrawing}>
             <Trash2 className="h-4 w-4 mr-1" />
             Clear
           </Button>
           {/* Save button is handled by the parent component */}
        </div>
      </div>

      {/* Canvas Container - This div is the viewport */}
      <div
          ref={containerRef}
          className="relative bg-gray-200 dark:bg-gray-700 rounded-md overflow-hidden" // Added styling for container
           // Fixed display size for the container - adjust as needed
          style={{ width: 'calc(100% - 32px)', height: 'calc(100vh - 200px)', maxWidth: '800px', maxHeight: '1100px', cursor: getCursorStyle() }} // Apply cursor style here
      >
          {/* Canvas element - logical drawing surface */}
        <canvas
          ref={canvasRef}
          // Mouse handlers (only active when not panning via touch)
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}

          // Touch handlers for drawing, pan, and zoom
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd} // Treat touch cancel like touch end

          className="bg-white shadow-lg"
          // CSS transform for pan and zoom
          style={{
             position: 'absolute',
             // CSS size matches logical size
            width: `${logicalCanvasWidth}px`,
            height: `${logicalCanvasHeight}px`,
            transformOrigin: 'top left', // Important for transform calculations
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
             // Cursor is handled by the parent container div
             cursor: 'inherit',
          }}
        />
      </div>
       {/* Placeholder for Save button if it were in this component */}
        {/* <Button onClick={handleSaveClick} disabled={!letterheadLoaded || saving || isPanning || isDrawing} className="mt-4">
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Prescription"}
        </Button> */}
    </div>
  )
}

export default PrescriptionCanvas;