// src/ui/react/components/layout/LeftSidebarPanel.jsx
// VS Code-style left sidebar with collapsible sections

import React from 'react';
import { ResizablePanel } from '@UI/react/components/common/ResizablePanel.jsx';
import { CollapsibleSection } from '@UI/react/components/common/CollapsibleSection.jsx';
import { FilesPanel } from '@UI/react/components/panels/FilesPanel';
import { LoadedDatasetsPanel } from '@UI/react/components/panels/LoadedDatasetsPanel';
import './LeftSidebarPanel.css';

/**
 * LeftSidebarPanel - Main left sidebar with multiple collapsible sections
 *
 * Sections (VS Code Explorer-style):
 * 1. FILES - Upload files and load samples
 * 2. LOADED DATASETS/VIEWS - Tree view of datasets and their views
 * 3. SAVED VIEWS - Bookmarked views (future)
 * 4. ANNOTATIONS - Global annotations (future)
 * 5. SAVED FILTERS - Reusable filters/widgets (future)
 *
 * Features:
 * - Resizable (drag right edge)
 * - Each section independently collapsible
 * - Section states persist to localStorage
 * - Size persists to localStorage
 */
export function LeftSidebarPanel() {
  return (
    <ResizablePanel
      direction="vertical"
      defaultSize={300}
      minSize={200}
      maxSize={600}
      storageKey="leftSidebarWidth"
      position="end"
      className="left-sidebar-panel"
    >
      <div className="left-sidebar-content">
        {/* FILES Section */}
        <CollapsibleSection
          title="Files"
          defaultExpanded={true}
          storageKey="leftSidebar:filesExpanded"
        >
          <FilesPanel />
        </CollapsibleSection>

        {/* LOADED DATASETS/VIEWS Section */}
        <CollapsibleSection
          title="Loaded Datasets/Views"
          defaultExpanded={true}
          storageKey="leftSidebar:datasetsExpanded"
        >
          <LoadedDatasetsPanel />
        </CollapsibleSection>

        {/* Future sections will go here */}
        {/*
        <CollapsibleSection
          title="Saved Views"
          defaultExpanded={false}
          storageKey="leftSidebar:savedViewsExpanded"
        >
          <SavedViewsPanel />
        </CollapsibleSection>

        <CollapsibleSection
          title="Annotations"
          defaultExpanded={false}
          storageKey="leftSidebar:annotationsExpanded"
        >
          <AnnotationsPanel />
        </CollapsibleSection>

        <CollapsibleSection
          title="Saved Filters"
          defaultExpanded={false}
          storageKey="leftSidebar:filtersExpanded"
        >
          <SavedFiltersPanel />
        </CollapsibleSection>
        */}
      </div>
    </ResizablePanel>
  );
}
