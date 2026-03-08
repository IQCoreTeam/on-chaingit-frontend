"use client";

import React from "react";

interface SkeletonProps {
    className?: string;
    width?: string | number;
    height?: string | number;
    variant?: "text" | "circular" | "rectangular" | "rounded";
    animation?: "pulse" | "wave" | "none";
}

/**
 * Skeleton loading placeholder component
 * Provides visual feedback during content loading
 */
export function Skeleton({
    className = "",
    width,
    height,
    variant = "rectangular",
    animation = "pulse",
}: SkeletonProps) {
    const baseClasses = "bg-white/5";
    
    const animationClasses = {
        pulse: "animate-pulse",
        wave: "skeleton-wave",
        none: "",
    };
    
    const variantClasses = {
        text: "rounded",
        circular: "rounded-full",
        rectangular: "",
        rounded: "rounded-lg",
    };
    
    const style: React.CSSProperties = {
        width: width,
        height: height,
    };
    
    return (
        <div
            className={`${baseClasses} ${animationClasses[animation]} ${variantClasses[variant]} ${className}`}
            style={style}
        />
    );
}

/**
 * Skeleton for a code file viewer
 */
export function CodeViewerSkeleton() {
    return (
        <div className="flex flex-col h-full bg-[#050505]">
            {/* Toolbar skeleton */}
            <div className="flex items-center justify-between p-3 border-b border-cyber-border bg-cyber-panel/80">
                <div className="flex items-center gap-3">
                    <Skeleton width={16} height={16} variant="rounded" />
                    <Skeleton width={150} height={20} variant="rounded" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton width={60} height={28} variant="rounded" />
                    <Skeleton width={28} height={28} variant="rounded" />
                </div>
            </div>
            
            {/* Code content skeleton */}
            <div className="flex-1 p-4 space-y-2">
                {[...Array(20)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                        <Skeleton width={30} height={16} variant="rounded" className="opacity-30" />
                        <Skeleton 
                            width={`${Math.random() * 60 + 20}%`} 
                            height={16} 
                            variant="rounded" 
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Skeleton for file tree sidebar
 */
export function FileTreeSkeleton() {
    return (
        <div className="space-y-2 p-2">
            {[...Array(8)].map((_, i) => (
                <div key={i} className="flex items-center gap-2" style={{ paddingLeft: `${(i % 3) * 1.5}rem` }}>
                    <Skeleton width={16} height={16} variant="rounded" />
                    <Skeleton width={`${Math.random() * 40 + 40}%`} height={16} variant="rounded" />
                </div>
            ))}
        </div>
    );
}

/**
 * Skeleton for repository card
 */
export function RepoCardSkeleton() {
    return (
        <div className="cyber-card p-6 space-y-4">
            <div className="flex items-center gap-4">
                <Skeleton width={48} height={48} variant="rounded" />
                <div className="flex-1 space-y-2">
                    <Skeleton width="60%" height={24} variant="rounded" />
                    <Skeleton width="40%" height={16} variant="rounded" />
                </div>
            </div>
            <Skeleton width="100%" height={40} variant="rounded" />
            <div className="flex gap-4">
                <Skeleton width={60} height={20} variant="rounded" />
                <Skeleton width={60} height={20} variant="rounded" />
                <Skeleton width={60} height={20} variant="rounded" />
            </div>
        </div>
    );
}

/**
 * Skeleton for commit list item
 */
export function CommitSkeleton() {
    return (
        <div className="p-4 border border-cyber-border bg-black/20 flex items-center gap-4">
            <Skeleton width={40} height={40} variant="circular" />
            <div className="flex-1 space-y-2">
                <Skeleton width="70%" height={18} variant="rounded" />
                <div className="flex items-center gap-4">
                    <Skeleton width={80} height={14} variant="rounded" />
                    <Skeleton width={60} height={14} variant="rounded" />
                </div>
            </div>
            <Skeleton width={70} height={24} variant="rounded" />
        </div>
    );
}

/**
 * Skeleton for issue/PR list item
 */
export function IssueSkeleton() {
    return (
        <div className="p-4 border border-cyber-border bg-black/20 space-y-3">
            <div className="flex items-center gap-3">
                <Skeleton width={20} height={20} variant="circular" />
                <Skeleton width="60%" height={20} variant="rounded" />
            </div>
            <Skeleton width="40%" height={14} variant="rounded" />
            <div className="flex gap-2">
                <Skeleton width={50} height={20} variant="rounded" />
                <Skeleton width={50} height={20} variant="rounded" />
            </div>
        </div>
    );
}

/**
 * Skeleton for branch list item
 */
export function BranchSkeleton() {
    return (
        <div className="flex items-center justify-between p-4 border border-cyber-border">
            <Skeleton width={120} height={18} variant="rounded" />
            <Skeleton width={70} height={18} variant="rounded" />
        </div>
    );
}

/**
 * Skeleton for the full repo page
 */
export function RepoPageSkeleton() {
    return (
        <div className="min-h-screen bg-cyber-bg text-foreground">
            {/* Header skeleton */}
            <header className="border-b border-cyber-border bg-cyber-bg/90 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-6">
                    <Skeleton width={40} height={40} variant="rounded" />
                    <div className="flex items-center gap-4">
                        <Skeleton width={48} height={48} variant="rounded" />
                        <div className="space-y-2">
                            <Skeleton width={200} height={28} variant="rounded" />
                            <Skeleton width={150} height={14} variant="rounded" />
                        </div>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <Skeleton width={100} height={32} variant="rounded" />
                        <Skeleton width={80} height={32} variant="rounded" />
                        <Skeleton width={100} height={32} variant="rounded" />
                    </div>
                </div>
                
                {/* Tabs skeleton */}
                <div className="max-w-7xl mx-auto px-6 flex gap-1 mt-4">
                    {[...Array(6)].map((_, i) => (
                        <Skeleton key={i} width={100} height={36} variant="rounded" />
                    ))}
                </div>
            </header>
            
            {/* Content skeleton */}
            <main className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* File tree sidebar */}
                    <div className="md:col-span-3 cyber-card h-[600px] p-0">
                        <div className="p-3 border-b border-cyber-border">
                            <Skeleton width="60%" height={20} variant="rounded" />
                        </div>
                        <FileTreeSkeleton />
                    </div>
                    
                    {/* Code viewer */}
                    <div className="md:col-span-9 cyber-card h-[600px] overflow-hidden">
                        <CodeViewerSkeleton />
                    </div>
                </div>
            </main>
        </div>
    );
}

/**
 * Skeleton for loading list (commits, issues, PRs)
 */
export function ListSkeleton({ count = 5, ItemSkeleton = CommitSkeleton }: { count?: number; ItemSkeleton?: React.FC }) {
    return (
        <div className="space-y-4">
            {[...Array(count)].map((_, i) => (
                <ItemSkeleton key={i} />
            ))}
        </div>
    );
}
