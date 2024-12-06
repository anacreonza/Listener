//DESCRIPTION: Validates and then runs XML export

var server = app.scriptArgs.getValue("server"); // Name of Woodwing instance
var userName = app.scriptArgs.getValue("username"); // Username to log in to Woodwing with
var password = app.scriptArgs.getValue("password"); // Password to log in to Woodwing with
var docID = app.scriptArgs.getValue("docID"); // Unique ID of the document to export as XML
var outputFolderName = app.scriptArgs.getValue("outputFolder"); // Destination folder to save the XML file in. Make sure this exists before hand.
// var docID = "317558"; //Landbou example Nuus article
// var docID = "2040"; //Polar Swimmer example
// var server = "Weeklies (Secure)";
// var server = "preprod";
// var userName = "webhook";
// var password = "giq38Mcd7Clt";
if (typeof server === undefined) {
    throw new error("Invalid server");
}
if (typeof userName == undefined){
    throw new error("Invalid username");
}
if (typeof docID == undefined){
    throw new error("Invalid Doc ID");
}
var outputFolder = new Folder(outputFolderName);
if (!outputFolder.exists){
    throw new error("Invalid output folder: " + outputFolderName);
}
var os = $.os.toLowerCase().indexOf("mac") >= 0 ? "MAC" : "WINDOWS";
var log = new File("/c/InDesignScripts/idslog.log");
if (os == "MAC") {
    log = new File("/Users/stuart.kinnear/idslog.log");
}

