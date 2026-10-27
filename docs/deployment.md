# Alternativas de hospedagem com servidor

A versão estática preparada para GitHub Pages usa armazenamento no navegador e não exige os serviços pagos abaixo. O workflow `.github/workflows/pages.yml` compila `dist-site` e publica o site; dados pessoais importados no navegador não são enviados ao repositório. Veja o README para as instruções dessa versão.

O aplicativo pode ser executado no computador ou hospedado com Node.js 24 e disco persistente. Os arquivos de implantação preparados não criam uma conta, serviço ou cobrança. Nenhuma implantação externa foi realizada por esses arquivos.

## Render, com banco persistente

O `render.yaml` usa o runtime nativo Node, `NODE_VERSION=24.19.0`, uma única instância e um disco de 1 GB em `/var/data`. O banco é criado em `/var/data/joare.sqlite`; builds e reinicializações não devem apagar esse disco. O plano `0.5c-512mb` e o disco são pagos. Confira os preços e o total no painel Render antes de autorizar a criação; a aplicação não depende de uma mensalidade gratuita com armazenamento efêmero.

Depois de colocar o código em um repositório acessível à sua conta Render, importe o Blueprint no painel do Render e revise todos os recursos antes de criar o serviço. O build usa o lockfile (`npm ci`) e compila a interface; a inicialização usa `npm start`. O Render fornece `PORT`; não a substitua por um valor arbitrário. `HOST=0.0.0.0` permite que o proxy da plataforma alcance o servidor. O endereço público será informado pelo Render depois que a implantação real estiver saudável; não existe um endereço de produção apenas por ter salvo este arquivo.

O Blueprint ativa `PUBLIC_MODE=true` e pede ao Render que gere `APP_PASSWORD` com `generateValue: true`. Consulte a senha apenas na área segura de variáveis do seu serviço, conforme o formulário de acesso do servidor. Não a coloque no Git nem no chat. O serviço precisa aceitar a origem exata fornecida por `RENDER_EXTERNAL_URL`; para domínio próprio, defina `APP_ORIGIN` com o endereço HTTPS correspondente. O health check é `/api/health` e deve responder `200` sem senha, revelando apenas o estado do serviço.

As atualizações automáticas estão desativadas (`autoDeployTrigger: off`). Depois de validar uma alteração, faça uma implantação manual. Um disco suporta somente uma instância do serviço e impede atualizações sem breve interrupção. Não aumente `numInstances` enquanto o banco for SQLite nesse disco.

Para o Metricool, importe o CSV no painel ou configure as variáveis opcionais `METRICOOL_TOKEN`, `METRICOOL_USER_ID` e `METRICOOL_BLOG_ID` no ambiente seguro do serviço. Acesso à API depende do plano e das permissões da conta Metricool. O token nunca deve ser enviado ao navegador. Notícias precisam de acesso de saída a `rss.uol.com.br` e links levam a `economia.uol.com.br`. Essas conexões devem ser validadas no serviço publicado; o arquivo de implantação não comprova que funcionam.

Faça backups consistentes do SQLite. Copie a pasta persistente somente com o aplicativo parado ou use um procedimento de backup SQLite que produza um arquivo consistente. Um backup externo é necessário antes de trocar o disco, excluir o serviço ou migrar o banco. Não copie apenas o arquivo `.sqlite` enquanto o SQLite estiver gravando com WAL.

## Docker

O `Dockerfile` tem três estágios: build da interface, dependências de produção e runtime. A imagem usa Node 24.19.0, `npm ci` e um processo com usuário `node`, sem privilégios de root. `.dockerignore` exclui banco, `.env`, credenciais e arquivos locais da imagem.

Construa a imagem com `docker build -t joare-insights .`. Crie um arquivo de configuração privado fora do repositório para `APP_PASSWORD` e `APP_ORIGIN`, e inicie com `docker run --detach --name joare-insights --restart unless-stopped --env-file /caminho/privado/joare.env --publish 127.0.0.1:3001:3001 --volume joare-data:/var/data joare-insights`.

Esse exemplo publica a porta somente no próprio computador. Para uma hospedagem pública, coloque um proxy HTTPS na frente do serviço e configure `APP_ORIGIN` com a URL HTTPS exata. Não envie a autenticação por HTTP público. `PUBLIC_MODE=true` é padrão da imagem e exige a configuração de acesso; não o desative para contornar a senha. O Dockerfile não inclui nenhuma senha.

O volume nomeado mantém o banco entre substituições da imagem. Não use `docker volume rm` nesse volume sem backup. Se preferir um diretório do host, ele deve ser gravável pelo UID/GID do usuário `node` da imagem (1000:1000); um bind mount substitui as permissões criadas na imagem. Não resolva permissões executando o aplicativo como root. O Blueprint Render usa runtime nativo e não depende dessas permissões da imagem Docker.

## Fontes consultadas

Documentação oficial consultada em 27/10/2026:

- [Blueprint YAML reference](https://render.com/docs/blueprint-spec): `runtime`, plano, `numInstances`, `generateValue`, `healthCheckPath`, disco e controle de deploy.
- [Persistent disks](https://render.com/docs/disks): preservação somente sob o mount path, plano pago, disco disponível apenas no runtime e limitação de uma instância.
- [Setting your Node.js version](https://render.com/docs/node-version): `NODE_VERSION` aceita versão semântica e tem precedência sobre os outros mecanismos.
- [Default environment variables](https://render.com/docs/environment-variables): `PORT` e `RENDER_EXTERNAL_URL` fornecidos pela plataforma.

Validações locais do aplicativo não substituem o teste da imagem Docker ou uma implantação real no Render. Se o Docker não estiver disponível no ambiente de desenvolvimento, registre a construção da imagem como não executada.
