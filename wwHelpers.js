const fs = require('fs');
const path = require("path");
module.exports = {
    serverURL: process.env.SERVERURL,
    requestUrl: process.env.SERVERURL + "/" + process.env.INSTANCE + "/index.php?protocol=JSON",
    transferRequestUrl: process.env.SERVERURL + "/" + process.env.INSTANCE + "/transferindex.php?protocol=JSON",
    credentials: {
        "userName": process.env.WWUSERNAME,
        "password": process.env.WWPASSWORD
    },
    ticketFile: path.join(__dirname, "sessionTicket.txt"),
    logOn: async function () {
        const ticketFile = path.join(__dirname, "ticket.json");
        const ticketData = fs.readFileSync(ticketFile);
        const ticketJSON = JSON.parse(ticketData);
        const existingTicket = ticketJSON.Ticket;
        const validTicket = await this.checkTicket(existingTicket);
        if (validTicket){
            console.log(`Ticket: ${validTicket} still valid.`);
            return validTicket;
        }
        const logOnRequestBody = {
            "method": "LogOn",
            "id": "1",
            "Params": {
                "req": {
                    "User": this.credentials.userName,
                    "Password": this.credentials.password,
                    "ClientName":"nodeJS",
                    "ClientAppName":"API Integration",
                    "ClientAppVersion":"",
                    "ClientAppSerial":"",
                    "RequestInfo":["Publications"],
                    "__classname__":"WflLogOnRequest"
                }
            },
            "jsonrpc": "2.0"
        }
        var response = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(logOnRequestBody),
            headers: { 'Content-Type': 'application/json'}
        });
        response = await response.json();
        if (response.error){
            console.log(response.error.message);
            return false;
        }
        // Save the ticket file
        fs.writeFile(ticketFile, JSON.stringify(response.result, null, 4), err => {
            if (err) {
                console.error(err);
            }
        });
        // console.log(`SessionTicket: ${sessionTicket}`);
        return response.result.Ticket;
    },
    logOff: async function (sessionTicket){
        let logOffBody = {
            "method": "LogOff",
            "id": "1",
            "params": [{                
                "Ticket": sessionTicket,
                "__classname__": "WflLogOffRequest"
            }],
            "jsonrpc": "2.0"
        }
        const response = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(logOffBody),
            headers: { 'Content-Type': 'application/json'}
        });
    },
    sendIDSRequest: (url, args, callback)=> {
        const wsdlUrl = url + "/service?wsdl";
        soap.createClient(wsdlUrl, function (err, client) {
            client.setEndpoint(url);
            client.Service.Service.RunScript(args, function (err, result) {
                if (err) console.log(`Error: ${err}`);
                callback(result);
            });
        });
    },
    runXMLExport: (iDserverUrl, instanceName, username, password, docID)=>{
        const args = {
            runScriptParameters: {
                scriptLanguage: "javascript",
                scriptFile: "C:/InDesignScripts/XML-Server-Export.jsx",
                scriptArgs: [
                    { name: "server", value: instanceName },
                    { name: "username", value: username },
                    { name: "password", value: password },
                    { name: "docID", value: docID },
                ],
            },
        };
        this.sendIDSRequest(iDserverUrl, args, function (result) {
            if (result.errorNumber === 0) {
                console.log("Script completed successfully");
            } else {
                console.log(result);
            }
        });
    },
    getExtensionFromMimeType: (mimeType)=>{
        switch (mimeType) {
            case "image/jpeg":
                return "jpg"
                break;
            case "image/x-photoshop":
                return "psd"
                break;
            case "image/tiff":
                return "tif"
                break;
            case "image/png":
                return "png"
                break;
            case "application/incopyicml":
                return "wcml"
                break
            case "application/indesign":
                return "indd"
                break
            case "application/pdf":
                return "pdf"
                break
            case "application/msword":
                return "docx"
                break
            case "application/rtf":
                return "rtf"
                break
            case "text/richtext":
                return "rtf"
                break
            case "text/plain":
                return "txt"
                break
            default:
                return "jpg"
                break;
        }
    },
    getMimeTypeFromExtension: (extension) => {
        switch (extension) {
            case ".jpg":
                return "image/jpeg"
                break;
            case ".jpeg":
                return "image/jpeg"
                break;
            case ".psd":
                return "image/x-photoshop" 
                break;
            case ".tif":
                return "image/tiff"
                break;
            case ".tiff":
                return "image/tiff"
                break;
            case ".png":
                return "image/png"
                break;
            default:
                break;
        };
        // imageMagick.identify("/public/uploads/testimage.png", function(err, features){
        //     if (err) throw err;
        //     console.log(features);
        //     // { format: 'JPEG', width: 3904, height: 2622, depth: 8 }
        //   });

    },
    getPrintIssuesByPubId: async function(sessionTicket, selectedPubId){
        sessionTicket = await this.checkTicket(sessionTicket);
        let publications = await this.getPublications(sessionTicket);
        let issues = [];
        publications.forEach(publication => {
            if (publication.Id == selectedPubId){
                const pubChannels = publication.PubChannels;
                pubChannels.forEach(channel => {
                    if (channel.Name == 'Print'){
                        console.log("Channel: " + channel);
                        issues = channel.Issues;
                    }
                })
            }
        });
        return issues;
    },
    uploadFile: async function(sessionTicket, fileGuid, file){
        sessionTicket = await this.checkTicket(sessionTicket);
        // Make a PUT request to the transfer server Url with the body as the content to do the upload
        const uploadRequestUrl = this.transferRequestUrl + "&ticket=" + sessionTicket + "&fileguid=" + fileGuid;       
        console.log("Making PUT request to: " + uploadRequestUrl);
        const response = await fetch(uploadRequestUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': "image/jpeg" }
        });
        // const uploadResult = await response.json();
        return;
    },
    getPublications: async function(sessionTicket){
        sessionTicket = await this.checkTicket(sessionTicket);
        const getPublicationsBody = {
            "method": "GetPublications",
            "id": "1",
            "params": [{
                "Ticket": sessionTicket,
                "IDs": null,
                "RequestInfo": ["PubChannels"],
                "__classname__": "WflGetPublicationsRequest"
            }],
            "jsonrpc": "2.0"
        };
        const wwResponse = await fetch(this.requestUrl, {
            method: "POST",
            body: JSON.stringify(getPublicationsBody),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await wwResponse.json();
        const result = data.result;
        if (result.hasOwnProperty("Publications")){
            return result.Publications;
        } else {
            return false;
        }
    },
    getPublicationById: async function(sessionTicket, publicationId){
        sessionTicket = await this.checkTicket(sessionTicket);
        const publications = await this.getPublications();
        const pubInfo = {};
        publications.forEach(element => {
            if (element.Id == publicationId){
                pubInfo.Id = element.Id;
                pubInfo.Name = element.Name;
            };
        });
        return pubInfo;
    },
    getIssueDossiersByPubId: async function(sessionTicket, issueId, publicationId){
        sessionTicket = await this.checkTicket(sessionTicket);
        let queryParams = [] // Must send queries as an array
        const firstParam = {
            property: "Type",
            operation: "=",
            value: "Dossier"
        };
        queryParams.push(firstParam);
        const secondParam = {
            property: "PublicationId",
            operation: "=",
            value: publicationId
        };
        queryParams.push(secondParam);
        // Run a query on all dossiers in that publication
        const queryResult = await this.queryObjects(sessionTicket, queryParams);
        const queryResultRows = queryResult.Rows;
        const allDossiers = [];
        queryResultRows.forEach(row => {
            const dossier = {
                Id: row[0],
                Type: row[1],
                Name: row[2],
                Status: row[3],
                Publication: row[4],
                Issues: row[5]
            }
            allDossiers.push(dossier);
        });
        const selectedPublication = await this.getPublicationById(publicationId);
        // console.log("Selected publication name is " + selectedPublication.Name);
        const selectedIssueName = await this.getPubIssueById(publicationId, issueId);
        // console.log("Selected issue name is " + selectedIssueName);
        const issueDossiers = [];
        allDossiers.forEach(dossier => {
            if (dossier.Issues == selectedIssueName){
                issueDossiers.push(dossier)
            };            
        })
        return issueDossiers;
    },
    getPubIssueById: async function(sessionTicket, publicationId, issueId){
        sessionTicket = await this.checkTicket(sessionTicket);
        const publications = await this.getPublications(sessionTicket);
        let issueName = "";
        publications.forEach(publication => {
            if (publication.Id == publicationId){
                const pubChannels = publication.PubChannels;
                pubChannels.forEach(channel => {
                    if (channel.Name == "Print"){
                        const issues = channel.Issues;
                        issues.forEach(issue => {
                            if (issue.Id == issueId){
                                issueName = issue.Name;
                            }
                        })
                    }
                })
            }
        });
        return issueName;
    },
    getServerInfo: async function(sessionTicket){
        sessionTicket = await this.checkTicket(sessionTicket);
        let body = {
            "method": "GetServerInfo",
            "id": "1",
            "params": {
                "req": {
                    "Ticket": sessionTicket,
                    "__classname__": "WflGetServerInfoRequest"
                }
            },
            "jsonrpc": "2.0"
        }
        const res = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await res.json();
        if (data.result){
            return data.result.ServerInfo
        } else {
            return false;
        }
    },
    getUserInfo: async function (sessionTicket){
        sessionTicket = await this.checkTicket(sessionTicket);
        let body = {
            "method": "GetUserSettings",
            "id": 1,
            "params": {
                "req": {
                    "Ticket": sessionTicket,
                    "__classname__": "WflGetUserSettingsRequest"
                }
            },
            "jsonrpc": "2.0"
        }
        const res = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': "application/json" }
        });
        const data = await res.json();
        if (data.result){
            return data.result
        } else {
            return false;
        };
    },
    createObject: async function(sessionTicket, metaData){
        sessionTicket = await this.checkTicket(sessionTicket);
        const fileMetas = [];
        if (metaData.FileUrl){
            const fileMeta = {
                "Rendition": "native",
                "Type": metaData.MimeType,
                "Content": null,
                "FilePath": null,
                "FileUrl": metaData.FileUrl,
                "EditionId": "",
                "ContentSourceFileLink": null,
                "ContentSourceProxyLink": null,
                "__classname__": "Attachment"
            };
            fileMetas.push(fileMeta);
        };
        const relations = [];
        if (metaData.Relations){
            const relation = {
                "Parent": metaData.Relations.containedDossierId,
                "Type": "Contained",
                "__classname__": "Relation"
            }
            relations.push(relation);
        }
        const createObjectBody = {
            "method": "CreateObjects",
            "id": "1",
            "params": {
                "req": {
                    "Ticket": sessionTicket,
                    "Lock": false,
                    "Objects": [
                        {
                            "MetaData": {
                                "BasicMetaData": {
                                    "ID": "",
                                    "DocumentID": "",
                                    "Name": metaData.Name,
                                    "Type": metaData.Type,
                                    "Publication": {
                                        "Id": metaData.PublicationId,
                                        "Name": metaData.PublicationName,
                                        "__classname__": "Publication"
                                    },
                                    "Category": {
                                        "Id": metaData.CategoryId,
                                        "Name": metaData.CategoryName,
                                        "__classname__": "Category"
                                    },
                                    "__classname__": "BasicMetaData"
                                },
                                "RightsMetaData": {
                                    "CopyrightMarked": false,
                                    "Copyright": "",
                                    "CopyrightURL": "",
                                    "__classname__": "RightsMetaData"
                                },
                                "SourceMetaData": {
                                    "Credit": "",
                                    "Source": "",
                                    "Author": "",
                                    "__classname__": "SourceMetaData"
                                },
                                "ContentMetaData": {
                                    "Description": "",
                                    "DescriptionAuthor": "",
                                    "Keywords": [],
                                    "Slugline": "",
                                    "Format": "",
                                    "Columns": 0,
                                    "Width": 0,
                                    "Height": 0,
                                    "Dpi": 0,
                                    "LengthWords": 0,
                                    "LengthChars": 0,
                                    "LengthParas": 0,
                                    "LengthLines": 0,
                                    "PlainContent": "",
                                    "FileSize": 0,
                                    "ColorSpace": "",
                                    "HighResFile": "",
                                    "Encoding": "",
                                    "Compression": "",
                                    "KeyFrameEveryFrames": 0,
                                    "Channels": "",
                                    "AspectRatio": "",
                                    "Orientation": null,
                                    "Dimensions": null,
                                    "__classname__": "ContentMetaData"
                                },
                                "WorkflowMetaData": {
                                    "Deadline": null,
                                    "Urgency": "",
                                    "Modifier": metaData.Modifier,
                                    "Modified": metaData.Modified,
                                    "Creator": metaData.Creator,
                                    "Created": metaData.Created,
                                    "Comment": metaData.Comment,
                                    "State": {
                                        "Id": metaData.StateId,
                                        "Name": metaData.StateName,
                                        "Type": metaData.Type,
                                        "Produce": false,
                                        "Color": "99CCFF",
                                        "DefaultRouteTo": null,
                                        "__classname__": "State"
                                    },
                                    "RouteTo": "",
                                    "LockedBy": "",
                                    "Version": "0.1",
                                    "DeadlineSoft": null,
                                    "Rating": 0,
                                    "Deletor": "",
                                    "Deleted": null,
                                    "__classname__": "WorkflowMetaData"
                                },
                                "ExtraMetaData": [
                                    {
                                        "Property": "C_CS_SYNC_STATE",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_CS_CONVERSION_RULE_ID",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_PRINT_SECTION",
                                        "Values": [
                                            "Main Book"
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_CS_ARTICLE_TEMPLATE_ID",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_CS_DE_COMPONENT_NAMES",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_CS_COMPONENTSET",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_CS_STYLEID",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    },
                                    {
                                        "Property": "C_CS_FILEFORMATVERSION",
                                        "Values": [
                                            ""
                                        ],
                                        "__classname__": "ExtraMetaData"
                                    }
                                ],
                                "__classname__": "MetaData"
                            },
                            "Relations": relations,
                            "Pages": [],
                            "Files": fileMetas,
                            "Messages": null,
                            "Elements": null,
                            "Targets": null,
                            "Renditions": null,
                            "MessageList": null,
                            "ObjectLabels": null,
                            "InDesignArticles": null,
                            "Placements": null,
                            "Operations": null,
                            "__classname__": "Object"
                        }
                    ],
                    "__classname__": "CreateObjects"
                }
            },
            "jsonrpc": "2.0"
        };
        console.log(JSON.stringify(createObjectBody));
        const response = await fetch(this.requestUrl, {
            method: "POST",
            body: JSON.stringify(createObjectBody),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await response.json();
        if (data.result){
            return data;
        } else {
            return false;
        }
    },
    getDossierIdByName: async function (sessionTicket, dossierName){
        sessionTicket = await this.checkTicket(sessionTicket);
        const queries = [];
        const firstParam = {
            property: "Type",
            operation: "=",
            value: "Dossier"
        };
        queries.push(firstParam);
        const secondParam = {
            property: "Name",
            operation: "=",
            value: dossierName
        };
        queries.push(secondParam);
        const response = await this.queryObjects(queries);
        return response;
    },
    queryObjects: async function (queries){
        params = [];
        queries.forEach(query => {
            q = {};
            q.__classname__ = "QueryParam";
            q.Property = query.property;
            q.Operation = query.operation;
            q.Value = query.value;
            params.push(q);
        });
        queryBody = {
            "method": "QueryObjects",
            "id": "1",
            "params": {
                "req": {
                    "Ticket": sessionTicket,
                    "Params": params,
                            "FirstEntry": null,
                            "MaxEntries": null,
                            "Hierarchical": false,
                            "MinimalProps": [],
                            "RequestProps": [   "ID", 
                                                "Type",
                                                "Name",
                                                "Category",
                                                "Publication",
                                                "Issues"
                                            ],
                            "Areas": null,
                            "GetObjectMode": false,
                            "__classname__": "WflQueryObjectsRequest"
                }
            },
            "jsonrpc": "2.0"
        };
        // console.log(queryBody);
        const response = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(queryBody),
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.result){
            return data.result;
        } else {
            return false;
        }
    },
    getFileInfoByGuid: async function(sessionTicket, fileGuid){
        sessionTicket = await this.checkTicket(sessionTicket);
        console.log("Getting file info for Guid: " + fileGuid);
        const infoRequestUrl = this.transferRequestUrl + "&ticket=" + sessionTicket + "&fileguid=" + fileGuid + "&format=image/jpeg";
        const response = await fetch(infoRequestUrl, {
            method: 'GET'
        });
        const data = await response.json();
        if (data.result){
            return data;
        } else {
            return false;
        }
    },
    checkTicket: async function(sessionTicket){
        // Check the validity of the ticket
        const checkTicketBody = {
            "method": "CheckTicket",
            "id": "1",
            "params": {
                "req": {
                    "Ticket": sessionTicket,
                    "__classname__": "WflCheckTicketRequest"
                }
            },
            "jsonrpc": "2.0"
        }
        const response = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(checkTicketBody),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await response.json();
        if (data.error){
            console.log(`Invalid Ticket: ${sessionTicket}`);
            console.error(data.error.message);
            sessionTicket = "";
            // await this.logOff(sessionTicket);
            return false;
        } else {
            return sessionTicket;
        }
    },
    getStatusesByPublication: async function (sessionTicket, objectId, publicationId){
        sessionTicket = await this.checkTicket(sessionTicket);
        let body = {
            "method": "GetStates",
            "id": "1",
            "params": [{
                "Ticket": sessionTicket,
                "ID": objectId,
                "Publication": publicationId,
                "Issue": "",
                "Section": "",
                "Type":"",
                "__classname__": "WflGetStatesRequest"
            }],
            "jsonrpc": "2.0"
        }
        const res = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await res.json();
        if (data.result){
            return data.result.States;
        } else {
            console.error(data);
            return false;
        }
    },
    getParentDossierInfo: async function(relations, objectId){
        let parentInfo = false;
        relations.forEach(function(relation){
            if (relation.Child == objectId && relation.Type == "Contained"){
                parentInfo = relation.ParentInfo;
            }
        });
        return parentInfo;
    },
    getLinkIds: async function(relations, objectId){
        let childIds = [];
        relations.forEach(function(relation){
            if (relation.Parent == objectId && relation.Type == "Placed"){
                childIds.push(relation.Child);
            }
        });
        return childIds;
    },
    getDossierChildIds: async function(relations, objectId){
        let childIds = [];
        relations.forEach(function(relation){
            if (relation.Parent == objectId && relation.Type == "Contained"){
                childIds.push(relation.Child);
            }
        });
        return childIds;
    },
    changeObjectStatus: async function (sessionTicket, objectId, newStatus, comment){
        sessionTicket = await this.checkTicket(sessionTicket);
        let now = new Date().toLocaleString( 'sv' );
        let objectIds = [];
        objectIds.push(objectId);
        // console.log(`Changing object info for ObjectId: ${objectId}`);
        const objectInfos = await this.getObjects(sessionTicket, objectIds);
        if (objectInfos.length === 0){
            console.log(`Unable to retrieve object info for objectID ${objectId}`);
            return false;
        }
        const objectInfo = objectInfos[0];
        const objectType = objectInfo.MetaData.BasicMetaData.Type;
        const publication = objectInfo.MetaData.BasicMetaData.Publication;
        const states = await this.getStatusesByPublication(sessionTicket, objectId, publication.Id);
        var newStatusId = 0;
        states.forEach(function(item){
            // console.log(item);
            if (item.Name == newStatus ){
                newStatusId = item.Id;
            }
        });
        if ( newStatusId == 0 ){
            console.log(`Invalid Status!`);
            return false;
        };
        let body = {
            "method": "SetObjectProperties",
            "id": "1",
            "params": [{
                "Ticket": sessionTicket,
                "ID": objectId,
                "MetaData": {
                    "BasicMetaData": null,
                    "RightsMetaData": null,
                    "SourceMetaData": null,
                    "ContentMetaData": null,
                    "WorkflowMetaData": {
                        "State": {
                            "Id": newStatusId,
                            "Name": newStatus,
                            "Type": objectType,
                            "Produce": null,
                            "Color": "a0a0a0",
                            "DefaultRouteTo": null,
                            "__classname__": "State"
                        },
                        "Comment": `${now} ${comment}`,
                        "__classname__": "WorkflowMetaData"
                    },
                    "ExtraMetaData": null,
                "__classname__": "MetaData"
                },
                "Targets": null,
                "__classname__": "WflSetObjectPropertiesRequest"
            }],
            "jsonrpc": "2.0"
        }
        const response = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json'}
        })
        const data = await response.json();
        if (data.result){
            const changedObject = await this.getObjects(sessionTicket, [objectId]);
            return changedObject;
        } else {
            console.error(data.error);
            return false;
        };
        
    },
    changeArticleStatus: async function (sessionTicket, requestUrl, articleId){
        sessionTicket = await this.checkTicket(sessionTicket);
        let now = new Date();
        let body = {
            "method": "SetObjectProperties",
            "id": "1",
            "params": [{
                "Ticket": sessionTicket,
                "ID": articleId,
                "MetaData": {
                    "BasicMetaData": null,
                    "RightsMetaData": null,
                    "SourceMetaData": null,
                    "ContentMetaData": null,
                    "WorkflowMetaData": {
                        "State": {
                            "Id": 76,
                            "Name": "Article Exported",
                            "Type": "Article",
                            "Produce": null,
                            "Color": "a0a0a0",
                            "DefaultRouteTo": null,
                            "__classname__": "State"
                        },
                        "Comment": `Article exported at ${now}`,
                        "__classname__": "WorkflowMetaData"
                    },
                    "ExtraMetaData": null,
                "__classname__": "MetaData"
                },
                "Targets": null,
                "__classname__": "WflSetObjectPropertiesRequest"
            }],
            "jsonrpc": "2.0"
        }
        const res = await fetch(requestUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await res.json();
    },
    getArticleIds: async function (sessionTicket, requestUrl) {
        sessionTicket = await this.checkTicket(sessionTicket);
        let queryRequestBody = {
            "method": "QueryObjects",
            "id": "1",
            "params": {
                "req": {
                    "Ticket": sessionTicket,
                    "Params": [	
                        { "__classname__": "QueryParam", "Property": "Type", "Operation": "=", "Value": "Article" },
                        { "__classname__": "QueryParam", "Property": "State", "Operation": "=", "Value": "Article To Export" }
                    ],
                    "FirstEntry": null,
                    "MaxEntries": 50,
                    "Hierarchical": false,
                    "RequestProps": ["ID"],
                    "Areas": null,
                    "GetObjectMode": false,
                    "__classname__": "WflQueryObjectsRequest"
                }
            }
        };
        const response = await fetch(requestUrl, {
            method: 'POST',
            body: JSON.stringify(queryRequestBody),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await response.json();
        if (!data.error){
            const rows = data.result.Rows;
            let objectIDs = [];
            for (let index = 0; index < rows.length; index++) {
                let objectID = rows[index][0];
                objectIDs.push(objectID);
            }
            return objectIDs;
        } else {
            console.log(data.error.message);
            return false;
        }
    },
    getObjects: async function (sessionTicket, objectIDs){
        sessionTicket = await this.checkTicket(sessionTicket);
        if ( ! objectIDs ){
            console.log("No valid object IDs received!");
            return false;
        };
        let requestBody = {
            "method": "GetObjects",
            "id": "2",
            "params": [{
                "Ticket": sessionTicket,
                "IDs": objectIDs,
                "Lock": false,
                "Rendition": "native",
                "RequestInfo": ["Relations", "PagesInfo"],
                "HaveVersions": [],
                "Areas": null,
                "EditionId": "",
                "SupportedContentSources": [],
                "__classname__": "WflGetObjectsRequest"
            }],
            "jsonrpc": "2.0"
        };
        const response = await fetch(this.requestUrl, {
            method: 'POST',
            body: JSON.stringify(requestBody),
            headers: { 'Content-Type': 'application/json'}
        });
        const data = await response.json();
        if (data.result){
            // console.log(data.result);
            return data.result.Objects;
        } else {
            console.error(data);
            return false;
        };
    },
    extractArticles: async function (sessionTicket){
        sessionTicket = await this.checkTicket(sessionTicket);
        const articleIds = await getArticleIds(requestUrl);
        let articleDetails = await getArticleDetails(requestUrl, articleIds);
        articleDetails = articleDetails.Objects;
        let articles = [];
        class Article {
            constructor(){
                this.sourceId = 0,
                this.documentId = 0,
                this.Name = '',
                this.Type = 'Article',
                this.PublicationName,
                this.Modifier = '',
                this.ModifiedDate = '',
                this.Creator = '',
                this.CreatedDate = '',
                this.FileUrl = '',
                this.FileType = '',
                this.Content = ''
            }
        };
        for (let index = 0; index < articleDetails.length; index++) {
            let art = new Article;
            art.sourceId = articleDetails[index].MetaData.BasicMetaData.ID;
            art.documentId = articleDetails[index].MetaData.BasicMetaData.DocumentID;
            art.Name = articleDetails[index].MetaData.BasicMetaData.Name;
            art.Type = articleDetails[index].MetaData.BasicMetaData.Type;
            art.PublicationName = articleDetails[index].MetaData.BasicMetaData.Publication.Name;
            art.Modifier = articleDetails[index].MetaData.WorkflowMetaData.Modifier;
            art.ModifiedDate = new Date(articleDetails[index].MetaData.WorkflowMetaData.Modified);
            art.Creator = articleDetails[index].MetaData.WorkflowMetaData.Creator;
            art.CreatedDate = new Date(articleDetails[index].MetaData.WorkflowMetaData.Created);
            art.FileUrl = articleDetails[index].Files[0].FileUrl;
            art.FileType = articleDetails[index].Files[0].Type;
            const contentRequestUrl = art.FileUrl + "&ticket=" + sessionTicket;
            downloadFile(art, contentRequestUrl);
    
            // art.Content = data;
            // BasicMetaData.ID
            // BasicMetaData.DocumentID
            // BasicMetaData.Name
            // BasicMetaData.Type
            // BasicMetaData.Publication.Name
            // RightsMetaData
            // SourceMetaData
            // ContentMetaData
            // WorkflowMetaData.Modifier
            // WorkflowMetaData.Modifier
            // WorkflowMetaData.Creator
            // WorkflowMetaData.Created
            // ExtraMetaData
            // console.log(articleDetails[index].Files[0].FileUrl);
            // console.log(articleDetails[index].Files[0].Type);
            articles.push(art);
            await changeArticleStatus(requestUrl, art.sourceId)
        }
        // console.log(articles);
        return articles;
    },
    downloadFile: function (article, url){
        switch (article.FileType) {
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                extension = "docx"
                break;
        
            case "application/incopyicml":
                extension = "wcml"
                break;
        
            case "text/richtext":
                extension = "rtf"
                break;
        
            default:
                extension = "txt"
                break;
    
        }
        const filename = article.Name + "." + extension;
        const downloadFile = (async (url, folder=".") => {
            const res = await fetch(url);
            if (!fs.existsSync("downloads")) await mkdir("downloads");
            if (fs.existsSync(`./downloads/${filename}`)){
                fs.unlinkSync(`./downloads/${filename}`);
            }
            const destination = path.resolve("./downloads", folder);
            const fileStream = fs.createWriteStream(destination, { flags: 'wx' });
            await finished(Readable.fromWeb(res.body).pipe(fileStream));
          });
        downloadFile(url, filename);
        convertFile(article);
    },
    convertFile: function (article) {
        switch (article.FileType) {
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                let src = `./downloads/${article.Name}.docx`;
                let dest = `./downloads/${article.Name}.html`;
                args = ['-f','docx','-t','html','-o',dest];
                console.log(`Converting file ${src}`);
                callback = function (err, result) {
                 if (err) {
                    console.error('Pandoc Error: ',err);
                }
                // For output to files, the 'result' will be a boolean 'true'.
                // Otherwise, the converted value will be returned.
                //   console.log(result);
                return result;
                };
                nodePandoc(src, args, callback);
                break;
            default:
                break;
        }
    },
    extract: async function (){
        let extractedArticles = await extractArticles();
        app.get('/', (req, res) => {
            if (extractedArticles){
                res.send(extractedArticles);
            } else {
                res.send("Extracting...")
            }
        });
    }
};