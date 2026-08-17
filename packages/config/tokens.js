/**
 * Paleta bruta do BarberVP — fonte única de cor do projeto.
 *
 * O `tailwind-preset.js` monta o tema a partir daqui, e quem precisa do valor
 * fora do CSS (o `themeColor` do `<meta>` das 4 apps, um SVG gerado no
 * servidor) importa deste módulo em vez de repetir o hex.
 *
 * Alterou uma cor? Altere **só aqui**.
 */
const colors = {
  // Superfícies (escala --bg / --surface / -2 / -3 do SPEC)
  bg: '#0F1115',
  surface: '#12151A',
  surface2: '#181B21',
  surface3: '#1F232B',

  // Bordas (--line / --line-2)
  line: '#2A2F38',
  line2: '#343B46',

  // Marca
  gold: '#D4A84C',
  goldHover: '#E6BE66',

  // Semânticas — um único vermelho (#E5484D do protótipo foi absorvido)
  success: '#3FB68B',
  danger: '#E05B5B',
  info: '#5B8DE0',
  warning: '#E8A13C',

  // Texto
  fg: '#F2F3F5',
  fgMuted: '#9AA1AC',
  fgSubtle: '#5B616B',
};

module.exports = { colors };
