# IQ Pages — Frontend Changes (Minimal)

IQ Pages 기능을 이 프론트엔드에 통합.

**배포/SDK 로직**: [../iq-git-cli/IQPAGES-PLAN.md](../iq-git-cli/IQPAGES-PLAN.md) — `@iqlabs-official/git` 의 `IqpagesService` 사용

---

## 원칙: 최소만

- 새 라우트 3 개 (갤러리, 상세, 설정 에디터)
- 기존 repo 상세 페이지 Deploy 탭만 수정
- 지갑 연결은 기존 `@solana/wallet-adapter-react` 패턴 재사용
- 배포 시도 전에 **repo 선택 시점에 미리 config 체크** → 없으면 에디터 유도

---

## 지갑/서비스 훅 패턴 (기존 재사용)

기존 `hooks/useGitData.ts` 의 `useGitService()` 스타일 그대로:

```typescript
// hooks/useIqpagesService.ts
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { IqpagesService } from '@iqlabs-official/git';
import { useMemo } from 'react';

export function useIqpagesService() {
  const { connection } = useConnection();
  const wallet = useWallet();
  return useMemo(
    () => new IqpagesService(connection, wallet as any),
    [connection, wallet]
  );
}
```

읽기 전용일 땐 `wallet` 이 비연결 상태여도 `listAll`/`isDeployed`/`readConfig` 는 동작.
쓰기 (deploy) 는 `wallet.connected` 확인 후 호출.

---

## 변경 요약

| 작업 | 위치 |
|------|------|
| 갤러리 | `app/pages/page.tsx` (신규) |
| 상세 | `app/pages/[repoTxId]/page.tsx` (신규) |
| IQ Pages 설정 에디터 | `app/[wallet]/[repo]/pages-setup/page.tsx` (신규) |
| repo 상세의 Pages 탭 | 기존 파일 수정 (1352-1404) |
| 헤더 메뉴 | Pages 링크 추가 |

---

## 핵심 플로우: "배포 시도 전 체크"

배포 버튼이 노출되는 지점 (`/my` 또는 repo 상세의 Pages 탭) 에서 **repo 가 선택되는 순간** 에 미리 체크:

```tsx
function DeployButton({ repo }) {
  const svc = useIqpagesService();

  const { data: config, isLoading } = useQuery({
    queryKey: ['iqpages-config', repo.txId],
    queryFn: () => svc.readConfig(repo.txId),
    staleTime: 60_000,
  });

  if (isLoading) return <Spinner />;

  // 파일 없음 → 에디터 유도
  if (!config) {
    return (
      <button onClick={() => showMissingConfigModal(repo)}>
        Deploy as IQ Pages
      </button>
    );
  }

  // 파일 있음 → 스키마 검증
  try {
    validateIqpagesConfig(config);
  } catch (e) {
    return (
      <button onClick={() => showInvalidConfigModal(repo, e.message)}>
        Deploy as IQ Pages (config invalid)
      </button>
    );
  }

  // 정상 → 배포 확인 후 실행
  return (
    <button onClick={() => handleDeploy(repo)}>
      Deploy as IQ Pages (0.2 SOL)
    </button>
  );
}
```

**모달 → 에디터 유도:**
```tsx
function showMissingConfigModal(repo) {
  return {
    title: 'iqpages.json required',
    body: `This repo needs iqpages.json to be deployed.`,
    actions: [
      { label: 'Cancel', onClick: close },
      {
        label: 'Add files',
        primary: true,
        onClick: () => router.push(
          `/${repo.owner}/${repo.name}/pages-setup?return=${repo.txId}`
        ),
      },
    ],
  };
}
```

---

## `/[wallet]/[repo]/pages-setup` — 설정 에디터

**역할**: iqpages.json 과 (선택) iqprofile.json 을 작성하거나 수정해서 repo 에 커밋.

