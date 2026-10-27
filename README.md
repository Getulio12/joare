# Joaré Insights

Painel preto e dourado para Camila Joare acompanhar o Instagram com dados do Metricool, disponível como site e aplicação local. Inclui histórico diário, métricas por publicação, análises com regras transparentes, ideias de contabilidade, planejamento e radar UOL. Interface em português, banco IndexedDB na versão online e SQLite na versão com servidor.

## Versão online (GitHub Pages)

Site publicado e verificado em **https://getulio12.github.io/joare/**. Não é necessário instalar Node ou contratar uma hospedagem para usar essa versão. O workflow `.github/workflows/pages.yml` compila e publica a interface pelo GitHub Actions. Em 27/10/2026, a instalação, atualização das notícias, compilação e implantação passaram no GitHub; a página e o radar UOL foram conferidos no endereço público.

Na versão online, métricas CSV, publicações, configurações e planejamento ficam em um **banco IndexedDB próprio no navegador**. Não são enviados ao repositório, ao GitHub ou a outro visitante. São persistidos entre visitas no mesmo navegador, mas não sincronizam entre aparelhos. Apagar os dados do navegador remove esse banco; exporte os relatórios para mantê-los guardados. A demonstração é separada e identificada.

A API direta do Metricool fica apenas na versão com servidor: nunca colocar tokens no JavaScript de um site público. Para o site online, importe o CSV da marca **@camilajoare**. O radar usa notícias reais do UOL publicadas em um arquivo público atualizado pela rotina diária do GitHub Actions (06h em America/Fortaleza, sujeito a atrasos do GitHub). Cada notícia conserva sua data e seu link; falha de atualização mantém o cache com aviso. O botão Atualizar radar busca a última versão já publicada, sem executar uma consulta privada no Metricool.

Para compilar/testar a versão online:

```sh
npm ci
npm run news:refresh
npm run build:site
npm run test:site
```

A saída é `dist-site/`, com base `/joare/`. O teste usa somente arquivos estáticos e um navegador isolado, sem API de servidor. Para outro caminho de hospedagem, ajuste `--base` no script `build:site`. A pasta `dist/` continua sendo a versão com servidor.

## Usar no computador

