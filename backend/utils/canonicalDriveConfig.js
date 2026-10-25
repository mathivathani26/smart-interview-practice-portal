function selectCanonicalDriveConfig(pattern, legacyDrives = [], { includeDraft = false } = {}) {
  const orderedDrives = [...legacyDrives].sort((left, right) => {
    const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftDate !== rightDate) return leftDate - rightDate;
    return String(left._id || "").localeCompare(String(right._id || ""));
  });
  if (pattern && pattern.round_sequence.length > 0) {
    return {
      round_sequence: pattern.round_sequence,
      legacy: false,
      legacy_drive_count: legacyDrives.length,
    };
  }

  const published = orderedDrives.filter((drive) => drive.status === "published");
  const candidates = published.length ? published : (includeDraft ? orderedDrives : []);
  const drive = candidates[0];
  if (!drive) {
    return {
      round_sequence: [],
      legacy: false,
      legacy_drive_count: legacyDrives.length,
    };
  }

  return {
    round_sequence: drive.round_sequence,
    legacy: true,
    legacy_drive_name: drive.name,
    legacy_drive_status: drive.status,
    legacy_drive_count: legacyDrives.length,
  };
}

module.exports = { selectCanonicalDriveConfig };
