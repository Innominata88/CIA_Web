// src/ui/react/components/common/TreeView.jsx
// Tree view component for hierarchical data (datasets -> views)

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Eye, EyeOff, Users, Trash2 } from 'lucide-react';
import './TreeView.css';

/**
 * TreeView - Hierarchical tree structure with expand/collapse
 *
 * Structure:
 * Dataset
 *  ├─ Active View 1
 *  ├─ Active View 2
 *  └─ Inactive View 3
 *
 * @param {Object} props
 * @param {Array} props.items - Tree items
 * @param {Function} props.onItemClick - Called when item is clicked
 * @param {Function} props.onItemAction - Called when action button is clicked
 * @param {string} props.className - Additional CSS classes
 */
export function TreeView({ items, onItemClick, onItemAction, className = '' }) {
  const [expandedItems, setExpandedItems] = useState(new Set());

  const toggleExpand = (itemId) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  return (
    <div className={`tree-view ${className}`}>
      {items.map((item) => (
        <TreeNode
          key={item.id}
          item={item}
          isExpanded={expandedItems.has(item.id)}
          onToggle={() => toggleExpand(item.id)}
          onClick={() => onItemClick?.(item)}
          onAction={(action) => onItemAction?.(item, action)}
        />
      ))}
    </div>
  );
}

/**
 * TreeNode - Single node in the tree
 */
function TreeNode({ item, isExpanded, onToggle, onClick, onAction, depth = 0 }) {
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = (e) => {
    // If clicking the expand icon, just toggle
    if (e.target.closest('.tree-node-expand-icon')) {
      if (hasChildren) {
        onToggle();
      }
      return;
    }

    // If clicking an action button, handle that
    if (e.target.closest('.tree-node-action')) {
      return;
    }

    // Otherwise, trigger item click
    onClick?.(e);
  };

  return (
    <div className="tree-node-container">
      <div
        className={`tree-node ${item.active ? 'tree-node-active' : ''} ${item.type || ''}`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={handleClick}
        title={item.tooltip || item.name}
      >
        {/* Expand/collapse icon */}
        <div className="tree-node-expand-icon" onClick={hasChildren ? onToggle : undefined}>
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <div style={{ width: 14 }} />
          )}
        </div>

        {/* Node icon */}
        <div className="tree-node-icon">
          {item.icon || getDefaultIcon(item)}
        </div>

        {/* Node label */}
        <div className="tree-node-label">
          {item.name}
          {item.badge && (
            <span className="tree-node-badge">{item.badge}</span>
          )}
        </div>

        {/* Node actions */}
        {item.actions && item.actions.length > 0 && (
          <div className="tree-node-actions">
            {item.actions.map((action) => (
              <button
                key={action.id}
                className={`tree-node-action ${action.className || ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(action.id);
                }}
                title={action.tooltip}
              >
                {action.icon}
              </button>
            ))}
          </div>
        )}

        {/* Status indicators */}
        {item.metadata && (
          <div className="tree-node-metadata">
            {item.metadata.participants > 0 && (
              <div className="tree-node-metadata-item" title={`${item.metadata.participants} participant(s)`}>
                <Users size={12} />
                <span>{item.metadata.participants}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="tree-node-children">
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              isExpanded={false}
              onToggle={() => {}}
              onClick={() => onClick?.(child)}
              onAction={(action) => onAction?.(child, action)}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Get default icon based on item type
 */
function getDefaultIcon(item) {
  if (item.type === 'dataset') {
    return <div className="tree-node-icon-dataset">📊</div>;
  }

  if (item.type === 'view') {
    if (item.active) {
      return <Eye size={14} />;
    }
    return <EyeOff size={14} />;
  }

  return null;
}
