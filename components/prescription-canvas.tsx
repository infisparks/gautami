// components/prescription-canvas.tsx
"use client"

import React from "react"
import { useRef, useState, useEffect, useCallback, useImperativeHandle } from "react" // Import useImperativeHandle
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Eraser, Pencil, Save, Trash2, Move, ZoomIn, ZoomOut } from "lucide-react"
import { toast } from "react-toastify"

interface PrescriptionCanvasProps {
  letterheadUrl: string;
  patientName: string; // Not drawn, but keeping
  patientId: string; // Not drawn, but keeping
  appointmentId: string; // Not drawn, but keeping
  onSave?: (canvasBlob: Blob) => Promise<void>; // Made optional, modal handles save differently
  saving?: boolean; // Made optional
  initialBlob?: Blob | null; // New prop for initial drawing data (for modal)

  // Props to allow external control of tools/state (for modal)
  tool?: "pen" | "eraser";
  color?: string;
  lineWidth?: number;
  disabled?: boolean; // Disable interaction (e.g., while saving)
}

// Define the methods we want to expose via ref
export interface PrescriptionCanvasRef {
  getCanvasBlob: () => Promise<Blob | null>;
  resetView: () => void;
  clearDrawing: () => Promise<void>; // Method to clear drawing and redraw base
}