```tsx
// app/[wallet]/[repo]/pages-setup/page.tsx
'use client';
import {
  validateIqpagesConfig,
  validateIqprofileConfig,
  IQPAGES_TEMPLATE,
  IQPROFILE_TEMPLATE,
} from '@iqlabs-official/git';

export default function PagesSetup({ params, searchParams }) {
  const svc = useIqpagesService();
  const gitService = useGitService(); // 기존 훅

  const [iqpagesJson, setIqpagesJson] = useState('');
  const [iqprofileJson, setIqprofileJson] = useState('');
  const [includeProfile, setIncludeProfile] = useState(false);
  const [iqpagesError, setIqpagesError] = useState<string | null>(null);
  const [iqprofileError, setIqprofileError] = useState<string | null>(null);

  // 기존 파일 있으면 로드, 없으면 템플릿 prefill
  useEffect(() => {
    (async () => {
      const existing = await svc.readConfig(repoTxId);
      setIqpagesJson(existing ? JSON.stringify(existing, null, 2) : IQPAGES_TEMPLATE);

      const existingProfile = await svc.readProfile(repoTxId);
      if (existingProfile) {
        setIqprofileJson(JSON.stringify(existingProfile, null, 2));
        setIncludeProfile(true);
      } else {
        setIqprofileJson(IQPROFILE_TEMPLATE);
      }
    })();
  }, [repoTxId]);

  // 실시간 검증
  useEffect(() => {
    try {
      validateIqpagesConfig(JSON.parse(iqpagesJson));
      setIqpagesError(null);
    } catch (e: any) { setIqpagesError(e.message); }
  }, [iqpagesJson]);

  useEffect(() => {
    if (!includeProfile) { setIqprofileError(null); return; }
    try {
      validateIqprofileConfig(JSON.parse(iqprofileJson));
      setIqprofileError(null);
    } catch (e: any) { setIqprofileError(e.message); }
  }, [iqprofileJson, includeProfile]);

  async function handleCommit() {
    if (iqpagesError || iqprofileError) return;

    const files = [
      { path: 'iqpages.json', content: iqpagesJson },
      ...(includeProfile ? [{ path: 'iqprofile.json', content: iqprofileJson }] : []),
    ];

    // 기존 IQ GitHub 커밋 플로우 재사용
    await gitService.commit(params.repo, files, 'Add IQ Pages config');

    // 원래 페이지로 복귀 (배포 이어서 가능)
    const returnTo = searchParams.return;
    if (returnTo) {
      router.push(`/my?deploy=${returnTo}`);
    } else {
      router.push(`/${params.wallet}/${params.repo}`);
    }
  }

  return (
    <div>
      <h1>IQ Pages Setup</h1>

      <section>
        <h2>iqpages.json (required)</h2>
        <CodeEditor value={iqpagesJson} onChange={setIqpagesJson} lang="json" />
        {iqpagesError && <div className="error">{iqpagesError}</div>}
      </section>

      <section>
        <label>
          <input
            type="checkbox"
            checked={includeProfile}
            onChange={(e) => setIncludeProfile(e.target.checked)}
          />
          Add iqprofile.json for Profile Net integration
        </label>

        {includeProfile && (
          <>
            <CodeEditor value={iqprofileJson} onChange={setIqprofileJson} lang="json" />
            {iqprofileError && <div className="error">{iqprofileError}</div>}
          </>
        )}
      </section>

      <button
        disabled={!!iqpagesError || (includeProfile && !!iqprofileError)}
        onClick={handleCommit}
      >
        Commit to repo
      </button>
    </div>
  );
}
```

**핵심**: 커밋 = 기존 IQ GitHub 업로드 플로우. `gitService.commit()` 이 on-chain 에 파일 커밋. IQ Pages 자체는 관여 안 함.

---

## `/my` — 내 레포 목록 + 배포 버튼

지갑 연결 후 내 repo 리스트 → 각 repo 의 IQ Pages 상태 미리 체크:

```tsx
export default function MyPages() {
  const { publicKey, connected } = useWallet();
  const gitService = useGitService();
  const svc = useIqpagesService();

  if (!connected) return <ConnectWalletButton />;

  const { data: repos } = useQuery({
    queryKey: ['my-repos', publicKey?.toBase58()],
    queryFn: () => gitService.listRepos(publicKey!.toBase58()),
  });

  return (
    <div>
      <h1>My Repos</h1>
      {repos?.map(repo => (
        <RepoRow key={repo.txId} repo={repo} svc={svc} />
      ))}
    </div>
  );
}

function RepoRow({ repo, svc }) {
  // 이 repo 의 IQ Pages 상태 미리 체크
  const { data: deployed } = useQuery({
    queryKey: ['iqpages-deployed', repo.txId],
    queryFn: () => svc.isDeployed(repo.txId),
  });

  return (
    <div>
      <span>{repo.name}</span>
      {deployed
        ? <Link href={`/pages/${repo.txId}`}>✓ Deployed →</Link>
        : <DeployButton repo={repo} svc={svc} />
      }
    </div>
  );
}
```

---

## `/pages` — 공개 갤러리

