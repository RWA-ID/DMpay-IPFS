import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ProfileCard } from './ProfileCard';

export function Profile() {
  const { nameOrAddress = '' } = useParams();
  const navigate = useNavigate();
  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm mb-8">
          <ArrowLeft size={16} /> Search
        </button>
        <ProfileCard nameOrAddress={nameOrAddress} />
      </div>
    </main>
  );
}
