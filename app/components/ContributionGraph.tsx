"use client";

import { useMemo } from "react";
import { Commit } from "@/services/git/types";

interface ContributionGraphProps {
    commits: Commit[];
    className?: string;
}

// Generate last 365 days of data
const generateDayGrid = () => {
    const days: Date[] = [];
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d);
    }
    return days;
};

const getIntensity = (count: number): string => {
    if (count === 0) return "bg-white/5";
    if (count === 1) return "bg-neon-green/30";
    if (count <= 3) return "bg-neon-green/50";
    if (count <= 5) return "bg-neon-green/70";
    return "bg-neon-green shadow-[0_0_5px_#0aff0a]";
};

const formatDate = (date: Date) => {
    return date.toISOString().split("T")[0];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ContributionGraph({ commits, className = "" }: ContributionGraphProps) {
    const dayGrid = useMemo(() => generateDayGrid(), []);
    
    // Count commits per day
    const commitMap = useMemo(() => {
        const map: Record<string, number> = {};
        commits.forEach(c => {
            const dateKey = new Date(c.timestamp).toISOString().split("T")[0];
            map[dateKey] = (map[dateKey] || 0) + 1;
        });
        return map;
    }, [commits]);

    // Group by weeks (7 days per column)
    const weeks: Date[][] = useMemo(() => {
        const result: Date[][] = [];
        let currentWeek: Date[] = [];
        
        // Pad beginning to start on Sunday
        const firstDay = dayGrid[0].getDay();
        for (let i = 0; i < firstDay; i++) {
            currentWeek.push(new Date(0)); // Placeholder
        }
        
        dayGrid.forEach(day => {
            currentWeek.push(day);
            if (currentWeek.length === 7) {
                result.push(currentWeek);
                currentWeek = [];
            }
        });
        if (currentWeek.length > 0) {
            result.push(currentWeek);
        }
        return result;
    }, [dayGrid]);

    const totalCommits = commits.length;
    
    // Get month labels
    const monthLabels = useMemo(() => {
        const labels: { month: string; weekIndex: number }[] = [];
        let lastMonth = -1;
        weeks.forEach((week, weekIndex) => {
            const validDay = week.find(d => d.getTime() > 0);
            if (validDay) {
                const month = validDay.getMonth();
                if (month !== lastMonth) {
                    labels.push({ month: MONTHS[month], weekIndex });
                    lastMonth = month;
                }
            }
        });
        return labels;
    }, [weeks]);

    return (
        <div className={`${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white/80 font-cyber uppercase tracking-wider flex items-center gap-2">
                    <span className="w-3 h-3 bg-neon-green rounded-sm"></span>
                    Contribution_Activity
                </h3>
                <span className="text-xs text-white/40 font-mono">
                    {totalCommits} commits in the last year
                </span>
            </div>
            
            {/* Month labels */}
            <div className="flex mb-1 ml-8 text-[10px] text-white/30 font-mono">
                {monthLabels.map((label, i) => (
                    <div 
                        key={i} 
                        style={{ 
                            position: 'absolute',
                            left: `${32 + label.weekIndex * 14}px`
                        }}
                    >
                        {label.month}
                    </div>
                ))}
            </div>
            
            <div className="flex gap-1 overflow-x-auto custom-scrollbar pb-2 relative pt-4">
                {/* Day labels */}
                <div className="flex flex-col gap-[3px] text-[9px] text-white/30 font-mono pr-1">
                    {DAYS.map((day, i) => (
                        <div key={day} className="h-[11px] flex items-center" style={{ visibility: i % 2 === 0 ? 'hidden' : 'visible' }}>
                            {day}
                        </div>
                    ))}
                </div>
                
                {/* Grid */}
                {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-[3px]">
                        {week.map((day, dayIndex) => {
                            const dateKey = formatDate(day);
                            const count = commitMap[dateKey] || 0;
                            const isPlaceholder = day.getTime() === 0;
                            
                            return (
                                <div
                                    key={dayIndex}
                                    className={`w-[11px] h-[11px] rounded-sm transition-all hover:ring-1 hover:ring-white/30 ${
                                        isPlaceholder ? "bg-transparent" : getIntensity(count)
                                    }`}
                                    title={isPlaceholder ? "" : `${dateKey}: ${count} commit${count !== 1 ? 's' : ''}`}
                                />
                            );
                        })}
                    </div>
                ))}
            </div>
            
            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-2 text-[10px] text-white/40 font-mono">
                <span>Less</span>
                <div className="w-[11px] h-[11px] rounded-sm bg-white/5"></div>
                <div className="w-[11px] h-[11px] rounded-sm bg-neon-green/30"></div>
                <div className="w-[11px] h-[11px] rounded-sm bg-neon-green/50"></div>
                <div className="w-[11px] h-[11px] rounded-sm bg-neon-green/70"></div>
                <div className="w-[11px] h-[11px] rounded-sm bg-neon-green shadow-[0_0_5px_#0aff0a]"></div>
                <span>More</span>
            </div>
        </div>
    );
}
