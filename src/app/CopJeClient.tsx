'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import * as fabric from 'fabric';

import './copje-editor.css';

type FontChoice = 'Arial' | 'Times' | 'Montserrat' | 'Bebas Neue' | 'Poppins';
type ShapeChoice = 'circle' | 'rectangle' | 'triangle' | 'oval';
type BorderStyle = 'solid' | 'dashed' | 'double';
type DateFormat = 'DD/MM/YYYY' | 'MM-DD-YYYY' | 'DD.MM.YYYY' | 'YYYY-MM-DD';

type StampObject = fabric.Object & {
  uid?: string;
  kind?: 'text' | 'arc-text' | 'shape' | 'image' | 'distress';
  shapeKind?: ShapeChoice;
  borderStyle?: BorderStyle;
  sourceText?: string;
  curveAngle?: number;
  isDistressed?: boolean;
};

const FONT_CHOICES: FontChoice[] = ['Arial', 'Times', 'Montserrat', 'Bebas Neue', 'Poppins'];
const COLOR_PRESETS = ['#111111', '#2d62ff', '#d7263d', '#2c8a4b'];
const CANVAS_BG_PRESETS = ['#ffffff', '#f3f7ff', '#fff7ef', '#edf6ff', '#f1f5f0'];
const DATE_FORMAT_OPTIONS: DateFormat[] = ['DD/MM/YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD'];
const STAMP_JSON_EXTRAS = ['uid', 'kind', 'shapeKind', 'borderStyle', 'sourceText', 'curveAngle', 'isDistressed'];

const BASE_CANVAS = 560;
const CANVAS_VIEW_MAX = 240;
const MAX_HISTORY = 60;
const SNAP_CENTER = 12;

const mapFontFamily = (font: FontChoice) => {
  if (font === 'Times') return 'Times New Roman';
  return font;
};

