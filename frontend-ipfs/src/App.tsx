import { useEffect, useRef } from 'react';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { config } from './lib/wagmi';
import { CLEAN_URLS } from './lib/site';
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
import { CreateGroup } from './components/CreateGroup';
import { GroupView } from './components/GroupView';
import { Privacy } from './components/Privacy';
import { Terms } from './components/Terms';

const queryClient = new QueryClient();

// Clean paths on app.dmpay.me (Pages rewrites 404s to index.html); hash routing on
// IPFS gateways, which serve a hard 404 for any path that isn't a real file.
const Router = CLEAN_URLS ? BrowserRouter : HashRouter;

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#F2F0E8',
            accentColorForeground: '#0B0B0A',
            borderRadius: 'large',
          })}
        >
          <Router>
            <Shell />
          </Router>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();

  // The sidebar and chat list are inbox furniture — they only mean anything to
  // someone signed in, and each carries its own connect prompt. A shared /g/ or
  // /c/ link usually lands on a signed-out visitor, so they'd arrive to a wall
  // of duplicate "Connect wallet" buttons around a page they can't use. Give
  // them the destination full-width instead.
  //
  // Keyed on `isConnected` rather than excluding wagmi's 'disconnected' status:
  // wagmi starts out 'reconnecting' for a second or two even with nothing to
  // reconnect to, which made the chrome appear and then vanish. Waiting for a
  // confirmed connection means it only ever slides in, which reads as loading
  // rather than as content being yanked away.
  const onChatRoute = location.pathname.startsWith('/c/') || location.pathname.startsWith('/g/');
  const inChat = onChatRoute && isConnected;

  // Profile-first onboarding: when a user connects from the landing page,
  // take them to their own profile (where pricing + ENS setup live).
  const wasConnected = useRef(isConnected);
  useEffect(() => {
    if (isConnected && !wasConnected.current && address && location.pathname === '/') {
      navigate(`/u/${address}`);
    }
    wasConnected.current = isConnected;
  }, [isConnected, address, location.pathname, navigate]);

  return (
    <div className="h-full flex flex-col">
      <XmtpAutoInit />
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        {inChat ? (
          <>
            <div className="hidden md:flex"><Sidebar /></div>
            <ChatList className="hidden md:flex w-80" />
            <Routes>
              <Route path="/c/:address" element={<ChatView />} />
              <Route path="/g/:id" element={<GroupView />} />
            </Routes>
          </>
        ) : (
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/u/:nameOrAddress" element={<Profile />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/groups/new" element={<CreateGroup />} />
            {/* Also routed here for the signed-out case above — without these a
                shared link would match nothing and render a blank page. */}
            <Route path="/c/:address" element={<ChatView />} />
            <Route path="/g/:id" element={<GroupView />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
          </Routes>
        )}
      </div>
    </div>
  );
}

export default App;
