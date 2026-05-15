interface Props {
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  isActive: boolean;
}

export function FaceBox({ x, y, w, h, name, isActive }: Props) {
  return (
    <div
      style={{ position: "absolute", left: x, top: y, width: w, height: h }}
      className={`border-2 ${isActive ? "border-[#B8422E]" : "border-white/60"} rounded-sm`}
    >
      <span
        className={`
          absolute -top-6 left-0 px-1.5 py-0.5 text-xs font-medium rounded-sm whitespace-nowrap
          ${isActive ? "bg-[#B8422E] text-white" : "bg-[#1A1C1E]/80 text-white"}
        `}
      >
        {name}
      </span>
      {isActive && (
        <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-[#B8422E] animate-pulse" />
      )}
    </div>
  );
}
