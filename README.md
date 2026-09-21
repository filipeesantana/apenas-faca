# Apenas, Faça.

Sistema pessoal de execução e acompanhamento: tire coisas da cabeça, organize tarefas, acompanhe metas, visualize progresso e identifique padrões de execução.

A aplicação funciona totalmente no navegador.

## Versão de teste

Esta é uma versão inicial destinada a testes de uso, interface e funcionamento. Projeto em desenvolvimento.

## Características

- Sem cadastro, backend ou dependências de produção.
- Sem rastreadores ou serviços externos obrigatórios.
- Dados armazenados localmente no navegador com IndexedDB.
- Backup e restauração em JSON.
- Interface adaptada a computadores e celulares.

## Privacidade

Os registros permanecem no navegador utilizado. Limpar os dados de navegação pode apagá-los. Utilize a função de backup nas configurações para preservar seus dados ou transferi-los para outro navegador, dispositivo ou endereço do site.

## Publicação no GitHub Pages

Copie todo o conteúdo deste pacote para a raiz do repositório, mantendo `index.html`, `css/` e `js/` juntos.

Em **Settings → Pages**, escolha **Deploy from a branch → main → / (root)** e salve. Não é necessário instalar pacotes nem executar um build. Os caminhos relativos permitem publicar também em `https://usuario.github.io/apenas-faca/`.

Para testar localmente, use qualquer servidor HTTP estático apontado para esta pasta. Abrir `index.html` diretamente pelo sistema de arquivos não é suportado, pois a aplicação usa módulos JavaScript.
