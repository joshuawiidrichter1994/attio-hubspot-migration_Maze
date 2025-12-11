const MigrationAssociations = require('./migrate-associations');
const IncrementalMigration = require('./incremental-migration');
const DataVerification = require('./utils/verify-data');
const moment = require('moment');

class MigrationManager {
  constructor() {
    this.associations = new MigrationAssociations();
    this.incremental = new IncrementalMigration();
    this.verification = new DataVerification();
  }

  async showMainMenu() {
    console.log('\n' + '='.repeat(80));
    console.log('ATTIO TO HUBSPOT MIGRATION MANAGER v2.0');
    console.log('='.repeat(80));
    console.log('\n📋 Available Operations:');
    console.log('1. Migrate Company & Deal Associations');
    console.log('2. Run Incremental Migration (new meetings since date)');
    console.log('3. Verify Data & Generate Reports');
    console.log('4. Run Full Migration Process');
    console.log('5. Exit');
    console.log('\n');
  }

  async runFullMigrationProcess() {
    console.log('\n🚀 STARTING FULL MIGRATION PROCESS...\n');

    try {
      // Step 1: Migrate associations
      console.log('STEP 1: Migrating Company & Deal Associations...');
      await this.associations.runFullAssociationMigration();

      // Step 2: Run incremental migration for last 14 days
      console.log('\nSTEP 2: Running Incremental Migration (last 14 days)...');
      const sinceDate = moment().subtract(14, 'days').format('YYYY-MM-DD');
      await this.incremental.runIncrementalMigration(sinceDate);

      // Step 3: Verify everything
      console.log('\nSTEP 3: Generating Verification Report...');
      await this.verification.generateFullReport();

      console.log('\n✅ FULL MIGRATION PROCESS COMPLETED SUCCESSFULLY!');
      console.log('\nPlease check the /data/exports folder for detailed reports and logs.');

    } catch (error) {
      console.error('\n❌ FULL MIGRATION PROCESS FAILED:', error.message);
      throw error;
    }
  }

  async promptForDate() {
    // In a real implementation, you'd use a library like 'inquirer' for user input
    // For now, we'll use a default of 7 days ago
    const defaultDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
    console.log(`Using default date: ${defaultDate} (7 days ago)`);
    console.log('To use a different date, run: node src/incremental-migration.js YYYY-MM-DD');
    return defaultDate;
  }

  async run() {
    try {
      const args = process.argv.slice(2);
      const operation = args[0];

      if (operation) {
        // Command line mode
        switch (operation) {
          case 'associations':
            await this.associations.runFullAssociationMigration();
            break;
          case 'incremental':
            const sinceDate = args[1] || await this.promptForDate();
            await this.incremental.runIncrementalMigration(sinceDate);
            break;
          case 'verify':
            await this.verification.generateFullReport();
            break;
          case 'full':
            await this.runFullMigrationProcess();
            break;
          default:
            console.error(`Unknown operation: ${operation}`);
            console.log('Available operations: associations, incremental, verify, full');
            process.exit(1);
        }
      } else {
        // Interactive mode (simplified for this example)
        await this.showMainMenu();
        console.log('To run operations, use:');
        console.log('npm run migrate-associations    # Migrate company/deal associations');
        console.log('npm run incremental-migration   # Run incremental migration');
        console.log('npm run verify-data             # Verify data and generate reports');
        console.log('npm start full                  # Run full migration process');
      }

      console.log('\n✅ Operation completed successfully!');
      process.exit(0);

    } catch (error) {
      console.error('\n❌ Operation failed:', error.message);
      process.exit(1);
    }
  }
}

// Export for use by other modules
module.exports = MigrationManager;

// Run if called directly
if (require.main === module) {
  const manager = new MigrationManager();
  manager.run();
}