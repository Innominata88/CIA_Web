/**
 * @file SettingsTab.jsx
 * @description Settings tab for the right panel.
 * Displays user preferences, project info, admin settings, and danger zone.
 *
 * @example
 * <SettingsTab workspaceId="ws-1" projectId="project-1" />
 */

import React from 'react';
import {
    CollapsibleHeaderSection,
    SectionHeader,
    Icon,
} from '@UI/react/components/adaptive';
import { useSettingsTab } from './hooks/useSettingsTab';
import { YourPreferences } from './sections/YourPreferences';
import { ProjectInfo } from './sections/ProjectInfo';
import { AdminSettings } from './sections/AdminSettings';
import { DangerZone } from './sections/DangerZone';
import './SettingsTab.scss';

/**
 * @typedef {Object} SettingsTabProps
 * @property {string} [workspaceId] - Current workspace ID
 * @property {string} [projectId] - Current project ID
 */

/**
 * Settings tab panel content component.
 * Headless wrapper for SettingsTab that manages its own state.
 *
 * @param {SettingsTabProps} props - Component props
 * @returns {React.ReactElement} The rendered panel content
 */
export function SettingsPanelContent({ workspaceId, projectId }) {
    const settingsState = useSettingsTab(projectId);
    return <SettingsTab {...settingsState} workspaceId={workspaceId} />;
}

/**
 * @typedef {Object} SettingsTabInternalProps
 * @property {string} [workspaceId] - Current workspace ID
 * @property {Object} project - Project data
 * @property {string} userRole - Current user's role
 * @property {Object} roleConfig - Role configuration
 * @property {boolean} isAdmin - Whether user is admin or owner
 * @property {boolean} isOwner - Whether user is owner
 * @property {Object} preferences - User preferences
 * @property {Function} updatePreferences - Preference update handler
 * @property {boolean} loading - Loading state
 */

/**
 * Settings tab component.
 * Displays settings sections based on user role.
 *
 * @param {SettingsTabInternalProps} props - Component props
 * @returns {React.ReactElement} The rendered tab
 */
export function SettingsTab({
    workspaceId,
    project,
    userRole,
    roleConfig,
    isAdmin,
    isOwner,
    preferences,
    updatePreferences,
    loading,
}) {
    if (loading) {
        return (
            <div className="settings-tab settings-tab--loading">
                <Icon name="loader" size={24} className="spin" />
            </div>
        );
    }

    return (
        <div className="settings-tab">
            {/* Your Preferences Section */}
            <div className="settings-tab__section-wrapper">
                <CollapsibleHeaderSection
                    icon="user"
                    title="Your Preferences"
                    color="blue"
                    defaultExpanded={true}
                >
                    <YourPreferences
                        preferences={preferences}
                        onUpdate={updatePreferences}
                    />
                </CollapsibleHeaderSection>
            </div>

            {/* Project Info Section */}
            <div className="settings-tab__section-wrapper">
                <CollapsibleHeaderSection
                    icon="building"
                    title="Project Info"
                    color="purple"
                    defaultExpanded={true}
                >
                    <ProjectInfo project={project} />
                </CollapsibleHeaderSection>
            </div>

            {/* Admin Settings Section */}
            {isAdmin && (
                <div className="settings-tab__section-wrapper">
                    <CollapsibleHeaderSection
                        icon="settings"
                        title="Admin Settings"
                        color="amber"
                        defaultExpanded={true}
                    >
                        <AdminSettings
                            project={project}
                            roleConfig={roleConfig}
                        />
                    </CollapsibleHeaderSection>
                </div>
            )}

            {/* Danger Zone Section */}
            {isOwner && (
                <div className="settings-tab__section-wrapper">
                    <CollapsibleHeaderSection
                        icon="alertTriangle"
                        title="Danger Zone"
                        color="red"
                        defaultExpanded={false}
                    >
                        <DangerZone project={project} />
                    </CollapsibleHeaderSection>
                </div>
            )}
        </div>
    );
}

export default SettingsTab;