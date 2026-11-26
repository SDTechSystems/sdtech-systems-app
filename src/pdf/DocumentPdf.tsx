import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatMoney } from "../../shared/money";
import { companyLines, docFacts, MAX_DETAIL, voidMark, webLinks, type DocModel } from "../../shared/docs/model";
import { registerFonts } from "./fonts";
import { QrCode } from "./QrCode";

/** Paleta de la hoja del portal (worker/portal/doc-html.ts). */
const C = { navy: "#061C45", cyan: "#00BDE8", blue: "#2563EB", text: "#0B1B33", line: "#DCE5EF", soft: "#5B6B80", box: "#F1F5FA", red: "#DC2626" };
const MM = 72 / 25.4;
const MARGIN = 14 * MM;
const HEADER_H = 62;
const FOOTER_H = 16;
const LOGO_W = 150;
/** Columnas de la tabla: Cant., Valor unitario, Total. */
const COL = { qty: 36, unit: 88, total: 88 };

/**
 * Si la fila cabe entera en una hoja: entonces no se parte (`wrap={false}`). Cuenta los renglones
 * del detalle por lo alto: ~55 unidades por renglón en la columna de descripción, las mayúsculas
 * pesan más y la W/M el doble; caben unos 55 renglones bajo el encabezado de una hoja y se deja margen.
 * Un detalle viejo de más de 2.000 caracteres, o uno de cientos de renglones, puede seguir en la hoja siguiente.
 */
const MAX_ROW_LINES = 48;
const CHARS_PER_LINE = 55;
const charWeight = (ch: string) => (/[WMwm@%]/.test(ch) ? 1.8 : /[A-ZÁÉÍÓÚÑ]/.test(ch) ? 1.3 : 1);
function rowFitsOnePage(detail: string): boolean {
  if (detail.length > MAX_DETAIL) return false;
  let lines = 0;
  for (const paragraph of detail.split("\n")) {
    let units = 0;
    for (const ch of paragraph) units += charWeight(ch);
    lines += Math.max(1, Math.ceil(units / CHARS_PER_LINE));
  }
  return lines <= MAX_ROW_LINES;
}

