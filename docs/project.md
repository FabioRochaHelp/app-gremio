Planejamento — App do Grêmio
27 de out. de 2026 · @Fabio
Visão geral
O app controla as contribuições e os gastos do grêmio da unidade, que custeia o cafezinho e pequenos reparos. O princípio central é a transparência: todo associado vê cada entrada e cada saída, com o comprovante anexado.
Não há fluxo de aprovação de despesas. O controle vem do comprovante obrigatório, da notificação imediata a todos e do histórico que não pode ser apagado.
O app será um PWA em Nuxt 3, instalado pelo link no celular, com backend em NestJS.
Perfis de usuário
São dois perfis, sem presidência nem conselho fiscal.
Perfil
O que faz
Associado
Paga a mensalidade, envia o comprovante Pix em PDF, vê saldo e extrato completo, sugere melhorias e vota
Tesoureiro
Revisa comprovantes que a leitura automática não aceitou, lança entradas e saídas com comprovante, faz estornos e fecha o mês
O tesoureiro também é associado e vê tudo o que os demais veem.
Funcionalidades do MVP
O MVP cobre o ciclo completo: entra dinheiro, sai dinheiro, todos veem, o mês fecha.
Funcionalidade
Descrição
Fase
Cadastro de associados
Nome, RE, posto/graduação, unidade e situação (ativo, inadimplente, isento)
1
Mensalidades via Pix
QR Code Pix da conta do grêmio; o associado envia o comprovante em PDF e o sistema lê e dá a baixa automaticamente
1
Lançamento de despesas
Categoria (café, reparos, eventos), valor, justificativa e foto da nota obrigatória
1
Notificações
Aviso a todos a cada saída registrada, com valor, categoria e comprovante
1
Painel de transparência
Saldo atual, entradas e saídas por mês e por categoria
1
Prestação de contas
PDF mensal com extrato e comprovantes, gerado no fechamento
1
Pix via API do banco
Cobrança gerada direto no intermediário (Asaas ou Mercado Pago), dispensando o upload do comprovante; opcional
2
Sugestões e votação
Associado propõe melhorias e os demais votam; não bloqueia gastos
2
Multiunidade
Outros GBs ou postos usando a mesma instalação
3
Baixa automática pelo comprovante
O sistema só dá a baixa quando o PDF passa em quatro checagens; o que falhar vai para revisão do tesoureiro com o motivo.
1. Leitura: extrai o texto do PDF e identifica valor, data, recebedor e ID da transação (E2E), com padrões por banco.
2. Recebedor: precisa ser a chave Pix ou o CNPJ do grêmio.
3. Valor e data: o valor bate com a mensalidade em aberto e a data é compatível com a competência.
4. ID único: o ID E2E nunca foi usado antes, o que impede reaproveitar o mesmo comprovante.
PDF escaneado ou sem texto também vai para revisão manual. Como um PDF pode ser adulterado, a conferência com o extrato bancário no fechamento é a garantia final.
Mecanismos de transparência
Sem aprovação prévia, quatro regras do sistema garantem o controle:
1. Comprovante obrigatório: nenhuma despesa é salva sem foto da nota ou do recibo.
2. Notificação imediata: cada saída gera um push para todos os associados no momento do lançamento.
3. Lançamentos imutáveis: nada é editado ou apagado; correções são estornos com motivo, e todo o histórico fica visível com autor e data.
4. Conferência bancária no fechamento: o tesoureiro anexa o extrato do mês e o sistema compara o saldo registrado com o saldo do banco, sinalizando qualquer diferença no PDF, inclusive mensalidade baixada sem crédito correspondente no banco.
Stack tecnológica
TypeScript de ponta a ponta: NestJS no backend e Nuxt 3 como PWA no frontend, com tipos compartilhados entre os dois.
Camada
Tecnologia
Uso
Backend
NestJS
API REST, módulos por domínio, guards por perfil
ORM
Prisma
Modelagem, migrations e middleware de auditoria
Banco
PostgreSQL
Dados do grêmio
Autenticação
Passport + JWT
Login e controle dos perfis associado/tesoureiro
Filas
BullMQ + Redis
Leitura dos comprovantes, notificações e PDF mensal em segundo plano
PDF
Puppeteer + pdf-parse
Gera a prestação de contas mensal e lê os comprovantes Pix enviados
Frontend
Nuxt 3 + Pinia
Telas do associado e do tesoureiro
PWA
@vite-pwa/nuxt
Instalação pelo link, sem lojas
Notificações
Web Push (VAPID)
Push a cada lançamento
Arquivos
MinIO ou Cloudflare R2
Comprovantes e PDFs (S3-compatible)
Infra
VPS + Docker Compose
Hospedagem fora da rede da corporação
No iPhone, o push via PWA só funciona com o app adicionado à tela inicial (iOS 16.4+). O primeiro acesso deve orientar isso com uma tela de instalação.
Arquitetura e modelo de dados
O PWA conversa apenas com a API. A fila dispara as notificações e gera o PDF sem travar o app.
Tabela
Campos principais
associados
nome, RE, posto, unidade, perfil, situação, aceite do termo
mensalidades
associado, competência, valor, status, comprovante PDF, ID E2E (único), tipo de baixa (automática ou manual), motivo de recusa
lancamentos
tipo (entrada, saída, estorno), categoria, valor, descrição, comprovante, autor, estorno de
fechamentos_mensais
competência, saldo no sistema, saldo no banco, extrato, PDF, fechado por
sugestoes / votos
título, descrição, autor / sugestão, associado, voto
push_subscriptions
associado, endpoint, chaves VAPID
audit_log
tabela, registro, ação, autor, dados, data
Pontos de atenção
O grêmio deve funcionar totalmente separado da estrutura do Estado.
• Separação do órgão: associação privada, idealmente com estatuto e CNPJ próprios, e conta bancária em nome do grêmio, nunca da unidade. O sistema fica hospedado fora da rede e dos servidores da corporação.
• Adesão voluntária: sem desconto em folha nem cobrança por via hierárquica. O app informa que a adesão é opcional.
• LGPD: coleta mínima de dados (CPF só se necessário), aceite de termo de uso no primeiro acesso e lista de inadimplentes visível apenas ao tesoureiro.
• Aval do comando: apresentar o projeto ao comandante antes do lançamento.
Fases e cronograma
A fase 1 é a única com prazo: 3 a 4 semanas, contando a curva de aprendizado do NestJS. As fases 2 e 3 só começam se o marco anterior for atingido.
Custos estimados e próximos passos
O custo fixo fica em torno de R$ 35 a 55 por mês na fase 1. Valores aproximados, a confirmar com os fornecedores.
Item
Custo aproximado
VPS (2 vCPU, 2–4 GB RAM)
R$ 30–50/mês
Domínio .com.br
R$ 40/ano
Armazenamento de comprovantes (R2 ou MinIO na VPS)
R$ 0 no volume inicial
Pix via API do banco (fase 2, opcional)
Tarifa por cobrança do intermediário escolhido
Lojas de apps
R$ 0 (PWA)
[ ] Definir valor da mensalidade e categorias de despesa
[ ] Abrir conta bancária do grêmio e chave Pix
[ ] Apresentar o projeto ao comando
[ ] Modelar o schema Prisma e subir o repositório
[ ] Contratar VPS e domínio