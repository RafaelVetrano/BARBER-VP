/**
 * Ponto de entrada do `ClienteAuth`.
 *
 * A fase 04 (wizard de agendamento) e a página pública da barbearia importam
 * daqui — nunca das telas internas, que podem ser reorganizadas sem quebrar
 * quem consome.
 */
export {
  ClienteAuthSheet,
  type ClienteAuthMode,
  type ClienteAuthSheetProps,
  type OtpContext,
} from './cliente-auth-sheet';
