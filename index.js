const dotenv = require("dotenv");
dotenv.config();
const express = require('express')
const app = express();
app.use(express.json());
const fs = require('fs');
const Path = require('path');
const datefns = require("date-fns");
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const port = process.env.PORT || 8088;
const im = require("imagemagick");
const wwHelpers = require('./wwHelpers');
const imageProcessor = require('./imageProcessor');
const { sign } = require("crypto");
const { Client } = require('@elastic/elasticsearch');
const { text } = require("body-parser");
const iDserverUrl = process.env.IDSERVERURL;
const idsHelpers = require("./idsHelpers");
const soap = require("soap");
const archiver = require("./archiver");
const client = new Client({
    node: process.env.ESSERVER,
    auth: {
        username: process.env.ESUSER,
        password: process.env.ESPASS
    },
    tls: {
        rejectUnauthorized: false
    } });
const index = process.env.INDEX;
process.env.TZ = process.env.TIMEZONE;
authKey = process.env.AUTHKEY;
const messagesRoot = Path.join(__dirname, "Messages");
exportsRoot = process.env.EXPORTSDIR;
imagesInDir = Path.join(exportsRoot, "Images In");
imagesOutDir = Path.join(exportsRoot, "Images Out");
articlesRoot = Path.join(exportsRoot, "Articles");
layoutsRoot = Path.join(exportsRoot, "Layouts");
archivesRoot = Path.join(exportsRoot, "Archives");
landbouLayoutsRoot = "\\\\02cpt-wkl01.m24.media24.com\\LBW\\LBWredaksioneel\\Uitgawes Packaged files\\";
landbouXMLRoot = "\\\\02cpt-wkl01.m24.media24.com\\LBW\\LBWredaksioneel\\Uitgawes Packaged files\\XML\\";
xmlExportsRoot = "\\\\02cpt-wkl01.m24.media24.com\\PDF Store\\XML\\";
const logFilePath = Path.join(__dirname, "activityLog.log");

async function saveMessageFile(content){
    let fileDate = datefns.format(new Date(), "yyyyMMdd");
    let messagesDir = Path.join(messagesRoot, fileDate);
    if (!fs.existsSync(messagesDir)){
        fs.mkdirSync(messagesDir);
    }
    const guid = crypto.randomUUID();
    const messageFile = Path.join(messagesDir, guid + ".json");
    fs.writeFile(messageFile, JSON.stringify(content, null, 4), err => {
        if (err) {
            console.error(err);
        }
    });
    return true;
}

async function downloadItem(itemUrl, outputFile, callback){
    let dateStamp = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    let entry = `${dateStamp} Downloading item: ${itemUrl}\n`;
    console.log(entry);
    fs.appendFileSync(logFilePath, entry);
    const stream = fs.createWriteStream(outputFile);
    const { body, status } = await fetch(itemUrl);
    if (status !== 200){
        console.log(`Response code: ${status}`);
    }
    // await fetch(itemUrl);
    await finished(Readable.fromWeb(body).pipe(stream));
    callback(outputFile);
}
async function fetchItem(itemurl, outputFile){
    return new Promise (async (resolve, reject) => {
        log(`Downloading file from: ${itemurl}`);
        const res = await fetch(itemurl);
        const outputFileElements = Path.parse(outputFile);
        const destinationDir = outputFileElements.dir;
        if (!fs.existsSync(destinationDir)){
            reject(`Invalid download destination: ${destinationDir}`);
        }
        const fileStream = fs.createWriteStream(outputFile, { flags: 'wx' });
        await finished(Readable.fromWeb(res.body).pipe(fileStream));
        if (fs.existsSync(outputFile)){
            resolve(`File download complete: ${outputFile}`);
        } else {
            reject(`File download failed: ${outputFile}`);
        }
    });
}

