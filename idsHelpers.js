const soap = require("soap");

function sendIDSRequest(url, args, callback) {
    const wsdlUrl = url + "/service?wsdl";
    soap.createClient(wsdlUrl, function (err, client) {
        client.setEndpoint(url);
        client.Service.Service.RunScript(args, function (err, result) {
            if (err) console.log(`Error: ${err}`);
            callback(result);
        });
    });
}
function runXMLExport(
    iDserverUrl,
    instanceName,
    username,
    password,
    docID,
    xmlArticleDir,
    callback
) {
    const args = {
        runScriptParameters: {
            scriptLanguage: "javascript",
            scriptFile: "C:/InDesignScripts/XML-Server-Export.jsx",
            scriptArgs: [
                { name: "server", value: instanceName },
                { name: "username", value: username },
                { name: "password", value: password },
                { name: "docID", value: docID },
                { name: "outputFolder", value: xmlArticleDir},
            ],
        },
    };
    sendIDSRequest(iDserverUrl, args, callback);
}
module.exports = { sendIDSRequest, runXMLExport };
