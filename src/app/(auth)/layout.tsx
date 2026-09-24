export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-32 -left-32 size-96 rounded-full bg-emerald-400/15 blur-3xl" />
        <div className="absolute right-0 bottom-0 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-400 font-black text-slate-950">
            A
          </span>
          <strong className="text-xl tracking-tight">AppyFlow</strong>
        </div>
        <div className="relative max-w-xl">
          <p className="text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase">
            Career workspace
          </p>
          <h1 className="mt-5 text-5xl leading-[1.08] font-bold tracking-tight">
            Sua busca por trabalho, organizada de ponta a ponta.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
            Descubra oportunidades, entenda sua aderência e prepare candidaturas
            rastreáveis em um único lugar.
          </p>
        </div>
        <p className="relative text-xs text-slate-600">
          Privado · Single-user · Self-hosted
        </p>
      </section>
      <section className="flex items-center justify-center bg-slate-50 px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