const toId = () => `stamp-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const getDateByFormat = (format: DateFormat, date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  if (format === 'MM-DD-YYYY') return `${month}-${day}-${year}`;
  if (format === 'DD.MM.YYYY') return `${day}.${month}.${year}`;
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
};

const getFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });

const removeWhiteBackground = (dataUrl: string) =>
  new Promise<string>((resolve) => {
    const image = new Image();
    image.src = dataUrl;
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const step = 4;
      for (let i = 0; i < frame.data.length; i += step) {
        const r = frame.data[i];
        const g = frame.data[i + 1];
        const b = frame.data[i + 2];
        if (r > 242 && g > 242 && b > 242) {
          frame.data[i + 3] = 0;
        }
      }
      context.putImageData(frame, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(dataUrl);
  });

const disableObjectLayoutEditing = (obj: fabric.Object) => {
  obj.set({
    lockMovementX: true,
    lockMovementY: true,
    lockRotation: true,
    lockScalingX: true,
    lockScalingY: true,
    lockUniScaling: true,
    lockSkewingX: true,
    lockSkewingY: true,
    hasControls: false,
    hasBorders: false,
    selectable: false,
  });
};

const createDistressMarks = (obj: StampObject, color: string) => {
  const bounds = obj.getBoundingRect();
  const size = Math.max(1, Math.floor((bounds.width + bounds.height) / 16));
  const marks = Array.from({ length: Math.min(160, Math.max(40, size)) }, () => {
    const x = Math.random() * bounds.width;
    const y = Math.random() * bounds.height;
    const length = 1 + Math.random() * 12;
    const angle = Math.random() * Math.PI * 2;
    const x2 = x + Math.cos(angle) * length;
    const y2 = y + Math.sin(angle) * length;
    return new fabric.Line([x, y, x2, y2], {
      stroke: color,
      strokeWidth: 1 + Math.random() * 2,
      opacity: 0.15 + Math.random() * 0.3,
    });
  });

  const overlay = new fabric.Group(marks, {
    selectable: false,
    evented: false,
    left: bounds.left,
    top: bounds.top,
    angle: obj.angle || 0,
    opacity: 0.9,
    originX: 'left',
    originY: 'top',
  });
  disableObjectLayoutEditing(overlay as unknown as fabric.Object);

  (overlay as any).uid = `distress-${obj.uid}`;
  (overlay as any).distressOf = obj.uid;
  return overlay;
};

const createArcText = ({
  text,
  left,
  top,
  fontSize,
  fontFamily,
  fontWeight,
  fontStyle,
  letterSpacing,
  color,
  opacity,
  angle,
}: {
  text: string;
  left: number;
  top: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  letterSpacing: number;
  color: string;
  opacity: number;
  angle: number;
}) => {
  const cleanText = text.trim() || 'APPROVED';
  const safeAngle = clamp(angle, -180, 180);
  const span = (safeAngle * Math.PI) / 180;
  const count = cleanText.length || 1;
  const arcRadius = clamp(Math.max(fontSize * 3.5 + count * 1.8, 120), 90, 240);
  const step = count > 1 ? (span === 0 ? 0.0001 : span / (count - 1)) : 0;
  const first = -Math.PI / 2 - span / 2;

  const chars = [...cleanText].map((char, index) => {
    const theta = first + step * index;
    const x = arcRadius * Math.cos(theta);
    const y = arcRadius * Math.sin(theta);
    return new fabric.Text(char, {
      fontSize,
      fontFamily,
      fontWeight,
      fontStyle,
      charSpacing: letterSpacing,
      fill: color,
      selectable: false,
      evented: false,
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      angle: (theta * 180) / Math.PI + (safeAngle >= 0 ? 92 : 88),
    });
  });

  const group = new fabric.Group(chars, {
    left,
    top,
    originX: 'center',
    originY: 'center',
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    opacity,
  }) as any;

  group.uid = toId();
  group.kind = 'arc-text';
  group.sourceText = cleanText;
  group.curveAngle = safeAngle;

  return group;
};

export default function CopJeClient() {
  const canvasHostRef = useRef<HTMLCanvasElement>(null);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const ignoreHistoryRef = useRef(false);
  const distressMapRef = useRef(new Map<string, fabric.Object>());
  const historyRef = useRef<{ past: string[]; future: string[] }>({
    past: [],
    future: [],
  });

  const [guides, setGuides] = useState({ x: false, y: false });
  const [canvasSize] = useState(BASE_CANVAS);
  const [busy, setBusy] = useState(false);

  const [status, setStatus] = useState('Ready');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [activeLayerIdForFit, setActiveLayerIdForFit] = useState<string | null>(null);

  const [textValue, setTextValue] = useState('APPROVED');
  const [autoDateFormat, setAutoDateFormat] = useState<DateFormat>(DATE_FORMAT_OPTIONS[0]);
  const [selectedFont, setSelectedFont] = useState<FontChoice>('Arial');
  const [fontSize, setFontSize] = useState(80);
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('bold');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [curveAngle, setCurveAngle] = useState(0);

  const [borderWidth, setBorderWidth] = useState(10);
  const [lineBreak, setLineBreak] = useState(8);
  const [borderStyle, setBorderStyle] = useState<BorderStyle>('solid');
  const [activeShapeForFit] = useState('');
  const [activeShapeKind, setActiveShapeKind] = useState<ShapeChoice | ''>('');
  const [shapeWidth, setShapeWidth] = useState(340);
  const [shapeHeight, setShapeHeight] = useState(340);

  const [inkColor, setInkColor] = useState(COLOR_PRESETS[0]);
  const [opacity, setOpacity] = useState(100);
  const [distressedEnabled, setDistressedEnabled] = useState(false);
  const [stripBg, setStripBg] = useState(false);
  const [canvasBgColor, setCanvasBgColor] = useState('#ffffff');
  const [canvasBgTransparent, setCanvasBgTransparent] = useState(true);
  const [shapeTypeForAdd, setShapeTypeForAdd] = useState<ShapeChoice>('circle');
  const [isShapeSelectorOpen, setIsShapeSelectorOpen] = useState(false);
  const shapeSelectorRef = useRef<HTMLDivElement>(null);

  const syncHistory = () => {
    const current = historyRef.current;
    setCanUndo(current.past.length > 0);
    setCanRedo(current.future.length > 0);
  };

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas || ignoreHistoryRef.current) return;

    const current = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS));
    historyRef.current.past.push(current);
    if (historyRef.current.past.length > MAX_HISTORY) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    syncHistory();
  };

  const refreshLayerList = () => {
    return;
  };

  const clearSelection = () => {
    setDistressedEnabled(false);
    setActiveLayerIdForFit(null);
    setActiveShapeKind('');
  };

  const syncActiveObject = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind === 'distress') {
      clearSelection();
      return;
    }

    if (active.kind === 'text' || active.kind === 'arc-text') {
      setTextValue(String((active as any).text || (active.sourceText || 'APPROVED')));
      const activeFont = String((active as any).fontFamily || 'Arial');
      setSelectedFont((activeFont.includes('Times') ? 'Times' : (mapFontFamily(activeFont as FontChoice) as FontChoice)));
      setFontSize(Math.round((active as any).fontSize || fontSize));
      setFontWeight(((active as any).fontWeight || 'bold') as 'normal' | 'bold');
      setFontStyle(((active as any).fontStyle || 'normal') as 'normal' | 'italic');
      setLetterSpacing(Math.round(((active as any).charSpacing || 0) / 10));
      setCurveAngle(Math.round((active.curveAngle || 0) as number));
      setDistressedEnabled(Boolean(active.isDistressed));
    }
    if (active.kind === 'shape') {
      setActiveShapeKind(active.shapeKind || 'circle');
      setBorderWidth(Math.round(Number(active.strokeWidth || borderWidth)));
      setBorderStyle(active.borderStyle || 'solid');
      const shapeDash = active.strokeDashArray;
      if (Array.isArray(shapeDash) && shapeDash.length >= 2) {
        setLineBreak(Math.round(Number(shapeDash[1]) || 0));
      } else {
        setLineBreak(0);
      }
      setDistressedEnabled(Boolean(active.isDistressed));
      const currentWidth = Math.max(1, Math.round(active.getScaledWidth()));
      const currentHeight = Math.max(1, Math.round(active.getScaledHeight()));
      const maxShapeSize = Math.max(currentWidth, currentHeight);
      setShapeWidth(maxShapeSize);
      setShapeHeight(maxShapeSize);
      setActiveLayerIdForFit(active.uid || null);
    }
    if (active.kind === 'image') {
      setDistressedEnabled(false);
      setActiveLayerIdForFit(null);
    }
  };

  const applyDistressToShape = (target: StampObject, enabled: boolean) => {
    if (!target.uid) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const existing = distressMapRef.current.get(target.uid);
    if (existing) {
      canvas.remove(existing);
      distressMapRef.current.delete(target.uid);
    }
    target.isDistressed = false;

    if (!enabled) {
      canvas.requestRenderAll();
      return;
    }

    const overlay = createDistressMarks(target, inkColor);
    const overlayLayer = overlay as any;
    overlayLayer.ownerUid = target.uid;
    target.isDistressed = true;
    canvas.add(overlay);
    canvas.requestRenderAll();
    distressMapRef.current.set(target.uid, overlay);
  };

  const refreshDistressOverlay = (target: StampObject) => {
    if (!target?.uid || !target.isDistressed) return;
    applyDistressToShape(target, false);
    applyDistressToShape(target, true);
  };

  const fitShapeToCanvas = (target: StampObject, keepCentered = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = target.getBoundingRect();
    const width = bounds.width || 1;
    const height = bounds.height || 1;
    if (!width || !height) return;

    const borderAllowance = Math.max(14, (Number(target.strokeWidth || 0) / 2) + 6);
    const maxWidth = Math.max(1, canvas.width - borderAllowance * 2);
    const maxHeight = Math.max(1, canvas.height - borderAllowance * 2);
    const scaleFactor = Math.min(1, maxWidth / width, maxHeight / height);

    target.scaleX = (target.scaleX || 1) * scaleFactor;
    target.scaleY = (target.scaleY || 1) * scaleFactor;

    if (keepCentered) {
      target.left = canvas.width / 2;
      target.top = canvas.height / 2;
    }
    target.setCoords();
  };

  const applyShapeSize = (target: StampObject, requestedSize = shapeWidth) => {
    const normalized = clamp(Math.round(requestedSize), 76, 520);
    const current = Math.max(target.getScaledWidth(), target.getScaledHeight()) || 1;
    const scaleFactor = normalized / current;
    target.scaleX = (target.scaleX || 1) * scaleFactor;
    target.scaleY = (target.scaleY || 1) * scaleFactor;
    fitShapeToCanvas(target, true);
    setShapeWidth(normalized);
    setShapeHeight(normalized);
  };

  const handleShapeSizeChange = (value: number) => {
    const normalized = clamp(Math.round(value), 76, 520);
    setShapeWidth(normalized);
    setShapeHeight(normalized);
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;
    applyShapeSize(active, normalized);
    refreshDistressOverlay(active);
    if (canvas) canvas.requestRenderAll();
    saveState();
  };

  const handleShapeStrokeChange = (value: number) => {
    const width = clamp(Math.round(value), 1, 40);
    setBorderWidth(width);
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;
    applyShapeBorder(active, width, lineBreak);
    active.setCoords();
    if (canvas) canvas.requestRenderAll();
    refreshDistressOverlay(active);
    saveState();
  };

  const handleLineBreakChange = (value: number) => {
    const normalized = clamp(Math.round(value), 0, 80);
    setLineBreak(normalized);
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;
    applyShapeBorder(active, borderWidth, normalized);
    active.setCoords();
    if (canvas) canvas.requestRenderAll();
    refreshDistressOverlay(active);
    saveState();
  };

  const handleShapeSelect = (shape: ShapeChoice) => {
    setShapeAsSingle(shape);
    setIsShapeSelectorOpen(false);
  };

  useEffect(() => {
    if (!isShapeSelectorOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const currentRef = shapeSelectorRef.current;
      if (currentRef && !currentRef.contains(event.target as Node)) {
        setIsShapeSelectorOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isShapeSelectorOpen]);

  const clearExistingShapes = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const shapeObjects = canvas.getObjects().filter((obj) => (obj as StampObject).kind === 'shape');
    shapeObjects.forEach((obj) => {
      const target = obj as StampObject;
      const uid = target.uid;
      const linkedOverlay = uid ? distressMapRef.current.get(uid) : null;
      if (uid && linkedOverlay) {
        canvas.remove(linkedOverlay);
        distressMapRef.current.delete(uid);
      }
      canvas.remove(obj);
    });
    if (shapeObjects.length > 0) {
      setActiveLayerIdForFit(null);
      setActiveShapeKind('');
      setShapeWidth(340);
      setShapeHeight(340);
      setDistressedEnabled(false);
    }
    canvas.renderAll();
  };

  const setShapeAsSingle = (shape: ShapeChoice) => {
    setShapeTypeForAdd(shape);
    clearExistingShapes();
    addShapeObject(shape, true);
  };

  const assignObjectUids = (canvas: fabric.Canvas) => {
    let changed = false;
    canvas.getObjects().forEach((obj) => {
      const target = obj as StampObject;
      if (!target.uid) {
        target.uid = toId();
        changed = true;
      }
    });
    if (changed) {
      refreshLayerList();
    }
  };

  const applyShapeBorder = (target: StampObject, nextStrokeWidth = borderWidth, nextLineBreak = lineBreak) => {
    if (!target) return;
    const isRectOrTri =
      target.kind === 'shape' && (target.shapeKind === 'rectangle' || target.shapeKind === 'triangle');
    const hasLineBreak = Math.max(0, Math.round(nextLineBreak)) > 0;
    target.set({
      strokeWidth: nextStrokeWidth,
      strokeUniform: true,
      strokeLineCap: isRectOrTri ? 'butt' : hasLineBreak ? 'square' : 'round',
      strokeLineJoin: isRectOrTri ? 'miter' : hasLineBreak ? 'miter' : 'round',
      stroke: inkColor,
    });
    const dashValue = Math.max(0, Math.round(nextLineBreak));

    if (borderStyle === 'dashed') {
      target.set({ strokeDashArray: [Math.max(2, Math.round(nextStrokeWidth * 1.4)), dashValue || 8] });
    } else if (borderStyle === 'double') {
      target.set({
        stroke: inkColor,
        strokeDashArray: [1, 2, dashValue || 8, 2, 1],
      });
    } else if (dashValue > 0) {
      target.set({ strokeDashArray: [Math.max(1, Math.round(nextStrokeWidth)), dashValue] });
    } else {
      target.set({ strokeDashArray: [] });
    }
    if (target.kind === 'shape') {
      target.borderStyle = borderStyle;
    }
    refreshDistressOverlay(target);
  };

  const normalizeHex = (value: string) => {
    if (!value) return '#ffffff';
    if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    if (/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.test(value)) {
      const values = value.match(/\d+/g)?.map(Number);
      if (!values || values.length < 3) return '#ffffff';
      const toHex = (amount: number) => amount.toString(16).padStart(2, '0');
      const safe = [clamp(values[0], 0, 255), clamp(values[1], 0, 255), clamp(values[2], 0, 255)];
      return `#${safe.map((value) => toHex(value)).join('')}`;
    }
    return '#ffffff';
  };

  const syncCanvasBackgroundFromCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = String(canvas.backgroundColor || '').trim();
    const isTransparent =
      !value || value === 'transparent' || value === 'rgba(0,0,0,0)' || value === 'rgba(0, 0, 0, 0)';
    setCanvasBgTransparent(isTransparent);
    setCanvasBgColor(isTransparent ? '#ffffff' : normalizeHex(value));
  };

  const applyCanvasBackground = (color = canvasBgColor, transparent = canvasBgTransparent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.backgroundColor = transparent ? 'rgba(0,0,0,0)' : color;
    canvas.requestRenderAll();
    saveState();
    pushStatus(transparent ? 'Canvas background set to transparent' : `Canvas background set to ${color}`);
  };

  const applyDefaultPreset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    distressMapRef.current.clear();
    canvas.clear();
    canvas.backgroundColor = 'rgba(0,0,0,0)';
    saveState();
    setStatus('Preset "default" cleared');
  };

  const pushStatus = (message: string, timeout = 2200) => {
    setStatus(message);
    if (timeout > 0) {
      window.setTimeout(() => {
        setStatus('Ready');
      }, timeout);
    }
  };

  const applyHistoryState = (json: string, resetHistory = false) =>
    new Promise<void>((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve();
      ignoreHistoryRef.current = true;
      canvas.loadFromJSON(json, () => {
        distressMapRef.current.clear();
      canvas.getObjects().forEach(disableObjectLayoutEditing);
      canvas.getObjects().forEach((obj) => {
        const target = obj as StampObject;
        if (target.kind === 'shape') {
          if (!target.fill || target.fill === 'transparent') {
            target.set({ fill: 'rgba(0,0,0,0)' });
          }
          fitShapeToCanvas(target, true);
        }
      });
      assignObjectUids(canvas);
        if (resetHistory) {
          historyRef.current.past = [json];
          historyRef.current.future = [];
        }
        refreshLayerList();
        syncCanvasBackgroundFromCanvas();
        syncActiveObject();
        canvas.requestRenderAll();
        syncHistory();
        ignoreHistoryRef.current = false;
        resolve();
      });
    });

  const undo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const entry = historyRef.current;
    if (entry.past.length === 0) return;

    const current = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS));
    const previous = entry.past.pop()!;
    if (current) {
      entry.future.unshift(current);
    }
    await applyHistoryState(previous);
    syncHistory();
  };

  const redo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const entry = historyRef.current;
    if (entry.future.length === 0) return;

    const next = entry.future.shift()!;
    const current = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS));
    if (current) {
      entry.past.push(current);
    }
    await applyHistoryState(next);
    syncHistory();
  };

  const addTextObject = (asArc = false, record = true, textOverride?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = textOverride?.trim() || textValue.trim() || 'APPROVED';

    if (asArc) {
      const arc = createArcText({
        text: value,
        left: canvas.width / 2,
        top: canvas.height / 2,
        fontSize,
        fontFamily: mapFontFamily(selectedFont),
        fontWeight,
        fontStyle,
        letterSpacing: letterSpacing * 10,
        color: inkColor,
        opacity: opacity / 100,
        angle: curveAngle,
      });
      arc.set({
        kind: 'arc-text',
        sourceText: value,
        curveAngle,
        fill: inkColor,
        opacity: opacity / 100,
      });
      disableObjectLayoutEditing(arc);
      canvas.add(arc);
      canvas.setActiveObject(arc);
      canvas.requestRenderAll();
      if (record) saveState();
      return;
    }

    const textObj = new fabric.Text(value, {
      uid: toId(),
      kind: 'text',
      fill: inkColor,
      fontSize,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight,
      fontStyle,
      charSpacing: letterSpacing * 10,
      opacity: opacity / 100,
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
    }) as StampObject;
    disableObjectLayoutEditing(textObj);
    canvas.add(textObj);
    canvas.setActiveObject(textObj);
    canvas.requestRenderAll();
    if (record) saveState();
  };

  const addShapeObject = (shape: ShapeChoice, record = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let shapeObject: StampObject | null = null;

    if (shape === 'circle') {
      shapeObject = new fabric.Circle({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'circle',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fill: 'rgba(0,0,0,0)',
        radius: 190,
        stroke: inkColor,
        strokeWidth: borderWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      }) as StampObject;
    }
    if (shape === 'rectangle') {
      shapeObject = new fabric.Rect({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'rectangle',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        width: 340,
        height: 210,
        fill: 'rgba(0,0,0,0)',
        stroke: inkColor,
        strokeWidth: borderWidth,
        strokeLineCap: 'butt',
        strokeLineJoin: 'miter',
      }) as StampObject;
    }
    if (shape === 'triangle') {
      shapeObject = new fabric.Triangle({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'triangle',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        width: 360,
        height: 280,
        fill: 'rgba(0,0,0,0)',
        stroke: inkColor,
        strokeWidth: borderWidth,
        strokeLineCap: 'butt',
        strokeLineJoin: 'miter',
      }) as StampObject;
    }
    if (shape === 'oval') {
      shapeObject = new fabric.Ellipse({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'oval',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        rx: 220,
        ry: 160,
        fill: 'rgba(0,0,0,0)',
        stroke: inkColor,
        strokeWidth: borderWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      }) as StampObject;
    }

    if (!shapeObject) return;
    disableObjectLayoutEditing(shapeObject);

    if (!shapeObject.fill || shapeObject.fill === 'transparent') {
      shapeObject.set('fill', 'rgba(0,0,0,0)');
    }
    applyShapeBorder(shapeObject, borderWidth, lineBreak);
    applyShapeSize(shapeObject, shapeWidth);
    canvas.add(shapeObject);
    canvas.setActiveObject(shapeObject);
    if (record) saveState();
  };

  const addImageObject = async (rawDataUrl: string, record = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);

    const finalData = stripBg ? await removeWhiteBackground(rawDataUrl) : rawDataUrl;
      const target = await new Promise<any>((resolve) => {
        const callback = (image: any) => {
          const imageObj = image as StampObject;
          imageObj.kind = 'image';
          imageObj.uid = toId();
          imageObj.left = canvas.width / 2;
          imageObj.top = canvas.height / 2;
          imageObj.originX = 'center';
          imageObj.originY = 'center';
          imageObj.opacity = opacity / 100;
          imageObj.set({ scaleX: 1, scaleY: 1 });
          imageObj.scaleToWidth(canvas.width * 0.55);
          if (imageObj.height) {
            imageObj.scaleToHeight(canvas.height * 0.55);
            imageObj.scaleToWidth(Math.min(canvas.width * 0.55, (imageObj.scaleX || 1) * (imageObj.width || 1)));
          }
          disableObjectLayoutEditing(imageObj);
          resolve(imageObj);
        };
        (fabric.Image.fromURL as any)(finalData, callback, { crossOrigin: 'anonymous' });
      });

    const targetShape = (canvas.getObjects() as StampObject[]).find((object) => object.uid === activeLayerIdForFit);
    if (targetShape?.kind === 'shape') {
      const targetBounds = targetShape.getBoundingRect();
      const maxW = targetBounds.width * 0.78;
      const maxH = targetBounds.height * 0.78;
      target.scaleToWidth(maxW);
      if ((target as any).height) {
        target.scaleToHeight(maxH);
        if (target.getScaledWidth() > maxW) target.scaleToWidth(maxW);
        if (target.getScaledHeight() > maxH) target.scaleToHeight(maxH);
      }
      target.left = targetBounds.left + targetBounds.width / 2;
      target.top = targetBounds.top + targetBounds.height / 2;
      target.setCoords();
    }

    canvas.add(target);
    canvas.setActiveObject(target);
    if (record) saveState();
    setBusy(false);
  };

  const applyActiveText = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || (active.kind !== 'text' && active.kind !== 'arc-text')) {
      pushStatus('Select a text element first.');
      return;
    }
    saveState();

    if (active.kind === 'text') {
      active.set({
        text: textValue.trim() || 'APPROVED',
        fontFamily: mapFontFamily(selectedFont),
        fontSize,
        fontWeight,
        fontStyle,
        charSpacing: letterSpacing * 10,
        fill: inkColor,
        opacity: opacity / 100,
      });
      canvas.requestRenderAll();
      return;
    }

    const left = active.left || canvas.width / 2;
    const top = active.top || canvas.height / 2;
    const scaleX = active.scaleX || 1;
    const scaleY = active.scaleY || 1;
    const angle = active.angle || 0;
    const rebuilt = createArcText({
      text: textValue.trim() || active.sourceText || 'APPROVED',
      left,
      top,
      fontSize,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight,
      fontStyle,
      letterSpacing: letterSpacing * 10,
      color: inkColor,
      opacity: opacity / 100,
      angle: curveAngle,
    });
    rebuilt.uid = active.uid;
    rebuilt.scaleX = scaleX;
    rebuilt.scaleY = scaleY;
    rebuilt.angle = angle;
    rebuilt.opacity = opacity / 100;

    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    canvas.requestRenderAll();
  };

  const applyInkColor = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active) return;
    if (active.kind === 'shape' || active.kind === 'text' || active.kind === 'arc-text') {
      active.set({ fill: active.kind === 'shape' ? 'rgba(0,0,0,0)' : inkColor, stroke: inkColor });
    }
    if (active.kind === 'text' || active.kind === 'arc-text') {
      active.set('fill', inkColor);
    }
    refreshDistressOverlay(active);
    canvas.requestRenderAll();
    saveState();
  };

  const applyOpacity = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active) return;
    active.set('opacity', opacity / 100);
    canvas.requestRenderAll();
    saveState();
  };

  const duplicateActive = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active) return;
    active.clone().then((clone: StampObject) => {
      const copy = clone as StampObject;
      copy.uid = toId();
      copy.left = (copy.left || 0) + 16;
      copy.top = (copy.top || 0) + 16;
      copy.setCoords();
      canvas.add(copy);
      canvas.setActiveObject(copy);
      saveState();
      refreshLayerList();
      pushStatus('Element duplicated');
    });
  };

  const removeActive = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active) return;
    const distress = distressMapRef.current.get(active.uid || '');
    if (distress) {
      canvas.remove(distress);
      distressMapRef.current.delete(active.uid || '');
    }
    canvas.remove(active);
    clearSelection();
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    saveState();
    refreshLayerList();
    pushStatus('Element removed');
  };

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.clear();
    setCanvasBgTransparent(true);
    setCanvasBgColor('#ffffff');
    canvas.backgroundColor = 'rgba(0,0,0,0)';
    canvas.requestRenderAll();
    historyRef.current = { past: [], future: [] };
    distressMapRef.current.clear();
    refreshLayerList();
    clearSelection();
    saveState();
    pushStatus('Canvas reset');
  };

  const exportPNG = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 2000 / canvasSize;
    const image = canvas.toDataURL({
      format: 'png',
      multiplier: scale,
    });
    const link = document.createElement('a');
    link.href = image;
    link.download = `copje-stamp-${Date.now()}.png`;
    link.click();
    pushStatus('Downloaded PNG @ 2000x2000');
  };

  const exportSVG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const svg = canvas.toSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `copje-stamp-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
    pushStatus('Downloaded SVG');
  };

  const copyPNG = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 2000 / canvasSize;
    const image = canvas.toDataURL({ format: 'png', multiplier: scale });
    const blob = await (await fetch(image)).blob();
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type || 'image/png']: blob,
      }),
    ]);
    pushStatus('Copied to clipboard');
  };

  const exportProjectJSON = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const json = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS), null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `copje-stamp-${Date.now()}.copje.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    pushStatus('Design JSON exported');
  };

  const loadProjectFromJSON = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const json = JSON.stringify(parsed);
      await applyHistoryState(json, true);
      pushStatus('Project loaded');
    } catch {
      pushStatus('Unable to load project JSON');
    } finally {
      if (projectInputRef.current) {
        projectInputRef.current.value = '';
      }
      setBusy(false);
    }
  };

  const applyPreset = async (presetId: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resetCanvas();
    await new Promise((resolve) => setTimeout(resolve, 20));

    if (presetId === 'default') {
      applyDefaultPreset();
      return;
    }

    if (presetId === 'approved') {
      addShapeObject('triangle', false);
      addTextObject(false, false);
      const text = canvas.getObjects().find((o) => (o as StampObject).kind === 'text') as StampObject | undefined;
      if (text) {
        text.set({
          text: 'APPROVED',
          fontFamily: mapFontFamily('Montserrat'),
          fontSize: 100,
          charSpacing: 18,
          fontWeight: 'bold',
          top: 285,
          left: 280,
          fill: inkColor,
        });
      }
    }

    if (presetId === 'confidential') {
      addShapeObject('rectangle', false);
      addTextObject(false, false);
      const text = canvas.getObjects().find((o) => (o as StampObject).kind === 'text') as StampObject | undefined;
      if (text) {
        text.set({
          text: 'CONFIDENTIAL',
          fontFamily: mapFontFamily('Arial'),
          fontSize: 92,
          fontWeight: 'bold',
          charSpacing: 8,
          top: 282,
          left: 280,
        });
      }
    }

    if (presetId === 'profile') {
      const name = new fabric.Text('Your Name', {
        uid: toId(),
        kind: 'text',
        left: 280,
        top: 205,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Arial'),
        fontWeight: 'bold',
        fontSize: 78,
        fill: inkColor,
      }) as StampObject;
      disableObjectLayoutEditing(name);
      const title = new fabric.Text('Director | Phone:', {
        uid: toId(),
        kind: 'text',
        left: 280,
        top: 280,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Times'),
        fontSize: 42,
        fill: inkColor,
      }) as StampObject;
      disableObjectLayoutEditing(title);
      const phone = new fabric.Text('+60 12-345 6789', {
        uid: toId(),
        kind: 'text',
        left: 280,
        top: 340,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Arial'),
        fontSize: 38,
        fill: inkColor,
      }) as StampObject;
      disableObjectLayoutEditing(phone);
      const shape = new fabric.Circle({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'circle',
        fill: 'rgba(0,0,0,0)',
        left: 280,
        top: 280,
        radius: 220,
        originX: 'center',
        originY: 'center',
      }) as StampObject;
      disableObjectLayoutEditing(shape);
      applyShapeBorder(shape);
      canvas.add(shape, name, title, phone);
    }

    if (presetId === 'sdn') {
      const shape = new fabric.Circle({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'circle',
        fill: 'rgba(0,0,0,0)',
        left: 280,
        top: 280,
        radius: 225,
        originX: 'center',
        originY: 'center',
      }) as StampObject;
      disableObjectLayoutEditing(shape);
      applyShapeBorder(shape);
      const topText = new fabric.Text('COMPANY SDN BHD', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 160,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Poppins'),
        fontSize: 52,
        fontWeight: 'bold',
        charSpacing: 10,
      }) as StampObject;
      disableObjectLayoutEditing(topText);
      const midText = new fabric.Text('REGISTERED', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 280,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Montserrat'),
        fontSize: 60,
        fontWeight: 'bold',
      }) as StampObject;
      disableObjectLayoutEditing(midText);
      const bottomText = new fabric.Text('STAMP', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 395,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Montserrat'),
        fontSize: 62,
        fontWeight: 'bold',
      }) as StampObject;
      disableObjectLayoutEditing(bottomText);
      canvas.add(shape, topText, midText, bottomText);
    }

    if (presetId === 'official') {
      const outer = new fabric.Circle({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'circle',
        fill: 'rgba(0,0,0,0)',
        left: 280,
        top: 280,
        radius: 230,
        originX: 'center',
        originY: 'center',
      }) as StampObject;
      const inner = new fabric.Circle({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'circle',
        fill: 'rgba(0,0,0,0)',
        left: 280,
        top: 280,
        radius: 130,
        originX: 'center',
        originY: 'center',
      }) as StampObject;
      disableObjectLayoutEditing(inner);
      disableObjectLayoutEditing(outer);
      applyShapeBorder(outer);
      inner.stroke = inkColor;
      inner.strokeWidth = 6;
      inner.strokeDashArray = [6, 8];
      const title = new fabric.Text('OFFICIAL', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 200,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Times'),
        fontSize: 78,
        fontWeight: 'bold',
      }) as StampObject;
      disableObjectLayoutEditing(title);
      const center = new fabric.Text('CIRCULAR', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 275,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Montserrat'),
        fontSize: 52,
        fontWeight: 'bold',
      }) as StampObject;
      disableObjectLayoutEditing(center);
      const footer = new fabric.Text('STAMP', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 350,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Montserrat'),
        fontSize: 54,
        fontWeight: 'bold',
      }) as StampObject;
      disableObjectLayoutEditing(footer);
      applyShapeBorder(inner);
      canvas.add(outer, inner, title, center, footer);
    }

    if (presetId === 'received') {
      const shape = new fabric.Rect({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'rectangle',
        left: 280,
        top: 280,
        originX: 'center',
        originY: 'center',
        width: 390,
        height: 210,
        fill: 'rgba(0,0,0,0)',
        stroke: inkColor,
        strokeWidth: borderWidth,
      }) as StampObject;
      disableObjectLayoutEditing(shape);
      applyShapeBorder(shape);
      const received = new fabric.Text('RECEIVED', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 220,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Montserrat'),
        fontSize: 64,
        fontWeight: 'bold',
      }) as StampObject;
      const date = new fabric.Text(getDateByFormat('DD/MM/YYYY'), {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 300,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Arial'),
        fontSize: 52,
        fontWeight: 'bold',
      }) as StampObject;
      const note = new fabric.Text('DATE', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 360,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Times'),
        fontSize: 42,
      }) as StampObject;
      disableObjectLayoutEditing(received);
      disableObjectLayoutEditing(date);
      disableObjectLayoutEditing(note);
      canvas.add(shape, received, date, note);
    }

    if (presetId === 'signature') {
      const shape = new fabric.Rect({
        uid: toId(),
        kind: 'shape',
        shapeKind: 'rectangle',
        left: 280,
        top: 280,
        originX: 'center',
        originY: 'center',
        width: 470,
        height: 270,
        fill: 'rgba(0,0,0,0)',
        stroke: inkColor,
        strokeWidth: borderWidth,
      }) as StampObject;
      disableObjectLayoutEditing(shape);
      applyShapeBorder(shape);
      const label = new fabric.Text('AUTHORIZED SIGNATURE', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 195,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Montserrat'),
        fontSize: 44,
        fontWeight: 'bold',
      }) as StampObject;
      const signLine = new fabric.Text('__________________________', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 305,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Times'),
        fontSize: 44,
      }) as StampObject;
      const name = new fabric.Text('Name', {
        uid: toId(),
        kind: 'text',
        fill: inkColor,
        left: 280,
        top: 360,
        originX: 'center',
        originY: 'center',
        fontFamily: mapFontFamily('Arial'),
        fontSize: 40,
      }) as StampObject;
      disableObjectLayoutEditing(label);
      disableObjectLayoutEditing(signLine);
      disableObjectLayoutEditing(name);
      canvas.add(shape, label, signLine, name);
    }

    canvas.renderAll();
    saveState();
    refreshLayerList();
    setStatus(`Preset "${presetId}" applied`);
  };

  const fitActiveImageToShape = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'image') {
      pushStatus('Select an uploaded image first.');
      return;
    }
    const shapeId = activeLayerIdForFit;
    if (!shapeId) {
      pushStatus('Select a shape on right as target first.');
      return;
    }
    const shape = (canvas.getObjects() as StampObject[]).find((obj) => obj.uid === shapeId && obj.kind === 'shape');
    if (!shape) {
      pushStatus('Target shape not found.');
      return;
    }

    const shapeRect = shape.getBoundingRect();
    const naturalW = active.width || active.getScaledWidth();
    const naturalH = active.height || active.getScaledHeight();
    const widthRatio = shapeRect.width * 0.78 / (naturalW || 1);
    const heightRatio = shapeRect.height * 0.78 / (naturalH || 1);
    const ratio = Math.min(widthRatio, heightRatio);
    active.scaleX = ratio;
    active.scaleY = ratio;
    active.left = shapeRect.left + shapeRect.width / 2;
    active.top = shapeRect.top + shapeRect.height / 2;
    active.setCoords();
    refreshDistressOverlay(active);
    canvas.requestRenderAll();
    saveState();
    pushStatus('Image fitted to shape');
  };

  const applyInkToActive = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active) {
      pushStatus('Select an item first.');
      return;
    }
    applyInkColor();
    saveState();
  };

  useEffect(() => {
    const canvasElement = canvasHostRef.current;
    if (!canvasElement) return;

    const canvas = new fabric.Canvas(canvasElement, {
      width: BASE_CANVAS,
      height: BASE_CANVAS,
      backgroundColor: 'rgba(0,0,0,0)',
      preserveObjectStacking: true,
      selection: false,
      uniformScaling: true,
      selectionColor: 'rgba(0,0,0,0)',
      selectionBorderColor: 'rgba(0,0,0,0)',
      hoverCursor: 'default',
    });

    canvasRef.current = canvas;

    const handleSelect = () => syncActiveObject();
    const handleClear = () => clearSelection();
    const handleMutate = (event?: { target?: fabric.Object }) => {
      if (event?.target) {
        disableObjectLayoutEditing(event.target);
      }
      syncActiveObject();
      refreshLayerList();
      saveState();
    };
    const handleModified = () => {
      syncActiveObject();
      refreshLayerList();
      saveState();
    };
    const updateCanvasFrameSize = () => {
      const frame = canvasFrameRef.current;
      const host = canvasHostRef.current;
      const shell = frame?.parentElement;
      if (!frame || !shell || !host) return;
      const available = Math.max(0, shell.clientWidth - 1);
      const target = Math.max(140, Math.min(CANVAS_VIEW_MAX, available));
      frame.style.width = `${target}px`;
      frame.style.height = `${target}px`;
      host.style.width = `${target}px`;
      host.style.height = `${target}px`;
    };

    (canvas as any).on('selection:created', handleSelect);
    (canvas as any).on('selection:updated', handleSelect);
    (canvas as any).on('selection:cleared', handleClear);
    (canvas as any).on('object:added', handleMutate);
    (canvas as any).on('object:removed', () => {
      refreshLayerList();
      saveState();
    });
    (canvas as any).on('object:modified', handleModified);

    const initial = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS));
    historyRef.current.past.push(initial);
    refreshLayerList();
    syncHistory();
    applyDefaultPreset();
    updateCanvasFrameSize();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => updateCanvasFrameSize())
        : null;
    const shell = canvasFrameRef.current?.parentElement;
    if (shell && resizeObserver) {
      resizeObserver.observe(shell);
    }
    window.addEventListener('resize', updateCanvasFrameSize);
    window.addEventListener('orientationchange', updateCanvasFrameSize);

    return () => {
      (canvas as any).off('selection:created', handleSelect);
      (canvas as any).off('selection:updated', handleSelect);
      (canvas as any).off('selection:cleared', handleClear);
      (canvas as any).off('object:added', handleMutate);
      (canvas as any).off('object:removed', () => {
        refreshLayerList();
        saveState();
      });
      (canvas as any).off('object:modified', handleModified);
      canvas.dispose();
      canvasRef.current = null;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateCanvasFrameSize);
      window.removeEventListener('orientationchange', updateCanvasFrameSize);
    };
  }, []);

  return (
    <div className="copje-page">
      <main className="copje-shell">
        <section className="copje-hero">
          <p className="copje-kicker">Cop Je! · Online Rubber Stamp Maker</p>
          <h1 className="copje-title">Create Rubber Stamps Online</h1>
        </section>

        <section className="copje-workspace-grid">
            <section className="copje-main-column">
            <section className="copje-canvas-toolbar-strip">
              <div className="copje-shape-selector" ref={shapeSelectorRef}>
                <button
                  type="button"
                  className="copje-tool-selector-btn copje-shape-selector-trigger"
                  aria-expanded={isShapeSelectorOpen}
                  aria-label={`Shapes, currently ${shapeTypeForAdd}`}
                  onClick={() => setIsShapeSelectorOpen((open) => !open)}
                >
                  Shapes
                </button>
                {isShapeSelectorOpen && (
                  <div className="copje-shape-selector-popover" role="radiogroup" aria-label="Shape options">
                    <button
                      type="button"
                      className={`copje-shape-option ${shapeTypeForAdd === 'circle' ? 'is-active' : ''}`}
                      onClick={() => handleShapeSelect('circle')}
                    >
                      <span className="copje-shape-radio" />
                      <span>Circle</span>
                    </button>
                    <button
                      type="button"
                      className={`copje-shape-option ${shapeTypeForAdd === 'rectangle' ? 'is-active' : ''}`}
                      onClick={() => handleShapeSelect('rectangle')}
                    >
                      <span className="copje-shape-radio" />
                      <span>Rectangle</span>
                    </button>
                    <button
                      type="button"
                      className={`copje-shape-option ${shapeTypeForAdd === 'triangle' ? 'is-active' : ''}`}
                      onClick={() => handleShapeSelect('triangle')}
                    >
                      <span className="copje-shape-radio" />
                      <span>Triangle</span>
                    </button>
                  </div>
                )}
              </div>
            </section>
            <div
              ref={canvasFrameRef}
              className="copje-canvas-frame-inner"
              style={{ width: `${CANVAS_VIEW_MAX}px`, height: `${CANVAS_VIEW_MAX}px` }}
            >
              <div className="copje-canvas-ruler" />
              <canvas
                ref={canvasHostRef}
                className="copje-canvas"
                width={canvasSize}
                height={canvasSize}
                style={{ width: `${CANVAS_VIEW_MAX}px`, height: `${CANVAS_VIEW_MAX}px` }}
              />
              <div className={`copje-guide x ${guides.x ? 'on' : ''}`} />
              <div className={`copje-guide y ${guides.y ? 'on' : ''}`} />
            </div>
            <section className="copje-tool-content">
              <section className="copje-toolbar">
                <h3>Shapes</h3>

                <label className="copje-field-label">Size</label>
                <input
                  className="copje-range"
                  type="range"
                  min={76}
                  max={520}
                  value={shapeWidth}
                  onChange={(event) => handleShapeSizeChange(Number(event.target.value))}
                />
                <label className="copje-field-label">Stroke</label>
                <input
                  className="copje-range"
                  type="range"
                  min={1}
                  max={40}
                  value={borderWidth}
                  onChange={(event) => handleShapeStrokeChange(Number(event.target.value))}
                />
                <label className="copje-field-label">Line Break</label>
                <input
                  className="copje-range"
                  type="range"
                  min={0}
                  max={80}
                  value={lineBreak}
                  onChange={(event) => handleLineBreakChange(Number(event.target.value))}
                />
              </section>

              <section className="copje-toolbar">
                <h3>Text</h3>
                <label className="copje-field-label">Text value</label>
                <input
                  className="copje-input"
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value)}
                  placeholder="Enter stamp text"
                />
                <label className="copje-field-label">Font</label>
                <select
                  className="copje-select"
                  value={selectedFont}
                  onChange={(event) => setSelectedFont(event.target.value as FontChoice)}
                >
                  {FONT_CHOICES.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
                <label className="copje-field-label">Font size: {fontSize}px</label>
                <input
                  className="copje-range"
                  type="range"
                  min={24}
                  max={160}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                />
                <div className="copje-toolbar-grid">
                  <button
                    className="copje-btn copje-btn-ghost"
                    onClick={() => setFontWeight(fontWeight === 'bold' ? 'normal' : 'bold')}
                  >
                    Toggle Weight
                  </button>
                  <button
                    className="copje-btn copje-btn-ghost"
                    onClick={() => setFontStyle(fontStyle === 'italic' ? 'normal' : 'italic')}
                  >
                    Toggle Style
                  </button>
                </div>
                <label className="copje-field-label">Letter spacing: {letterSpacing}</label>
                <input
                  className="copje-range"
                  type="range"
                  min={-12}
                  max={18}
                  value={letterSpacing}
                  onChange={(event) => setLetterSpacing(Number(event.target.value))}
                />
                <label className="copje-field-label">Arc angle: {curveAngle}°</label>
                <input
                  className="copje-range"
                  type="range"
                  min={-180}
                  max={180}
                  value={curveAngle}
                  onChange={(event) => setCurveAngle(Number(event.target.value))}
                />
                <label className="copje-field-label">Color</label>
                <input
                  className="copje-color"
                  type="color"
                  value={inkColor}
                  onChange={(event) => setInkColor(event.target.value)}
                />
                <div className="copje-swatch-grid">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="copje-swatch"
                      style={{ background: color }}
                      onClick={() => setInkColor(color)}
                      aria-label={`Use color ${color}`}
                    />
                  ))}
                </div>
                <label className="copje-field-label">Opacity: {opacity}%</label>
                <input
                  className="copje-range"
                  type="range"
                  min={10}
                  max={100}
                  value={opacity}
                  onChange={(event) => setOpacity(Number(event.target.value))}
                />
                <div className="copje-toolbar-grid">
                  <button className="copje-btn copje-btn-primary" onClick={() => addTextObject(false)}>
                    Add Text
                  </button>
                  <button className="copje-btn copje-btn-primary" onClick={() => addTextObject(true)}>
                    Add Arc Text
                  </button>
                  <button className="copje-btn copje-btn-ghost" onClick={applyActiveText}>
                    Update Selected Text
                  </button>
                  <button className="copje-btn copje-btn-ghost" onClick={applyInkToActive}>
                    Apply Color
                  </button>
                </div>
              </section>

            </section>
          </section>
        </section>
      </main>

      <footer className="copje-footer">
        For design and mockup use only. Do not use to forge official documents.
      </footer>
    </div>
  );
}
