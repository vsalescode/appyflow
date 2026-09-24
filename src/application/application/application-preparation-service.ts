import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  AIProvider,
  StructuredOutputSchema,
} from "@/application/providers/ai-provider";
import { resolveResumeLanguage } from "@/domain/application/resume-language";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/infrastructure/database/prisma";

const selectionSchema = z.object({
  factId: z.uuid(),
  adaptedText: z.string().trim().min(1).max(2_000),
});
const draftResumeContentSchema = z.object({
  language: z.enum(["PT_BR", "EN"]),
  summary: z.object({
    text: z.string().trim().min(1).max(2_000),
    evidenceFactIds: z.array(z.uuid()).min(1).max(20),
  }),
  experiences: z.array(selectionSchema).max(20),
  projects: z.array(selectionSchema).max(20),
  languages: z.array(selectionSchema).max(20),
  skills: z.array(selectionSchema).max(50),
});
export type DraftResumeContent = z.infer<typeof draftResumeContentSchema>;

export const draftResumeContentOutputSchema: StructuredOutputSchema<DraftResumeContent> =
  {
    name: "draft_resume_content",
    jsonSchema: z.toJSONSchema(draftResumeContentSchema) as Record<
      string,
      unknown
    >,
    parse: (value) => draftResumeContentSchema.parse(value),
  };

export async function prepareApplication(
  userId: string,
  jobId: string,
  languageOverride: string | null,
  provider: AIProvider,
  clock: () => Date = () => new Date(),
) {
  const prisma = getPrismaClient();
  const job = await prisma.job.findFirst({
    where: { id: jobId, profile: { userId } },
    include: {
      application: true,
      profile: {
        include: {
          preference: true,
          professionalFacts: { where: { reviewStatus: "CONFIRMED" } },
        },
      },
    },
  });
  if (!job) throw new Error("Vaga não encontrada.");
  if (!job.profile.professionalFacts.length)
    throw new Error("Não existem fatos profissionais confirmados.");
  const language = resolveResumeLanguage(
    `${job.title} ${job.description ?? ""}`,
    languageOverride,
    job.profile.preference?.languages ?? [],
  );
  const facts = job.profile.professionalFacts.map((fact) => ({
    id: fact.id,
    type: fact.type,
    title: fact.title,
    organization: fact.organization,
    description: fact.description,
    startedAt: fact.startedAt,
    endedAt: fact.endedAt,
  }));
  const result = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Prepare conteúdo de currículo usando exclusivamente os fatos confirmados fornecidos. Toda experiência, projeto, idioma e skill deve referenciar seu factId original e permanecer em sua categoria correta. O resumo deve listar os factIds que sustentam o texto. Não transforme projeto em experiência profissional nem idioma humano em skill técnica. Não invente tecnologias, empresas, datas, métricas, resultados ou tempo de experiência. Preserve nomes próprios, números e fatos. Não gere LaTeX.",
      },
      {
        role: "user",
        content: JSON.stringify({
          targetLanguage: language === "PT_BR" ? "pt-BR" : "en",
          vacancy: {
            title: job.title,
            company: job.company,
            description: job.description,
          },
          candidateProfile: {
            headline: job.profile.headline,
            summary: job.profile.summary,
            facts,
          },
        }),
      },
    ],
    outputSchema: draftResumeContentOutputSchema,
    maxOutputTokens: 4_000,
    temperature: 0,
  });
  if (result.output.language !== language)
    throw new Error(
      "A IA retornou conteúdo em idioma diferente do solicitado.",
    );
  validateFactReferences(result.output, job.profile.professionalFacts);
  const now = clock();

  return prisma.$transaction(async (transaction) => {
    let application = job.application;
    if (!application) {
      application = await transaction.application.create({
        data: { id: randomUUID(), jobId, status: "RESUME_PREPARED" },
      });
      await transaction.applicationStatusEvent.create({
        data: {
          id: randomUUID(),
          applicationId: application.id,
          fromStatus: "FOUND",
          toStatus: "RESUME_PREPARED",
          changedAt: now,
        },
      });
    } else if (
      application.status === "FOUND" ||
      application.status === "INTERESTING"
    ) {
      const fromStatus = application.status;
      application = await transaction.application.update({
        where: { id: application.id },
        data: { status: "RESUME_PREPARED" },
      });
      await transaction.applicationStatusEvent.create({
        data: {
          id: randomUUID(),
          applicationId: application.id,
          fromStatus,
          toStatus: "RESUME_PREPARED",
          changedAt: now,
        },
      });
    }
    const content = JSON.parse(
      JSON.stringify(result.output),
    ) as Prisma.InputJsonValue;
    const preparation = await transaction.applicationPreparation.upsert({
      where: { applicationId: application.id },
      create: {
        id: randomUUID(),
        applicationId: application.id,
        language,
        content,
        aiModel: result.model,
        aiRequestId: result.requestId,
      },
      update: {
        language,
        content,
        aiModel: result.model,
        aiRequestId: result.requestId,
      },
    });
    return { preparation, content: result.output };
  });
}

export function validateFactReferences(
  content: DraftResumeContent,
  facts: readonly {
    id: string;
    type: "SKILL" | "EXPERIENCE" | "PROJECT" | "LANGUAGE";
  }[],
) {
  const types = new Map(facts.map((fact) => [fact.id, fact.type]));
  for (const id of content.summary.evidenceFactIds)
    if (!types.has(id))
      throw new Error("Resumo contém referência sem evidência.");
  for (const selection of content.experiences)
    if (types.get(selection.factId) !== "EXPERIENCE")
      throw new Error("Experiência contém referência inválida.");
  for (const selection of content.projects)
    if (types.get(selection.factId) !== "PROJECT")
      throw new Error("Projeto contém referência inválida.");
  for (const selection of content.languages)
    if (types.get(selection.factId) !== "LANGUAGE")
      throw new Error("Idioma contém referência inválida.");
  for (const selection of content.skills)
    if (types.get(selection.factId) !== "SKILL")
      throw new Error("Skill contém referência inválida.");
  const ids = [
    ...content.experiences.map((item) => item.factId),
    ...content.projects.map((item) => item.factId),
    ...content.languages.map((item) => item.factId),
    ...content.skills.map((item) => item.factId),
  ];
  if (new Set(ids).size !== ids.length)
    throw new Error("Um fato foi selecionado mais de uma vez.");
}
