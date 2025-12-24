#!/bin/bash

# Icon migration script for modals directory
# This script migrates all files from lucide-react to centralized Icon system

# Array of icon mappings (lucide -> centralized)
declare -A ICON_MAP=(
    ["X"]="close"
    ["Plus"]="add"
    ["Check"]="check"
    ["Trash2"]="delete"
    ["Eye"]="eye"
    ["EyeOff"]="eyeOff"
    ["Settings"]="settings"
    ["User"]="user"
    ["Users"]="users"
    ["UserPlus"]="userPlus"
    ["UserX"]="userX"
    ["Crown"]="crown"
    ["ChevronDown"]="chevronDown"
    ["ChevronUp"]="chevronUp"
    ["ChevronLeft"]="chevronLeft"
    ["ChevronRight"]="chevronRight"
    ["Loader2"]="loader"
    ["Search"]="search"
    ["Copy"]="copy"
    ["Edit"]="edit"
    ["Edit3"]="edit"
    ["Upload"]="upload"
    ["Download"]="download"
    ["Share"]="share"
    ["Share2"]="share"
    ["Folder"]="folder"
    ["File"]="file"
    ["FileText"]="file"
    ["FileType"]="file"
    ["Image"]="image"
    ["Video"]="video"
    ["Mic"]="mic"
    ["Camera"]="camera"
    ["Info"]="info"
    ["AlertTriangle"]="warning"
    ["AlertCircle"]="warning"
    ["HelpCircle"]="help"
    ["Link"]="link"
    ["ExternalLink"]="externalLink"
    ["Save"]="save"
    ["Keyboard"]="keyboard"
    ["Command"]="command"
    ["Calendar"]="calendar"
    ["Clock"]="clock"
    ["Star"]="star"
    ["Lock"]="lock"
    ["Unlock"]="unlock"
    ["Shield"]="shield"
    ["RefreshCw"]="refresh"
    ["RotateCcw"]="rotateCcw"
    ["Mail"]="mail"
    ["AtSign"]="atSign"
    ["Send"]="send"
    ["Globe"]="globe"
    ["Map"]="map"
    ["MapPin"]="mapPin"
    ["Merge"]="merge"
    ["Combine"]="merge"
    ["GitBranch"]="gitBranch"
    ["MessageSquare"]="messageSquare"
    ["Phone"]="phone"
    ["Navigation"]="navigation"
    ["Target"]="target"
    ["GripHorizontal"]="gripHorizontal"
    ["Database"]="database"
    ["HardDrive"]="hardDrive"
    ["Tag"]="tag"
    ["Monitor"]="monitor"
    ["Briefcase"]="briefcase"
    ["Layout"]="layout"
    ["LayoutGrid"]="layoutGrid"
    ["Archive"]="archive"
    ["Move"]="move"
    ["ArrowRight"]="arrowRight"
    ["FolderPlus"]="folderPlus"
    ["FlaskConical"]="flask"
    ["BarChart3"]="barChart"
    ["Building"]="building"
    ["Wrench"]="wrench"
    ["Glasses"]="glasses"
]

echo "Starting icon migration for modals directory..."

# Find all files with lucide-react imports
files=$(grep -r "from 'lucide-react'" src/ui/react/components/modals --include="*.js" --include="*.jsx" -l)

for file in $files; do
    echo "Processing: $file"

    # Create backup
    cp "$file" "$file.bak"

    # Replace import statement - handle both single and multi-line imports
    # Check if file has * as LucideIcons import
    if grep -q "import \* as LucideIcons from 'lucide-react'" "$file"; then
        # File has dynamic icon loading, use getIconComponent
        sed -i "s/import \* as LucideIcons from 'lucide-react';/import { Icon, getIconComponent } from '@UI\/react\/components\/common\/Icon';/g" "$file"
    fi

    # Replace regular imports (simple single-line imports)
    sed -i "s/import { \([^}]*\) } from 'lucide-react';/import { Icon } from '@UI\/react\/components\/common\/Icon';/g" "$file"

    # Replace multi-line imports - start
    sed -i "/^import {$/,/^} from 'lucide-react';$/{
        /^import {$/c\\
import { Icon } from '@UI\/react\/components\/common\/Icon';
        /^[^}]*$/d
        /^} from 'lucide-react';$/d
    }" "$file"

    echo "  - Updated imports"
done

echo "Icon migration complete!"
echo "Backup files created with .bak extension"
echo ""
echo "Note: You may need to manually:"
echo "1. Replace icon component usages with <Icon name=\"...\" />"
echo "2. Replace icon props from components to strings"
echo "3. Use getIconComponent() for props that expect components"