const PrescriptionCanvas = React.forwardRef<PrescriptionCanvasRef, PrescriptionCanvasProps>(({
  letterheadUrl,
  patientName,
  patientId,
  appointmentId,
  onSave, // Optional now
  saving, // Optional now
  initialBlob = null, // Default null
  tool: externalTool, // Use alias for prop
  color: externalColor, // Use alias for prop
  lineWidth: externalLineWidth, // Use alias for prop
  disabled = false, // Default false
}, ref) => {
  const canvasElementRef = useRef<HTMLCanvasElement>(null); // Use internal ref
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the container div

  // Internal state for tool, color, lineWidth (used if not controlled externally)
  const [internalTool, setInternalTool] = useState<"pen" | "eraser">("pen");
   const [internalColor, setInternalColor] = useState("#000000");
   const [internalLineWidth, setInternalLineWidth] = useState(2);

   // Determine current active state (prefer external props over internal state)
   const currentTool = externalTool !== undefined ? externalTool : internalTool;
   const currentColor = externalColor !== undefined ? externalColor : internalColor;
   const currentLineWidth = externalLineWidth !== undefined ? externalLineWidth : internalLineWidth;


  const [isDrawing, setIsDrawing] = useState(false) // For single-touch drawing
  const [isPanning, setIsPanning] = useState(false); // For two-touch panning
  const [letterheadLoaded, setLetterheadLoaded] = useState(false) // Tracks if initial background/blob is loaded

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

  // Available colors for quick selection (used by internal controls)
  const colors = [
    "#000000", "#FF0000", "#0000FF", "#008000", "#800080", "#FFA500",
  ]

  // Define the logical canvas dimensions (A4 aspect ratio)
  const logicalCanvasWidth = 800;
  const logicalCanvasHeight = 1100;

   // Expose methods via ref
   useImperativeHandle(ref, () => ({
       getCanvasBlob: async () => {
           return new Promise((resolve) => {
               if (canvasElementRef.current) {
                   canvasElementRef.current.toBlob(resolve, 'image/png');
               } else {
                   resolve(null);
               }
           });
       },
       resetView: () => {
           setScale(1);
           setPanOffset({ x: 0, y: 0 });
       },
       clearDrawing: async () => {
           if (!contextRef.current || !canvasElementRef.current) return;
           const canvas = canvasElementRef.current;
           const ctx = contextRef.current;

           // Clear the drawing area on the logical canvas
           ctx.clearRect(0, 0, canvas.width, canvas.height);

           // Redraw the base content (letterhead) onto the logical canvas
           const letterhead = new Image();
           letterhead.crossOrigin = "anonymous";
           letterhead.src = letterheadUrl;
           return new Promise<void>((resolve) => {
               letterhead.onload = () => {
                   if (contextRef.current) {
                       contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height);
                   }
                   resolve();
               };
               letterhead.onerror = (e) => {
                   console.error("Error reloading letterhead after clear:", e);
                   // Draw fallback background on logical canvas
                   if (contextRef.current && canvas) {
                     contextRef.current.fillStyle = "#ffffff";
                     contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
                     contextRef.current.strokeStyle = "#000000";
                     contextRef.current.lineWidth = 2;
                     contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
                   }
                   resolve(); // Resolve even on error
               };
           });

           // Reset pan and zoom state internally
           setScale(1);
           setPanOffset({ x: 0, y: 0 });
       }
   }));


  // Function to get logical coordinates from screen/client coordinates
  // Now accounts for pan and zoom (CSS transform)
  const getLogicalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasElementRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      // Get coordinates relative to the canvas display element
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;

      // Apply the inverse of the CSS transform
      const logicalX = (screenX - panOffset.x) / scale;
      const logicalY = (screenY - panOffset.y) / scale;

      return { x: logicalX, y: logicalY } // Use raw logical coords for drawing
    },
    [canvasElementRef, panOffset, scale], // Dependencies include panOffset and scale, and the internal ref
  )


  // Initialize canvas and load letterhead or initial blob
  useEffect(() => {
    const canvas = canvasElementRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      toast.error("Could not get canvas context.")
      return
    }
    contextRef.current = ctx // Store context in ref

    // Set canvas logical dimensions (the internal drawing surface size)
    canvas.width = logicalCanvasWidth;
    canvas.height = logicalCanvasHeight;

    // Set initial context properties for drawing
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    // Other drawing properties (strokeStyle, lineWidth, globalCompositeOperation) will be set by the tool effect

    const loadImage = (src: string, isBlob = false, cleanupUrl = false) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // Important for drawing external images
        img.onload = () => {
            if (contextRef.current) {
                contextRef.current.clearRect(0, 0, canvas.width, canvas.height);
                contextRef.current.drawImage(img, 0, 0, canvas.width, canvas.height);
                setLetterheadLoaded(true); // Indicate ready for drawing/interacting
                 if (cleanupUrl && src.startsWith('blob:')) {
                    URL.revokeObjectURL(src); // Clean up blob URL after successful load
                }
            }
        };
        img.onerror = (e) => {
            console.error(`Error loading ${isBlob ? 'blob' : 'letterhead'}:`, e);
             if (cleanupUrl && src.startsWith('blob:')) {
                URL.revokeObjectURL(src); // Clean up blob URL even on error
            }
            toast.error(`Failed to load ${isBlob ? 'previous drawing' : 'letterhead'}. Using fallback background.`);
            // Draw fallback background on logical canvas
            if (contextRef.current && canvas) {
                contextRef.current.fillStyle = "#ffffff";
                contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
                contextRef.current.strokeStyle = "#000000";
                contextRef.current.lineWidth = 2;
                contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
            }
            setLetterheadLoaded(true); // Still set loaded, even with fallback
        };
         img.src = src; // Set src after defining onload/onerror
    };


    // Decide what to load initially: initialBlob takes precedence
    if (initialBlob) {
        loadImage(URL.createObjectURL(initialBlob), true, true); // Load blob, cleanup URL after load/error
    } else {
        loadImage(letterheadUrl); // Load letterhead
    }


    // Clean up context on unmount
    return () => {
      contextRef.current = null;
    };
  }, [letterheadUrl, logicalCanvasWidth, logicalCanvasHeight, initialBlob]) // Added initialBlob dependency


  // Update context properties when current tool, color, or line width changes
  // These properties are applied to the *logical* drawing context
  useEffect(() => {
    if (!contextRef.current) return
    contextRef.current.strokeStyle = currentTool === "eraser" ? "#ffffff" : currentColor
    // Line width applied directly to context
    // Eraser is wider in logical pixels
    contextRef.current.lineWidth = currentTool === "eraser" ? currentLineWidth * 4 : currentLineWidth;
    contextRef.current.globalCompositeOperation = currentTool === "eraser" ? "destination-out" : "source-over";
  }, [currentColor, currentLineWidth, currentTool]) // Dependencies on current state


  // --- Mouse Handlers ---
  // Mouse handlers are for drawing/erasing only
   const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
       if (disabled || isPanning || !letterheadLoaded) return; // Disable if disabled, panning, or not loaded
       e.preventDefault();

       if (currentTool === "pen" || currentTool === "eraser") {
           setIsDrawing(true);
           const coords = getLogicalCoords(e.clientX, e.clientY);
           if (!coords) return;
           if (contextRef.current) { // Ensure context is available before drawing
               contextRef.current.beginPath();
               contextRef.current.moveTo(coords.x, coords.y);
           }
       }
   }

   const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
       if (disabled || isPanning || !isDrawing || !letterheadLoaded || (currentTool !== "pen" && currentTool !== "eraser")) return; // Add disabled check
       e.preventDefault();

       const coords = getLogicalCoords(e.clientX, e.clientY);
       if (!coords || !contextRef.current) return; // Ensure coords and context are available
       contextRef.current.lineTo(coords.x, coords.y);
       contextRef.current.stroke();
   }

  const stopDrawing = () => {
    if (isDrawing && contextRef.current) {
      contextRef.current.closePath();
      setIsDrawing(false);
    }
    // Reset pan/pinch refs regardless of drawing state
    lastPanPositionRef.current = null;
    initialPinchDistanceRef.current = null;
    initialPinchLogicalMidpointRef.current = null;
    initialPanOffsetRef.current = null;
    initialScaleRef.current = null;
    setIsPanning(false); // Ensure panning state is reset
  }

  // --- Touch Handlers ---
   const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
       if (disabled || !letterheadLoaded) return; // Disable all touch interaction if disabled or not loaded
       e.preventDefault();

       const touches = e.touches;

       if (touches.length === 1) {
           // Single touch: Start drawing if currentTool is pen/eraser
           if (currentTool === "pen" || currentTool === "eraser") {
               setIsDrawing(true);
               setIsPanning(false); // Ensure not panning state
               const coords = getLogicalCoords(touches[0].clientX, touches[0].clientY);
               if (!coords || !contextRef.current) return;
               contextRef.current.beginPath();
               contextRef.current.moveTo(coords.x, coords.y);
           }
       } else if (touches.length === 2) {
           // Two touches: Start panning/pinching
           setIsDrawing(false); // Stop drawing if active
           setIsPanning(true);
           lastPanPositionRef.current = { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
           initialPanOffsetRef.current = { ...panOffset };
           initialScaleRef.current = scale;

           const dx = touches[0].clientX - touches[1].clientX;
           const dy = touches[0].clientY - touches[1].clientY;
           initialPinchDistanceRef.current = Math.sqrt(dx * dx + dy * dy);

           const midX = (touches[0].clientX + touches[1].clientX) / 2;
           const midY = (touches[0].clientY + touches[1].clientY) / 2;
           initialPinchLogicalMidpointRef.current = getLogicalCoords(midX, midY);
       }
   };

   const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
       if (disabled || !letterheadLoaded) return; // Disable all touch interaction if disabled or not loaded
       e.preventDefault();
       if (!contextRef.current) return;

       const touches = e.touches;

       if (touches.length === 1 && isDrawing && (currentTool === "pen" || currentTool === "eraser")) {
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
               return;
           }

           let newScale = initialScale * (currentPinchDistance / initialPinchDistance);
           newScale = Math.max(minScale, Math.min(maxScale, newScale)); // Clamp scale

           // Calculate pan adjustment needed to keep the initial logical midpoint under the current screen midpoint
           const canvasRect = canvasElementRef.current?.getBoundingClientRect();
           if (!canvasRect) return;

           const midScreenXRelativeToCanvas = currentMidX - canvasRect.left;
           const midScreenYRelativeToCanvas = currentMidY - canvasRect.top;

           const newPanX = midScreenXRelativeToCanvas - (initialLogicalMidpoint.x * newScale);
           const newPanY = midScreenYRelativeToCanvas - (initialLogicalMidpoint.y * newScale);

           // Simple clamping: Ensure panOffset keeps the canvas within some bounds relative to the container size
           const container = containerRef.current;
           const containerRect = container?.getBoundingClientRect();

           if(containerRect) {
               const maxPanX = Math.max(0, newScale * logicalCanvasWidth - containerRect.width);
               const maxPanY = Math.max(0, newScale * logicalCanvasHeight - containerRect.height);

               // Clamp pan within container bounds, allowing some overshoot for feel
               const boundaryAllowance = 0.5; // Allow panning up to 50% of container size beyond edge
               const boundedPanX = Math.max(-maxPanX - containerRect.width * boundaryAllowance, Math.min(containerRect.width * boundaryAllowance, newPanX));
               const boundedPanY = Math.max(-maxPanY - containerRect.height * boundaryAllowance, Math.min(containerRect.height * boundaryAllowance, newPanY));


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
       if (disabled) return; // Allow touch end event but don't process states based on tool/pan
       // Note: touchEnd fires for *each* finger lifting off.
       // Check touches.length *after* the finger is lifted to see how many are left.

       if (e.touches.length === 0) {
           // All fingers lifted - end drawing/panning
           setIsDrawing(false);
           setIsPanning(false);
           if (contextRef.current && (currentTool === "pen" || currentTool === "eraser")) {
              contextRef.current.closePath();
            }
           // Reset refs
           lastPanPositionRef.current = null;
           initialPinchDistanceRef.current = null;
           initialPinchLogicalMidpointRef.current = null;
           initialPanOffsetRef.current = null;
           initialScaleRef.current = null;
       } else if (e.touches.length === 1) {
           // One finger remaining - transition from pan/zoom
           if (isPanning) {
               setIsPanning(false);
               // Reset refs relevant to the just-ended two-finger gesture
               initialPinchDistanceRef.current = null;
               initialPinchLogicalMidpointRef.current = null;
               initialPanOffsetRef.current = null;
               initialScaleRef.current = null;
           }
       }
   };


  // This handleSave function is used for the *embedded* view's save button
   // The modal view will use the getCanvasBlob method exposed via ref
  const handleSaveClick = () => {
     if (!canvasElementRef.current) {
       toast.error("Canvas not ready.");
       return;
     }

     // The canvas.toBlob() method captures the *logical* content of the canvas.
     canvasElementRef.current.toBlob((blob) => {
       if (blob && onSave) { // Check if onSave prop is provided
         onSave(blob).catch(err => {
           console.error("Save failed in parent:", err);
           toast.error("Failed to save prescription.");
         });
       } else if (!onSave) {
         toast.warning("Save handler not provided.");
       } else {
         toast.error("Failed to convert canvas to image.");
       }
     }, "image/png");
   }


  // Determine cursor style based on tool and state
  const getCursorStyle = () => {
      if (!letterheadLoaded) return 'wait';
     if (disabled) return 'not-allowed'; // Indicate disabled state
     if (isPanning) return 'grabbing'; // Indicate panning is active
      // Mouse cursor is crosshair for drawing/erasing tools when enabled
     if (currentTool === "pen" || currentTool === "eraser") {
         return 'crosshair';
     }
     // Default cursor for other potential tools (though mouse is drawing only)
     return 'default';
   };


  return (
    <div className="flex flex-col items-center p-4 w-full h-full relative">
      {/* Control Bar - Rendered ONLY if external tool control is NOT provided (i.e., in embedded mode) */}
       {externalTool === undefined && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4 w-full justify-center bg-white shadow-md dark:bg-gray-800 p-3 rounded-md z-10 sticky top-0 left-0 right-0">

          {/* Drawing Tools */}
          <div className="flex items-center gap-2 justify-center">
            <Button size="sm" variant={internalTool === "pen" ? "default" : "outline"} onClick={() => setInternalTool("pen")} disabled={isPanning || isDrawing || !letterheadLoaded}>
              <Pencil className="h-4 w-4 mr-1" />
              Pen
            </Button>
            <Button size="sm" variant={internalTool === "eraser" ? "default" : "outline"} onClick={() => setInternalTool("eraser")} disabled={isPanning || isDrawing || !letterheadLoaded}>
              <Eraser className="h-4 w-4 mr-1" />
              Eraser
            </Button>
          </div>

          {/* Color and Width Controls */}
           {(internalTool === "pen" || internalTool === "eraser") && (
             <div className="flex items-center gap-2 justify-center">
                <span className="text-sm">Width:</span>
                <Slider
                  className="w-24"
                  value={[internalLineWidth]}
                  min={1}
                  max={internalTool === "eraser" ? 10 : 10} // Adjusted max width for eraser
                  step={1}
                  onValueChange={(value) => setInternalLineWidth(value[0])}
                  disabled={isPanning || isDrawing || !letterheadLoaded} // Disabled if touch is active or not loaded
                />

                {internalTool === "pen" && ( // Only show color picker for Pen tool
                   <div className="flex items-center gap-2">
                      <span className="text-sm">Color:</span>
                       <input
                        type="color"
                        value={internalColor}
                        onChange={(e) => setInternalColor(e.target.value)}
                        className="w-8 h-8 border-0 p-0 cursor-pointer"
                        disabled={isPanning || isDrawing || !letterheadLoaded} // Disabled if touch is active or not loaded
                       />
                       <div className="flex gap-1">
                          {colors.map((c) => (
                           <div
                            key={c}
                            className="w-6 h-6 rounded-full cursor-pointer border border-gray-300"
                            style={{ backgroundColor: c }}
                            onClick={() => { setInternalTool("pen"); setInternalColor(c); }} // Select pen tool when choosing color
                            />
                          ))}
                       </div>
                   </div>
                )}
              </div>
          )}


          {/* Action Buttons */}
          <div className="flex items-center gap-2 justify-center">
            <Button size="sm" variant="destructive" onClick={() => { if (window.confirm("Are you sure you want to clear the prescription?")) { if (canvasElementRef.current) { const api = (ref as React.RefObject<PrescriptionCanvasRef>).current; api?.clearDrawing(); api?.resetView(); } } }} disabled={!letterheadLoaded || isPanning || isDrawing}> {/* Call exposed methods */}
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
            {/* Save button is handled by the parent component (if onSave is provided) */}
            {onSave && (
               <Button onClick={handleSaveClick} disabled={!letterheadLoaded || saving || isPanning || isDrawing}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Saving..." : "Save Prescription"}
               </Button>
            )}
          </div>
        </div>
       )}


      {/* Canvas Container - This div is the viewport */}
      <div
          ref={containerRef}
          className="relative bg-gray-200 dark:bg-gray-700 rounded-md overflow-hidden"
          // Adjust container size based on whether external controls are used (modal mode)
          style={{
             width: 'calc(100% - 32px)', // Default for embedded
             height: externalTool === undefined ? 'calc(100vh - 200px)' : '100%', // Adjust height if external controls (in modal)
             maxWidth: externalTool === undefined ? '800px' : '100%', // Adjust max width
             maxHeight: externalTool === undefined ? '1100px' : '100%', // Adjust max height
            cursor: getCursorStyle()
         }}
      >
          {/* Canvas element - logical drawing surface */}
        <canvas
           ref={canvasElementRef} // Attach the internal ref here
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}

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
    </div>
  )
});

PrescriptionCanvas.displayName = "PrescriptionCanvas"; // Add display name for forwardRef

export default PrescriptionCanvas;