/** Stand-in for the patient-facing AI agent: a keyword rule, not a model. The real agent
 * answers through the same `conversation.ai_reply` command (see docs/DECISOES.md). */
export function simulatedAiReply(patientText: string): { text: string; handoff?: string } {
  if (/atendente|humano|remarcar|remarcação|remarcacao/i.test(patientText)) {
    return {
      text: 'Vou encaminhar sua solicitação à recepção. Um atendente poderá ajudar a seguir. (Resposta simulada)',
      handoff: /remarc/i.test(patientText) ? 'Pedido de remarcação' : 'Solicitação de atendimento humano',
    };
  }
  return { text: 'Recebi sua mensagem. Nesta demonstração, posso encaminhar dúvidas administrativas à recepção. Para falar com uma pessoa, escreva “atendente”. (Resposta simulada)' };
}
