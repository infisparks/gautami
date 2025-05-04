"use client"

import type React from "react"
import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Eraser,
  Pencil,
  Save,
  Trash2,
  X,
  Undo,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  PenTool,
  MoveHorizontal,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// Update the letterhead import and URL handling
const LETTERHEAD_URL = "/letterhead.png"

// In the PrescriptionCanvas props, add letterheadUrl
interface PrescriptionCanvasProps {
  letterheadUrl: string
  patientName: string
  patientId: string
  appointmentId: string
  isOpen: boolean
  onClose: () => void
  onSave: (imageUrl: string) => Promise<void>
}

// Remove the existing letterhead import
// Remove: import letterhead from "../public/letterhead.png"

type DrawingTool = "pen" | "eraser"
type PenStyle = "round" | "square" | "butt"

interface DrawAction {
  tool: DrawingTool
  points: { x: number; y: number }[]
  color: string
  lineWidth: number
  penStyle: PenStyle
}

const PrescriptionCanvas: React.FC<PrescriptionCanvasProps> = ({
  letterheadUrl,
  patientName,
  patientId,
  appointmentId,
  isOpen,
  onClose,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const letterheadCanvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null)
  const [letterheadContext, setLetterheadContext] = useState<CanvasRenderingContext2D | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [color, setColor] = useState("#000000")
  const [lineWidth, setLineWidth] = useState(2)
  const [tool, setTool] = useState<DrawingTool>("pen")
  const [penStyle, setPenStyle] = useState<PenStyle>("round")
  const [saving, setSaving] = useState(false)
  const [letterheadLoaded, setLetterheadLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [actions, setActions] = useState<DrawAction[]>([])
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null)
  const [redoActions, setRedoActions] = useState<DrawAction[]>([])
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })

  // Available colors for quick selection
  const colors = [
    "#000000", // Black
    "#FF0000", // Red
    "#0000FF", // Blue
    "#008000", // Green
    "#800080", // Purple
    "#FFA500", // Orange
  ]

  // Pen styles
  const penStyles = [
    { value: "round", label: "Round" },
    { value: "square", label: "Square" },
    { value: "butt", label: "Flat" },
  ]

  // Initialize canvas and load letterhead
  useEffect(() => {
    if (!isOpen) return

    // Set up main drawing canvas
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set up letterhead canvas (background layer)
    const letterheadCanvas = letterheadCanvasRef.current
    if (!letterheadCanvas) return

    const letterheadCtx = letterheadCanvas.getContext("2d")
    if (!letterheadCtx) return

    // Set canvas dimensions to match viewport
    const updateCanvasSize = () => {
      const container = containerRef.current
      if (!container) return

      // Use the full container size for the canvas
      const width = container.clientWidth - 40 // Subtract padding
      const height = container.clientHeight - 200 // Subtract space for controls

      // Set both canvases to the same size
      canvas.width = width
      canvas.height = height
      letterheadCanvas.width = width
      letterheadCanvas.height = height

      // Reset context properties after resize
      ctx.lineCap = penStyle
      ctx.lineJoin = "round"
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth

      // Redraw letterhead
      drawLetterhead()

      // Redraw all actions
      redrawCanvas()
    }

    // Initial size setup
    updateCanvasSize()

    // Handle window resize
    window.addEventListener("resize", updateCanvasSize)

    // Set context properties
    setContext(ctx)
    setLetterheadContext(letterheadCtx)

    // Load letterhead
    drawLetterhead()

    return () => {
      window.removeEventListener("resize", updateCanvasSize)
    }
  }, [isOpen, color, lineWidth, penStyle, zoom, patientName])

  // Update the drawLetterhead function to use the prop and support panning
  const drawLetterhead = () => {
    if (!letterheadCanvasRef.current || !letterheadContext) return

    const canvas = letterheadCanvasRef.current
    const ctx = letterheadContext

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Load and draw letterhead image
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = letterheadUrl // Use the prop instead of the import

    img.onload = () => {
      if (!canvas) return

      console.log("Letterhead loaded successfully", img.width, img.height)

      // Calculate dimensions to fit the letterhead properly
      const imgAspect = img.width / img.height
      const canvasAspect = canvas.width / canvas.height

      let drawWidth,
        drawHeight,
        offsetX = 0,
        offsetY = 0

      if (imgAspect > canvasAspect) {
        // Image is wider than canvas (relative to height)
        drawWidth = canvas.width
        drawHeight = canvas.width / imgAspect
        offsetY = (canvas.height - drawHeight) / 2
      } else {
        // Image is taller than canvas (relative to width)
        drawHeight = canvas.height
        drawWidth = canvas.height * imgAspect
        offsetX = (canvas.width - drawWidth) / 2
      }

      // Apply zoom and pan
      const zoomedWidth = drawWidth * zoom
      const zoomedHeight = drawHeight * zoom

      // Calculate center point for zooming
      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      // Apply pan offset
      const zoomedOffsetX = offsetX - (zoomedWidth - drawWidth) / 2 + panOffset.x
      const zoomedOffsetY = offsetY - (zoomedHeight - drawHeight) / 2 + panOffset.y

      // Draw the letterhead with proper sizing
      ctx.drawImage(img, zoomedOffsetX, zoomedOffsetY, zoomedWidth, zoomedHeight)

      // Add patient name and date at the top with proper positioning
      ctx.font = `${18 * zoom}px Arial`
      ctx.fillStyle = "#000000"
      ctx.fillText(`Patient: ${patientName}`, 50 * zoom + panOffset.x, 150 * zoom + panOffset.y)
      ctx.fillText(`Date: ${new Date().toLocaleDateString()}`, 50 * zoom + panOffset.x, 180 * zoom + panOffset.y)

      setLetterheadLoaded(true)
    }

    img.onerror = (e) => {
      console.error("Error loading letterhead:", e)
      // Create a basic white background with a border as fallback
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.strokeStyle = "#000000"
      ctx.lineWidth = 2
      ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)

      // Add patient info even if letterhead fails
      ctx.font = `${18 * zoom}px Arial`
      ctx.fillStyle = "#000000"
      ctx.fillText(`Patient: ${patientName}`, 50 * zoom + panOffset.x, 150 * zoom + panOffset.y)
      ctx.fillText(`Date: ${new Date().toLocaleDateString()}`, 50 * zoom + panOffset.y, 180 * zoom + panOffset.y)

      setLetterheadLoaded(true)
    }
  }

  // Update context when color, line width, or pen style changes
  useEffect(() => {
    if (!context) return
    context.strokeStyle = tool === "eraser" ? "#ffffff" : color
    context.lineWidth = tool === "eraser" ? lineWidth * 2 : lineWidth
    context.lineCap = penStyle
  }, [context, color, lineWidth, tool, penStyle])

  // Redraw the canvas with all saved actions
  const redrawCanvas = () => {
    if (!context || !canvasRef.current) return

    const canvas = canvasRef.current

    // Clear the drawing canvas
    context.clearRect(0, 0, canvas.width, canvas.height)

    // Redraw all actions
    actions.forEach((action) => {
      if (action.points.length < 2) return

      context.beginPath()
      context.strokeStyle = action.color
      context.lineWidth = action.lineWidth
      context.lineCap = action.penStyle

      // Apply zoom and pan to drawing coordinates
      const adjustedPoints = action.points.map((point) => ({
        x: point.x * zoom + panOffset.x,
        y: point.y * zoom + panOffset.y,
      }))

      context.moveTo(adjustedPoints[0].x, adjustedPoints[0].y)

      for (let i = 1; i < adjustedPoints.length; i++) {
        context.lineTo(adjustedPoints[i].x, adjustedPoints[i].y)
      }

      context.stroke()
      context.closePath()
    })
  }

  // Start panning the canvas
  const startPanning = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!letterheadLoaded) return

    setIsPanning(true)

    // Get coordinates
    let x, y
    if ("touches" in e) {
      // Touch event
      x = e.touches[0].clientX
      y = e.touches[0].clientY
    } else {
      // Mouse event
      x = e.nativeEvent.clientX
      y = e.nativeEvent.clientY
    }

    setLastMousePos({ x, y })
  }

  // Pan the canvas
  const doPanning = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPanning || !letterheadLoaded) return

    // Get coordinates
    let x, y
    if ("touches" in e) {
      // Touch event
      x = e.touches[0].clientX
      y = e.touches[0].clientY
    } else {
      // Mouse event
      x = e.nativeEvent.clientX
      y = e.nativeEvent.clientY
    }

    // Calculate the distance moved
    const dx = x - lastMousePos.x
    const dy = y - lastMousePos.y

    // Update pan offset
    setPanOffset((prev) => ({
      x: prev.x + dx,
      y: prev.y + dy,
    }))

    // Update last mouse position
    setLastMousePos({ x, y })

    // Redraw with new pan offset
    drawLetterhead()
    redrawCanvas()
  }

  // Stop panning
  const stopPanning = () => {
    setIsPanning(false)
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!context || !letterheadLoaded) return

    // If space key is held down or isPanning is true, do panning instead of drawing
    if (e.shiftKey || isPanning) {
      startPanning(e)
      return
    }

    setIsDrawing(true)

    // Get coordinates
    const canvas = canvasRef.current
    if (!canvas) return

    let x, y
    if ("touches" in e) {
      // Touch event
      const rect = canvas.getBoundingClientRect()
      x = e.touches[0].clientX - rect.left
      y = e.touches[0].clientY - rect.top
    } else {
      // Mouse event
      x = e.nativeEvent.offsetX
      y = e.nativeEvent.offsetY
    }

    // Adjust coordinates for zoom and pan (inverse transformation)
    const adjustedX = (x - panOffset.x) / zoom
    const adjustedY = (y - panOffset.y) / zoom

    // Start a new action with adjusted coordinates
    const newAction: DrawAction = {
      tool,
      points: [{ x: adjustedX, y: adjustedY }],
      color: tool === "eraser" ? "#ffffff" : color,
      lineWidth: tool === "eraser" ? lineWidth * 2 : lineWidth,
      penStyle,
    }

    setCurrentAction(newAction)

    // Clear redo stack when drawing new actions
    setRedoActions([])

    // Start drawing
    context.beginPath()
    context.moveTo(x, y) // Use screen coordinates for actual drawing
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      doPanning(e)
      return
    }

    if (!isDrawing || !context || !letterheadLoaded || !currentAction) return

    // Get coordinates
    const canvas = canvasRef.current
    if (!canvas) return

    let x, y
    if ("touches" in e) {
      // Touch event
      const rect = canvas.getBoundingClientRect()
      x = e.touches[0].clientX - rect.left
      y = e.touches[0].clientY - rect.top
    } else {
      // Mouse event
      x = e.nativeEvent.offsetX
      y = e.nativeEvent.offsetY
    }

    // Adjust coordinates for zoom and pan (inverse transformation)
    const adjustedX = (x - panOffset.x) / zoom
    const adjustedY = (y - panOffset.y) / zoom

    // Add adjusted point to current action
    setCurrentAction((prev) => {
      if (!prev) return null
      return {
        ...prev,
        points: [...prev.points, { x: adjustedX, y: adjustedY }],
      }
    })

    // Draw line using screen coordinates
    context.lineTo(x, y)
    context.stroke()
  }

  const stopDrawing = () => {
    if (isPanning) {
      stopPanning()
      return
    }

    if (!context || !currentAction) return

    setIsDrawing(false)
    context.closePath()

    // Add completed action to history
    if (currentAction.points.length > 1) {
      setActions((prev) => [...prev, currentAction])
    }

    setCurrentAction(null)
  }

  const handleUndo = () => {
    if (actions.length === 0) return

    // Remove last action and add to redo stack
    const lastAction = actions[actions.length - 1]
    setRedoActions((prev) => [...prev, lastAction])

    setActions((prev) => prev.slice(0, -1))

    // Redraw canvas
    redrawCanvas()
  }

  const handleRedo = () => {
    if (redoActions.length === 0) return

    // Get last redo action
    const actionToRedo = redoActions[redoActions.length - 1]

    // Add back to actions
    setActions((prev) => [...prev, actionToRedo])

    // Remove from redo stack
    setRedoActions((prev) => prev.slice(0, -1))

    // Redraw canvas
    redrawCanvas()
  }

  const clearCanvas = () => {
    if (!context || !canvasRef.current) return

    // Confirm before clearing
    if (window.confirm("Are you sure you want to clear the prescription?")) {
      // Clear the drawing canvas
      const canvas = canvasRef.current
      context.clearRect(0, 0, canvas.width, canvas.height)

      // Clear action history
      setActions([])
      setRedoActions([])
    }
  }

  const handleZoomIn = () => {
    setZoom((prev) => {
      const newZoom = Math.min(prev + 0.1, 3)
      return newZoom
    })
  }

  const handleZoomOut = () => {
    setZoom((prev) => {
      const newZoom = Math.max(prev - 0.1, 0.5)
      return newZoom
    })
  }

  const handleResetZoom = () => {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
  }

  const handleResetPan = () => {
    setPanOffset({ x: 0, y: 0 })
  }

  const handleSave = async () => {
    if (!canvasRef.current || !letterheadCanvasRef.current) return

    try {
      setSaving(true)

      // Create a temporary canvas to combine both layers
      const tempCanvas = document.createElement("canvas")
      const tempCtx = tempCanvas.getContext("2d")
      if (!tempCtx) return

      // Set dimensions
      tempCanvas.width = canvasRef.current.width
      tempCanvas.height = canvasRef.current.height

      // Draw letterhead layer
      tempCtx.drawImage(letterheadCanvasRef.current, 0, 0)

      // Draw drawing layer
      tempCtx.drawImage(canvasRef.current, 0, 0)

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        tempCanvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error("Canvas to Blob conversion failed"))
          }
        }, "image/png")
      })

      // Create a unique filename
      const filename = `prescriptions/${patientId}_${appointmentId}_${Date.now()}.png`

      // Upload to Firebase Storage
      const imageUrl = await uploadToFirebaseStorage(blob, filename)

      // Save the URL to the patient record
      await onSave(imageUrl)

      // Close the dialog
      onClose()
    } catch (error) {
      console.error("Error saving prescription:", error)
      alert("Failed to save prescription. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // This function would be implemented with your Firebase storage
  const uploadToFirebaseStorage = async (blob: Blob, filename: string): Promise<string> => {
    // This is a placeholder - you'll need to implement this with your Firebase setup
    // For example:
    // const storageRef = ref(storage, filename)
    // await uploadBytes(storageRef, blob)
    // return await getDownloadURL(storageRef)

    // For now, we'll just return a mock URL
    return `https://firebasestorage.googleapis.com/v0/b/your-project.appspot.com/o/${encodeURIComponent(filename)}?alt=media`
  }

  // Update the useEffect for letterhead loading
  useEffect(() => {
    if (isOpen && letterheadContext) {
      drawLetterhead()
    }
  }, [isOpen, letterheadContext, zoom, panOffset, patientName])

  // Redraw canvas when zoom or pan changes
  useEffect(() => {
    if (isOpen) {
      redrawCanvas()
    }
  }, [isOpen, zoom, panOffset])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return

      // Ctrl+Z for undo
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault()
        handleUndo()
      }

      // Ctrl+Y for redo
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault()
        handleRedo()
      }

      // + for zoom in
      if (e.key === "+" || e.key === "=") {
        e.preventDefault()
        handleZoomIn()
      }

      // - for zoom out
      if (e.key === "-" || e.key === "_") {
        e.preventDefault()
        handleZoomOut()
      }

      // 0 for reset zoom
      if (e.key === "0") {
        e.preventDefault()
        handleResetZoom()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, actions, redoActions])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-4">
        <DialogHeader>
          <DialogTitle>Write Prescription for {patientName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center overflow-auto flex-grow" ref={containerRef}>
          <div className="flex flex-wrap gap-2 mb-4 w-full justify-center">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")}>
                <Pencil className="h-4 w-4 mr-1" />
                Pen
              </Button>
              <Button size="sm" variant={tool === "eraser" ? "default" : "outline"} onClick={() => setTool("eraser")}>
                <Eraser className="h-4 w-4 mr-1" />
                Eraser
              </Button>
              <Select value={penStyle} onValueChange={(value) => setPenStyle(value as PenStyle)}>
                <SelectTrigger className="w-[120px] h-9">
                  <PenTool className="h-4 w-4 mr-1" />
                  <SelectValue placeholder="Pen Style" />
                </SelectTrigger>
                <SelectContent>
                  {penStyles.map((style) => (
                    <SelectItem key={style.value} value={style.value}>
                      {style.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm">Line Width:</span>
              <Slider
                className="w-24"
                value={[lineWidth]}
                min={1}
                max={10}
                step={1}
                onValueChange={(value) => setLineWidth(value[0])}
              />
            </div>

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
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleUndo} disabled={actions.length === 0}>
                <Undo className="h-4 w-4 mr-1" />
                Undo
              </Button>
              <Button size="sm" variant="outline" onClick={handleRedo} disabled={redoActions.length === 0}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Redo
              </Button>
              <Button size="sm" variant="destructive" onClick={clearCanvas}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={handleResetZoom}>
                {Math.round(zoom * 100)}%
              </Button>
              <Button size="sm" variant={isPanning ? "default" : "outline"} onClick={() => setIsPanning(!isPanning)}>
                <MoveHorizontal className="h-4 w-4 mr-1" />
                Move
              </Button>
              <Button size="sm" variant="outline" onClick={handleResetPan}>
                <MoveHorizontal className="h-4 w-4" />
                Reset Pan
              </Button>
            </div>
          </div>

          <div
            className="relative overflow-auto rounded-md"
            style={{
              width: "100%",
              height: canvasRef.current?.height ? `${canvasRef.current.height + 20}px` : "100%",
              maxHeight: "calc(100vh - 300px)",
            }}
          >
            {/* Letterhead canvas (background layer) */}
            <canvas
              ref={letterheadCanvasRef}
              className="absolute top-0 left-0 bg-white z-0"
              style={{ width: canvasRef.current?.width || "100%", height: "auto" }}
            />

            {/* Drawing canvas (foreground layer) */}
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="absolute top-0 left-0 touch-none z-10"
              style={{
                width: canvasRef.current?.width || "100%",
                height: "auto",
                background: "transparent",
                cursor: isPanning ? "move" : tool === "pen" ? "crosshair" : "default",
              }}
            />
          </div>

          <div className="mt-2 text-sm text-muted-foreground">
            <p>Click the Move button or hold Shift + drag to pan the letterhead. Use zoom buttons to zoom in/out.</p>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !letterheadLoaded}>
            <Save className="h-4 w-4 mr-1" />
            {saving ? "Saving..." : "Save & Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PrescriptionCanvas
