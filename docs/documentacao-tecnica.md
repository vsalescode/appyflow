# Documentação técnica do AppyFlow

Este documento apresenta a arquitetura encontrada no repositório, os fluxos já
implementados e os limites técnicos atuais. Para conhecer o produto pela
perspectiva de uso, consulte a [documentação funcional](documentacao-funcional.md).

## Visão geral

O AppyFlow é uma aplicação web open source, self-hosted e single-user para apoiar
a descoberta de vagas e a preparação de candidaturas. O repositório contém um
monólito modular em Next.js e TypeScript, com PostgreSQL como fonte de verdade e
Prisma para acesso ao banco.

O sistema é executável localmente com Node.js ou com Docker Compose. Integrações
externas ficam atrás de contratos internos e suas credenciais permanecem no
servidor.

### Stack atual

| Área | Tecnologia |
| --- | --- |
| Aplicação web | Next.js 16, React 19 e TypeScript |
| Estilos | Tailwind CSS |
| Banco de dados | PostgreSQL 17 |
| ORM e migrations | Prisma 7 |
| Validação | Zod |
| Senhas | Argon2id |
| Testes | Vitest |
| PDF de entrada | PDF.js |
| Containers | Docker e Docker Compose |
| IA implementada | OpenAI Responses API |
| Busca implementada | Serper |

## Arquitetura do repositório

```text
Navegador
   |
   | HTTP + cookie de sessão
   v
Next.js App Router
   |-- páginas e layouts
   |-- Route Handlers
   |
   v
Serviços de aplicação
   |-- autenticação
   |-- currículo mestre
   |-- perfil e preferências
   |-- geração de queries
   |-- normalização e deduplicação de vagas
   |
   +--> regras de domínio
   +--> contratos de providers e storage
   +--> Prisma Client --> PostgreSQL
   +--> adapters externos
          |-- OpenAI
          |-- Serper
          `-- filesystem privado

Worker de busca
   `-- query -> search -> normalize -> deduplicate -> filter -> match -> persist
```

O navegador não recebe chaves de providers e não chama APIs externas diretamente.
Route Handlers autenticam o usuário, validam a origem das mutações e delegam o
trabalho aos serviços de aplicação.

### Diretórios principais

```text
src/app/                    páginas, layouts e endpoints HTTP
src/application/            casos de uso e contratos internos
src/domain/                 validações e regras sem dependência da interface
src/infrastructure/         autenticação, Prisma, providers e storage
src/server/                 configuração e health checks
src/worker/                 entrypoints dos processos de background
prisma/schema.prisma        modelo atual do banco
prisma/migrations/          histórico versionado de migrations
scripts/                    rotinas de build e testes de integração
docs/                       documentação funcional e técnica
public/                     arquivos públicos da aplicação
```

Existem um worker executável sob demanda e um scheduler que consulta agendamentos
devidos a cada minuto. Não há fila, Redis ou microsserviços.

## Execução local

Requisitos:

- Node.js 24 ou superior;
- npm 11 ou superior;
- PostgreSQL acessível pela `DATABASE_URL`;
- Docker, caso sejam usados Compose ou testes de integração.

Preparação básica:

```powershell
Copy-Item .env.example .env.local
npm install
npm run db:migrate:deploy
npm run dev
```

A aplicação fica disponível em `http://localhost:3000` por padrão. No primeiro
acesso, `/setup` cria o único usuário permitido pela instalação.

### Docker Compose

```powershell
docker compose up --build
```

O Compose inicia três componentes:

- `database`: PostgreSQL com volume persistente;
- `migrate`: aplica migrations e termina;
- `app`: inicia o servidor após a conclusão das migrations.

Os serviços opcionais `worker` e `scheduler` usam um target próprio da imagem e
só são iniciados pelos profiles correspondentes.

Uploads são armazenados no volume privado `artifacts-data`. O banco utiliza o
volume `postgres-data`.

## Configuração

As variáveis aceitas estão documentadas em `.env.example`.

