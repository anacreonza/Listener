const dotenv = require("dotenv");
dotenv.config();
const express = require('express')
const app = express();
app.use(express.json());
const fs = require('fs');
const path = require('path');
const datefns = require("date-fns");
const { Readable } = require('stream');
const { finished } = require('stream/promises');
const port = process.env.PORT || 8088;
const im = require("imagemagick");
const wwHelpers = require('./wwHelpers');
const { sign } = require("crypto");
const { Client } = require('@elastic/elasticsearch');
const { text } = require("body-parser");
const client = new Client({
    node: 'https://02cpt-fwslab01.m24.media24.com:9200',
    auth: {
        username: 'text_index',
        password: 'kutmyp-nygme8-komruV'
    },
    tls: {
        rejectUnauthorized: false
    } });
const index = process.env.INDEX;
process.env.TZ = "Africa/Johannesburg";
authKey = "E06A5343-05B5-4EF5-9F88-6F905D7B5E8E";
messagesRoot = path.join(__dirname, "Messages");
imagesInDir = path.join(__dirname, "Images In");
imagesOutDir = path.join(__dirname, "Images Out");
exportsRoot = "D:/pilot01/Listener/";
articlesRoot = path.join(exportsRoot, "Articles");
layoutsRoot = path.join(exportsRoot, "Layouts");
archivesRoot = path.join(exportsRoot, "Archives");

async function downloadItem(itemUrl, outputFile){
    // Prevent too many downloads from overloading server.
    const sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay));
    await sleep(10000);
    const stream = fs.createWriteStream(outputFile);
    const { body } = await fetch(itemUrl);
    await fetch(itemUrl);
    await finished(Readable.fromWeb(body).pipe(stream));
    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    console.log(`${now} Saved File: ${outputFile}`);
}

