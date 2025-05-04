import React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Pencil, Save, Trash2, Undo, ZoomIn, ZoomOut, RotateCcw, PenTool, MoveHorizontal } from "lucide-react";

// Fallback asset - in a real app, import your actual letterhead
const fallbackLetterhead = "https://images.pexels.com/photos/5905885/pexels-photo-5905885.jpeg";

type SrcLike = string | { src: string }; // next-image static import object

interface PrescriptionCanvasProps {
  letterheadUrl?: SrcLike;
  patientName: string;
  patientId: string;
  appointmentId: string;
  onSave: (imageUrl: string) => Promise<void>;
}

type DrawingTool = "pen" | "eraser" | "move";
type PenStyle = "round" | "square" | "butt";

interface DrawAction {
  tool: "pen" | "eraser";
  points: { x: number; y: number }[];
  color: string;
  lineWidth: number;
  penStyle: PenStyle;
}

// Mock function to simulate Firebase storage
const mockUploadAndGetUrl = async (blob: Blob, path: string): Promise<string> => {
  return URL.createObjectURL(blob);
};

const toPlainSrc = (srcLike?: SrcLike): string =>
  !srcLike
    ? fallbackLetterhead
    : typeof srcLike === "string"
      ? srcLike
      : srcLike.src;

const PrescriptionCanvas: React.FC<PrescriptionCanvasProps> = ({
  letterheadUrl,
  patientName,
  patientId,
  appointmentId,
  onSave,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const drawCtx = useRef<CanvasRenderingContext2D | null>(null);
  const bgCtx = useRef<CanvasRenderingContext2D | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#000000");
  const [lineWidth, setLineWidth] = useState(2);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [penStyle, setPenStyle] = useState<PenStyle>("round");
  const [saving, setSaving] = useState(false);
  const [bgReady, setBgReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [current, setCurrent] = useState<DrawAction | null>(null);
  const [redos, setRedos] = useState<DrawAction[]>([]);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [touchDist, setTouchDist] = useState<number | null>(null);
  const [isTwoFingerPan, setIsTwoFingerPan] = useState(false);

  const palette = ["#000", "#F00", "#00F", "#080", "#808", "#FA0"];
  const capStyles = [
    { value: "round", label: "Round" },
    { value: "square", label: "Square" },
    { value: "butt", label: "Flat" },
  ];

  const drawLetterhead = useCallback(() => {
    const canvas = bgRef.current;
    const ctx = bgCtx.current;
    if (!canvas || !ctx) return;

    const src = toPlainSrc(letterheadUrl);

    const paint = (url: string) => {
      const img = new Image();
      img.src = url;
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Reset transform & clear
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Calculate fit dims at zoom=1
        const imgAspect = img.width / img.height;
        const canvasAspect = canvas.width / canvas.height;
        let dw, dh, ox = 0, oy = 0;
        if (imgAspect > canvasAspect) {
          dw = canvas.width;
          dh = canvas.width / imgAspect;
          oy = (canvas.height - dh) / 2;
        } else {
          dh = canvas.height;
          dw = canvas.height * imgAspect;
          ox = (canvas.width - dw) / 2;
        }

        // Apply unified zoom/pan transform
        ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);
        // Draw at the base fit dims
        ctx.drawImage(img, ox, oy, dw, dh);

        setBgReady(true);
      };

      img.onerror = () => {
        fetch(url)
          .then((r) => r.blob())
          .then((b) => {
            paint(URL.createObjectURL(b));
          })
          .catch((err) => {
            console.error("letterhead load error:", err);
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            setBgReady(true);
          });
      };
    };

    paint(src);
  }, [letterheadUrl, zoom, pan]);

  const redrawStrokes = useCallback(() => {
    const ctx = drawCtx.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // Reset transform & clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply same zoom/pan transform
    ctx.setTransform(zoom, 0, 0, zoom, pan.x, pan.y);

    actions.forEach((a) => {
      if (a.points.length < 2) return;
      ctx.beginPath();
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.lineWidth;
      ctx.lineCap = a.penStyle;
      ctx.moveTo(a.points[0].x, a.points[0].y);
      a.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });
  }, [actions, zoom, pan]);

  useEffect(() => {
    const c = canvasRef.current;
    const bg = bgRef.current;
    const wrap = containerRef.current;
    if (!(c && bg && wrap)) return;
    drawCtx.current = c.getContext("2d");
    bgCtx.current = bg.getContext("2d");

    const resize = () => {
      const w = wrap.clientWidth || window.innerWidth;
      const h = (wrap.clientHeight || window.innerHeight) - 100;
      c.width = bg.width = w;
      c.height = bg.height = h;
      drawLetterhead();
      redrawStrokes();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [drawLetterhead, redrawStrokes]);

  useEffect(() => {
    const ctx = drawCtx.current;
    if (!ctx) return;
    ctx.strokeStyle = tool === "eraser" ? "#fff" : color;
    ctx.lineWidth = tool === "eraser" ? lineWidth * 2 : lineWidth;
    ctx.lineCap = penStyle;
  }, [tool, color, lineWidth, penStyle]);

  useEffect(() => {
    if (bgCtx.current) drawLetterhead();
  }, [drawLetterhead]);

  useEffect(() => redrawStrokes(), [redrawStrokes]);

  // Convert screen coordinates to canvas coordinates
  const toCanvas = (sx: number, sy: number) => ({
    x: (sx - pan.x) / zoom,
    y: (sy - pan.y) / zoom,
  });
  
  // Distance between two touch points
  const distance = (t: React.TouchList) => 
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  // Start drawing or moving
  const startDraw = (sx: number, sy: number, source: "mouse" | "touch") => {
    if (tool === "move") {
      setLastMouse({ x: sx, y: sy });
      return;
    }
    
    if (!drawCtx.current || !bgReady) return;
    
    setIsDrawing(true);
    const { x, y } = toCanvas(sx, sy);
    
    const a: DrawAction = {
      tool,
      points: [{ x, y }],
      color: tool === "eraser" ? "#fff" : color,
      lineWidth: tool === "eraser" ? lineWidth * 2 : lineWidth,
      penStyle,
    };
    
    setCurrent(a);
    setRedos([]);
    
    // Fixed: Apply transformation for drawing
    const ctx = drawCtx.current;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  // Continue drawing or moving
  const moveDraw = (sx: number, sy: number) => {
    if (tool === "move" && isDrawing === false) {
      const dx = sx - lastMouse.x;
      const dy = sy - lastMouse.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastMouse({ x: sx, y: sy });
      return;
    }
    
    if (!isDrawing || !drawCtx.current || !current) return;
    
    const { x, y } = toCanvas(sx, sy);
    setCurrent((prev) => (prev ? { ...prev, points: [...prev.points, { x, y }] } : prev));
    
    // Fixed: Apply proper coordinates for drawing
    drawCtx.current.lineTo(x, y);
    drawCtx.current.stroke();
  };

  // End drawing
  const endDraw = () => {
    if (!isDrawing || !current) return;
    setIsDrawing(false);
    drawCtx.current?.closePath();
    if (current.points.length > 1) setActions((a) => [...a, current]);
    setCurrent(null);
    setIsTwoFingerPan(false);
  };

  /* Mouse events */
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    startDraw(x, y, "mouse");
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    moveDraw(x, y);
  };

  /* Touch events - improved for better mobile support */
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scroll/zoom behaviors

    if (e.touches.length === 2) {
      // Two finger touch - setup for zoom or pan
      setTouchDist(distance(e.touches));
      setIsTwoFingerPan(true);
      
      // Store the midpoint of the two fingers for panning
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      setLastMouse({ x, y });
      return;
    }
    
    // Single finger - draw or move
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;
    startDraw(x, y, "touch");
  };

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault(); // Prevent scroll/zoom behaviors

    if (e.touches.length === 2) {
      const rect = e.currentTarget.getBoundingClientRect();
      // Get midpoint for panning
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      
      // Calculate new distance for zooming
      const nd = distance(e.touches);
      
      if (touchDist !== null) {
        // Handle zooming
        if (Math.abs(nd - touchDist) > 5) {
          const oldZoom = zoom;
          const newZoom = Math.min(Math.max(zoom * (nd > touchDist ? 1.02 : 0.98), 0.5), 3);
          
          // Adjust pan to keep the center point fixed during zoom
          if (oldZoom !== newZoom) {
            const zoomRatio = newZoom / oldZoom;
            // Adjust pan to maintain center point
            const dx = mx - lastMouse.x;
            const dy = my - lastMouse.y;
            
            setPan(p => ({
              x: p.x + dx,
              y: p.y + dy
            }));
            
            setZoom(newZoom);
          }
        }
        
        // Update pan based on midpoint movement
        if (isTwoFingerPan) {
          const dx = mx - lastMouse.x;
          const dy = my - lastMouse.y;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
          }
        }
      }
      
      setTouchDist(nd);
      setLastMouse({ x: mx, y: my });
      return;
    }
    
    // Handle single finger drawing
    if (!isTwoFingerPan) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.touches[0].clientX - rect.left;
      const y = e.touches[0].clientY - rect.top;
      moveDraw(x, y);
    }
  };

  /* Undo/Redo/Clear functions */
  const undo = () => {
    if (!actions.length) return;
    setRedos((r) => [...r, actions[actions.length - 1]]);
    setActions((a) => a.slice(0, -1));
  };
  
  const redo = () => {
    if (!redos.length) return;
    setActions((a) => [...a, redos[redos.length - 1]]);
    setRedos((r) => r.slice(0, -1));
  };
  
  const clearCanvas = () => {
    if (!drawCtx.current || !canvasRef.current) return;
    if (!window.confirm("Clear the prescription?")) return;
    drawCtx.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setActions([]);
    setRedos([]);
  };

  /* Save functionality */
  const save = async () => {
    if (!(canvasRef.current && bgRef.current)) return;
    try {
      setSaving(true);
      const tmp = document.createElement("canvas");
      tmp.width = canvasRef.current.width;
      tmp.height = canvasRef.current.height;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(bgRef.current, 0, 0);
      tctx.drawImage(canvasRef.current, 0, 0);
      
      const blob: Blob = await new Promise((res, rej) =>
        tmp.toBlob((b) => (b ? res(b) : rej("blob fail")), "image/png")
      );
      
      // In a real app with Firebase, you'd use uploadBytes and getDownloadURL
      // Here we're using a mock function
      const url = await mockUploadAndGetUrl(blob, `prescriptions/${patientId}_${appointmentId}_${Date.now()}.png`);
      await onSave(url);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-screen" ref={containerRef}>
      {/* Toolbar */}
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

          {/* Cap style */}
          <Select value={penStyle} onValueChange={(v) => setPenStyle(v as PenStyle)}>
            <SelectTrigger className="w-[120px] h-9">
              <PenTool className="h-4 w-4 mr-1" />
              <SelectValue>{penStyle}</SelectValue>
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

      {/* Canvases */}
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
            onTouchEnd={endDraw}
          />
        </div>
      </div>

      {/* Save bar */}
      <div className="p-4 bg-white border-t flex justify-end">
        <Button onClick={save} disabled={saving || !bgReady} className="bg-emerald-600 hover:bg-emerald-700">
          <Save className="h-4 w-4 mr-1" />
          {saving ? "Saving…" : "Save Prescription"}
        </Button>
      </div>
    </div>
  );
};

