# Integrações e limites de validação

Pesquisa técnica feita em 27/10/2026 para o Joare Studio.

## Metricool

O acesso real depende de um plano que habilite a API, de um token da própria conta,
de `userId` e de `blogId` da marca conectada ao Instagram. Confirmar as permissões
na conta do usuário. Não é possível obter insights privados somente com o @ público.

Fontes oficiais consultadas com resposta HTTP 200 nesta máquina:

- Conta: <https://app.metricool.com/settings>
- Referência da API: <https://app.metricool.com/resources/apidocs/index.html>
- Contrato OpenAPI: <https://app.metricool.com/api/swagger.json>

A restrição inicial de rede foi resolvida. O contrato pôde ser conferido na fonte
oficial. Isso não valida a conexão com a conta da Camila: nenhuma credencial dela
foi fornecida durante a pesquisa, e nenhum insight privado foi obtido.

O contrato oficial estabelece a base `https://app.metricool.com/api`, o token
`userToken` pelo cabeçalho `X-Mc-Auth` e identificação pelos parâmetros `userId`
e `blogId`. Evitar enviar o token na URL para não incluí-lo em logs.

Endpoints oficiais de leitura confirmados na especificação:

- `/v2/settings/brands`
- `/v2/analytics/posts/instagram` e `/v2/analytics/reels/instagram`, com `from`, `to`
  e opcionalmente `timezone`.
- `/v2/analytics/timelines`, com `network=instagram`, `subject`, `metric`,
  `timezone`, `from` e `to`. Métricas incluem `reels/videoviews`, `reels/reach`,
  `reels/likes`, `reels/comments`, `reels/saved`, `reels/shares`, `posts/likes`,
  `posts/comments`, `posts/saves`, `posts/shares` e `account/followers_gained`.

A resposta das séries é `{data:[{metric, values:[{dateTime,value}]}],page:{next}}`.
Posts e Reels incluem `publishedAt:{dateTime,timezone}`, `postId`/`reelId`,
`content`, `url`, `views`, `reach`, `likes`, `comments`, `shares` e `saved`.

A série `reels/videoviews` cobre somente Reels; não chamar isso de visualizações
integrais da conta. A documentação não lista `views` como métrica genérica do
subject `account`. Para breakdowns, `views` aparece com sujeitos
`media_product_type` e `follow_type`, dependendo do `scope` (como `REEL`, `POST`,
`STORY`, `FOLLOWER` e `NON_FOLLOWER`), cujo acesso real ainda precisa ser conferido.

Os dados devem manter a distinção entre contagens vitalícias de um post e séries
por dia. Somar views vitalícias por data de publicação não mede visualizações
da conta naquele dia. Campos não fornecidos precisam permanecer indisponíveis;
não substituir ausência por zero nem inventar visitas ao perfil.

Antes da liberação da rede também foram consultados, sem executar seu código,
estes clientes públicos secundários:

- <https://github.com/namdzmaso02/mcp-metricool/blob/main/src/mcp_metricool/tools/tools.py>
- <https://github.com/Purple-Horizons/metricool-cli/blob/main/metricool.js>
- <https://github.com/iSajadai/instagram-dashboard/blob/main/scripts/fetch_metricool.py>

## UOL

Feed público **validado com HTTP 200**:
<https://rss.uol.com.br/feed/economia.xml>.
Portal para acesso direto: <https://economia.uol.com.br/>.

O feed retornou XML com `charset=ISO-8859-1`; o cliente deve decodificar com esse
charset. As datas são em português, como `Ter, 27 Out 2026 09:07:51 -0200`, e
precisam de normalização antes da conversão para ISO. A data da fonte e o fuso
informado devem ser preservados; a interface pode exibi-los em America/Fortaleza.

Entre as manchetes efetivamente retornadas no dia da pesquisa estavam:

- “BC diz que sistema financeiro é estável, mas alerta sobre inadimplência”:
  <https://economia.uol.com.br/noticias/redacao/2026/10/27/bc-diz-que-sistema-financeiro-e-estavel-mas-inadimplencia-sobe.ghtm>
- “Relatório de estabilidade financeira do BC e balanços são destaques do dia”:
  <https://economia.uol.com.br/colunas/por-dentro-da-bolsa/2026/10/27/relatorio-de-estabilidade-financeira-do-bc-e-balancos-sao-destaques-do-dia.htm>

Esses exemplos registram o teste e não devem ser fixados como notícias atuais no
painel. A listagem da aplicação deve atualizar pelo feed, mostrar a data original
e sinalizar conteúdo antigo ou falhas de atualização. O feed contém economia em
geral: um filtro por palavras contábeis é aproximado e pode não encontrar matérias
específicas de contabilidade em toda atualização. Não criar notícias para preencher
um resultado vazio nem copiar artigos integrais. O acesso RSS não é parceria oficial.

## Ideias e assuntos em alta

Sem Exa, uma fonte de tendências ou uma amostra pública mensurável de posts,
não há evidência para declarar quais temas de contabilidade são “os mais virais”.
MEI, organização financeira, notas fiscais, fluxo de caixa, obrigações acessórias
e reforma tributária são pautas editoriais candidatas, não um ranking comprovado.
Datas, valores e obrigações legais exigem conferência em fontes oficiais antes de
publicar. Quando houver dados próprios, comparar formatos e temas pelo desempenho
da Camila e testar hipóteses com amostra e período visíveis. Crescimento não é garantido.

## Outros conectores citados

Notion, Exa, Magnific, Metricool e GitHub não expuseram ferramentas conectadas nesta
sessão. A implementação local não deve alegar sincronização com esses aplicativos.
Notion e Magnific são opcionais para o fluxo de análises; integrações futuras exigem
suas próprias credenciais e permissões. Nenhuma publicação social foi executada.

## Atualização pública no site estático

`scripts/fetch-news.mjs` obtém o RSS, normaliza o charset e as datas e grava somente
as notícias públicas em `public/news.json`. A primeira execução validada gerou
15 artigos, todos com data original válida. A build do site pode consumir esse
arquivo sem expor chaves nem depender de CORS do UOL no navegador.

O script deve rodar antes da build e na execução diária do workflow de publicação.
Se o UOL falhar e existir uma cópia anterior válida, preserva o `fetchedAt` original
e sinaliza `stale: true`; se não houver cópia, termina com erro. A rotina programada
depende de GitHub Actions estar habilitado e pode sofrer atraso da plataforma.

Nesta máquina com proxy, Node 24 usa o mecanismo oficial
`NODE_USE_ENV_PROXY=1 node scripts/fetch-news.mjs`. Não desabilitar TLS.
No site estático público, tokens Metricool jamais devem ser gravados em variáveis
`VITE_*`, no JavaScript publicado ou no JSON de notícias. Acesso privado por API
requer backend próprio ou a aplicação local.
