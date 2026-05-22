type Props = {
  src?: string | null;
  fallback?: string;
  size?: number;
  online?: boolean;
};

export function Avatar({ src, fallback = '?', size = 40, online }: Props) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img src={src} alt="" className="rounded-full object-cover w-full h-full" />
      ) : (
        <div className="rounded-full w-full h-full bg-gradient-to-br from-brand to-purple-700 flex items-center justify-center text-white font-semibold" style={{ fontSize: size * 0.4 }}>
          {fallback.slice(0, 2).toUpperCase()}
        </div>
      )}
      {online && (
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-online border-2 border-bg-panel" />
      )}
    </div>
  );
}
