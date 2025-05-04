"use client"

import type React from "react"
import { useRef, useState, useEffect, useCallback } from "react"
import { Eraser, Pencil, Save, Trash2, Undo, ZoomIn, ZoomOut, RotateCcw, PenTool, MoveHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { storage } from "@/lib/firebase"
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"

// fallback asset that lives inside your repo
import fallbackLetterhead from "@/public/letterhead.png"

type SrcLike = string | { src: string } // next-image static import object

/* ───────────────────────── Types ───────────────────────── */
interface PrescriptionCanvasProps {
  /** You can pass either string or StaticImageData. If undefined, we use the bundled fallback. */
  letterheadUrl?: SrcLike
  patientName: string
  patientId: string
  appointmentId: string
  onSave: (imageUrl: string) => Promise<void>
}

type DrawingTool = "pen" | "eraser" | "move"
type PenStyle = "round" | "square" | "butt"

interface DrawAction {
  tool: "pen" | "eraser"
  points: { x: number; y: number }[]
  color: string
  lineWidth: number
  penStyle: PenStyle
}

interface TouchPoint {
  x: number
  y: number
  id: number
}

/* ───────────────────────── Helpers ───────────────────────── */
const toPlainSrc = (srcLike?: SrcLike): string =>
  !srcLike
    ? (fallbackLetterhead as unknown as { src: string }).src
    : typeof srcLike === "string"
      ? srcLike
      : srcLike.src

/* ───────────────────────── Component ───────────────────────── */
const PrescriptionCanvas: React.FC<PrescriptionCanvasProps> = ({
  letterheadUrl,
  patientName,
  patientId,
  appointmentId,
  onSave,
}) => {
  /* ---------- refs ---------- */
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bgRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const drawCtx = useRef<CanvasRenderingContext2D | null>(null)
  const bgCtx = useRef<CanvasRenderingContext2D | null>(null)

  /* ---------- state ---------- */
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState("#000000")
  const [lineWidth, setLineWidth] = useState(2)
  const [tool, setTool] = useState<DrawingTool>("pen")
  const [penStyle, setPenStyle] = useState<PenStyle>("round")
  const [saving, setSaving] = useState(false)
  const [bgReady, setBgReady] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [actions, setActions] = useState<DrawAction[]>([])
  const [current, setCurrent] = useState<DrawAction | null>(null)
  const [redos, setRedos] = useState<DrawAction[]>([])
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 })
  const [touchPoints, setTouchPoints] = useState<TouchPoint[]>([])
  const [initialTouchDistance, setInitialTouchDistance] = useState<number | null>(null)
  const [initialPan, setInitialPan] = useState({ x: 0, y: 0 })

  /* ---------- constants ---------- */
  const palette = ["#000", "#F00", "#00F", "#080", "#808", "#FA0"]
  const capStyles = [
    { value: "round", label: "Round" },
    { value: "square", label: "Square" },
    { value: "butt", label: "Flat" },
  ]

  /* =================================================================================
   *  draw letter-head  (coerces StaticImageData → string, and retries without CORS if needed)
   * ================================================================================= */
  const drawLetterhead = useCallback(() => {
    const canvas = bgRef.current
    const ctx = bgCtx.current
    if (!canvas || !ctx) return

    const src = toPlainSrc(letterheadUrl)

    const paint = (url: string) => {
      const img = new Image()
      img.src = url
      img.crossOrigin = "anonymous"
      img.onload = () => {
        // clear
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // fit
        const imgAspect = img.width / img.height
        const canvasAspect = canvas.width / canvas.height
        let dw,
          dh,
          ox = 0,
          oy = 0
        if (imgAspect > canvasAspect) {
          dw = canvas.width
          dh = canvas.width / imgAspect
          oy = (canvas.height - dh) / 2
        } else {
          dh = canvas.height
          dw = canvas.height * imgAspect
          ox = (canvas.width - dw) / 2
        }

        const zW = dw * zoom
        const zH = dh * zoom
        const zX = ox - (zW - dw) / 2 + pan.x
        const zY = oy - (zH - dh) / 2 + pan.y
        ctx.drawImage(img, zX, zY, zW, zH)

        // Removed patient name and date display

        setBgReady(true)
      }

      img.onerror = () => {
        // try again via fetch → dataURL to sidestep CORS blocks
        fetch(url)
          .then((r) => r.blob())
          .then((b) => {
            paint(URL.createObjectURL(b))
          })
          .catch((err) => {
            console.error("letterhead load error:", err)
            ctx.fillStyle = "#fff"
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            setBgReady(true)
          })
      }
    }

    paint(src)
  }, [letterheadUrl, zoom, pan])

  /* =================================================================================
   *  redraw user strokes
   * ================================================================================= */
  const redrawStrokes = useCallback(() => {
    const ctx = drawCtx.current,
      canvas = canvasRef.current
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    actions.forEach((a) => {
      if (a.points.length < 2) return
      ctx.beginPath()
      ctx.strokeStyle = a.color
      ctx.lineWidth = a.lineWidth
      ctx.lineCap = a.penStyle
      const pts = a.points.map((p) => ({
        x: p.x * zoom + pan.x,
        y: p.y * zoom + pan.y,
      }))
      ctx.moveTo(pts[0].x, pts[0].y)
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y))
      ctx.stroke()
    })
  }, [actions, zoom, pan])

  /* =================================================================================
   *  init canvases
   * ================================================================================= */
  useEffect(() => {
    const c = canvasRef.current
    const bg = bgRef.current
    const wrap = containerRef.current
    if (!(c && bg && wrap)) return
    drawCtx.current = c.getContext("2d")
    bgCtx.current = bg.getContext("2d")

    const resize = () => {
      const w = wrap.clientWidth || window.innerWidth
      const h = (wrap.clientHeight || window.innerHeight) - 100
      c.width = bg.width = w
      c.height = bg.height = h
      drawLetterhead()
      redrawStrokes()
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* keep brush params in sync */
  useEffect(() => {
    const ctx = drawCtx.current
    if (!ctx) return
    ctx.strokeStyle = tool === "eraser" ? "#fff" : color
    ctx.lineWidth = tool === "eraser" ? lineWidth * 2 : lineWidth
    ctx.lineCap = penStyle
  }, [tool, color, lineWidth, penStyle])

  /* re-draw on transform change */
  useEffect(() => {
    if (bgCtx.current) drawLetterhead()
  }, [drawLetterhead])
  useEffect(() => redrawStrokes(), [redrawStrokes])

  /* =================================================================================
   *  pointer helpers
   * ================================================================================= */
  const toCanvas = (sx: number, sy: number) => ({
    x: (sx - pan.x) / zoom,
    y: (sy - pan.y) / zoom,
  })

  const getDistance = (p1: TouchPoint, p2: TouchPoint) => {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y)
  }

  const getMidpoint = (p1: TouchPoint, p2: TouchPoint) => {
    return {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2,
    }
  }

  /* =================================================================================
   *  mouse + touch handlers
   * ================================================================================= */
  const startDraw = (sx: number, sy: number) => {
    if (tool === "move") {
      setLastMouse({ x: sx, y: sy })
      return
    }
    if (!drawCtx.current || !bgReady) return
    setIsDrawing(true)
    const { x, y } = toCanvas(sx, sy)
    const a: DrawAction = {
      tool,
      points: [{ x, y }],
      color: tool === "eraser" ? "#fff" : color,
      lineWidth: tool === "eraser" ? lineWidth * 2 : lineWidth,
      penStyle,
    }
    setCurrent(a)
    setRedos([])

    // Fix for drawing position
    if (drawCtx.current) {
      drawCtx.current.beginPath()
      drawCtx.current.moveTo(sx, sy)
    }
  }

  const moveDraw = (sx: number, sy: number) => {
    if (tool === "move" && isDrawing === false) {
      const dx = sx - lastMouse.x
      const dy = sy - lastMouse.y
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
      setLastMouse({ x: sx, y: sy })
      return
    }
    if (!isDrawing || !drawCtx.current || !current) return

    // Fix for drawing position
    const { x, y } = toCanvas(sx, sy)
    setCurrent((prev) => (prev ? { ...prev, points: [...prev.points, { x, y }] } : prev))

    if (drawCtx.current) {
      drawCtx.current.lineTo(sx, sy)
      drawCtx.current.stroke()
    }
  }

  const endDraw = () => {
    if (!isDrawing || !current) return
    setIsDrawing(false)
    if (drawCtx.current) {
      drawCtx.current.closePath()
    }
    if (current.points.length > 1) {
      setActions((a) => [...a, current])
    }
    setCurrent(null)
  }

  /* mouse */
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    startDraw(x, y)
  }

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    moveDraw(x, y)
  }

  /* touch */
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault() // Prevent scrolling
    const rect = e.currentTarget.getBoundingClientRect()

    // Convert touch list to our TouchPoint array
    const newTouchPoints: TouchPoint[] = Array.from(e.touches).map((touch) => ({
      id: touch.identifier,
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }))

    setTouchPoints(newTouchPoints)

    if (newTouchPoints.length === 2) {
      // Two finger gesture starting
      setInitialTouchDistance(getDistance(newTouchPoints[0], newTouchPoints[1]))
      setInitialPan(pan)

      // If we were drawing, end it
      if (isDrawing) {
        endDraw()
      }
    } else if (newTouchPoints.length === 1) {
      // Single touch - start drawing
      startDraw(newTouchPoints[0].x, newTouchPoints[0].y)
    }
  }

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault() // Prevent scrolling
    const rect = e.currentTarget.getBoundingClientRect()

    // Convert touch list to our TouchPoint array
    const newTouchPoints: TouchPoint[] = Array.from(e.touches).map((touch) => ({
      id: touch.identifier,
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }))

    if (newTouchPoints.length === 2 && touchPoints.length === 2 && initialTouchDistance !== null) {
      // Two finger gesture - handle zoom and pan
      const currentDistance = getDistance(newTouchPoints[0], newTouchPoints[1])
      const initialMidpoint = getMidpoint(touchPoints[0], touchPoints[1])
      const currentMidpoint = getMidpoint(newTouchPoints[0], newTouchPoints[1])

      // Calculate zoom change
      const zoomFactor = currentDistance / initialTouchDistance
      if (Math.abs(zoomFactor - 1) > 0.01) {
        const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.5), 3)
        setZoom(newZoom)
        setInitialTouchDistance(currentDistance)
      }

      // Calculate pan change
      setPan({
        x: initialPan.x + (currentMidpoint.x - initialMidpoint.x),
        y: initialPan.y + (currentMidpoint.y - initialMidpoint.y),
      })
    } else if (newTouchPoints.length === 1 && isDrawing) {
      // Single touch - continue drawing
      moveDraw(newTouchPoints[0].x, newTouchPoints[0].y)
    }

    setTouchPoints(newTouchPoints)
  }

  const onTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault() // Prevent scrolling

    // Update touch points
    const rect = e.currentTarget.getBoundingClientRect()
    const newTouchPoints: TouchPoint[] = Array.from(e.touches).map((touch) => ({
      id: touch.identifier,
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }))

    setTouchPoints(newTouchPoints)

    // If we're down to 0 or 1 touch and we were previously drawing, end the drawing
    if (newTouchPoints.length < 2 && isDrawing) {
      endDraw()
    }

    // If we're down to 0 touches, reset everything
    if (newTouchPoints.length === 0) {
      setInitialTouchDistance(null)
      if (isDrawing) {
        endDraw()
      }
    }
  }

  /* =================================================================================
   *  undo/redo/clear
   * ================================================================================= */
  const undo = () => {
    if (!actions.length) return
    setRedos((r) => [...r, actions.at(-1)!])
    setActions((a) => a.slice(0, -1))
  }
  const redo = () => {
    if (!redos.length) return
    setActions((a) => [...a, redos.at(-1)!])
    setRedos((r) => r.slice(0, -1))
  }
  useEffect(() => redrawStrokes(), [actions])

  const clearCanvas = () => {
    if (!drawCtx.current || !canvasRef.current) return
    if (!window.confirm("Clear the prescription?")) return
    drawCtx.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    setActions([])
    setRedos([])
  }

  /* =================================================================================
   *  save
   * ================================================================================= */
  const save = async () => {
    if (!(canvasRef.current && bgRef.current)) return
    try {
      setSaving(true)
      const tmp = document.createElement("canvas")
      tmp.width = canvasRef.current.width
      tmp.height = canvasRef.current.height
      const tctx = tmp.getContext("2d")!
      tctx.drawImage(bgRef.current, 0, 0)
      tctx.drawImage(canvasRef.current, 0, 0)
      const blob: Blob = await new Promise((res, rej) =>
        tmp.toBlob((b) => (b ? res(b) : rej("blob fail")), "image/png"),
      )
      const fn = `prescriptions/${patientId}_${appointmentId}_${Date.now()}.png`
      const fr = storageRef(storage, fn)
      await uploadBytes(fr, blob)
      const url = await getDownloadURL(fr)
      await onSave(url)
    } finally {
      setSaving(false)
    }
  }

  /* ================================================================================= */
  return (
    <div className="flex flex-col h-full min-h-screen" ref={containerRef}>
      {/* toolbar */}
      <div className="flex flex-wrap gap-2 p-4 bg-white border-b justify-center">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")}>
            <Pencil className="h-4 w-4 mr-1" /> Pen
          </Button>
          <Button size="sm" variant={tool === "eraser" ? "default" : "outline"} onClick={() => setTool("eraser")}>
            <Eraser className="h-4 w-4 mr-1" /> Eraser
          </Button>
          <Button size="sm" variant={tool === "move" ? "default" : "outline"} onClick={() => setTool("move")}>
            <MoveHorizontal className="h-4 w-4 mr-1" /> Move
          </Button>

          {/* cap style */}
          <Select value={penStyle} onValueChange={(v) => setPenStyle(v as PenStyle)}>
            <SelectTrigger className="w-[120px] h-9">
              <PenTool className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Pen cap" />
            </SelectTrigger>
            <SelectContent>
              {capStyles.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm">Width:</span>
          <Slider className="w-24" value={[lineWidth]} min={1} max={10} onValueChange={(v) => setLineWidth(v[0])} />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm">Color:</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 border-0 cursor-pointer"
          />
          <div className="flex gap-1">
            {palette.map((c) => (
              <div
                key={c}
                className="w-6 h-6 rounded-full border cursor-pointer"
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={undo} disabled={!actions.length}>
            <Undo className="h-4 w-4 mr-1" /> Undo
          </Button>
          <Button size="sm" variant="outline" onClick={redo} disabled={!redos.length}>
            <RotateCcw className="h-4 w-4 mr-1" /> Redo
          </Button>
          <Button size="sm" variant="destructive" onClick={clearCanvas}>
            <Trash2 className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.min(z + 0.1, 3))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPan({ x: 0, y: 0 })}>
            <MoveHorizontal className="h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      {/* canvases */}
      <div className="flex-1 relative bg-gray-50 overflow-auto">
        <div className="absolute inset-0">
          <canvas ref={bgRef} className="absolute inset-0 bg-white" style={{ width: "100%", height: "100%" }} />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 z-10 touch-none"
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              cursor: tool === "move" ? "move" : tool === "pen" ? "crosshair" : "default",
            }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          />
        </div>
      </div>

      {/* save bar */}
      <div className="p-4 bg-white border-t flex justify-end">
        <Button onClick={save} disabled={saving || !bgReady} className="bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving…" : "Save Prescription"}
        </Button>
      </div>
    </div>
  )
}

export default PrescriptionCanvas
