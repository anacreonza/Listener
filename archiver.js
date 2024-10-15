const Path = require("node:path");
const fs = require("node:fs");
const datefns = require("date-fns");
const logFilePath = Path.join(__dirname, "activityLog.log");

// Queue processor
class Queue {
    constructor(concurrency) {
        this.concurrency = concurrency;
        this.images = [];
        this.activeCount = 0;
    }

    enqueue(image) {
        this.images.push(image);
        this.processQueue();
    }

    async processQueue() {
        while (this.activeCount < this.concurrency && this.images.length > 0) {
            const image = this.images.shift();
            this.activeCount++;
            try {
                archiveDossier(dossierInfo, archivesRoot).then((result) => {
                    fs.appendFileSync(logFilePath, result);
                    console.log(entry);
                }
                );
            } catch (error) {
                console.error("Error processing task:", error);
            } finally {
                this.activeCount--;
                this.processQueue(); // Process the next task
            }
        }
    }
}
export default function add(dossier) {
    const queue = new Queue(5);
    queue.enqueue(dossier);
}
export default async function archiveDossier(dossierInfo, archivesRoot){
    let sessionTicket = await wwHelpers.logOn();
    const basicMetaData = dossierInfo.metaData.BasicMetaData;
    const extendedDossierInfo = await wwHelpers.getObjects(sessionTicket, [basicMetaData.ID]);
    let dossierItemIds = await wwHelpers.getDossierChildIds(extendedDossierInfo[0].Relations, basicMetaData.ID);

    return new Promise((resolve, reject) => {
        try {
            const targetsData = dossierInfo.Targets;
            console.log(`Archiving Dossier: ${basicMetaData.Name}`);
            // Create root folder
            if (!fs.existsSync(archivesRoot)){
                fs.mkdirSync(archivesRoot);
            }
            // Save the dossier metadata file
            const dossierMetaFile = Path.join(archivesRoot, basicMetaData.Name + ".json");
            fs.writeFile(dossierMetaFile, JSON.stringify(extendedDossierInfo, null, 4), err => {
                if (err) {
                    console.error(err);
                }
            });
            // Create publication folder
            const publicationDir = Path.join(archivesRoot, basicMetaData.Publication.Name);
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
            const issueDir = Path.join(publicationDir, dossierIssueName);
            if (!fs.existsSync(issueDir)){
                console.log(`Making new issue directory: ${dossierIssueName}`);
                fs.mkdirSync(issueDir);
            }
            // Create the dossier folder
            const dossierDir = Path.join(issueDir, basicMetaData.Name);
            if (!fs.existsSync(dossierDir)){
                fs.mkdirSync(dossierDir);
            }
            dossierItemIds.forEach(async function(itemId){
                let itemInfo = await wwHelpers.getObjects(sessionTicket, [itemId]);
                let itemType = itemInfo[0].Files[0].Type;
                let itemExt = wwHelpers.getExtensionFromMimeType(itemType);
                let itemName = itemInfo[0].MetaData.BasicMetaData.Name + "." + itemExt;
                let itemFile = Path.join(dossierDir, itemName);
                let itemUrl = `${itemInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
                downloadItem(itemUrl, itemFile, (itemName)=>{
                    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
                    console.log(`${now} Saved contained item: ${itemName}`);
                });
                // If the item is an InDesign layout, get all its links and then test if those links are already in the dossier
                // Download them and save them in the dossier if not.
                if (itemType == "application/indesign"){
                    let links = await wwHelpers.getLinkIds(itemInfo[0].Relations, itemId);
                    links.forEach(async function(linkId){
                        if (!dossierItemIds.includes(linkId)){
                            let linkInfo = await wwHelpers.getObjects(sessionTicket, [linkId]);
                            // console.log(`Downloading external link: ${linkInfo[0].MetaData.BasicMetaData.Name}`);
                            let linkType = linkInfo[0].Files[0].Type;
                            let linkExt = wwHelpers.getExtensionFromMimeType(linkType);
                            let linkFile = Path.join(dossierDir, linkInfo[0].MetaData.BasicMetaData.Name + "." + linkExt);
                            let linkUrl = `${linkInfo[0].Files[0].FileUrl}&ticket=${sessionTicket}`;
                            downloadItem(linkUrl, linkFile, (linkFile)=>{
                                let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
                                console.log(`${now} Saved linked item: ${linkFile}`);
                            });
                        }
                    })
                }
            });
            // Build up a response
            let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
            const result = `${now} - Dossier Archived`;
            resolve(result);
        } catch (error) {
            reject(error);
        }
 
    })
}