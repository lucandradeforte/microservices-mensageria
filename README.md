# Arquitetura de Microserviços Orientada a Eventos

Projeto de referência para demonstrar desenho de sistemas distribuídos com foco em microserviços, mensageria e consistência eventual.

Este repositório implementa um fluxo de negócio simples, porém representativo de problemas reais de backend:

- criação de pedidos
- processamento de pagamentos
- envio de notificações

A solução foi construída com:

- `Order Service` em `NestJS`
- `Payment Service` em `NestJS`
- `Notification Service` em `.NET 8 Worker Service`
- `RabbitMQ` como message broker
- `PostgreSQL` com um banco dedicado por serviço

## 1. 📌 Visão Geral

Este sistema representa uma arquitetura distribuída baseada em microserviços, na qual cada contexto de negócio é isolado em um serviço independente, com persistência própria e comunicação assíncrona por eventos.

O contexto de negócio é inspirado em um fluxo de e-commerce:

- um pedido é criado
- o pagamento é processado
- uma notificação é enviada ao cliente

Apesar do domínio ser propositalmente pequeno, a implementação endereça preocupações típicas de produção:

- separação de responsabilidades
- isolamento de dados
- acoplamento fraco entre serviços
- tolerância a falhas com `retry` e `dead letter queue`
- rastreabilidade com `correlationId`
- consumidores idempotentes

O `Order Service` atua como ponto de entrada síncrono via HTTP e como agregador do estado do pedido ao reagir aos eventos `payment.processed` e `notification.sent`. O `Payment Service` e o `Notification Service` executam processamento assíncrono desacoplado, cada um preservando sua própria consistência local.

## 2. 🎯 Objetivo (Para que)

O objetivo deste projeto é demonstrar, de forma prática, como modelar um sistema distribuído orientado a eventos sem recorrer a banco compartilhado ou chamadas síncronas em cascata entre serviços.

Mais especificamente, esta arquitetura existe para:

- reduzir acoplamento temporal entre criação de pedido, pagamento e notificação
- permitir evolução independente de cada serviço
- tornar falhas localizadas mais tratáveis sem indisponibilizar o fluxo inteiro
- evidenciar padrões comuns de mensageria em sistemas reais

A escolha por arquitetura orientada a eventos faz sentido aqui porque o domínio não exige confirmação síncrona imediata de toda a cadeia. O cliente precisa de uma confirmação rápida da criação do pedido; pagamento e notificação podem ocorrer de forma assíncrona e convergir por consistência eventual.

## 3. 🧠 Decisões Técnicas

### 3.1 Arquitetura de microserviços

- **Por quê:** pedidos, pagamentos e notificações possuem responsabilidades diferentes, ritmos de evolução distintos e perfis operacionais independentes.
- **Para quê:** permitir deploy, manutenção e escalabilidade por contexto de negócio, sem transformar o sistema em um monólito distribuído artificial.
- **Como:** o projeto foi dividido em `Order Service`, `Payment Service` e `Notification Service`, cada um com código, banco e ciclo de processamento próprios.
- **Trade-offs:** aumenta a complexidade operacional, exige observabilidade melhor, introduz consistência eventual e torna debugging mais difícil do que em um monólito.

### 3.2 Comunicação orientada a eventos com RabbitMQ

- **Por quê:** o fluxo depende de propagação assíncrona de mudanças de estado entre serviços, com roteamento simples por evento e suporte nativo a filas duráveis.
- **Para quê:** desacoplar produtores e consumidores, evitar dependência síncrona entre serviços e tratar falhas transitórias sem bloquear a API de entrada.
- **Como:** o sistema publica eventos no exchange `domain.events` com `routing keys` como `order.created`, `payment.processed` e `notification.sent`. Filas específicas por consumidor recebem os eventos relevantes.
- **Trade-offs:** RabbitMQ simplifica filas, roteamento, TTL e DLQ para este caso, mas oferece menos capacidade de retenção e replay histórico do que Kafka. Em cenários de alto throughput, streaming analítico ou reprocessamento massivo, Kafka seria uma escolha mais forte.

### 3.3 Banco por serviço

