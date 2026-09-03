export default function LoginLoading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-linear-to-br from-[#1a1d2e] via-[#0f1219] to-[#0b0e18]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-white/20 border-t-[#D71920] rounded-full animate-spin" />
        <p className="text-sm text-white/40">Loading...</p>
      </div>
    </div>
  );
}
