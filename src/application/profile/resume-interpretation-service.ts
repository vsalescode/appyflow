import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  AIProvider,
  StructuredOutputSchema,
} from "@/application/providers/ai-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";

const extractedExperienceSchema = z.object({
  type: z.literal("EXPERIENCE"),
  title: z.string().min(1).max(160),
  organization: z.string().min(1).max(160),
  description: z.string().max(4_000).nullable(),
  startedAt: z.string().date().nullable(),
  endedAt: z.string().date().nullable(),
  evidenceQuote: z.string().min(1).max(2_000),
});

const extractedSkillSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(1_000).nullable(),
  evidenceQuote: z.string().min(1).max(2_000),
});

const extractedProfileSchema = z.object({
  headline: z.string().min(1).max(160).nullable(),
  summary: z.string().min(1).max(4_000).nullable(),
  seniority: z
    .enum([
      "UNSPECIFIED",
      "INTERN",
      "JUNIOR",
      "MID_LEVEL",
      "SENIOR",
      "LEAD",
      "MANAGER",
      "EXECUTIVE",
    ])
    .nullable(),
  city: z.string().min(1).max(120).nullable(),
  region: z.string().min(1).max(120).nullable(),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable(),
});

const careerInterpretationSchema = z.object({
  profile: extractedProfileSchema,
  experiences: z.array(extractedExperienceSchema).max(40),
});
const skillInterpretationSchema = z.object({
  skills: z.array(extractedSkillSchema).max(120),
});

type CareerInterpretation = z.infer<typeof careerInterpretationSchema>;
type SkillInterpretation = z.infer<typeof skillInterpretationSchema>;

export const resumeCareerOutputSchema: StructuredOutputSchema<CareerInterpretation> =
  {
    name: "resume_career_interpretation",
    jsonSchema: z.toJSONSchema(careerInterpretationSchema) as Record<
      string,
      unknown
    >,
    parse: (value) => careerInterpretationSchema.parse(value),
  };

export const resumeSkillsOutputSchema: StructuredOutputSchema<SkillInterpretation> =
  {
    name: "resume_skills_interpretation",
    jsonSchema: z.toJSONSchema(skillInterpretationSchema) as Record<
      string,
      unknown
    >,
    parse: (value) => skillInterpretationSchema.parse(value),
  };

