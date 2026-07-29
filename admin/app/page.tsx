// Stub landing page. The real Trust & Safety dashboard (reports, flagged
// chats, ban/suspend, category approvals) is built in Phase 7.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-[#FAF6EF] p-8">
      <div className="max-w-md rounded-2xl border border-[#EDE6DA] bg-white p-8 text-center shadow-sm">
        <h1 className="text-3xl font-bold text-[#221D16]">Sapiens Admin</h1>
        <p className="mt-3 text-[#6B6257]">
          Trust &amp; Safety dashboard — coming in Phase 7.
        </p>
      </div>
    </main>
  );
}
