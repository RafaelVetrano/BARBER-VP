import { Global, Inject, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';
import { NOTIFICATION_ADAPTER } from './notification/notification.adapter';
import { MockNotificationDriver } from './notification/mock-notification.driver';
import { MAIL_ADAPTER } from './mail/mail.adapter';
import { MockMailDriver } from './mail/mock-mail.driver';
import { PAYMENT_ADAPTER } from './payment/payment.adapter';
import { MockPaymentDriver } from './payment/mock-payment.driver';
import { AI_ASSISTANT_ADAPTER } from '../assistant/ai-assistant.adapter';
import { MockAiAssistantDriver } from '../assistant/mock-ai-assistant.driver';
import { STORAGE_ADAPTER } from './storage/storage.adapter';
import { LocalStorageDriver } from './storage/local-storage.driver';

/**
 * Único lugar do projeto que conhece drivers concretos.
 *
 * Trocar mock → real (fase 09) é acrescentar um `case` na factory e o driver ao
 * lado do mock — módulo de negócio nenhum muda, porque todos injetam o símbolo
 * (`NOTIFICATION_ADAPTER`, `PAYMENT_ADAPTER`, `MAIL_ADAPTER`), nunca a classe.
 */
@Global()
@Module({
  providers: [
    MockNotificationDriver,
    MockMailDriver,
    MockPaymentDriver,
    MockAiAssistantDriver,
    LocalStorageDriver,
    {
      provide: NOTIFICATION_ADAPTER,
      inject: [CONFIG, MockNotificationDriver],
      useFactory: (config: AppConfig, mock: MockNotificationDriver) => {
        switch (config.drivers.notification) {
          case 'mock':
            return mock;
        }
      },
    },
    {
      provide: MAIL_ADAPTER,
      inject: [CONFIG, MockMailDriver],
      useFactory: (config: AppConfig, mock: MockMailDriver) => {
        switch (config.drivers.mail) {
          case 'mock':
            return mock;
        }
      },
    },
    {
      provide: PAYMENT_ADAPTER,
      inject: [CONFIG, MockPaymentDriver],
      useFactory: (config: AppConfig, mock: MockPaymentDriver) => {
        switch (config.drivers.payment) {
          case 'mock':
            return mock;
        }
      },
    },
    {
      provide: AI_ASSISTANT_ADAPTER,
      inject: [CONFIG, MockAiAssistantDriver],
      useFactory: (config: AppConfig, mock: MockAiAssistantDriver) => {
        switch (config.drivers.aiAssistant) {
          case 'mock':
            return mock;
        }
      },
    },
    {
      provide: STORAGE_ADAPTER,
      inject: [CONFIG, LocalStorageDriver],
      useFactory: (config: AppConfig, local: LocalStorageDriver) => {
        switch (config.storage.driver) {
          case 'local':
            return local;
        }
      },
    },
  ],
  exports: [
    NOTIFICATION_ADAPTER,
    MAIL_ADAPTER,
    PAYMENT_ADAPTER,
    AI_ASSISTANT_ADAPTER,
    STORAGE_ADAPTER,
  ],
})
export class AdaptersModule {
  constructor(@Inject(CONFIG) config: AppConfig, logger: PinoLogger) {
    logger.setContext(AdaptersModule.name);
    logger.info(
      { drivers: { ...config.drivers, storage: config.storage.driver } },
      'adapters registrados',
    );
  }
}