const s = StyleSheet.create({
  page: { fontFamily: "SD Sans", fontSize: 9.5, color: C.text, paddingTop: MARGIN, paddingHorizontal: MARGIN, paddingBottom: MARGIN + FOOTER_H + 8 },
  // El interlineado va en el cuerpo y no en la hoja: react-pdf 4.9.2 no dibuja un texto con `render` que herede lineHeight.
  body: { fontSize: 9.5, lineHeight: 1.4 },
  header: { height: HEADER_H, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 4, borderBottomWidth: 2.5, borderBottomColor: C.navy, marginBottom: 14 },
  logo: { width: LOGO_W, height: (LOGO_W * 207) / 720, marginLeft: -10 },
  company: { alignItems: "flex-end", textAlign: "right", fontSize: 7.5, lineHeight: 1.3, color: C.soft, maxWidth: 260 },
  companyName: { fontWeight: 700, color: C.navy, fontSize: 9.5 },
  headerRight: { width: 270, alignItems: "flex-end" },
  running: { textAlign: "right", color: C.navy, fontWeight: 700, fontSize: 10 },
  title: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", marginBottom: 4 },
  h1: { fontSize: 15, fontWeight: 700, color: C.navy, letterSpacing: 0.6 },
  num: { fontSize: 12, fontWeight: 700, color: C.blue },
  meta: { flexDirection: "row", gap: 12, marginTop: 10, marginBottom: 16 },
  box: { lineHeight: 1.4, flex: 1, backgroundColor: C.box, borderRadius: 7, paddingVertical: 9, paddingHorizontal: 11, fontSize: 8.8 },
  label: { lineHeight: 1.3, fontSize: 7, fontWeight: 700, color: C.navy, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 3 },
  intro: { marginBottom: 14, fontSize: 9.5 },
  amount: { color: C.soft, marginTop: 3 },
  amountValue: { color: C.navy, fontWeight: 700, fontSize: 13 },
  th: {
    lineHeight: 1.3,
    flexDirection: "row",
    backgroundColor: C.navy,
    color: "#FFFFFF",
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.8, borderBottomColor: C.line, paddingVertical: 5.5, paddingHorizontal: 8 },
  desc: { flex: 1, paddingRight: 8 },
  n: { textAlign: "right" },
  lineTitle: { fontWeight: 700 },
  detail: { lineHeight: 1.35, color: C.soft, fontSize: 8.2, marginTop: 1.5 },
  totals: { marginTop: 10, marginLeft: "auto", width: 230, fontSize: 9.5 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 },
  grand: { borderTopWidth: 2, borderTopColor: C.navy, fontWeight: 700, fontSize: 11.5, color: C.navy },
  minus: { color: C.soft, fontSize: 8.6 },
  balance: { fontWeight: 700, color: C.blue, fontSize: 10.5, borderTopWidth: 0.8, borderTopColor: C.line },
  pay: { marginTop: 16, borderWidth: 1.5, borderColor: C.cyan, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 12, color: C.navy },
  links: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  linkItem: { maxWidth: "100%" },
  pill: { alignSelf: "flex-start", backgroundColor: C.navy, color: "#FFFFFF", borderRadius: 99, paddingVertical: 5, paddingHorizontal: 12, fontWeight: 700, fontSize: 8.8, textDecoration: "none" },
  linkUrl: { lineHeight: 1.3, color: C.soft, fontSize: 7, marginTop: 2, paddingLeft: 4 },
  h2: { fontSize: 8.8, fontWeight: 700, color: C.navy, letterSpacing: 0.5, textTransform: "uppercase", marginTop: 16, marginBottom: 5 },
  notes: { lineHeight: 1.4, fontSize: 8.8 },
  condition: { lineHeight: 1.35, flexDirection: "row", fontSize: 8.2, color: "#33445C", marginBottom: 2.5 },
  conditionNum: { width: 14 },
  smallPrint: { lineHeight: 1.35, fontSize: 7.6, color: C.soft, marginTop: 8 },
  thanks: { marginTop: 16, fontWeight: 700, color: C.navy },
  foot: { flexDirection: "row", gap: 12, alignItems: "center", marginTop: 18, borderTopWidth: 0.8, borderTopColor: C.line, paddingTop: 12 },
  footText: { lineHeight: 1.35, flex: 1, fontSize: 8.2, color: C.soft },
  footGap: { marginTop: 5 },
  code: { fontFamily: "SD Mono", color: C.navy, letterSpacing: 1 },
  tax: { fontWeight: 700, color: C.navy },
  pageFoot: {
    position: "absolute",
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    height: FOOTER_H,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 0.8,
    borderTopColor: C.line,
    fontSize: 7.2,
    color: C.soft,
  },
  pageNum: { width: 120, textAlign: "right" },
  void: { position: "absolute", top: 330, left: 0, right: 0, textAlign: "center", fontSize: 84, fontWeight: 700, color: C.red, opacity: 0.18, letterSpacing: 8, transform: "rotate(-18deg)" },
});

const TONE = { grand: s.grand, minus: s.minus, balance: s.balance, plain: {} } as const;

/**
 * El PDF de cotización, cuenta de cobro y recibo: los mismos bloques y en el mismo orden de la
 * página del portal (renderDocHtml). Encabezado y pie se repiten en cada hoja, el encabezado de la
 * tabla también, y una fila nunca se parte entre hojas.
 */
