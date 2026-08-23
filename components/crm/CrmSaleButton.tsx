"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";

type SellerOption = {
  id: string;
  name: string;
};

function parseAmountPreview(raw: string): number {
  const match = String(raw).match(/-?[0-9][0-9.,]*/);
  if (!match) return NaN;
  let token = match[0];
  const lastComma = token.lastIndexOf(",");
  const lastDot = token.lastIndexOf(".");
  if (lastComma > lastDot) token = token.replace(/\./g, "").replace(",", ".");
  else if (lastDot > -1 && lastComma > -1) token = token.replace(/,/g, "");
  else if (lastDot > -1 && token.length - lastDot - 1 === 3 && token.split(".").length === 2) token = token.replace(/\./g, "");
  const amount = Number(token.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : NaN;
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function CrmSaleButton({ sellerMode = false, triggerStyleOverride }: { sellerMode?: boolean; triggerStyleOverride?: CSSProperties } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [sellerRecordId, setSellerRecordId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [paymentMethod, setPaymentMethod] = useState("Transferencia");
  const [status, setStatus] = useState("Confirmada");
  const [observations, setObservations] = useState("");
  const [receipts, setReceipts] = useState<File[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const parsedAmount = parseAmountPreview(amount);
  const canSubmit =
    description.trim() && amount.trim() && Number.isFinite(parsedAmount) && parsedAmount > 0 && purchaseDate && !submitting &&
    (!sellerMode || receipts.length > 0);
  const receiptLabel = useMemo(() => {
    if (!receipts.length) return "Sin comprobantes adjuntos";
    return receipts.length === 1
      ? receipts[0].name
      : `${receipts.length} comprobantes adjuntos`;
  }, [receipts]);

  useEffect(() => {
    if (!open) return;

    setSellerRecordId("");
    setDescription("");
    setAmount("");
    setPurchaseDate(todayInputValue());
    setPaymentMethod("Transferencia");
    setStatus("Confirmada");
    setObservations("");
    setReceipts([]);
    setError("");
    setSuccess("");
    if (sellerMode) {
      // La venta va a nombre del vendedor logueado (lo fuerza el servidor);
      // no hace falta cargar el selector.
      setLoadingOptions(false);
      return;
    }
    setLoadingOptions(true);

    fetch("/api/sales/options")
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          sellers?: SellerOption[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            data.error ?? "No se pudieron cargar los vendedores.",
          );
        setSellers(data.sellers ?? []);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "No se pudieron cargar los vendedores.",
        ),
      )
      .finally(() => setLoadingOptions(false));
  }, [open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    const form = new FormData();
    form.set("standalone", "true");
    form.set("sellerRecordId", sellerRecordId);
    form.set("description", description.trim());
    form.set("amount", amount.trim());
    form.set("purchaseDate", purchaseDate);
    form.set("paymentMethod", paymentMethod);
    form.set("status", status);
    form.set("observations", observations.trim());
    receipts.forEach((receipt) => form.append("receipts", receipt));

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        body: form,
      });
      const result = (await response.json().catch(() => ({}))) as {
        saleId?: string;
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("El comprobante es demasiado pesado (límite 4,5 MB por carga). Comprimí el archivo o cargalo en dos ventas.");
        }
        throw new Error(result.error ?? `No se pudo registrar la venta (error ${response.status}).`);
      }
      setSuccess(
        `Venta registrada${result.saleId ? ` (${result.saleId})` : ""}.`,
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "No se pudo registrar la venta.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ ...triggerStyle, ...triggerStyleOverride }}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>
          +
        </span>
        Registrar venta
      </button>

      {open ? (
        <div
          style={overlayStyle}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting)
              setOpen(false);
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={modalStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-sale-title"
          >
            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 18,
                padding: "22px 24px",
                borderBottom: "1px solid #20202c",
              }}
            >
              <div>
                <p style={eyebrowStyle}>Venta del negocio</p>
                <h2
                  id="crm-sale-title"
                  style={{ margin: 0, color: "#f2f2f4", fontSize: 22 }}
                >
                  Registrar venta
                </h2>
                <p
                  style={{
                    margin: "7px 0 0",
                    color: "#848494",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  {sellerMode
                    ? "La venta se registra a tu nombre. El comprobante de pago es obligatorio."
                    : "El vendedor es opcional. Las ventas generales suman al total del negocio, pero no al ranking individual."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                aria-label="Cerrar"
                style={closeButtonStyle}
              >
                x
              </button>
            </header>

            <div style={{ padding: 24, display: "grid", gap: 15 }}>
              {!sellerMode && (
                <label style={fieldStyle}>
                  <span style={labelStyle}>Vendedor responsable (opcional)</span>
                  <select
                    value={sellerRecordId}
                    onChange={(event) => setSellerRecordId(event.target.value)}
                    disabled={loadingOptions || submitting}
                    style={inputStyle}
                  >
                    <option value="">
                      {loadingOptions
                        ? "Cargando vendedores..."
                        : "Venta general - sin vendedor"}
                    </option>
                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>
                        {seller.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label style={fieldStyle}>
                <span style={labelStyle}>Descripcion de la venta</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  placeholder="Ej: Venta mostrador - roller blackout e instalacion"
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    lineHeight: 1.45,
                  }}
                  required
                />
              </label>

              <div style={twoColumnsStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Monto</span>
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="Ej: 350000"
                    style={inputStyle}
                    required
                  />
                  {amount.trim() ? (
                    <span style={{ fontSize: 11, color: Number.isFinite(parsedAmount) && parsedAmount > 0 ? "#6bdda1" : "#ff8a8a" }}>
                      {Number.isFinite(parsedAmount) && parsedAmount > 0
                        ? `Se registrará: ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(parsedAmount)}`
                        : "No se reconoce el monto — ingresá solo el número, ej: 358065,05"}
                    </span>
                  ) : null}
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Fecha de compra</span>
                  <input
                    value={purchaseDate}
                    onChange={(event) => setPurchaseDate(event.target.value)}
                    type="date"
                    style={inputStyle}
                    required
                  />
                </label>
              </div>

              <div style={twoColumnsStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Metodo de pago</span>
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                    style={inputStyle}
                  >
                    <option>Transferencia</option>
                    <option>Tarjeta</option>
                    <option>Efectivo</option>
                    <option>Cheque</option>
                    <option>Otro</option>
                  </select>
                </label>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Estado</span>
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    style={inputStyle}
                  >
                    <option>Confirmada</option>
                    <option>Pendiente de pago</option>
                    <option>Cancelada</option>
                  </select>
                </label>
              </div>

              <div style={fieldStyle}>
                <span style={labelStyle}>{sellerMode ? "Comprobante de pago (obligatorio)" : "Comprobantes (opcional)"}</span>
                <input
                  id="crm-sale-receipts"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const selected = Array.from(event.target.files ?? []);
                    if (selected.length)
                      setReceipts((current) => [...current, ...selected]);
                    event.currentTarget.value = "";
                  }}
                />
                <label
                  htmlFor="crm-sale-receipts"
                  style={{
                    ...inputStyle,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      color: receipts.length ? "#f2f2f4" : "#666676",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {receiptLabel}
                  </span>
                  <strong style={{ color: "#8ab4ff" }}>Adjuntar</strong>
                </label>
                {receipts.map((receipt, index) => (
                  <div
                    key={`${receipt.name}-${receipt.lastModified}-${index}`}
                    style={receiptRowStyle}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {receipt.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setReceipts((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      style={removeButtonStyle}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>

              <label style={fieldStyle}>
                <span style={labelStyle}>Observaciones</span>
                <textarea
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                  rows={2}
                  placeholder="Opcional"
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                    lineHeight: 1.45,
                  }}
                />
              </label>

              {error ? <div style={errorStyle}>{error}</div> : null}
              {success ? (
                <div style={successStyle}>
                  {success} El tablero ya fue actualizado.
                </div>
              ) : null}
            </div>

            <footer
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "16px 24px 22px",
                borderTop: "1px solid #20202c",
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                style={secondaryButtonStyle}
              >
                {success ? "Cerrar" : "Cancelar"}
              </button>
              {!success ? (
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    ...primaryButtonStyle,
                    opacity: canSubmit ? 1 : 0.45,
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                >
                  {submitting ? "Registrando..." : "Registrar venta"}
                </button>
              ) : null}
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}

const triggerStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(24,93,232,0.60)",
  background: "#185de8",
  color: "#fff",
  borderRadius: 6,
  padding: "9px 14px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  overflowY: "auto",
  background: "rgba(0,0,0,0.76)",
  backdropFilter: "blur(7px)",
};

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "calc(100vh - 40px)",
  overflowY: "auto",
  color: "#e4e4e8",
  background: "#0a0a0f",
  border: "1px solid #252532",
  borderRadius: 10,
  boxShadow: "0 28px 90px rgba(0,0,0,0.55)",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 7px",
  color: "#8ab4ff",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const closeButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  width: 34,
  height: 34,
  border: "1px solid #292936",
  background: "#12121a",
  color: "#a8a8b3",
  borderRadius: 6,
  cursor: "pointer",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
};

const labelStyle: CSSProperties = {
  color: "#a8a8b3",
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #292936",
  background: "#12121a",
  color: "#f2f2f4",
  borderRadius: 6,
  padding: "11px 12px",
  font: "inherit",
  fontSize: 13,
  outline: "none",
};

const twoColumnsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 12,
};

const receiptRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  border: "1px solid #242431",
  background: "#0f0f16",
  borderRadius: 6,
  padding: "8px 10px",
  color: "#a8a8b3",
  fontSize: 12,
};

const removeButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "#fca5a5",
  padding: 0,
  fontWeight: 800,
  cursor: "pointer",
};

const errorStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.30)",
  background: "rgba(239,68,68,0.08)",
  color: "#fca5a5",
  borderRadius: 6,
  padding: "11px 12px",
  fontSize: 12,
  lineHeight: 1.45,
};

const successStyle: CSSProperties = {
  border: "1px solid rgba(107,221,161,0.30)",
  background: "rgba(107,221,161,0.08)",
  color: "#8ee5b6",
  borderRadius: 6,
  padding: "11px 12px",
  fontSize: 12,
  lineHeight: 1.45,
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid #292936",
  background: "#12121a",
  color: "#e4e4e8",
  borderRadius: 6,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(24,93,232,0.65)",
  background: "#185de8",
  color: "#fff",
  borderRadius: 6,
  padding: "10px 15px",
  fontWeight: 900,
};
