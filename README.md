# AppyFlow

Sistema open source, self-hosted e single-user para descoberta inteligente de
vagas e preparação de candidaturas.

O repositório já contém autenticação single-user, currículo mestre, perfil,
preferências, descoberta e matching de vagas, pipeline de candidaturas e geração
bilíngue de currículos em LaTeX e PDF. A automação diária ainda será adicionada.

## Requisitos

- Node.js 24 ou superior;
- npm 11 ou superior;
- Docker com Compose, para execução containerizada.

## Configuração local

Copie o arquivo de exemplo e ajuste as variáveis quando necessário:

```powershell
Copy-Item .env.example .env.local
```

Instale as dependências e inicie o servidor:

```powershell
npm install
npm run dev
```

A aplicação estará disponível em <http://localhost:3000>.

## Primeiro acesso

Ao abrir a aplicação pela primeira vez, acesse <http://localhost:3000/setup> e
cadastre o único usuário da instalação. A senha deve ter entre 12 e 128
caracteres. Depois da configuração inicial, novos cadastros são bloqueados e o
acesso passa a ser feito em <http://localhost:3000/login>.

O botão `Sair` do painel encerra a sessão atual. As sessões também expiram após
sete dias e um novo login invalida sessões anteriores.

## Currículo mestre

Depois de entrar, abra `/curriculos` para enviar o currículo mestre. O formato
inicial aceito é PDF com texto selecionável, até 5 MiB e 30 páginas. O sistema
valida o conteúdo real, extrai o texto para revisão e preserva os uploads
anteriores no histórico.

Os arquivos ficam em armazenamento privado. No ambiente local, o diretório
padrão é `.data/artifacts`; no Docker Compose, o volume `artifacts-data` preserva
os arquivos entre reinicializações.

## Perfil profissional

Em `/perfil`, o usuário registra título profissional, senioridade, localização,
resumo, skills e experiências confirmadas. Nesta etapa os dados são informados
manualmente ou extraídos do currículo com OpenAI ou Groq. Fatos
extraídos ficam pendentes e exigem confirmação; cada um preserva uma citação
literal do currículo como evidência.

A interpretação executa duas análises focadas: uma para perfil e experiências e
outra para auditar competências em todas as seções do PDF. Tecnologias citadas em
projetos e descrições de experiências também são consideradas, com uma skill por
item e deduplicação antes da revisão.

Para habilitar a interpretação, configure `AI_PROVIDER=openai` ou
`AI_PROVIDER=groq`, além de `AI_API_KEY` e `AI_MODEL`. As chamadas usam saída
estruturada e desativam o armazenamento da resposta no provedor. Outros nomes de
provider permanecem reservados para adapters futuros.

## Preferências profissionais

Em `/preferencias`, o usuário pode registrar cargos, senioridades, modalidades de
trabalho, localizações, idiomas e tecnologias desejadas. Também é possível
informar pretensão salarial e excluir empresas ou termos. Campos vazios representam
preferências ainda não informadas e não devem eliminar vagas em etapas futuras.

## Queries de busca

Em `/queries`, o sistema gera consultas determinísticas usando o perfil e as
preferências. Quando o provider de IA está habilitado, também pode sugerir um
conjunto pequeno de consultas estruturadas. Todas são normalizadas, deduplicadas
por perfil e registradas para execução pelo worker de busca.

Os adapters de busca disponíveis são Serper e SerpApi. Configure
`SEARCH_PROVIDER=serper` ou `SEARCH_PROVIDER=serpapi` e informe a credencial em
`SEARCH_API_KEY`. Ambos usam timeout, repetem uma vez somente em falhas
transitórias, limitam cada página a dez resultados e não expõem a chave em
mensagens de erro. O worker conecta o adapter selecionado à normalização,
deduplicação, filtragem, matching e persistência das vagas.

Na SerpApi, a busca usa resultados estruturados do Google Jobs. Cada item contém
uma vaga individual, descrição e link de candidatura obtido de `apply_options`;
páginas genéricas de pesquisa do LinkedIn, Indeed e outros portais não são salvas
como oportunidades. Quando existe uma opção direta do LinkedIn, ela é priorizada.
Datas relativas são convertidas, resultados comprovadamente anteriores a 30 dias
são descartados e os mais recentes aparecem primeiro.

Depois de gerar as queries, o botão `Buscar vagas agora` em `/queries` ou no
dashboard executa um ciclo único e registra seu resultado no histórico. Essa
ação não ativa a busca automática.

Os resultados do contrato de busca podem ser convertidos para o modelo interno de
vaga, com título, empresa, descrição, localização, modalidade, URL, fonte, data
publicada e instante de descoberta. Campos ausentes continuam desconhecidos e
datas relativas reconhecidas são convertidas tomando o instante da busca como
referência.

