"use client";

import { useState } from "react";
import { REACTION_EMOJIS } from "@/services/git/types";

interface ReactionBarProps {
    targetId: string;
    targetType: "issue" | "comment" | "pr";
    reactions: { emoji: string; userAddress: string }[];
    currentUser?: string;
    onReact: (emoji: string) => Promise<void>;
    compact?: boolean;
}

export default function ReactionBar({ 
    targetId, 
    targetType, 
    reactions, 
    currentUser,
    onReact,
    compact = false 
}: ReactionBarProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [loading, setLoading] = useState(false);

    // Group reactions by emoji
    const grouped = reactions.reduce((acc, r) => {
        acc[r.emoji] = acc[r.emoji] || [];
        acc[r.emoji].push(r.userAddress);
        return acc;
    }, {} as Record<string, string[]>);

    const handleReact = async (emoji: string) => {
        setLoading(true);
        try {
            await onReact(emoji);
        } finally {
            setLoading(false);
            setShowPicker(false);
        }
    };

    const hasReacted = (emoji: string) => {
        return currentUser && grouped[emoji]?.includes(currentUser);
    };

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {/* Existing reactions */}
            {Object.entries(grouped).map(([emoji, users]) => (
                <button
                    key={emoji}
                    onClick={() => handleReact(emoji)}
                    disabled={loading}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all ${
                        hasReacted(emoji)
                            ? "border-neon-cyan bg-neon-cyan/20 text-neon-cyan"
                            : "border-white/20 bg-white/5 text-white/60 hover:border-white/40"
                    }`}
                    title={users.map(u => u.slice(0, 4) + "...").join(", ")}
                >
                    <span className="text-sm">{emoji}</span>
                    <span className="font-mono text-[10px]">{users.length}</span>
                </button>
            ))}

            {/* Add reaction button */}
            <div className="relative">
                <button
                    onClick={() => setShowPicker(!showPicker)}
                    className={`flex items-center justify-center w-7 h-7 rounded-full border border-dashed border-white/20 text-white/30 hover:border-white/40 hover:text-white/60 transition-colors ${compact ? 'w-5 h-5 text-xs' : ''}`}
                    title="Add reaction"
                >
                    {loading ? "•" : "+"}
                </button>

                {/* Emoji picker */}
                {showPicker && (
                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-cyber-panel border border-cyber-border rounded shadow-xl z-50 flex gap-1">
                        {REACTION_EMOJIS.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => handleReact(emoji)}
                                disabled={loading}
                                className={`w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 transition-colors text-lg ${
                                    hasReacted(emoji) ? "bg-neon-cyan/20 ring-1 ring-neon-cyan" : ""
                                }`}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
