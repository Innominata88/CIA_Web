// src/ui/react/components/panels/LoadedDatasetsPanel/index.jsx
// Panel showing loaded datasets with their associated views in a tree structure

import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Trash2, Users } from 'lucide-react';
import { TreeView } from '@UI/react/components/common/TreeView.jsx';
import { useDatasets } from '@UI/react/hooks/useDatasets.js';
import { instanceManager } from '@Core/instances/instanceManager.js';
import './LoadedDatasetsPanel.css';

/**
 * LoadedDatasetsPanel - Tree view of datasets and their views
 *
 * Structure:
 * 📊 Dataset 1
 *  ├─ 👁️ View 1 (active) [2 users]
 *  ├─ 👁️ View 2 (active)
 *  └─ 👁️ View 3 (inactive)
 * 📊 Dataset 2
 *  └─ 👁️ Main View (active)
 */
export function LoadedDatasetsPanel() {
  const datasets = useDatasets();
  const [treeItems, setTreeItems] = useState([]);
  const [highlightedDatasetId, setHighlightedDatasetId] = useState(null);

  // Listen for dataset highlights from FilesPanel
  useEffect(() => {
    const handleHighlight = (event) => {
      setHighlightedDatasetId(event.detail.datasetId);

      // Clear highlight after 2 seconds
      setTimeout(() => {
        setHighlightedDatasetId(null);
      }, 2000);
    };

    window.addEventListener('cia:highlight-dataset', handleHighlight);
    return () => window.removeEventListener('cia:highlight-dataset', handleHighlight);
  }, []);

  // Build tree structure from datasets and views
  useEffect(() => {
    const items = datasets.map((dataset) => {
      // Get views for this dataset
      // TODO: Fetch views from ViewManager once integrated
      const views = getViewsForDataset(dataset.id);

      // Get instance count
      const instanceCount = instanceManager.getInstanceCountForDataset(dataset.id);

      return {
        id: dataset.id,
        name: dataset.name,
        type: 'dataset',
        active: highlightedDatasetId === dataset.id,
        tooltip: `${dataset.name} - ${dataset.metadata?.pointCount || 0} points`,
        badge: instanceCount > 0 ? `${instanceCount}` : null,
        metadata: {
          pointCount: dataset.metadata?.pointCount || 0,
          uploadedBy: dataset.metadata?.uploadedBy || 'Unknown',
        },
        actions: [
          {
            id: 'delete',
            icon: <Trash2 size={14} />,
            tooltip: 'Delete dataset',
            className: 'danger',
          },
        ],
        children: views,
      };
    });

    setTreeItems(items);
  }, [datasets, highlightedDatasetId]);

  const handleItemClick = (item) => {
    if (item.type === 'dataset') {
      // Request new instance for dataset
      window.dispatchEvent(
        new CustomEvent('cia:request-instance', {
          detail: { datasetId: item.id },
        })
      );
    } else if (item.type === 'view') {
      // Activate or focus view
      if (item.active) {
        // Focus existing view
        console.log('Focus view:', item.id);
        // TODO: Focus the instance associated with this view
      } else {
        // Activate inactive view
        console.log('Activate view:', item.id);
        // TODO: Call ViewManager.activateView()
      }
    }
  };

  const handleItemAction = (item, action) => {
    if (action === 'delete') {
      if (item.type === 'dataset') {
        // Delete dataset
        console.log('Delete dataset:', item.id);
        // TODO: Call DatasetManager.deleteDataset()
      } else if (item.type === 'view') {
        // Delete view
        console.log('Delete view:', item.id);
        // TODO: Call ViewManager.deleteView()
      }
    } else if (action === 'deactivate') {
      // Deactivate view
      console.log('Deactivate view:', item.id);
      // TODO: Call ViewManager.deactivateView()
    }
  };

  if (datasets.length === 0) {
    return (
      <div className="loaded-datasets-empty">
        <div className="loaded-datasets-empty-icon">📊</div>
        <p>No datasets loaded</p>
        <p className="loaded-datasets-empty-hint">
          Load a sample or upload a file to get started
        </p>
      </div>
    );
  }

  return (
    <div className="loaded-datasets-panel">
      <TreeView
        items={treeItems}
        onItemClick={handleItemClick}
        onItemAction={handleItemAction}
      />
    </div>
  );
}

/**
 * Get views for a dataset
 * TODO: Replace with ViewManager.getViewsForDataset() when integrated
 */
function getViewsForDataset(datasetId) {
  // Mock data for now
  // This will be replaced with actual ViewManager integration
  const mockViews = [
    // Example structure:
    // {
    //   id: 'view-1',
    //   name: 'Main View',
    //   type: 'view',
    //   active: true,
    //   metadata: {
    //     participants: 2,
    //   },
    //   actions: [...]
    // }
  ];

  return mockViews;
}