Instale **Node.js 24 ou superior** em [nodejs.org](https://nodejs.org). Baixe ou clone este projeto.

**Windows:** abra `Iniciar-Joare.bat` e depois acesse **http://127.0.0.1:3001**. Mantenha a janela aberta enquanto usa o painel. O script instala dependências na primeira execução e compila a interface.

**macOS / Linux**, dentro da pasta do projeto:

```sh
npm ci
npm run build
npm start
```

Abra **http://127.0.0.1:3001**. Para encerrar, pressione Ctrl+C no terminal. Esses comandos executam a versão local; não instalam o aplicativo automaticamente no computador do usuário. A versão online é acessada pelo endereço GitHub Pages acima.

Para desenvolvimento:

```sh
npm ci
npm run dev
```

A interface usa a porta 5173, com proxy `/api` para o servidor na porta 3001. Produção serve interface e API juntas em 3001. Por padrão o servidor fica em `127.0.0.1`, sem senha para uso local. A versão com servidor pode ser hospedada com `PUBLIC_MODE=true`, `APP_PASSWORD` forte, HTTPS e disco persistente; há autenticação por senha e cookie seguro, bloqueio de tentativas e expiração de sessão. Veja [publicação e hospedagem](docs/deployment.md). Não exponha um servidor sem proteção. O GitHub Pages não usa esse servidor nem armazena dados privados dos visitantes.

## Trazer os dados da Camila

1. O perfil **@camilajoare** já vem configurado. Você pode editá-lo em **Conexões e perfil**. O @ sozinho não dá acesso às estatísticas privadas.
2. No Metricool, exporte o relatório do Instagram, de preferência em CSV.
3. No Joaré, clique **Importar CSV**, selecione **Métricas diárias** ou **Publicações** e baixe o modelo correspondente.
4. Se necessário, adapte **uma cópia** do relatório ao modelo. O parser não promete compatibilidade com todo layout de exportação do Metricool.
5. Importe. O painel muda para **Meus dados**; a demonstração nunca é gravada junto às métricas reais.

### CSV diário

Uma linha por data, até 5.000 linhas / 2 MB. Cabeçalhos em inglês ou os equivalentes em português. Vírgula ou ponto e vírgula como separador. Datas `AAAA-MM-DD` ou `DD/MM/AAAA`. Contagens inteiras não negativas, **sem separador de milhar**. O arquivo de modelo traz apenas os cabeçalhos: preencha-o com seus dados reais.

```csv
data,visualizacoes,alcance,curtidas,comentarios,salvamentos,compartilhamentos,seguidores
2026-10-26,1200,900,45,8,12,9,1500
```

Os números acima são **apenas um exemplo de formato**, não dados da Camila. Campos ausentes ficam nulos, não zero. Importar novamente a mesma data substitui a linha inteira, inclusive campos vazios. Datas duplicadas no mesmo arquivo são rejeitadas, assim como datas futuras e valores inválidos. Não importe impressões como se fossem visualizações nem alcance de publicação como alcance diário da conta.

### CSV de publicações

Use a aba **Publicações** do importador para o modelo correto. Inclua ID ou link estável do Instagram, data, título e pelo menos uma métrica. Os posts ficam em tabela própria; não são somados às métricas diárias. Importar o mesmo ID atualiza o retrato desse post. O ranking seleciona posts **publicados no período** e ordena pelas **views acumuladas informadas**, não por views recebidas durante o período.

### API opcional do Metricool

O fluxo recomendado e escolhido pelo usuário é o CSV. Se o seu plano permitir API, copie `.env.example` para `.env` e preencha `METRICOOL_TOKEN`, `METRICOOL_USER_ID` e `METRICOOL_BLOG_ID` localmente. Os IDs também podem ser salvos no painel. Reinicie o servidor após alterar o token. Nunca envie credenciais pelo chat nem adicione `.env` ao Git.

O adaptador opcional consulta somente séries de **Reels** (visualizações, alcance e compartilhamentos quando retornados), não visitas ao perfil inteiro. Curtidas/seguidores não disponíveis permanecem sem dados. A sincronização verifica uma vez por hora se precisa atualizar o dia e só funciona enquanto o servidor estiver aberto. A importação manual não atualiza sozinha; importe novos relatórios regularmente.

O contrato foi estudado inicialmente em clientes públicos e depois conferido na documentação oficial acessível. **A autenticação e as métricas da conta real continuam sem validação**, pois não há credenciais da Camila. O adaptador valida as respostas e falha de forma explícita se o formato não for reconhecido. Consulte [a documentação oficial](https://app.metricool.com/resources/apidocs/index.html) e [as notas da pesquisa](docs/integrations-research.md).

## Entender as análises

- Views não são visitantes únicos nem necessariamente visitas ao perfil. O relatório de origem determina a métrica.
- Alcance acumulado é a soma dos alcances diários: uma pessoa pode ser contada em vários dias.
- Engajamento usa `(curtidas + comentários + salvamentos + compartilhamentos) / alcance × 100`, somente com campos completos e alinhados. É uma razão sobre alcance, diferente de fórmulas por seguidores.
- Variações exigem períodos completos de mesma duração; lacunas não são zeros. Sem base, o painel mostra `—` / sem comparação.
- As recomendações são regras explicáveis sobre o histórico disponível, não uma previsão ou garantia de viralização.
- Ideias editoriais sobre MEI, finanças, IR e reforma tributária não são ranking medido de temas virais. Confira normas e prazos nas fontes oficiais antes de publicar.

## UOL e outros serviços

O Radar consulta o feed público `https://rss.uol.com.br/feed/economia.xml`, filtra termos econômicos/contábeis e conserva links, fontes e datas. Cache local por 30 minutos; falha de atualização mostra aviso e mantém eventual cache anterior. Há acesso direto ao UOL Economia e uma ação para transformar notícia em roteiro no planejamento. Não há afiliação com o UOL.

**Atualização de 27/10/2026:** a rede foi liberada e o feed UOL foi validado ao vivo. O parser suporta a codificação ISO-8859-1 e datas em português do feed. A documentação oficial do Metricool também ficou acessível; ainda não houve autenticação na conta da Camila. Nenhuma estatística privada ou classificação viral foi inventada. No computador, é necessário acesso HTTPS aos serviços. Neste ambiente, o Node 24 pode precisar de `NODE_USE_ENV_PROXY=1` para usar o proxy configurado; isso preserva a verificação TLS.

Notion, Exa, Magnific e GitHub não disponibilizaram conectores nesta sessão. O site não alega sincronização com esses serviços. Não há publicação automática no Instagram. Roteiros podem ser copiados; planejamento fica no banco local.

## Banco de dados e backup

Na primeira inicialização o servidor cria `data/joare.sqlite`. Métricas, posts, ideias, perfil, cache e eventos ficam persistidos; as credenciais de API ficam somente no `.env`. A pasta `data/` e o `.env` são ignorados pelo Git.

Feche o aplicativo e copie a pasta `data/` para fazer backup; restaure com o servidor desligado. Não apague essa pasta para atualizar o código. A demonstração é calculada separadamente e não contamina o histórico. `DATABASE_PATH` permite escolher outro banco.

## Validação

```sh
npm test
npm run build
```

Os testes de integração usam bancos temporários e respostas simuladas para UOL/Metricool. Eles verificam os contratos e a persistência, **não comprovam conexão externa real**. O teste de navegador em `tests/browser-smoke.mjs` inicia seu próprio servidor temporário, banco isolado e respostas de rede simuladas. Depois do build, execute `npm run test:browser` com Chromium instalado; `CHROMIUM_PATH` permite informar o caminho do navegador. Node 24 pode emitir um aviso de API experimental para `node:sqlite`.
