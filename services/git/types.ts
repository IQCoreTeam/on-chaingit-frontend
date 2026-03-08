export interface Repository {
  name: string;
  description: string;
  owner: string;
  timestamp: number;
  isPublic: boolean;
}

export interface Issue {
    id: string;
    repoName: string;
    title: string;
    body: string;
    author: string;
    status: "open" | "closed";
    timestamp: number;
    bounty?: number; // Amount in SOL
    bountyStatus?: "active" | "paid";
    labels?: string[]; // e.g. ["bug", "enhancement"]
}

export interface Commit {
  id: string;
  repoName: string;
  message: string;
  author: string;
  timestamp: number;
  treeTxId: string;
  parentCommitId?: string;
}

export interface FileTree {
  [filePath: string]: {
    txId: string;
    hash: string;
  };
}

export interface Ref {
  repoName: string;
  refName: string;
  commitId: string;
}

export interface Collaborator {
  repoName: string;
  userAddress: string;
  role: "admin" | "writer";
}

export interface Fork {
  originalRepoName: string;
  forkRepoName: string;
  owner: string;
}

export const GIT_CONSTANTS = {
  REPOS_TABLE: "git_repos_v2",
  COMMITS_TABLE: "git_commits",
  REFS_TABLE: "git_refs",
  COLLABORATORS_TABLE: "git_collabs",
  FORKS_TABLE: "git_forks",
  PULL_REQUESTS_TABLE: "git_prs",
  PROFILES_TABLE: "git_profiles",
};
 
export interface Comment {
    id: string;
    targetId: string; // Issue ID or PR ID
    repoName: string; // Partition key for efficiency
    author: string;
    body: string;
    timestamp: number;
}

export interface PullRequest {
  id: string;
  repoName: string;
  title: string;
  description: string;
  author: string;
  sourceBranch: string;
  targetBranch: string;
  status: "open" | "closed" | "merged";
  timestamp: number;
}

export interface UserProfile {
    userAddress: string;
    avatarUrl: string;
    bio: string;
    readmeTxId?: string; // Optional: Link to a full markdown bio
    socials: {
        twitter?: string;
        github?: string;
        website?: string;
    };
    timestamp: number;
}

export interface FundingPool {
    id: "global_qf_pool";
    totalFunds: number; // SOL
    matchingMultiplier: number; // e.g., 2.5x
    contributors: number;
}

export interface Reaction {
    id: string;
    targetId: string; // Issue ID, Comment ID, or PR ID
    targetType: "issue" | "comment" | "pr";
    emoji: string; // 🚀 👀 ❤️ 👍 👎 😄 🎉 😕
    userAddress: string;
    timestamp: number;
}

export const REACTION_EMOJIS = ["👍", "👎", "❤️", "🚀", "👀", "🎉", "😄", "😕"] as const;
