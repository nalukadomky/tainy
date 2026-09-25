import "server-only";
import QRCode from "qrcode";
import { spayd, type PaymentInfo } from "@/lib/payment";

/** QR kód platby jako data URI — vykreslí se přímo do <img>. Jen na serveru. */
export async function paymentQrDataUrl(p: PaymentInfo): Promise<string> {
  return QRCode.toDataURL(spayd(p), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
    color: { dark: "#1e2a20", light: "#ffffff" },
  });
}
