'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  Copy,
  Download,
  Image as ImageIcon,
  Layers,
  Menu,
  Minus,
  Palette,
  Plus,
  RefreshCw,
  Type,
  X,
  Play,
} from 'lucide-react';
import * as fabric from 'fabric';

import './copje-editor.css';

type FontChoice = 'Arial' | 'Times' | 'Montserrat' | 'Bebas Neue' | 'Poppins';
type ShapeChoice = 'circle' | 'rectangle' | 'oval';
type BorderStyle = 'solid' | 'dashed' | 'double';
type DateFormat = 'DD/MM/YYYY' | 'MM-DD-YYYY' | 'DD.MM.YYYY';

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
const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY'];
const DATE_PRESETS = ['DATE:'];
const COLOR_PRESETS = ['#111111', '#2d62ff', '#d7263d', '#2c8a4b'];
const STAMP_JSON_EXTRAS = ['uid', 'kind', 'shapeKind', 'borderStyle', 'sourceText', 'curveAngle', 'isDistressed'];

const BASE_CANVAS = 560;
const MAX_HISTORY = 60;
const SNAP_CENTER = 12;

const mapFontFamily = (font: FontChoice) => {
  if (font === 'Times') return 'Times New Roman';
  return font;
};

const toId = () => `stamp-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatDateNow = (format: DateFormat, includePrefix: boolean) => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const output =
    format === 'MM-DD-YYYY'
      ? `${mm}-${dd}-${yyyy}`
      : format === 'DD.MM.YYYY'
        ? `${dd}.${mm}.${yyyy}`
        : `${dd}/${mm}/${yyyy}`;

  return includePrefix ? `DATE: ${output}` : output;
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
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const ignoreHistoryRef = useRef(false);
  const distressMapRef = useRef(new Map<string, fabric.Object>());
  const historyRef = useRef<{ past: string[]; future: string[] }>({
    past: [],
    future: [],
  });

  const [started, setStarted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState({ x: false, y: false });
  const [canvasSize] = useState(BASE_CANVAS);
  const [busy, setBusy] = useState(false);

  const [canvasObjects, setCanvasObjects] = useState<{ id: string; label: string; type: string }[]>([]);
  const [activeObjectId, setActiveObjectId] = useState<string | null>(null);
  const [activeObjectType, setActiveObjectType] = useState('none');
  const [status, setStatus] = useState('Ready');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [activeLayerIdForFit, setActiveLayerIdForFit] = useState<string | null>(null);

  const [textValue, setTextValue] = useState('APPROVED');
  const [selectedFont, setSelectedFont] = useState<FontChoice>('Arial');
  const [fontSize, setFontSize] = useState(80);
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('bold');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [curveAngle, setCurveAngle] = useState(0);

  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY');
  const [datePrefix, setDatePrefix] = useState(true);

  const [borderWidth, setBorderWidth] = useState(10);
  const [borderStyle, setBorderStyle] = useState<BorderStyle>('solid');
  const [activeShapeForFit] = useState('');

  const [inkColor, setInkColor] = useState(COLOR_PRESETS[0]);
  const [opacity, setOpacity] = useState(100);
  const [distressedEnabled, setDistressedEnabled] = useState(false);
  const [stripBg, setStripBg] = useState(false);

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const entries = canvas.getObjects().reduce<{ id: string; label: string; type: string }[]>((acc, shape) => {
      const layer = shape as StampObject;
      if (!layer.kind || layer.kind === 'distress') return acc;
      const label =
        layer.kind === 'text' || layer.kind === 'arc-text'
          ? String((layer as any).text || layer.sourceText || 'Text').slice(0, 24) || 'Text'
          : layer.kind === 'shape'
            ? `Shape (${layer.shapeKind || 'circle'})`
            : layer.kind === 'image'
              ? 'Image / Logo'
              : layer.type;
      const id = layer.uid || toId();
      layer.uid = id;
      acc.push({ id, label, type: layer.kind });
      return acc;
    }, []);
    setCanvasObjects(entries.reverse());
  };

  const clearSelection = () => {
    setActiveObjectId(null);
    setActiveObjectType('none');
    setDistressedEnabled(false);
    setActiveLayerIdForFit(null);
  };

  const syncActiveObject = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind === 'distress') {
      clearSelection();
      return;
    }

    setActiveObjectId(active.uid || null);
    setActiveObjectType(active.kind || active.type);
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
      setBorderWidth(Math.round(Number(active.strokeWidth || borderWidth)));
      setBorderStyle(active.borderStyle || 'solid');
      setDistressedEnabled(Boolean(active.isDistressed));
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

  const applyShapeBorder = (target: StampObject) => {
    if (!target) return;
    target.set({
      strokeWidth: borderWidth,
      strokeUniform: true,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      stroke: inkColor,
    });

    if (borderStyle === 'dashed') {
      target.set({ strokeDashArray: [12, 8] });
    } else if (borderStyle === 'double') {
      target.set({
        stroke: inkColor,
        strokeDashArray: [1, 2, 8, 2, 1],
      });
    } else {
      target.set({ strokeDashArray: [] });
    }
    if (target.kind === 'shape') {
      target.borderStyle = borderStyle;
    }
    refreshDistressOverlay(target);
  };

  const applyDefaultPreset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    distressMapRef.current.clear();
    historyRef.current = { past: [], future: [] };
    canvas.clear();
    canvas.backgroundColor = 'rgba(0,0,0,0)';
    const circle = new fabric.Circle({
      uid: toId(),
      kind: 'shape',
      shapeKind: 'circle',
      fill: 'rgba(0,0,0,0)',
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
      radius: 190,
      stroke: inkColor,
      strokeWidth: borderWidth,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
    }) as StampObject;

    const text = new fabric.Text('STAMP', {
      uid: toId(),
      kind: 'text',
      fill: inkColor,
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
      fontFamily: mapFontFamily('Arial'),
      fontSize: 95,
      fontWeight: 'bold',
      fontStyle: 'normal',
      charSpacing: 8,
      opacity: opacity / 100,
    }) as StampObject;

    applyShapeBorder(circle);
    canvas.add(circle, text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    saveState();
    refreshLayerList();
    setStatus('Preset "default" applied');
  };

  const pushStatus = (message: string, timeout = 2200) => {
    setStatus(message);
    if (timeout > 0) {
      window.setTimeout(() => {
        setStatus('Ready');
      }, timeout);
    }
  };

  const applyHistoryState = (json: string) =>
    new Promise<void>((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve();
      ignoreHistoryRef.current = true;
      canvas.loadFromJSON(json, () => {
        assignObjectUids(canvas);
        refreshLayerList();
        syncActiveObject();
        canvas.requestRenderAll();
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

  const onCanvasEvents = (event: { target?: fabric.Object | undefined }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = event.target as StampObject | undefined;
    if (!target || !target.uid) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const bWidth = target.getScaledWidth();
    const bHeight = target.getScaledHeight();
    const midX = (target.left || 0) + bWidth / 2;
    const midY = (target.top || 0) + bHeight / 2;

    let guideX = false;
    let guideY = false;
    const updatedLeft = target.left || 0;
    const updatedTop = target.top || 0;
    if (Math.abs(midX - centerX) <= SNAP_CENTER) {
      target.left = centerX - bWidth / 2;
      guideX = true;
    }
    if (Math.abs(midY - centerY) <= SNAP_CENTER) {
      target.top = centerY - bHeight / 2;
      guideY = true;
    }

    if (guideX || guideY) {
      setGuides({ x: guideX, y: guideY });
      window.clearTimeout((onCanvasEvents as unknown as { __t?: number }).__t);
      (onCanvasEvents as unknown as { __t?: number }).__t = window.setTimeout(() => {
        setGuides({ x: false, y: false });
      }, 500);
    }
    target.setCoords();
    refreshDistressOverlay(target);
    target.set({ left: updatedLeft, top: updatedTop });
    canvas.requestRenderAll();
    syncActiveObject();
  };

  const addTextObject = (asArc = false, record = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = textValue.trim() || 'APPROVED';

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
        rx: 20,
        ry: 20,
        stroke: inkColor,
        strokeWidth: borderWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
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
        rx: 190,
        ry: 120,
        fill: 'rgba(0,0,0,0)',
        stroke: inkColor,
        strokeWidth: borderWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      }) as StampObject;
    }

    if (!shapeObject) return;

    applyShapeBorder(shapeObject);
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
    canvas.backgroundColor = 'rgba(0,0,0,0)';
    canvas.requestRenderAll();
    historyRef.current = { past: [], future: [] };
    distressMapRef.current.clear();
    refreshLayerList();
    clearSelection();
    saveState();
    pushStatus('Canvas reset');
  };

  const applyBorderToActive = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') {
      pushStatus('Select a shape first.');
      return;
    }
    applyShapeBorder(active);
    canvas.requestRenderAll();
    saveState();
    pushStatus('Shape border updated');
  };

  const jumpToTarget = (id: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const object = (canvas.getObjects() as StampObject[]).find((shape) => shape.uid === id);
    if (!object) return;
    canvas.setActiveObject(object);
    canvas.requestRenderAll();
    syncActiveObject();
  };

  const setZoomLevel = (next: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const center = new fabric.Point(canvas.width / 2, canvas.height / 2);
    const safe = clamp(next, 0.5, 3);
    canvas.zoomToPoint(center, safe);
    setZoom(Number(safe.toFixed(2)));
    canvas.requestRenderAll();
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

  const applyPreset = async (presetId: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resetCanvas();
    await new Promise((resolve) => setTimeout(resolve, 20));

    if (presetId === 'received-date') {
      const shape = addShapeObject('circle', false);
      addTextObject(false, false);
      const shapeObj = canvas.getObjects().find((o) => (o as StampObject).kind === 'shape') as StampObject | undefined;
      const textObj = canvas.getObjects().find((o) => (o as StampObject).kind === 'text') as StampObject | undefined;
      if (shapeObj) {
        shapeObj.set({ fill: 'rgba(0,0,0,0)' });
      }
      if (textObj) {
        textObj.set({
          text: 'RECEIVED',
          top: 220,
          left: 280,
          fontFamily: mapFontFamily('Bebas Neue'),
          fontSize: 110,
          fontWeight: 'bold',
          fontStyle: 'normal',
          fill: inkColor,
          charSpacing: 22,
        });
      }
      const date = formatDateNow(dateFormat, datePrefix);
      const dateText = new fabric.Text(date, {
        uid: toId(),
        kind: 'text',
        left: 280,
        top: 380,
        fill: inkColor,
        fontFamily: mapFontFamily('Arial'),
        fontSize: 58,
        fontWeight: 'bold',
        fontStyle: 'normal',
        opacity: opacity / 100,
        originX: 'center',
        originY: 'center',
      }) as StampObject;
      canvas.add(dateText);
    }

    if (presetId === 'default') {
      applyDefaultPreset();
      return;
    }

    if (presetId === 'approved') {
      addShapeObject('oval', false);
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
      applyShapeBorder(inner);
      canvas.add(outer, inner, title, center, footer);
    }

    canvas.renderAll();
    saveState();
    refreshLayerList();
    setStatus(`Preset "${presetId}" applied`);
  };

  const centerCanvas = () => {
    const workspace = workspaceRef.current;
    if (workspace) {
      workspace.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

  useEffect(() => {
    if (started) return;
    const canvasElement = canvasHostRef.current;
    if (!canvasElement) return;

    const canvas = new fabric.Canvas(canvasElement, {
      width: BASE_CANVAS,
      height: BASE_CANVAS,
      backgroundColor: 'rgba(0,0,0,0)',
      preserveObjectStacking: true,
      selection: true,
      uniformScaling: true,
    });

    canvasRef.current = canvas;

    const handleSelect = () => syncActiveObject();
    const handleClear = () => clearSelection();
    const handleMutate = () => {
      syncActiveObject();
      refreshLayerList();
      saveState();
    };
    const handleModified = () => {
      syncActiveObject();
      refreshLayerList();
      saveState();
    };

    (canvas as any).on('selection:created', handleSelect);
    (canvas as any).on('selection:updated', handleSelect);
    (canvas as any).on('selection:cleared', handleClear);
    (canvas as any).on('object:added', handleMutate);
    (canvas as any).on('object:removed', () => {
      refreshLayerList();
      saveState();
    });
    (canvas as any).on('object:moving', onCanvasEvents);
    (canvas as any).on('object:modified', handleModified);
    (canvas as any).on('mouse:down', () => {
      const guide = onCanvasEvents as unknown as { __t?: number };
      if (guide.__t) {
        window.clearTimeout(guide.__t);
        guide.__t = undefined;
        setGuides({ x: false, y: false });
      }
    });

    const initial = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS));
    historyRef.current.past.push(initial);
    refreshLayerList();
    syncHistory();
    setStarted(true);
    applyDefaultPreset();

    return () => {
      (canvas as any).off('selection:created', handleSelect);
      (canvas as any).off('selection:updated', handleSelect);
      (canvas as any).off('selection:cleared', handleClear);
      (canvas as any).off('object:added', handleMutate);
      (canvas as any).off('object:removed', () => {
        refreshLayerList();
        saveState();
      });
      (canvas as any).off('object:moving', onCanvasEvents);
      (canvas as any).off('object:modified', handleModified);
      (canvas as any).off('mouse:down', () => {
        setGuides({ x: false, y: false });
      });
      canvas.dispose();
      canvasRef.current = null;
    };
  }, []);

  return (
    <div className="copje-page">
      <main className="copje-shell">
        <section className="copje-hero">
          <p className="copje-kicker">CopJe! · Online Rubber Stamp Maker</p>
          <h1 className="copje-title">Create Rubber Stamps Online</h1>
        </section>

        <section ref={workspaceRef} className="copje-workspace-grid">
          <aside className={`copje-tool-drawer ${mobileToolsOpen ? 'open' : ''}`}>
            <div className="copje-tool-header">
              <div>
                <p className="copje-tool-kicker">Tool studio</p>
                <h2 className="copje-tool-title">Build controls</h2>
              </div>
              <button
                type="button"
                className="copje-btn copje-btn-ghost lg:hidden"
                onClick={() => setMobileToolsOpen(false)}
              >
                <X size={14} />
                close
              </button>
            </div>

            <section className="copje-toolbar">
              <h3>1) Text Tools</h3>
              <button
                type="button"
                className="copje-btn copje-btn-primary"
                onClick={() => {
                  centerCanvas();
                  setMobileToolsOpen(false);
                  setStatus('Ready');
                }}
              >
                <Play size={14} />
                Start
              </button>

              <div className="copje-toolbar-grid">
                <button type="button" className="copje-btn" onClick={() => addTextObject(false)}>
                  <Type size={14} />
                  Add text
                </button>
                <button type="button" className="copje-btn" onClick={() => addTextObject(true)}>
                  <RefreshCw size={14} />
                  Add arc text
                </button>
              </div>

              <div className="copje-toolbar-grid">
                <button
                  type="button"
                  className={`copje-btn ${fontWeight === 'bold' ? 'copje-btn-primary' : ''}`}
                  onClick={() => setFontWeight((prev) => (prev === 'bold' ? 'normal' : 'bold'))}
                >
                  Bold
                </button>
                <button
                  type="button"
                  className={`copje-btn ${fontStyle === 'italic' ? 'copje-btn-primary' : ''}`}
                  onClick={() => setFontStyle((prev) => (prev === 'italic' ? 'normal' : 'italic'))}
                >
                  Italic
                </button>
              </div>

              <label className="copje-field-label">Font family</label>
              <select
                value={selectedFont}
                onChange={(event) => setSelectedFont(event.target.value as FontChoice)}
                className="copje-select"
              >
                {FONT_CHOICES.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>

              <label className="copje-field-label">Font size: {fontSize}px</label>
              <input
                type="range"
                min={26}
                max={180}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="copje-range"
              />

              <label className="copje-field-label">Letter spacing: {letterSpacing}</label>
              <input
                type="range"
                min={-20}
                max={120}
                value={letterSpacing}
                onChange={(event) => setLetterSpacing(Number(event.target.value))}
                className="copje-range"
              />

              <label className="copje-field-label">Arc curve: {curveAngle}°</label>
              <input
                type="range"
                min={-180}
                max={180}
                value={curveAngle}
                onChange={(event) => setCurveAngle(Number(event.target.value))}
                className="copje-range"
              />

              <button type="button" className="copje-btn w-full" onClick={applyActiveText}>
                Apply text changes
              </button>
            </section>

            <section className="copje-toolbar">
              <h3>2) Auto Date Stamp</h3>
              <div className="copje-toolbar-grid">
                {DATE_FORMATS.map((format) => (
                  <button
                    type="button"
                    key={format}
                    className={`copje-btn ${dateFormat === format ? 'copje-btn-primary' : ''}`}
                    onClick={() => setDateFormat(format)}
                  >
                    {format}
                  </button>
                ))}
              </div>
              <label className="copje-field-label mt-2">
                {DATE_PRESETS[0]}
                <input type="checkbox" checked={datePrefix} onChange={(event) => setDatePrefix(event.target.checked)} />
              </label>
              <button type="button" className="copje-btn w-full" onClick={() => addTextObject(false)}>
                Insert auto date
              </button>
            </section>

            <section className="copje-toolbar">
              <h3>3) Stamp Shapes</h3>
              <div className="copje-toolbar-grid">
                <button type="button" className="copje-btn" onClick={() => addShapeObject('circle')}>
                  <Circle size={14} />
                  Circle
                </button>
                <button type="button" className="copje-btn" onClick={() => addShapeObject('rectangle')}>
                  ▦ Rectangle
                </button>
                <button type="button" className="copje-btn" onClick={() => addShapeObject('oval')}>
                  Oval
                </button>
              </div>

              <label className="copje-field-label">Border thickness: {borderWidth}px</label>
              <input
                type="range"
                min={2}
                max={28}
                value={borderWidth}
                onChange={(event) => setBorderWidth(Number(event.target.value))}
                className="copje-range"
              />
              <div className="copje-toolbar-grid">
                <button
                  type="button"
                  className={`copje-btn ${borderStyle === 'solid' ? 'copje-btn-primary' : ''}`}
                  onClick={() => setBorderStyle('solid')}
                >
                  solid
                </button>
                <button
                  type="button"
                  className={`copje-btn ${borderStyle === 'dashed' ? 'copje-btn-primary' : ''}`}
                  onClick={() => setBorderStyle('dashed')}
                >
                  dashed
                </button>
                <button
                  type="button"
                  className={`copje-btn ${borderStyle === 'double' ? 'copje-btn-primary' : ''}`}
                  onClick={() => setBorderStyle('double')}
                >
                  double line
                </button>
              </div>
              <button type="button" className="copje-btn w-full" onClick={applyBorderToActive}>
                Apply shape style
              </button>
            </section>

            <section className="copje-toolbar">
              <h3>4) Image / Logo</h3>
              <label className="copje-field-label">Upload PNG / JPG</label>
              <input
                type="file"
                className="copje-input"
                accept="image/png,image/jpg,image/jpeg"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const data = await getFileAsDataUrl(file);
                  await addImageObject(data);
                }}
              />
              <label className="copje-field-label">
                <input type="checkbox" checked={stripBg} onChange={(event) => setStripBg(event.target.checked)} />
                Remove white background
              </label>
              <button type="button" className="copje-btn w-full" onClick={fitActiveImageToShape}>
                <ImageIcon size={14} />
                Fit image to selected shape
              </button>
            </section>

            <section className="copje-toolbar">
              <h3>5) Ink & Effects</h3>
              <label className="copje-field-label">Ink color</label>
              <div className="copje-color-row">
                <input
                  type="color"
                  className="copje-color"
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
                      aria-label={`Ink color ${color}`}
                    />
                  ))}
                </div>
              </div>
              <label className="copje-field-label">Opacity: {opacity}%</label>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(event) => setOpacity(Number(event.target.value))}
                className="copje-range"
              />
              <div className="copje-toolbar-grid">
                <button type="button" className="copje-btn" onClick={applyInkColor}>
                  <Palette size={14} />
                  Apply ink
                </button>
                <button type="button" className="copje-btn" onClick={applyOpacity}>
                  Apply opacity
                </button>
              </div>

              <label className="copje-field-label mt-2">
                <input
                  type="checkbox"
                  checked={distressedEnabled}
                  onChange={async (event) => {
                    const value = event.target.checked;
                    const canvas = canvasRef.current;
                    setDistressedEnabled(value);
                    if (!canvas) return;
                    const active = canvas.getActiveObject() as StampObject | null;
                    if (!active || active.kind !== 'shape') return;
                    applyDistressToShape(active, value);
                    saveState();
                  }}
                />
                Distressed / grunge effect
              </label>
            </section>

            <section className="copje-toolbar">
              <h3>6) Preset Templates</h3>
              <div className="copje-space-y">
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('default')}>
                  Default (basic)
                </button>
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('received-date')}>
                  RECEIVED + date
                </button>
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('approved')}>
                  APPROVED
                </button>
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('confidential')}>
                  CONFIDENTIAL
                </button>
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('profile')}>
                  Name + Title + Phone Number
                </button>
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('sdn')}>
                  Company Sdn Bhd circular stamp
                </button>
                <button type="button" className="copje-btn w-full" onClick={() => applyPreset('official')}>
                  Official circular stamp style
                </button>
              </div>
            </section>

            <section className="copje-toolbar">
              <h3>7) Layers</h3>
              <div className="copje-toolbar-grid">
                <button type="button" className="copje-btn" onClick={duplicateActive} disabled={!activeObjectId}>
                  Duplicate
                </button>
                <button type="button" className="copje-btn" onClick={removeActive} disabled={!activeObjectId}>
                  Delete
                </button>
              </div>
              <div className="copje-toolbar-grid mt-2">
                <button type="button" className="copje-btn" onClick={undo} disabled={!canUndo}>
                  Undo
                </button>
                <button type="button" className="copje-btn" onClick={redo} disabled={!canRedo}>
                  Redo
                </button>
              </div>
              <button type="button" className="copje-btn w-full" onClick={resetCanvas}>
                Reset canvas
              </button>
            </section>

            <section className="copje-toolbar">
              <h3>8) Export</h3>
              <div className="copje-toolbar-grid">
                <button type="button" className="copje-btn" onClick={exportPNG}>
                  <Download size={14} />
                  PNG (2000x2000)
                </button>
                <button type="button" className="copje-btn" onClick={exportSVG}>
                  SVG
                </button>
                <button type="button" className="copje-btn" onClick={copyPNG}>
                  <Copy size={14} />
                  Copy
                </button>
              </div>
              <button type="button" className="copje-btn w-full" onClick={() => setMobileToolsOpen(false)}>
                Done
              </button>
            </section>
          </aside>

          <section className="copje-canvas-frame">
            <header className="copje-canvas-header">
              <div>
                <p className="copje-tool-kicker">Canvas stage</p>
                <h2 className="copje-tool-title">Rubber stamp preview</h2>
              </div>
              <div className="copje-zoom-row">
                <button type="button" className="copje-btn" onClick={() => setZoomLevel(zoom - 0.1)}>
                  <Minus size={13} />
                </button>
                <span className="copje-zoom-value">{Math.round(zoom * 100)}%</span>
                <button type="button" className="copje-btn" onClick={() => setZoomLevel(zoom + 0.1)}>
                  <Plus size={13} />
                </button>
              </div>
            </header>

            <div className="copje-canvas-shell">
              <div className="copje-canvas-frame-inner">
                <div className="copje-canvas-ruler" />
                <canvas ref={canvasHostRef} className="copje-canvas" width={canvasSize} height={canvasSize} />
                <div className={`copje-guide x ${guides.x ? 'on' : ''}`} />
                <div className={`copje-guide y ${guides.y ? 'on' : ''}`} />
              </div>
            </div>

            {activeObjectType !== 'none' ? (
              <p className="copje-status">
                {`Editing: ${activeObjectType} ${activeObjectId ? `• ${activeObjectId}` : ''}`}
              </p>
            ) : null}
            {status !== 'Ready' ? <p className="copje-status">{status}</p> : null}
            {busy && <p className="copje-status">Working...</p>}
          </section>

          <aside className="copje-layer-panel">
            <div className="copje-layer-header">
              <p className="copje-tool-kicker">Layer stack</p>
              <h2 className="copje-tool-title">Layers</h2>
              <Layers size={15} />
            </div>
            <div className="copje-layer-list">
              {canvasObjects.length === 0 ? <p className="copje-empty">No layers yet</p> : null}
              {canvasObjects.map((entry) => {
                const isActive = entry.id === activeObjectId;
                return (
                  <button
                    type="button"
                    key={entry.id}
                    className={`copje-layer-item ${isActive ? 'active' : ''}`}
                    onClick={() => jumpToTarget(entry.id)}
                  >
                    <span>{entry.label}</span>
                    <span className="copje-layer-id">{entry.id}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        </section>

        <button
          type="button"
          className="copje-mobile-toggle lg:hidden"
          onClick={() => setMobileToolsOpen(true)}
        >
          <Menu size={14} /> Tools
        </button>
      </main>

      <footer className="copje-footer">
        For design and mockup use only. Do not use to forge official documents.
      </footer>
    </div>
  );
}
