import Link from "next/link";

import { listMasterResumes } from "@/application/resume/master-resume-service";
import { listResumeVersions } from "@/application/resume/resume-version-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

export default async function ResumesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  const resumes = user ? await listMasterResumes(user.id) : [];
  const versions = user ? await listResumeVersions(user.id) : [];
  const query = await searchParams;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <Link className="text-sm font-medium text-emerald-700" href="/dashboard">
        ← Voltar ao dashboard
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">Currículo mestre</h1>
      <p className="mt-2 text-slate-600">
        Envie um PDF de até 5 MiB e 30 páginas. Cada envio é preservado no
        histórico.
      </p>

      <form
        action="/api/resumes"
        className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        encType="multipart/form-data"
        method="post"
      >
        <label className="block text-sm font-medium" htmlFor="resume">
          Arquivo PDF
        </label>
        <input
          accept="application/pdf,.pdf"
          className="mt-3 block w-full rounded-lg border border-slate-300 p-3"
          id="resume"
          name="resume"
          required
          type="file"
        />
        <button
          className="mt-4 rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          type="submit"
        >
          Enviar currículo
        </button>
        {query.sucesso ? (
          <p className="mt-4 text-sm text-emerald-700">Currículo processado.</p>
        ) : null}
        {query.erro ? (
          <p className="mt-4 text-sm text-red-700">
            Não foi possível processar o PDF. Verifique o formato, o tamanho e
            se ele contém texto selecionável.
          </p>
        ) : null}
      </form>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Histórico do currículo mestre</h2>
        {resumes.length === 0 ? (
          <p className="mt-4 text-slate-600">Nenhum currículo enviado.</p>
        ) : (
          <ol className="mt-4 space-y-5">
            {resumes.map((resume) => (
              <li
                className="rounded-2xl border border-slate-200 bg-white p-6"
                key={resume.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{resume.originalName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {resume.pageCount} página(s) ·{" "}
                      {Math.ceil(resume.sizeBytes / 1024)} KiB ·{" "}
                      {resume.createdAt.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {resume.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                        Atual
                      </span>
                    ) : null}
                    <a
                      className="text-sm font-medium text-emerald-700"
                      href={`/api/resumes/${resume.id}/download`}
                    >
                      Baixar PDF
                    </a>
                  </div>
                </div>
                <details className="mt-5">
                  <summary className="cursor-pointer text-sm font-medium">
                    Revisar texto extraído
                  </summary>
                  <p className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-50 p-4 text-sm leading-6 whitespace-pre-wrap text-slate-700">
                    {resume.extractedText}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Currículos personalizados</h2>
        <p className="mt-2 text-sm text-slate-600">
          Cada geração é preservada com a vaga, o idioma e os arquivos usados.
        </p>
        {versions.length === 0 ? (
          <p className="mt-4 text-slate-600">
            Nenhuma versão personalizada foi gerada.
          </p>
        ) : (
          <ol className="mt-4 space-y-5">
            {versions.map((version) => (
              <li
                className="rounded-2xl border border-slate-200 bg-white p-6"
                key={version.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {version.application.job.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {version.application.job.company ??
                        "Empresa não informada"}
                      {" · "}
                      {version.language === "PT_BR" ? "Português" : "Inglês"}
                      {" · "}
                      {version.createdAt.toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      className="text-sm font-medium text-emerald-700"
                      href={`/api/resume-versions/${version.id}/download?format=tex`}
                    >
                      Baixar TEX
                    </a>
                    <a
                      className="text-sm font-medium text-emerald-700"
                      href={`/api/resume-versions/${version.id}/download?format=pdf`}
                    >
                      Baixar PDF
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