export function DocumentPdf({ model: m, assetsBase }: { model: DocModel; assetsBase: string }) {
  registerFonts(assetsBase);
  const money = (n: number) => formatMoney(n, m.currency);
  const c = m.company;
  const facts = docFacts(m);
  const links = webLinks(m);

  return (
    <Document title={`${m.number} · ${c.name}`} author={c.name} creator={c.name} producer={c.name} language="es">
      <Page size="A4" style={s.page}>
        {m.voided && (
          <Text fixed style={s.void}>
            {voidMark(m)}
          </Text>
        )}

        <View fixed style={s.header}>
          <Image src={`${assetsBase}/brand/logo-color.png`} style={s.logo} />
          <View
            style={s.headerRight}
            render={({ pageNumber }) =>
              pageNumber === 1 ? (
                <View style={s.company}>
                  <Text style={s.companyName}>{c.name}</Text>
                  {companyLines(c).map((l) => (
                    <Text key={l}>{l}</Text>
                  ))}
                </View>
              ) : (
                <Text style={s.running}>
                  {m.title} · {m.number}
                </Text>
              )
            }
          />
        </View>

        <View style={s.body}>
          <View style={s.title}>
            <Text style={s.h1}>{m.title}</Text>
            <Text style={s.num}>{m.number}</Text>
          </View>

          <View style={s.meta} wrap={false}>
            <View style={s.box}>
              <Text style={s.label}>Para</Text>
              <Text>{m.party.name}</Text>
              {m.party.lines.map((l, i) => (
                <Text key={i}>{l}</Text>
              ))}
              {m.from && (
                <>
                  <Text style={[s.label, { marginTop: 8 }]}>De</Text>
                  <Text>{m.from}</Text>
                </>
              )}
            </View>
            <View style={s.box}>
              <Text style={s.label}>Detalles</Text>
              {facts.length ? facts.map((f, i) => <Text key={i}>{`${f.label}: ${f.value}`}</Text>) : <Text>—</Text>}
            </View>
          </View>

          {m.intro && (
            <View style={s.intro} wrap={false}>
              <Text>{m.intro.text}</Text>
              <Text style={s.amount}>
                <Text style={s.amountValue}>{money(m.intro.amount)}</Text> ({m.intro.words})
              </Text>
            </View>
          )}

          <View>
            <View fixed style={s.th}>
              <Text style={s.desc}>Descripción</Text>
              <Text style={[s.n, { width: COL.qty }]}>Cant.</Text>
              <Text style={[s.n, { width: COL.unit }]}>Valor unitario</Text>
              <Text style={[s.n, { width: COL.total }]}>Total</Text>
            </View>
            {m.lines.map((l, i) => (
              <View key={i} style={s.tr} wrap={!rowFitsOnePage(l.detail)}>
                <View style={s.desc}>
                  <Text style={s.lineTitle}>{l.title}</Text>
                  {l.detail ? <Text style={s.detail}>{l.detail}</Text> : null}
                </View>
                <Text style={[s.n, { width: COL.qty }]}>{l.quantity}</Text>
                <Text style={[s.n, { width: COL.unit }]}>{money(l.unitPrice)}</Text>
                <Text style={[s.n, { width: COL.total }]}>{money(l.total)}</Text>
              </View>
            ))}
          </View>

          <View style={s.totals} wrap={false}>
            {m.totals.map((t, i) => (
              <View key={i} style={[s.totalRow, TONE[t.tone]]}>
                <Text style={{ flex: 1 }}>{t.label}</Text>
                <Text>{`${t.tone === "minus" ? "− " : ""}${money(t.amount)}`}</Text>
              </View>
            ))}
          </View>

          {m.payment && (
            <View style={s.pay} wrap={false}>
              <Text style={s.label}>{m.payment.title}</Text>
              {m.payment.items.map((it, i) => (
                <Text key={i}>
                  <Text style={{ fontWeight: 700 }}>{it.name}</Text>
                  {it.detail ? `: ${it.detail}` : ""}
                </Text>
              ))}
            </View>
          )}

          {links.length > 0 && (
            <View style={s.links} wrap={false}>
              {links.map((l, i) => (
                <View key={i} style={s.linkItem}>
                  <Link src={l.url} style={s.pill}>
                    {l.label}
                  </Link>
                  <Text style={s.linkUrl}>{l.url}</Text>
                </View>
              ))}
            </View>
          )}

          {m.note && (
            <View>
              <Text style={s.h2} minPresenceAhead={24}>
                Nota
              </Text>
              <Text style={s.notes}>{m.note}</Text>
            </View>
          )}

          {m.conditions.length > 0 && (
            <View>
              <Text style={s.h2} minPresenceAhead={24}>
                Condiciones
              </Text>
              {m.conditions.map((l, i) => (
                <View key={i} style={s.condition} wrap={false}>
                  <Text style={s.conditionNum}>{i + 1}.</Text>
                  <Text style={{ flex: 1 }}>{l}</Text>
                </View>
              ))}
            </View>
          )}

          {m.smallPrint && <Text style={s.smallPrint}>{m.smallPrint}</Text>}
          {m.thanks && <Text style={s.thanks}>{m.thanks}</Text>}

          <View style={s.foot} wrap={false}>
            <QrCode text={m.footer.qrUrl} size={78} />
            <View style={s.footText}>
              <Text>{m.footer.qrCaption}</Text>
              {m.footer.verifyCode && (
                <Text style={s.footGap}>
                  Código de verificación: <Text style={s.code}>{m.footer.verifyCode}</Text>
                  {m.footer.verifyUrl ? `\n${m.footer.verifyUrl}` : ""}
                </Text>
              )}
              {c.taxNote ? <Text style={[s.footGap, s.tax]}>{c.taxNote}</Text> : null}
            </View>
          </View>
        </View>

        <View fixed style={s.pageFoot}>
          <Text>
            {m.number} · {c.name}
          </Text>
          <Text style={s.pageNum} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
