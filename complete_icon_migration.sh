#!/bin/bash

# Complete icon migration script for modals directory
# Migrates remaining files from lucide-react to centralized Icon system

echo "=== Icon Migration Script ==="
echo "Starting migration of remaining modals files..."
echo ""

# Function to migrate a file
migrate_file() {
    local file="$1"
    echo "Migrating: $file"

    # Create backup
    cp "$file" "$file.bak"

    # Step 1: Replace import statements
    # Handle dynamic imports with * as LucideIcons
    if grep -q "import \* as LucideIcons from 'lucide-react'" "$file"; then
        sed -i "s/import \* as LucideIcons from 'lucide-react';/import { Icon, getIconComponent } from '@UI\/react\/components\/common\/Icon';/g" "$file"
    fi

    # Handle regular multi-line imports
    perl -i -p0e "s/import \{[^}]+\} from 'lucide-react';/import { Icon, getIconComponent } from '@UI\/react\/components\/common\/Icon';/gs" "$file"

    # Handle single-line imports (fallback)
    sed -i "s/import {[^}]*} from 'lucide-react';/import { Icon, getIconComponent } from '@UI\/react\/components\/common\/Icon';/g" "$file"

    echo "  ✓ Updated imports"
}

# Get all files that still need migration
files=$(grep -r "from 'lucide-react'" src/ui/react/components/modals --include="*.jsx" --include="*.js" -l 2>/dev/null)

if [ -z "$files" ]; then
    echo "No files found with lucide-react imports!"
    exit 0
fi

# Migrate each file
for file in $files; do
    migrate_file "$file"
done

echo ""
echo "=== Migration Summary ==="
echo "Import statements have been updated."
echo "Backup files created with .bak extension"
echo ""
echo "Next steps (manual):"
echo "1. Replace icon component usages: <IconName size={16} /> → <Icon name=\"iconName\" size={16} />"
echo "2. Replace icon props: icon={IconName} → icon={getIconComponent('iconName')}"
echo "3. Review and test each migrated file"
echo ""
echo "Done!"
