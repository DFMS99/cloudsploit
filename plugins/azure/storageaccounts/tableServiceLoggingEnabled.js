var async = require('async');

var helpers = require('../../../helpers/azure');

module.exports = {
    title: 'Storage Account Table Service Logging Enabled',
    category: 'Storage Accounts',
    domain: 'Storage',
    severity: 'Medium',
    description: 'Ensures that Microsoft Azure Storage Table service logging is enabled for "Read", "Write", and "Delete" requests.',
    more_info: 'Azure Storage Table Service logs contain detailed information about successful and failed requests made to your storage tables for read, write and delete operations. This information can be used to monitor individual requests and to diagnose issues with the Storage Table service within your Microsoft Azure account.',
    recommended_action: 'Modify Table Service and enable storage logging for "Read", "Write", and "Delete" requests.',
    link: 'https://learn.microsoft.com/en-us/azure/storage/tables/monitor-table-storage?tabs=azure-portal',
    apis: ['storageAccounts:list', 'storageAccounts:listKeys', 'diagnosticSettings:listByTableServices'],
    realtime_triggers: ['microsoftstorage:storageaccounts:write', 'microsoftstorage:storageaccounts:delete'],

    run: function(cache, settings, callback) {
        var results = [];
        var source = {};
        var locations = helpers.locations(settings.govcloud);

        async.each(locations.storageAccounts, function(location, rcb) {
            const storageAccounts = helpers.addSource(
                cache, source, ['storageAccounts', 'list', location]);

            if (!storageAccounts) return rcb();

            if (storageAccounts.err || !storageAccounts.data) {
                helpers.addResult(results, 3,
                    'Unable to query for storage accounts: ' + helpers.addError(storageAccounts), location);
                return rcb();
            }

            if (!storageAccounts.data.length) {
                helpers.addResult(results, 0, 'No storage accounts found', location);
                return rcb();
            }
            for (let storageAccount of storageAccounts.data) {
                if (!storageAccount.id) continue;

                if (storageAccount.sku &&
                    storageAccount.sku.tier &&
                    storageAccount.sku.tier.toLowerCase() == 'premium') {
                    helpers.addResult(results, 0, 'Storage Account tier is premium', location, storageAccount.id);
                } else {

                    const diagnosticSettings = helpers.addSource(cache, source,
                        ['diagnosticSettings', 'listByTableServices', location, storageAccount.id]);


                    if (!diagnosticSettings || diagnosticSettings.err || !diagnosticSettings.data) {
                        helpers.addResult(results, 3, 'Unable to query Storage Account diagnostics settings: ' + helpers.addError(diagnosticSettings), location, storageAccount.id);
                    } else {
                        //First consider that all the logs are missing then remove the ones that are present
                        var missingLogs = ['StorageRead', 'StorageWrite','StorageDelete'];

                        diagnosticSettings.data.forEach(settings => {
                            const logs = settings.logs;
                            missingLogs = missingLogs.filter(requiredCategory =>
                                !logs.some(log => (log.category === requiredCategory && log.enabled) || log.categoryGroup === 'allLogs' && log.enabled)
                            );
                        });

                        if (missingLogs.length) {
                            helpers.addResult(results, 2, `Storage Account does not have logging enabled for table service. Missing Logs ${missingLogs}`, location, storageAccount.id);
                        } else {
                            helpers.addResult(results, 0, 'Storage Account has logging enabled for table service read, write and delete requests', location, storageAccount.id);
                        }
                    }
                }
            }

            rcb();
        }, function() {
            callback(null, results, source);
        });
    }
};