URLs de vagas são canonicalizadas removendo fragmentos, parâmetros conhecidos de
rastreamento e diferenças semânticas irrelevantes. Um fingerprint conservador
une a mesma oportunidade por perfil quando existem sinais suficientes, enquanto
`JobOccurrence` preserva cada query, fonte, URL original e instante de descoberta.

Em `/fontes`, cada domínio descoberto apresenta provider, classificação, primeira
e última observação, total de ocorrências e vagas únicas. Snapshots imutáveis
preservam a evolução dessas métricas, e uma pontuação determinística classifica a
qualidade observada da fonte. A pessoa pode priorizar um domínio, mantê-lo no
tratamento padrão ou bloqueá-lo. Fontes bloqueadas deixam de produzir novas vagas;
as priorizadas aparecem primeiro sem alterar o matching profissional.

## Worker de busca

Com PostgreSQL e um provider de busca configurados, execute manualmente um ciclo
completo:

```powershell
npm run worker:search
```

No Docker Compose, o worker é um serviço opcional e não inicia junto da aplicação:

```powershell
docker compose --profile worker run --rm worker
```

As queries são processadas sequencialmente. Uma falha isolada não impede as
demais buscas; o resumo é emitido como JSON e o processo retorna código diferente
de zero quando alguma etapa falha.

O horário diário, fuso e limites são configurados em `/preferencias`. O
agendamento começa desativado. Para manter o scheduler em execução localmente:

```powershell
npm run worker:scheduler
```

No Compose:

```powershell
docker compose --profile scheduler up -d scheduler
```

Cada ciclo reivindicado é registrado com status, contadores e falhas sanitizadas.

## Docker Compose

```powershell
docker compose up --build
```

O Compose inicia a aplicação e o PostgreSQL. A integração com o banco é
configurada automaticamente e as migrations são aplicadas antes do servidor
iniciar. Os serviços `worker` e `scheduler` são executados somente quando seus
profiles correspondentes são solicitados.

Para encerrar os containers sem remover os dados:

```powershell
docker compose down
```

## Verificações de qualidade

```powershell
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

O teste de integração cria um PostgreSQL isolado na porta `5433`, aplica as
migrations, executa os testes e remove o container e seus dados ao terminar.

## Banco de dados

Com o PostgreSQL configurado em `DATABASE_URL`:

```powershell
npm run db:generate
npm run db:migrate:dev
npm run db:migrate:deploy
npm run db:studio
```

- `db:migrate:dev`: cria/aplica migrations durante o desenvolvimento;
- `db:migrate:deploy`: aplica migrations já versionadas em outros ambientes;
- `db:studio`: abre a ferramenta de inspeção do Prisma.

O modelo contém o usuário principal da instalação e suas sessões. A senha é
armazenada somente como hash Argon2id; tokens de sessão também não são persistidos
em texto puro.

## Health checks

- `GET /api/health/live`: confirma que o processo está respondendo;
- `GET /api/health/ready`: valida a configuração e a conexão com PostgreSQL.

## Variáveis de ambiente

| Variável          | Obrigatória | Finalidade                                                          |
| ----------------- | ----------- | ------------------------------------------------------------------- |
| `APP_URL`         | sim         | URL pública da instalação                                           |
| `DATABASE_URL`    | sim         | conexão com PostgreSQL                                              |
| `ARTIFACTS_DIR`   | não         | diretório privado de uploads e artefatos                            |
| `AI_PROVIDER`     | não         | `disabled`, `openai`, `groq`, `gemini`, `anthropic` ou `openrouter` |
| `AI_API_KEY`      | condicional | chave server-side quando o provider de IA é habilitado              |
| `AI_MODEL`        | condicional | modelo usado pelo provider de IA                                    |
| `SEARCH_PROVIDER` | não         | `disabled`, `serpapi` ou `serper`                                   |
| `SEARCH_API_KEY`  | condicional | chave server-side quando a busca é habilitada                       |

Os providers ficam desabilitados por padrão. Os adapters disponíveis são OpenAI e
Groq para interpretação e geração estruturada, além de Serper e SerpApi para
pesquisa. Os demais nomes configuráveis permanecem reservados para adapters
futuros.

Nunca versione `.env` ou `.env.local`. O arquivo `.env.example` contém apenas
valores seguros para desenvolvimento.

## Estrutura inicial

```text
src/app/            interface e endpoints HTTP
src/application/    casos de uso e contratos internos
src/domain/         regras determinísticas do domínio
src/infrastructure/ integrações técnicas, incluindo PostgreSQL
src/server/         configuração e serviços server-side
src/worker/         entrypoints dos processos de background
prisma/             schema e migrations versionadas
templates/          templates oficiais de currículo
docs/               documentação funcional e técnica
public/             assets públicos
```

## Documentação

- [Visão funcional](docs/documentacao-funcional.md)
- [Documentação técnica](docs/documentacao-tecnica.md)

## Licença

A licença open source será definida antes da primeira versão pública.
