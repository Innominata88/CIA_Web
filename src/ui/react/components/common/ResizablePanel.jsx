// src/ui/react/components/common/ResizablePanel.jsx
// VS Code-style resizable panel with drag handle

import React, { useState, useRef, useEffect, useCallback } from 'react';
import './ResizablePanel.css';

/**
 * ResizablePanel - A panel that can be resized by dragging a handle
 *
 * Features:
 * - Vertical or horizontal resize
 * - Min/max size constraints
 * - Smooth dragging
 * - Persists size to localStorage
 *
 * @param {Object} props
 * @param {'vertical'|'horizontal'} props.direction - Resize direction
 * @param {number} props.defaultSize - Default size in pixels
 * @param {number} props.minSize - Minimum size in pixels
 * @param {number} props.maxSize - Maximum size in pixels
 * @param {string} props.storageKey - localStorage key for persistence
 * @param {string} props.position - 'start' or 'end' (where the resize handle is)
 * @param {React.ReactNode} props.children - Panel content
 */
export function ResizablePanel({
  direction = 'vertical',
  defaultSize = 300,
  minSize = 200,
  maxSize = 800,
  storageKey,
  position = 'end',
  children,
  className = '',
}) {
  // Load size from localStorage or use default
  const getInitialSize = () => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const size = parseInt(stored, 10);
        return Math.max(minSize, Math.min(maxSize, size));
      }
    }
    return defaultSize;
  };

  const [size, setSize] = useState(getInitialSize);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef(null);
  const startPosRef = useRef(0);
  const startSizeRef = useRef(0);

  // Save size to localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, size.toString());
    }
  }, [size, storageKey]);

  // Handle drag start
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);

    if (direction === 'vertical') {
      startPosRef.current = e.clientX;
    } else {
      startPosRef.current = e.clientY;
    }

    startSizeRef.current = size;
  }, [direction, size]);

  // Handle drag move
  const handleMouseMove = useCallback((e) => {
    if (!isResizing) return;

    const currentPos = direction === 'vertical' ? e.clientX : e.clientY;
    const delta = position === 'end'
      ? currentPos - startPosRef.current
      : startPosRef.current - currentPos;

    const newSize = startSizeRef.current + delta;
    const clampedSize = Math.max(minSize, Math.min(maxSize, newSize));

    setSize(clampedSize);
  }, [isResizing, direction, position, minSize, maxSize]);

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Attach/detach mouse event listeners
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = direction === 'vertical' ? 'ew-resize' : 'ns-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp, direction]);

  const style = direction === 'vertical'
    ? { width: `${size}px`, height: '100%' }
    : { height: `${size}px`, width: '100%' };

  const handlePosition = position === 'end' ? 'resize-handle-end' : 'resize-handle-start';

  return (
    <div
      ref={panelRef}
      className={`resizable-panel ${className}`}
      style={style}
    >
      {position === 'start' && (
        <div
          className={`resize-handle resize-handle-${direction} ${handlePosition}`}
          onMouseDown={handleMouseDown}
        >
          <div className="resize-handle-line" />
        </div>
      )}

      <div className="resizable-panel-content">
        {children}
      </div>

      {position === 'end' && (
        <div
          className={`resize-handle resize-handle-${direction} ${handlePosition}`}
          onMouseDown={handleMouseDown}
        >
          <div className="resize-handle-line" />
        </div>
      )}
    </div>
  );
}