async function downloadArticle(metaData){
    const basicMetaData = metaData.BasicMetaData;
    const contentMetaData = metaData.ContentMetaData;
    log(`Processing Article: ${basicMetaData.Name}`);
    // Get the full data for the object (the event message does not contain everything we need)
    const objectId = basicMetaData.ID;
    var objectIds = [];
    objectIds.push(objectId);
    let sessionTicket = await wwHelpers.logOn();
    try {
        const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);
        // Try to get the issue from the parent layout
        const parentId = objectInfo[0].Relations[0].ParentInfo.ID
        if (parentId == undefined){
            console.error("Unable to read object Parent ID");
            return;
        }
        const parentInfo = await wwHelpers.getObjects(sessionTicket, [parentId]);
        if (parentInfo === undefined){
            console.error("Unable to read object Parent Info");
            return;
        }
        const issueName = parentInfo[0].Relations[0].Targets[0].Issue.Name;
        if (issueName === undefined){
            console.error("Unable to read object Issue Name.");
            return;
        }
        issueDir = Path.join(articleDir, issueName);
        if (!fs.existsSync(issueDir)){
            fs.mkdirSync(issueDir);
        }
        // Save JSON data as message
        const articleFile = Path.join(issueDir, basicMetaData.Name + ".json");
        log(`Saving article info to: ${articleFile}`);
        fs.writeFile(articleFile, JSON.stringify(objectInfo, null, 4), err => {
            if (err) {
                console.error(`Saving of JSON file failed: ${err}`);
            }
        });
        // Save article content as text
        const textFile = Path.join(issueDir, basicMetaData.Name + ".txt");
        log(`Saving original text file to: ${textFile}`);
        fs.writeFile(textFile, contentMetaData.PlainContent, err => {
            if (err) {
                console.error(`Saving of text file failed: ${err}`);
            }
        })
        // Download original
        const itemUrl = `${objectInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
        const mimeType = objectInfo[0].Files[0].Type;
        const ext = wwHelpers.getExtensionFromMimeType(mimeType);
        const outputFile = Path.join(issueDir, basicMetaData.Name + "." + ext);
        // Now download the file
        downloadItem(itemUrl, outputFile, (outputFile)=>{
            log(`Saved Article File: ${outputFile}`);
        });
        return true;
    } catch (error) {
        console.log(`Download of article failed: ${error.message}`);                  
    }
    wwHelpers.logOff(sessionTicket);
}

async function indexArticle(client, index, content, articleFile){
    const indexRequest = await client.index({
        index: index,
        body: content
    });
    if (indexRequest.result == "created"){
        log(`Article ${articleFile} indexed`);
        return true;
    } else {
        log(msg.result);
        return false;
    }
}

async function archiveArticle(content, articlesRoot){
    let objectInfo = content.data.Object;
    const metaData = objectInfo.MetaData;    
    const basicMetaData = metaData.BasicMetaData;
    const workflowMetaData = metaData.WorkflowMetaData;
    const status = workflowMetaData.State.Name;
    if (!fs.existsSync(articlesRoot)){
        fs.mkdirSync(articlesRoot);
    };
    let publication = basicMetaData.Publication.Name;
    articleDir = Path.join(articlesRoot, publication);
    if (!fs.existsSync(articleDir)){
        fs.mkdirSync(articleDir);
    };
    let downloaded = false;
    let indexed = false;
    downloaded = await downloadArticle(metaData);
    if (downloaded == true){
        indexed = await indexArticle(client, index, content, basicMetaData.Name + ".json" );
    }
    if (indexed == true){
        // Change status of article
        let sessionTicket = await wwHelpers.logOn();
        let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
        await wwHelpers.changeObjectStatus(sessionTicket, basicMetaData.ID, "IC - Indexed", `${now} Article Indexed`);
        // Session must be kept alive - or events that trigger another download while one is already running will crash.
        // await wwHelpers.logOff(sessionTicket);
        return true;
    } 
}
function log(message){
    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    let logMsg = `${now} ${message}`;
    console.log(logMsg);
    fs.appendFileSync(logFilePath, `${logMsg}\n`);
}
async function exportXML(basicMetaData, xmlArticleDir){
    let sessionTicket = await wwHelpers.logOn();
    // Special case for landbou exports
    if (basicMetaData.Publication.Name == "LANDBOU"){
        xmlArticleDir = Path.join(landbouXMLRoot, basicMetaData.Name);
        if (!fs.existsSync(xmlArticleDir)){
            fs.mkdirSync(xmlArticleDir)
        }
    }
    // Download the layout file
    const layoutInfo = await wwHelpers.getObjects(sessionTicket, [basicMetaData.ID]);
    const layoutUrl = `${layoutInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
    const mimeType = layoutInfo[0].Files[0].Type;
    const ext = wwHelpers.getExtensionFromMimeType(mimeType);
    const outputFile = Path.join(xmlArticleDir, basicMetaData.Name + "." + ext);
    await downloadItem(layoutUrl, outputFile, (outputFile)=>{
        log(`Saved layout: ${outputFile}`);
    });
    // Download the links
    // Get the linkIDs for all the links
    const linkIDs = await wwHelpers.getLinkIds(layoutInfo[0].Relations, [basicMetaData.ID]);
    if (linkIDs.length > 0){
        // Prepare the destination folder
        let webImagesDir = Path.join(xmlArticleDir, "images");
        if (!fs.existsSync(webImagesDir)){
            fs.mkdirSync(webImagesDir);
        }
        // Now start the actual downloads
        linkIDs.forEach(async function(linkId){
            let linkInfo = await wwHelpers.getObjects(sessionTicket, [linkId]);
            // console.log(`Downloading link: ${linkInfo[0].MetaData.BasicMetaData.Name}`);
            let linkType = linkInfo[0].Files[0].Type;
            let linkExt = wwHelpers.getExtensionFromMimeType(linkType);
            let linkFile = Path.join(webImagesDir, linkInfo[0].MetaData.BasicMetaData.Name + "." + linkExt);
            let linkUrl = `${linkInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
            downloadItem(linkUrl, linkFile, async (linkFile)=>{
                log(`Saved linked item: ${linkFile}`);
                let fileExt = Path.parse(linkFile).ext.replace(".", "").toUpperCase();
                if (
                    fileExt.includes("JPG") ||
                    fileExt.includes("PSD") ||
                    fileExt.includes("TIF") ||
                    fileExt.includes("PNG") ||
                    fileExt.includes("PDF")
                    // fileExt.includes("EPS")
                ) {
                    log(`Generating Web Image for item: ${linkInfo[0].MetaData.BasicMetaData.Name}.${fileExt}`);
                    let image = {
                        "sourceFile": linkFile,
                        "outputDir": webImagesDir 
                    }
                    // Make low res versions of links
                    // imageProcessor.add(image);
                    imageProcessor.makeLowResImage(image).then(
                        (outputFile)=>{
                            if (fs.existsSync(outputFile || outputLayerFile)){
                                // Remove the high res files - we don't need them now
                                fs.unlink(image.sourceFile, (err)=>{
                                    if (err) {
                                        log(`Error deleting file: ${image.sourceFile}. ${err}`);
                                    } else {
                                        log(`Deleted high-res file: ${image.sourceFile}`);
                                    }
                                });
                                // Also remove the formatted mini jpg files that the export process produces
                                let formattedFileName = Path.basename(image.sourceFile).replace(".jpg", "_fmt.jpg");
                                let formattedFile = Path.join(Path.dirname(image.sourceFile), formattedFileName);
                                if (fs.existsSync(formattedFile)){
                                    fs.unlink(formattedFile, (err)=>{
                                        if (err) {
                                            log(`Error deleting formatted image file: ${formattedFile}`);
                                        } else {
                                            log(`Deleted formatted image file: ${formattedFile}`);
                                        }
                                    })
                                }
                            }
                        });
                    }
                })
            })
    }
    idsHelpers.runXMLExport(iDserverUrl, process.env.INSTANCE, process.env.WWUSERNAME, process.env.WWPASSWORD, basicMetaData.ID, xmlArticleDir, async (result)=>{
        if (result.errorNumber === 0){
            // No real way of knowing what the final XML file's name is - as that is generated by the IDS script - which cannot talk back to the calling script.
            let filesInOutputDir = fs.readdirSync(xmlArticleDir);
            let xmlFiles = filesInOutputDir.filter((file)=>{
                return file.includes(".xml");
            });
            xmlFiles.map((file)=>{
                modifyImageLinksInXML(file);
            })
            log(`File: ${basicMetaData.Name} successfully exported to XML.`);
        } else {
            log(`XML export of file: ${basicMetaData.Name} failed. Error number: ${sdsdsdresult.errorNumber}, ScriptResult: ${result.scriptResult}`);
        }
    });
}
function modifyImageLinksInXML(xmlFile){
    function convertLink(linkString) {
        let newLink = linkString
            .replace(Path.extname(linkString), ".png")
            .replace("_fmt", "")
            .replace("_opt", "");
        return newLink;
    }
    function findAValidImageLink(imageLinkString) {
        if (imageLinkString == null) {
            return false;
        }
        if (
            imageLinkString.match(/file:\/\/\/[0-9][0-9][0-9][0-9][0-9][0-9]/)
        ) {
            return false;
        }
        return imageLinkString;
    }
    const xmlFileContent = fs.readFileSync(xmlFile, {
        encoding: "utf8",
        flag: "r",
    });
    var doc = new DOMParser().parseFromString(xmlFileContent, "text/xml");
    const imageNodes = xpath.select("//Image", doc);
    let imageNodeIndex = 0;
    let valid_link = false;
    let newHref = "";
    imageNodes.forEach((imageNode) => {
        // Check href_fmt for valid link
        let href_fmt = imageNode.getAttribute("href_fmt");
        valid_href_fmt = findAValidImageLink(href_fmt);
        if (valid_href_fmt) {
            valid_link = valid_href_fmt;
        }
        imageNode.removeAttribute("href_fmt");
        // Deal with href
        let href = imageNode.getAttribute("href");
        valid_href = findAValidImageLink(href);
        if (valid_href) {
            valid_link = valid_href;
        }
        if (valid_link) {
            newHref = convertLink(valid_link);
            imageNode.setAttribute("href", newHref);
        } else {
            console.log(`No valid link info found in either href or href_fmt`);
            return false;
        }
        imageNodeIndex++;
    });
    // Serialize the updated XML document
    const updatedXml = new XMLSerializer().serializeToString(doc);

    // Make a backup copy of the original XML file
    // const xmlFileBackup = xmlFile.replace(Path.extname(xmlFile), "_backup.xml");
    // fs.writeFileSync(xmlFileBackup, xmlFileContent, "utf-8");
    // Write the updated XML back to file or handle as needed
    fs.writeFileSync(xmlFile, updatedXml, "utf-8");
    console.log(
        `Updated ${imageNodeIndex} image links in XML File: ${xmlFile}`
    );
}
async function removeUnusableLowResImages(xmlArticleDir){
    const imagesDir = Path.join(xmlArticleDir, "images");
    if (fs.existsSync(imagesDir)){
        const files = fs.readdirSync(imagesDir);
    }
}
async function packageLayout(layoutInfo, layoutsRoot){
    const metaData = layoutInfo.MetaData;
    const basicMetaData = metaData.BasicMetaData;
    const targetsData = layoutInfo.Targets;
    
    if (!fs.existsSync(layoutsRoot)){
        fs.mkdirSync(layoutsRoot);
    };
    let layoutPub = basicMetaData.Publication.Name;
    if (layoutPub == "LANDBOU"){
        layoutsDir = landbouLayoutsRoot;
    } else {
        layoutsDir = Path.join(layoutsRoot, layoutPub);
    }
    if (!fs.existsSync(layoutsDir)){
        fs.mkdirSync(layoutsDir);
    };
    log(`Processing Layout: ${basicMetaData.Name}`);
    const objectId = basicMetaData.ID;
    let sessionTicket = await wwHelpers.logOn();
    let objectIds = [];
    objectIds.push(objectId);
    try {
        const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);
        // Issue Name not found must not kill the script
        // console.log(targetsData[0].Issue.Name);
        const issueName = targetsData[0].Issue.Name;
        // const issueName = objectInfo[0].Relations[1].Targets[0].Issue.Name;

        // Landbou like to have "packaged at the end of issue name folders"
        // if (layoutPub == "LANDBOU"){
        //     issueName = issueName + " packaged";
        // }
        // Make directory for the issue
        issueDir = Path.join(layoutsDir, issueName);
        if (!fs.existsSync(issueDir)){
            fs.mkdirSync(issueDir);
        }
        // Make directory for the layout
        const layoutDir = Path.join(issueDir, basicMetaData.Name);
        if (!fs.existsSync(layoutDir)){
            fs.mkdirSync(layoutDir);
        }                
        // Save the metadata file
        const layoutMetaFile = Path.join(layoutDir, basicMetaData.Name + ".json"); 
        fs.writeFile(layoutMetaFile, JSON.stringify(objectInfo, null, 4), err => {
            if (err) {
                console.error(err);
            }
        });
        const links = await wwHelpers.getLinkIds(objectInfo[0].Relations, objectId);
        const itemUrl = `${objectInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
        const mimeType = objectInfo[0].Files[0].Type;
        const ext = wwHelpers.getExtensionFromMimeType(mimeType);
        const outputFile = Path.join(layoutDir, basicMetaData.Name + "." + ext);
        // Now download the file itself
        await downloadItem(itemUrl, outputFile, (outputFile)=>{
            log(`Saved layout: ${outputFile}`);
        });

        if (links.length > 0){
            // Prepare links folders if necessary
            let linksDir = Path.join(layoutDir, "Links");
            if (!fs.existsSync(linksDir)){
                fs.mkdirSync(linksDir);
            }
            // Now download all the links
            links.forEach(async function(linkId){
                let linkInfo = await wwHelpers.getObjects(sessionTicket, [linkId]);
                if (typeof linkInfo[0].MetaData.BasicMetaData.Name == undefined){
                    log(`Invalid file name: ${linkInfo}`);
                    return;
                }
                // console.log(`Downloading link: ${linkInfo[0].MetaData.BasicMetaData.Name}`);
                try {
                    let linkType = linkInfo[0].Files[0].Type;
                    let linkExt = wwHelpers.getExtensionFromMimeType(linkType);
                    let linkFile = Path.join(linksDir, linkInfo[0].MetaData.BasicMetaData.Name + "." + linkExt);
                    let linkUrl = `${linkInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
                    // Prevent too many downloads from overloading server.
                    const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
                    await sleep(20000);
                    await downloadItem(linkUrl, linkFile, (linkFile)=>{
                        log(`Saved linked item: ${linkFile}`);
                        // let fileExt = Path.parse(linkFile).ext.replace(".", "").toUpperCase();
    
                        // // Only make low res files for landbou
                        // if (layoutPub == "LANDBOU"){
                        //     if (
                        //         fileExt.includes("JPG") ||
                        //         fileExt.includes("PSD") ||
                        //         fileExt.includes("TIF") ||
                        //         fileExt.includes("PNG") ||
                        //         fileExt.includes("PDF")
                        //         // fileExt.includes("EPS")
                        //     ) {
                        //         let webLinksDir = Path.join(layoutDir, "WebLinks");
                        //         if (!fs.existsSync(webLinksDir)){
                        //             fs.mkdirSync(webLinksDir);
                        //         }
                        //         log(`Generating Web Image for item: ${linkInfo[0].MetaData.BasicMetaData.Name}.${fileExt}`);
                        //         let image = {
                        //             "sourceFile": linkFile,
                        //             "outputDir": webLinksDir 
                        //         }
                        //         imageProcessor.add(image);
                        //     };
                        // }
                    });
                } catch (error) {
                    log(`${error} ${linkInfo}`);
                    return
                }
            });
;
        }
        // Update the layout's status
        const comment = `Packaged by script.`;
        await wwHelpers.changeObjectStatus(sessionTicket, objectId, "Layout Packaged", comment);
        // wwHelpers.logOff(sessionTicket);
        return true;
    } catch (error) {
        console.error(`Unable to get info for object: ${objectIds}`);
        return;
    }


}
if (!fs.existsSync(messagesRoot)){
    fs.mkdirSync(messagesRoot);
}
app.get('/', (req, res) => {
    res.sendStatus(404);
})
app.get('/log/', (req, res) => {
    const logData = fs.readFileSync(logFilePath);
    let logHtml = logData.toString();
    logHtml = logHtml.replace(/\n/g, "<br>");
    const response = fs.readFileSync("./public/Log.html");
    let responseHtml = response.toString();
    responseHtml = responseHtml.replace("<LogData/>", logHtml);
    res.set('Content-Type','text/html');
    res.send(responseHtml);
    
})
app.post('/', async (req, res) => {
    const content = req.body;
    const headers = req.headers;
    const signature = headers["x-hook-signature"];
    if (typeof signature == undefined){
        log("Event has invalid signature header.");
        res.sendStatus(200);
    }
    var action = "";
    switch (content.type) {
        case "com.woodwing.studio/object/properties-updated":
            action = "updated" 
            break;
        case "com.woodwing.studio/object/saved":
            action = "saved" 
            break;
        default:
            break;
    }
    if (typeof content.data.Object == undefined){
        log("Event has invalid data");
        res.sendStatus(200);
    }
    const targetsData = content.data.Object.Targets;
    const basicMetaData = content.data.Object.MetaData.BasicMetaData;
    const userName = content.data.Object.MetaData.WorkflowMetaData.Modifier;
    log(`Woodwing Event - File: ${basicMetaData.Name}, Modified By: ${userName}, ID: ${basicMetaData.ID}, Event Type: ${action} `);
    switch (content.data.Object.MetaData.BasicMetaData.Type) {
        case "Article":
            const articleToIndexStatus = "IC - To Index";
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == articleToIndexStatus){
                saveMessageFile(content);
                await archiveArticle(content, articlesRoot);
            }
            break;
        case "Layout":
            const layoutToPackageStatus = "Layout To Package";
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == layoutToPackageStatus){
                let contentJSON = JSON.stringify(content);
                try {(JSON.parse(contentJSON))
                    saveMessageFile(content);
                } catch(err) {
                    console.log(err);
                    break;
                }
                await packageLayout(content.data.Object, layoutsRoot);
            }
            const xmlToWebStatus = "XML for Web";
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name === xmlToWebStatus){
                // Prevent infinite loop where the export triggers another export
                if (content.data.Object.MetaData.WorkflowMetaData.Modifier !== "Webhook User"){
                    saveMessageFile(content);
                    const layoutInfo = content.data.Object
                    const metaData = layoutInfo.MetaData;
                    const basicMetaData = metaData.BasicMetaData;
                    const targetsData = layoutInfo.Targets;
                    if (!fs.existsSync(xmlExportsRoot)){
                        fs.mkdirSync(xmlExportsRoot);
                    }
                    let xmlPublication = basicMetaData.Publication.Name;
                    const xmlExportDir = Path.join(xmlExportsRoot, xmlPublication);
                    if (!fs.existsSync(xmlExportDir)){
                        fs.mkdirSync(xmlExportDir);
                    }
                    let xmlIssueDir = Path.join(xmlExportDir, targetsData[0].Issue.Name);
                    if (!fs.existsSync(xmlIssueDir)){
                        fs.mkdirSync(xmlIssueDir);
                    }
                    let xmlArticleDir = Path.join(xmlIssueDir, basicMetaData.Name);
                    if (!fs.existsSync(xmlArticleDir)){
                        fs.mkdirSync(xmlArticleDir);
                    }
                    await exportXML(basicMetaData, xmlArticleDir);
                    await removeUnusableLowResImages(xmlArticleDir);
                }
            }
            break;
        case "Image":
            const imageToProcessStatus = "Image To Web";
            const objectId = basicMetaData.ID;
            var objectIds = [];
            objectIds.push(objectId);
            // console.log(objectIds);
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == imageToProcessStatus){
                saveMessageFile(content);
                console.log("Processing Image:");
                // Log in to Studio Server - application state must be maintained by this app.
                // Must log in to get files metadata as that is not included in normal event message
                let sessionTicket = await wwHelpers.logOn();
                const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);
                const itemUrl = `${objectInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
                const mimeType = objectInfo[0].Files[0].Type;
                const ext = wwHelpers.getExtensionFromMimeType(mimeType);
                const outputFile = Path.join(imagesInDir, basicMetaData.Name + "." + ext);
                // Now download the file
                downloadItem(itemUrl, outputFile, (outputFile)=>{
                    log(`Downloaded: ${outputFile}`);
                });
                // Now update the item's metadata in Studio
                const newStatus = "Image Exported";
                const comment = "Image exported for web use.";
                const changedObject = await wwHelpers.changeObjectStatus(sessionTicket, objectId, newStatus, comment );
                var metadataFileName = Path.join(imagesOutDir, basicMetaData.Name + ".json");
                fs.writeFile(metadataFileName, JSON.stringify(changedObject, null, 4), err => {
                    if (err) {
                        console.error(err);
                    }
                })
                // await convertImage(outputFile, imagesOutDir);
                // await wwHelpers.logOff(sessionTicket);
            }
            break;
        case "Dossier":
            // const dossierToArchiveStatus = "None"; // Disabling Dossier archiving due to server overload
            const dossierToArchiveStatus = "Dossier to Archive";
            const dossierObjectId = basicMetaData.ID;
            var objectIds = [];
            objectIds.push(dossierObjectId);
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == dossierToArchiveStatus){
                saveMessageFile(content);
                console.log("Processing Dossier:");
                let sessionTicket = await wwHelpers.logOn();
                const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);
                archiver.archiveDossier(objectInfo, archivesRoot).then((result) => {
                    wwHelpers.changeObjectStatus(sessionTicket, basicMetaData.ID, "Dossier Archived", result);
                });
            }
            break
        default:
            console.log("Invalid object type");
            break;
    }
    res.sendStatus(200);
})
app.listen(port, () => {
    log(`Listener application started. Awaiting events. Listening on port ${port}`);
})