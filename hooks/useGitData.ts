"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { GitChainService } from "@/services/git/git-chain-service";
import { Repository, Commit, FileTree, Ref, Collaborator, Issue, PullRequest } from "@/services/git/types";

/**
 * Hook to get a memoized GitChainService instance
 */
export function useGitService() {
    const { connection } = useConnection();
    const wallet = useWallet();
    
    return useMemo(
        () => new GitChainService(connection, wallet as any),
        [connection, wallet]
    );
}

/**
 * Hook to fetch all repositories with caching
 */
export function useRepos() {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["repos"],
        queryFn: () => gitService.listRepos(),
        staleTime: 60 * 1000, // 1 minute
    });
}

/**
 * Hook to fetch a single repository
 */
export function useRepo(repoName: string) {
    const { data: repos, ...rest } = useRepos();
    
    const repo = useMemo(
        () => repos?.find(r => r.name === repoName) ?? null,
        [repos, repoName]
    );
    
    return { data: repo, repos, ...rest };
}

/**
 * Hook to fetch commits for a repository with caching
 */
export function useCommits(repoName: string) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["commits", repoName],
        queryFn: () => gitService.getLog(repoName),
        staleTime: 30 * 1000,
        enabled: !!repoName,
    });
}

/**
 * Hook to fetch branches for a repository with caching
 */
export function useBranches(repoName: string) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["branches", repoName],
        queryFn: () => gitService.listBranches(repoName),
        staleTime: 30 * 1000,
        enabled: !!repoName,
    });
}

/**
 * Hook to fetch file tree for a commit with caching
 * Trees are immutable (content-addressed), so they can be cached indefinitely
 */
export function useFileTree(treeTxId: string | undefined) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["tree", treeTxId],
        queryFn: () => gitService.getTree(treeTxId!),
        staleTime: Infinity, // Trees are immutable - never stale
        gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
        enabled: !!treeTxId,
    });
}

/**
 * Hook to fetch file content with caching
 * File content is immutable (content-addressed), so it can be cached indefinitely
 */
export function useFileContent(
    txId: string | undefined,
    repoName?: string,
    isPrivate = false
) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["file", txId, repoName, isPrivate],
        queryFn: () => gitService.getFileContent(txId!, repoName, isPrivate),
        staleTime: Infinity, // Files are immutable - never stale
        gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
        enabled: !!txId,
    });
}

/**
 * Hook to fetch collaborators for a repository with caching
 */
export function useCollaborators(repoName: string) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["collaborators", repoName],
        queryFn: () => gitService.getCollaborators(repoName),
        staleTime: 60 * 1000,
        enabled: !!repoName,
    });
}

/**
 * Hook to fetch issues for a repository with caching
 */
export function useIssues(repoName: string) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["issues", repoName],
        queryFn: () => gitService.getIssues(repoName),
        staleTime: 30 * 1000,
        enabled: !!repoName,
    });
}

/**
 * Hook to fetch pull requests for a repository with caching
 */
export function usePullRequests(repoName: string) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["pullRequests", repoName],
        queryFn: () => gitService.listPullRequests(repoName),
        staleTime: 30 * 1000,
        enabled: !!repoName,
    });
}

/**
 * Hook to fetch stars for a repository with caching
 */
export function useStars(repoName: string) {
    const gitService = useGitService();
    
    return useQuery({
        queryKey: ["stars", repoName],
        queryFn: () => gitService.getStars(repoName),
        staleTime: 30 * 1000,
        enabled: !!repoName,
    });
}

/**
 * Hook to invalidate and refetch repo-related data after mutations
 */
export function useInvalidateRepo() {
    const queryClient = useQueryClient();
    
    return (repoName: string) => {
        queryClient.invalidateQueries({ queryKey: ["repos"] });
        queryClient.invalidateQueries({ queryKey: ["commits", repoName] });
        queryClient.invalidateQueries({ queryKey: ["branches", repoName] });
        queryClient.invalidateQueries({ queryKey: ["issues", repoName] });
        queryClient.invalidateQueries({ queryKey: ["pullRequests", repoName] });
        queryClient.invalidateQueries({ queryKey: ["stars", repoName] });
        queryClient.invalidateQueries({ queryKey: ["collaborators", repoName] });
    };
}

/**
 * Prefetch file content for faster navigation
 */
export function usePrefetchFile() {
    const queryClient = useQueryClient();
    const gitService = useGitService();
    
    return (txId: string, repoName?: string, isPrivate = false) => {
        queryClient.prefetchQuery({
            queryKey: ["file", txId, repoName, isPrivate],
            queryFn: () => gitService.getFileContent(txId, repoName, isPrivate),
            staleTime: Infinity,
        });
    };
}