- **Por quê:** compartilhar banco entre serviços cria acoplamento estrutural, quebra autonomia e incentiva integrações por tabela em vez de contratos explícitos.
- **Para quê:** preservar encapsulamento do modelo de dados e permitir que cada serviço evolua sua persistência sem afetar os demais.
- **Como:** o `Order Service` usa `order_db`, o `Payment Service` usa `payment_db` e o `Notification Service` usa `notification_db`, cada um provisionado no `docker-compose`.
- **Trade-offs:** consultas distribuídas ficam mais difíceis, relatórios cross-service exigem composição por API/eventos e não existe consistência transacional global entre serviços.

### 3.4 Processamento assíncrono

- **Por quê:** o cliente não precisa aguardar pagamento e notificação para receber confirmação da criação do pedido.
- **Para quê:** reduzir latência na borda, absorver picos de carga e evitar efeito cascata de falha entre serviços.
- **Como:** o `Order Service` persiste e responde ao cliente imediatamente após publicar `order.created`; os serviços seguintes processam o fluxo a partir do broker.
- **Trade-offs:** o estado final do pedido não é imediato, exigindo consistência eventual e capacidade de explicar estados intermediários como `CREATED` e `PAID`.

### 3.5 Retry e Dead Letter Queue (DLQ)

- **Por quê:** em sistemas distribuídos, falhas transitórias são normais e não devem implicar perda definitiva de mensagem na primeira tentativa.
- **Para quê:** aumentar resiliência operacional, permitir recuperação automática de falhas temporárias e isolar mensagens problemáticas para análise posterior.
- **Como:** cada consumidor possui fila principal, fila de retry e fila de DLQ. Em caso de erro, a mensagem é republicada em `domain.retry`; após `TTL`, retorna ao fluxo principal. Quando o limite é excedido, é enviada para `domain.dlx`.
- **Trade-offs:** retries aumentam tempo total de processamento, exigem observabilidade para evitar loops silenciosos e não substituem tratamento de causa raiz. Além disso, republish explícito no código é mais flexível, mas também mais trabalhoso do que depender apenas de políticas do broker.

### 3.6 Idempotência

- **Por quê:** a semântica de entrega aqui é `at-least-once`, então o mesmo evento pode ser processado mais de uma vez.
- **Para quê:** evitar duplicidade de pagamento ou notificação quando houver redelivery, retry ou reprocessamento manual.
- **Como:** `Payment Service` e `Notification Service` verificam existência prévia por `orderId` antes de processar; além disso, as tabelas possuem restrição `UNIQUE` em `order_id`, reforçando a proteção em nível de banco.
- **Trade-offs:** idempotência exige chaves de negócio estáveis e aumenta a responsabilidade do consumidor. Ela reduz efeitos colaterais duplicados, mas não resolve problemas de ordenação indevida de eventos.

### 3.7 Logging e observabilidade

- **Por quê:** tracing em sistemas distribuídos depende de contexto propagado entre requisição síncrona e eventos assíncronos.
- **Para quê:** permitir correlação de logs ponta a ponta, acelerar troubleshooting e tornar falhas mais auditáveis.
- **Como:** o sistema propaga `x-correlation-id` desde a requisição HTTP. Esse valor entra no envelope do evento e é restaurado no contexto de execução do consumidor antes do processamento. Os serviços Node usam logs estruturados em JSON; o worker em .NET usa logging estruturado com `scopes`.
- **Trade-offs:** correlation ID melhora rastreabilidade, mas não substitui tracing distribuído completo com spans, métricas e visualização temporal.

### 3.8 Clean Architecture e injeção de dependência

- **Por quê:** mesmo em um projeto de demonstração, separar caso de uso, domínio e infraestrutura ajuda a mostrar limites claros entre regra de negócio e detalhe técnico.
- **Para quê:** facilitar teste, manutenção e substituição de infraestrutura sem contaminar o domínio com acoplamento de framework.
- **Como:** os serviços NestJS foram organizados em `domain`, `application`, `infrastructure` e `presentation`. O worker em .NET segue a mesma ideia ao separar `Application`, `Domain`, `Infrastructure` e `Contracts`. Dependências são resolvidas por injeção.
- **Trade-offs:** há mais arquivos e mais abstrações do que em uma implementação direta. O ganho vem quando o sistema cresce e precisa preservar coesão arquitetural.