// Button component
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "outline" | "destructive";
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  onClick, 
  disabled = false, 
  className = "", 
  size = "md", 
  variant = "default" 
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
  
  const sizeStyles = {
    sm: "h-9 px-3 text-xs",
    md: "h-10 py-2 px-4",
    lg: "h-11 px-8"
  };
  
  const variantStyles = {
    default: "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700",
    outline: "border border-gray-300 bg-transparent hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800",
    destructive: "bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
  };
  
  const styles = `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`;
  
  return (
    <button 
      className={styles} 
      onClick={onClick} 
      disabled={disabled}
    >
      {children}
    </button>
  );
};

// Select and related components
interface SelectProps {
  children: React.ReactNode;
  value: string;
  onValueChange: (value: string) => void;
}

const Select: React.FC<SelectProps> = ({ children, value, onValueChange }) => {
  const [open, setOpen] = useState(false);
  
  return (
    <div className="relative">
      {children}
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === SelectTrigger) {
          return React.cloneElement(child as React.ReactElement<any>, {
            onClick: () => setOpen(!open),
            open
          });
        }
        if (React.isValidElement(child) && child.type === SelectContent) {
          return open ? React.cloneElement(child as React.ReactElement<any>, {
            onSelect: (val: string) => {
              onValueChange(val);
              setOpen(false);
            },
            value
          }) : null;
        }
        return child;
      })}
    </div>
  );
};

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  open?: boolean;
}

