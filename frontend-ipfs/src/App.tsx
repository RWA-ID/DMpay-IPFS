import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { config } from './lib/wagmi';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { ChatList } from './components/ChatList';
import { ChatView } from './components/ChatView';
import { Landing } from './components/Landing';
import { Profile } from './components/Profile';
import { Settings } from './components/Settings';
import { Inbox } from './components/Inbox';
import { Discover } from './components/Discover';
import { XmtpAutoInit } from './components/XmtpAutoInit';

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#7c5cff',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })}
        >
          <HashRouter>
            <Shell />
          </HashRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function Shell() {
  const location = useLocation();
  const inChat = location.pathname.startsWith('/c/');

  return (
    <div className="h-full flex flex-col">
      <XmtpAutoInit />
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        {inChat ? (
          <>
            <Sidebar />
            <ChatList />
            <Routes>
              <Route path="/c/:address" element={<ChatView />} />
            </Routes>
          </>
        ) : (
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/u/:nameOrAddress" element={<Profile />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/groups/new" element={<Placeholder title="Create paid group" />} />
          </Routes>
        )}
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <main className="flex-1 flex items-center justify-center bg-bg-base text-text-secondary">
      <div className="text-center">
        <div className="text-lg font-medium text-text-primary mb-2">{title}</div>
        <div className="text-sm">Coming next.</div>
      </div>
    </main>
  );
}

export default App;
