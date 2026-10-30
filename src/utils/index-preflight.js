const uniqueIndexChecks = [
  { label: "User.email", model: "User" },
  { label: "User.mobile", model: "User" },
  { label: "Trip.slug", model: "Trip" },
  { label: "Booking.bookingReference", model: "Booking", field: "bookingReference", partialField: "bookingReference" },
  { label: "Booking.user_idempotencyKey", model: "Booking", fields: ["user", "idempotencyKey"], partialField: "idempotencyKey" },
  { label: "RefreshSession.tokenHash", model: "RefreshSession" },
  { label: "PaymentWebhookEvent.eventId", model: "PaymentWebhookEvent" },
  { label: "NotificationOutbox.eventKey", model: "NotificationOutbox" },
];

function pipelineFor(check) {
  const field = check.field;
  const fields = check.fields || (field ? [field] : [check.label.split(".").at(-1)]);
  const groupKey = Object.fromEntries(fields.map((name) => [name, `$${name}`]));
  return [
    ...(check.partialField ? [{ $match: { [check.partialField]: { $type: "string" } } }] : []),
    { $group: { _id: groupKey, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "duplicateGroups" },
  ];
}

/** Read-only check. Returns counts only and never reports duplicate values or document data. */
export async function findUniqueIndexConflicts(models) {
  const conflicts = [];
  for (const check of uniqueIndexChecks) {
    const rows = await models[check.model].aggregate(pipelineFor(check)).allowDiskUse(true);
    const duplicateGroups = Number(rows?.[0]?.duplicateGroups || 0);
    if (duplicateGroups) conflicts.push({ index: check.label, duplicateGroups });
  }
  return conflicts;
}

export { uniqueIndexChecks };
