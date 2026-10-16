export async function confirmAction(
  message: string,
  suggestedReason: string,
  action: (reason: string) => Promise<void>,
) {
  if (!window.confirm(message)) return false;
  const reason = window.prompt('Reason (required for the audit trail):', suggestedReason);
  if (!reason?.trim()) return false;
  try {
    await action(reason.trim());
    return true;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'The action could not be completed.');
    return false;
  }
}
