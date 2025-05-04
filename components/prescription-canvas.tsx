// components/prescription-canvas.tsx
"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Eraser, Pencil, Save, Trash2, Move, ZoomIn, ZoomOut } from "lucide-react" // Added Zoom icons
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
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the container div

  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState("#000000")
  const [lineWidth, setLineWidth] = useState(2)
  const [tool, setTool] = useState<DrawingTool>("pen")
  const [letterheadLoaded, setLetterheadLoaded] = useState(false)

  // --- Pan/Zoom State ---
  const [scale, setScale] = useState(1)
  // panOffset stores the visual pixel translation applied by CSS transform, relative to container's top-left
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  // Store last *viewport* position for pan calculation (mouse or single touch)
  const lastPanPositionRef = useRef({ x: 0, y: 0 });
  // Store initial pinch distance for touch zoom
  const initialPinchDistanceRef = useRef<number | null>(null);
  // Store the *logical* coordinate under the pinch midpoint at the start of touch zoom
  const initialPinchLogicalMidpointRef = useRef<{ x: number; y: number } | null>(null);

    const minScale = 0.5;
    const maxScale = 3;


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
    [],
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
    [canvasRef, scale],
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

    // Effect to perform initial centering after mount and letterhead load
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (canvas && container && letterheadLoaded) {
            const containerRect = container.getBoundingClientRect();
            const canvasLogicalWidth = canvas.width;
            const canvasLogicalHeight = canvas.height;

            // Calculate pan offset to center the logical canvas at default scale (1)
            const initialPanX = (containerRect.width - canvasLogicalWidth) / 2;
            const initialPanY = (containerRect.height - canvasLogicalHeight) / 2;

            // Set initial pan, keep initial scale (which is 1)
            setPanOffset({ x: initialPanX, y: initialPanY });
        }
    }, [letterheadLoaded]); // Recalculate if letterhead finishes loading

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

    // Corrected type for WheelEvent handler attached to the div
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const zoomFactor = 1.1; // How much to zoom per step
    const delta = e.deltaY > 0 ? 1 / zoomFactor : zoomFactor;

    const newScale = Math.max(minScale, Math.min(maxScale, scale * delta));

    // Calculate logical coordinate under cursor *before* zoom
    // Mouse event clientX/Y are relative to viewport
    const logicalCursorCoords = getLogicalCoords(e.clientX, e.clientY);
    if (!logicalCursorCoords) return; // Should not happen if canvas and scale are valid

    // Calculate the new pan offset to keep the logical point under the cursor
    // New Pan Offset = Current Viewport Cursor Position - (Logical Cursor Position * New Scale)
    const newPanX = e.clientX - (logicalCursorCoords.x * newScale);
    const newPanY = e.clientY - (logicalCursorCoords.y * newScale);

    setScale(newScale);
    setPanOffset({ x: newPanX, y: newPanY });
   }

    const handleZoom = (zoomType: 'in' | 'out') => {
        const container = containerRef.current;
        if (!container) return;

        const zoomFactor = 1.2; // Zoom factor for buttons
        const delta = zoomType === 'in' ? zoomFactor : 1 / zoomFactor;

        const newScale = Math.max(minScale, Math.min(maxScale, scale * delta));

        // Calculate the logical coordinate at the *center* of the container's current view
        const containerRect = container.getBoundingClientRect();
        const containerCenterX = containerRect.left + containerRect.width / 2;
        const containerCenterY = containerRect.top + containerRect.height / 2;

        const logicalCenterCoords = getLogicalCoords(containerCenterX, containerCenterY);
        if (!logicalCenterCoords) return;

        // Calculate the new pan offset needed to keep this logical center point
        // at the visual center of the container after scaling
        const newPanX = containerCenterX - (logicalCenterCoords.x * newScale);
        const newPanY = containerCenterY - (logicalCenterCoords.y * newScale);

        setScale(newScale);
        setPanOffset({ x: newPanX, y: newPanY });
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
      lastPanPositionRef.current = { x: midX, y: midY }; // Reusing ref name, could be renamed
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
    } else if (touches.length === 1 && tool === "pan") {
        // Pan with one finger if tool is pan
        // This handles both starting a pan with one finger OR transitioning from a 2-finger pinch to 1-finger pan
        if (!isDrawing && initialPinchDistanceRef.current === null) {
          // If not drawing and not in a pinch gesture, this is a new single-finger pan start
          setIsDrawing(true); // Mark as drawing state for pan gesture
          lastPanPositionRef.current = { x: touches[0].clientX, y: touches[0].clientY };
          return; // Skip move logic for the first point
        }
        if (!isDrawing) {
            // If isDrawing is false here, it means we came from a 2-finger gesture or were not drawing/panning
            // We should only pan if tool is pan AND a pan gesture is "active" (isDrawing is true)
            // The isDrawing state is set on touch start for 1 finger pan or kept false for 2 finger
            // The handleTouchEnd logic should manage transition from 2 to 1 finger pan
            // Let's rely on the isDrawing state being true for panning to occur
            if (!isDrawing) return;
        }


        const deltaX = touches[0].clientX - lastPanPositionRef.current.x;
        const deltaY = touches[0].clientY - lastPanPositionRef.current.y;

        setPanOffset(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
        lastPanPositionRef.current = { x: touches[0].clientX, y: touches[0].clientY }; // Update last pos for next pan move
    }
    else if (touches.length === 2) {
      // Zooming with two fingers
      if (initialPinchDistanceRef.current === null || !initialPinchLogicalMidpointRef.current) return; // Ensure pinch started correctly

      const currentDist = Math.sqrt(
        Math.pow(touches[1].clientX - touches[0].clientX, 2) +
        Math.pow(touches[1].clientY - touches[0].clientY, 2)
      );

      const scaleChange = currentDist / initialPinchDistanceRef.current;
      const newScale = Math.max(minScale, Math.min(maxScale, scale * scaleChange)); // Limit zoom range

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

      // Note: We don't update lastPanPositionRef or initialPinchLogicalMidpointRef here for 2-finger gesture
      // because subsequent moves are relative to the *original* pinch start configuration.
    }
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    // If any touches remain after the gesture, don't completely stop drawing/pan state
    if (e.touches.length === 0) {
      stopDrawing(); // Call stopDrawing logic (resets isDrawing, closes path, resets refs)
    } else {
      // If one finger is lifted during a two-finger gesture, transition state if needed
      const remainingTouches = e.touches.length;

      if (remainingTouches === 1 && tool === 'pan') {
        // Transition from 2 fingers to 1 finger pan
        setIsDrawing(true); // Start 1-finger pan
        lastPanPositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; // Store the position of the remaining finger
      } else {
        // If tool is not pan, or more than 1 finger remains (shouldn't happen on touchend), stop gesture
        setIsDrawing(false);
        lastPanPositionRef.current = { x: 0, y: 0 };
      }

       // Reset pinch-specific refs as the pinch gesture part has ended
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
      // Recalculate initial centering pan offset after clearing and resetting scale
            const container = containerRef.current;
            if(canvas && container) {
                 const containerRect = container.getBoundingClientRect();
                 const canvasLogicalWidth = canvas.width;
                 const canvasLogicalHeight = canvas.height;
                 const initialPanX = (containerRect.width - canvasLogicalWidth) / 2;
                 const initialPanY = (containerRect.height - canvasLogicalHeight) / 2;
                 setPanOffset({ x: initialPanX, y: initialPanY });
            } else {
                 setPanOffset({ x: 0, y: 0 }); // Fallback if refs not ready
            }
    }
  }

  // This handleSave function now just prepares the blob and calls the parent's onSave
  const handleSaveClick = () => {
    if (!canvasRef.current) {
      toast.error("Canvas not ready.");
      return;
    }

    // The canvas.toBlob() method captures the *logical* content of the canvas,
    // ignoring the CSS transform. This is the desired behavior for saving.
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
    <div className="flex flex-col items-center p-4 w-full h-full relative"> {/* Removed overflow-hidden here */}
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

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => handleZoom('out')} disabled={scale <= minScale || !letterheadLoaded}>
                <ZoomOut className="h-4 w-4" />
            </Button>
             <span className="text-sm">{Math.round(scale * 100)}%</span>
            <Button size="sm" variant="outline" onClick={() => handleZoom('in')} disabled={scale >= maxScale || !letterheadLoaded}>
                 <ZoomIn className="h-4 w-4" />
            </Button>
        </div>


        <Button size="sm" variant="destructive" onClick={clearCanvas} disabled={!letterheadLoaded}>
          <Trash2 className="h-4 w-4 mr-1" />
          Clear
        </Button>

        {/* Save button provided by the parent page component */}
      </div>

      {/* Canvas Container - handles visual pan/zoom and scroll overflow */}
      {/* Removed justify-center items-start to allow simpler pan/scroll calculation */}
      <div ref={containerRef} className="relative w-full h-full overflow-auto"
          onWheel={handleWheel} // Mouse wheel zoom handler with corrected type
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
            width: '800px', // These control the *logical* size, not the visual size after scale
            height: '1100px',
             // Cursor is handled by the parent container div
             cursor: 'inherit',
             // Setting display block can sometimes help with layout inside flex/grid or with overflow
             display: 'block',
             // Ensure the canvas itself doesn't overflow its natural size before transform (not strictly necessary with current setup)
             // overflow: 'visible', // This is default, just being explicit if needed
          }}
        />
      </div>
    </div>
  )
}

export default PrescriptionCanvas;