| Variável | Uso |
| --- | --- |
| `APP_URL` | origem pública confiável da aplicação |
| `DATABASE_URL` | conexão PostgreSQL |
| `ARTIFACTS_DIR` | diretório privado para currículos e artefatos |
| `AI_PROVIDER` | `disabled`, `openai` ou nome reservado para adapter futuro |
| `AI_API_KEY` | credencial server-side do provider de IA |
| `AI_MODEL` | modelo usado pelo adapter de IA |
| `SEARCH_PROVIDER` | `disabled`, `serper` ou `serpapi` |
| `SEARCH_API_KEY` | credencial server-side do provider de busca |

Providers ficam desabilitados por padrão. Se um provider for habilitado, sua
credencial passa a ser obrigatória. Variáveis com credenciais não usam o prefixo
`NEXT_PUBLIC_`.

## Autenticação e autorização

A instalação aceita exatamente um usuário:

1. `/setup` cria o primeiro usuário;
2. tentativas posteriores de setup são recusadas;
3. `/login` valida a senha com Argon2id;
4. um novo login invalida sessões anteriores;
5. `/logout` revoga a sessão atual.

O token de sessão é aleatório e somente seu hash é persistido. O navegador recebe
um cookie `HttpOnly`, `SameSite=Lax`, restrito ao path raiz e marcado como
`Secure` em produção. Layouts privados verificam a sessão no servidor. Endpoints
de mutação também validam a origem contra `APP_URL`.

## Currículo mestre e armazenamento

O upload inicial aceita PDF com texto selecionável, no máximo 5 MiB e 30 páginas.
Antes da persistência, o sistema verifica assinatura, tipo, tamanho e conteúdo.

O arquivo recebe uma chave opaca e fica fora da pasta pública. O adapter atual usa
filesystem local por meio do contrato `ArtifactStorage`. Metadados, checksum e
texto extraído ficam no PostgreSQL. Uploads anteriores são preservados e somente
um currículo permanece ativo.

## Perfil, fatos e interpretação por IA

`CandidateProfile` armazena título, resumo, senioridade e localização. Skills e
experiências são representadas por `ProfessionalFact`.

Fatos cadastrados manualmente começam confirmados. A interpretação por IA usa o
contrato `AIProvider` e o adapter da OpenAI. A chamada:

- usa saída JSON com schema estrito;
- desativa o armazenamento da resposta no provider;
- limita a quantidade de saída;
- exige que cada fato contenha uma citação literal do currículo.

Fatos derivados por IA começam como `PENDING` e precisam ser confirmados ou
rejeitados. Modelo, request ID, currículo de origem e evidência são mantidos para
auditoria.

## Preferências profissionais

Existe um conjunto de preferências por perfil. O modelo contém cargos,
senioridades, modalidades, localizações, idiomas, tecnologias, salário mínimo,
moeda, empresas excluídas e termos excluídos.

Listas são aparadas e deduplicadas sem diferenciar maiúsculas. Salário e moeda
devem ser informados juntos. Campos vazios significam informação desconhecida,
não rejeição automática.

## Queries e provider de busca

O gerador determinístico combina cargo, modalidade, localização e tecnologias.
Também existe geração opcional por IA com saída estruturada. Queries são
normalizadas e possuem unicidade por perfil.

O contrato `SearchProvider` recebe query, país, idioma, página e limite. Os
adapters Serper e SerpApi implementam:

- autenticação server-side;
- timeout de dez segundos;
- uma repetição para HTTP 429 e erros 5xx;
- nenhuma repetição para erro de autenticação;
- limite de dez resultados por página;
- validação da resposta externa;
- erros internos sem exposição da chave.

O Serper recebe a página diretamente. A SerpApi recebe um deslocamento; seu
adapter converte a página para `start = (page - 1) * limit` e traduz
`organic_results` para o modelo comum. O identificador retornado por cada serviço
é preservado em `requestId`, quando disponível. O worker conhece apenas o
contrato e seleciona o adapter por `SEARCH_PROVIDER`.

### Worker de busca

O comando `npm run worker:search` carrega todas as queries cadastradas e as
processa sequencialmente. Cada resultado passa pela normalização, deduplicação e
persistência já existentes; ao final de cada perfil, filtros rápidos e matching
determinístico são recalculados. Falhas são isoladas por query e apresentadas em
um resumo JSON sem conteúdo de vagas ou credenciais.

No Compose, a execução manual usa:

```powershell
docker compose --profile worker run --rm worker
```

