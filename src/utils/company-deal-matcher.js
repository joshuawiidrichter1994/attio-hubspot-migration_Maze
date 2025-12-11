const AttioAPI = require('./attio-api');

class CompanyDealMatcher {
  constructor() {
    this.attio = new AttioAPI();
    this.companyCache = new Map();
    this.dealCache = new Map();
  }

  /**
   * Extract company name from Attio company record
   */
  extractAttioCompanyName(company) {
    try {
      if (company.values?.name && company.values.name.length > 0) {
        return company.values.name[0].value;
      }
      return null;
    } catch (error) {
      console.warn('Error extracting Attio company name:', error.message);
      return null;
    }
  }

  /**
   * Extract deal name from Attio deal record
   */
  extractAttioDealName(deal) {
    try {
      if (deal.values?.name && deal.values.name.length > 0) {
        return deal.values.name[0].value;
      }
      if (deal.values?.title && deal.values.title.length > 0) {
        return deal.values.title[0].value;
      }
      return null;
    } catch (error) {
      console.warn('Error extracting Attio deal name:', error.message);
      return null;
    }
  }

  /**
   * Normalize text for comparison (remove special chars, lowercase, trim)
   */
  normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ')    // Normalize whitespace
      .trim();
  }

  /**
   * Calculate text similarity using simple string matching
   */
  calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const norm1 = this.normalizeText(text1);
    const norm2 = this.normalizeText(text2);

    // Exact match
    if (norm1 === norm2) return 1.0;

    // One contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      const longer = Math.max(norm1.length, norm2.length);
      const shorter = Math.min(norm1.length, norm2.length);
      return shorter / longer;
    }

    // Simple word overlap
    const words1 = norm1.split(' ').filter(w => w.length > 2);
    const words2 = norm2.split(' ').filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;

    const overlap = words1.filter(word => words2.includes(word)).length;
    return overlap / Math.max(words1.length, words2.length);
  }

  /**
   * Fetch Attio company by ID and cache it
   */
  async getAttioCompany(companyId) {
    if (this.companyCache.has(companyId)) {
      return this.companyCache.get(companyId);
    }

    try {
      const response = await this.attio.client.get(`/v2/objects/companies/records/${companyId}`);
      const company = response.data.data;
      this.companyCache.set(companyId, company);
      return company;
    } catch (error) {
      console.warn(`Failed to fetch Attio company ${companyId}:`, error.message);
      this.companyCache.set(companyId, null);
      return null;
    }
  }

  /**
   * Fetch Attio deal by ID and cache it
   */
  async getAttioDeal(dealId) {
    if (this.dealCache.has(dealId)) {
      return this.dealCache.get(dealId);
    }

    try {
      const response = await this.attio.client.get(`/v2/objects/deals/records/${dealId}`);
      const deal = response.data.data;
      this.dealCache.set(dealId, deal);
      return deal;
    } catch (error) {
      console.warn(`Failed to fetch Attio deal ${dealId}:`, error.message);
      this.dealCache.set(dealId, null);
      return null;
    }
  }

  /**
   * Match Attio companies to HubSpot companies by name
   */
  async matchCompanies(attioCompanyIds, hubspotCompanies, minSimilarity = 0.8) {
    const matches = [];
    const unmatched = [];

    console.log(`🏢 Matching ${attioCompanyIds.length} Attio companies to ${hubspotCompanies.length} HubSpot companies`);

    for (const attioId of attioCompanyIds) {
      try {
        const attioCompany = await this.getAttioCompany(attioId);
        if (!attioCompany) {
          unmatched.push({ attioId, reason: 'Failed to fetch from Attio' });
          continue;
        }

        const attioName = this.extractAttioCompanyName(attioCompany);
        if (!attioName) {
          unmatched.push({ attioId, reason: 'No name in Attio company' });
          continue;
        }

        // Find best HubSpot match
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const hubspotCompany of hubspotCompanies) {
          const hubspotName = hubspotCompany.properties?.name;
          if (!hubspotName) continue;

          const similarity = this.calculateTextSimilarity(attioName, hubspotName);
          
          if (similarity >= minSimilarity && similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = hubspotCompany;
          }
        }

        if (bestMatch) {
          matches.push({
            attioId,
            attioName,
            hubspotId: bestMatch.id,
            hubspotName: bestMatch.properties.name,
            similarity: bestSimilarity
          });
          console.log(`✅ Matched: "${attioName}" → "${bestMatch.properties.name}" (${bestSimilarity.toFixed(2)})`);
        } else {
          unmatched.push({ attioId, attioName, reason: `No match above ${minSimilarity} threshold` });
          console.log(`❌ No match: "${attioName}"`);
        }

        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error matching company ${attioId}:`, error.message);
        unmatched.push({ attioId, reason: error.message });
      }
    }

    console.log(`🎯 Company matching results: ${matches.length} matched, ${unmatched.length} unmatched`);
    return { matches, unmatched };
  }

  /**
   * Match Attio deals to HubSpot deals by name
   */
  async matchDeals(attioDealIds, hubspotDeals, minSimilarity = 0.8) {
    const matches = [];
    const unmatched = [];

    console.log(`💼 Matching ${attioDealIds.length} Attio deals to ${hubspotDeals.length} HubSpot deals`);

    for (const attioId of attioDealIds) {
      try {
        const attioDeal = await this.getAttioDeal(attioId);
        if (!attioDeal) {
          unmatched.push({ attioId, reason: 'Failed to fetch from Attio' });
          continue;
        }

        const attioName = this.extractAttioDealName(attioDeal);
        if (!attioName) {
          unmatched.push({ attioId, reason: 'No name in Attio deal' });
          continue;
        }

        // Find best HubSpot match
        let bestMatch = null;
        let bestSimilarity = 0;

        for (const hubspotDeal of hubspotDeals) {
          const hubspotName = hubspotDeal.properties?.dealname;
          if (!hubspotName) continue;

          const similarity = this.calculateTextSimilarity(attioName, hubspotName);
          
          if (similarity >= minSimilarity && similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = hubspotDeal;
          }
        }

        if (bestMatch) {
          matches.push({
            attioId,
            attioName,
            hubspotId: bestMatch.id,
            hubspotName: bestMatch.properties.dealname,
            similarity: bestSimilarity
          });
          console.log(`✅ Matched: "${attioName}" → "${bestMatch.properties.dealname}" (${bestSimilarity.toFixed(2)})`);
        } else {
          unmatched.push({ attioId, attioName, reason: `No match above ${minSimilarity} threshold` });
          console.log(`❌ No match: "${attioName}"`);
        }

        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        console.error(`Error matching deal ${attioId}:`, error.message);
        unmatched.push({ attioId, reason: error.message });
      }
    }

    console.log(`🎯 Deal matching results: ${matches.length} matched, ${unmatched.length} unmatched`);
    return { matches, unmatched };
  }
}

module.exports = CompanyDealMatcher;