# Documentação funcional do AppyFlow

Este documento explica o que o AppyFlow oferece, como a pessoa usuária interage
com o sistema e quais capacidades estão disponíveis no repositório atual.

## O que é o AppyFlow

O AppyFlow é uma aplicação open source e self-hosted para organizar informações
profissionais, descobrir oportunidades e reduzir o trabalho repetitivo de uma
busca por emprego.

A aplicação é single-user: cada instalação pertence a uma única pessoa. Não há
cadastro público, equipes, cobrança ou envio automático de candidaturas.

## O que está disponível

| Capacidade | Situação |
| --- | --- |
| Primeiro acesso e login | disponível |
| Currículo mestre em PDF | disponível |
| Perfil, skills e experiências | disponível |
| Interpretação assistida por IA | disponível quando configurada |
| Preferências profissionais | disponível |
| Geração de queries de busca | disponível |
| Integração de busca com Serper | adapter disponível |
| Normalização e deduplicação de vagas | disponível pelo worker |
| Dashboard de vagas e matching | disponível |
| Pipeline de candidaturas | disponível |
| Currículo personalizado e PDF | disponível pela API e histórico |
| Execução manual do pipeline de busca | disponível pela interface e pelo worker |
| Busca diária automática | disponível quando o scheduler está ativo |
| Priorização e bloqueio de fontes | disponível em `/fontes` |

## Jornada atual

### 1. Configurar a instalação

No primeiro acesso, a pessoa abre `/setup` e cria o usuário principal. A senha
precisa ter entre 12 e 128 caracteres. Depois disso, novos cadastros são
bloqueados e o acesso passa a ocorrer por `/login`.

Existe apenas uma sessão ativa por vez. Um novo login invalida sessões anteriores
e o botão `Sair` encerra a sessão atual.

### 2. Enviar o currículo mestre

Em `/curriculos`, a pessoa envia seu currículo principal em PDF. O arquivo deve:

- possuir texto selecionável;
- ter no máximo 5 MiB;
- conter até 30 páginas;
- ser realmente um PDF, independentemente do nome do arquivo.

O sistema extrai o texto para uso estruturado e mantém os envios anteriores no
histórico. O currículo mais recente passa a ser o ativo. Os arquivos não são
publicados e downloads exigem autenticação.

### 3. Construir o perfil profissional

Em `/perfil`, podem ser registrados:

- título profissional;
- resumo;
- senioridade;
- cidade, região e país;
- skills;
- experiências, organizações e datas.

Informações inseridas manualmente são consideradas confirmadas. Experiências
precisam informar a organização, e a data final não pode ser anterior à inicial.

### 4. Interpretar o currículo com IA

Quando um provider de IA está configurado, o currículo ativo pode preencher
título, resumo, senioridade e localização, além de sugerir skills e experiências.
Cada fato sugerido precisa apontar uma evidência literal existente no texto do
PDF.

Sugestões da IA não são tratadas como verdade automaticamente. Elas ficam
pendentes até a pessoa confirmar ou rejeitar cada item. O sistema registra a
origem da evidência e informações técnicas da geração para auditoria.

Se a IA estiver desabilitada, o perfil continua utilizável por preenchimento
manual.

### 5. Informar preferências profissionais

Em `/preferencias`, a pessoa pode informar:

- cargos desejados;
- senioridades aceitas;
- trabalho remoto, híbrido ou presencial;
- localizações;
- idiomas;
- tecnologias;
- salário mínimo e moeda;
- empresas excluídas;
- termos excluídos.

Salário e moeda devem ser preenchidos juntos. Itens repetidos são removidos. Um
campo vazio significa “não informado”, e não uma proibição implícita.

### 6. Gerar queries de busca

Em `/queries`, o sistema cria consultas a partir do perfil e das preferências.
Existem duas opções:

- geração determinística, sem custo de IA;
- geração assistida por IA, quando configurada.

As consultas são normalizadas e repetidas não são cadastradas novamente. Termos
explicitamente excluídos pela pessoa também são removidos das sugestões da IA.

A tela apresenta as queries registradas e sua origem. O botão `Buscar vagas
agora`, disponível em `/queries` e no dashboard, executa um ciclo único sem
ativar o agendamento automático. O resultado é registrado no histórico de
execuções.

## Descoberta e tratamento de vagas

O repositório contém adapters para receber resultados do Serper ou da SerpApi. A
instalação escolhe um deles por configuração, e o restante do fluxo recebe o mesmo
formato interno independentemente do serviço selecionado.

Quando um resultado é processado, o sistema pode normalizar:

- título;
- empresa;
- descrição resumida;
- localização;
- modalidade de trabalho;
- URL;
- fonte;
- data de publicação;
- instante em que foi descoberto.

Informação ausente permanece desconhecida. Por exemplo, uma data como “há dois
dias” é preservada como texto, mas não é convertida em uma data exata sem base
confiável.

### Deduplicação

A mesma oportunidade pode aparecer em diferentes sites ou com links que variam
apenas por parâmetros de rastreamento. O AppyFlow separa dois conceitos:

- `Job`: a oportunidade identificada pelo sistema;
- `JobOccurrence`: cada aparição da oportunidade em uma query, URL e fonte.

Assim, uma vaga pode ser exibida uma única vez sem perder seus links de origem.
A deduplicação é conservadora: quando faltam sinais suficientes, os resultados
permanecem separados para evitar esconder oportunidades diferentes.

## Regras funcionais

1. Cada instalação aceita somente um usuário.
2. Não existe cadastro público.
3. Credenciais de IA e busca nunca são enviadas ao navegador.
4. Sugestões de fatos feitas por IA exigem evidência no currículo.
5. A pessoa decide se um fato sugerido será confirmado ou rejeitado.
6. Preferências ausentes não funcionam como bloqueios.
7. Termos e empresas explicitamente excluídos devem ser respeitados.
8. Vagas deduplicadas preservam suas ocorrências e origens.
9. Resultados inválidos podem ser rejeitados sem invalidar todo o lote.
10. O sistema não envia candidaturas automaticamente.

## Privacidade e controle

O AppyFlow foi desenhado para execução sob controle da própria pessoa ou de quem
administra a instalação. Currículos e dados profissionais ficam no banco e no
armazenamento configurados pelo operador.

Chamadas externas só acontecem quando um provider é configurado e uma ação
correspondente é solicitada. O uso de IA é opcional. Chaves permanecem no
servidor e não aparecem nas telas.

## Limitações atuais

O pipeline completo pode ser executado manualmente ou diariamente pelo scheduler.
Horário, fuso, ativação e limites são configurados em `/preferencias`, onde também
fica o histórico recente. Ainda não estão disponíveis:

- deploy documentado no Render.

Essas limitações são apresentadas explicitamente para que uma pessoa avaliando o
repositório não confunda arquitetura preparada com funcionalidade pronta.

## Direção do produto

O fluxo pretendido é:

```text
currículo + perfil + preferências
  -> queries de busca
  -> descoberta e normalização de vagas
  -> filtros e análise de compatibilidade
  -> seleção da oportunidade
  -> preparação de currículo rastreável
  -> acompanhamento da candidatura
```

Matching é apresentado como aderência aos critérios conhecidos, nunca como
probabilidade de contratação. Conteúdo de currículo gerado permanece apoiado em
fatos confirmados pela pessoa usuária.
