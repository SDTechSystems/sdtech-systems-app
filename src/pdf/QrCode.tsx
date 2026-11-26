import { Rect, Svg } from "@react-pdf/renderer";
import qrcode from "qrcode-generator";

const MARGIN = 2;

/** El QR del pie dibujado con rectángulos (un tramo por cada racha de módulos oscuros de una fila). */
export function QrCode({ text, size }: { text: string; size: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const runs: { x: number; y: number; w: number }[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.isDark(y, x)) continue;
      const start = x;
      while (x + 1 < n && qr.isDark(y, x + 1)) x++;
      runs.push({ x: start, y, w: x - start + 1 });
    }
  }
  const box = n + MARGIN * 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
      <Rect x={0} y={0} width={box} height={box} fill="#FFFFFF" />
      {runs.map((r) => (
        <Rect key={`${r.x}-${r.y}`} x={r.x + MARGIN} y={r.y + MARGIN} width={r.w} height={1} fill="#000000" />
      ))}
    </Svg>
  );
}
