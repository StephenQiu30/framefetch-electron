import { Component, type ReactNode, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import AboutPage, { metadata as aboutMetadata } from '@/app/about/page';
import AccountPage, { metadata as accountMetadata } from '@/app/account/page';
import AdminAiProvidersPage, {
  metadata as aiProvidersMetadata,
} from '@/app/admin/ai-providers/page';
import AdminAnalyticsPage, { metadata as analyticsMetadata } from '@/app/admin/analytics/page';
import AdminFilesPage, { metadata as filesMetadata } from '@/app/admin/files/page';
import AdminOperationLogsPage, {
  metadata as operationLogsMetadata,
} from '@/app/admin/operation-logs/page';
import AdminProvidersPage, { metadata as catalogMetadata } from '@/app/admin/providers/page';
import AdminUsersPage, { metadata as usersMetadata } from '@/app/admin/users/page';
import AnalysisDetailPage, { metadata as analysisMetadata } from '@/app/analyses/detail/page';
import DocumentDetailPage, {
  metadata as documentDetailMetadata,
} from '@/app/documents/detail/page';
import DocumentsPage, { metadata as documentsMetadata } from '@/app/documents/page';
import DownloadDetailPage, {
  metadata as downloadDetailMetadata,
} from '@/app/downloads/detail/page';
import NewDownloadPage, { metadata as newDownloadMetadata } from '@/app/downloads/new/page';
import GuidePage, { metadata as guideMetadata } from '@/app/guide/page';
import ActivityPage, { metadata as activityMetadata } from '@/app/history/activity/page';
import HistoryPage, { metadata as historyMetadata } from '@/app/history/page';
import NotFound from '@/app/not-found';
import ProvidersPage, { metadata as providersMetadata } from '@/app/providers/page';
import SelfHostingPage, { metadata as selfHostingMetadata } from '@/app/self-hosting/page';
import LoginPage, { metadata as loginMetadata } from '@/app/user/login/page';
import RegisterPage, { metadata as registerMetadata } from '@/app/user/register/page';
import { AuthProvider, useAuth } from '@/components/auth/auth-provider';
import { HomeExperience } from '@/components/intake/home-experience';
import { IntakeDraftProvider } from '@/components/intake/intake-draft-provider';
import { PublicHome } from '@/components/intake/public-home';
import { BasicLayout } from '@/components/layout/basic-layout';
import { QueryProvider } from '@/components/layout/query-provider';
import { RouteErrorView } from '@/components/layout/route-error-view';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { siteConfig } from '@/lib/site';
import { installNavigationAdapter, useLocation, usePathname } from './adapters/navigation';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import './styles.css';

const routes = {
  '/account': { Page: AccountPage, metadata: accountMetadata },
  '/about': { Page: AboutPage, metadata: aboutMetadata },
  '/guide': { Page: GuidePage, metadata: guideMetadata },
  '/self-hosting': { Page: SelfHostingPage, metadata: selfHostingMetadata },
  '/providers': { Page: ProvidersPage, metadata: providersMetadata },
  '/documents': { Page: DocumentsPage, metadata: documentsMetadata },
  '/history': { Page: HistoryPage, metadata: historyMetadata },
  '/user/login': { Page: LoginPage, metadata: loginMetadata },
  '/user/register': { Page: RegisterPage, metadata: registerMetadata },
  '/history/activity': { Page: ActivityPage, metadata: activityMetadata },
  '/documents/detail': { Page: DocumentDetailPage, metadata: documentDetailMetadata },
  '/downloads/detail': { Page: DownloadDetailPage, metadata: downloadDetailMetadata },
  '/downloads/new': { Page: NewDownloadPage, metadata: newDownloadMetadata },
  '/analyses/detail': { Page: AnalysisDetailPage, metadata: analysisMetadata },
  '/admin/ai-providers': { Page: AdminAiProvidersPage, metadata: aiProvidersMetadata },
  '/admin/analytics': { Page: AdminAnalyticsPage, metadata: analyticsMetadata },
  '/admin/files': { Page: AdminFilesPage, metadata: filesMetadata },
  '/admin/operation-logs': { Page: AdminOperationLogsPage, metadata: operationLogsMetadata },
  '/admin/providers': { Page: AdminProvidersPage, metadata: catalogMetadata },
  '/admin/users': { Page: AdminUsersPage, metadata: usersMetadata },
};

function ApplicationRoutes() {
  const pathname = usePathname();
  const location = useLocation();
  const { user } = useAuth();
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const route = routes[path as keyof typeof routes];
  useEffect(() => {
    const metadataTitle = route?.metadata.title;
    document.title =
      path === '/'
        ? user
          ? '工作区 · 帧取'
          : siteConfig.title
        : typeof metadataTitle === 'string'
          ? `${metadataTitle} · 帧取`
          : metadataTitle &&
              typeof metadataTitle === 'object' &&
              'absolute' in metadataTitle &&
              typeof metadataTitle.absolute === 'string'
            ? metadataTitle.absolute
            : '帧取 · FrameFetch';
  }, [path, route, user]);
  const Page = route?.Page;
  return (
    <RouteBoundary key={location}>
      {path === '/' ? (
        <HomeExperience publicHome={<PublicHome />} initialPublic />
      ) : Page ? (
        <Page />
      ) : (
        <NotFound />
      )}
    </RouteBoundary>
  );
}

class RouteBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <RouteErrorView error={this.state.error} reset={() => this.setState({ error: null })} />
    ) : (
      this.props.children
    );
  }
}

installNavigationAdapter();
const root = document.getElementById('root');
if (!root) throw new Error('应用挂载节点不存在');
createRoot(root).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableSystem={false}
      storageKey="framegrab-theme"
      themes={['light', 'dark']}
    >
      <AuthProvider>
        <QueryProvider>
          <IntakeDraftProvider>
            <TooltipProvider delayDuration={300}>
              <BasicLayout>
                <ApplicationRoutes />
              </BasicLayout>
            </TooltipProvider>
            <Toaster mobileOffset={{ top: 72 }} offset={{ top: 80 }} position="top-center" />
          </IntakeDraftProvider>
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
