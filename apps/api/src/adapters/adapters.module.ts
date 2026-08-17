import { Global, Inject, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../config/configuration';
import { NOTIFICATION_ADAPTER } from './notification/notification.adapter';
import { MockNotificationDriver } from './notification/mock-notification.driver';
import { MAIL_ADAPTER } from './mail/mail.adapter';
import { MockMailDriver } from './mail/mock-mail.driver';
import { PAYMENT_ADAPTER } from './payment/payment.adapter';
import { MockPaymentDriver } from './payment/mock-payment.driver';

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
  ],
  exports: [NOTIFICATION_ADAPTER, MAIL_ADAPTER, PAYMENT_ADAPTER],
})
export class AdaptersModule {
  constructor(@Inject(CONFIG) config: AppConfig, logger: PinoLogger) {
    logger.setContext(AdaptersModule.name);
    logger.info({ drivers: config.drivers }, 'adapters registrados');
  }
}
