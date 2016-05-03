var RAW_GEOLOCATION_DATA_FOLDER_ID = "0B3i-XvikxKzAYzZlNnJXZUJiZVk",
    VAULT_SPREADSHEET_ID = "1uN9fOpGZae7w7y2RhrX4MmBRliWMM_1QT5tQK0Pa1oA";

var dateToCSVDate = function (d) {
    // Note how I force the date to be stored as a string, to avoid Google
    // spreadsheet interpreting it and perhaps change its format when it is
    // exported.
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " + 
        ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); 

}

// returns the list of dates row geolocation files are available for, or null if none are
var getAvailableRawFilesDates = function (callback) {
    var files = DriveApp.getFolderById(RAW_GEOLOCATION_DATA_FOLDER_ID).getFiles(),
        dates = [ ];
    while (files.hasNext()) {
        var name = files.next().getName(),
            date;
        if (date = name.match(/^(\d{4})(\d{2})(\d{2})\.txt$/)) dates.push(new Date(date[1], date[2] - 1, date[3]));
    }
    callback(null, dates.length > 0 ? dates.sort() : null);
}

// Like Google API's own openBy... but with the date of the target raw file.
var openRawFileByDate = function (date, callback) {
    var rawGeolocationDataFolder = DriveApp.getFolderById(RAW_GEOLOCATION_DATA_FOLDER_ID),
        filename = "" + date.getFullYear() + ("0" + (date.getMonth() + 1)).slice(-2) + ("0" + date.getDate()).slice(-2) + ".txt",
        dayAfter = new Date(date.valueOf() + 86400000);
        filenameDayAfter = "" + dayAfter.getFullYear() + ("0" + (dayAfter.getMonth() + 1)).slice(-2) + ("0" + dayAfter.getDate()).slice(-2) + ".txt",
        rawGeolocationDataFolder = DriveApp.getFolderById(RAW_GEOLOCATION_DATA_FOLDER_ID);
    // does the file actual exists?
    spreadsheet = rawGeolocationDataFolder.getFilesByName(filename);
    // note, it is presumed that filenames in the same folder are unique
    if (!spreadsheet.hasNext()) return callback(new Error("The specified file name does not exist."));
    // the file exists and is complete
    callback(null, SpreadsheetApp.openById(spreadsheet.next().getId()));
}

var copyFromRawToVault = function (date, callback) {
    var targetSpreadsheet = SpreadsheetApp.openById(VAULT_SPREADSHEET_ID);
    Logger.log("Checking for data for " + date + "...");
    openRawFileByDate(date, function (err, spreadsheet) {
        if (err) {
            Logger.log("The data for " + date + " is not available. (" + err + ")");
            callback(err);
        } else {
            Logger.log("Importing data for " + date + "...");
            var fields = _.flatten(spreadsheet.getRange("R1C1:R1C" + spreadsheet.getLastColumn()).getValues()),
                knownTimestamps = _.flatten(targetSpreadsheet.getRange("R2C1:R" + Math.max(2, targetSpreadsheet.getLastRow()) + "C1").getValues()),
                data = spreadsheet.getRange("R2C1:R" + Math.max(2, spreadsheet.getLastRow()) + "C" + spreadsheet.getLastColumn()).getValues();
            data = data.reduce(function (memo, row) {
                // TODO: this is apparently UTC, not UK time, need to fix!
                var timeStamp = row[0].match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/);
                timeStamp = new Date(timeStamp[1], timeStamp[2] - 1, timeStamp[3], timeStamp[4], timeStamp[5], timeStamp[6]);
                timeStamp = dateToCSVDate(timeStamp);
                return _.contains(knownTimestamps, timeStamp) ? memo : memo.concat([[ timeStamp, JSON.stringify(_.object(fields, row)) ]]);
            }, [ ]);
            if (data.length > 0) targetSpreadsheet.getRange("R" + (targetSpreadsheet.getLastRow() + 1) + "C1:R" + (targetSpreadsheet.getLastRow() + data.length) + "C2").setValues(data);
            callback(null);
        }
    });
}

function copyNewFromRawToVault () {
    getAvailableRawFilesDates(function (err, availableDates) {
        var spreadsheet = SpreadsheetApp.openById(VAULT_SPREADSHEET_ID),
            today = (new Date()).setHours(0, 0, 0, 0),
            movedTimestamps = spreadsheet.getLastRow() > 1 ? _.flatten(spreadsheet.getRange("R2C1:R" + spreadsheet.getLastRow() + "C1").getValues()) : null,
            movedDates = movedTimestamps ? _.uniq(movedTimestamps.map(function (ts) { 
                var d = ts.match(/^(\d{4})-(\d{2})-(\d{2}) /);
                return (new Date(d[1], d[2] - 1, d[3])).valueOf(); 
            })).sort().map(function (v) { return new Date(v); }) : null,
            latestMovedDate = movedDates ? _.last(movedDates) : null,
            fromDate = latestMovedDate ? latestMovedDate : _.first(availableDates);
        Logger.log("Attempting importing from " + fromDate + " to " + today + "...");
        async.eachSeries(_.range(fromDate.valueOf(), today.valueOf() + 86400000, 86400000).map(function (d) { return new Date(d); }), copyFromRawToVault, function (err) { });  
    });
}