### 3.9 Trade-off assumido conscientemente: sem Outbox Pattern

- **Por quê:** o foco do projeto é demonstrar fluxo distribuído, mensageria, retries e idempotência sem adicionar a complexidade completa de uma camada de outbox/inbox.
- **Para quê:** manter o exemplo didático, operacional e relativamente enxuto.
- **Como:** cada serviço persiste localmente e depois publica o evento correspondente.
- **Trade-offs:** existe uma janela entre `commit` local e publicação do evento. Em produção, esse risco seria mitigado com `Transactional Outbox`, `Inbox Pattern` e mecanismos mais fortes de replay/consistência.

## 4. 🏗️ Arquitetura

### Visão lógica

```text
[ Cliente / Consumidor HTTP ]
            |
            | POST /orders
            v
[ Order Service | NestJS | :3000 ]
            |
            | persiste em order_db
            | publica Event: order.created
            v
      [ RabbitMQ | domain.events ]
            |
            +------------------------------> [ payment-service.order-created ]
                                              [ Payment Service | NestJS | :3001 ]
                                              | persiste em payment_db
                                              | publica Event: payment.processed
                                              v
                                      [ RabbitMQ | domain.events ]
                                              |
                        +---------------------+----------------------+
                        |                                            |
                        v                                            v
         [ order-service.payment-processed ]       [ notification-service.payment-processed ]
         [ Order Service atualiza status ]         [ Notification Service | .NET Worker ]
                                                   | persiste em notification_db
                                                   | publica Event: notification.sent
                                                   v
                                            [ RabbitMQ | domain.events ]
                                                   |
                                                   v
                                 [ order-service.notification-sent ]
                                 [ Order Service atualiza status final ]
```

### Topologia de mensageria

```text
Exchanges
---------
domain.events  -> tráfego principal de eventos de domínio
domain.retry   -> filas temporárias de retry
domain.dlx     -> destino final de mensagens que excederam tentativas

Consumidores
------------
payment-service.order-created              -> order.created
payment-service.order-created.retry        -> retry de order.created
payment-service.order-created.dlq          -> falhas definitivas de order.created

notification-service.payment-processed     -> payment.processed
notification-service.payment-processed.retry
notification-service.payment-processed.dlq

order-service.payment-processed            -> payment.processed
order-service.payment-processed.retry
order-service.payment-processed.dlq

order-service.notification-sent            -> notification.sent
order-service.notification-sent.retry
order-service.notification-sent.dlq
```

### Envelope de evento

Todos os eventos seguem um envelope padronizado:

```json
{
  "eventName": "order.created",
  "version": "1.0.0",
  "occurredAt": "2026-04-13T12:00:00.000Z",
  "correlationId": "demo-123",
  "payload": {}
}
```

Isso reduz acoplamento entre produtores e consumidores e facilita versionamento de contrato no futuro.

## 5. 🔄 Fluxo de Eventos

### Fluxo principal

1. O cliente envia `POST /orders` para o `Order Service`.
2. O `Order Service` valida o DTO, cria a entidade de pedido, persiste no `order_db` com status inicial `CREATED` e publica `order.created`.
3. O `Payment Service` consome `order.created`, verifica idempotência por `orderId`, processa o pagamento, persiste no `payment_db` e publica `payment.processed`.
4. O `Order Service` também consome `payment.processed` para atualizar o pedido para `PAID`.
5. O `Notification Service` consome `payment.processed`, verifica idempotência por `orderId`, registra a notificação no `notification_db` e publica `notification.sent`.
6. O `Order Service` consome `notification.sent` e atualiza o pedido para `NOTIFIED`.
7. O cliente pode consultar o estado convergido do pedido via `GET /orders/:id`.

### Evolução de estado do pedido

```text
CREATED -> PAID -> NOTIFIED
```

### Eventos publicados

- `order.created`
- `payment.processed`
- `notification.sent`

### Comportamento de falha controlada

O payload de criação aceita `processingBehavior`, usado para simular falhas reais e validar a estratégia de resiliência:

- `normal`
- `payment-transient`
- `payment-permanent`
- `notification-transient`
- `notification-permanent`

## 6. ⚙️ Funcionalidades

- Criação de pedidos via API HTTP no `Order Service`
- Consulta do estado do pedido via `GET /orders/:id`
- Processamento assíncrono de pagamento no `Payment Service`
- Consulta de pagamento por pedido via `GET /payments/order/:orderId`
- Envio assíncrono de notificação no `Notification Service`
- Atualização do ciclo de vida do pedido por consumo de eventos
- Comunicação assíncrona via RabbitMQ
- Rastreabilidade ponta a ponta com `correlationId`
- Simulação de cenários de falha para validar retry e DLQ

### Endpoints expostos

| Serviço | Endpoint | Descrição |
| --- | --- | --- |
| Order Service | `POST /orders` | Cria pedido e publica `order.created` |
| Order Service | `GET /orders/:id` | Consulta estado do pedido |
| Order Service | `GET /health` | Health check |
| Payment Service | `GET /payments/order/:orderId` | Consulta pagamento por pedido |
| Payment Service | `GET /health` | Health check |
| Notification Service | N/A | Worker assíncrono, sem API HTTP |

### Exemplo de payload

```json
{
  "customerEmail": "alice@example.com",
  "amount": 149.90,
  "currency": "USD",
  "processingBehavior": "normal"
}
```

## 7. 🚀 Como executar

### Pré-requisitos

- Docker
- Docker Compose

### Subir o ambiente completo

```bash
docker compose up --build
```

### Serviços e portas

| Componente | Porta local | Observação |
| --- | --- | --- |
| Order Service | `3000` | API HTTP principal |
| Payment Service | `3001` | API HTTP de consulta |
| RabbitMQ AMQP | `5672` | Broker |
| RabbitMQ Management UI | `15672` | `guest / guest` |
| PostgreSQL do Order Service | `5433` | Banco `order_db` |
| PostgreSQL do Payment Service | `5434` | Banco `payment_db` |
| PostgreSQL do Notification Service | `5435` | Banco `notification_db` |

### Executar requisições de demonstração

Após o ambiente estar no ar:

```bash
bash scripts/demo-requests.sh
```

O script cria:

- um fluxo feliz
- um cenário de falha transitória em notificação
- um cenário de falha permanente em pagamento com destino à DLQ

### Teste manual

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: demo-123" \
  -d '{
    "customerEmail": "alice@example.com",
    "amount": 149.90,
    "currency": "USD",
    "processingBehavior": "normal"
  }'