O horário, fuso IANA, ativação, máximo de queries e resultados por query são
configurados em `/preferencias`. O scheduler reivindica cada execução de forma
atômica, calcula o próximo horário e registra status e contadores em `SearchRun`.
Ele é iniciado com `npm run worker:scheduler` ou pelo profile `scheduler` do
Compose.

## Normalização e deduplicação de vagas

Resultados de busca são transformados em campos internos de vaga. Dados ausentes
permanecem nulos e datas relativas não são convertidas especulativamente.

URLs são canonicalizadas com estas regras:

- somente `http` e `https` são aceitos;
- fragmentos são removidos;
- parâmetros conhecidos de rastreamento são descartados;
- parâmetros restantes são ordenados;
- barras finais redundantes são removidas.

`Job` representa a oportunidade deduplicada. `JobOccurrence` preserva cada URL,
query, fonte e instante de descoberta. O fingerprint SHA-256 usa cargo, empresa e
localização quando os três sinais estão presentes. Quando faltam sinais, a URL
canônica é usada para evitar uniões excessivas.

Fontes possuem estado `DEFAULT`, `PRIORITIZED` ou `BLOCKED`. O estado é alterado
somente por uma pessoa autenticada que tenha ocorrências associadas à fonte.
Resultados vindos de uma fonte bloqueada são contabilizados, mas não criam vaga
nem ocorrência. Vagas que só possuam fontes bloqueadas não aparecem no dashboard
nem entram no matching. A priorização altera apenas a ordenação de apresentação,
sem aumentar artificialmente a compatibilidade da vaga.

## Modelo de dados atual

| Entidade | Responsabilidade |
| --- | --- |
| `User` | usuário único da instalação |
| `Session` | sessão opaca armazenada como hash |
| `Resume` | upload e texto extraído do currículo mestre |
| `CandidateProfile` | dados estruturados do candidato |
| `ProfessionalFact` | skill ou experiência com revisão e evidência |
| `Preference` | critérios profissionais do usuário |
| `SearchQuery` | consulta determinística ou gerada por IA |
| `Source` | provider e domínio de origem |
| `Job` | oportunidade normalizada e deduplicada |
| `JobOccurrence` | proveniência de cada resultado observado |
| `JobMatch` | score, classificação e explicações da compatibilidade |
| `Application` | estado atual da candidatura |
| `ResumeVersion` | conteúdo e artefatos imutáveis do currículo personalizado |
| `SearchSchedule` | horário, fuso, ativação e limites da busca diária |
| `SearchRun` | histórico e resumo de cada execução agendada |

O arquivo `prisma/schema.prisma` é a referência definitiva para campos,
constraints e relações. Mudanças de banco são entregues exclusivamente por
migrations versionadas.

## Health checks

- `GET /api/health/live` confirma que o processo responde;
- `GET /api/health/ready` verifica configuração e conexão com PostgreSQL.

O Dockerfile usa o endpoint de liveness. O readiness não retorna secrets nem
detalhes internos da conexão.

## Testes e qualidade

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm audit --omit=dev
```

Testes unitários não dependem de rede nem consomem créditos de providers. Testes
de integração iniciam um PostgreSQL descartável na porta 5433, aplicam todas as
migrations, executam os testes serialmente e removem container e volume ao final.

Arquivos `*.integration.test.ts` são executados apenas pela configuração de
integração. Os demais testes usam a configuração padrão do Vitest.

## Segurança

As proteções implementadas incluem:

- credenciais exclusivamente server-side;
- hash Argon2id para senhas;
- hash para tokens de sessão;
- verificação de origem em mutações;
- uploads privados com validação de conteúdo;
- validação por schema das respostas externas;
- timeouts e erros sanitizados nos adapters;
- execução do container como usuário não-root;
- migrations executadas antes da aplicação no Compose.

Descrições de vagas, currículos e respostas de providers são tratados como dados
não confiáveis. Eles não podem escolher ferramentas, comandos ou credenciais.

## Funcionalidades ainda não implementadas

Os seguintes componentes fazem parte da direção do produto, mas não estão no
repositório como fluxos completos:

- deploy no Render;
- observabilidade operacional completa;
- segundo adapter de IA ou busca.

Essa separação evita que decisões planejadas sejam confundidas com capacidades
disponíveis na versão atual.
