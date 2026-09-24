# Especificação do ResumeContent

## Finalidade

`ResumeContent` é o modelo de domínio comum usado para representar o conteúdo de
currículos em português do Brasil e inglês. Ele separa os dados profissionais da
apresentação LaTeX e preserva a origem factual dos textos gerados.

Esta especificação foi derivada dos dois templates de exemplo disponíveis
localmente em `templates/pt-br/template.tex` e `templates/en/template.tex`. Eles
possuem a mesma estrutura visual e diferem somente no idioma dos títulos, rótulos
e conteúdo.

## Estrutura identificada

Os dois documentos utilizam, nesta ordem:

1. cabeçalho com nome, localização, telefone, e-mail e links;
2. experiência profissional;
3. projetos em destaque;
4. competências técnicas agrupadas por categoria;
5. formação acadêmica;
6. cursos complementares;
7. idiomas.

Não existe seção de resumo profissional nos templates de referência. O renderer não
deve introduzir essa seção sem uma alteração explícita dos templates.

## Elementos compartilhados

- Classe `article`, papel A4 e corpo de 10 pontos.
- Codificação UTF-8 e fonte T1.
- Margens de 0,9 cm na vertical e 1 cm na horizontal.
- Links coloridos com `hyperref`.
- Seções sem numeração e separadas por linha horizontal.
- Experiências e projetos formados por cabeçalho e lista de bullets.
- Seções vazias devem ser omitidas integralmente.

## Diferenças por idioma

- `babel` usa `brazil` no template PT-BR e `english` no template EN.
- Títulos das seções são localizados.
- Datas, estado de conclusão, nível de idioma e indicação de vínculo atual são
  formatados no idioma do documento.
- Os textos profissionais são independentes em cada idioma, mas devem apontar
  para os mesmos fatos de origem.

## Modelo de domínio

O schema validado está em `src/domain/resume/resume-content.ts` e contém:

- `language`;
- `personalInfo`;
- `experiences`;
- `projects`;
- `skillGroups`;
- `education`;
- `courses`;
- `languages`.

Experiências, projetos, skills, formação, cursos e idiomas carregam um `factId`.
Cada bullet também informa `evidenceFactIds`. Essa associação impede que a camada
de apresentação transforme texto sem origem conhecida em conteúdo do currículo.

## Campos opcionais

Telefone, localização, e-mail, links, URL de projeto e localização de uma
experiência podem estar ausentes. Listas de seções podem ser vazias; nesse caso, o
renderer deve remover título, espaçamento e conteúdo da seção correspondente.

O nome completo é obrigatório porque ocupa o elemento principal do cabeçalho.

## Lacunas do modelo atual

O banco registra fatos dos tipos `SKILL`, `EXPERIENCE`, `PROJECT` e `LANGUAGE`.
Para preencher todo o `ResumeContent` com rastreabilidade, etapas posteriores
precisarão suportar fatos de formação e curso, além de dados de contato
estruturados.

O conteúdo provisório criado durante a preparação da candidatura não deve ser
tratado como `ResumeContent` definitivo até ser convertido e validado por este
schema.

## Regras para os renderers

- O renderer seleciona o template pelo campo `language`.
- Conteúdo e comandos LaTeX permanecem separados.
- Todo valor dinâmico deve passar por escaping LaTeX.
- URLs devem ser validadas antes da renderização.
- Datas são armazenadas como `AAAA-MM` e localizadas pelo renderer.
- O renderer não pode completar campos ausentes nem gerar conteúdo.
- A estrutura visual, macros, pacotes e espaçamentos dos templates são preservados.

## Nome do PDF

O arquivo PDF final utiliza o padrão `CV_NOME_PESSOA.pdf`. O nome é convertido
para letras maiúsculas, perde acentos e troca espaços ou pontuação por `_`.

Exemplo: `João da Silva` gera `CV_JOAO_DA_SILVA.pdf`.
