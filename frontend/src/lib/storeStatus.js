export function formatStoreDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function buildStoreClosedMessage(storeStatus) {
  const nextChangeAt = storeStatus?.next_change_at;
  const nextChangeAction = storeStatus?.next_change_action;
  if (nextChangeAction === "open" && nextChangeAt) {
    return `Marketstore is closed. Open time: ${formatStoreDateTime(nextChangeAt)}.`;
  }
  return "Marketstore is closed right now.";
}
