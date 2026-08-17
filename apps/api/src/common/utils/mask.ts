/**
 * Máscaras para log e auditoria — nenhum dado pessoal completo entra no log
 * (regra 6 do SPEC + LGPD).
 */

/** `5511987654321` → `5511*****4321` */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 8) {
    return '*'.repeat(digits.length);
  }
  return `${digits.slice(0, 4)}${'*'.repeat(digits.length - 8)}${digits.slice(-4)}`;
}

/** `rafael@exemplo.com` → `ra****@exemplo.com` */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return '***';
  }
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

/** `123.456.789-00` → `***.456.789-**` (mantém só o miolo, como a Receita faz). */
export function maskDocument(document: string): string {
  const digits = document.replace(/\D/g, '');
  if (digits.length < 6) {
    return '*'.repeat(digits.length);
  }
  return `${'*'.repeat(3)}${digits.slice(3, digits.length - 2)}${'*'.repeat(2)}`;
}
