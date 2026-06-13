"use client";

import { useParams } from "next/navigation";
import {
  useActiveGitClient,
  useCommits,
  useOwnerRepos,
  useInvalidateRepo,
} from "@/hooks/useGitData";
import { useIqpagesDeployed } from "@/hooks/useIqpagesData";
import { RepoView } from "@/app/components/RepoView";
import { RepoPageSkeleton } from "@/app/components/Skeleton";

export default function RepoDetail() {
  const params = useParams();
  const ownerAddress = decodeURIComponent(
    Array.isArray(params.wallet) ? params.wallet[0] : (params.wallet as string),
  );
  const repoName = decodeURIComponent(
    Array.isArray(params.repo) ? params.repo[0] : (params.repo as string),
  );

  const client = useActiveGitClient();
  const reposQuery = useOwnerRepos(ownerAddress);
  const repo = reposQuery.data?.find((r) => r.name === repoName) ?? null;
  const commitsQuery = useCommits(ownerAddress, repoName);
  const deployedQuery = useIqpagesDeployed(ownerAddress, repoName);
  const invalidateRepo = useInvalidateRepo();

  if ((reposQuery.isLoading || commitsQuery.isLoading) && !repo) return <RepoPageSkeleton />;
  if (!repo) return <div className="p-10 text-white">Repository not found</div>;

  return (
    <RepoView
      repoLabel={repo.name}
      owner={ownerAddress}
      commits={commitsQuery.data ?? []}
      commitsLoading={commitsQuery.isLoading}
      deployed={deployedQuery.data ?? false}
      isPublic={repo.isPublic}
      canEdit
      client={client}
      repoName={repoName}
      onCommitted={() => invalidateRepo(ownerAddress, repoName)}
    />
  );
}
