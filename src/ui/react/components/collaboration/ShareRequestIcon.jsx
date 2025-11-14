// src/ui/react/components/collaboration/ShareRequestIcon.jsx
/**
 * Share Request Icon for Status Bar
 *
 * Shows pending share requests with a clickable badge.
 * Displays a modal with pending requests when clicked.
 */

import React, { useState, useEffect } from "react";
import { Users, X } from "lucide-react";
import { shareRequestManager } from "@Collaboration/sharing/ShareRequestManager.js";

export function ShareRequestIcon({ onAcceptRequests }) {
    const [pendingCount, setPendingCount] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [requests, setRequests] = useState([]);

    // Subscribe to share request manager
    useEffect(() => {
        const unsubscribe = shareRequestManager.subscribe((data) => {
            setPendingCount(data.count);
            setRequests(data.requests);
        });

        return unsubscribe;
    }, []);

    const handleAcceptAll = () => {
        // Dispatch event for WorkspaceGrid to handle
        window.dispatchEvent(new CustomEvent('cia:accept-share-requests', {
            detail: { requests }
        }));
        setShowModal(false);
    };

    const handleDismiss = (instanceId) => {
        shareRequestManager.removeRequest(instanceId);
    };

    if (pendingCount === 0) {
        return null; // Don't show if no pending requests
    }

    return (
        <>
            {/* Status Bar Badge */}
            <span
                className="status-item"
                onClick={() => setShowModal(true)}
                style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    background: pendingCount > 0 ? "rgba(76, 175, 80, 0.1)" : "transparent",
                    border: pendingCount > 0 ? "1px solid rgba(76, 175, 80, 0.3)" : "none",
                    transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(76, 175, 80, 0.2)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = pendingCount > 0 ? "rgba(76, 175, 80, 0.1)" : "transparent";
                }}
            >
                <Users size={14} color="#4CAF50" />
                <span style={{ fontSize: "12px", fontWeight: "500" }}>
                    {pendingCount}
                </span>
                <span
                    style={{
                        fontSize: "10px",
                        padding: "2px 6px",
                        borderRadius: "10px",
                        background: "#4CAF50",
                        color: "#000",
                        fontWeight: "bold",
                        animation: "pulse 2s infinite",
                    }}
                >
                    NEW
                </span>
            </span>

            {/* Modal */}
            {showModal && (
                <div
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: "rgba(0, 0, 0, 0.7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 10000,
                    }}
                    onClick={() => setShowModal(false)}
                >
                    <div
                        style={{
                            background: "linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)",
                            border: "2px solid #4CAF50",
                            borderRadius: "12px",
                            padding: "24px",
                            minWidth: "400px",
                            maxWidth: "600px",
                            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.8)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "20px",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <Users size={24} color="#4CAF50" />
                                <h2 style={{ margin: 0, fontSize: "20px", color: "#fff" }}>
                                    Shared Views ({pendingCount})
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#999",
                                    cursor: "pointer",
                                    padding: "4px",
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Requests List */}
                        <div style={{ marginBottom: "20px" }}>
                            {requests.map((request) => (
                                <div
                                    key={request.instanceId}
                                    style={{
                                        background: "#2a2a2a",
                                        border: "1px solid #3a3a3a",
                                        borderRadius: "8px",
                                        padding: "12px",
                                        marginBottom: "8px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <div>
                                        <div style={{ color: "#fff", fontWeight: "500", marginBottom: "4px" }}>
                                            {request.userName}
                                        </div>
                                        <div style={{ color: "#999", fontSize: "12px" }}>
                                            Viewing {request.datasetId ? "a dataset" : "an empty viewport"}
                                        </div>
                                        <div style={{ color: "#666", fontSize: "11px", marginTop: "4px" }}>
                                            {new Date(request.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDismiss(request.instanceId)}
                                        style={{
                                            background: "#3a3a3a",
                                            border: "1px solid #555",
                                            borderRadius: "6px",
                                            color: "#ccc",
                                            cursor: "pointer",
                                            padding: "6px 12px",
                                            fontSize: "12px",
                                        }}
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{
                                    padding: "10px 20px",
                                    background: "#3a3a3a",
                                    border: "1px solid #555",
                                    borderRadius: "6px",
                                    color: "#fff",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                }}
                            >
                                Later
                            </button>
                            <button
                                onClick={handleAcceptAll}
                                style={{
                                    padding: "10px 20px",
                                    background: "#4CAF50",
                                    border: "none",
                                    borderRadius: "6px",
                                    color: "#000",
                                    cursor: "pointer",
                                    fontWeight: "bold",
                                    fontSize: "14px",
                                }}
                            >
                                Accept All ({pendingCount})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.6;
                    }
                }
            `}</style>
        </>
    );
}
