'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import * as fabric from 'fabric';
import {
  Copy,
  Download,
  FileJson,
  ImageIcon,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  ArrowUpDown,
} from 'lucide-react';

import './copje-editor.css';

type FontChoice = 'Arial' | 'Times' | 'Montserrat' | 'Bebas Neue' | 'Poppins';
type ShapeChoice = 'circle' | 'rectangle' | 'triangle' | 'oval';
type BorderStyle = 'solid' | 'dashed' | 'double';
type DateFormat = 'DD/MM/YYYY' | 'MM-DD-YYYY' | 'DD.MM.YYYY' | 'YYYY-MM-DD';
type LayerItem = {
  id: string;
  label: string;
  kind: 'text' | 'arc-text' | 'shape' | 'image' | 'distress';
  order: number;
};
type ShapeDimensions = {
  size?: number;
  width?: number;
  height?: number;
};
type CanvasSizeDisplay = {
  width: number;
  height?: number;
};
type ShapeStyle = {
  strokeWidth?: number;
  lineBreak?: number;
  mm?: ShapeDimensions;
};

type StampObject = fabric.Object & {
  uid?: string;
  layerNumber?: number;
  kind?: 'text' | 'arc-text' | 'shape' | 'image' | 'distress';
  shapeKind?: ShapeChoice;
  targetShapeId?: string;
  textRadiusValue?: number;
  textSpacingValue?: number;
  textStartPointValue?: number;
  textFlipHorizontal?: boolean;
  textSideValues?: string[];
  textSideFlips?: boolean[];
  shapeSizeValue?: number;
  shapeOuterWidth?: number;
  shapeOuterHeight?: number;
  shapeMmWidth?: number;
  shapeMmHeight?: number;
  shapeStrokeWidth?: number;
  shapeLineBreak?: number;
  borderStyle?: BorderStyle;
  sourceText?: string;
  curveAngle?: number;
  isDistressed?: boolean;
};

const FONT_CHOICES: FontChoice[] = ['Arial', 'Times', 'Montserrat', 'Bebas Neue', 'Poppins'];
const COLOR_PRESETS = ['#111111', '#2d62ff', '#d7263d', '#2c8a4b'];
const CANVAS_BG_PRESETS = ['#ffffff', '#f3f7ff', '#fff7ef', '#edf6ff', '#f1f5f0'];
const DATE_FORMAT_OPTIONS: DateFormat[] = ['DD/MM/YYYY', 'MM-DD-YYYY', 'DD.MM.YYYY', 'YYYY-MM-DD'];
const STAMP_JSON_EXTRAS = ['uid', 'layerNumber', 'kind', 'shapeKind', 'textRadiusValue', 'textSpacingValue', 'textStartPointValue', 'textFlipHorizontal', 'textSideValues', 'textSideFlips', 'shapeSizeValue', 'shapeOuterWidth', 'shapeOuterHeight', 'shapeMmWidth', 'shapeMmHeight', 'shapeStrokeWidth', 'shapeLineBreak', 'borderStyle', 'sourceText', 'curveAngle', 'isDistressed'];

const BASE_CANVAS = 560;
const MOBILE_CANVAS_VIEW_MAX = 240;
const DESKTOP_CANVAS_VIEW_MAX = 400;
const NEW_STAMP_SIZE = 100;
const SHAPE_PRESET_MM: Record<ShapeChoice, ShapeDimensions> = {
  circle: { size: 32 },
  oval: { width: 45, height: 28 },
  triangle: { size: 44 },
  rectangle: { width: 47, height: 18 },
};
const NEW_STAMP_STROKE = 5;
const NEW_STAMP_LINE_BREAK = 0;
const SHAPE_CONTROL_MIN = 0;
const SHAPE_CONTROL_MAX = 100;
const NEW_STAMP_DIMENSION_MIN = 0;
const NEW_STAMP_DIMENSION_MAX = 100;
const TEXT_RADIUS_DEFAULT = 100;
const TEXT_SPACING_DEFAULT = 100;
const TEXT_START_POINT_DEFAULT = 50;
const INNER_SHAPE_TEXT_FONT_SIZE = 36;
const SHAPE_CANVAS_MARGIN = 14;
const MAX_HISTORY = 60;
const SNAP_CENTER = 12;

const mapFontFamily = (font: FontChoice) => {
  if (font === 'Times') return 'Times New Roman';
  return font;
};