function writeLogEntry(log, entry) {
    log.open("a");
    log.writeln(getDate() + " " + entry);
    log.close();
}
function logInToWoodwing(userName, password, server) {
    writeLogEntry(log, "Logging in to " + server + " as user: " + userName);
    if (typeof app.entSession == "undefined") {
        throw new Error("WoodWing Plug-ins not installed!");
        exit();
    }
    // turn off user interaction - this is all copied from the m2p scripts
    try {
        app.scriptPreferences.userInteractionLevel =
            UserInteractionLevels.neverInteract;
    } catch (err) {} // fail silently; expected in InDesign Server

    // Clear any stuck open documents.
    app.documents.everyItem().close(SaveOptions.NO);

    // try to logout in case already logged in
    try {
        app.entSession.logout();
    } catch (err) {} // fail silently;
    var ticket = app.entSession.login(userName, password, server);
    return ticket;
}
function getMetaData(doc) {
    var meta = {
        name: doc.entMetaData.get("Core_Name"),
        type: doc.entMetaData.get("Type"),
        publication: doc.entMetaData.get("Core_Publication"),
        issue: doc.entMetaData.get("Core_Issue"),
        section: doc.entMetaData.get("Core_Section"),
        status: doc.entMetaData.get("Core_Basket"),
        editions: doc.entMetaData.get("Editions"),
        headline: findHeadline(doc),
    };
    return meta;
}
function findHeadline(doc){
    function findHeadlineBySize(doc, minSize){
        var headline = "";
        var biggestPointSize = minSize;
        for (var i=0, len=doc.stories.length; i < len ; i++) {
            var paragraphs = doc.stories[i].paragraphs;
            for (var j=0, paralen=paragraphs.length; j < paralen; j++){
                var texts = paragraphs[j].texts;
                for(var k=0, textlen=texts.length; k < textlen; k++){
                    var text = texts[k];
                    if (text.pointSize > biggestPointSize){
                        biggestPointSize = text.pointSize;
                    }
                    // alert("Paragraph Style: " + text.appliedParagraphStyle.name + " Size: " + text.pointSize + " Content: " + text.contents);
                }
            }
        }
        for (var i=0, len=doc.stories.length; i < len ; i++) {
            var paragraphs = doc.stories[i].paragraphs;
            for (var j=0, paralen=paragraphs.length; j < paralen; j++){
                var texts = paragraphs[j].texts;
                for(var k=0, textlen=texts.length; k < textlen; k++){
                    var text = texts[k];
                    if (text.pointSize == biggestPointSize){
                        var line = text.contents.replace(/:/g, " -").replace(/\r/g, "").replace(/\n/g, "");
                        headline += line;
                    }
                    // alert("Paragraph Style: " + text.appliedParagraphStyle.name + " Size: " + text.pointSize + " Content: " + text.contents);
                }
            }
        }

        // Truncate very long headlines
        if (headline.length > 64){
            headline = headline.substring(0,63);
        }
        return headline;
    }
    function findHeadlineByStyle(doc, styleName, headline) {
        // If headline already detected just return that
        if (headline !== ""){
            return headline;
        }
        // Go through all the stories in the whole document and find the one with the biggest pointsize. This is usually the headline.
        var headline = "";
        for (var i=0, len=doc.stories.length; i < len ; i++) {
            var paragraphs = doc.stories[i].paragraphs;
            // alert("Story:" + i + " Paragraphs: " + paragraphs.length);
            for (var j=0, paralen=paragraphs.length; j < paralen; j++){
                var texts = paragraphs[j].texts;
                for(var k=0, textlen=texts.length; k < textlen; k++){
                    var text = texts[k];
                    if (text.appliedParagraphStyle.name.indexOf(styleName) !== -1){
                        var line = text.contents.replace(/:/g, " -").replace(/\r/g, "").replace(/\n/g, "");
                        headline += line + " ";
                    }
                }
            }
        };
        // Truncate very long headlines
        if (headline.length > 65){
            headline = headline.substring(0,64);
        }
        return headline;
    }
    var headline = "";
    // First try to detect the headline by stylesheets
    var headingStyles = [ "Heading ", "Nuuskop Rooi"];
    for (var i=0, len=headingStyles.length; i < len ; i++) {
        headline = findHeadlineByStyle(doc, headingStyles[i], headline);
    };

    // Then try to detect it by point size
    if (headline === ""){
        headline = findHeadlineBySize(doc, 20);
    }

    // Deal with case where no headline detected at all
    if (headline == ""){
        headline = "No headline detected";
    }
    return headline;
}
function buildOutputFileName(metaData) {
    var outputFileNameString = metaData.headline;
    outputFileNameString = outputFileNameString.replace("%20", " ");
    outputFileNameString = outputFileNameString.replace(":", "-");
    var outputFileName = outputFileNameString + ".xml";
    return outputFileName;
}
function getDate() {
    function pad(value) {
        var paddedString = value.toString();
        paddedString = "0" + paddedString;
        paddedString = paddedString.substr(-2);
        return paddedString;
    }
    var date = new Date();
    var year = date.getFullYear();
    var month = pad(date.getMonth() + 1);
    var day = pad(date.getDate());
    var hours = pad(date.getHours());
    var minutes = pad(date.getMinutes());
    var niceDate = year + "-" + month + "-" + day + " " + hours + ":" + minutes;
    return niceDate;
}
function validateDoc(doc) {
    var dtds = doc.dtds;
    if (dtds.length == 0) {
        return "This document has no DTD!";
    }
    var dtd = dtds.firstItem();
    var rootXE = doc.xmlElements.itemByName("Root");
    var validationErrors = rootXE.validate();

    if (!rootXE.isValid) {
        writeLogEntry(log, "Root element of " + doc.name + " invalid");
        return "Root element not valid";
    } else {
        var validationErrors = rootXE.validate();
        if (validationErrors.length != 0) {
            writeLogEntry(
                log,
                doc.name +
                    " fails XML validation. Please check the structure panel to resolve issues."
            );
            return "Document fails XML validation. Please check the structure panel to resolve issues.";
        } else {
            writeLogEntry(log, doc.name + " passed XML validation.");
            return "Valid";
        }
    }
}
function exportXml(doc) {
    //Set XML export prefs
    var exportPrefs = doc.xmlExportPreferences;
    exportPrefs.characterReferences = true; // Remap special characters
    exportPrefs.exportUntaggedTablesFormat = XMLExportUntaggedTablesFormat.NONE; // Export untagged tables as XML: no
    exportPrefs.copyFormattedImages = true; // Optimised formatted images
    exportPrefs.imageConversion = ImageConversion.JPEG; // JPEG format
    exportPrefs.jpegOptionsFormat = JPEGOptionsFormat.BASELINE_ENCODING; // Format Method: Baseline
    exportPrefs.jpegOptionsQuality = JPEGOptionsQuality.MAXIMUM; // Maximum quality

    // Get the current doc's metadata
    var metaData = getMetaData(doc);
    writeLogEntry(log, "Document Name: " + metaData.name + ", Type: " + metaData.type + ", Publication: " + metaData.publication + ", Issue: " + metaData.issue + ", Headline: " + metaData.headline);

    //Do the export
    var xmlDocName = buildOutputFileName(metaData);
    var exportFileName = outputFolder + "/" + xmlDocName;
    var exportFile = File(exportFileName);
    writeLogEntry(log, "Creating XML file: " + exportFileName);
    var xmlExport = doc.exportFile(ExportFormat.XML, exportFile);
    if (exportFile.exists) {
        writeLogEntry(log, "Saved exported XML to " + exportFileName);
        return true;
    } else {
        writeLogEntry(log, "XML export of " + exportFileName + " failed.");
        return false;
    }
}

// Log in to Woodwing
var ticket = logInToWoodwing(userName, password, server)

// Open doc, checkout, with window.
var doc = app.openObject(docID);
if (typeof doc === "undefined") {
    throw new error("Unable to open document");
}

// Get the metadata for the current document
var metaData = getMetaData(doc);
if (typeof metaData === "undefined") {
    throw new error("Unable to extract metadata");
}

// Validate the doc against the DTD
var docValidMessage = validateDoc(doc);

if (docValidMessage == "Valid") {
    var exportedResult = exportXml(doc);
    // Update the Comment metadata with the result of the export
    if (exportedResult) {
        doc.entMetaData.set(
            "Comment",
            getDate() + " XML Exported Successfully"
        );
        // Update the Document status
        try{
            doc.entMetaData.set("Core_Basket", "XML Exported");
        } catch(err) {
            writeLogEntry(log, err);
        }
    } else {
        doc.entMetaData.set("Comment", getDate() + " XML Export Failed");
    }
} else {
    doc.entMetaData.set(
        "Comment",
        getDate() + " Doc failed XML DTD validation"
    );
}

// Close the file.
try {
    doc.entWorkflow.checkIn();
}
catch(err){
    writeLogEntry(log, err);
}

// Log out of Woodwing
writeLogEntry(log, "Logging out of " + server);
app.entSession.logout();
