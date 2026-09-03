export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-[3px] border-gray-200 border-t-[#D71920] rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Loading portal...</p>
      </div>
    </div>
  );
}