const SelectTrigger: React.FC<SelectTriggerProps> = ({ 
  children, 
  className = "", 
  onClick,
  open
}) => {
  return (
    <button 
      className={`flex items-center justify-between rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm hover:bg-gray-100 ${className} ${open ? 'border-blue-500' : ''}`}
      onClick={onClick}
    >
      {children}
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}>
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
  );
};

interface SelectContentProps {
  children: React.ReactNode;
  onSelect?: (value: string) => void;
  value?: string;
}

const SelectContent: React.FC<SelectContentProps> = ({ 
  children, 
  onSelect,
  value
}) => {
  return (
    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
      {React.Children.map(children, child => {
        if (React.isValidElement(child) && child.type === SelectItem) {
          return React.cloneElement(child as React.ReactElement<any>, {
            onClick: () => onSelect && onSelect(child.props.value),
            selected: value === child.props.value
          });
        }
        return child;
      })}
    </div>
  );
};

interface SelectItemProps {
  children: React.ReactNode;
  value: string;
  onClick?: () => void;
  selected?: boolean;
}

const SelectItem: React.FC<SelectItemProps> = ({ 
  children, 
  onClick,
  selected = false
}) => {
  return (
    <div 
      className={`relative cursor-pointer select-none py-2 pl-10 pr-4 ${selected ? 'bg-blue-100 text-blue-900' : 'text-gray-900 hover:bg-gray-100'}`}
      onClick={onClick}
    >
      {selected && (
        <span className="absolute left-0 flex h-full items-center pl-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
      )}
      {children}
    </div>
  );
};

interface SelectValueProps {
  children: React.ReactNode;
  placeholder?: string;
}

const SelectValue: React.FC<SelectValueProps> = ({ 
  children,
  placeholder
}) => {
  return <span>{children || placeholder}</span>;
};

// Slider component
interface SliderProps {
  value: number[];
  min: number;
  max: number;
  onValueChange: (value: number[]) => void;
  className?: string;
}

const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  onValueChange,
  className = ""
}) => {
  const percentage = ((value[0] - min) / (max - min)) * 100;
  
  return (
    <div className={`relative flex w-full touch-none select-none items-center ${className}`}>
      <div className="relative w-full h-2 rounded-full bg-gray-200">
        <div
          className="absolute h-full bg-blue-500 rounded-full"
          style={{ width: `${percentage}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value[0]}
          onChange={(e) => onValueChange([parseInt(e.target.value)])}
          className="absolute w-full h-2 opacity-0 cursor-pointer"
        />
        <div
          className="absolute w-4 h-4 bg-blue-500 rounded-full -translate-y-1/2 top-1/2"
          style={{ left: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default PrescriptionCanvas;