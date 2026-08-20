# Plugando WhatsApp e Asaas de verdade

O produto v1 roda com drivers **mock**: eles fazem tudo que os reais fariam,
menos a chamada externa. Trocar por um provedor de verdade é **acrescentar um
driver e mudar um binding** — nenhum módulo de negócio muda.

Esta é a promessa da regra 5 do `SPEC.md`, e ela é verificável:

```bash
# Nenhum módulo de negócio importa driver concreto. Deve dar VAZIO.
grep -rn "MockNotificationDriver\|MockPaymentDriver\|MockMailDriver" \
  apps/api/src --include=*.ts | grep -v "^apps/api/src/adapters/"
```

Os módulos injetam os símbolos `NOTIFICATION_ADAPTER`, `PAYMENT_ADAPTER` e
`MAIL_ADAPTER`. Quem conhece classe concreta é um arquivo só:
`apps/api/src/adapters/adapters.module.ts`.

## Os três passos

Vale para qualquer um dos três adapters.

### 1. Escreva o driver ao lado do mock

O contrato está na interface, com os campos documentados um a um:

| Adapter | Interface | Driver mock |
|---|---|---|
| WhatsApp | `adapters/notification/notification.adapter.ts` | `mock-notification.driver.ts` |
| Pagamento | `adapters/payment/payment.adapter.ts` | `mock-payment.driver.ts` |
| E-mail | `adapters/mail/mail.adapter.ts` | `mock-mail.driver.ts` |

```ts
// apps/api/src/adapters/notification/whatsapp-cloud.driver.ts
@Injectable()
export class WhatsappCloudDriver implements NotificationAdapter {
  async send(params: SendNotificationParams): Promise<SendNotificationResult> { /* ... */ }
  async dispatchDue(params?): Promise<DispatchDueResult> { /* ... */ }
}
```

**Continue gravando no outbox.** `NotificationOutbox`/`MailOutbox` são a trilha
que a tela "Mensagens" do super admin lê, e o que permite reprocessar o que
falhou. O driver real grava a linha e guarda o id do provedor em `payload`.

Sobre `dispatchDue`: ele existe porque `scheduledFor` faz parte do contrato de
`send` e alguém precisa cumpri-lo. Um provedor com agendamento nativo já
entregou sozinho e devolve zeros; o mock varre o próprio outbox. O job da fila
chama o método sem saber qual dos dois está do outro lado.

### 2. Abra o enum do env

`apps/api/src/config/env.schema.ts`:

```diff
- NOTIFICATION_DRIVER: z.enum(['mock']).default('mock'),
+ NOTIFICATION_DRIVER: z.enum(['mock', 'whatsapp-cloud']).default('mock'),
+ WHATSAPP_TOKEN: z.string().min(1).optional(),
+ WHATSAPP_PHONE_ID: z.string().min(1).optional(),
```

Acrescente os campos novos a `AppConfig` (`configuration.ts`). A lista de
chaves lidas do ambiente sai de `ENV_KEYS`, derivado do próprio schema — não há
segunda lista para manter em dia.

### 3. Acrescente o `case` na factory

`apps/api/src/adapters/adapters.module.ts`:

```diff
  providers: [
    MockNotificationDriver,
+   WhatsappCloudDriver,
    {
      provide: NOTIFICATION_ADAPTER,
-     inject: [CONFIG, MockNotificationDriver],
-     useFactory: (config: AppConfig, mock: MockNotificationDriver) => {
+     inject: [CONFIG, MockNotificationDriver, WhatsappCloudDriver],
+     useFactory: (config, mock, cloud) => {
        switch (config.drivers.notification) {
          case 'mock':
            return mock;
+         case 'whatsapp-cloud':
+           return cloud;
        }
      },
    },
```

E no `.env`: `NOTIFICATION_DRIVER=whatsapp-cloud`.

Pronto. Nenhum arquivo de `booking/`, `pos/`, `client-account/` ou `admin/`
foi tocado.

## Asaas — o que o contrato já prevê

`PaymentAdapter` tem os seis métodos que um gateway precisa
(`createCharge`, `createSubscription`, `getCharge`, `cancelCharge`,
`refundCharge`, `simulateTransition`).

Dois pontos ao plugar o Asaas real:

- **`simulateTransition` não existe em gateway de verdade.** Ele é o
  "aprovar/recusar manual" que o super admin usa enquanto o driver é mock. O
  driver real deve responder `501` — a tela de billing já trata o erro.
- **Webhooks não estão no contrato.** O mock avança o ciclo por chamada
  direta; o Asaas avança por webhook. Acrescente um controller
  (`POST /webhooks/asaas`) que valide a assinatura e chame os MESMOS serviços
  que a tela de billing chama hoje (`AdminBillingService.approveInvoice` /
  `.rejectInvoice`). Isso é acréscimo, não refatoração.

## Validando a troca

O driver real não precisa de teste novo de negócio: a suíte já cobre o
comportamento pelo lado do adapter. O que vale testar é o driver em si
(requisição montada, erro do provedor virando falha tratada).

Para conferir que o binding pegou, o log do boot diz qual driver está ativo:

```
INFO: adapters registrados {"drivers":{"notification":"whatsapp-cloud", ...}}
```

## Fora de escopo do v1

| Item | Caminho |
|---|---|
| WhatsApp oficial | este guia |
| Asaas | este guia + webhook |
| Google OAuth do cliente | mesmo padrão de adapter; o botão existe e responde "Em breve" |
| Provedor real do Assistente IA | `AI_ASSISTANT_ADAPTER`, mesma factory |
| Upload de logo/capa | hoje é campo de URL; precisa de storage (S3/R2) antes |
