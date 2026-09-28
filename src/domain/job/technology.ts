const technologyAliases = new Map<string, readonly string[]>([
  [".NET", [".net", "dotnet"]],
  ["ASP.NET Core", ["asp.net core", "aspnet core"]],
  ["Angular", ["angular"]],
  ["Azure", ["azure"]],
  ["Blip", ["blip"]],
  ["Bootstrap", ["bootstrap"]],
  ["C#", ["c#", "c sharp"]],
  ["CSS", ["css"]],
  ["Dialogflow", ["dialogflow"]],
  ["Docker", ["docker"]],
  ["Fastify", ["fastify"]],
  ["Git", ["git"]],
  ["GitHub Actions", ["github actions"]],
  ["HTML", ["html"]],
  ["Java", ["java"]],
  ["JavaScript", ["javascript"]],
  ["Jest", ["jest"]],
  ["JUnit", ["junit", "junit 5"]],
  ["JWT", ["jwt"]],
  ["Lua", ["lua"]],
  ["MongoDB", ["mongodb"]],
  ["MySQL", ["mysql"]],
  ["Node.js", ["node.js", "nodejs"]],
  ["OpenFeign", ["openfeign"]],
  ["PostgreSQL", ["postgresql", "postgres"]],
  ["Prisma", ["prisma"]],
  ["Python", ["python"]],
  ["React", ["react"]],
  ["Socket.IO", ["socket.io", "socketio"]],
  ["Spring Boot", ["spring boot"]],
  ["Spring Data JPA", ["spring data jpa"]],
  ["SQL Server", ["sql server"]],
  ["Swagger/OpenAPI", ["swagger", "openapi"]],
  ["Tailwind CSS", ["tailwind css", "tailwind"]],
  ["TypeScript", ["typescript"]],
  ["Vitest", ["vitest"]],
  ["Watson", ["watson"]],
  ["WebRTC", ["webrtc"]],
  ["n8n", ["n8n"]],
]);

export function findKnownTechnologies(text: string) {
  const normalized = foldTechnologyText(text);
  return [...technologyAliases]
    .filter(([, aliases]) =>
      aliases.some((alias) => includesTechnology(normalized, alias)),
    )
    .map(([canonical]) => canonical);
}

export function confirmedKnownTechnologies(skills: readonly string[]) {
  const confirmed = new Set<string>();
  for (const skill of skills) {
    const normalized = foldTechnologyText(skill);
    for (const [canonical, aliases] of technologyAliases)
      if (aliases.some((alias) => normalized === foldTechnologyText(alias)))
        confirmed.add(canonical);
  }
  return [...confirmed];
}

export function hasTechnology(
  technologies: readonly string[],
  required: string,
) {
  const normalizedRequired = foldTechnologyText(required);
  return confirmedKnownTechnologies(technologies).some(
    (technology) => foldTechnologyText(technology) === normalizedRequired,
  );
}

function includesTechnology(normalizedText: string, term: string) {
  const normalizedTerm = foldTechnologyText(term);
  return ` ${normalizedText} `.includes(` ${normalizedTerm} `);
}

function foldTechnologyText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}
