// src/ui/react/components/panels/LayoutPanel/components/CanvasNavigator/CanvasNavigator.jsx
// Redesigned Canvas Navigator with D-pad navigation and collapsible size controls
//
// Features:
// - D-pad with home center button
// - Two-column navigation layout (swappable via dpadPosition prop)
// - Collapsible size controls footer
// - Set Home mode with explicit button (no long-press)
// - Mode-aware sizing (desktop/VR via ModeContext)

import React, { memo, useState, useMemo, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { Icon, useMode } from '@UI/react/components/adaptive';
import { useLayoutPanelContext, DOCK_POSITIONS } from "../../LayoutPanelContext";
import "./CanvasNavigator.scss";

// =============================================================================
// CONSTANTS
// =============================================================================

const DISPLAY_MODES = {
    NAMES: 'names',
    NUMBERS: 'numbers',
    COLORS: 'colors',
};

const CONTEXT_MODES = {
    LAYOUT: 'layout',
    VIEWS: 'views',
};

// Vibrant instance colors for cells
const INSTANCE_COLORS = [
    '#60a5fa', // blue
    '#4ade80', // green
    '#f472b6', // pink
    '#fbbf24', // amber
    '#2dd4bf', // teal
    '#a78bfa', // purple
    '#f87171', // red
    '#38bdf8', // sky
];

export { DISPLAY_MODES, CONTEXT_MODES, INSTANCE_COLORS };

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

const NavBtn = memo(({
    children,
    onClick,
    active,
    color,
    disabled,
    title,
    className = '',
    size = 'md',
}) => {
    const { isVR } = useMode();

    return (
        <button
            className={`canvas-navigator__btn canvas-navigator__btn--${size} ${active ? 'canvas-navigator__btn--active' : ''} ${className}`}
            onClick={onClick}
            disabled={disabled}
            title={title}
            data-color={color}
            data-vr={isVR}
        >
            {children}
        </button>
    );
});

// Number spinner with increment/decrement buttons
const NumberSpinner = memo(({
    value,
    onChange,
    min = 1,
    max = 10,
    label,
    color,
    vertical = false,
}) => {
    const { isVR } = useMode();
    const safeValue = typeof value === 'number' && !isNaN(value) ? value : min;

    const decrement = useCallback(() => {
        const newVal = Math.max(min, safeValue - 1);
        onChange(newVal);
    }, [onChange, min, safeValue]);

    const increment = useCallback(() => {
        const newVal = Math.min(max, safeValue + 1);
        onChange(newVal);
    }, [onChange, max, safeValue]);

    if (vertical) {
        return (
            <div className="canvas-navigator__spinner canvas-navigator__spinner--vertical" data-color={color}>
                {label && <span className="canvas-navigator__spinner-label">{label}</span>}
                <div className="canvas-navigator__spinner-controls">
                    <NavBtn size="xs" onClick={decrement} disabled={safeValue <= min} color={color}>
                        <Icon name="chevronLeft" size={isVR ? 12 : 8} />
                    </NavBtn>
                    <span className="canvas-navigator__spinner-value" data-color={color}>
                        {safeValue}
                    </span>
                    <NavBtn size="xs" onClick={increment} disabled={safeValue >= max} color={color}>
                        <Icon name="chevronRight" size={isVR ? 12 : 8} />
                    </NavBtn>
                </div>
            </div>
        );
    }

    return (
        <div className="canvas-navigator__spinner" data-color={color}>
            {label && <span className="canvas-navigator__spinner-label">{label}</span>}
            <NavBtn size="xs" onClick={decrement} disabled={safeValue <= min} color={color}>
                <Icon name="minus" size={isVR ? 12 : 8} />
            </NavBtn>
            <span className="canvas-navigator__spinner-value" data-color={color}>
                {safeValue}
            </span>
            <NavBtn size="xs" onClick={increment} disabled={safeValue >= max} color={color}>
                <Icon name="plus" size={isVR ? 12 : 8} />
            </NavBtn>
        </div>
    );
});

// D-Pad component with home center
const DPad = memo(({ onMove, onHome, disabled, isAtHome }) => {
    const { isVR } = useMode();
    const iconSize = isVR ? 14 : 10;

    return (
        <div className="canvas-navigator__dpad">
            <NavBtn
                size="sm"
                onClick={() => onMove('up')}
                disabled={disabled?.up}
                title="Move Up"
            >
                <Icon name="chevronUp" size={iconSize} />
            </NavBtn>
            <div className="canvas-navigator__dpad-row">
                <NavBtn
                    size="sm"
                    onClick={() => onMove('left')}
                    disabled={disabled?.left}
                    title="Move Left"
                >
                    <Icon name="chevronLeft" size={iconSize} />
                </NavBtn>
                <button
                    className={`canvas-navigator__dpad-home ${isAtHome ? 'canvas-navigator__dpad-home--at-home' : ''}`}
                    onClick={onHome}
                    title="Go to home position"
                    data-vr={isVR}
                >
                    <Icon name="home" size={isVR ? 14 : 10} />
                </button>
                <NavBtn
                    size="sm"
                    onClick={() => onMove('right')}
                    disabled={disabled?.right}
                    title="Move Right"
                >
                    <Icon name="chevronRight" size={iconSize} />
                </NavBtn>
            </div>
            <NavBtn
                size="sm"
                onClick={() => onMove('down')}
                disabled={disabled?.down}
                title="Move Down"
            >
                <Icon name="chevronDown" size={iconSize} />
            </NavBtn>
        </div>
    );
});

// Collapsible Size Controls Footer
const SizeControlsFooter = memo(({
    viewportSize,
    setViewportSizeCols,
    setViewportSizeRows,
    canvasSize,
    setCanvasCols,
    setCanvasRows,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { isVR } = useMode();

    return (
        <div className="canvas-navigator__size-footer">
            <button
                className="canvas-navigator__size-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={isVR ? 12 : 10} />
                <span>Size Controls</span>
                {!isExpanded && (
                    <span className="canvas-navigator__size-summary">
                        ({viewportSize.cols}×{viewportSize.rows} / {canvasSize.cols}×{canvasSize.rows})
                    </span>
                )}
            </button>

            {isExpanded && (
                <div className="canvas-navigator__size-controls">
                    <div className="canvas-navigator__size-col canvas-navigator__size-col--viewport">
                        <span className="canvas-navigator__size-label">Viewport</span>
                        <NumberSpinner
                            label="Cols"
                            value={viewportSize.cols}
                            onChange={setViewportSizeCols}
                            min={1}
                            max={canvasSize.cols}
                            color="green"
                            vertical
                        />
                        <NumberSpinner
                            label="Rows"
                            value={viewportSize.rows}
                            onChange={setViewportSizeRows}
                            min={1}
                            max={canvasSize.rows}
                            color="green"
                            vertical
                        />
                    </div>

                    <div className="canvas-navigator__size-col canvas-navigator__size-col--canvas">
                        <span className="canvas-navigator__size-label">Canvas</span>
                        <NumberSpinner
                            label="Cols"
                            value={canvasSize.cols}
                            onChange={setCanvasCols}
                            min={1}
                            max={50}
                            color="purple"
                            vertical
                        />
                        <NumberSpinner
                            label="Rows"
                            value={canvasSize.rows}
                            onChange={setCanvasRows}
                            min={1}
                            max={50}
                            color="purple"
                            vertical
                        />
                    </div>
                </div>
            )}
        </div>
    );
});

// Smart Tooltip Component
const SmartTooltip = memo(({ cell, position, visible }) => {
    if (!visible || !cell) return null;

    let color = '#60a5fa';
    if (typeof cell.color === 'number') {
        color = INSTANCE_COLORS[cell.color % INSTANCE_COLORS.length];
    } else if (typeof cell.color === 'string' && cell.color.startsWith('#')) {
        color = cell.color;
    }

    return ReactDOM.createPortal(
        <div
            className="canvas-navigator__tooltip"
            style={{
                left: position.x + 12,
                top: position.y - 8,
                borderColor: color,
            }}
        >
            <div className="canvas-navigator__tooltip-name">
                {cell.name || `View ${cell.id || '?'}`}
            </div>
            {cell.datasetName && (
                <div className="canvas-navigator__tooltip-dataset">
                    Dataset: {cell.datasetName}
                </div>
            )}
            <div className="canvas-navigator__tooltip-position" style={{ color }}>
                ({cell.col}, {cell.row})
                {((cell.colSpan || 1) > 1 || (cell.rowSpan || 1) > 1) && (
                    <span className="canvas-navigator__tooltip-span">
                        {' '}• {cell.colSpan || 1}×{cell.rowSpan || 1}
                    </span>
                )}
            </div>
        </div>,
        document.body
    );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const CanvasNavigator = memo(function CanvasNavigator({
    isDockedInPanel = false,
    dpadPosition = 'left',
    className = "",
}) {
    const { mode, isVR } = useMode();

    // Get everything from context
    const context = useLayoutPanelContext();
    const logic = context?.logic || {};

    // Extract data with safe defaults
    const canvasSize = {
        rows: logic.canvasSize?.rows ?? 4,
        cols: logic.canvasSize?.cols ?? 5,
    };
    const viewport = {
        row: logic.viewport?.row ?? 0,
        col: logic.viewport?.col ?? 0,
    };
    const viewportSize = {
        rows: logic.viewportSize?.rows ?? 2,
        cols: logic.viewportSize?.cols ?? 3,
    };
    const cells = logic.cells || [];
    const homepoint = logic.homepoint || { row: 0, col: 0 };

    // Extract functions with no-op defaults
    const moveViewport = logic.moveViewport || (() => {});
    const navigateToCell = logic.navigateToCell || (() => {});
    const setViewportSizeRows = logic.setViewportSizeRows || (() => {});
    const setViewportSizeCols = logic.setViewportSizeCols || (() => {});
    const setCanvasRows = logic.setCanvasRows || (() => {});
    const setCanvasCols = logic.setCanvasCols || (() => {});
    const setHomepoint = logic.setHomepoint || (() => {});

    // Dock position
    const dockPosition = context?.dockPosition || DOCK_POSITIONS.FLOAT;
    const setDockPosition = context?.setDockPosition || (() => {});

    // Local UI state
    const [contextMode, setContextMode] = useState(CONTEXT_MODES.LAYOUT);
    const [displayMode, setDisplayMode] = useState(DISPLAY_MODES.NAMES);
    const [minimapZoom, setMinimapZoom] = useState(1);
    const [settingHome, setSettingHome] = useState(false);
    const [hoveredCell, setHoveredCell] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Cell dimensions based on zoom and mode
    const CELL_W = (isVR ? 44 : 28) * minimapZoom;
    const CELL_H = (isVR ? 36 : 22) * minimapZoom;
    const GAP = 2;

    // Computed values
    const isAtHome = homepoint &&
        viewport.row === homepoint.row &&
        viewport.col === homepoint.col;

    const maxRow = Math.max(0, canvasSize.rows - viewportSize.rows);
    const maxCol = Math.max(0, canvasSize.cols - viewportSize.cols);

    const navDisabled = {
        up: viewport.row <= 0,
        down: viewport.row >= maxRow,
        left: viewport.col <= 0,
        right: viewport.col >= maxCol,
    };

    // Helpers
    const getCellAt = useCallback((row, col) => {
        return cells.find(c =>
            row >= c.row && row < c.row + (c.rowSpan || 1) &&
            col >= c.col && col < c.col + (c.colSpan || 1)
        );
    }, [cells]);

    const isInViewport = useCallback((row, col) => {
        return row >= viewport.row &&
            row < viewport.row + viewportSize.rows &&
            col >= viewport.col &&
            col < viewport.col + viewportSize.cols;
    }, [viewport, viewportSize]);

    const getCellColor = useCallback((cell) => {
        if (!cell) return null;
        if (typeof cell.color === 'number') {
            return INSTANCE_COLORS[cell.color % INSTANCE_COLORS.length];
        } else if (typeof cell.color === 'string') {
            if (cell.color.startsWith('#')) return cell.color;
            const idx = INSTANCE_COLORS.indexOf(cell.color);
            return idx >= 0 ? cell.color : INSTANCE_COLORS[0];
        }
        const cellIdx = cells.indexOf(cell);
        return INSTANCE_COLORS[(cellIdx >= 0 ? cellIdx : 0) % INSTANCE_COLORS.length];
    }, [cells]);

    const getCellDisplay = useCallback((cell, index) => {
        if (!cell) return null;
        const name = cell.name || `View ${index + 1}`;
        switch (displayMode) {
            case DISPLAY_MODES.NUMBERS:
                return index + 1;
            case DISPLAY_MODES.NAMES:
                const maxLen = Math.floor((CELL_W * (cell.colSpan || 1)) / 7);
                return name.length <= maxLen ? name : name.substring(0, Math.max(2, maxLen - 1)) + '…';
            case DISPLAY_MODES.COLORS:
                return null;
            default:
                return null;
        }
    }, [displayMode, CELL_W]);

    // Handlers
    const handleMoveViewport = useCallback((direction) => {
        switch (direction) {
            case 'up':
                if (viewport.row > 0) moveViewport(-1, 0);
                break;
            case 'down':
                if (viewport.row < maxRow) moveViewport(1, 0);
                break;
            case 'left':
                if (viewport.col > 0) moveViewport(0, -1);
                break;
            case 'right':
                if (viewport.col < maxCol) moveViewport(0, 1);
                break;
        }
    }, [viewport, maxRow, maxCol, moveViewport]);

    const handleGoHome = useCallback(() => {
        if (homepoint) {
            navigateToCell(homepoint.row, homepoint.col);
        }
    }, [homepoint, navigateToCell]);

    const handleCellClick = useCallback((row, col, cell) => {
        if (settingHome) {
            setHomepoint(row, col);
            setSettingHome(false);
            return;
        }
        // Navigate viewport to position
        navigateToCell(Math.min(maxRow, row), Math.min(maxCol, col));
    }, [settingHome, maxRow, maxCol, navigateToCell, setHomepoint]);

    const handlePopOut = useCallback(() => {
        setDockPosition(DOCK_POSITIONS.FLOAT);
    }, [setDockPosition]);

    const handleMinimize = useCallback(() => {
        setDockPosition(DOCK_POSITIONS.MINIMIZED);
    }, [setDockPosition]);

    // Generate minimap cells
    const minimapCells = useMemo(() => {
        const result = [];
        let viewIndex = 0;

        for (let row = 0; row < canvasSize.rows; row++) {
            for (let col = 0; col < canvasSize.cols; col++) {
                const cell = getCellAt(row, col);
                const inVP = isInViewport(row, col);
                const isHome = homepoint && row === homepoint.row && col === homepoint.col;

                // Skip non-origin cells of spanning placements
                if (cell && (cell.row !== row || cell.col !== col)) continue;

                const cellIndex = cell ? viewIndex++ : -1;

                result.push({
                    row,
                    col,
                    cell,
                    inVP,
                    isHome,
                    cellIndex,
                    key: `${row}-${col}`,
                });
            }
        }

        return result;
    }, [canvasSize, getCellAt, isInViewport, homepoint]);

    // ==========================================================================
    // RENDER
    // ==========================================================================

    const iconSize = isVR ? 14 : 12;

    return (
        <div
            className={`canvas-navigator canvas-navigator--${mode} ${className}`}
            data-docked={isDockedInPanel}
        >
            {/* Header */}
            <div className="canvas-navigator__header">
                <div className="canvas-navigator__tab-title">
                    <Icon name="map" size={iconSize} />
                    <span>Navigator</span>
                </div>
                <div className="canvas-navigator__header-actions">
                    {!isDockedInPanel && (
                        <>
                            <NavBtn size="xs" onClick={handleMinimize} title="Minimize">
                                <Icon name="minus" size={isVR ? 10 : 8} />
                            </NavBtn>
                            <NavBtn size="xs" onClick={handlePopOut} title="Pop out">
                                <Icon name="externalLink" size={isVR ? 10 : 8} />
                            </NavBtn>
                        </>
                    )}
                    <NavBtn size="xs" onClick={handleMinimize} title="Close">
                        <Icon name="x" size={isVR ? 10 : 8} />
                    </NavBtn>
                </div>
            </div>

            {/* Mode Toggles */}
            <div className="canvas-navigator__mode-toggles">
                <div className="canvas-navigator__segmented-control">
                    <button
                        className={`canvas-navigator__segment ${contextMode === CONTEXT_MODES.LAYOUT ? 'canvas-navigator__segment--active' : ''}`}
                        onClick={() => setContextMode(CONTEXT_MODES.LAYOUT)}
                        data-color="blue"
                    >
                        Layout
                    </button>
                    <button
                        className={`canvas-navigator__segment ${contextMode === CONTEXT_MODES.VIEWS ? 'canvas-navigator__segment--active' : ''}`}
                        onClick={() => setContextMode(CONTEXT_MODES.VIEWS)}
                        data-color="purple"
                    >
                        Views
                    </button>
                </div>
                <div className="canvas-navigator__segmented-control">
                    <button
                        className={`canvas-navigator__segment ${displayMode === DISPLAY_MODES.NAMES ? 'canvas-navigator__segment--active' : ''}`}
                        onClick={() => setDisplayMode(DISPLAY_MODES.NAMES)}
                        title="Show Names"
                    >
                        A
                    </button>
                    <button
                        className={`canvas-navigator__segment ${displayMode === DISPLAY_MODES.NUMBERS ? 'canvas-navigator__segment--active' : ''}`}
                        onClick={() => setDisplayMode(DISPLAY_MODES.NUMBERS)}
                        title="Show Numbers"
                    >
                        #
                    </button>
                    <button
                        className={`canvas-navigator__segment ${displayMode === DISPLAY_MODES.COLORS ? 'canvas-navigator__segment--active' : ''}`}
                        onClick={() => setDisplayMode(DISPLAY_MODES.COLORS)}
                        title="Colors Only"
                    >
                        ●
                    </button>
                </div>
            </div>

            {/* Minimap */}
            <div
                className={`canvas-navigator__minimap ${settingHome ? 'canvas-navigator__minimap--setting-home' : ''}`}
            >
                {settingHome && (
                    <div className="canvas-navigator__setting-home-hint">
                        Click cell to set home
                    </div>
                )}

                <div
                    className="canvas-navigator__grid"
                    style={{
                        gridTemplateColumns: `repeat(${canvasSize.cols}, ${CELL_W}px)`,
                        gridTemplateRows: `repeat(${canvasSize.rows}, ${CELL_H}px)`,
                        gap: GAP,
                    }}
                >
                    {minimapCells.map(({ row, col, cell, inVP, isHome, cellIndex, key }) => {
                        const color = getCellColor(cell);

                        return (
                            <div
                                key={key}
                                className={`canvas-navigator__cell ${cell ? 'canvas-navigator__cell--occupied' : ''} ${inVP ? 'canvas-navigator__cell--in-viewport' : ''} ${isHome ? 'canvas-navigator__cell--home' : ''}`}
                                style={{
                                    gridColumn: cell ? `span ${cell.colSpan || 1}` : 'span 1',
                                    gridRow: cell ? `span ${cell.rowSpan || 1}` : 'span 1',
                                    '--cell-color': color,
                                }}
                                onClick={() => handleCellClick(row, col, cell)}
                                onMouseEnter={(e) => {
                                    if (cell) {
                                        setHoveredCell(cell);
                                        setTooltipPos({ x: e.clientX, y: e.clientY });
                                    }
                                }}
                                onMouseMove={(e) => {
                                    if (hoveredCell) {
                                        setTooltipPos({ x: e.clientX, y: e.clientY });
                                    }
                                }}
                                onMouseLeave={() => setHoveredCell(null)}
                            >
                                {isHome && !cell && (
                                    <Icon name="home" size={Math.max(10, 12 * minimapZoom)} className="canvas-navigator__cell-home-icon" />
                                )}
                                {cell && (
                                    <span className="canvas-navigator__cell-text">
                                        {getCellDisplay(cell, cellIndex)}
                                    </span>
                                )}
                                {isHome && cell && (
                                    <div className="canvas-navigator__cell-home-dot" />
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Viewport Rectangle */}
                <div
                    className="canvas-navigator__viewport-indicator"
                    style={{
                        top: 8 + viewport.row * (CELL_H + GAP),
                        left: 8 + viewport.col * (CELL_W + GAP),
                        width: viewportSize.cols * (CELL_W + GAP) - GAP,
                        height: viewportSize.rows * (CELL_H + GAP) - GAP,
                    }}
                />
            </div>

            {/* Navigation Block */}
            <div className="canvas-navigator__nav-block">
                <div
                    className="canvas-navigator__nav-columns"
                    style={{ flexDirection: dpadPosition === 'right' ? 'row-reverse' : 'row' }}
                >
                    {/* D-Pad Column */}
                    <div className="canvas-navigator__nav-col canvas-navigator__nav-col--dpad">
                        <DPad
                            onMove={handleMoveViewport}
                            onHome={handleGoHome}
                            isAtHome={isAtHome}
                            disabled={navDisabled}
                        />
                    </div>

                    {/* Info Column */}
                    <div className="canvas-navigator__nav-col canvas-navigator__nav-col--info">
                        {/* Position */}
                        <div className="canvas-navigator__info-row">
                            <Icon name="navigation" size={isVR ? 14 : 12} className="canvas-navigator__info-icon canvas-navigator__info-icon--teal" />
                            <span className="canvas-navigator__position-value">
                                ({viewport.col}, {viewport.row})
                            </span>
                        </div>

                        {/* Home */}
                        <div className="canvas-navigator__info-row">
                            <Icon name="home" size={isVR ? 14 : 12} className="canvas-navigator__info-icon canvas-navigator__info-icon--amber" />
                            <span className={`canvas-navigator__home-value ${isAtHome ? 'canvas-navigator__home-value--at-home' : ''}`}>
                                ({homepoint?.col ?? 0}, {homepoint?.row ?? 0})
                            </span>
                        </div>

                        {/* Set Home Button */}
                        <button
                            className={`canvas-navigator__set-home-btn ${settingHome ? 'canvas-navigator__set-home-btn--active' : ''}`}
                            onClick={() => setSettingHome(!settingHome)}
                        >
                            <Icon name={settingHome ? 'x' : 'mapPin'} size={isVR ? 12 : 10} />
                            {settingHome ? 'Cancel' : 'Set Home'}
                        </button>
                    </div>
                </div>

                {/* Zoom Row */}
                <div className="canvas-navigator__zoom-row">
                    <span className="canvas-navigator__zoom-label">Minimap</span>
                    <NavBtn
                        size="xs"
                        onClick={() => setMinimapZoom(Math.max(0.5, minimapZoom - 0.25))}
                        disabled={minimapZoom <= 0.5}
                    >
                        <Icon name="zoomOut" size={isVR ? 12 : 10} />
                    </NavBtn>
                    <span className="canvas-navigator__zoom-value">
                        {Math.round(minimapZoom * 100)}%
                    </span>
                    <NavBtn
                        size="xs"
                        onClick={() => setMinimapZoom(Math.min(2, minimapZoom + 0.25))}
                        disabled={minimapZoom >= 2}
                    >
                        <Icon name="zoomIn" size={isVR ? 12 : 10} />
                    </NavBtn>
                </div>
            </div>

            {/* Size Controls Footer */}
            <SizeControlsFooter
                viewportSize={viewportSize}
                setViewportSizeCols={setViewportSizeCols}
                setViewportSizeRows={setViewportSizeRows}
                canvasSize={canvasSize}
                setCanvasCols={setCanvasCols}
                setCanvasRows={setCanvasRows}
            />

            {/* Tooltip */}
            <SmartTooltip cell={hoveredCell} position={tooltipPos} visible={!!hoveredCell} />
        </div>
    );
});

export default CanvasNavigator;
