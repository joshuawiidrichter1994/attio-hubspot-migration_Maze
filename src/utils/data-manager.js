const fs = require('fs-extra');
const path = require('path');

class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    await fs.ensureDir(this.dataDir);
    await fs.ensureDir(path.join(this.dataDir, 'exports'));
    await fs.ensureDir(path.join(this.dataDir, 'logs'));
  }

  async saveData(filename, data) {
    try {
      const filepath = path.join(this.dataDir, 'exports', filename);
      await fs.writeJSON(filepath, data, { spaces: 2 });
      console.log(`Data saved to ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(`Error saving data to ${filename}:`, error.message);
      throw error;
    }
  }

  async loadData(filename) {
    try {
      const filepath = path.join(this.dataDir, 'exports', filename);
      if (await fs.pathExists(filepath)) {
        const data = await fs.readJSON(filepath);
        console.log(`Data loaded from ${filepath}`);
        return data;
      } else {
        console.warn(`File not found: ${filepath}`);
        return null;
      }
    } catch (error) {
      console.error(`Error loading data from ${filename}:`, error.message);
      throw error;
    }
  }

  async logProgress(step, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      step,
      message,
      data: data || undefined
    };

    console.log(`[${timestamp}] ${step}: ${message}`);

    // Also save to log file
    try {
      const logFile = path.join(this.dataDir, 'logs', `migration-${new Date().toISOString().split('T')[0]}.log`);
      await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
    } catch (error) {
      console.error('Error writing to log file:', error.message);
    }
  }

  async createMappingFile(attioData, hubspotData, mappingKey) {
    try {
      const mapping = {};
      
      hubspotData.forEach(hubspotRecord => {
        const attioId = hubspotRecord.properties?.[mappingKey];
        if (attioId) {
          const attioRecord = attioData.find(a => 
            a.id?.record_id === attioId || 
            a.values?.id === attioId ||
            a.id === attioId
          );
          
          if (attioRecord) {
            mapping[attioId] = hubspotRecord.id;
          }
        }
      });

      const filename = `${mappingKey.replace('attio_', '')}_id_mapping.json`;
      await this.saveData(filename, mapping);
      
      console.log(`Created mapping file with ${Object.keys(mapping).length} entries`);
      return mapping;
    } catch (error) {
      console.error('Error creating mapping file:', error.message);
      throw error;
    }
  }

  async generateReport(title, data) {
    const report = {
      title,
      timestamp: new Date().toISOString(),
      summary: {
        total_records: data.length,
        successful: data.filter(d => !d.error).length,
        failed: data.filter(d => d.error).length
      },
      details: data
    };

    const filename = `report_${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.json`;
    await this.saveData(filename, report);
    
    console.log(`\n=== ${title} ===`);
    console.log(`Total: ${report.summary.total_records}`);
    console.log(`Successful: ${report.summary.successful}`);
    console.log(`Failed: ${report.summary.failed}`);
    
    if (report.summary.failed > 0) {
      console.log('\nFailed records:');
      data.filter(d => d.error).forEach((record, index) => {
        console.log(`${index + 1}. ${record.error}`);
      });
    }

    return report;
  }
}

module.exports = DataManager;