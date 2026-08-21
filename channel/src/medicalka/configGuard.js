function checkMedicalkaPartnerConfig(config) {
  if (config.medicalkaPartner.subOrdersEnabled && !config.medicalkaPartner.enabled) {
    throw new Error('MEDICALKA_SUBORDERS_ENABLED requires MEDICALKA_INBOUND_ENABLED');
  }
  if (config.medicalkaPartner.subOrdersEnabled && !config.billzWriteEnabled) {
    throw new Error('MEDICALKA_SUBORDERS_ENABLED requires BILLZ_WRITE_ENABLED');
  }
  if (config.medicalkaPartner.subOrdersEnabled && config.medicalkaPartner.legacyOrdersEnabled) {
    throw new Error(
      'MEDICALKA_SUBORDERS_ENABLED requires MEDICALKA_LEGACY_ORDERS_ENABLED=false'
    );
  }
  if (!config.medicalkaPartner.enabled) return;
  const missing = [];
  if (!config.medicalkaPartner.username) missing.push('MEDICALKA_PARTNER_USERNAME');
  if (!config.medicalkaPartner.password) missing.push('MEDICALKA_PARTNER_PASSWORD');
  if (!/^https:\/\//i.test(config.medicalkaPartner.baseUrl) && config.env === 'production') {
    missing.push('MEDICALKA_PARTNER_BASE_URL (HTTPS)');
  }
  if (missing.length) {
    throw new Error(`MEDICALKA_INBOUND_ENABLED is on but ${missing.join(', ')} is not set`);
  }
}

module.exports = { checkMedicalkaPartnerConfig };
