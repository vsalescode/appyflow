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

const extractedProjectSchema = z.object({
  type: z.literal("PROJECT"),
  title: z.string().min(1).max(160),
  organization: z.string().max(160).nullable(),
  description: z.string().max(4_000).nullable(),
  startedAt: z.string().date().nullable(),
  endedAt: z.string().date().nullable(),
  evidenceQuote: z.string().min(1).max(2_000),
});

const extractedLanguageSchema = z.object({
  title: z.string().min(1).max(160),
  proficiency: z.string().max(160).nullable(),
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

const resumeInterpretationSchema = z.object({
  profile: extractedProfileSchema,
  experiences: z.array(extractedExperienceSchema).max(40),
  projects: z.array(extractedProjectSchema).max(40),
  languages: z.array(extractedLanguageSchema).max(30),
});
const skillInterpretationSchema = z.object({
  skills: z.array(extractedSkillSchema).max(120),
});

type ResumeInterpretation = z.infer<typeof resumeInterpretationSchema>;
type SkillInterpretation = z.infer<typeof skillInterpretationSchema>;

export const resumeInterpretationOutputSchema: StructuredOutputSchema<ResumeInterpretation> =
  {
    name: "resume_deep_interpretation",
    jsonSchema: z.toJSONSchema(resumeInterpretationSchema) as Record<
      string,
      unknown
    >,
    parse: (value) => resumeInterpretationSchema.parse(value),
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
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}+#]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeIdentity(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

const genericSkillTitles = new Set([
  "backend",
  "frontend",
  "full stack",
  "integration",
  "integracao",
  "integracoes",
]);

const skillAliases = new Map<string, string>([
  ["rest", "APIs REST"],
  ["rest api", "APIs REST"],
  ["rest apis", "APIs REST"],
  ["api rest", "APIs REST"],
  ["apis rest", "APIs REST"],
  ["authentication", "Autenticação"],
  ["autenticacao", "Autenticação"],
  ["authorization", "Autorização"],
  ["autorizacao", "Autorização"],
  ["metodologias ageis", "Agile"],
  ["metodos ageis", "Agile"],
]);

function canonicalSkillTitle(title: string, evidence = "") {
  const identity = normalizeIdentity(title);
  if (genericSkillTitles.has(identity)) return null;
  const normalizedEvidence = normalizeIdentity(evidence);
  const isAuthentication = ["auth", "authentication", "autenticacao"].includes(
    identity,
  );
  const isAuthorization = ["authorization", "autorizacao"].includes(identity);
  const evidenceCombinesBoth =
    /\b(authentication|autenticacao)\b/.test(normalizedEvidence) &&
    /\b(authorization|autorizacao)\b/.test(normalizedEvidence);
  if ((isAuthentication || isAuthorization) && evidenceCombinesBoth)
    return "Autenticação e autorização";
  if (identity === "auth") return "Autenticação";
  return skillAliases.get(identity) ?? title.trim();
}

function factIdentity(fact: {
  type: string;
  title: string;
  organization?: string | null;
}) {
  const title =
    fact.type === "SKILL"
      ? (canonicalSkillTitle(fact.title) ?? fact.title)
      : fact.title;
  const organization =
    fact.type === "EXPERIENCE" ? (fact.organization ?? "") : "";
  return [fact.type, title, organization].map(normalizeIdentity).join("|");
}

const explicitLanguagePattern =
  /\b(Portugu[eê]s|Ingl[eê]s|Espanhol|Franc[eê]s|Alem[aã]o|Italiano|Mandarim|Japon[eê]s|Coreano|Russo|Árabe|English|Portuguese|Spanish|French|German|Italian|Mandarin|Japanese|Korean|Russian|Arabic)\s*[:\-–]\s*(Nativo|Fluente|Avan[cç]ado|Intermedi[aá]rio|B[aá]sico|Native|Fluent|Advanced|Intermediate|Basic)\b/giu;

export function extractExplicitLanguages(text: string) {
  return [...text.matchAll(explicitLanguagePattern)].map((match) => ({
    title: match[1]!,
    proficiency: match[2]!,
    evidenceQuote: match[0],
  }));
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

  const result = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Analise integralmente o currículo antes de responder. PERFIL: produza headline e summary factuais e abrangentes; extraia senioridade e localização somente quando explícitas. EXPERIÊNCIAS PROFISSIONAIS: extraia somente vínculos de trabalho, estágio ou prestação profissional explicitamente apresentados como experiência, preservando cargos, organizações, responsabilidades e realizações. Não classifique projeto pessoal, acadêmico, de portfólio ou open source como experiência profissional. PROJETOS: extraia separadamente todos os projetos pessoais, acadêmicos, de portfólio e open source. GitHub, repositório, site publicado ou nome de produto não representam empregador. IDIOMAS: extraia todos os idiomas humanos separadamente, preservando o nível explícito em proficiency. REGRAS DE EVIDÊNCIA: use somente informações presentes no documento; nunca invente, complete ou estime. Cada experiência, projeto e idioma deve conter uma evidenceQuote literal e contínua do currículo. Use null para campos ausentes. Só informe datas quando dia, mês e ano estiverem explícitos, no formato YYYY-MM-DD. country deve ser ISO 3166-1 alpha-2 maiúsculo.",
      },
      { role: "user", content: resume.extractedText },
    ],
    outputSchema: resumeInterpretationOutputSchema,
    maxOutputTokens: 3_000,
    temperature: 0,
  });
  const skillResult = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Faça uma auditoria profunda e exaustiva das competências explicitamente presentes no currículo. Procure em TODAS as seções e em cada descrição de experiência, projeto, curso e certificação — não apenas na seção de habilidades. Inclua, quando citados: linguagens de programação; frameworks e bibliotecas; bancos e armazenamento; cloud; DevOps e infraestrutura; testes e qualidade; APIs e protocolos; arquitetura e práticas de engenharia; segurança; dados; sistemas operacionais; ferramentas; metodologias; e competências profissionais ou de domínio nomeadas explicitamente. Não inclua idiomas humanos. Retorne uma competência atômica por item, com nome curto e canônico. Não crie rótulos genéricos como Backend, Frontend, Full stack, Integration ou Auth quando a evidência já nomear competências específicas. Quando autenticação e autorização estiverem juntas na mesma evidência, retorne um único item chamado Autenticação e autorização. Não selecione apenas exemplos representativos: enumere TODOS os termos de listas separadas por vírgula, marcador ou barra vertical, mesmo que existam dezenas. Não agrupe tecnologias, não crie sinônimos adicionais e não infira competência apenas pelo cargo. Cada skill deve conter uma evidenceQuote literal e contínua do currículo; a citação pode ser a linha completa que contém a competência. Revise o documento uma segunda vez e confira cada lista para localizar omissões.",
      },
      { role: "user", content: resume.extractedText },
    ],
    outputSchema: resumeSkillsOutputSchema,
    maxOutputTokens: 4_000,
    temperature: 0,
  });

  const source = normalizeEvidence(resume.extractedText);
  const generatedFacts = [
    ...result.output.experiences.map((fact) => ({
      ...fact,
      aiModel: result.model,
      aiRequestId: result.requestId,
    })),
    ...result.output.projects.map((fact) => ({
      ...fact,
      aiModel: result.model,
      aiRequestId: result.requestId,
    })),
    ...[
      ...result.output.languages,
      ...extractExplicitLanguages(resume.extractedText),
    ].map((language) => ({
      type: "LANGUAGE" as const,
      title: language.title,
      organization: null,
      description: language.proficiency,
      startedAt: null,
      endedAt: null,
      evidenceQuote: language.evidenceQuote,
      aiModel: result.model,
      aiRequestId: result.requestId,
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
  ]
    .map((fact) => {
      if (fact.type !== "SKILL") return fact;
      const title = canonicalSkillTitle(fact.title, fact.evidenceQuote);
      return title ? { ...fact, title } : null;
    })
    .filter((fact) => fact !== null);

  const validatedFacts = generatedFacts.filter(
    (fact) =>
      source.includes(normalizeEvidence(fact.evidenceQuote)) &&
      !(fact.startedAt && fact.endedAt && fact.endedAt < fact.startedAt),
  );
  if (generatedFacts.length && !validatedFacts.length)
    throw new Error(
      "A interpretação não contém fatos com evidência verificável.",
    );

  const uniqueFacts = validatedFacts.filter(
    (fact, index, facts) =>
      facts.findIndex(
        (candidate) => factIdentity(candidate) === factIdentity(fact),
      ) === index,
  );

  const profileData = {
    headline: result.output.profile.headline ?? undefined,
    summary: result.output.profile.summary ?? undefined,
    seniority: result.output.profile.seniority ?? undefined,
    city: result.output.profile.city ?? undefined,
    region: result.output.profile.region ?? undefined,
    country: result.output.profile.country ?? undefined,
  };

  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.candidateProfile.upsert({
      where: { userId },
      create: { id: randomUUID(), userId, ...profileData },
      update: profileData,
    });
    const existingFacts = await transaction.professionalFact.findMany({
      where: { profileId: profile.id },
      select: { type: true, title: true, organization: true },
    });
    const newFacts = uniqueFacts.filter(
      (fact) =>
        !existingFacts.some(
          (existing) => factIdentity(existing) === factIdentity(fact),
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
      projects: newFacts.filter((fact) => fact.type === "PROJECT").length,
      languages: newFacts.filter((fact) => fact.type === "LANGUAGE").length,
      discarded: generatedFacts.length - validatedFacts.length,
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

export function confirmAllPendingProfessionalFacts(userId: string) {
  return getPrismaClient().professionalFact.updateMany({
    where: { profile: { userId }, reviewStatus: "PENDING" },
    data: { reviewStatus: "CONFIRMED" },
  });
}
