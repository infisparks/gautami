// components/prescription-canvas.tsx
"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Eraser, Pencil, Save, Trash2 } from "lucide-react" // Removed Move and Zoom icons
import { toast } from "react-toastify"

interface PrescriptionCanvasProps {
  letterheadUrl: string
  patientName: string
  patientId: string
  appointmentId: string
  onSave: (canvasBlob: Blob) => Promise<void>
  saving: boolean
}

// Removed 'pan' from DrawingTool type
type DrawingTool = "pen" | "eraser"

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
  const [tool, setTool] = useState<DrawingTool>("pen") // Default tool is pen
  const [letterheadLoaded, setLetterheadLoaded] = useState(false)

  // Removed Pan/Zoom State and Refs
  // const [scale, setScale] = useState(1)
  // const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  // const lastPanPositionRef = useRef({ x: 0, y: 0 });
  // const initialPinchDistanceRef = useRef<number | null>(null);
  // const initialPinchLogicalMidpointRef = useRef<{ x: number; y: number } | null>(null);
  // const minScale = 0.5;
  // const maxScale = 3;


  // Available colors for quick selection
  const colors = [
    "#000000", "#FF0000", "#0000FF", "#008000", "#800080", "#FFA500",
  ]

  // Memoize the drawing function
  const drawOnCanvas = useCallback(
    (logicalX: number, logicalY: number, isMoving: boolean) => {
      const context = contextRef.current
      if (!context) return

      // Context properties are updated in the useEffect below

      if (!isMoving) {
        context.beginPath()
        context.moveTo(logicalX, logicalY)
      } else {
        context.lineTo(logicalX, logicalY)
        context.stroke()
      }
    },
    [], // Dependencies: None, as it uses contextRef.current and logical coords
  )

  // Function to get logical coordinates from screen/client coordinates
  // Simplified as there is no scaling or panning transformation
  const getLogicalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      // Calculate coordinates relative to the canvas's top-left corner
      const logicalX = clientX - rect.left;
      const logicalY = clientY - rect.top;

      return { x: logicalX, y: logicalY }
    },
    [canvasRef], // Depends only on canvasRef now
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

    // Set canvas dimensions (fixed logical size)
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

          // Removed drawing Patient Name and Date on canvas
          // contextRef.current.font = "18px Arial"
          // contextRef.current.fillStyle = "#000000"
          // contextRef.current.fillText(`Patient: ${patientName}`, 50, 150)
          // contextRef.current.fillText(`Date: ${new Date().toLocaleDateString()}`, 50, 180)

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

           // Removed drawing Patient Name and Date on canvas
          // contextRef.current.font = "18px Arial"
          // contextRef.current.fillStyle = "#000000"
          // contextRef.current.fillText(`Patient: ${patientName}`, 50, 150)
          // contextRef.current.fillText(`Date: ${new Date().toLocaleDateString()}`, 50, 180)
        }
        setLetterheadLoaded(true)
      }
    }

    loadLetterhead();

    // Clean up context on unmount
    return () => {
      contextRef.current = null;
    };
  }, [letterheadUrl]) // Removed patientName from dependency as it's no longer drawn on canvas

    // Removed Effect to perform initial centering (tied to pan/zoom)
    // useEffect(() => { /* ... */ }, [letterheadLoaded]);


  // Update context properties when tool, color, or line width changes
  useEffect(() => {
    if (!contextRef.current) return
    contextRef.current.strokeStyle = tool === "eraser" ? "#ffffff" : color
    // Line width applied directly to context
    // Eraser is wider in logical pixels
    contextRef.current.lineWidth = tool === "eraser" ? lineWidth * 4 : lineWidth;
    contextRef.current.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  }, [color, lineWidth, tool])

  // --- Mouse Handlers ---
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!contextRef.current || !letterheadLoaded) return

    // Only handle drawing/erasing based on tool
    if (tool === "pen" || tool === "eraser") {
        setIsDrawing(true);
        const coords = getLogicalCoords(e.clientX, e.clientY);
        if (!coords) return;
        contextRef.current.beginPath();
        contextRef.current.moveTo(coords.x, coords.y);
    }
     // Removed pan logic
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Only draw if isDrawing is true and tool is pen/eraser
    if (!isDrawing || !contextRef.current || !letterheadLoaded || (tool !== "pen" && tool !== "eraser")) return

    const coords = getLogicalCoords(e.clientX, e.clientY);
    if (!coords) return;
    contextRef.current.lineTo(coords.x, coords.y);
    contextRef.current.stroke();

    // Removed pan logic
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    if (contextRef.current && (tool === "pen" || tool === "eraser")) {
      contextRef.current.closePath()
    }
    // Removed reset for pan/pinch tracking refs
    // lastPanPositionRef.current = { x: 0, y: 0 };
    // initialPinchDistanceRef.current = null;
    // initialPinchLogicalMidpointRef.current = null;
  }

    // Removed Wheel Event handler for zoom
    // const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => { /* ... */ }


  // Removed Touch Handlers for Pan/Zoom
  // const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => { /* ... */ }
  // const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => { /* ... */ }
  // const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => { /* ... */ }


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
           // Removed drawing Patient Name and Date on canvas
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error reloading letterhead:", e);
        toast.error("Failed to reload letterhead background.");
        // Fallback to just drawing white background
        if (contextRef.current && canvas) {
          contextRef.current.fillStyle = "#ffffff";
          contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
           // Removed drawing Patient Name and Date on canvas
           contextRef.current.strokeStyle = "#000000" // Redraw border for fallback
           contextRef.current.lineWidth = 2
           contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
        }
      }
      // Removed reset for pan and zoom state
      // setScale(1);
      // setPanOffset({ x: 0, y: 0 });
    }
  }

  // This handleSave function prepares the blob and calls the parent's onSave
  const handleSaveClick = () => {
    if (!canvasRef.current) {
      toast.error("Canvas not ready.");
      return;
    }

    // The canvas.toBlob() method captures the *logical* content of the canvas.
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

    // Determine cursor style based on tool
    const getCursorStyle = () => {
        if (!letterheadLoaded) return 'wait';
        // Cursor is always crosshair for drawing/erasing tools
        return 'crosshair';
    };


  return (
    <div className="flex flex-col items-center p-4 w-full h-full relative">
      {/* Control Bar - Positioned at the top */}
      {/* Adjusted layout to group tools and color/width */}
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
          {/* Removed Pan Button */}
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
                max={tool === "eraser" ? 5 : 10} // Eraser max width can be different
                step={1}
                onValueChange={(value) => setLineWidth(value[0])}
                // Disabled prop removed as pan tool is gone
              />

              {tool === "pen" && ( // Only show color picker for Pen tool
                 <div className="flex items-center gap-2">
                    <span className="text-sm">Color:</span>
                      <input
                       type="color"
                       value={color}
                       onChange={(e) => setColor(e.target.value)}
                       className="w-8 h-8 border-0 p-0 cursor-pointer"
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

        {/* Removed Zoom Controls */}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 justify-center">
           <Button size="sm" variant="destructive" onClick={clearCanvas} disabled={!letterheadLoaded}>
             <Trash2 className="h-4 w-4 mr-1" />
             Clear
           </Button>
           {/* Save button is handled by the parent component */}
        </div>
      </div>

      {/* Canvas Container - Contains the canvas, no pan/zoom or overflow here */}
      {/* Removed overflow-auto */}
      <div ref={containerRef} className="relative"
          // Removed onWheel handler
          style={{ cursor: getCursorStyle() }} // Apply cursor style
      >
          {/* Canvas element - drawing context operates at fixed logical size */}
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing} // Important to stop drawing if mouse leaves canvas
          // Removed all touch handlers
          className="bg-white shadow-lg"
          // Removed CSS transform for pan and zoom
          style={{
             // Explicitly set width/height for logical size
            width: '800px',
            height: '1100px',
             // Cursor is handled by the parent container div or set here if preferred
             cursor: 'inherit',
             // Setting display block can sometimes help with layout
             display: 'block',
          }}
        />
      </div>
    </div>
  )
}

export default PrescriptionCanvas;