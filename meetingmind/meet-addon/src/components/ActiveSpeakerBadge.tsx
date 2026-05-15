interface Props {
  name: string;
}

export function ActiveSpeakerBadge({ name }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[#1A1C1E] rounded-md">
      <div className="flex items-end gap-0.5 h-4">
        {[1, 2, 3, 2, 1].map((h, i) => (
          <div
            key={i}
            className="w-0.5 bg-[#B8422E] rounded-full animate-pulse"
            style={{ height: `${h * 4}px`, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
      <span className="text-white text-sm font-medium">{name} is speaking</span>
    </div>
  );
}