```

Consultar resultado:

```bash
curl http://localhost:3000/orders/<order-id>
curl http://localhost:3001/payments/order/<order-id>
```

### Acompanhar logs

```bash
docker compose logs -f order-service payment-service notification-service rabbitmq
```

## 8. 🧪 Resiliência e Confiabilidade

### Estratégia de retry

- Cada consumidor possui `maxRetries=3`
- O retry usa fila dedicada com `TTL=5000ms`
- Após o TTL, a mensagem retorna para o fluxo principal e é processada novamente

Esse modelo evita retry imediato em loop apertado e cria uma forma simples de backoff temporal fixo.

### Estratégia de DLQ

Quando a mensagem excede o limite de tentativas, ela é publicada no exchange `domain.dlx` e roteada para a fila `.dlq` correspondente ao consumidor.

Isso permite:

- isolar mensagens inválidas ou falhas permanentes
- inspecionar payload, cabeçalhos e `correlationId`
- operar reprocessamento manual sem contaminar a fila principal

### Semântica de entrega

O desenho assume `at-least-once delivery`, não `exactly-once`.

Na prática, isso significa:

- mensagens podem ser reenviadas
- consumidores precisam ser idempotentes
- o sistema privilegia confiabilidade e recuperação sobre deduplicação implícita do broker

### Consistência eventual

Não existe transação distribuída entre os três serviços. Cada serviço confirma seu estado local e reage a eventos de forma assíncrona.

Consequências práticas:

- o pedido pode existir como `CREATED` antes do pagamento ser concluído
- o pedido pode ficar `PAID` antes da notificação ser enviada
- a convergência do estado depende do processamento dos consumidores

Esse é um trade-off intencional para ganhar desacoplamento e tolerância a falhas.

### Cenários de falha suportados

| Cenário | Comportamento esperado |
| --- | --- |
| `payment-transient` | o pagamento falha nas primeiras tentativas, entra em retry e depois conclui |
| `payment-permanent` | a mensagem excede tentativas e vai para `payment-service.order-created.dlq` |
| `notification-transient` | o pagamento conclui, a notificação falha temporariamente e depois converge |
| `notification-permanent` | o pedido tende a permanecer `PAID`, e a mensagem vai para `notification-service.payment-processed.dlq` |

### Limitações conhecidas

- Não há `Outbox Pattern`, então existe risco entre persistir estado local e publicar evento
- Não há `Inbox Pattern`, então deduplicação é orientada por regra de negócio e banco
- Não há tracing distribuído completo com spans
- Não há política de reprocessamento automatizado de DLQ

Essas limitações são conscientes e ajudam a mostrar onde um sistema de produção evoluiria em seguida.

## 9. 📊 Diferenciais técnicos

- Arquitetura desacoplada por contexto de negócio, sem banco compartilhado
- Comunicação assíncrona baseada em eventos de domínio
- Estratégia explícita de `retry`, `TTL` e `DLQ`
- Consumidores idempotentes com reforço em regra de negócio e restrição de banco
- Propagação de `correlationId` entre HTTP e mensageria
- Logs estruturados para facilitar troubleshooting
- Demonstração de stack poliglota com interoperabilidade entre `NestJS` e `.NET`
- Separação em camadas inspirada em Clean Architecture
- Escalabilidade horizontal por serviço, principalmente em `Payment` e `Notification`
- Base excelente para discutir consistência eventual, failure modes e trade-offs em entrevistas técnicas

## 10. 🔮 Melhorias futuras

- Implementar `Transactional Outbox` e `Inbox Pattern`
- Introduzir `Saga Pattern` para coordenação explícita do fluxo distribuído
- Adicionar `API Gateway` ou `BFF` na borda
- Instrumentar com `OpenTelemetry`, `Prometheus`, `Grafana` e `Jaeger`
- Criar estratégia de reprocessamento de DLQ com tooling operacional
- Adicionar autenticação, autorização e segregação de tenants
- Aplicar `Circuit Breaker`, `Bulkhead` e `Rate Limiting`
- Evoluir contratos com versionamento e governança formal de schema
- Avaliar Kafka em cenários que exijam retenção longa, replay histórico e consumo em larga escala
- Preparar deploy para Kubernetes com autoscaling e observabilidade centralizada

## 11. 🧩 Estrutura do repositório

```text
.
├── docker-compose.yml
├── libs
│   └── node-common
│       ├── src/contracts
│       ├── src/observability
│       └── src/rabbitmq
├── services
│   ├── order-service
│   │   └── src
│   │       ├── application
│   │       ├── domain
│   │       ├── infrastructure
│   │       └── presentation
│   ├── payment-service
│   │   └── src
│   │       ├── application
│   │       ├── domain
│   │       ├── infrastructure
│   │       └── presentation
│   └── notification-service
│       └── NotificationService
│           ├── Application
│           ├── Contracts
│           ├── Domain
│           ├── Infrastructure
│           └── Observability
└── scripts
```

## 12. ✅ Verificação local

O projeto compila localmente com:

```bash
npm run build:all
```

Esse comando cobre:

- biblioteca compartilhada de contratos e infraestrutura RabbitMQ
- `Order Service`
- `Payment Service`
- `Notification Service`

## 13. 📝 Considerações finais

Este projeto não tenta simular apenas “três serviços conversando”. Ele foi estruturado para evidenciar decisões que aparecem em sistemas reais:

- onde aceitar consistência eventual
- como tratar falhas transitórias vs permanentes
- como evitar duplicidade em consumo assíncrono
- por que banco por serviço importa
- quando RabbitMQ é uma escolha melhor do que Kafka para workflows orientados a fila

Como material de portfólio, o valor principal está menos no domínio em si e mais na clareza das decisões arquiteturais, dos trade-offs assumidos e do caminho de evolução para produção.
