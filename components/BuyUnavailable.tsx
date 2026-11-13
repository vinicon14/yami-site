export function BuyUnavailable() {
  return (
    <div className="card mt-8 px-5 py-6" role="status">
      <p className="text-2xl font-semibold">Em breve</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        A compra ainda não está aberta neste ambiente. A licença e o download só
        são liberados depois que o Mercado Pago confirma o pagamento — e essa
        confirmação ainda está sendo ligada. Volte em instantes, ou entre na
        sua conta se você já tiver comprado.
      </p>
    </div>
  );
}
