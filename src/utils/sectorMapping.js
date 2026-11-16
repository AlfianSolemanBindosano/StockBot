'use strict';

/**
 * Static mapping of IDX tickers to sectors.
 * This acts as a fallback when API sector data is unavailable.
 */
const SECTOR_MAPPING = {
  // Energy
  'ADRO.JK': 'Energy', 'ITMG.JK': 'Energy', 'PTBA.JK': 'Energy', 'MEDC.JK': 'Energy', 
  'AKRA.JK': 'Energy', 'PGAS.JK': 'Energy', 'HRUM.JK': 'Energy', 'ELSA.JK': 'Energy',
  'RAJA.JK': 'Energy', 'DOID.JK': 'Energy',

  // Basic Materials
  'TPIA.JK': 'BasicMaterials', 'BRPT.JK': 'BasicMaterials', 'MDKA.JK': 'BasicMaterials', 
  'ANTM.JK': 'BasicMaterials', 'INCO.JK': 'BasicMaterials', 'TINS.JK': 'BasicMaterials', 
  'SMGR.JK': 'BasicMaterials', 'INTP.JK': 'BasicMaterials', 'INKP.JK': 'BasicMaterials', 
  'TKIM.JK': 'BasicMaterials', 'MBMA.JK': 'BasicMaterials',

  // Industrials
  'ASII.JK': 'Industrials', 'UNTR.JK': 'Industrials', 'BMTR.JK': 'Industrials',

  // Consumer Non-Cyclicals
  'ICBP.JK': 'ConsumerNonCyclical', 'INDF.JK': 'ConsumerNonCyclical', 'UNVR.JK': 'ConsumerNonCyclical', 
  'AMRT.JK': 'ConsumerNonCyclical', 'CPIN.JK': 'ConsumerNonCyclical', 'KLBF.JK': 'ConsumerNonCyclical', 
  'MYOR.JK': 'ConsumerNonCyclical', 'GGRM.JK': 'ConsumerNonCyclical', 'HMSP.JK': 'ConsumerNonCyclical',

  // Consumer Cyclicals
  'MAPI.JK': 'ConsumerCyclical', 'ACES.JK': 'ConsumerCyclical', 'ERAA.JK': 'ConsumerCyclical', 
  'MAPA.JK': 'ConsumerCyclical',

  // Healthcare
  'MIKA.JK': 'Healthcare', 'HEAL.JK': 'Healthcare', 'SILO.JK': 'Healthcare',

  // Financials
  'BBCA.JK': 'Financials', 'BBRI.JK': 'Financials', 'BMRI.JK': 'Financials', 
  'BBNI.JK': 'Financials', 'BRIS.JK': 'Financials', 'ARTO.JK': 'Financials', 
  'BDMN.JK': 'Financials', 'PNBN.JK': 'Financials', 'BBTN.JK': 'Financials',

  // Properties & Real Estate
  'BSDE.JK': 'Property', 'PWON.JK': 'Property', 'CTRA.JK': 'Property', 
  'SMRA.JK': 'Property', 'DFAM.JK': 'Property', 'ICON.JK': 'Property',

  // Technology
  'GOTO.JK': 'Technology', 'BUKA.JK': 'Technology', 'EMTK.JK': 'Technology', 
  'WIRG.JK': 'Technology',

  // Infrastructure
  'TLKM.JK': 'Infrastructure', 'JSMR.JK': 'Infrastructure', 'EXCL.JK': 'Infrastructure', 
  'ISAT.JK': 'Infrastructure', 'BREN.JK': 'Infrastructure', 'PGEO.JK': 'Infrastructure',

  // Transportation & Logistic
  'BIRD.JK': 'Transportation', 'ASSA.JK': 'Transportation', 'TMAS.JK': 'Transportation'
};

const SECTOR_PROXIES = {
  'Energy': ['ADRO.JK', 'ITMG.JK', 'PTBA.JK', 'MEDC.JK'],
  'BasicMaterials': ['TPIA.JK', 'BRPT.JK', 'MDKA.JK', 'ANTM.JK'],
  'Industrials': ['ASII.JK', 'UNTR.JK'],
  'ConsumerNonCyclical': ['ICBP.JK', 'INDF.JK', 'UNVR.JK', 'AMRT.JK'],
  'ConsumerCyclical': ['MAPI.JK', 'ACES.JK'],
  'Healthcare': ['MIKA.JK', 'HEAL.JK'],
  'Financials': ['BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK'],
  'Property': ['BSDE.JK', 'PWON.JK', 'CTRA.JK'],
  'Technology': ['GOTO.JK', 'BUKA.JK', 'EMTK.JK'],
  'Infrastructure': ['TLKM.JK', 'JSMR.JK', 'ISAT.JK'],
  'Transportation': ['BIRD.JK', 'ASSA.JK']
};

function getSectorForTicker(ticker) {
  return SECTOR_MAPPING[ticker] || 'Lainnya';
}

module.exports = {
  SECTOR_MAPPING,
  SECTOR_PROXIES,
  getSectorForTicker
};