async function downloadArticle(metaData){
    const basicMetaData = metaData.BasicMetaData;
    const contentMetaData = metaData.ContentMetaData;
    console.log(`Processing Article: ${basicMetaData.Name}`);            
    // Get the full data for the object (the event message does not contain everything we need)
    const objectId = basicMetaData.ID;
    var objectIds = [];
    objectIds.push(objectId);
    let sessionTicket = await wwHelpers.logOn();
    console.log(`Generated new ticket: ${sessionTicket}`);
    try {
        const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);
        // Try to get the issue from the parent layout
        const parentId = objectInfo[0].Relations[0].ParentInfo.ID
        const parentInfo = await wwHelpers.getObjects(sessionTicket, [parentId]);
        const issueName = parentInfo[0].Relations[0].Targets[0].Issue.Name;
        issueDir = path.join(articleDir, issueName);
        if (!fs.existsSync(issueDir)){
            fs.mkdirSync(issueDir);
        }
        // Save JSON data as message
        const articleFile = path.join(issueDir, basicMetaData.Name + ".json");
        let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
        console.log(`${now} Saving article info to: ${articleFile}`);
        fs.writeFile(articleFile, JSON.stringify(objectInfo, null, 4), err => {
            if (err) {
                console.error(err);
            }
        });
        // Save article content as text
        const textFile = path.join(issueDir, basicMetaData.Name + ".txt");
        now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
        console.log(`${now} Saving original text file to: ${textFile}`);
        fs.writeFile(textFile, contentMetaData.PlainContent, err => {
            if (err) {
                console.log(err);
            }
        })
        // Download original
        const itemUrl = `${objectInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
        const mimeType = objectInfo[0].Files[0].Type;
        const ext = wwHelpers.getExtensionFromMimeType(mimeType);
        const outputFile = path.join(issueDir, basicMetaData.Name + "." + ext);
        // Now download the file
        await downloadItem(itemUrl, outputFile);
        return true;
    } catch (error) {
        console.log(error.message);                  
    }
    wwHelpers.logOff(sessionTicket);
}

async function indexArticle(client, index, content, articleFile){
    const indexRequest = await client.index({
        index: index,
        body: content
    });
    if (indexRequest.result == "created"){
        let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
        console.log(`${now} Indexed: ${articleFile}`);
        return true;
    } else {
        console.log(msg.result);
        return false;
    }
}

async function convertImage(file, imagesOutDir) {
    console.log(`Converting file: ${file}`);
    const extName = path.extname(file);
    const fileName = path.basename(file, extName);
    const outputFile = path.join(imagesOutDir, fileName + ".png");
    console.log(`Output file: ${outputFile}`);
    var newxSize = 800;
    // im.readMetadata(file, (err, metaData) => {
    //     console.log(metaData);
    //     const xSize = metaData.exif.pixelXDimension.replace(",", '');
    //     const ySize = metaData.exif.pixelYDimension.replace(",", '');
    //     var newxSize = xSize * 0.4;
    //     newxSize = Math.round(newxSize);
    //     if (newxSize < 400){
    //         newxSize = 400
    //     };
        // im.convert([file, "-flatten", "-resize", newxSize, outputFile], (err, stdout)=>{
        //     if (err) throw err;
        //     console.log("stdout: ", stdout);
        // });
    // });
}
async function archiveArticle(objectInfo, articlesRoot){
    const metaData = objectInfo.MetaData;    
    const basicMetaData = metaData.BasicMetaData;
    const workflowMetaData = metaData.WorkflowMetaData;
    const status = workflowMetaData.State.Name;
    if (!fs.existsSync(articlesRoot)){
        fs.mkdirSync(articlesRoot);
    };
    let publication = basicMetaData.Publication.Name;
    articleDir = path.join(articlesRoot, publication);
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
        let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
        const comment = `Article Indexed: ${now}`;
        let sessionTicket = await wwHelpers.logOn();
        await wwHelpers.changeObjectStatus(sessionTicket, basicMetaData.ID, "IC - Indexed", comment);
        // Session must be kept alive - or events that trigger another download while one is already running will crash.
        // await wwHelpers.logOff(sessionTicket);
        return true;
    } 
}
async function archiveDossier(dossierInfo, archivesRoot){
    const metaData = dossierInfo.MetaData;
    const basicMetaData = metaData.BasicMetaData;
    const targetsData = dossierInfo.Targets;
    console.log(`Archiving Dossier: ${basicMetaData.Name}`);
    let sessionTicket = await wwHelpers.logOn();
    const extendedDossierInfo = await wwHelpers.getObjects(sessionTicket, [basicMetaData.ID]);
    // Create root folder
    if (!fs.existsSync(archivesRoot)){
        fs.mkdirSync(archivesRoot);
    }
    // Save the dossier metadata file
    const dossierMetaFile = path.join(archivesRoot, basicMetaData.Name + ".json");
    fs.writeFile(dossierMetaFile, JSON.stringify(extendedDossierInfo, null, 4), err => {
        if (err) {
            console.error(err);
        }
    });
    // Create publication folder
    const publicationDir = path.join(archivesRoot, basicMetaData.Publication.Name);
    if (!fs.existsSync(publicationDir)){
        console.log(`Making new publication directory: ${publicationDir}`);
        fs.mkdirSync(publicationDir);
    }
    // Create issue folder
    if ( targetsData[0].Issue.Name == null ){
        console.log("Invalid issue name.");
        return;
    } 
    const dossierIssueName = targetsData[0].Issue.Name;
    const issueDir = path.join(publicationDir, dossierIssueName);
    if (!fs.existsSync(issueDir)){
        console.log(`Making new issue directory: ${dossierIssueName}`);
        fs.mkdirSync(issueDir);
    }
    // Create the dossier folder
    const dossierDir = path.join(issueDir, basicMetaData.Name);
    if (!fs.existsSync(dossierDir)){
        fs.mkdirSync(dossierDir);
    }
    // Save the metadata file
    // const dossierMetaFile = path.join(dossierDir, basicMetaData.Name + ".json");
    // fs.writeFile(dossierMetaFile, JSON.stringify(dossierInfo, null, 4), err => {
    //     if (err) {
    //         console.error(err);
    //     }
    // });
    let dossierItemIds = await wwHelpers.getDossierChildIds(extendedDossierInfo[0].Relations, basicMetaData.ID);
    dossierItemIds.forEach(async function(itemId){
        let itemInfo = await wwHelpers.getObjects(sessionTicket, [itemId]);
        let itemType = itemInfo[0].Files[0].Type;
        let itemExt = wwHelpers.getExtensionFromMimeType(itemType);
        let itemName = itemInfo[0].MetaData.BasicMetaData.Name + "." + itemExt;
        console.log(`Downloading contained item: ${itemName}`);
        let itemFile = path.join(dossierDir, itemName);
        let itemUrl = `${itemInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
        await downloadItem(itemUrl, itemFile);
        // If the item is an InDesign layout, get all its links and then test if those links are already in the dossier
        // Download them and save them in the dossier if not.
        if (itemType == "application/indesign"){
            let links = await wwHelpers.getLinkIds(itemInfo[0].Relations, itemId);
            links.forEach(async function(linkId){
                if (!dossierItemIds.includes(linkId)){
                    let linkInfo = await wwHelpers.getObjects(sessionTicket, [linkId]);
                    console.log(`Downloading external link: ${linkInfo[0].MetaData.BasicMetaData.Name}`);
                    let linkType = linkInfo[0].Files[0].Type;
                    let linkExt = wwHelpers.getExtensionFromMimeType(linkType);
                    let linkFile = path.join(dossierDir, linkInfo[0].MetaData.BasicMetaData.Name + "." + linkExt);
                    let linkUrl = `${linkInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
                    await downloadItem(linkUrl, linkFile);
                }
            })
        }
    });
    // Update the dossier's status
    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    // let now = new Date().toISOString();
    const comment = `Archived: ${now}`;
    await wwHelpers.changeObjectStatus(sessionTicket, basicMetaData.ID, "Dossier Archived", comment);
    // await wwHelpers.logOff(sessionTicket);
}
async function packageLayout(layoutInfo, layoutsRoot){
    const metaData = layoutInfo.MetaData;
    const basicMetaData = metaData.BasicMetaData;
    const targetsData = layoutInfo.Targets;
    
    if (!fs.existsSync(layoutsRoot)){
        fs.mkdirSync(layoutsRoot);
    };
    let layoutPub = basicMetaData.Publication.Name;
    layoutsDir = path.join(layoutsRoot, layoutPub);
    if (!fs.existsSync(layoutsDir)){
        fs.mkdirSync(layoutsDir);
    };
    console.log(`Processing Layout: ${basicMetaData.Name}`);
    const objectId = basicMetaData.ID;
    let sessionTicket = await wwHelpers.logOn();
    var objectIds = [];
    objectIds.push(objectId);
    const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);

    // Issue Name not found must not kill the script
    // console.log(targetsData[0].Issue.Name);
    const issueName = targetsData[0].Issue.Name;
    // const issueName = objectInfo[0].Relations[1].Targets[0].Issue.Name;

    // Make directory for the issue
    issueDir = path.join(layoutsDir, issueName);
    if (!fs.existsSync(issueDir)){
        fs.mkdirSync(issueDir);
    }
    // Make directory for the layout
    const layoutDir = path.join(issueDir, basicMetaData.Name);
    if (!fs.existsSync(layoutDir)){
        fs.mkdirSync(layoutDir);
    }                
    // Save the metadata file
    const layoutMetaFile = path.join(layoutDir, basicMetaData.Name + ".json");
    fs.writeFile(layoutMetaFile, JSON.stringify(objectInfo, null, 4), err => {
        if (err) {
            console.error(err);
        }
    });
    const links = await wwHelpers.getLinkIds(objectInfo[0].Relations, objectId);
    const itemUrl = `${objectInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
    const mimeType = objectInfo[0].Files[0].Type;
    const ext = wwHelpers.getExtensionFromMimeType(mimeType);
    const outputFile = path.join(layoutDir, basicMetaData.Name + "." + ext);
    // Now download the file itself
    await downloadItem(itemUrl, outputFile);

    if (links.length > 0){
        // Prepare a links folder if necessary
        let linksDir = path.join(layoutDir, "Links");
        if (!fs.existsSync(linksDir)){
            fs.mkdirSync(linksDir);
        }
        // Now download all the links
        links.forEach(async function(linkId){
            let linkInfo = await wwHelpers.getObjects(sessionTicket, [linkId]);
            console.log(`Downloading link: ${linkInfo[0].MetaData.BasicMetaData.Name}`);
            let linkType = linkInfo[0].Files[0].Type;
            let linkExt = wwHelpers.getExtensionFromMimeType(linkType);
            let linkFile = path.join(linksDir, linkInfo[0].MetaData.BasicMetaData.Name + "." + linkExt);
            let linkUrl = `${linkInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
            await downloadItem(linkUrl, linkFile);
        })
    }
    // Update the layout's status
    const comment = `Packaged by script.`;
    await wwHelpers.changeObjectStatus(sessionTicket, objectId, "Layout Packaged", comment);
    // wwHelpers.logOff(sessionTicket);
    return true;
}
if (!fs.existsSync(messagesRoot)){
    fs.mkdirSync(messagesRoot);
}
app.get('/', (req, res) => {
    res.sendStatus(404);
})
app.post('/', async (req, res) => {
    const content = req.body;
    const headers = req.headers;
    const signature = headers["x-hook-signature"];
    if (typeof signature == undefined){
        console.log("Event has invalid signature header.");
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
        console.log("Event has invalid data");
        res.sendStatus(200);
    }
    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    const targetsData = content.data.Object.Targets;
    const basicMetaData = content.data.Object.MetaData.BasicMetaData;
    // let now = new Date().toISOString();
    console.log(`${now} Event: ${basicMetaData.Name} (ID: ${basicMetaData.ID}) ${action} `);
    let fileDate = datefns.format(new Date(), "yyyyMMdd");
    let messagesDir = path.join(messagesRoot, fileDate);
    if (!fs.existsSync(messagesDir)){
        fs.mkdirSync(messagesDir);
    }
    const messageFile = path.join(messagesDir, basicMetaData.Name + ".json");
    fs.writeFile(messageFile, JSON.stringify(content, null, 4), err => {
        if (err) {
            console.error(err);
        }
    });

    switch (content.data.Object.MetaData.BasicMetaData.Type) {
        case "Article":
            const articleToIndexStatus = "IC - To Index";
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == articleToIndexStatus){
                let articleObject = content.data.Object;
                await archiveArticle(articleObject, articlesRoot);
            }
            break;
        case "Layout":
            const layoutToPackageStatus = "Layout To Package";
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == layoutToPackageStatus){
                let layoutObject = content.data.Object;
                await packageLayout(layoutObject, layoutsRoot);
            }
            break;
        case "Image":
            const objectId = basicMetaData.ID;
            var objectIds = [];
            objectIds.push(objectId);
            // console.log(objectIds);
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == "Image To Web"){
                console.log("Processing Image:");
                // Log in to Studio Server - application state must be maintained by this app.
                // Must log in to get files metadata as that is not included in normal event message
                let sessionTicket = await wwHelpers.logOn();
                const objectInfo = await wwHelpers.getObjects(sessionTicket, objectIds);
                const itemUrl = `${objectInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
                const mimeType = objectInfo[0].Files[0].Type;
                const ext = wwHelpers.getExtensionFromMimeType(mimeType);
                const outputFile = path.join(imagesInDir, basicMetaData.Name + "." + ext);
                // Now download the file
                await downloadItem(itemUrl, outputFile);
                // Now update the item's metadata in Studio
                const newStatus = "Image Exported";
                const comment = "Image exported for web use.";
                const changedObject = await wwHelpers.changeObjectStatus(sessionTicket, objectId, newStatus, comment );
                var metadataFileName = path.join(imagesOutDir, basicMetaData.Name + ".json");
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
            const dossierToArchiveStatus = "None"; // Disabling Dossier archiving due to server overload
            // const dossierToArchiveStatus = "Dossier To Archive";
            if (content.data.Object.MetaData.WorkflowMetaData.State.Name == dossierToArchiveStatus){
                let dossierObject = content.data.Object;
                await archiveDossier(dossierObject, archivesRoot);
            }
            break
        default:
            console.log("Invalid object type");
            break;
    }
    res.sendStatus(200);
})
app.listen(port, () => {
    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    // let now = new Date().toISOString();
    console.log(`${now} Awaiting events. Listening on port ${port}`)
})