import { useState } from 'react';
import { Users } from 'lucide-react';

/**
 * Group image with a deterministic fallback. XMTP groups carry an optional
 * imageUrl; when it's absent (or fails to load) we derive a stable gradient
 * from the group id so every group still reads as a distinct object.
 */
export function GroupAvatar({ src, seed, size = 48, name }: {
  src?: string | null;
  seed: string;
  size?: number;
  name?: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = !!src && !broken;

  if (showImage) {
    return (
      <img
        src={src!}
        alt={name ?? 'Group'}
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className="rounded-full object-cover border border-border-subtle shrink-0 bg-bg-elevated"
      />
    );
  }

  const hue = hueFromSeed(seed);
  const letter = (name ?? '').trim().charAt(0).toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, hsl(${hue} 42% 34%), hsl(${(hue + 48) % 360} 38% 20%))`,
      }}
      className="rounded-full border border-border-subtle shrink-0 flex items-center justify-center text-text-primary"
      aria-hidden={!name}
    >
      {letter ? (
        <span className="font-semibold" style={{ fontSize: size * 0.4 }}>{letter}</span>
      ) : (
        <Users size={size * 0.42} />
      )}
    </div>
  );
}

function hueFromSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