const toId = () => `stamp-${Math.random().toString(36).slice(2, 10)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatShapeName = (shape?: ShapeChoice) => {
  if (!shape) return 'Shape';
  if (shape === 'oval') return 'Ellipse';
  return shape.charAt(0).toUpperCase() + shape.slice(1);
};

const getDateByFormat = (format: DateFormat, date = new Date()) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  if (format === 'MM-DD-YYYY') return `${month}-${day}-${year}`;
  if (format === 'DD.MM.YYYY') return `${day}.${month}.${year}`;
  if (format === 'YYYY-MM-DD') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
};

const getShapeTextLabel = (shape: ShapeChoice) => `Text on the inner ${shape === 'oval' ? 'ellipse' : shape}`;
const getShapeAroundTextLabel = (shape: ShapeChoice) => `Text around the ${shape === 'oval' ? 'ellipse' : shape}`;

const getCanvasSizedShapeDimensions = (shape: ShapeChoice, dimensions: ShapeDimensions): ShapeDimensions => {
  if (shape === 'circle' || shape === 'triangle') return { size: SHAPE_CONTROL_MAX };
  const width = Math.max(1, dimensions.width || SHAPE_CONTROL_MAX);
  const height = Math.max(1, dimensions.height || SHAPE_CONTROL_MAX);
  const maxDimension = Math.max(width, height);
  return {
    width: Math.round((width / maxDimension) * SHAPE_CONTROL_MAX),
    height: Math.round((height / maxDimension) * SHAPE_CONTROL_MAX),
  };
};

const getShapeCanvasSizeDisplay = (target?: StampObject | null): CanvasSizeDisplay => {
  if (target?.shapeMmWidth) {
    return target.shapeMmHeight && target.shapeMmHeight !== target.shapeMmWidth
      ? { width: target.shapeMmWidth, height: target.shapeMmHeight }
      : { width: target.shapeMmWidth };
  }
  const preset = target?.shapeKind ? SHAPE_PRESET_MM[target.shapeKind] : SHAPE_PRESET_MM.circle;
  if (preset.width && preset.height) return { width: preset.width, height: preset.height };
  return { width: preset.size || SHAPE_PRESET_MM.circle.size || 32 };
};

const formatCanvasSize = (size: CanvasSizeDisplay) =>
  typeof size.height === 'number' ? `${size.width} x ${size.height}` : `${size.width}`;

const pushPathPolygon = (path: (string | number)[][], points: { x: number; y: number }[]) => {
  if (!points.length) return;
  path.push(['M', points[0].x, points[0].y]);
  points.slice(1).forEach((point) => path.push(['L', point.x, point.y]));
  path.push(['Z']);
};

const getArcRingPath = (outerWidth: number, outerHeight: number, strokeWidth: number, lineBreakValue = 0) => {
  const safeOuterWidth = Math.max(1, outerWidth);
  const safeOuterHeight = Math.max(1, outerHeight);
  const safeStroke = Math.max(0, Math.min(strokeWidth, safeOuterWidth / 2 - 1, safeOuterHeight / 2 - 1));
  const safeLineBreak = Math.max(0, Math.round(lineBreakValue));
  const outerRx = safeOuterWidth / 2;
  const outerRy = safeOuterHeight / 2;
  const innerRx = Math.max(1, outerRx - safeStroke);
  const innerRy = Math.max(1, outerRy - safeStroke);
  const path: (string | number)[][] = [];
  const circumference = Math.PI * (3 * (outerRx + outerRy) - Math.sqrt((3 * outerRx + outerRy) * (outerRx + 3 * outerRy)));
  const dashLength = safeLineBreak > 0 ? Math.max(safeStroke * 3.6, circumference / 18) : circumference;
  const gapLength = safeLineBreak > 0 ? Math.max(safeLineBreak * 1.25, safeStroke * 0.75) : 0;
  const segments: number[][] = [];

  if (safeLineBreak > 0) {
    let distance = 0;
    while (distance < circumference) {
      const start = -Math.PI / 2 + (distance / circumference) * Math.PI * 2;
      const end = -Math.PI / 2 + (Math.min(distance + dashLength, circumference) / circumference) * Math.PI * 2;
      segments.push([start, end]);
      distance += dashLength + gapLength;
    }
  } else {
    segments.push([-Math.PI / 2, Math.PI * 1.5]);
  }

  segments.forEach(([start, end]) => {
    const steps = Math.max(18, Math.ceil(Math.abs(end - start) / (Math.PI / 32)));
    const outerPoints = Array.from({ length: steps + 1 }, (_, index) => {
      const theta = start + ((end - start) * index) / steps;
      return { x: Math.cos(theta) * outerRx, y: Math.sin(theta) * outerRy };
    });
    const innerPoints = Array.from({ length: steps + 1 }, (_, index) => {
      const theta = end - ((end - start) * index) / steps;
      return { x: Math.cos(theta) * innerRx, y: Math.sin(theta) * innerRy };
    });
    pushPathPolygon(path, [...outerPoints, ...innerPoints]);
  });

  return path;
};

const getRectangleRingPath = (outerWidth: number, outerHeight: number, strokeWidth: number, lineBreakValue = 0) => {
  const safeOuterWidth = Math.max(1, outerWidth);
  const safeOuterHeight = Math.max(1, outerHeight);
  const safeStroke = Math.max(0, Math.min(strokeWidth, safeOuterWidth / 2 - 1, safeOuterHeight / 2 - 1));
  const safeLineBreak = Math.max(0, Math.round(lineBreakValue));
  const outer = {
    left: -safeOuterWidth / 2,
    right: safeOuterWidth / 2,
    top: -safeOuterHeight / 2,
    bottom: safeOuterHeight / 2,
  };
  const inner = {
    left: outer.left + safeStroke,
    right: outer.right - safeStroke,
    top: outer.top + safeStroke,
    bottom: outer.bottom - safeStroke,
  };

  if (safeLineBreak <= 0) {
    return [
      ['M', outer.left, outer.top],
      ['L', outer.right, outer.top],
      ['L', outer.right, outer.bottom],
      ['L', outer.left, outer.bottom],
      ['Z'],
      ['M', inner.left, inner.bottom],
      ['L', inner.right, inner.bottom],
      ['L', inner.right, inner.top],
      ['L', inner.left, inner.top],
      ['Z'],
    ];
  }

  const path: (string | number)[][] = [];
  const dashLength = clamp(safeStroke * 4, 8, 28);
  const gapLength = Math.max(4, safeLineBreak * 1.1);
  const addSideDashes = (
    length: number,
    pointAt: (distance: number) => { outer: { x: number; y: number }; inner: { x: number; y: number } },
  ) => {
    let distance = 0;
    while (distance < length) {
      const endDistance = Math.min(distance + dashLength, length);
      if (endDistance - distance >= 1) {
        const start = pointAt(distance);
        const end = pointAt(endDistance);
        pushPathPolygon(path, [start.outer, end.outer, end.inner, start.inner]);
      }
      distance += dashLength + gapLength;
    }
  };

  addSideDashes(safeOuterWidth, (distance) => ({
    outer: { x: outer.left + distance, y: outer.top },
    inner: { x: outer.left + distance, y: inner.top },
  }));
  addSideDashes(safeOuterHeight, (distance) => ({
    outer: { x: outer.right, y: outer.top + distance },
    inner: { x: inner.right, y: outer.top + distance },
  }));
  addSideDashes(safeOuterWidth, (distance) => ({
    outer: { x: outer.right - distance, y: outer.bottom },
    inner: { x: outer.right - distance, y: inner.bottom },
  }));
  addSideDashes(safeOuterHeight, (distance) => ({
    outer: { x: outer.left, y: outer.bottom - distance },
    inner: { x: inner.left, y: outer.bottom - distance },
  }));
  return path;
};

const getShapeRingPath = (shape: ShapeChoice, outerWidth: number, outerHeight: number, strokeWidth: number, lineBreakValue = 0) => {
  if (shape === 'circle' || shape === 'oval') return getArcRingPath(outerWidth, outerHeight, strokeWidth, lineBreakValue);
  if (shape === 'rectangle') return getRectangleRingPath(outerWidth, outerHeight, strokeWidth, lineBreakValue);
  return getTriangleRingPath(outerWidth, outerHeight, strokeWidth, lineBreakValue);
};

const getTriangleRingPath = (outerWidth: number, outerHeight: number, strokeWidth: number, lineBreakValue = 0) => {
  const safeOuterWidth = Math.max(1, outerWidth);
  const safeOuterHeight = Math.max(1, outerHeight);
  const safeStroke = Math.max(0, Math.min(strokeWidth, safeOuterWidth / 2 - 1, safeOuterHeight / 2 - 1));
  const safeLineBreak = Math.max(0, Math.round(lineBreakValue));
  const outer = [
    { x: 0, y: -safeOuterHeight / 2 },
    { x: safeOuterWidth / 2, y: safeOuterHeight / 2 },
    { x: -safeOuterWidth / 2, y: safeOuterHeight / 2 },
  ];

  const signedArea = outer.reduce((sum, point, index) => {
    const next = outer[(index + 1) % outer.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const direction = signedArea >= 0 ? 1 : -1;
  const offsetLines = outer.map((point, index) => {
    const next = outer[(index + 1) % outer.length];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: (-dy / length) * direction, y: (dx / length) * direction };
    return {
      point: { x: point.x + normal.x * safeStroke, y: point.y + normal.y * safeStroke },
      direction: { x: dx, y: dy },
    };
  });
  const inner = offsetLines.map((line, index) => {
    const previous = offsetLines[(index + offsetLines.length - 1) % offsetLines.length];
    const cross = previous.direction.x * line.direction.y - previous.direction.y * line.direction.x || 1;
    const dx = line.point.x - previous.point.x;
    const dy = line.point.y - previous.point.y;
    const t = (dx * line.direction.y - dy * line.direction.x) / cross;
    return {
      x: previous.point.x + previous.direction.x * t,
      y: previous.point.y + previous.direction.y * t,
    };
  });

  if (safeLineBreak > 0) {
    const inset = safeStroke / 2;
    const dashed = [
      { x: 0, y: -safeOuterHeight / 2 + inset },
      { x: safeOuterWidth / 2 - inset, y: safeOuterHeight / 2 - inset },
      { x: -safeOuterWidth / 2 + inset, y: safeOuterHeight / 2 - inset },
    ];
    return [
      ['M', dashed[0].x, dashed[0].y],
      ['L', dashed[1].x, dashed[1].y],
      ['L', dashed[2].x, dashed[2].y],
      ['Z'],
    ];
  }

  return [
    ['M', outer[0].x, outer[0].y],
    ['L', outer[1].x, outer[1].y],
    ['L', outer[2].x, outer[2].y],
    ['Z'],
    ['M', inner[2].x, inner[2].y],
    ['L', inner[1].x, inner[1].y],
    ['L', inner[0].x, inner[0].y],
    ['Z'],
  ];
};

const createPerimeterText = ({
  text,
  shape,
  left,
  top,
  width,
  height,
  fontSize,
  fontFamily,
  fontWeight,
  fontStyle,
  letterSpacing,
  color,
  opacity,
  radiusValue = TEXT_RADIUS_DEFAULT,
  spacingValue = TEXT_SPACING_DEFAULT,
  startPointValue = TEXT_START_POINT_DEFAULT,
  flipHorizontal = false,
  sideTexts,
  sideFlips,
}: {
  text: string;
  shape: ShapeChoice;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  letterSpacing: number;
  color: string;
  opacity: number;
  radiusValue?: number;
  spacingValue?: number;
  startPointValue?: number;
  flipHorizontal?: boolean;
  sideTexts?: string[];
  sideFlips?: boolean[];
}) => {
  const cleanText = text.trim() || getShapeTextLabel(shape);
  const fallbackSideText = getShapeAroundTextLabel(shape);
  const normalizedSideTexts =
    shape === 'rectangle'
      ? Array.from({ length: 4 }, (_, index) => sideTexts?.[index]?.trim() || fallbackSideText)
      : shape === 'triangle'
        ? Array.from({ length: 3 }, (_, index) => sideTexts?.[index]?.trim() || fallbackSideText)
        : [];
  const normalizedSideFlips = normalizedSideTexts.map((_, index) => Boolean(sideFlips?.[index]));
  const chars = [...cleanText];
  const textObjects: fabric.Object[] = [];
  const safeRadius = clamp(radiusValue, 0, 100);
  const safeSpacing = clamp(spacingValue, 0, 100);
  const safeStartPoint = clamp(startPointValue, 0, 100);
  const shouldFlipHorizontal = flipHorizontal && (shape === 'circle' || shape === 'oval');
  const innerInset = fontSize * (0.72 + ((100 - safeRadius) / 100) * 1.75);
  const boxWidth = Math.max(40, width - innerInset * 2);
  const boxHeight = Math.max(40, height - innerInset * 2);
  const spacingCharOffset = Math.round((safeSpacing - TEXT_SPACING_DEFAULT) * 8);
  const textCharSpacing = Math.max(-700, letterSpacing + spacingCharOffset);
  const addSideText = (
    label: string,
    x: number,
    y: number,
    angle: number,
    maxWidth: number,
    flip = false,
    sideIndex = 0,
  ) => {
    const sideText = new fabric.Text(label, {
      fontSize,
      fontFamily,
      fontWeight: 'normal',
      fontStyle,
      charSpacing: textCharSpacing,
      fill: color,
      selectable: false,
      evented: false,
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      angle,
      scaleX: flip ? -1 : 1,
    });
    const naturalWidth = sideText.width || 1;
    if (naturalWidth > maxWidth) {
      sideText.scaleX = (flip ? -1 : 1) * (maxWidth / naturalWidth);
    }
    (sideText as any).selectionWidth = naturalWidth * Math.abs(Number(sideText.scaleX || 1));
    (sideText as any).selectionHeight = fontSize * 1.02;
    (sideText as any).selectionTopOffset =
      shape === 'triangle' && sideIndex === 2
        ? fontSize * 1.6
        : 0;
    textObjects.push(sideText);
  };

  if (shape === 'circle' || shape === 'oval') {
    const rx = Math.max(12, boxWidth / 2);
    const ry = Math.max(12, boxHeight / 2);
    const spacingScale = Math.max(0.04, safeSpacing / TEXT_SPACING_DEFAULT);
    const step = ((Math.PI * 2) / Math.max(chars.length, 1)) * spacingScale;
    const startTheta = (safeStartPoint / 100) * Math.PI * 2;
    chars.forEach((char, index) => {
      const theta = startTheta + step * index;
      const textAngle = (theta * 180) / Math.PI + 92;
      textObjects.push(new fabric.Text(char, {
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        charSpacing: textCharSpacing,
        fill: color,
        selectable: false,
        evented: false,
        left: (shouldFlipHorizontal ? -1 : 1) * rx * Math.cos(theta),
        top: ry * Math.sin(theta),
        originX: 'center',
        originY: 'center',
        angle: shouldFlipHorizontal ? 180 - textAngle : textAngle,
      }));
    });
  } else if (shape === 'rectangle') {
    addSideText(normalizedSideTexts[0], 0, -boxHeight / 2, 0, boxWidth * 0.92, normalizedSideFlips[0]);
    addSideText(normalizedSideTexts[1], boxWidth / 2, 0, 90, boxHeight * 0.92, normalizedSideFlips[1], 1);
    addSideText(normalizedSideTexts[2], 0, boxHeight / 2, 180, boxWidth * 0.92, normalizedSideFlips[2], 2);
    addSideText(normalizedSideTexts[3], -boxWidth / 2, 0, -90, boxHeight * 0.92, normalizedSideFlips[3], 3);
  } else {
    const points =
      [
        { x: 0, y: -boxHeight / 2 },
        { x: boxWidth / 2, y: boxHeight / 2 },
        { x: -boxWidth / 2, y: boxHeight / 2 },
      ];
    [
      [points[2], points[0]],
      [points[0], points[1]],
      [points[2], points[1]],
    ].forEach(([point, next], index) => {
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const midpoint = {
        x: point.x + dx / 2,
        y: point.y + dy / 2,
      };
      if (index < 2) {
        const inwardOffset = fontSize * 0.42;
        const inwardSign = 1;
        midpoint.x += (-dy / length) * inwardOffset * inwardSign;
        midpoint.y += (dx / length) * inwardOffset * inwardSign;
      }
      addSideText(
        normalizedSideTexts[index],
        midpoint.x,
        midpoint.y,
        (Math.atan2(dy, dx) * 180) / Math.PI,
        length * 0.82,
        normalizedSideFlips[index],
        index,
      );
    });
  }

  textObjects.unshift(new fabric.Rect({
    left: 0,
    top: 0,
    width,
    height,
    originX: 'center',
    originY: 'center',
    fill: 'rgba(0,0,0,0)',
    stroke: 'rgba(0,0,0,0)',
    selectable: false,
    evented: false,
  }));

  const group = new fabric.Group(textObjects, {
    left,
    top,
    originX: 'center',
    originY: 'center',
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    opacity,
  }) as StampObject;

  group.uid = toId();
  group.kind = 'arc-text';
  group.shapeKind = shape;
  group.sourceText = cleanText;
  group.textSideValues = normalizedSideTexts.length ? normalizedSideTexts : undefined;
  group.textSideFlips = normalizedSideTexts.length ? normalizedSideFlips : undefined;
  (group as any).fontSize = fontSize;
  (group as any).fontFamily = fontFamily;
  (group as any).fontWeight = fontWeight;
  (group as any).fontStyle = fontStyle;
  (group as any).charSpacing = letterSpacing;
  group.textRadiusValue = safeRadius;
  group.textSpacingValue = safeSpacing;
  group.textStartPointValue = safeStartPoint;
  group.textFlipHorizontal = shouldFlipHorizontal;
  group.curveAngle = 0;
  return group;
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const ignoreHistoryRef = useRef(false);
  const selectionOutlineRef = useRef<fabric.Object | null>(null);
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
  const [activeLayerKind, setActiveLayerKind] = useState<LayerItem['kind'] | null>(null);
  const [layerItems, setLayerItems] = useState<LayerItem[]>([]);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);

  const [textValue, setTextValue] = useState('APPROVED');
  const [autoDateFormat, setAutoDateFormat] = useState<DateFormat>(DATE_FORMAT_OPTIONS[0]);
  const [selectedFont, setSelectedFont] = useState<FontChoice>('Arial');
  const [fontSize, setFontSize] = useState(80);
  const [fontWeight, setFontWeight] = useState<'normal' | 'bold'>('bold');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [curveAngle, setCurveAngle] = useState(0);
  const [textRadius, setTextRadius] = useState(TEXT_RADIUS_DEFAULT);
  const [textSpacing, setTextSpacing] = useState(TEXT_SPACING_DEFAULT);
  const [textStartPoint, setTextStartPoint] = useState(TEXT_START_POINT_DEFAULT);
  const [textFlipHorizontal, setTextFlipHorizontal] = useState(false);
  const [textSideValues, setTextSideValues] = useState<string[]>([]);
  const [textSideFlips, setTextSideFlips] = useState<boolean[]>([]);
  const [textHorizontalPosition, setTextHorizontalPosition] = useState(50);
  const [textVerticalPosition, setTextVerticalPosition] = useState(50);
  const [textRotationPosition, setTextRotationPosition] = useState(50);

  const [borderWidth, setBorderWidth] = useState(NEW_STAMP_STROKE);
  const [lineBreak, setLineBreak] = useState(NEW_STAMP_LINE_BREAK);
  const [borderStyle, setBorderStyle] = useState<BorderStyle>('solid');
  const [activeShapeForFit] = useState('');
  const [activeShapeKind, setActiveShapeKind] = useState<ShapeChoice | ''>('');
  const [shapeWidth, setShapeWidth] = useState(NEW_STAMP_SIZE);
  const [shapeHeight, setShapeHeight] = useState(NEW_STAMP_SIZE);
  const [canvasSizeDisplay, setCanvasSizeDisplay] = useState<CanvasSizeDisplay>(getShapeCanvasSizeDisplay());

  const [inkColor, setInkColor] = useState(COLOR_PRESETS[0]);
  const [opacity, setOpacity] = useState(100);
  const [distressedEnabled, setDistressedEnabled] = useState(false);
  const [stripBg, setStripBg] = useState(false);
  const [canvasBgColor, setCanvasBgColor] = useState('#ffffff');
  const [canvasBgTransparent, setCanvasBgTransparent] = useState(true);
  const [isNewStampOpen, setIsNewStampOpen] = useState(false);
  const [newStampShape, setNewStampShape] = useState<ShapeChoice>('circle');
  const [newStampWidthMm, setNewStampWidthMm] = useState(SHAPE_PRESET_MM.oval.width || 45);
  const [newStampHeightMm, setNewStampHeightMm] = useState(SHAPE_PRESET_MM.oval.height || 28);
  const [newStampDiameterMm, setNewStampDiameterMm] = useState(SHAPE_PRESET_MM.circle.size || 32);
  const [newStampSideMm, setNewStampSideMm] = useState(SHAPE_PRESET_MM.triangle.size || 44);
  const toolbarShape = activeShapeKind || newStampShape || 'circle';

  const selectNewStampShape = (shape: ShapeChoice) => {
    setNewStampShape(shape);
    const preset = SHAPE_PRESET_MM[shape];
    if (shape === 'circle' && preset.size) setNewStampDiameterMm(preset.size);
    if (shape === 'triangle' && preset.size) setNewStampSideMm(preset.size);
    if ((shape === 'oval' || shape === 'rectangle') && preset.width && preset.height) {
      setNewStampWidthMm(preset.width);
      setNewStampHeightMm(preset.height);
    }
  };

  const syncHistory = () => {
    const current = historyRef.current;
    setCanUndo(current.past.length > 1);
    setCanRedo(current.future.length > 0);
  };

  const saveState = () => {
    const canvas = canvasRef.current;
    if (!canvas || ignoreHistoryRef.current) return;
    ensureLayerNumbers(canvas);

    const current = JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS));
    if (historyRef.current.past.at(-1) === current) {
      syncHistory();
      return;
    }
    historyRef.current.past.push(current);
    if (historyRef.current.past.length > MAX_HISTORY) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    syncHistory();
  };

  const refreshLayerList = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setLayerItems([]);
      return;
    }
    ensureLayerNumbers(canvas);

    const nextLayers = (canvas.getObjects() as StampObject[])
      .filter((obj) => obj.kind && obj.kind !== 'distress')
      .map((obj, index) => {
        const kind = obj.kind as LayerItem['kind'];
        const fallback =
          kind === 'shape'
            ? formatShapeName(obj.shapeKind)
            : kind === 'image'
              ? 'Image'
              : String((obj as any).text || obj.sourceText || 'Text');
        return {
          id: obj.uid || `${kind}-${index}`,
          label: fallback,
          kind,
          order: obj.layerNumber ?? index,
        };
      });
    setLayerItems(nextLayers.reverse());
  };

  const ensureLayerNumbers = (canvas: fabric.Canvas) => {
    const objects = (canvas.getObjects() as StampObject[]).filter((obj) => obj.kind && obj.kind !== 'distress');
    let nextNumber = objects.reduce((highest, obj) => Math.max(highest, typeof obj.layerNumber === 'number' ? obj.layerNumber : -1), -1) + 1;
    objects.forEach((obj) => {
      if (typeof obj.layerNumber !== 'number') {
        obj.layerNumber = nextNumber;
        nextNumber += 1;
      }
    });
  };

  const addLayerBelowCurrent = (object: StampObject) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    const objects = canvas.getObjects() as StampObject[];
    if (typeof object.layerNumber !== 'number') {
      object.layerNumber =
        objects
          .filter((item) => item.kind && item.kind !== 'distress')
          .reduce((highest, item) => Math.max(highest, typeof item.layerNumber === 'number' ? item.layerNumber : -1), -1) + 1;
    }
    const activeIndex = active?.uid ? objects.findIndex((item) => item.uid === active.uid) : -1;
    if (activeIndex >= 0) {
      canvas.insertAt(activeIndex, object);
    } else {
      canvas.add(object);
    }
  };

  const selectLayer = (id: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = (canvas.getObjects() as StampObject[]).find((obj) => obj.uid === id);
    if (!target) return;
    canvas.setActiveObject(target);
    canvas.requestRenderAll();
    syncActiveObject();
  };

  const reorderLayers = (nextTopToBottomIds: string[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects() as StampObject[];
    const layerObjects = objects.filter((obj) => obj.uid && obj.kind && obj.kind !== 'distress');
    const distressObjects = objects.filter((obj) => obj.kind === 'distress');
    const layerMap = new Map(layerObjects.map((obj) => [obj.uid, obj]));
    const orderedBottomToTop = [...nextTopToBottomIds]
      .reverse()
      .map((id) => layerMap.get(id))
      .filter(Boolean) as StampObject[];
    const activeId = (canvas.getActiveObject() as StampObject | null)?.uid;

    ignoreHistoryRef.current = true;
    [...layerObjects, ...distressObjects].forEach((obj) => canvas.remove(obj));
    orderedBottomToTop.forEach((obj, index) => canvas.insertAt(index, obj));
    distressObjects.forEach((obj) => canvas.add(obj));
    ignoreHistoryRef.current = false;

    const active = activeId ? orderedBottomToTop.find((obj) => obj.uid === activeId) : null;
    if (active) canvas.setActiveObject(active);
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
  };

  const deleteLayer = (id: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = (canvas.getObjects() as StampObject[]).find((obj) => obj.uid === id);
    if (!target) return;
    const distress = distressMapRef.current.get(id);
    if (distress) {
      canvas.remove(distress);
      distressMapRef.current.delete(id);
    }
    canvas.remove(target);
    if (activeLayerIdForFit === id) {
      clearSelection();
      canvas.discardActiveObject();
    }
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
    pushStatus('Layer removed');
  };

  const handleLayerDragStart = (event: DragEvent<HTMLDivElement>, id: string) => {
    setDraggingLayerId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
  };

  const handleLayerDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleLayerDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingLayerId;
    setDraggingLayerId(null);
    if (!sourceId || sourceId === targetId) return;
    const sourceIndex = layerItems.findIndex((item) => item.id === sourceId);
    const targetIndex = layerItems.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...layerItems];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
    setLayerItems(next);
    reorderLayers(next.map((item) => item.id));
  };

  const removeSelectionOutline = () => {
    const canvas = canvasRef.current;
    const outline = selectionOutlineRef.current;
    selectionOutlineRef.current = null;
    if (!canvas || !outline || !canvas.getObjects().includes(outline)) return;
    ignoreHistoryRef.current = true;
    canvas.remove(outline);
    ignoreHistoryRef.current = false;
    canvas.requestRenderAll();
  };

  const createTextSelectionOutline = (target: StampObject, padding: number) => {
    const textChildren = ((target as any)._objects || []).filter((child: fabric.Object) => child instanceof fabric.Text);
    if (!textChildren.length) return null;

    const childBoxes: Array<{ left: number; top: number; right: number; bottom: number }> = textChildren.map((child: fabric.Object) => {
      const width = Math.max(1, Number(child.width || 1) * Math.abs(Number(child.scaleX || 1)));
      const height = Math.max(1, Number(child.height || 1) * Math.abs(Number(child.scaleY || 1)));
      const left = Number(child.left || 0) - width / 2;
      const top = Number(child.top || 0) - height / 2;
      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
      };
    });
    const minLeft = Math.min(...childBoxes.map((box) => box.left));
    const minTop = Math.min(...childBoxes.map((box) => box.top));
    const maxRight = Math.max(...childBoxes.map((box) => box.right));
    const maxBottom = Math.max(...childBoxes.map((box) => box.bottom));
    const textWidth = Math.max(1, maxRight - minLeft + padding * 2);
    const textHeight = Math.max(1, maxBottom - minTop + padding * 2);
    const characterMetrics: Array<{ x: number; y: number; halfSize: number }> = textChildren.map((child: fabric.Object) => {
      const width = Math.max(1, Number(child.width || 1) * Math.abs(Number(child.scaleX || 1)));
      const height = Math.max(1, Number(child.height || 1) * Math.abs(Number(child.scaleY || 1)));
      return {
        x: Number(child.left || 0),
        y: Number(child.top || 0),
        halfSize: Math.max(width, height) / 2,
      };
    });
    const textThickness = Math.max(...characterMetrics.map((metric) => metric.halfSize)) + padding;
    const textOutlineBase = {
      fill: 'rgba(0,0,0,0)',
      stroke: '#38bdf8',
      strokeWidth: 1.5,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: false,
      excludeFromExport: true,
      originX: 'center',
      originY: 'center',
    };

    if (target.shapeKind === 'circle') {
      const characterRadii = characterMetrics.map((metric) => Math.hypot(metric.x, metric.y));
      const outerRadius = Math.max(...characterRadii.map((radius) => radius + textThickness));
      const innerRadius = Math.max(1, Math.min(...characterRadii.map((radius) => radius - textThickness)));
      return new fabric.Group([
        new fabric.Circle({
          ...textOutlineBase,
          left: 0,
          top: 0,
          radius: outerRadius,
        } as any),
        new fabric.Circle({
          ...textOutlineBase,
          left: 0,
          top: 0,
          radius: innerRadius,
        } as any),
      ], {
        left: target.left,
        top: target.top,
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false,
        excludeFromExport: true,
        originX: 'center',
        originY: 'center',
        angle: target.angle || 0,
      } as any);
    }

    if (target.shapeKind === 'oval') {
      const frameRx = Math.max(1, Number(target.width || textWidth) / 2);
      const frameRy = Math.max(1, Number(target.height || textHeight) / 2);
      const textBand = Math.max(
        padding,
        ...textChildren.map((child: fabric.Object) => (Number(child.height || 1) * Math.abs(Number(child.scaleY || 1))) / 2 + padding),
      );
      const outerRx = Math.max(1, frameRx - textBand * 0.05);
      const outerRy = Math.max(1, frameRy - textBand * 0.05);
      const innerRx = Math.max(1, frameRx - textBand * 1.7);
      const innerRy = Math.max(1, frameRy - textBand * 1.7);
      return new fabric.Group([
        new fabric.Ellipse({
          ...textOutlineBase,
          left: 0,
          top: 0,
          rx: outerRx,
          ry: outerRy,
        } as any),
        new fabric.Ellipse({
          ...textOutlineBase,
          left: 0,
          top: 0,
          rx: innerRx,
          ry: innerRy,
        } as any),
      ], {
        left: target.left,
        top: target.top,
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false,
        excludeFromExport: true,
        originX: 'center',
        originY: 'center',
        angle: target.angle || 0,
      } as any);
    }

    if (target.shapeKind !== 'triangle' && target.shapeKind !== 'rectangle') {
      return new fabric.Rect({
        left: Number(target.left || 0) + minLeft - padding,
        top: Number(target.top || 0) + minTop - padding,
        width: textWidth,
        height: textHeight,
        fill: 'rgba(0,0,0,0)',
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false,
        excludeFromExport: true,
        originX: 'left',
        originY: 'top',
        angle: target.angle || 0,
      } as any);
    }

    const outlinePieces = textChildren.map((child: fabric.Object) => {
      const isTriangleText = target.shapeKind === 'triangle';
      child.setCoords();
      const sidePaddingX = isTriangleText ? 4 : padding;
      const sidePaddingY = isTriangleText ? 3 : padding;
      const measuredWidth = Number((child as any).selectionWidth ?? (child.width || 1) * Math.abs(Number(child.scaleX || 1)));
      const measuredHeight = Number((child as any).selectionHeight ?? (child.height || 1) * Math.abs(Number(child.scaleY || 1)));
      const width = Math.max(1, measuredWidth + sidePaddingX * 2);
      const height = Math.max(1, measuredHeight + sidePaddingY * 2);
      return new fabric.Rect({
        left: Number(child.left || 0),
        top: Number(child.top || 0) + Number((child as any).selectionTopOffset || 0),
        width,
        height,
        angle: Number(child.angle || 0),
        fill: 'rgba(0,0,0,0)',
        stroke: '#38bdf8',
        strokeWidth: 1.5,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
        hasControls: false,
        hasBorders: false,
        objectCaching: false,
        excludeFromExport: true,
        originX: 'center',
        originY: 'center',
      } as any);
    });

    return new fabric.Group(outlinePieces, {
      left: target.left,
      top: target.top,
      angle: target.angle || 0,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: false,
      excludeFromExport: true,
    } as any);
  };

  const showSelectionOutline = (target: StampObject) => {
    const canvas = canvasRef.current;
    if (!canvas || !target.uid || target.kind === 'distress') return;
    removeSelectionOutline();
    target.setCoords();
    const bounds = target.getBoundingRect();
    const padding = 6;
    const left = Number(target.left ?? bounds.left + bounds.width / 2);
    const top = Number(target.top ?? bounds.top + bounds.height / 2);
    const frameWidth = Math.max(1, Number(target.shapeOuterWidth ?? target.width ?? bounds.width));
    const frameHeight = Math.max(1, Number(target.shapeOuterHeight ?? target.height ?? bounds.height));
    const outlineBase = {
      left,
      top,
      fill: 'rgba(0,0,0,0)',
      stroke: '#38bdf8',
      strokeWidth: 2,
      strokeDashArray: [8, 5],
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      objectCaching: false,
      excludeFromExport: true,
      originX: 'center',
      originY: 'center',
      angle: target.angle || 0,
    };
    let outline: fabric.Object;
    const textOutline = target.kind === 'arc-text' ? createTextSelectionOutline(target, 4) : null;
    if (textOutline) {
      outline = textOutline;
    } else if (target.shapeKind === 'circle') {
      const diameter = Math.max(frameWidth, frameHeight) + padding * 2;
      outline = new fabric.Circle({
        ...outlineBase,
        radius: diameter / 2,
      } as any);
    } else if (target.shapeKind === 'oval') {
      outline = new fabric.Ellipse({
        ...outlineBase,
        rx: frameWidth / 2 + padding,
        ry: frameHeight / 2 + padding,
      } as any);
    } else if (target.shapeKind === 'rectangle') {
      outline = new fabric.Rect({
        ...outlineBase,
        width: frameWidth + padding * 2,
        height: frameHeight + padding * 2,
      } as any);
    } else if (target.shapeKind === 'triangle') {
      const width = frameWidth + padding * 2;
      const height = frameHeight + padding * 2;
      outline = new fabric.Polygon(
        [
          { x: 0, y: -height / 2 },
          { x: width / 2, y: height / 2 },
          { x: -width / 2, y: height / 2 },
        ],
        outlineBase as any,
      );
    } else {
      outline = new fabric.Rect({
        ...outlineBase,
        left: bounds.left - padding,
        top: bounds.top - padding,
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2,
        originX: 'left',
        originY: 'top',
      } as any);
    }
    selectionOutlineRef.current = outline;
    ignoreHistoryRef.current = true;
    canvas.add(outline);
    canvas.setActiveObject(target);
    ignoreHistoryRef.current = false;
    canvas.requestRenderAll();
  };

  const withSelectionOutlineHidden = <T,>(callback: () => T) => {
    const canvas = canvasRef.current;
    const outline = selectionOutlineRef.current;
    const previousVisible = outline?.visible;
    if (outline) {
      outline.visible = false;
      canvas?.requestRenderAll();
    }
    const result = callback();
    if (outline) {
      outline.visible = previousVisible ?? true;
      canvas?.requestRenderAll();
    }
    return result;
  };

  const clearSelection = () => {
    removeSelectionOutline();
    setDistressedEnabled(false);
    setActiveLayerIdForFit(null);
    setActiveLayerKind(null);
    setActiveShapeKind('');
  };

  const getTextRadiusForTarget = (radiusValue: number | undefined) =>
    clamp(Math.round(radiusValue ?? TEXT_RADIUS_DEFAULT), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);

  const getIndependentTextFrame = (radiusValue: number, shape?: ShapeChoice) => {
    const canvas = canvasRef.current;
    const maxSize = canvas ? Math.max(1, Math.min(canvas.width, canvas.height) - SHAPE_CANVAS_MARGIN * 2) : BASE_CANVAS;
    const size = Math.max(40, (clamp(radiusValue, SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX) / SHAPE_CONTROL_MAX) * maxSize);
    if (shape === 'rectangle' || shape === 'oval') {
      return { width: size, height: Math.max(40, size * 0.62) };
    }
    if (shape === 'triangle') {
      return { width: size, height: Math.max(40, size * 0.866) };
    }
    return { width: size, height: size };
  };

  const getLayerInkColor = (target: StampObject) => {
    const isVisibleColor = (value: unknown) =>
      typeof value === 'string' && value !== 'transparent' && value !== 'rgba(0,0,0,0)' && value !== 'rgba(0, 0, 0, 0)';
    if (target.kind === 'arc-text') {
      const childColor = ((target as any)._objects || []).map((child: any) => child.fill).find(isVisibleColor);
      return childColor || inkColor;
    }
    if (target.kind === 'shape') {
      if (isVisibleColor(target.fill)) return String(target.fill);
      if (isVisibleColor(target.stroke)) return String(target.stroke);
      return inkColor;
    }
    if (isVisibleColor((target as any).fill)) return String((target as any).fill);
    return inkColor;
  };

  const normalizeInnerTextLayer = (active: StampObject) => {
    const canvas = canvasRef.current;
    if (!canvas || active.kind !== 'arc-text' || !active.shapeKind) return active;
    const currentFontSize = Math.round(Number((active as any).fontSize || fontSize));
    const normalizedRadius = getTextRadiusForTarget(active.textRadiusValue);
    const frame = getIndependentTextFrame(normalizedRadius, active.shapeKind);
    const normalizedFontSize = currentFontSize || INNER_SHAPE_TEXT_FONT_SIZE;
    const needsNormalize =
      typeof active.textRadiusValue !== 'number' ||
      active.textRadiusValue !== normalizedRadius ||
      (active as any).fontWeight === 'bold' ||
      Boolean(active.targetShapeId);
    if (!needsNormalize) return active;

    const rebuilt = createPerimeterText({
      text: active.sourceText || getShapeTextLabel(active.shapeKind),
      shape: active.shapeKind,
      left: active.left || canvas.width / 2,
      top: active.top || canvas.height / 2,
      width: frame.width,
      height: frame.height,
      fontSize: normalizedFontSize,
      fontFamily: String((active as any).fontFamily || mapFontFamily(selectedFont)),
      fontWeight: 'normal',
      fontStyle: ((active as any).fontStyle || fontStyle) as 'normal' | 'italic',
      letterSpacing: Number((active as any).charSpacing || letterSpacing * 10),
      color: getLayerInkColor(active),
      opacity: Number(active.opacity ?? opacity / 100),
      radiusValue: SHAPE_CONTROL_MAX,
      spacingValue: active.textSpacingValue ?? TEXT_SPACING_DEFAULT,
      startPointValue: active.textStartPointValue ?? TEXT_START_POINT_DEFAULT,
      flipHorizontal: Boolean(active.textFlipHorizontal),
      sideTexts: active.textSideValues,
      sideFlips: active.textSideFlips,
    });
    rebuilt.uid = active.uid;
    rebuilt.textRadiusValue = normalizedRadius;
    rebuilt.angle = active.angle || 0;
    disableObjectLayoutEditing(rebuilt);
    ignoreHistoryRef.current = true;
    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    ignoreHistoryRef.current = false;
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
    return rebuilt;
  };

  const syncActiveObject = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind === 'distress') {
      clearSelection();
      return;
    }
    active = normalizeInnerTextLayer(active);
    showSelectionOutline(active);

    if (active.kind === 'text' || active.kind === 'arc-text') {
      setActiveLayerIdForFit(active.uid || null);
      setActiveLayerKind(active.kind);
      setActiveShapeKind(active.shapeKind || '');
      setTextValue(String((active as any).text || (active.sourceText || 'APPROVED')));
      const activeFont = String((active as any).fontFamily || 'Arial');
      setSelectedFont((activeFont.includes('Times') ? 'Times' : (mapFontFamily(activeFont as FontChoice) as FontChoice)));
      setFontSize(Math.round((active as any).fontSize || fontSize));
      setFontWeight(((active as any).fontWeight || 'bold') as 'normal' | 'bold');
      setFontStyle(((active as any).fontStyle || 'normal') as 'normal' | 'italic');
      setLetterSpacing(Math.round(((active as any).charSpacing || 0) / 10));
      setCurveAngle(Math.round((active.curveAngle || 0) as number));
      setTextRadius(getTextRadiusForTarget(active.textRadiusValue));
      setTextSpacing(Math.round(active.textSpacingValue ?? TEXT_SPACING_DEFAULT));
      setTextStartPoint(Math.round(active.textStartPointValue ?? TEXT_START_POINT_DEFAULT));
      setTextFlipHorizontal(Boolean(active.textFlipHorizontal));
      setTextSideValues(active.textSideValues || []);
      setTextSideFlips(active.textSideFlips || []);
      setTextHorizontalPosition(clamp(Math.round((Number(active.left ?? canvas.width / 2) / canvas.width) * 100), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX));
      setTextVerticalPosition(clamp(Math.round((Number(active.top ?? canvas.height / 2) / canvas.height) * 100), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX));
      setTextRotationPosition(clamp(Math.round(((Number(active.angle ?? 0) + 180) / 360) * 100), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX));
      setInkColor(getLayerInkColor(active));
      setDistressedEnabled(Boolean(active.isDistressed));
    }
    if (active.kind === 'shape') {
      setActiveLayerKind('shape');
      setActiveShapeKind(active.shapeKind || 'circle');
      setBorderWidth(Math.round(Number(active.shapeStrokeWidth ?? active.strokeWidth ?? borderWidth)));
      setBorderStyle(active.borderStyle || 'solid');
      const shapeDash = active.strokeDashArray;
      if (typeof active.shapeLineBreak === 'number') {
        setLineBreak(active.shapeLineBreak);
      } else if (Array.isArray(shapeDash) && shapeDash.length >= 2) {
        setLineBreak(Math.round(Number(shapeDash[1]) || 0));
      } else {
        setLineBreak(0);
      }
      setDistressedEnabled(Boolean(active.isDistressed));
      const maxShapeSize = getShapeSizeValue(active);
      setShapeWidth(maxShapeSize);
      setShapeHeight(maxShapeSize);
      setActiveLayerIdForFit(active.uid || null);
      setInkColor(getLayerInkColor(active));
      setCanvasSizeDisplay(getShapeCanvasSizeDisplay(active));
    }
    if (active.kind === 'image') {
      setDistressedEnabled(false);
      setActiveLayerIdForFit(active.uid || null);
      setActiveLayerKind('image');
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

    const maxWidth = Math.max(1, canvas.width - SHAPE_CANVAS_MARGIN * 2);
    const maxHeight = Math.max(1, canvas.height - SHAPE_CANVAS_MARGIN * 2);
    const scaleFactor = Math.min(1, maxWidth / width, maxHeight / height);

    target.scaleX = (target.scaleX || 1) * scaleFactor;
    target.scaleY = (target.scaleY || 1) * scaleFactor;

    if (keepCentered) {
      target.left = canvas.width / 2;
      target.top = canvas.height / 2;
    }
    target.setCoords();
  };

  const getMaxShapeVisualSize = (target: StampObject) => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    return Math.max(1, Math.min(canvas.width, canvas.height) - SHAPE_CANVAS_MARGIN * 2);
  };

  const getShapeSizeValue = (target: StampObject) => {
    if (typeof target.shapeSizeValue === 'number') {
      return clamp(Math.round(target.shapeSizeValue), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    }
    const maxSize = getMaxShapeVisualSize(target);
    const bounds = target.getBoundingRect();
    const current = Math.max(bounds.width, bounds.height) || 1;
    return clamp(Math.round((current / maxSize) * SHAPE_CONTROL_MAX), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
  };

  const setShapeGeometryInsideOuterBox = (target: StampObject, outerWidth: number, outerHeight: number, strokeWidth: number) => {
    const safeStroke = Math.max(0, Math.round(strokeWidth));
    const innerWidth = Math.max(1, outerWidth - safeStroke);
    const innerHeight = Math.max(1, outerHeight - safeStroke);
    const centerX = target.left;
    const centerY = target.top;

    target.set({ scaleX: 1, scaleY: 1 });
    if (target.shapeKind === 'circle' && target instanceof fabric.Circle) {
      target.set({ radius: Math.max(1, Math.min(innerWidth, innerHeight) / 2) });
    }
    if (target.shapeKind === 'oval' && target instanceof fabric.Ellipse) {
      target.set({ rx: innerWidth / 2, ry: innerHeight / 2 });
    }
    if (target.shapeKind === 'rectangle' && target instanceof fabric.Rect) {
      target.set({ width: innerWidth, height: innerHeight });
    }
    if (target.shapeKind === 'triangle' && target instanceof fabric.Triangle) {
      target.set({ width: innerWidth, height: innerHeight });
      for (let index = 0; index < 3; index += 1) {
        target.setCoords();
        const bounds = target.getBoundingRect();
        target.set({
          width: Math.max(1, Number(target.width || innerWidth) + outerWidth - (bounds.width || outerWidth)),
          height: Math.max(1, Number(target.height || innerHeight) + outerHeight - (bounds.height || outerHeight)),
        });
      }
    }
    const pathTarget = target as StampObject;
    if (pathTarget.kind === 'shape' && pathTarget.shapeKind && target instanceof fabric.Path) {
      const dashedTriangle = pathTarget.shapeKind === 'triangle' && lineBreak > 0;
      target.set({
        path: getShapeRingPath(pathTarget.shapeKind, outerWidth, outerHeight, safeStroke, lineBreak),
        width: outerWidth,
        height: outerHeight,
        fill: dashedTriangle ? 'rgba(0,0,0,0)' : inkColor,
        stroke: dashedTriangle ? inkColor : 'rgba(0,0,0,0)',
        strokeWidth: dashedTriangle ? safeStroke : 0,
        strokeDashArray: dashedTriangle
          ? [Math.max(safeStroke * 3.6, lineBreak * 2.4), Math.max(lineBreak * 1.35, safeStroke)]
          : [],
        strokeLineCap: 'butt',
        strokeLineJoin: 'miter',
      } as any);
      pathTarget.shapeStrokeWidth = safeStroke;
      pathTarget.shapeLineBreak = lineBreak;
    }

    target.set({
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
    });
    target.shapeOuterWidth = outerWidth;
    target.shapeOuterHeight = outerHeight;
    target.setCoords();
  };

  const applyShapeSize = (target: StampObject, requestedSize = shapeWidth) => {
    const normalized = clamp(Math.round(requestedSize), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    const visualSize = Math.max(1, (normalized / SHAPE_CONTROL_MAX) * getMaxShapeVisualSize(target));
    const currentOuterWidth = target.shapeOuterWidth || visualSize;
    const currentOuterHeight = target.shapeOuterHeight || visualSize;
    const ratio = currentOuterWidth > 0 && currentOuterHeight > 0 ? currentOuterWidth / currentOuterHeight : 1;
    const outerWidth = ratio >= 1 ? visualSize : visualSize * ratio;
    const outerHeight = ratio >= 1 ? visualSize / ratio : visualSize;
    setShapeGeometryInsideOuterBox(target, outerWidth, outerHeight, Number(target.shapeStrokeWidth ?? target.strokeWidth ?? borderWidth));
    target.shapeSizeValue = normalized;
    fitShapeToCanvas(target, true);
    setShapeWidth(normalized);
    setShapeHeight(normalized);
  };

  const handleShapeSizeChange = (value: number) => {
    const normalized = clamp(Math.round(value), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    setShapeWidth(normalized);
    setShapeHeight(normalized);
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;
    applyShapeSize(active, normalized);
    refreshDistressOverlay(active);
    showSelectionOutline(active);
    if (canvas) canvas.requestRenderAll();
    saveState();
  };

  const updateCanvasSizeDisplay = (nextValues: Partial<CanvasSizeDisplay>) => {
    const nextWidth = clamp(Math.round(nextValues.width ?? canvasSizeDisplay.width), 1, SHAPE_CONTROL_MAX);
    const nextHeight =
      typeof canvasSizeDisplay.height === 'number' || typeof nextValues.height === 'number'
        ? clamp(Math.round(nextValues.height ?? canvasSizeDisplay.height ?? nextWidth), 1, SHAPE_CONTROL_MAX)
        : undefined;
    const nextDisplay = typeof nextHeight === 'number' ? { width: nextWidth, height: nextHeight } : { width: nextWidth };
    setCanvasSizeDisplay(nextDisplay);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;

    active.shapeMmWidth = nextWidth;
    active.shapeMmHeight = active.shapeKind === 'circle' || active.shapeKind === 'triangle' ? undefined : nextHeight ?? nextWidth;

    if (active.shapeKind === 'oval' || active.shapeKind === 'rectangle') {
      const visualSize = Math.max(1, ((active.shapeSizeValue ?? shapeWidth) / SHAPE_CONTROL_MAX) * getMaxShapeVisualSize(active));
      const ratio = nextWidth / Math.max(1, nextHeight ?? nextWidth);
      const outerWidth = ratio >= 1 ? visualSize : visualSize * ratio;
      const outerHeight = ratio >= 1 ? visualSize / ratio : visualSize;
      setShapeGeometryInsideOuterBox(active, outerWidth, outerHeight, Number(active.shapeStrokeWidth ?? active.strokeWidth ?? borderWidth));
      refreshDistressOverlay(active);
      showSelectionOutline(active);
      canvas.requestRenderAll();
    }
    saveState();
  };

  const handleShapeStrokeChange = (value: number) => {
    const width = clamp(Math.round(value), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    setBorderWidth(width);
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;
    const previousOuterWidth = active.shapeOuterWidth || active.getBoundingRect().width || 1;
    const previousOuterHeight = active.shapeOuterHeight || active.getBoundingRect().height || 1;
    applyShapeBorder(active, width, lineBreak);
    setShapeGeometryInsideOuterBox(active, previousOuterWidth, previousOuterHeight, width);
    active.shapeSizeValue = active.shapeSizeValue ?? shapeWidth;
    active.setCoords();
    showSelectionOutline(active);
    if (canvas) canvas.requestRenderAll();
    refreshDistressOverlay(active);
    saveState();
  };

  const handleLineBreakChange = (value: number) => {
    const normalized = clamp(Math.round(value), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    setLineBreak(normalized);
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'shape') return;
    applyShapeBorder(active, borderWidth, normalized);
    active.setCoords();
    showSelectionOutline(active);
    if (canvas) canvas.requestRenderAll();
    refreshDistressOverlay(active);
    saveState();
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

  const applyShapeBorder = (target: StampObject, nextStrokeWidth = borderWidth, nextLineBreak = lineBreak, nextColor = inkColor) => {
    if (!target) return;
    const pathShape = target as StampObject;
    if (pathShape.kind === 'shape' && pathShape.shapeKind && target instanceof fabric.Path) {
      const outerWidth = pathShape.shapeOuterWidth || pathShape.getBoundingRect().width || NEW_STAMP_SIZE;
      const outerHeight = pathShape.shapeOuterHeight || pathShape.getBoundingRect().height || Math.round(NEW_STAMP_SIZE * 0.866);
      const dashedTriangle = pathShape.shapeKind === 'triangle' && nextLineBreak > 0;
      target.set({
        path: getShapeRingPath(pathShape.shapeKind, outerWidth, outerHeight, nextStrokeWidth, nextLineBreak),
        fill: dashedTriangle ? 'rgba(0,0,0,0)' : nextColor,
        stroke: dashedTriangle ? nextColor : 'rgba(0,0,0,0)',
        strokeWidth: dashedTriangle ? nextStrokeWidth : 0,
        strokeDashArray: dashedTriangle
          ? [Math.max(nextStrokeWidth * 3.6, nextLineBreak * 2.4), Math.max(nextLineBreak * 1.35, nextStrokeWidth)]
          : [],
        strokeLineCap: 'butt',
        strokeLineJoin: 'miter',
      } as any);
      pathShape.borderStyle = 'solid';
      pathShape.shapeOuterWidth = outerWidth;
      pathShape.shapeOuterHeight = outerHeight;
      pathShape.shapeStrokeWidth = nextStrokeWidth;
      pathShape.shapeLineBreak = nextLineBreak;
      target.setCoords();
      return;
    }
    const isStraightEdgeShape =
      target.kind === 'shape' && (target.shapeKind === 'rectangle' || target.shapeKind === 'triangle');
    const hasLineBreak = Math.max(0, Math.round(nextLineBreak)) > 0;
    target.set({
      strokeWidth: nextStrokeWidth,
      strokeMiterLimit: 100,
      strokeUniform: true,
      strokeLineCap: isStraightEdgeShape ? 'butt' : hasLineBreak ? 'square' : 'round',
      strokeLineJoin: isStraightEdgeShape ? 'miter' : hasLineBreak ? 'miter' : 'round',
      stroke: nextColor,
    });
    const dashValue = Math.max(0, Math.round(nextLineBreak));

    if (borderStyle === 'dashed') {
      target.set({ strokeDashArray: [Math.max(2, Math.round(nextStrokeWidth * 1.4)), dashValue || 8] });
    } else if (borderStyle === 'double') {
      target.set({
        stroke: nextColor,
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
    if (entry.past.length <= 1) return;

    const current = entry.past.pop()!;
    entry.future.unshift(current);
    const previous = entry.past.at(-1)!;
    await applyHistoryState(previous);
    syncHistory();
  };

  const redo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const entry = historyRef.current;
    if (entry.future.length === 0) return;

    const next = entry.future.shift()!;
    entry.past.push(next);
    await applyHistoryState(next);
    syncHistory();
  };

  const getReferenceShape = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const active = canvas.getActiveObject() as StampObject | null;
    if (active?.kind === 'shape') return active;
    const shapes = (canvas.getObjects() as StampObject[]).filter((obj) => obj.kind === 'shape');
    return shapes.at(-1) || null;
  };

  const addToolbarShapeText = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const shape = getReferenceShape();
    const shapeKind = shape?.shapeKind || toolbarShape || 'circle';
    const value = shapeKind === 'triangle' || shapeKind === 'rectangle' ? getShapeAroundTextLabel(shapeKind) : getShapeTextLabel(shapeKind);
    const sideTexts =
      shapeKind === 'rectangle'
        ? Array.from({ length: 4 }, () => value)
        : shapeKind === 'triangle'
          ? Array.from({ length: 3 }, () => value)
          : undefined;
    const sideFlips = sideTexts?.map(() => false);
    const textFrame = getIndependentTextFrame(TEXT_RADIUS_DEFAULT, shapeKind);
    const text = createPerimeterText({
      text: value,
      shape: shapeKind,
      left: canvas.width / 2,
      top: canvas.height / 2,
      width: textFrame.width,
      height: textFrame.height,
      fontSize: INNER_SHAPE_TEXT_FONT_SIZE,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight,
      fontStyle,
      letterSpacing: letterSpacing * 10,
      color: inkColor,
      opacity: opacity / 100,
      radiusValue: SHAPE_CONTROL_MAX,
      spacingValue: textSpacing,
      startPointValue: textStartPoint,
      flipHorizontal: textFlipHorizontal,
      sideTexts,
      sideFlips,
    });
    text.set({
      kind: 'arc-text',
      sourceText: value,
      fill: inkColor,
      opacity: opacity / 100,
    });
    text.textRadiusValue = TEXT_RADIUS_DEFAULT;
    text.textSideValues = sideTexts;
    text.textSideFlips = sideFlips;
    text.textFlipHorizontal = textFlipHorizontal && (shapeKind === 'circle' || shapeKind === 'oval');
    disableObjectLayoutEditing(text);
    addLayerBelowCurrent(text);
    canvas.setActiveObject(text);
    setTextValue(value);
    setCurveAngle(0);
    setFontSize(INNER_SHAPE_TEXT_FONT_SIZE);
    setTextRadius(TEXT_RADIUS_DEFAULT);
    setTextSpacing(TEXT_SPACING_DEFAULT);
    setTextStartPoint(TEXT_START_POINT_DEFAULT);
    setTextSideValues(sideTexts || []);
    setTextSideFlips(sideFlips || []);
    canvas.requestRenderAll();
    saveState();
  };

  const addTextObject = (asArc = false, record = true, textOverride?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const value = textOverride?.trim() || textValue.trim() || 'APPROVED';
    const isCenterToolbarText = value === 'Text in the center';

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
      addLayerBelowCurrent(arc);
      canvas.setActiveObject(arc);
      canvas.requestRenderAll();
      if (record) saveState();
      return;
    }

    const textObj = new fabric.Text(value, {
      uid: toId(),
      kind: 'text',
      fill: inkColor,
      fontSize: isCenterToolbarText ? INNER_SHAPE_TEXT_FONT_SIZE : fontSize,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight: isCenterToolbarText ? 'normal' : fontWeight,
      fontStyle,
      charSpacing: letterSpacing * 10,
      opacity: opacity / 100,
      left: canvas.width / 2,
      top: canvas.height / 2,
      originX: 'center',
      originY: 'center',
    }) as StampObject;
    if (isCenterToolbarText) {
      const referenceShape = getReferenceShape();
      const maxTextWidth = Math.max(80, (referenceShape ? referenceShape.getScaledWidth() : canvas.width) * 0.78);
      const textWidth = textObj.getScaledWidth();
      if (textWidth > maxTextWidth) {
        textObj.scaleX = maxTextWidth / textWidth;
      }
      setTextValue(value);
      setFontSize(INNER_SHAPE_TEXT_FONT_SIZE);
      setFontWeight('normal');
      setTextHorizontalPosition(50);
      setTextVerticalPosition(50);
      setTextRotationPosition(50);
    }
    disableObjectLayoutEditing(textObj);
    addLayerBelowCurrent(textObj);
    canvas.setActiveObject(textObj);
    canvas.requestRenderAll();
    if (record) saveState();
  };

  const addShapeObject = (shape: ShapeChoice, record = true, dimensions?: ShapeDimensions, style?: ShapeStyle) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    let shapeObject: StampObject | null = null;
    const requestedSize = dimensions?.size ? clamp(Math.round(dimensions.size), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX) : undefined;
    const requestedWidth = dimensions?.width ? clamp(Math.round(dimensions.width), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX) : undefined;
    const requestedHeight = dimensions?.height ? clamp(Math.round(dimensions.height), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX) : undefined;
    const effectiveStrokeWidth = style?.strokeWidth ?? borderWidth;
    const effectiveLineBreak = style?.lineBreak ?? lineBreak;

    if (shape === 'circle') {
      const diameter = requestedSize || shapeWidth;
      shapeObject = new fabric.Path(getShapeRingPath('circle', diameter, diameter, effectiveStrokeWidth, effectiveLineBreak) as any, {
        uid: toId(),
        kind: 'shape',
        shapeKind: 'circle',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fill: inkColor,
        stroke: 'rgba(0,0,0,0)',
        strokeWidth: 0,
      }) as StampObject;
      shapeObject.shapeOuterWidth = diameter;
      shapeObject.shapeOuterHeight = diameter;
    }
    if (shape === 'rectangle') {
      const width = requestedWidth || 340;
      const height = requestedHeight || 210;
      shapeObject = new fabric.Path(getShapeRingPath('rectangle', width, height, effectiveStrokeWidth, effectiveLineBreak) as any, {
        uid: toId(),
        kind: 'shape',
        shapeKind: 'rectangle',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fill: inkColor,
        stroke: 'rgba(0,0,0,0)',
        strokeWidth: 0,
      }) as StampObject;
      shapeObject.shapeOuterWidth = width;
      shapeObject.shapeOuterHeight = height;
    }
    if (shape === 'triangle') {
      const side = requestedSize || 360;
      const triangleHeight = Math.round(side * 0.866);
      shapeObject = new fabric.Path(getTriangleRingPath(side, triangleHeight, effectiveStrokeWidth, effectiveLineBreak) as any, {
        uid: toId(),
        kind: 'shape',
        shapeKind: 'triangle',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fill: inkColor,
        stroke: 'rgba(0,0,0,0)',
        strokeWidth: 0,
      }) as StampObject;
      shapeObject.shapeOuterWidth = side;
      shapeObject.shapeOuterHeight = triangleHeight;
    }
    if (shape === 'oval') {
      const width = requestedWidth || 440;
      const height = requestedHeight || 320;
      shapeObject = new fabric.Path(getShapeRingPath('oval', width, height, effectiveStrokeWidth, effectiveLineBreak) as any, {
        uid: toId(),
        kind: 'shape',
        shapeKind: 'oval',
        left: centerX,
        top: centerY,
        originX: 'center',
        originY: 'center',
        fill: inkColor,
        stroke: 'rgba(0,0,0,0)',
        strokeWidth: 0,
      }) as StampObject;
      shapeObject.shapeOuterWidth = width;
      shapeObject.shapeOuterHeight = height;
    }

    if (!shapeObject) return;
    disableObjectLayoutEditing(shapeObject);

    if (shapeObject.shapeKind !== 'triangle' && !(shapeObject instanceof fabric.Path) && (!shapeObject.fill || shapeObject.fill === 'transparent')) {
      shapeObject.set('fill', 'rgba(0,0,0,0)');
    }
    applyShapeBorder(shapeObject, effectiveStrokeWidth, effectiveLineBreak);
    if (style) {
      shapeObject.set({ strokeDashArray: [] });
      (shapeObject as StampObject).borderStyle = 'solid';
    }
    if (dimensions) {
      const displayedSize = requestedSize || Math.max(requestedWidth || 0, requestedHeight || 0);
      (shapeObject as StampObject).shapeOuterWidth = requestedSize || requestedWidth || displayedSize;
      (shapeObject as StampObject).shapeOuterHeight =
        shape === 'triangle' && requestedSize
          ? Math.round(requestedSize * 0.866)
          : requestedSize || requestedHeight || displayedSize;
      const mmDimensions = style?.mm || dimensions;
      (shapeObject as StampObject).shapeMmWidth = mmDimensions.size || mmDimensions.width || displayedSize;
      (shapeObject as StampObject).shapeMmHeight =
        shape === 'triangle'
          ? undefined
          : mmDimensions.size || mmDimensions.height || displayedSize;
      applyShapeSize(shapeObject, displayedSize);
    } else {
      applyShapeSize(shapeObject, shapeWidth);
    }
    addLayerBelowCurrent(shapeObject);
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

    addLayerBelowCurrent(target);
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
    const sourceText = textValue.trim() || active.sourceText || 'APPROVED';
    const normalizedRadius = getTextRadiusForTarget(textRadius);
    const textFrame = active.shapeKind ? getIndependentTextFrame(normalizedRadius, active.shapeKind) : null;
    const rebuilt = active.shapeKind
      ? createPerimeterText({
          text: sourceText,
          shape: active.shapeKind,
          left,
          top,
          width: textFrame?.width || Math.max(1, active.getScaledWidth()),
          height: textFrame?.height || Math.max(1, active.getScaledHeight()),
          fontSize,
          fontFamily: mapFontFamily(selectedFont),
          fontWeight,
          fontStyle,
          letterSpacing: letterSpacing * 10,
          color: inkColor,
          opacity: opacity / 100,
          radiusValue: SHAPE_CONTROL_MAX,
          spacingValue: textSpacing,
          startPointValue: textStartPoint,
          flipHorizontal: textFlipHorizontal,
          sideTexts: active.textSideValues || textSideValues,
          sideFlips: active.textSideFlips || textSideFlips,
        })
      : createArcText({
          text: sourceText,
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
    if (!active.shapeKind) {
      rebuilt.scaleX = scaleX;
      rebuilt.scaleY = scaleY;
    }
    rebuilt.angle = angle;
    rebuilt.opacity = opacity / 100;
    rebuilt.textRadiusValue = normalizedRadius;
    rebuilt.textSpacingValue = textSpacing;
    rebuilt.textStartPointValue = textStartPoint;
    rebuilt.textFlipHorizontal = textFlipHorizontal && (active.shapeKind === 'circle' || active.shapeKind === 'oval');
    rebuilt.textSideValues = active.textSideValues || textSideValues;
    rebuilt.textSideFlips = active.textSideFlips || textSideFlips;

    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    showSelectionOutline(rebuilt);
    canvas.requestRenderAll();
  };

  const updateActiveTextStyle = (nextValues: Partial<{
    font: FontChoice;
    size: number;
    weight: 'normal' | 'bold';
    style: 'normal' | 'italic';
    color: string;
  }>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || (active.kind !== 'text' && active.kind !== 'arc-text')) return;

    const nextFont = nextValues.font ?? selectedFont;
    const nextSize = nextValues.size ?? fontSize;
    const nextWeight = nextValues.weight ?? fontWeight;
    const nextStyle = nextValues.style ?? fontStyle;
    const nextColor = nextValues.color ?? inkColor;

    setSelectedFont(nextFont);
    setFontSize(nextSize);
    setFontWeight(nextWeight);
    setFontStyle(nextStyle);
    setInkColor(nextColor);

    if (active.kind === 'text') {
      active.set({
        fontFamily: mapFontFamily(nextFont),
        fontSize: nextSize,
        fontWeight: nextWeight,
        fontStyle: nextStyle,
        fill: nextColor,
      });
      active.setCoords();
      canvas.requestRenderAll();
      saveState();
      return;
    }

    if (!active.shapeKind) return;
    const normalizedRadius = getTextRadiusForTarget(active.textRadiusValue);
    const textFrame = getIndependentTextFrame(normalizedRadius, active.shapeKind);
    const rebuilt = createPerimeterText({
      text: active.sourceText || textValue || getShapeTextLabel(active.shapeKind),
      shape: active.shapeKind,
      left: active.left || canvas.width / 2,
      top: active.top || canvas.height / 2,
      width: textFrame.width,
      height: textFrame.height,
      fontSize: nextSize,
      fontFamily: mapFontFamily(nextFont),
      fontWeight: nextWeight,
      fontStyle: nextStyle,
      letterSpacing: letterSpacing * 10,
      color: nextColor,
      opacity: opacity / 100,
      radiusValue: SHAPE_CONTROL_MAX,
      spacingValue: active.textSpacingValue ?? textSpacing,
      startPointValue: active.textStartPointValue ?? textStartPoint,
      flipHorizontal: Boolean(active.textFlipHorizontal),
      sideTexts: active.textSideValues || textSideValues,
      sideFlips: active.textSideFlips || textSideFlips,
    });
    rebuilt.uid = active.uid;
    rebuilt.textRadiusValue = normalizedRadius;
    rebuilt.textSpacingValue = active.textSpacingValue ?? textSpacing;
    rebuilt.textStartPointValue = active.textStartPointValue ?? textStartPoint;
    rebuilt.textFlipHorizontal = Boolean(active.textFlipHorizontal);
    rebuilt.textSideValues = active.textSideValues || textSideValues;
    rebuilt.textSideFlips = active.textSideFlips || textSideFlips;
    rebuilt.angle = active.angle || 0;
    disableObjectLayoutEditing(rebuilt);
    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    showSelectionOutline(rebuilt);
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
  };

  const updateTextAroundProperties = (nextValues: Partial<{ radius: number; spacing: number; startPoint: number }>) => {
    const nextSpacing = nextValues.spacing ?? textSpacing;
    const nextStartPoint = nextValues.startPoint ?? textStartPoint;
    setTextSpacing(nextSpacing);
    setTextStartPoint(nextStartPoint);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'arc-text' || !active.shapeKind) return;

    const nextRadius = getTextRadiusForTarget(nextValues.radius ?? textRadius);
    const textFrame = getIndependentTextFrame(nextRadius, active.shapeKind);
    setTextRadius(nextRadius);
    const rebuilt = createPerimeterText({
      text: active.sourceText || textValue || getShapeTextLabel(active.shapeKind),
      shape: active.shapeKind,
      left: active.left || canvas.width / 2,
      top: active.top || canvas.height / 2,
      width: textFrame.width,
      height: textFrame.height,
      fontSize,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight: 'normal',
      fontStyle,
      letterSpacing: letterSpacing * 10,
      color: inkColor,
      opacity: opacity / 100,
      radiusValue: SHAPE_CONTROL_MAX,
      spacingValue: nextSpacing,
      startPointValue: nextStartPoint,
      flipHorizontal: Boolean(active.textFlipHorizontal),
      sideTexts: active.textSideValues || textSideValues,
      sideFlips: active.textSideFlips || textSideFlips,
    });
    rebuilt.uid = active.uid;
    rebuilt.textRadiusValue = nextRadius;
    rebuilt.textFlipHorizontal = Boolean(active.textFlipHorizontal);
    rebuilt.textSideValues = active.textSideValues || textSideValues;
    rebuilt.textSideFlips = active.textSideFlips || textSideFlips;
    rebuilt.angle = active.angle || 0;
    disableObjectLayoutEditing(rebuilt);
    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    showSelectionOutline(rebuilt);
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
  };

  const rebuildPerimeterSideText = (nextSideTexts: string[], nextSideFlips: boolean[]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'arc-text' || (active.shapeKind !== 'triangle' && active.shapeKind !== 'rectangle')) return;
    setTextSideValues(nextSideTexts);
    setTextSideFlips(nextSideFlips);

    const normalizedRadius = getTextRadiusForTarget(active.textRadiusValue);
    const textFrame = getIndependentTextFrame(normalizedRadius, active.shapeKind);
    const rebuilt = createPerimeterText({
      text: nextSideTexts[0] || getShapeAroundTextLabel(active.shapeKind),
      shape: active.shapeKind,
      left: active.left || canvas.width / 2,
      top: active.top || canvas.height / 2,
      width: textFrame.width,
      height: textFrame.height,
      fontSize,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight,
      fontStyle,
      letterSpacing: letterSpacing * 10,
      color: inkColor,
      opacity: opacity / 100,
      radiusValue: SHAPE_CONTROL_MAX,
      spacingValue: active.textSpacingValue ?? textSpacing,
      startPointValue: active.textStartPointValue ?? textStartPoint,
      sideTexts: nextSideTexts,
      sideFlips: nextSideFlips,
    });
    rebuilt.uid = active.uid;
    rebuilt.textRadiusValue = normalizedRadius;
    rebuilt.textSpacingValue = active.textSpacingValue ?? textSpacing;
    rebuilt.textStartPointValue = active.textStartPointValue ?? textStartPoint;
    rebuilt.textSideValues = nextSideTexts;
    rebuilt.textSideFlips = nextSideFlips;
    rebuilt.angle = active.angle || 0;
    disableObjectLayoutEditing(rebuilt);
    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    showSelectionOutline(rebuilt);
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
  };

  const updatePerimeterSideText = (index: number, value: string) => {
    const active = canvasRef.current?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'arc-text' || (active.shapeKind !== 'triangle' && active.shapeKind !== 'rectangle')) return;
    const sideCount = active.shapeKind === 'rectangle' ? 4 : 3;
    const fallback = getShapeAroundTextLabel(active.shapeKind);
    const currentTexts = Array.from({ length: sideCount }, (_, sideIndex) => textSideValues[sideIndex] || active.textSideValues?.[sideIndex] || fallback);
    const currentFlips = Array.from({ length: sideCount }, (_, sideIndex) => Boolean(textSideFlips[sideIndex] ?? active.textSideFlips?.[sideIndex]));
    currentTexts[index] = value;
    rebuildPerimeterSideText(currentTexts, currentFlips);
  };

  const togglePerimeterSideFlip = (index: number) => {
    const active = canvasRef.current?.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'arc-text' || (active.shapeKind !== 'triangle' && active.shapeKind !== 'rectangle')) return;
    const sideCount = active.shapeKind === 'rectangle' ? 4 : 3;
    const fallback = getShapeAroundTextLabel(active.shapeKind);
    const currentTexts = Array.from({ length: sideCount }, (_, sideIndex) => textSideValues[sideIndex] || active.textSideValues?.[sideIndex] || fallback);
    const currentFlips = Array.from({ length: sideCount }, (_, sideIndex) => Boolean(textSideFlips[sideIndex] ?? active.textSideFlips?.[sideIndex]));
    currentFlips[index] = !currentFlips[index];
    rebuildPerimeterSideText(currentTexts, currentFlips);
  };

  const toggleTextFlipHorizontal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'arc-text' || (active.shapeKind !== 'circle' && active.shapeKind !== 'oval')) return;
    const nextFlip = !Boolean(active.textFlipHorizontal);
    setTextFlipHorizontal(nextFlip);
    const normalizedRadius = getTextRadiusForTarget(active.textRadiusValue);
    const textFrame = getIndependentTextFrame(normalizedRadius, active.shapeKind);
    const rebuilt = createPerimeterText({
      text: active.sourceText || textValue || getShapeTextLabel(active.shapeKind),
      shape: active.shapeKind,
      left: active.left || canvas.width / 2,
      top: active.top || canvas.height / 2,
      width: textFrame.width,
      height: textFrame.height,
      fontSize,
      fontFamily: mapFontFamily(selectedFont),
      fontWeight,
      fontStyle,
      letterSpacing: letterSpacing * 10,
      color: inkColor,
      opacity: opacity / 100,
      radiusValue: SHAPE_CONTROL_MAX,
      spacingValue: active.textSpacingValue ?? textSpacing,
      startPointValue: active.textStartPointValue ?? textStartPoint,
      flipHorizontal: nextFlip,
      sideTexts: active.textSideValues,
      sideFlips: active.textSideFlips,
    });
    rebuilt.uid = active.uid;
    rebuilt.textRadiusValue = normalizedRadius;
    rebuilt.textFlipHorizontal = nextFlip;
    rebuilt.angle = active.angle || 0;
    disableObjectLayoutEditing(rebuilt);
    canvas.remove(active);
    canvas.add(rebuilt);
    canvas.setActiveObject(rebuilt);
    showSelectionOutline(rebuilt);
    canvas.requestRenderAll();
    refreshLayerList();
    saveState();
  };

  const updateCenterTextProperties = (nextValues: Partial<{ horizontal: number; vertical: number; rotation: number }>) => {
    const nextHorizontal = clamp(Math.round(nextValues.horizontal ?? textHorizontalPosition), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    const nextVertical = clamp(Math.round(nextValues.vertical ?? textVerticalPosition), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    const nextRotation = clamp(Math.round(nextValues.rotation ?? textRotationPosition), SHAPE_CONTROL_MIN, SHAPE_CONTROL_MAX);
    setTextHorizontalPosition(nextHorizontal);
    setTextVerticalPosition(nextVertical);
    setTextRotationPosition(nextRotation);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active || active.kind !== 'text') return;

    active.set({
      left: (nextHorizontal / 100) * canvas.width,
      top: (nextVertical / 100) * canvas.height,
      angle: (nextRotation - 50) * 3.6,
    });
    active.setCoords();
    showSelectionOutline(active);
    canvas.requestRenderAll();
    saveState();
  };

  const applyInkColor = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const active = canvas.getActiveObject() as StampObject | null;
    if (!active) return;
    if (active.kind === 'shape' || active.kind === 'text' || active.kind === 'arc-text') {
      active.set({
        fill: active.kind === 'shape' && !(active instanceof fabric.Path) ? 'rgba(0,0,0,0)' : inkColor,
        stroke: active.kind === 'shape' && active instanceof fabric.Path ? 'rgba(0,0,0,0)' : inkColor,
      });
    }
    if (active.kind === 'text' || active.kind === 'arc-text') {
      active.set('fill', inkColor);
    }
    refreshDistressOverlay(active);
    canvas.requestRenderAll();
    saveState();
  };

  const updateSelectedLayerColor = (color: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setInkColor(color);

    (canvas.getObjects() as StampObject[]).forEach((object) => {
      if (object.kind === 'text') {
        object.set({ fill: color });
      }
      if (object.kind === 'arc-text') {
        ((object as any)._objects || []).forEach((child: fabric.Object) => {
          if (child instanceof fabric.Text) {
            child.set({ fill: color });
          } else {
            child.set({ fill: 'rgba(0,0,0,0)', stroke: 'rgba(0,0,0,0)' });
          }
        });
      }
      if (object.kind === 'shape') {
        applyShapeBorder(
          object,
          Math.round(Number(object.shapeStrokeWidth ?? object.strokeWidth ?? borderWidth)),
          Math.round(Number(object.shapeLineBreak ?? lineBreak)),
          color,
        );
      }
      if (object.kind && object.kind !== 'distress') {
        refreshDistressOverlay(object);
        object.setCoords();
      }
    });
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
      addLayerBelowCurrent(copy);
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

  const createNewStamp = () => {
    const dimensions =
      newStampShape === 'circle'
        ? { size: newStampDiameterMm }
        : newStampShape === 'triangle'
          ? { size: newStampSideMm }
          : { width: newStampWidthMm, height: newStampHeightMm };
    const canvasSizedDimensions = getCanvasSizedShapeDimensions(newStampShape, dimensions);

    resetCanvas();
    resetShapePropertiesForNewLayer();
    setCanvasSizeDisplay(
      newStampShape === 'circle' || newStampShape === 'triangle'
        ? { width: dimensions.size || SHAPE_PRESET_MM[newStampShape].size || 0 }
        : { width: dimensions.width || 0, height: dimensions.height || 0 },
    );
    addShapeObject(newStampShape, true, canvasSizedDimensions, {
      strokeWidth: NEW_STAMP_STROKE,
      lineBreak: NEW_STAMP_LINE_BREAK,
      mm: dimensions,
    });
    setIsNewStampOpen(false);
    pushStatus('New stamp created');
  };

  const resetShapePropertiesForNewLayer = () => {
    setShapeWidth(SHAPE_CONTROL_MAX);
    setShapeHeight(SHAPE_CONTROL_MAX);
    setBorderWidth(NEW_STAMP_STROKE);
    setLineBreak(NEW_STAMP_LINE_BREAK);
    setBorderStyle('solid');
  };

  const openNewStampModal = () => {
    resetShapePropertiesForNewLayer();
    selectNewStampShape(newStampShape);
    setIsNewStampOpen(true);
  };

  const addToolbarShapeLayer = () => {
    resetShapePropertiesForNewLayer();
    addShapeObject(toolbarShape, true, getCanvasSizedShapeDimensions(toolbarShape, SHAPE_PRESET_MM[toolbarShape]), {
      strokeWidth: NEW_STAMP_STROKE,
      lineBreak: NEW_STAMP_LINE_BREAK,
      mm: SHAPE_PRESET_MM[toolbarShape],
    });
    setCanvasSizeDisplay(getShapeCanvasSizeDisplay({
      shapeKind: toolbarShape,
      shapeMmWidth: SHAPE_PRESET_MM[toolbarShape].size || SHAPE_PRESET_MM[toolbarShape].width,
      shapeMmHeight: toolbarShape === 'triangle' ? undefined : SHAPE_PRESET_MM[toolbarShape].size || SHAPE_PRESET_MM[toolbarShape].height,
    } as StampObject));
    pushStatus(`${formatShapeName(toolbarShape)} layer added`);
  };

  const renderTextStyleBar = () => {
    const showFlip = activeLayerKind === 'arc-text' && (activeShapeKind === 'circle' || activeShapeKind === 'oval');
    return (
    <div className={`copje-text-style-bar ${showFlip ? 'has-flip' : ''}`} aria-label="Text style controls">
      <select
        className="copje-style-select copje-style-font"
        value={selectedFont}
        onChange={(event) => updateActiveTextStyle({ font: event.target.value as FontChoice })}
        aria-label="Font family"
      >
        {FONT_CHOICES.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>
      <select
        className="copje-style-select copje-style-size"
        value={fontSize}
        onChange={(event) => updateActiveTextStyle({ size: Number(event.target.value) })}
        aria-label="Font size"
      >
        {[18, 22, 28, 36, 48, 64, 80, 96, 120].map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`copje-style-btn ${fontWeight === 'bold' ? 'is-active' : ''}`}
        onClick={() => updateActiveTextStyle({ weight: fontWeight === 'bold' ? 'normal' : 'bold' })}
        aria-label="Bold"
      >
        B
      </button>
      <button
        type="button"
        className={`copje-style-btn is-italic ${fontStyle === 'italic' ? 'is-active' : ''}`}
        onClick={() => updateActiveTextStyle({ style: fontStyle === 'italic' ? 'normal' : 'italic' })}
        aria-label="Italic"
      >
        I
      </button>
      {showFlip && (
        <button
          type="button"
          className={`copje-style-btn ${textFlipHorizontal ? 'is-active' : ''}`}
          onClick={toggleTextFlipHorizontal}
          aria-label="Flip text horizontally"
        >
          <ArrowUpDown size={16} />
        </button>
      )}
    </div>
    );
  };

  const exportPNG = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = 2000 / canvasSize;
    const image = withSelectionOutlineHidden(() =>
      canvas.toDataURL({
        format: 'png',
        multiplier: scale,
      }),
    );
    const link = document.createElement('a');
    link.href = image;
    link.download = `copje-stamp-${Date.now()}.png`;
    link.click();
    pushStatus('Downloaded PNG @ 2000x2000');
  };

  const exportSVG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const svg = withSelectionOutlineHidden(() => canvas.toSVG());
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
    const image = withSelectionOutlineHidden(() => canvas.toDataURL({ format: 'png', multiplier: scale }));
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
    const json = withSelectionOutlineHidden(() => JSON.stringify(canvas.toDatalessJSON(STAMP_JSON_EXTRAS), null, 2));
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

  const loadImageFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await getFileAsDataUrl(file);
      await addImageObject(dataUrl);
      pushStatus('Image added');
    } catch {
      pushStatus('Unable to add image');
    } finally {
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
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

    const handleSelect = () => {
      if (ignoreHistoryRef.current) return;
      syncActiveObject();
    };
    const handleClear = () => {
      if (ignoreHistoryRef.current) return;
      clearSelection();
    };
    const handleMutate = (event?: { target?: fabric.Object }) => {
      if (ignoreHistoryRef.current) return;
      if (event?.target) {
        disableObjectLayoutEditing(event.target);
      }
      syncActiveObject();
      refreshLayerList();
      saveState();
    };
    const handleModified = () => {
      if (ignoreHistoryRef.current) return;
      syncActiveObject();
      refreshLayerList();
      saveState();
    };
    const handleRemoved = () => {
      if (ignoreHistoryRef.current) return;
      refreshLayerList();
      saveState();
    };
    const updateCanvasFrameSize = () => {
      const frame = canvasFrameRef.current;
      const host = canvasHostRef.current;
      const shell = frame?.parentElement;
      if (!frame || !shell || !host) return;
      const isDesktop = window.innerWidth >= 1024;
      const workspace = frame.closest('.copje-workspace-grid') as HTMLElement | null;
      const desktopAvailable = workspace
        ? workspace.clientWidth - 250 - 300 - 48
        : shell.clientWidth;
      const available = Math.max(0, isDesktop ? desktopAvailable : shell.clientWidth - 1);
      const maxView = isDesktop ? DESKTOP_CANVAS_VIEW_MAX : MOBILE_CANVAS_VIEW_MAX;
      const target = Math.max(140, Math.min(maxView, available));
      frame.style.width = `${target}px`;
      frame.style.height = `${target}px`;
      host.style.width = `${target}px`;
      host.style.height = `${target}px`;
    };

    (canvas as any).on('selection:created', handleSelect);
    (canvas as any).on('selection:updated', handleSelect);
    (canvas as any).on('selection:cleared', handleClear);
    (canvas as any).on('object:added', handleMutate);
    (canvas as any).on('object:removed', handleRemoved);
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
      (canvas as any).off('object:removed', handleRemoved);
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
          <p className="copje-kicker">Cop Je! Â· Online Rubber Stamp Maker</p>
        </section>

        <section className="copje-desktop-toolbar" aria-label="Stamp tools">
          <button className="copje-btn copje-btn-ghost copje-back-btn" onClick={() => applyPreset('default')}>
            <RotateCcw size={16} />
            Templates
          </button>
          <div className="copje-toolbar-actions">
            <button
              className={`copje-stamp-tool-btn shape-${toolbarShape}`}
              onClick={addToolbarShapeText}
              aria-label="Add text around shape"
            >
              <span className="copje-stamp-symbol copje-stamp-symbol-arc" aria-hidden="true">
                <span className="copje-stamp-symbol-letter">A</span>
                <Plus className="copje-symbol-plus" size={14} />
              </span>
            </button>
            <button className="copje-stamp-tool-btn shape-text" onClick={() => addTextObject(false, true, 'Text in the center')} aria-label="Add straight text">
              <span className="copje-stamp-symbol copje-stamp-symbol-text" aria-hidden="true">
                <span className="copje-stamp-symbol-letter">A</span>
                <Plus className="copje-symbol-plus" size={14} />
              </span>
            </button>
            <button
              className={`copje-stamp-tool-btn shape-${toolbarShape}`}
              onClick={addToolbarShapeLayer}
              aria-label="Add shape layer"
            >
              <span className="copje-stamp-symbol copje-stamp-symbol-shape" aria-hidden="true">
                <Plus className="copje-symbol-plus" size={14} />
              </span>
            </button>
            <button className="copje-icon-btn" onClick={() => imageInputRef.current?.click()} aria-label="Add image">
              <ImageIcon size={22} />
              <Plus size={14} />
            </button>
            <button className="copje-icon-btn" onClick={() => projectInputRef.current?.click()} aria-label="Load project">
              <Upload size={22} />
            </button>
          </div>
          <button className="copje-btn copje-btn-primary copje-new-btn" onClick={openNewStampModal}>
            New stamp +
          </button>
        </section>

        <section className="copje-workspace-grid">
          <aside className="copje-layer-panel" aria-label="Stamp layers">
            <div className="copje-panel-tabs">
              <button className="is-active">All</button>
              <button>Text</button>
              <button>Figure</button>
            </div>
            <div className="copje-layer-list">
              {layerItems.length === 0 && <p className="copje-empty">No layers yet</p>}
              {layerItems.map((item) => (
                <div
                  key={item.id}
                  className={`copje-layer-item ${activeLayerIdForFit === item.id ? 'active' : ''} ${draggingLayerId === item.id ? 'is-dragging' : ''}`}
                  role="button"
                  tabIndex={0}
                  draggable
                  onClick={() => selectLayer(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') selectLayer(item.id);
                  }}
                  onDragStart={(event) => handleLayerDragStart(event, item.id)}
                  onDragOver={handleLayerDragOver}
                  onDrop={(event) => handleLayerDrop(event, item.id)}
                  onDragEnd={() => setDraggingLayerId(null)}
                >
                  <span>
                    <span className="copje-layer-id">#{item.order}</span> {item.label}
                  </span>
                  <span className="copje-layer-actions">
                    <span className="copje-layer-handle" aria-hidden="true">::</span>
                    <button
                      type="button"
                      className="copje-layer-delete"
                      aria-label={`Delete ${item.label}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteLayer(item.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </aside>
            <section className="copje-main-column">
            <div
              ref={canvasFrameRef}
              className="copje-canvas-frame-inner"
              style={{ width: `${MOBILE_CANVAS_VIEW_MAX}px`, height: `${MOBILE_CANVAS_VIEW_MAX}px` }}
            >
              <div className="copje-canvas-ruler" />
              <canvas
                ref={canvasHostRef}
                className="copje-canvas"
                width={canvasSize}
                height={canvasSize}
                style={{ width: `${MOBILE_CANVAS_VIEW_MAX}px`, height: `${MOBILE_CANVAS_VIEW_MAX}px` }}
              />
              <div className={`copje-guide x ${guides.x ? 'on' : ''}`} />
              <div className={`copje-guide y ${guides.y ? 'on' : ''}`} />
            </div>
            <section className="copje-tool-content">
              <label className="copje-panel-color-control" aria-label="Layer color">
                <input
                  type="color"
                  value={inkColor}
                  onInput={(event) => updateSelectedLayerColor((event.currentTarget as HTMLInputElement).value)}
                  onChange={(event) => updateSelectedLayerColor(event.target.value)}
                />
                <span style={{ background: inkColor }} />
              </label>
              {activeLayerKind === 'arc-text' ? (
                <section className="copje-toolbar">
                  {renderTextStyleBar()}
                  {activeShapeKind === 'triangle' || activeShapeKind === 'rectangle' ? (
                    <>
                      {Array.from({ length: activeShapeKind === 'rectangle' ? 4 : 3 }, (_, index) => (
                        <div className="copje-side-text-row" key={`${activeShapeKind}-side-${index}`}>
                          <button
                            className={`copje-side-flip-btn ${textSideFlips[index] ? 'is-active' : ''}`}
                            type="button"
                            aria-label="Flip side text horizontally"
                            onClick={() => togglePerimeterSideFlip(index)}
                          >
                            <ArrowUpDown size={15} />
                          </button>
                          <input
                            className="copje-input"
                            value={textSideValues[index] || getShapeAroundTextLabel(activeShapeKind)}
                            onChange={(event) => updatePerimeterSideText(index, event.target.value)}
                            placeholder={getShapeAroundTextLabel(activeShapeKind)}
                          />
                        </div>
                      ))}
                      {activeShapeKind === 'triangle' && (
                        <>
                          <label className="copje-field-label">Margin [ {textRadius}.0 ]</label>
                          <input
                            className="copje-range"
                            type="range"
                            min={SHAPE_CONTROL_MIN}
                            max={SHAPE_CONTROL_MAX}
                            value={textRadius}
                            onChange={(event) => updateTextAroundProperties({ radius: Number(event.target.value) })}
                          />
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        className="copje-input"
                        value={textValue}
                        onChange={(event) => setTextValue(event.target.value)}
                        onBlur={applyActiveText}
                        placeholder={getShapeTextLabel((activeShapeKind || 'circle') as ShapeChoice)}
                      />
                      <label className="copje-field-label">
                        {formatShapeName((activeShapeKind || 'circle') as ShapeChoice)} text [{textRadius}]
                      </label>
                      <input
                        className="copje-range"
                        type="range"
                        min={SHAPE_CONTROL_MIN}
                        max={SHAPE_CONTROL_MAX}
                        value={textRadius}
                        onChange={(event) => updateTextAroundProperties({ radius: Number(event.target.value) })}
                      />
                      <label className="copje-field-label">Spacing [{textSpacing}]</label>
                      <input
                        className="copje-range"
                        type="range"
                        min={SHAPE_CONTROL_MIN}
                        max={SHAPE_CONTROL_MAX}
                        value={textSpacing}
                        onChange={(event) => updateTextAroundProperties({ spacing: Number(event.target.value) })}
                      />
                      <label className="copje-field-label">Start point [{textStartPoint}]</label>
                      <input
                        className="copje-range"
                        type="range"
                        min={SHAPE_CONTROL_MIN}
                        max={SHAPE_CONTROL_MAX}
                        value={textStartPoint}
                        onChange={(event) => updateTextAroundProperties({ startPoint: Number(event.target.value) })}
                      />
                    </>
                  )}
                </section>
              ) : activeLayerKind === 'text' ? (
                <section className="copje-toolbar">
                  {renderTextStyleBar()}
                  <input
                    className="copje-input"
                    value={textValue}
                    onChange={(event) => setTextValue(event.target.value)}
                    onBlur={applyActiveText}
                    placeholder="Text in the center"
                  />
                  <label className="copje-field-label">Horizontal position : {textHorizontalPosition}</label>
                  <input
                    className="copje-range"
                    type="range"
                    min={SHAPE_CONTROL_MIN}
                    max={SHAPE_CONTROL_MAX}
                    value={textHorizontalPosition}
                    onChange={(event) => updateCenterTextProperties({ horizontal: Number(event.target.value) })}
                  />
                  <label className="copje-field-label">Vertical position : {textVerticalPosition}</label>
                  <input
                    className="copje-range"
                    type="range"
                    min={SHAPE_CONTROL_MIN}
                    max={SHAPE_CONTROL_MAX}
                    value={textVerticalPosition}
                    onChange={(event) => updateCenterTextProperties({ vertical: Number(event.target.value) })}
                  />
                  <label className="copje-field-label">Rotation : {textRotationPosition}</label>
                  <input
                    className="copje-range"
                    type="range"
                    min={SHAPE_CONTROL_MIN}
                    max={SHAPE_CONTROL_MAX}
                    value={textRotationPosition}
                    onChange={(event) => updateCenterTextProperties({ rotation: Number(event.target.value) })}
                  />
                </section>
              ) : (
                <section className="copje-toolbar">
                  <label className="copje-field-label">Size : {shapeWidth}</label>
                  <input
                    className="copje-range"
                    type="range"
                    min={SHAPE_CONTROL_MIN}
                    max={SHAPE_CONTROL_MAX}
                    value={shapeWidth}
                    onChange={(event) => handleShapeSizeChange(Number(event.target.value))}
                  />
                  <label className="copje-field-label">Stroke : {borderWidth}</label>
                  <input
                    className="copje-range"
                    type="range"
                    min={SHAPE_CONTROL_MIN}
                    max={SHAPE_CONTROL_MAX}
                    value={borderWidth}
                    onChange={(event) => handleShapeStrokeChange(Number(event.target.value))}
                  />
                  <label className="copje-field-label">Line Break : {lineBreak}</label>
                  <input
                    className="copje-range"
                    type="range"
                    min={SHAPE_CONTROL_MIN}
                    max={SHAPE_CONTROL_MAX}
                    value={lineBreak}
                    onChange={(event) => handleLineBreakChange(Number(event.target.value))}
                  />
                </section>
              )}


            </section>
          </section>
        </section>

        <section className="copje-bottom-bar" aria-label="Export controls">
          <p className="copje-status">{busy ? 'Working...' : status}</p>
          <div className="copje-plate-size">
            <span>Canvas Size:</span>
            <input
              type="number"
              min={1}
              max={SHAPE_CONTROL_MAX}
              value={canvasSizeDisplay.width}
              onChange={(event) => updateCanvasSizeDisplay({ width: Number(event.target.value) })}
              aria-label="Canvas width in millimeters"
            />
            {typeof canvasSizeDisplay.height === 'number' && (
              <>
                <span>x</span>
                <input
                  type="number"
                  min={1}
                  max={SHAPE_CONTROL_MAX}
                  value={canvasSizeDisplay.height}
                  onChange={(event) => updateCanvasSizeDisplay({ height: Number(event.target.value) })}
                  aria-label="Canvas height in millimeters"
                />
              </>
            )}
            <span>/mm</span>
          </div>
          <div className="copje-export-actions">
            <button className="copje-btn copje-btn-ghost" onClick={exportSVG}>
              <FileJson size={15} />
              SVG
            </button>
            <button className="copje-btn copje-btn-primary" onClick={exportPNG}>
              <Download size={15} />
              Download stamp
            </button>
          </div>
        </section>

        <input
          ref={imageInputRef}
          className="copje-file-input"
          type="file"
          accept="image/*"
          onChange={loadImageFromFile}
        />
        <input
          ref={projectInputRef}
          className="copje-file-input"
          type="file"
          accept="application/json,.json,.copje"
          onChange={loadProjectFromJSON}
        />
      </main>

      {isNewStampOpen && (
        <div className="copje-modal-backdrop" role="presentation">
          <section className="copje-new-stamp-modal" role="dialog" aria-modal="true" aria-labelledby="new-stamp-title">
            <h2 id="new-stamp-title">Select the shape of stamp</h2>
            <div className="copje-stamp-shape-list" role="radiogroup" aria-label="Stamp shape">
              <button
                type="button"
                className={`copje-stamp-shape-row ${newStampShape === 'circle' ? 'is-active' : ''}`}
                onClick={() => selectNewStampShape('circle')}
              >
                <span className="copje-new-stamp-tool-icon shape-circle">
                  <span className="copje-stamp-symbol copje-stamp-symbol-shape" aria-hidden="true">
                    <Plus className="copje-symbol-plus" size={14} />
                  </span>
                </span>
                <span>Round stamp</span>
              </button>
              {newStampShape === 'circle' && (
                <div className="copje-stamp-dim-row">
                  <label>
                    Diameter in (mm)
                    <input
                      type="number"
                      min={NEW_STAMP_DIMENSION_MIN}
                      max={NEW_STAMP_DIMENSION_MAX}
                      value={newStampDiameterMm}
                      onChange={(event) => setNewStampDiameterMm(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className={`copje-stamp-shape-row ${newStampShape === 'oval' ? 'is-active' : ''}`}
                onClick={() => selectNewStampShape('oval')}
              >
                <span className="copje-new-stamp-tool-icon shape-oval">
                  <span className="copje-stamp-symbol copje-stamp-symbol-shape" aria-hidden="true">
                    <Plus className="copje-symbol-plus" size={14} />
                  </span>
                </span>
                <span>Ellipse stamp</span>
              </button>
              {newStampShape === 'oval' && (
                <div className="copje-stamp-dim-row">
                  <label>
                    Width in (mm)
                    <input
                      type="number"
                      min={NEW_STAMP_DIMENSION_MIN}
                      max={NEW_STAMP_DIMENSION_MAX}
                      value={newStampWidthMm}
                      onChange={(event) => setNewStampWidthMm(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Height in (mm)
                    <input
                      type="number"
                      min={NEW_STAMP_DIMENSION_MIN}
                      max={NEW_STAMP_DIMENSION_MAX}
                      value={newStampHeightMm}
                      onChange={(event) => setNewStampHeightMm(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className={`copje-stamp-shape-row ${newStampShape === 'triangle' ? 'is-active' : ''}`}
                onClick={() => selectNewStampShape('triangle')}
              >
                <span className="copje-new-stamp-tool-icon shape-triangle">
                  <span className="copje-stamp-symbol copje-stamp-symbol-shape" aria-hidden="true">
                    <Plus className="copje-symbol-plus" size={14} />
                  </span>
                </span>
                <span>Triangle stamp</span>
              </button>
              {newStampShape === 'triangle' && (
                <div className="copje-stamp-dim-row">
                  <label>
                    Side in (mm)
                    <input
                      type="number"
                      min={NEW_STAMP_DIMENSION_MIN}
                      max={NEW_STAMP_DIMENSION_MAX}
                      value={newStampSideMm}
                      onChange={(event) => setNewStampSideMm(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className={`copje-stamp-shape-row ${newStampShape === 'rectangle' ? 'is-active' : ''}`}
                onClick={() => selectNewStampShape('rectangle')}
              >
                <span className="copje-new-stamp-tool-icon shape-rectangle">
                  <span className="copje-stamp-symbol copje-stamp-symbol-shape" aria-hidden="true">
                    <Plus className="copje-symbol-plus" size={14} />
                  </span>
                </span>
                <span>Rectangle stamp</span>
              </button>
              {newStampShape === 'rectangle' && (
                <div className="copje-stamp-dim-row">
                  <label>
                    Width in (mm)
                    <input
                      type="number"
                      min={NEW_STAMP_DIMENSION_MIN}
                      max={NEW_STAMP_DIMENSION_MAX}
                      value={newStampWidthMm}
                      onChange={(event) => setNewStampWidthMm(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    Height in (mm)
                    <input
                      type="number"
                      min={NEW_STAMP_DIMENSION_MIN}
                      max={NEW_STAMP_DIMENSION_MAX}
                      value={newStampHeightMm}
                      onChange={(event) => setNewStampHeightMm(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="copje-new-stamp-actions">
              <button className="copje-btn copje-btn-ghost" type="button" onClick={() => setIsNewStampOpen(false)}>
                Cancel
              </button>
              <button className="copje-btn copje-btn-primary" type="button" onClick={createNewStamp}>
                Create
              </button>
            </div>
          </section>
        </div>
      )}

      <footer className="copje-footer">
        For design and mockup use only. Do not use to forge official documents.
      </footer>
    </div>
  );
}
