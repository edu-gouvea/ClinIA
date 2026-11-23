# DevOps e Automação — ClinIA

## 1. Objetivo

Este documento apresenta os procedimentos de desenvolvimento, validação e integração contínua do ClinIA. Seu objetivo é padronizar a execução local do projeto e documentar os mecanismos automatizados de verificação de qualidade.

## 2. Ambiente de desenvolvimento

### Requisitos

- Node.js 20.9 ou superior.
- Versão recomendada para desenvolvimento e verificação: Node.js 24.20.0.
- npm.
- Git.
- Visual Studio Code (recomendado).

O projeto utiliza Next.js, React, TypeScript e CSS próprio baseado em tokens.

O frontend pode ser executado sem configurar backend, banco de dados ou chaves de API, pois utiliza dados fictícios.

### Instalação

Na raiz do repositório, executar:

```bash
npm ci
```

No Windows com PowerShell, caso a política de execução impeça o uso de `npm`, utilizar `npm.cmd`.

### Inicialização

```bash
npm run dev
```

A aplicação fica disponível em:

http://localhost:3000/inicio

Para encerrar o servidor, utilizar `Ctrl+C` no terminal.

## 3. Verificações e testes locais

Os seguintes comandos estão disponíveis no projeto:

| Comando | Finalidade |
|---|---|
| `npm run lint` | Verificação estática com ESLint |
| `npm run typecheck` | Verificação de tipos TypeScript |
| `npm test` | Execução dos testes automatizados |
| `npm run build` | Geração da versão de produção |
| `npm run test:e2e` | Testes de navegador com Playwright |

Para executar a suíte de verificações:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Para executar os testes de navegador, é necessário ter o Chromium instalado pelo Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```

## 4. Integração contínua — Frontend

O workflow está definido em:

`.github/workflows/frontend.yml`

Ele é acionado por eventos de `push` e `pull_request`, respeitando os filtros de caminhos configurados no arquivo.

O pipeline possui duas etapas:

### 4.1. Qualidade

Executado em ambiente Ubuntu com Node.js 24.

Etapas:

1. Checkout do repositório.
2. Configuração do Node.js.
3. Instalação das dependências com `npm ci`.
4. Execução do ESLint.
5. Verificação de tipos TypeScript.
6. Execução dos testes automatizados.
7. Build de produção.

### 4.2. Testes de navegador

Executados após a aprovação da etapa de qualidade.

Etapas:

1. Checkout do repositório.
2. Configuração do Node.js 24.
3. Instalação das dependências.
4. Instalação do Chromium com Playwright.
5. Execução dos testes E2E.
6. Armazenamento do relatório de Playwright em caso de falha, por sete dias.

## 5. Integração contínua — Banco de dados

O workflow está definido em:

`.github/workflows/database.yml`

Ele é acionado quando há alterações em `database/**` ou no próprio workflow.

O pipeline utiliza PostgreSQL 16 em um serviço temporário no GitHub Actions.

A execução utiliza:

```bash
python3 database/tests/run.py --container <container>
```

A suíte verifica aspectos como:

- Integridade dos dados.
- Isolamento entre clínicas.
- Regras de acesso.
- Concorrência nas reservas.
- Restrições e relacionamentos do banco.

A documentação detalhada dos testes está em `docs/banco/testes.md`.

## 6. Organização do Git

O desenvolvimento deve ocorrer em branches específicas, evitando alterações diretamente na branch principal.

Fluxo recomendado:

1. Criar uma branch para a tarefa.
2. Implementar as alterações.
3. Executar as verificações pertinentes.
4. Registrar as alterações em um commit.
5. Enviar a branch ao repositório remoto.
6. Abrir um Pull Request.
7. Aguardar revisão e aprovação.
8. Integrar as alterações à branch de desenvolvimento conforme o fluxo adotado pela equipe.

Exemplo de criação de branch:

```bash
git switch -c feature/nome-da-tarefa
```

Exemplo de envio:

```bash
git push -u origin feature/nome-da-tarefa
```

## 7. Boas práticas

- Não realizar commits diretamente na branch principal.
- Executar os testes antes de abrir um Pull Request.
- Não adicionar senhas, tokens ou credenciais ao repositório.
- Não utilizar dados reais de pacientes nos testes.
- Manter a documentação atualizada quando houver mudanças técnicas.
- Preservar os padrões arquiteturais e visuais definidos pela equipe.
- Revisar os relatórios do GitHub Actions antes de integrar alterações.

## 8. Limitações e escopo

Os workflows documentados realizam verificações automatizadas de qualidade do frontend e integridade do banco de dados.

A existência de CI não significa que o sistema tenha implantação contínua em produção. O processo de deploy deve ser documentado separadamente caso venha a ser implementado.

## 9. Documentos relacionados

- `README.md` — instalação e execução do projeto.
- `docs/DECISOES.md` — decisões de produto e arquitetura.
- `docs/DESIGN_SYSTEM.md` — padrões visuais e acessibilidade.
- `docs/INTEGRACAO.md` — integração entre componentes.
- `docs/banco/testes.md` — evidências e cobertura dos testes do banco de dados.
- `.github/workflows/frontend.yml` — automação do frontend.
- `.github/workflows/database.yml` — automação do banco de dados.