import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isAddress } from 'viem';
import { normalize } from 'viem/ens';
import { useAccount, useEnsAddress } from 'wagmi';
import { ProfileCard } from './ProfileCard';
import { OwnerProfile } from './OwnerProfile';

export function Profile() {
  const { nameOrAddress = '' } = useParams();
  const navigate = useNavigate();
  const { address: me } = useAccount();

  const isAddr = isAddress(nameOrAddress);
  const isEns = !isAddr && nameOrAddress.includes('.');
  const { data: resolvedAddr } = useEnsAddress({
    name: isEns ? safeNormalize(nameOrAddress) : undefined,
    query: { enabled: isEns },
  });
  const targetAddress = (isAddr ? nameOrAddress : resolvedAddr) as `0x${string}` | undefined;
  const isSelf = !!me && !!targetAddress && me.toLowerCase() === targetAddress.toLowerCase();

  if (isSelf && targetAddress) {
    return (
      <div className="flex-1 overflow-y-auto bg-bg-base">
        <OwnerProfile address={targetAddress} />
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto bg-bg-base">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-text-secondary hover:text-text-primary text-sm mb-8">
          <ArrowLeft size={16} /> Back
        </button>
        <ProfileCard nameOrAddress={nameOrAddress} />
      </div>
    </main>
  );
}

function safeNormalize(name: string) {
  try { return normalize(name); } catch { return undefined; }
}
