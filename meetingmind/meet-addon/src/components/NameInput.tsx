interface Props {
  trackId: string;
  faceCropUrl: string;
  value: string;
  suggestedName: string | null;
  onChange: (name: string) => void;
}

export function NameInput({ trackId, faceCropUrl, value, suggestedName, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white border border-[#6C7278]/20 rounded-md">
      <img
        src={faceCropUrl}
        alt="Face"
        className="h-12 w-12 rounded-sm object-cover border border-[#6C7278]/30"
      />
      <div className="flex-1 min-w-0">
        {suggestedName && (
          <p className="text-[10px] text-[#6C7278] mb-1">Recognized: {suggestedName}</p>
        )}
        <input
          type="text"
          value={value}
          placeholder="Enter name..."
          onChange={(e) => onChange(e.target.value)}
          className="w-full text-sm border-b border-[#1A1C1E]/30 focus:border-[#B8422E] outline-none pb-0.5 bg-transparent text-[#1A1C1E] placeholder:text-[#6C7278]"
        />
      </div>
    </div>
  );
}
