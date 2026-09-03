'use client';

import { Suspense, lazy, useState } from 'react';
import { SupervisorLayout } from './components/SupervisorLayout';
import { useTabWithHash } from '@/hooks/useTabWithHash';

const SupervisorDashboard = lazy(() => import('./components/SupervisorDashboard'));
const SupervisorPosts = lazy(() => import('./components/SupervisorPosts'));
const SupervisorAttendance = lazy(() => import('./components/SupervisorAttendance'));
const SupervisorDeployments = lazy(() => import('./components/SupervisorDeployments'));
const SupervisorPatrols = lazy(() => import('./components/SupervisorPatrols'));
const SupervisorLeaves = lazy(() => import('./components/SupervisorLeaves'));
const SupervisorReports = lazy(() => import('./components/SupervisorReports'));
const SupervisorMess = lazy(() => import('./components/SupervisorMess'));
const SupervisorPostDetail = lazy(() => import('./components/SupervisorPostDetail'));

const tabComponents: Record<string, React.LazyExoticComponent<any>> = {
  dashboard: SupervisorDashboard,
  posts: SupervisorPosts,
  attendance: SupervisorAttendance,
  deployments: SupervisorDeployments,
  leaves: SupervisorLeaves,
  patrols: SupervisorPatrols,
  reports: SupervisorReports,
  mess: SupervisorMess,
};

function PageLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-100 dark:bg-white/5" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-white/5" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-gray-100 dark:bg-white/5" />
    </div>
  );
}

export function SupervisorPortalModule() {
  const [activeTab, setActiveTab] = useTabWithHash('dashboard', Object.keys(tabComponents));
  const [detailPostId, setDetailPostId] = useState<string | null>(null);

  // If viewing a post detail, show that instead
  if (detailPostId) {
    return (
      <SupervisorLayout activeTab="posts" onTabChange={(tab) => { setDetailPostId(null); setActiveTab(tab); }}>
        <Suspense fallback={<PageLoading />}>
          <SupervisorPostDetail postId={detailPostId} onBack={() => setDetailPostId(null)} />
        </Suspense>
      </SupervisorLayout>
    );
  }

  const ActiveComponent = tabComponents[activeTab] || SupervisorDashboard;

  return (
    <SupervisorLayout activeTab={activeTab} onTabChange={setActiveTab}>
      <Suspense fallback={<PageLoading />}>
        {activeTab === 'posts' ? (
          <SupervisorPosts onOpenPostDetail={(id: string) => setDetailPostId(id)} />
        ) : (
          <ActiveComponent />
        )}
      </Suspense>
    </SupervisorLayout>
  );
}