```tsx
// app/pages/page.tsx
'use client';
export default function Gallery() {
  const svc = useIqpagesService();

  const { data } = useQuery({
    queryKey: ['iqpages-all'],
    queryFn: async () => {
      const deployments = await svc.listAll();
      return Promise.all(deployments.map(async d => ({
        ...d,
        config: await svc.readConfig(d.repoTxId),
        profile: await svc.readProfile(d.repoTxId),
      })));
    },
    staleTime: 60_000,
  });

  return (
    <div className="grid ...">
      {data?.map(app => (
        <Link key={app.repoTxId} href={`/pages/${app.repoTxId}`}>
          <DeploymentCard {...app} />
        </Link>
      ))}
    </div>
  );
}
```

---

## `/pages/[repoTxId]` — 배포 상세

```tsx
export default function PageDetail({ params }) {
  const svc = useIqpagesService();

  const { data } = useQuery({
    queryKey: ['iqpages-detail', params.repoTxId],
    queryFn: async () => {
      const [deployed, config, profile] = await Promise.all([
        svc.isDeployed(params.repoTxId),
        svc.readConfig(params.repoTxId),
        svc.readProfile(params.repoTxId),
      ]);
      if (!deployed) return null;
      return { deployed, config, profile };
    },
  });

  // 라이브 URL 은 config.entry + repo 의 owner/name 조합
  // repoTxId → repo 메타는 git-service 의 getRepoByTxId 같은 함수 사용 (미결정)

  return (
    <div>
      <h1>{data?.profile?.displayName ?? data?.config?.name}</h1>
      <p>{data?.profile?.description}</p>
      <DyorButton url={liveUrl} repoTxId={params.repoTxId}>Open App</DyorButton>
    </div>
  );
}
```

---

## 기존 `app/[wallet]/[repo]/page.tsx` Pages 탭 수정

기존 Deploy 탭 (1352-1404) 을 교체. 같은 체크 플로우:

```tsx
function PagesTab({ repo }) {
  const svc = useIqpagesService();

  const { data: deployed } = useQuery({
    queryKey: ['iqpages-deployed', repo.txId],
    queryFn: () => svc.isDeployed(repo.txId),
  });

  if (deployed) {
    return (
      <div>
        <p>✓ Deployed as IQ Pages</p>
        <Link href={`/pages/${repo.txId}`}>View on Pages →</Link>
      </div>
    );
  }

  // 배포 안 됨 — DeployButton 컴포넌트 재사용
  return <DeployButton repo={repo} svc={svc} />;
}
```

---

## 헤더 네비게이션

`<Link href="/pages">Pages</Link>` 한 줄 추가.

---

## DYOR 모달

```tsx
function DyorButton({ url, repoTxId, children }) {
  const key = `dyor-ack-${repoTxId}`;
  const onClick = () => {
    if (!localStorage.getItem(key)) {
      if (!confirm('This is a third-party application. Review before interacting with your wallet.')) return;
      localStorage.setItem(key, '1');
    }
    window.open(url, '_blank');
  };
  return <button onClick={onClick}>{children}</button>;
}
```

---

## package.json

```json
{
  "dependencies": {
    "@iqlabs-official/git": "^...",  // 추가
    "@solana/wallet-adapter-react": "...",  // 이미 있음
    "@solana/wallet-adapter-react-ui": "...",
    ...
  }
}
```

`@iqlabs-official/git` 가 npm publish 됐는지 확인. 안 됐으면 publish 하거나 로컬 workspace 로 연결.

---

## MVP 체크리스트

- [ ] `hooks/useIqpagesService.ts` — 서비스 훅
- [ ] `app/pages/page.tsx` — 갤러리
- [ ] `app/pages/[repoTxId]/page.tsx` — 상세
- [ ] `app/[wallet]/[repo]/pages-setup/page.tsx` — 에디터
- [ ] `app/[wallet]/[repo]/page.tsx` Pages 탭 교체
- [ ] `app/my/page.tsx` (또는 기존 my 페이지에) — 내 repo 목록 + 배포 버튼
- [ ] 공통 DeployButton 컴포넌트
- [ ] 헤더 Pages 메뉴

---

## 미결정

1. **`@iqlabs-official/git` npm publish 여부** — 로컬 workspace 로 우선 개발 후 publish 결정
2. **repoTxId → repo 메타 (owner/name) 역참조** — 라이브 URL 구성에 필요. 기존 git-service 에 함수 있는지 확인
3. **CodeEditor 컴포넌트** — Monaco / CodeMirror / 단순 textarea 중 선택. 단순 textarea 로 시작해도 MVP 충분
4. **/my 페이지 기존 존재 여부** — 이미 있으면 확장, 없으면 신규. `app/profile` 이 유사 역할일 수 있음
5. **아이콘 CORS** — `iqprofile.json.icon = './icon.png'` 을 `/api/raw` 로 fetch 시 CORS 체크
