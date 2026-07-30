export function buildWhatsAppCollectionMessage(params: {
  contactName: string;
  businessName: string;
  amount: number;
  currency: string;
  dueDate?: Date | null;
}) {
  const formattedAmount = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: params.currency,
    maximumFractionDigits: 0,
  }).format(params.amount);

  const dueLine = params.dueDate
    ? ` con fecha límite ${params.dueDate.toLocaleDateString("es-CO")}`
    : "";

  return `Hola ${params.contactName}! 👋 Te escribimos de *${params.businessName}* para recordarte amablemente tu saldo pendiente de ${formattedAmount}${dueLine}. Agradecemos tu pronto pago. ¡Gracias por tu confianza!`;
}
