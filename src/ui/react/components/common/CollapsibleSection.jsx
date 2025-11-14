// src/ui/react/components/common/CollapsibleSection.jsx
// Collapsible section with header and animated content

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './CollapsibleSection.css';

/**
 * CollapsibleSection - Collapsible panel section with smooth animation
 *
 * Features:
 * - Smooth expand/collapse animation
 * - Persistent state via localStorage
 * - Customizable header
 * - Optional actions in header
 *
 * @param {Object} props
 * @param {string} props.title - Section title
 * @param {boolean} props.defaultExpanded - Initial expanded state
 * @param {string} props.storageKey - localStorage key for persistence
 * @param {React.ReactNode} props.children - Section content
 * @param {React.ReactNode} props.actions - Optional actions to show in header
 * @param {string} props.className - Additional CSS classes
 */
export function CollapsibleSection({
  title,
  defaultExpanded = true,
  storageKey,
  children,
  actions,
  className = '',
}) {
  // Load collapsed state from localStorage
  const getInitialExpanded = () => {
    if (storageKey) {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return defaultExpanded;
  };

  const [isExpanded, setIsExpanded] = useState(getInitialExpanded);
  const [contentHeight, setContentHeight] = useState(isExpanded ? 'auto' : 0);
  const contentRef = useRef(null);

  // Save state to localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, isExpanded.toString());
    }
  }, [isExpanded, storageKey]);

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      if (isExpanded) {
        const height = contentRef.current.scrollHeight;
        setContentHeight(height);

        // After animation, set to auto so content can grow
        const timer = setTimeout(() => {
          setContentHeight('auto');
        }, 300);

        return () => clearTimeout(timer);
      } else {
        setContentHeight(0);
      }
    }
  }, [isExpanded]);

  const toggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className={`collapsible-section ${className}`}>
      <div className="collapsible-section-header" onClick={toggle}>
        <div className="collapsible-section-header-content">
          <div className="collapsible-section-icon">
            {isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </div>
          <div className="collapsible-section-title">{title}</div>
        </div>

        {actions && (
          <div
            className="collapsible-section-actions"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>

      <div
        className="collapsible-section-content-wrapper"
        style={{
          height: contentHeight === 'auto' ? 'auto' : `${contentHeight}px`,
        }}
      >
        <div ref={contentRef} className="collapsible-section-content">
          {children}
        </div>
      </div>
    </div>
  );
}
