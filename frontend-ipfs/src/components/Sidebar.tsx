import { MessageSquare, Plus, Compass, Settings, HelpCircle, User, Users } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from 'wagmi';
import { useVerifiedEnsName } from '../hooks/useVerifiedEnsName';

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { address } = useAccount();
  const { data: ensName } = useVerifiedEnsName({ address });

  const isInbox = pathname === '/inbox' || pathname.startsWith('/c/');
  const isDiscover = pathname === '/discover';
  const isSettings = pathname === '/settings';
  const isNewGroup = pathname === '/groups/new';
  const isProfile = pathname.startsWith('/u/');

  const profileTarget = ensName ?? address;

  return (
    <aside className="w-14 bg-bg-base flex flex-col items-center py-4 border-r border-border-subtle">
      <nav className="flex flex-col gap-2 flex-1">
        <SidebarBtn icon={MessageSquare} active={isInbox} onClick={() => navigate('/inbox')} label="Inbox" />
        <SidebarBtn icon={Plus} onClick={() => navigate('/')} label="New chat" />
        <SidebarBtn icon={Compass} active={isDiscover} onClick={() => navigate('/discover')} label="Discover" />
        <SidebarBtn icon={Users} active={isNewGroup} onClick={() => navigate('/groups/new')} label="New group" />
        {profileTarget && (
          <SidebarBtn icon={User} active={isProfile} onClick={() => navigate(`/u/${profileTarget}`)} label="My profile" />
        )}
      </nav>
      <div className="flex flex-col gap-2">
        <SidebarBtn icon={HelpCircle} onClick={() => window.open('https://github.com/RWA-ID/DMpay-Protocol', '_blank')} label="Docs" />
        <SidebarBtn icon={Settings} active={isSettings} onClick={() => navigate('/settings')} label="Settings" />
      </div>
    </aside>
  );
}

function SidebarBtn({ icon: Icon, active, onClick, label }: { icon: any; active?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
        active ? 'bg-chip text-text-primary' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      <Icon size={20} />
    </button>
  );
}
