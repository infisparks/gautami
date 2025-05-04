"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Eraser, Pencil, Save, Trash2 } from "lucide-react"
import { toast } from "react-toastify"

interface PrescriptionCanvasProps {
  letterheadUrl: string
  patientName: string
  patientId: string
  appointmentId: string
  onSave: (canvasBlob: Blob) => Promise<void>
  saving: boolean
  className?: string
}

type DrawingTool = "pen" | "eraser"

const PrescriptionCanvas: React.FC<PrescriptionCanvasProps> = ({
  letterheadUrl,
  patientName,
  patientId,
  appointmentId,
  onSave,
  saving,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState("#000000")
  const [lineWidth, setLineWidth] = useState(2)
  const [tool, setTool] = useState<DrawingTool>("pen")
  const [letterheadLoaded, setLetterheadLoaded] = useState(false)

  const colors = [
    "#000000", "#FF0000", "#0000FF", "#008000", "#800080", "#FFA500",
  ]

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

  const getLogicalCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null

      const rect = canvas.getBoundingClientRect()
      const logicalX = clientX - rect.left
      const logicalY = clientY - rect.top

      return { x: logicalX, y: logicalY }
    },
    [canvasRef],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      toast.error("Could not get canvas context.")
      return
    }

    // Set canvas logical size (A4-like aspect ratio)
    canvas.width = 800
    canvas.height = 1132 // Adjusted for better A4 ratio (800 * 1.414)

    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    contextRef.current = ctx

    const loadLetterhead = () => {
      const letterhead = new Image()
      letterhead.crossOrigin = "anonymous"
      letterhead.src = letterheadUrl
      letterhead.onload = () => {
        if (contextRef.current) {
          contextRef.current.clearRect(0, 0, canvas.width, canvas.height)
          contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height)
          setLetterheadLoaded(true)
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error loading letterhead:", e)
        toast.error("Failed to load letterhead. Using fallback background.")
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

    loadLetterhead()

    return () => {
      contextRef.current = null
    }
  }, [letterheadUrl])

  useEffect(() => {
    if (!contextRef.current) return
    contextRef.current.strokeStyle = tool === "eraser" ? "#ffffff" : color
    contextRef.current.lineWidth = tool === "eraser" ? lineWidth * 4 : lineWidth
    contextRef.current.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over"
  }, [color, lineWidth, tool])

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!contextRef.current || !letterheadLoaded || (tool !== "pen" && tool !== "eraser")) return

    setIsDrawing(true)
    const coords = getLogicalCoords(e.clientX, e.clientY)
    if (!coords) return
    contextRef.current.beginPath()
    contextRef.current.moveTo(coords.x, coords.y)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing || !contextRef.current || !letterheadLoaded || (tool !== "pen" && tool !== "eraser")) return

    const coords = getLogicalCoords(e.clientX, e.clientY)
    if (!coords) return
    contextRef.current.lineTo(coords.x, coords.y)
    contextRef.current.stroke()
  }

  const stopDrawing = () => {
    if (isDrawing && contextRef.current && (tool === "pen" || tool === "eraser")) {
      contextRef.current.closePath()
    }
    setIsDrawing(false)
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!contextRef.current || !letterheadLoaded || e.touches.length !== 1 || (tool !== "pen" && tool !== "eraser")) return

    setIsDrawing(true)
    const touch = e.touches[0]
    const coords = getLogicalCoords(touch.clientX, touch.clientY)
    if (!coords) return
    contextRef.current.beginPath()
    contextRef.current.moveTo(coords.x, coords.y)
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing || !contextRef.current || !letterheadLoaded || e.touches.length !== 1 || (tool !== "pen" && tool !== "eraser")) return

    const touch = e.touches[0]
    const coords = getLogicalCoords(touch.clientX, touch.clientY)
    if (!coords) return
    contextRef.current.lineTo(coords.x, coords.y)
    contextRef.current.stroke()
  }

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0 && isDrawing && contextRef.current && (tool === "pen" || tool === "eraser")) {
      contextRef.current.closePath()
      setIsDrawing(false)
    }
    if (e.touches.length > 0) {
      setIsDrawing(false)
    }
  }

  const handleTouchCancel = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDrawing && contextRef.current && (tool === "pen" || tool === "eraser")) {
      contextRef.current.closePath()
    }
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    if (!contextRef.current || !canvasRef.current) return

    if (window.confirm("Are you sure you want to clear the prescription?")) {
      const canvas = canvasRef.current
      contextRef.current.clearRect(0, 0, canvas.width, canvas.height)

      const letterhead = new Image()
      letterhead.crossOrigin = "anonymous"
      letterhead.src = letterheadUrl
      letterhead.onload = () => {
        if (contextRef.current) {
          contextRef.current.drawImage(letterhead, 0, 0, canvas.width, canvas.height)
        }
      }
      letterhead.onerror = (e) => {
        console.error("Error reloading letterhead:", e)
        toast.error("Failed to reload letterhead background.")
        if (contextRef.current && canvas) {
          contextRef.current.fillStyle = "#ffffff"
          contextRef.current.fillRect(0, 0, canvas.width, canvas.height)
          contextRef.current.strokeStyle = "#000000"
          contextRef.current.lineWidth = 2
          contextRef.current.strokeRect(5, 5, canvas.width - 10, canvas.height - 10)
        }
      }
    }
  }

  const handleSaveClick = () => {
    if (!canvasRef.current) {
      toast.error("Canvas not ready.")
      return
    }

    canvasRef.current.toBlob((blob) => {
      if (blob) {
        onSave(blob).catch(err => {
          console.error("Save failed in parent:", err)
          toast.error("Failed to save prescription.")
        })
      } else {
        toast.error("Failed to convert canvas to image.")
      }
    }, "image/png")
  }

  const getCursorStyle = () => {
    if (!letterheadLoaded) return 'wait'
    return 'crosshair'
  }

  return (
    <div className={`flex flex-col min-h-0 ${className}`}>
      {/* Control Bar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-2 w-full justify-center bg-white dark:bg-gray-800 p-3 z-10 sticky top-0 left-0 right-0">
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
        </div>

        {/* Color and Width Controls */}
        {(tool === "pen" || tool === "eraser") && (
          <div className="flex items-center gap-2 justify-center">
            <span className="text-sm">Width:</span>
            <Slider
              className="w-24"
              value={[lineWidth]}
              min={1}
              max={tool === "eraser" ? 5 : 10}
              step={1}
              onValueChange={(value) => setLineWidth(value[0])}
            />
            {tool === "pen" && (
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
                      onClick={() => { setTool("pen"); setColor(c); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 justify-center">
          <Button size="sm" variant="destructive" onClick={clearCanvas} disabled={!letterheadLoaded}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Canvas Container */}
      <div ref={containerRef} className="flex-1 relative overflow-auto" style={{ cursor: getCursorStyle() }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchCancel}
          className="absolute top-0 left-0"
          style={{
            width: '100%',
            height: '100%',
            maxWidth: '800px',
            maxHeight: '1132px',
            objectFit: 'contain',
            display: 'block',
            cursor: getCursorStyle(),
          }}
        />
      </div>
    </div>
  )
}

export default PrescriptionCanvas