function normalizeEvidence(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function normalizeIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

export async function interpretActiveResume(
  userId: string,
  provider: AIProvider,
) {
  const prisma = getPrismaClient();
  const resume = await prisma.resume.findFirst({
    where: { userId, isActive: true },
  });
  if (!resume) throw new Error("Currículo mestre não encontrado.");

  const careerResult = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Analise integralmente o currículo e extraia o perfil e todas as experiências profissionais explicitamente descritas. Examine resumo, histórico profissional, projetos, formação, cursos e certificações. Preserve cargos, organizações e realizações relevantes. Produza headline e summary factuais e abrangentes usando somente o documento. Não extraia skills nesta etapa. Use null para localização, datas ou outros campos ausentes; não invente nem estime. Só informe datas quando o dia, mês e ano estiverem explícitos e use YYYY-MM-DD. country deve ser um código ISO 3166-1 alpha-2 maiúsculo. Cada experiência deve conter em evidenceQuote uma citação literal e contínua do currículo que comprove o vínculo; a descrição pode consolidar outras informações explícitas do mesmo vínculo sem criar resultados, números ou responsabilidades.",
      },
      { role: "user", content: resume.extractedText },
    ],
    outputSchema: resumeCareerOutputSchema,
    maxOutputTokens: 6_000,
    temperature: 0,
  });
  const skillResult = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Faça uma auditoria profunda e exaustiva das competências explicitamente presentes no currículo. Procure em TODAS as seções e em cada descrição de experiência, projeto, curso e certificação — não apenas na seção de habilidades. Inclua, quando citados: linguagens de programação; frameworks e bibliotecas; bancos e armazenamento; cloud; DevOps e infraestrutura; testes e qualidade; APIs e protocolos; arquitetura e práticas de engenharia; segurança; dados; sistemas operacionais; ferramentas; metodologias; idiomas; e competências profissionais ou de domínio nomeadas explicitamente. Retorne uma competência atômica por item (por exemplo, TypeScript e Node.js em itens distintos), com nome curto e canônico. Não agrupe várias tecnologias no title, não crie sinônimos como itens adicionais, não infira competência a partir de cargo ou responsabilidade e não estime nível ou tempo de experiência. Cada item deve conter uma evidenceQuote literal e contínua do currículo onde o termo aparece. Revise o documento uma segunda vez antes de finalizar para localizar itens omitidos.",
      },
      { role: "user", content: resume.extractedText },
    ],
    outputSchema: resumeSkillsOutputSchema,
    maxOutputTokens: 8_000,
    temperature: 0,
  });

  const source = normalizeEvidence(resume.extractedText);
  const generatedFacts = [
    ...careerResult.output.experiences.map((fact) => ({
      ...fact,
      aiModel: careerResult.model,
      aiRequestId: careerResult.requestId,
    })),
    ...skillResult.output.skills.map((skill) => ({
      type: "SKILL" as const,
      title: skill.title,
      organization: null,
      description: skill.description,
      startedAt: null,
      endedAt: null,
      evidenceQuote: skill.evidenceQuote,
      aiModel: skillResult.model,
      aiRequestId: skillResult.requestId,
    })),
  ];

  for (const fact of generatedFacts) {
    if (!source.includes(normalizeEvidence(fact.evidenceQuote)))
      throw new Error("A interpretação contém fato sem evidência literal.");
    if (fact.startedAt && fact.endedAt && fact.endedAt < fact.startedAt)
      throw new Error("A interpretação contém datas inválidas.");
  }

  const uniqueFacts = generatedFacts.filter(
    (fact, index, facts) =>
      facts.findIndex(
        (candidate) =>
          candidate.type === fact.type &&
          normalizeIdentity(candidate.title) ===
            normalizeIdentity(fact.title) &&
          normalizeIdentity(candidate.organization ?? "") ===
            normalizeIdentity(fact.organization ?? ""),
      ) === index,
  );

  const profileData = {
    headline: careerResult.output.profile.headline ?? undefined,
    summary: careerResult.output.profile.summary ?? undefined,
    seniority: careerResult.output.profile.seniority ?? undefined,
    city: careerResult.output.profile.city ?? undefined,
    region: careerResult.output.profile.region ?? undefined,
    country: careerResult.output.profile.country ?? undefined,
  };

  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.candidateProfile.upsert({
      where: { userId },
      create: { id: randomUUID(), userId, ...profileData },
      update: profileData,
    });
    await transaction.professionalFact.deleteMany({
      where: {
        profileId: profile.id,
        sourceResumeId: resume.id,
        reviewStatus: "PENDING",
      },
    });

    const existingFacts = await transaction.professionalFact.findMany({
      where: { profileId: profile.id, sourceResumeId: resume.id },
      select: { type: true, title: true, organization: true },
    });
    const newFacts = uniqueFacts.filter(
      (fact) =>
        !existingFacts.some(
          (existing) =>
            existing.type === fact.type &&
            normalizeIdentity(existing.title) ===
              normalizeIdentity(fact.title) &&
            normalizeIdentity(existing.organization ?? "") ===
              normalizeIdentity(fact.organization ?? ""),
        ),
    );

    if (newFacts.length) {
      await transaction.professionalFact.createMany({
        data: newFacts.map((fact) => ({
          id: randomUUID(),
          profileId: profile.id,
          sourceResumeId: resume.id,
          reviewStatus: "PENDING" as const,
          type: fact.type,
          title: fact.title,
          organization: fact.organization,
          description: fact.description,
          startedAt: fact.startedAt
            ? new Date(`${fact.startedAt}T00:00:00.000Z`)
            : null,
          endedAt: fact.endedAt
            ? new Date(`${fact.endedAt}T00:00:00.000Z`)
            : null,
          evidenceQuote: fact.evidenceQuote,
          aiModel: fact.aiModel,
          aiRequestId: fact.aiRequestId,
        })),
      });
    }

    return {
      count: newFacts.length,
      skills: newFacts.filter((fact) => fact.type === "SKILL").length,
      experiences: newFacts.filter((fact) => fact.type === "EXPERIENCE").length,
    };
  });
}

export function reviewProfessionalFact(
  userId: string,
  factId: string,
  decision: "CONFIRMED" | "REJECTED",
) {
  return getPrismaClient().professionalFact.updateMany({
    where: { id: factId, profile: { userId }, reviewStatus: "PENDING" },
    data: { reviewStatus: decision },
  });
}
